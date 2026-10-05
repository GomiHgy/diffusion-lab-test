/* LEDテープの自動配置。輪郭からはみ出す接続を別テープへ分割する。 */
(function(root){
'use strict';
const PI=Math.PI,MAX_LEDS=5000,MAX_CANDIDATES=15000;
function width(s){return Number.isFinite(s.tapeWidth)?s.tapeWidth:s.packageSize+2;}
function fit(O,s,points){
 if(typeof O.tapeFits!=='function')throw Error('LEDテープの連続輪郭判定が利用できません。');
 return O.tapeFits(s,points,0);
}
function ensureLimit(n){if(n>MAX_CANDIDATES)throw Error('LED数が多すぎます。密度または列間隔を調整してください。');}
function copy(p){return [p[0],p[1],p[2]||0];}
function signedArea(points){let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-a[1]*b[0];}return area/2;}
// SVG境界は塗り領域が左側。穴の時計回り境界も同じ向きへオフセットする。
// 凹部ごとにオフセットするため、全体の幅・高さの縮小で細い腕を失わない。
function insetLoop(points,distance,filledLeft=false){
 if(points.length<3)return [];
 const direction=filledLeft||signedArea(points)>=0?1:-1,out=[];
 for(let i=0;i<points.length;i++){
  const a=points[(i+points.length-1)%points.length],p=points[i],b=points[(i+1)%points.length],l0=Math.hypot(p[0]-a[0],p[1]-a[1]),l1=Math.hypot(b[0]-p[0],b[1]-p[1]);
  if(l0<1e-9||l1<1e-9)continue;
  const n0=[-(p[1]-a[1])/l0*direction,(p[0]-a[0])/l0*direction],n1=[-(b[1]-p[1])/l1*direction,(b[0]-p[0])/l1*direction],den=1+n0[0]*n1[0]+n0[1]*n1[1];
  if(den>1e-6){const dx=distance*(n0[0]+n1[0])/den,dy=distance*(n0[1]+n1[1])/den;
   if(Math.hypot(dx,dy)<=Math.max(distance*12,1)){out.push([p[0]+dx,p[1]+dy]);continue;}
  }
  // 鋭い折り返しは無制限のミターではなく両側の点を使い、後で幅を判定する。
  out.push([p[0]+n0[0]*distance,p[1]+n0[1]*distance],[p[0]+n1[0]*distance,p[1]+n1[1]*distance]);
 }
 return out;
}
function perimeterGroups(O,s,margin,pitch){
 if(s.shape==='ellipse'||s.shape==='ring'||s.shape==='rounded')margin=Math.max(margin,width(s)/Math.SQRT2,s.packageSize/Math.SQRT2);
 if(s.width<=2*margin||s.height<=2*margin)return [];
 if(s.shape==='svg')return O.svgGeometry(s).loops.map(loop=>({points:O.samplePath(insetLoop(loop,margin,true),pitch,true),closed:true}));
 if(s.shape==='polygon')return [{points:O.samplePath(insetLoop(O.outline(s),margin),pitch,true),closed:true}];
 // 円・角丸は既存の寸法/半径オフセットを保ち、曲線の局所ミター誤差を避ける。
 const smaller={...s,width:s.width-2*margin,height:s.height-2*margin,radius:Math.max(0,s.radius-margin)};
 return [{points:O.samplePath(O.outline(smaller),pitch,true),closed:true}];
}
function candidateGroups(O,s,pitch,margin){
 const rot=s.rotation*PI/180,ca=Math.cos(rot),sa=Math.sin(rot);
 if(s.layout==='ring'){
  // 曲線では端部正方形の角も外周内に残るよう、半対角長を最低余白にする。
  margin=Math.max(margin,width(s)/Math.SQRT2,s.packageSize/Math.SQRT2);
  const a=s.width/2-margin,b=s.height/2-margin;if(a<=0||b<=0)return [];
  const points=Array.from({length:720},(_,i)=>{const t=2*PI*i/720;return [a*Math.cos(t),b*Math.sin(t)];});
  return [{points:O.samplePath(points,pitch,true),closed:true}];
 }
 if(s.layout==='perimeter')return perimeterGroups(O,s,margin,pitch);
 if(s.layout!=='rows'&&s.layout!=='grid')throw Error('自動配置の種類を選択してください。');
 const spacing=s.layout==='grid'?pitch:s.rowSpacing,extent=Math.hypot(s.width,s.height)/2;
 if(Math.ceil(2*extent/pitch)*Math.ceil(2*extent/spacing)>90000)throw Error('配置候補が多すぎます。LED密度を下げてください。');
 const ny=s.layout==='rows'&&s.tapeCount?s.tapeCount:Math.max(1,Math.floor((s.height-2*margin)/spacing)+1),nx=Math.max(1,Math.floor((s.width-2*margin)/pitch)+1);
 ensureLimit(nx*ny);const rows=[];
 for(let j=0;j<ny;j++){
  const points=[];for(let i=0;i<nx;i++){const x=(i-(nx-1)/2)*pitch,y=(j-(ny-1)/2)*spacing;points.push([x*ca-y*sa,x*sa+y*ca,rot]);}
  if(j%2)points.reverse();rows.push({points,closed:false});
 }
 return s.layout==='rows'?rows:[{points:rows.flatMap(row=>row.points),closed:false}];
}
// 元の接続順を歩き、無効LEDと輪郭を跨ぐブリッジで切る。削除後の再接続はしない。
function splitGroup(O,s,source){
 const groups=[];let current=[],discarded=0,broken=false;
 for(const point of source.points){
  if(!fit(O,s,[point])){if(current.length){groups.push(current);current=[];}discarded++;broken=true;continue;}
  if(current.length&&!fit(O,s,[current[current.length-1],point])){groups.push(current);current=[];broken=true;}
  current.push(copy(point));
 }
 if(current.length)groups.push(current);
 if(source.closed&&source.points.length){
  const first=source.points[0],last=source.points[source.points.length-1];
  if(!fit(O,s,[last,first]))broken=true;
  // 有効な閉路の継ぎ目で分かれた先頭・末尾を再び一つの連続列にする。
  // 無効部分を飛ばす接続とは異なり、ここは元の隣接関係そのもの。
  if(groups.length>1&&fit(O,s,[first])&&fit(O,s,[last])&&fit(O,s,[last,first])){
   groups[0]=groups.pop().concat(groups[0]);
  }
 }
 const splitCount=source.closed?(broken?groups.length:0):Math.max(0,groups.length-1);
 return {groups,discarded,splitCount};
}
function generate(O,s){
 const pitch=1000/s.density,margin=Math.max(s.inset,s.packageSize/2,width(s)/2);
 if(!Number.isFinite(pitch)||pitch<=0)throw Error('LED密度には正の数値を指定してください。');
 if(s.layout==='path'){
  const path=O.parsePoints(s.path),points=O.samplePath(path,pitch);
  if(path.length<2)throw Error('テープ経路には2点以上の座標が必要です。');
  // 元の折線の角に加え、LED間の直線接続も判定する。危険な経路を自動切断しない。
  if(!fit(O,s,path)||!fit(O,s,points))throw Error('テープ経路全体とテープ幅が輪郭内に収まるように経路を調整してください。切り欠き・穴を跨ぐ経路は配置できません。');
  return {manual:points.map(copy),tapeLengths:points.length?[points.length]:[],discarded:0,pitch,splitCount:0};
 }
 const sources=candidateGroups(O,s,pitch,margin);ensureLimit(sources.reduce((n,g)=>n+g.points.length,0));
 const groups=[];let discarded=0,splitCount=0;
 for(const source of sources){const part=splitGroup(O,s,source);groups.push(...part.groups);discarded+=part.discarded;splitCount+=part.splitCount;}
 const manual=groups.flat();if(manual.length>MAX_LEDS)throw Error('LED数が5,000個を超えます。密度を下げてください。');
 if(s.layout==='rows'&&s.tapeCount&&groups.length!==s.tapeCount)throw Error('指定本数の連続したテープが輪郭内に収まりません。切り欠き・穴による分割が必要な場合は本数を自動に戻し、手動配置へコピーして調整してください。');
 return {manual,tapeLengths:groups.map(g=>g.length),discarded,pitch,splitCount};
}
const api={generate};if(typeof module==='object'&&module.exports)module.exports=api;else root.TapePlacement=api;
})(typeof globalThis!=='undefined'?globalThis:this);
