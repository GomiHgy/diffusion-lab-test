/* Diffusion Lab — connected tape footprints and continuous containment.
 * 基板の端部・LEDの回転した角・接続区間を、幅のある面として判定する。 */
(function(root){
'use strict';
const EPS=1e-7,cache=new WeakMap();
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const box=p=>({minX:Math.min(...p.map(q=>q[0])),maxX:Math.max(...p.map(q=>q[0])),minY:Math.min(...p.map(q=>q[1])),maxY:Math.max(...p.map(q=>q[1]))});
const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
function square(x,y,size,angle){const c=Math.cos(angle),s=Math.sin(angle);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+(a*c-b*s)*size/2,y+(a*s+b*c)*size/2]);}
function footprints(s,points){
 const packageSize=Number(s.packageSize),tapeWidth=s.tapeWidth===undefined?packageSize+2:Number(s.tapeWidth);
 if(!Number.isFinite(packageSize)||packageSize<=0||!Number.isFinite(tapeWidth)||tapeWidth<=0||!Array.isArray(points))throw Error('LEDテープの幅または座標が不正です。');
 const tapes=[],packages=[];
 for(let i=0;i<points.length;i++){
  const p=points[i];if(!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||(p[2]!==undefined&&!Number.isFinite(p[2])))throw Error('LEDテープの座標が不正です。');
  const [x,y]=p,angle=p[2]||0;tapes.push(square(x,y,tapeWidth,angle));packages.push(square(x,y,packageSize,angle));
  if(i){const q=points[i-1],dx=x-q[0],dy=y-q[1],length=Math.hypot(dx,dy);
   if(length>EPS){const ox=-dy/length*tapeWidth/2,oy=dx/length*tapeWidth/2;tapes.push([[q[0]+ox,q[1]+oy],[q[0]-ox,q[1]-oy],[x-ox,y-oy],[x+ox,y+oy]]);}
  }
 }
 return {tapes,packages};
}
function tree(edges){
 if(!edges.length)return null;const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
 for(const e of edges){bounds.minX=Math.min(bounds.minX,e.bounds.minX);bounds.maxX=Math.max(bounds.maxX,e.bounds.maxX);bounds.minY=Math.min(bounds.minY,e.bounds.minY);bounds.maxY=Math.max(bounds.maxY,e.bounds.maxY);}
 if(edges.length<=8)return {bounds,edges};
 const axis=bounds.maxX-bounds.minX>=bounds.maxY-bounds.minY?'X':'Y',sorted=edges.slice().sort((a,b)=>a.bounds['min'+axis]+a.bounds['max'+axis]-b.bounds['min'+axis]-b.bounds['max'+axis]),mid=sorted.length>>1;
 return {bounds,left:tree(sorted.slice(0,mid)),right:tree(sorted.slice(mid))};
}
function query(node,bounds,out=[]){if(!node||!overlaps(node.bounds,bounds))return out;if(node.edges){for(const e of node.edges)if(overlaps(e.bounds,bounds))out.push(e);}else{query(node.left,bounds,out);query(node.right,bounds,out);}return out;}
function geometry(O,s){
 if(!O||typeof O.shapeInfo!=='function')throw Error('輪郭の計算モジュールが必要です。');
 const key=JSON.stringify([s.shape,s.width,s.height,s.radius,s.hole,s.polygon,s.svgShapes]),stored=cache.get(O);
 if(stored&&stored.key===key)return stored.value;
 const value={kind:s.shape,a:s.width/2,b:s.height/2,radius:s.radius||0,hole:s.hole||0,boundary:[]};
 if(s.shape==='svg')value.boundary=O.svgGeometry(s).boundary;
 else if(s.shape==='polygon'){const p=O.shapeInfo(s).poly;value.boundary=p.map((a,i)=>[a,p[(i+1)%p.length]]);}
 else if(!['rect','rounded','ellipse','ring'].includes(s.shape))throw Error('対応していない輪郭です。');
 if(value.boundary.length){
  value.edges=value.boundary.map(([a,b])=>({a,b,bounds:box([a,b])}));value.tree=tree(value.edges);
  value.minY=value.tree.bounds.minY;value.maxY=value.tree.bounds.maxY;value.buckets=Array.from({length:Math.min(64,Math.max(8,Math.ceil(Math.sqrt(value.edges.length))))},()=>[]);
  value.row=y=>Math.max(0,Math.min(value.buckets.length-1,Math.floor((y-value.minY)/(value.maxY-value.minY||1)*value.buckets.length)));
  for(const e of value.edges)for(let i=value.row(e.bounds.minY);i<=value.row(e.bounds.maxY);i++)value.buckets[i].push(e);
 }
 cache.set(O,{key,value});return value;
}
function pointSegmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function pointInside(p,g){
 const x=p[0],y=p[1],bounds=g.tree.bounds;if(x<bounds.minX-EPS||x>bounds.maxX+EPS||y<bounds.minY-EPS||y>bounds.maxY+EPS)return false;
 let inside=false;const candidates=g.buckets[g.row(y)];
 for(const {a,b,bounds} of candidates){
  if(x>=bounds.minX-EPS&&x<=bounds.maxX+EPS&&y>=bounds.minY-EPS&&y<=bounds.maxY+EPS&&pointSegmentDistance(p,a,b)<=EPS)return true;
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
// 境界線分を凸矩形の厳密な内部へクリップする。辺・角への接触だけは許す。
// 穴の全体を覆った場合も、その境界が矩形内部にあるので検出できる。
function boundaryEnters(polygon,a,b){
 let low=0,high=1;const delta=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...delta);if(length<=EPS)return false;
 for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],edge=[q[0]-p[0],q[1]-p[1]],n=Math.hypot(...edge);if(n<=EPS)continue;
  const start=cross(edge,[a[0]-p[0],a[1]-p[1]])/n,slope=cross(edge,delta)/n;
  if(Math.abs(slope)<1e-14){if(start<=EPS)return false;continue;}
  const t=(EPS-start)/slope;if(slope>0)low=Math.max(low,t);else high=Math.min(high,t);if(high<=low)return false;
 }
 return (high-low)*length>EPS;
}
function segmentsIntersect(a,b,c,d){
 const r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]],den=cross(r,s),q=[c[0]-a[0],c[1]-a[1]];
 if(Math.abs(den)>1e-14){const t=cross(q,s)/den,u=cross(q,r)/den;return t>=0&&t<=1&&u>=0&&u<=1;}
 return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b))<=EPS;
}
function segmentDistance(a,b,c,d){return segmentsIntersect(a,b,c,d)?0:Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));}
function polygonContained(p,g,clearance){
 const center=p.reduce((n,q)=>[n[0]+q[0]/p.length,n[1]+q[1]/p.length],[0,0]);
 if(!p.every(q=>pointInside(q,g))||!pointInside(center,g))return false;
 const bounds=box(p),expanded={minX:bounds.minX-clearance-EPS,maxX:bounds.maxX+clearance+EPS,minY:bounds.minY-clearance-EPS,maxY:bounds.maxY+clearance+EPS};
 for(const {a,b} of query(g.tree,expanded)){
  if(boundaryEnters(p,a,b))return false;
  if(clearance>EPS)for(let i=0;i<p.length;i++)if(segmentDistance(p[i],p[(i+1)%p.length],a,b)<clearance-EPS)return false;
 }
 return true;
}
function minimumRadius(p,a,b){
 const q=p.map(v=>[v[0]/a,v[1]/b]);let originInside=true,min=Infinity;
 for(let i=0;i<q.length;i++){
  const u=q[i],v=q[(i+1)%q.length];if(cross([v[0]-u[0],v[1]-u[1]],[-u[0],-u[1]])<0)originInside=false;
  min=Math.min(min,pointSegmentDistance([0,0],u,v));
 }
 return originInside?0:min;
}
function standardContained(p,g,clearance){
 if(g.kind==='rect')return p.every(([x,y])=>Math.abs(x)<=g.a-clearance+EPS&&Math.abs(y)<=g.b-clearance+EPS);
 if(g.kind==='rounded')return p.every(([x,y])=>{const qx=Math.abs(x)-(g.a-g.radius),qy=Math.abs(y)-(g.b-g.radius);return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-g.radius<=-clearance+EPS;});
 // 楕円のclearanceは最短半径で一様に縮小する安全側の判定。
 // 穴は同じ方法で拡大する。細長い楕円では実際の等距離オフセットより保守的。
 const scale=1-clearance/Math.min(g.a,g.b);if(scale<=0)return false;
 const outerA=g.a*scale,outerB=g.b*scale,tolerance=EPS/Math.max(outerA,outerB);
 if(!p.every(([x,y])=>Math.hypot(x/outerA,y/outerB)<=1+tolerance))return false;
 if(g.kind==='ring'){
  const innerA=g.a*g.hole,innerB=g.b*g.hole,enlarge=1+clearance/Math.min(innerA,innerB),a=innerA*enlarge,b=innerB*enlarge;
  if(minimumRadius(p,a,b)<1-EPS/Math.max(a,b))return false;
 }
 return true;
}
function contains(O,s,points,clearance=0){
 if(!Number.isFinite(clearance)||clearance<0)return false;
 try{const polygons=footprints(s,points),g=geometry(O,s);return [...polygons.tapes,...polygons.packages].every(p=>g.boundary.length?polygonContained(p,g,clearance):standardContained(p,g,clearance));}catch{return false;}
}
const api={footprints,contains,geometry,EPS};root.TapeGeometry=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
