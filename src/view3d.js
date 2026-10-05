/* Diffusion Lab — dependency-free perspective preview.
 * 正面の計算画像を板の表面へ投影する。斜め方向の光学特性は再計算しない。 */
(function(root){
'use strict';
const PI=Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let geometryCache=null;
function area(p){return p.reduce((v,a,i)=>{const b=p[(i+1)%p.length];return v+a[0]*b[1]-b[0]*a[1];},0)/2;}
function geometry(s,optics){
 if(!optics)throw Error('3D表示には輪郭の計算モジュールが必要です。');
 const key=JSON.stringify([s.shape,s.width,s.height,s.radius,s.hole,s.polygon,s.svgShapes]);
 if(geometryCache&&geometryCache.key===key)return geometryCache.value;
 let loops,boundary;
 if(s.shape==='svg'){const svg=optics.svgGeometry(s);loops=svg.loops.map(p=>p.map(q=>q.slice()));boundary=svg.boundary.map(edge=>edge.map(p=>p.slice()));}
 else{
  const outer=optics.outline(s,80).map(p=>p.slice());if(area(outer)<0)outer.reverse();loops=[outer];
  if(s.shape==='ring')loops.push(outer.map(p=>[p[0]*s.hole,p[1]*s.hole]).reverse());
  boundary=loops.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));
 }
 const value={loops,boundary};geometryCache={key,value};return value;
}
// 高さは模式的な描画用。距離の基準となる発光面は z=0 に固定する。
// 基板の底と台座の上面、パッケージの底と基板の上面を一致させる。
function layerHeights(s){
 return {baseBottom:-2.2,baseTop:-1.2,tapeBottom:-1.2,tapeTop:-1,packageBottom:-1,packageTop:0,emission:0,plateBottom:s.gap,plateTop:s.gap+s.thickness};
}
function createCamera(s,options={}){
 const width=Math.max(80,Number(options.width)||640),height=Math.max(80,Number(options.height)||355);
 const yaw=(Number.isFinite(options.yaw)?options.yaw:-25)*PI/180,pitch=clamp(Number.isFinite(options.pitch)?options.pitch:55,8,82)*PI/180;
 const zoom=clamp(Number.isFinite(options.zoom)?options.zoom:1,.5,2.5),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const layers=layerHeights(s),baseZ=layers.baseBottom,topZ=layers.plateTop,centerZ=(topZ+baseZ)/2;
 const distance=Math.hypot(s.width,s.height,topZ-baseZ)*3.8;
 function raw(x,y,z){const rx=cy*x-sy*y,ry=sy*x+cy*y,rz=z-centerZ,depth=sp*ry+cp*rz,perspective=distance/(distance-depth);return {x:rx*perspective,y:(cp*ry-sp*rz)*perspective,depth,perspective};}
 const corners=[];for(const x of [-s.width/2,s.width/2])for(const y of [-s.height/2,s.height/2])for(const z of [baseZ,topZ])corners.push(raw(x,y,z));
 const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
 const padX=width<400?28:46,padTop=25,padBottom=37,scale=Math.min((width-2*padX)/(maxX-minX),(height-padTop-padBottom)/(maxY-minY))*zoom;
 const offsetX=width/2-(minX+maxX)/2*scale,offsetY=(height+padTop-padBottom)/2-(minY+maxY)/2*scale;
 const project=(x,y,z)=>{const p=raw(x,y,z);return {x:p.x*scale+offsetX,y:p.y*scale+offsetY,depth:p.depth,perspective:p.perspective};};
 return {project,scale,width,height,yaw:yaw*180/PI,pitch:pitch*180/PI,zoom,distance,centerZ,direction:[sy*sp,cy*sp,cp],bounds:{x:minX*scale+offsetX,y:minY*scale+offsetY,width:(maxX-minX)*scale,height:(maxY-minY)*scale}};
}
function path(ctx,points,close=true){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(close)ctx.closePath();}
function contourPath(ctx,loops,project,z){ctx.beginPath();for(const loop of loops){loop.forEach((p,i)=>{const q=project(p[0],p[1],z);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();}}
function filled(ctx,points,fill,stroke=null){path(ctx,points);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.65;ctx.stroke();}}
// 小さい三角形ごとにアフィン変換し、遠近法のゆがみを近似する。
function textureTriangle(ctx,texture,source,dest){
 const [a,b,c]=source,[p,q,r]=dest,det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);if(Math.abs(det)<1e-10)return;
 const ax=((q.x-p.x)*(c[1]-a[1])-(r.x-p.x)*(b[1]-a[1]))/det,ay=((q.y-p.y)*(c[1]-a[1])-(r.y-p.y)*(b[1]-a[1]))/det;
 const bx=((r.x-p.x)*(b[0]-a[0])-(q.x-p.x)*(c[0]-a[0]))/det,by=((r.y-p.y)*(b[0]-a[0])-(q.y-p.y)*(c[0]-a[0]))/det;
 const center={x:(p.x+q.x+r.x)/3,y:(p.y+q.y+r.y)/3};
 const clip=dest.map(v=>{const dx=v.x-center.x,dy=v.y-center.y,d=Math.hypot(dx,dy)||1;return {x:v.x+dx/d*.8,y:v.y+dy/d*.8};});
 // クリップの縁をわずかに重ね、三角形間のアンチエイリアスの暗い継ぎ目を消す。
 ctx.save();path(ctx,clip);ctx.clip();ctx.transform(ax,ay,bx,by,p.x-ax*a[0]-bx*a[1],p.y-ay*a[0]-by*a[1]);ctx.drawImage(texture,0,0);ctx.restore();
}
function polygonAt(p,project,z){return p.map(q=>project(q[0],q[1],z));}
function orientedSquare(x,y,size,angle){const c=Math.cos(angle),s=Math.sin(angle);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+(a*c-b*s)*size/2,y+(a*s+b*c)*size/2]);}
function circle(x,y,r,n=12){return Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*PI/n),y+r*Math.sin(i*2*PI/n)]);}
// 接続されたテープを基板の立体として作り、各LEDをその上面へ載せる。
// 端部の基板も作るので、LEDが1個だけのテープも台座に接触する。
function mountedTapeGeometry(result,optics=root.Optics){
 const s=result.state,layers=layerHeights(s),leds=result.leds||[],tapeWidth=Number.isFinite(s.tapeWidth)&&s.tapeWidth>0?s.tapeWidth:s.packageSize+2,tapes=[],packages=[];
 const footprints=optics&&typeof optics.tapeFootprints==='function'?points=>optics.tapeFootprints({...s,tapeWidth},points):null;
 for(let i=0;i<leds.length;i++){
  const led=leds[i],previous=leds[i-1],tapeIndex=led.tapeIndex??0,indices=[led.index??i],point=[led.x,led.y,led.angle||0],single=footprints?footprints([point]):null;
  tapes.push({polygon:single?single.tapes[0]:orientedSquare(led.x,led.y,tapeWidth,led.angle||0),bottom:layers.tapeBottom,top:layers.tapeTop,tapeIndex,ledIndices:indices});
  // 除外されたLEDの欠番を直線で補うと、SVGの切り欠きを横断してしまう。
  // 同じテープで、元の配線順も連続している場合だけ基板を接続する。
  if(previous&&(previous.tapeIndex??0)===tapeIndex&&(previous.index??i-1)+1===(led.index??i)){
   const dx=led.x-previous.x,dy=led.y-previous.y,len=Math.hypot(dx,dy);
   if(len>1e-8){const ox=-dy/len*tapeWidth/2,oy=dx/len*tapeWidth/2;
    const joined=footprints?footprints([[previous.x,previous.y,previous.angle||0],point]):null;
    tapes.push({polygon:joined?joined.tapes.at(-1):[[previous.x+ox,previous.y+oy],[previous.x-ox,previous.y-oy],[led.x-ox,led.y-oy],[led.x+ox,led.y+oy]],bottom:layers.tapeBottom,top:layers.tapeTop,tapeIndex,ledIndices:[previous.index??i-1,...indices]});
   }
  }
  packages.push({polygon:single?single.packages[0]:orientedSquare(led.x,led.y,s.packageSize,led.angle||0),bottom:layers.packageBottom,top:layers.packageTop,light:circle(led.x,led.y,s.aperture/2),led});
 }
 return {layers,tapes,packages};
}
function render(ctx,result,options={}){
 const s=result.state,camera=createCamera(s,options),{project}=camera,g=geometry(s,options.optics||root.Optics),width=camera.width,height=camera.height;
 const layers=layerHeights(s),topZ=layers.plateTop,baseZ=layers.baseTop,texture=options.texture,faces=[],showLED=options.showLED!==false,showGrid=options.showGrid!==false;
 ctx.save();ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 function face(points,draw,kind){const projected=points.map(p=>project(...p));faces.push({depth:projected.reduce((a,p)=>a+p.depth,0)/projected.length,draw:()=>draw(projected),kind});}
 // 台座は穴と離れた輪郭も同じ位置に持つ。投影した輪郭でクリップする。
 contourPath(ctx,g.loops,project,baseZ);ctx.fillStyle='#202735';ctx.fill('evenodd');ctx.strokeStyle='#66728a66';ctx.lineWidth=1;ctx.stroke();
 if(showGrid){
  ctx.save();contourPath(ctx,g.loops,project,baseZ);ctx.clip('evenodd');ctx.strokeStyle='#c6d4ef0b';ctx.lineWidth=.7;
  const spacing=Math.max(10,Math.ceil(Math.max(s.width,s.height)/18/10)*10);ctx.beginPath();
  for(let x=Math.ceil(-s.width/2/spacing)*spacing;x<=s.width/2;x+=spacing){const a=project(x,-s.height/2,baseZ),b=project(x,s.height/2,baseZ);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
  for(let y=Math.ceil(-s.height/2/spacing)*spacing;y<=s.height/2;y+=spacing){const a=project(-s.width/2,y,baseZ),b=project(s.width/2,y,baseZ);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();ctx.restore();
 }
 // テープ底面を台座に接触させ、基板の厚みとLEDパッケージの高さを描く。
 if(showLED){
  const mounted=mountedTapeGeometry(result,options.optics||root.Optics),dir=camera.direction;
  function prism(part,topColor,sideColor,kind){
   face(part.polygon.map(p=>[...p,part.top]),p=>filled(ctx,p,topColor,kind==='led'?'#ffffff38':'#a8afbc24'),kind);
   for(let i=0;i<part.polygon.length;i++){
    const a=part.polygon[i],b=part.polygon[(i+1)%part.polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),facing=len?(dy*dir[0]-dx*dir[1])/len:0;
    if(facing<=0)continue;
    const color=sideColor.map(v=>Math.round(v*(.65+.3*facing)));
    face([[...a,part.bottom],[...b,part.bottom],[...b,part.top],[...a,part.top]],p=>filled(ctx,p,`rgb(${color.join(',')})`),kind);
   }
  }
  for(const tape of mounted.tapes)prism(tape,'#12151d',[67,75,88],'tape');
  for(const pack of mounted.packages){
   prism(pack,'#d2d4d4',[183,191,204],'led');
   const rgb=pack.led.rgb||[0,0,0],level=Math.max(...rgb),color=rgb.map(v=>Math.round(255*(level?v/Math.max(.3,level):0)));
   face(pack.light.map(p=>[...p,layers.emission]),p=>filled(ctx,p,`rgb(${color.join(',')})`),'led');
  }
 }
 // 各壁を短く区切ると、曲線の穴と手前側の段差の描画順も安定する。
 const maxSegment=Math.max(s.width,s.height)/12,dir=camera.direction;
 for(const [a,b] of g.boundary){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;
  const facing=(dy*dir[0]-dx*dir[1])/len;if(facing<=0)continue;
  const brightness=.54+.36*facing,filter=options.optics&&options.optics.getFilter?options.optics.getFilter(s.argb):[1,1,1];
  const shade=filter.map((v,i)=>Math.round((80+[12,20,37][i])*brightness*(.5+.5*v))),color=`rgb(${shade.join(',')})`,n=Math.max(1,Math.ceil(len/maxSegment));
  for(let i=0;i<n;i++){
   const p=[a[0]+dx*i/n,a[1]+dy*i/n],q=[a[0]+dx*(i+1)/n,a[1]+dy*(i+1)/n];
   face([[...p,s.gap],[...q,s.gap],[...q,topZ],[...p,topZ]],v=>filled(ctx,v,color),'wall');
   face([[...p,layers.baseBottom],[...q,layers.baseBottom],[...q,baseZ],[...p,baseZ]],v=>filled(ctx,v,'#151b26'),'baseWall');
  }
 }
 const nx=clamp(Math.ceil(camera.bounds.width/58),5,10),ny=clamp(Math.round(nx*s.height/s.width),3,8);
 if(texture&&texture.width&&texture.height){
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
   const x0=i/nx,x1=(i+1)/nx,y0=j/ny,y1=(j+1)/ny,uv=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
   for(const ids of [[0,1,2],[0,2,3]]){const coords=ids.map(k=>[(uv[k][0]-.5)*s.width,(uv[k][1]-.5)*s.height,topZ]),source=ids.map(k=>[uv[k][0]*texture.width,uv[k][1]*texture.height]);face(coords,p=>textureTriangle(ctx,texture,source,p),'texture');}
  }
 }
 // 不透明な正面に隠れる下層を先に除外する。三角形の中心だけの深度順では、
 // 大きいギャップ時に台座のLEDが表面へ浮き出ることがあるため。
 const topFaces=faces.filter(f=>f.kind==='texture'),lowerFaces=faces.filter(f=>f.kind!=='texture');
 lowerFaces.sort((a,b)=>a.depth-b.depth);ctx.save();
 contourPath(ctx,g.loops,project,topZ);ctx.rect(0,0,width,height);ctx.clip('evenodd');for(const f of lowerFaces)f.draw();ctx.restore();
 ctx.save();contourPath(ctx,g.loops,project,topZ);ctx.clip('evenodd');
 if(topFaces.length)for(const f of topFaces)f.draw();else{ctx.fillStyle='#3b4353';ctx.fillRect(0,0,width,height);}ctx.restore();
 // 表面の輪郭だけを細く描き、色分布は計算した画像をそのまま表示する。
 contourPath(ctx,g.loops,project,topZ);ctx.strokeStyle='#e4e9f044';ctx.lineWidth=.8;ctx.stroke();
 const annotation=drawDimension(ctx,s,g,camera);
 ctx.restore();return {project,bounds:camera.bounds,camera,layers,surfaces:faces.length,textureTriangles:2*nx*ny,annotation};
}
function drawDimension(ctx,s,g,camera){
 const {project,width,height}=camera,point=g.boundary.flatMap(p=>p).reduce((best,p)=>{const a=project(...p,0);return !best||a.depth>best.depth?{p,depth:a.depth}:best;},null).p;
 const a=project(...point,0),b=project(...point,s.gap),side=(a.x+b.x)/2>width/2?1:-1;
 const offset=side*13,ax=clamp(a.x+offset,12,width-12),bx=clamp(b.x+offset,12,width-12),color='#c2cce1';
 ctx.strokeStyle='#a7b4cc99';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(ax+side*3,a.y);ctx.moveTo(b.x,b.y);ctx.lineTo(bx+side*3,b.y);ctx.moveTo(ax,a.y);ctx.lineTo(bx,b.y);ctx.stroke();
 for(const p of [{x:ax,y:a.y},{x:bx,y:b.y}]){ctx.beginPath();ctx.moveTo(p.x-3,p.y-2);ctx.lineTo(p.x+3,p.y+2);ctx.stroke();}
 const label=`距離 ${Number(s.gap.toFixed(2))} mm`,font=width<400?10:11;ctx.font=`${font}px "Yu Gothic UI", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
 const tw=ctx.measureText(label).width,x=clamp((ax+bx)/2+side*(tw/2+8),tw/2+8,width-tw/2-8),y=clamp((a.y+b.y)/2,16,height-20);
 ctx.fillStyle='#0c0e13dd';ctx.fillRect(x-tw/2-5,y-font/2-4,tw+10,font+8);ctx.fillStyle=color;ctx.fillText(label,x,y);
 return {from:a,to:b,label,x,y};
}
const api={render,createCamera,geometry,layerHeights,mountedTapeGeometry};root.DiffusionView3D=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
