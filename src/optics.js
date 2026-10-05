/* Diffusion Lab v1.0 — original planar RGB/photometric approximation.
 * No third-party runtime dependencies. See MODEL.md for assumptions. */
(function (root) {
'use strict';
const Gaming=root.Gaming||(typeof require==='function'?require('./gaming.js'):null);
const PI=Math.PI, Y=[0.2126,0.7152,0.0722];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// 出典の窓寸法と光学的な有効発光面は別物。未記載の値を製品仕様にしない。
const ledProfiles={
 'WS2812B':{packageCode:'5050',packageSize:5.4,windowDiameter:4,angle:null,assumedAperture:2.8,assumedAngle:120,
  photometry:{min:[300,800,200],typ:null,max:[500,1500,300],currentMA:16,page:3,threeChannelMax:null},
  revision:'Worldsemi WS2812B V1.4（2018-07-19）',pages:'p.2 機械寸法',
  datasheetUrl:'https://docid81hrs3j1.cloudfront.net/medialibrary/2018/10/WS2812B_V1.4_EN_18090714224701.pdf'},
 'WS2812B-MINI':{packageCode:'3535',packageSize:3.46,windowDiameter:2.85,angle:null,assumedAperture:1.9,assumedAngle:120,
  photometry:{min:[300,600,200],typ:[310,780,215],max:[500,1000,300],currentMA:12,page:3,threeChannelMax:null},
  revision:'Worldsemi WS2812B-Mini-V3 V3.0（2019-01-23）',pages:'p.2 機械寸法',
  datasheetUrl:'https://www.peace-corp.co.jp/data/WS2812B-Mini-V3_V3.0_EN.pdf'},
 'WS2812C-2020':{packageCode:'2020',packageSize:2.2,windowDiameter:null,angle:null,assumedAperture:1.1,assumedAngle:120,
  photometry:{min:[50,200,50],typ:[80,270,70],max:[100,300,100],currentMA:5,page:3,threeChannelMax:null},
  revision:'Worldsemi WS2812C-2020 V1.2（2019-01-04）',pages:'p.1 機械寸法',
  datasheetUrl:'https://cdn.sparkfun.com/assets/e/1/0/f/b/WS2812C-2020_V1.2_EN_19112716191654.pdf'},
 'SK6812':{packageCode:'5050',packageSize:5.4,windowDiameter:null,angle:120,assumedAperture:2.8,assumedAngle:120,
  photometry:{min:[280,815,160],typ:null,max:[515,1275,320],currentMA:12,page:6,tolerancePercent:10,threeChannelMax:70},
  revision:'OPSCO SK6812-012 Rev.B/1（2025-08-11）',pages:'p.3 光学特性 / p.4 機械寸法',
  datasheetUrl:'https://datasheet.lcsc.com/datasheet/pdf/9f469126feffa69bd23486dc2acd2d83.pdf'},
 'SK6812-MINI':{packageCode:'3535',packageSize:3.7,windowDiameter:null,angle:120,assumedAperture:1.9,assumedAngle:120,
  photometry:{min:[280,815,200],typ:null,max:[515,1275,385],currentMA:12,page:6,tolerancePercent:10,threeChannelMax:null},
  revision:'OPSCO SK6812MINI-012 Rev.B/0（2024-04-23）',pages:'p.3 光学特性 / p.4 機械寸法',
  datasheetUrl:'https://datasheet.lcsc.com/datasheet/pdf/9596115a5796613b5408a09f63fb1427.pdf'}
};
// 円形の開口を同じ面積の正方形に置換する。ダイ寸法や実測幅の算出ではない。
function profileAperture(p){return p.windowDiameter===null?p.assumedAperture:p.windowDiameter*Math.sqrt(PI)/2;}
// Typ未記載の型番は、記載範囲の中点を計算用の代表値にする。メーカーTyp値とは区別する。
function profileIntensity(p){const v=p.photometry;return v.typ?v.typ.slice():v.min.map((x,i)=>(x+v.max[i])/2);}
function profileValues(p){const [mcdR,mcdG,mcdB]=profileIntensity(p);return {packageSize:p.packageSize,aperture:profileAperture(p),angle:p.angle===null?p.assumedAngle:p.angle,mcdR,mcdG,mcdB};}
const defaults={
 version:1,shape:'rounded',width:160,height:72,radius:10,hole:0.46,
 polygon:'50,2\n88,16\n98,50\n75,94\n25,94\n2,50\n12,16',
 svgShapes:[],svgLabel:'',
 layout:'rows',density:60,rowSpacing:24,inset:8,rotation:0,tapeCount:0,
 path:'-65,18\n-65,-18\n0,-18\n0,18\n65,18\n65,-18',manual:[],tapeLengths:[],
 ledModel:'WS2812B',package:'custom',...profileValues(ledProfiles.WS2812B),splitRGB:false,
 brightness:20,
 gamingScene:'rainbowWave',gamingSpeed:1,gamingPhase:0,gamingPlaying:false,
 pattern:'gradient',color1:'#00cfff',color2:'#ff3979',pwmMode:'raw',
 gap:10,material:'opal',argb:'#FFFFFFFF',thickness:3,
 transmission:45,diffuse:100,spread:0.65,
 quality:288,roi:5,exposure:0,whiteLevel:1000,tone:'compress',ambient:0,
 showLED:false,showGrid:true,view:'appearance',target:80,
 renderMode:'2d',cameraYaw:-25,cameraPitch:55,cameraZoom:1,
 customLabel:'未校正・比較用の仮定値'
};
const ENUMS={shape:['rect','rounded','ellipse','ring','polygon','svg'],layout:['rows','grid','perimeter','ring','path','manual'],ledModel:[...Object.keys(ledProfiles),'custom'],package:['5050','3535','2020','custom'],pattern:['solid','gradient','alternating','rainbow','rgb','gaming'],gamingScene:['rainbowWave','chase','breathe','cyberPulse'],renderMode:['2d','3d'],pwmMode:['raw','srgb'],material:['opal','strong','frost','clear','foam','custom'],tone:['compress','linear'],view:['appearance','heat','layout']};
const RANGES={tapeCount:[0,100],gamingSpeed:[.1,3],gamingPhase:[0,1],cameraYaw:[-180,180],cameraPitch:[8,82],cameraZoom:[.5,2.5],width:[10,2000],height:[10,2000],radius:[0,1000],hole:[0.05,0.95],density:[1,1000],rowSpacing:[1,1000],inset:[0,1000],rotation:[-180,180],packageSize:[0.5,20],aperture:[0.05,20],angle:[10,175],mcdR:[0,200000],mcdG:[0,200000],mcdB:[0,200000],brightness:[0,100],gap:[0.25,300],thickness:[0.1,30],transmission:[0,100],diffuse:[0,100],spread:[0,5],roi:[0,500],exposure:[-6,6],whiteLevel:[1,1000000],ambient:[0,10000],target:[0,100]};
function normalize(input={}) {
 const s={...defaults};
 for(const k in defaults) if(Object.prototype.hasOwnProperty.call(input,k)) s[k]=input[k];
 // 型番を持たない旧JSONは数値を保持し、外形だけで実在型番に割り当てない。
 if(!Object.prototype.hasOwnProperty.call(input,'ledModel')&&Object.prototype.hasOwnProperty.call(input,'package')){
  s.ledModel='custom';
  const old={'5050':{packageSize:5,aperture:2.8},'3535':{packageSize:3.5,aperture:1.9},'2020':{packageSize:2,aperture:1.1}}[input.package];
  if(old)for(const k in old)if(!Object.prototype.hasOwnProperty.call(input,k))s[k]=old[k];
  for(const [k,v] of Object.entries({mcdR:213,mcdG:715,mcdB:72}))if(!Object.prototype.hasOwnProperty.call(input,k))s[k]=v;
 }else if(!ENUMS.ledModel.includes(s.ledModel))s.ledModel='custom';
 const profile=ledProfiles[s.ledModel],preset=profile?profileValues(profile):null;
 if(preset)for(const [k,v] of Object.entries(preset))if(!Object.prototype.hasOwnProperty.call(input,k))s[k]=v;
 for(const k in RANGES){const v=Number(s[k]);s[k]=Number.isFinite(v)?clamp(v,...RANGES[k]):preset&&k in preset?preset[k]:defaults[k];}
 for(const k in ENUMS)if(!ENUMS[k].includes(s[k]))s[k]=defaults[k];
 s.tapeCount=Math.round(s.tapeCount);
 s.quality=[160,288,448].includes(Number(s.quality))?Number(s.quality):288;
 for(const k of ['splitRGB','showLED','showGrid','gamingPlaying'])s[k]=s[k]===true;
 for(const k of ['color1','color2'])if(typeof s[k]!=='string'||!/^#[0-9a-f]{6}$/i.test(s[k]))s[k]=defaults[k];
 if(typeof s.argb!=='string'||!/^#[0-9a-f]{8}$/i.test(s.argb))s.argb=defaults.argb;
 s.argb=s.argb.toUpperCase();
 s.polygon=typeof s.polygon==='string'?s.polygon.slice(0,30000):defaults.polygon;
 s.path=typeof s.path==='string'?s.path.slice(0,30000):defaults.path;
 s.svgShapes=normalizeSVGShapes(s.svgShapes);s.svgLabel=typeof s.svgLabel==='string'?s.svgLabel.slice(0,200):'';
 s.customLabel=typeof s.customLabel==='string'?s.customLabel.slice(0,200):defaults.customLabel;
 // テープの接続順を保存する。輪郭変更で各LEDを個別に丸めて間隔を変えない。
 const raw=Array.isArray(s.manual)?s.manual:[],lengths=validTapeLengths(raw.length,s.tapeLengths),manual=[],counts=[];
 let offset=0;
 for(const length of lengths){let count=0;for(let i=offset;i<Math.min(offset+length,5000);i++){
  const p=raw[i];if(Array.isArray(p)&&p.length>=2&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])){manual.push([+p[0],+p[1],Number.isFinite(+p[2])?+p[2]:0]);count++;}
 }if(count)counts.push(count);offset+=length;if(offset>=5000)break;}
 s.manual=manual;s.tapeLengths=counts;
 s.radius=Math.min(s.radius,s.width/2,s.height/2);
 s.aperture=Math.min(s.aperture,s.packageSize);
 s.version=1;return s;
}
function selectLEDModel(input,id){
 const p=ledProfiles[id];
 return normalize({...input,ledModel:p?id:'custom',package:'custom',...(p?profileValues(p):{})});
}
function ledDescription(s){
 const p=ledProfiles[s.ledModel];
 if(!p)return {label:'カスタム',widthBasis:'手動・旧設定',angleBasis:'手動・旧設定',intensityBasis:'手動・旧設定'};
 const widthBasis=Math.abs(s.aperture-profileAperture(p))>1e-9?'手動上書き':p.windowDiameter===null?'資料未記載・仮定':'開口面積からの近似';
 const angleBasis=s.angle!==(p.angle===null?p.assumedAngle:p.angle)?'手動上書き':p.angle===null?'資料未記載・仮定':'資料の半値角';
 const expected=profileIntensity(p),intensityBasis=[s.mcdR,s.mcdG,s.mcdB].some((v,i)=>Math.abs(v-expected[i])>1e-9)?'手動上書き':p.photometry.typ?'資料のTyp値':'記載範囲の中点';
 return {label:s.ledModel,widthBasis,angleBasis,intensityBasis};
}
function angularExponent(angle){return -Math.log(2)/Math.log(Math.cos(angle*PI/360));}
// 光源の前方半球を積分した推定光束。メーカー公称lmや拡散板通過後の光束ではない。
// rgbは出力係数を含む線形PWM比。省略時は出力設定でのRGB白、LED1個を表す。
function luminousFlux(s,rgb=null){
 const levels=rgb||[s.brightness/100,s.brightness/100,s.brightness/100],factor=2*PI/(angularExponent(s.angle)+1)/1000;
 const channels=[s.mcdR,s.mcdG,s.mcdB].map((v,i)=>v*levels[i]*factor);
 return {channels,total:channels.reduce((a,b)=>a+b,0)};
}
function parsePoints(text,percent=false,s=defaults){
 const out=[];
 for(const line of text.trim().split(/[\n;]+/)){
  if(!line.trim())continue;
  const a=line.trim().split(/[,\s]+/).map(Number);
  if(a.length!==2||!a.every(Number.isFinite))throw Error('座標は1行につき x,y の2つの数値で入力してください。');
  if(percent&&(a[0]<0||a[0]>100||a[1]<0||a[1]>100))throw Error('輪郭の座標は0〜100%の範囲にしてください。');
  out.push(percent?[(a[0]/100-.5)*s.width,(a[1]/100-.5)*s.height]:a);
 }
 return out;
}
function pointInPoly(x,y,p){let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if(((p[i][1]>y)!==(p[j][1]>y))&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])v=!v;return v;}
function segDist(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
function normalizeSVGShapes(shapes){
 if(!Array.isArray(shapes)||shapes.length>100)throw Error('SVG輪郭のデータが不正です。');let n=0;
 return shapes.map(shape=>{if(!shape||!['nonzero','evenodd'].includes(shape.fillRule)||!Array.isArray(shape.contours)||!shape.contours.length)throw Error('SVG輪郭の塗り規則・輪郭データが不正です。');
  return {fillRule:shape.fillRule,contours:shape.contours.map(contour=>{if(!Array.isArray(contour)||contour.length<3||(n+=contour.length)>2048)throw Error('SVG輪郭は3〜2,048頂点の範囲にしてください。');
   return contour.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))throw Error('SVG輪郭の座標は0〜100%の数値で指定してください。');return p.slice();});})};});
}
let svgGeometryCache=null;
function svgGeometry(s){
 const key=JSON.stringify([s.width,s.height,s.svgShapes]);if(svgGeometryCache&&svgGeometryCache.key===key)return svgGeometryCache.value;
 if(!s.svgShapes.length)throw Error('SVGファイルまたはパスを読み込み、輪郭に適用してください。');
 const shapes=s.svgShapes.map(shape=>({fillRule:shape.fillRule,contours:shape.contours.map(contour=>contour.map(p=>[(p[0]/100-.5)*s.width,(p[1]/100-.5)*s.height]))}));
 const contours=shapes.flatMap(shape=>shape.contours),edges=contours.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));
 function filled(x,y){
  for(const shape of shapes){let winding=0;for(const contour of shape.contours)for(let i=0;i<contour.length;i++){
   const a=contour[i],b=contour[(i+1)%contour.length],cross=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]);
   if(a[1]<=y&&b[1]>y&&cross>0)winding++;else if(a[1]>y&&b[1]<=y&&cross<0)winding--;
  }if(shape.fillRule==='evenodd'?Math.abs(winding)%2!==0:winding!==0)return true;}
  return false;
 }
 // 交点で辺を分割し、塗り領域の両側が異なる辺だけを境界にする。
 // 重複したパスやnonzeroの内側の線を、ROIの端として扱わない。
 const cuts=edges.map(()=>[0,1]),cross=(a,b)=>a[0]*b[1]-a[1]*b[0],eps=1e-10;
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const [a,b]=edges[i],[c,d]=edges[j],r=[b[0]-a[0],b[1]-a[1]],q=[d[0]-c[0],d[1]-c[1]],v=[c[0]-a[0],c[1]-a[1]],den=cross(r,q);
  if(Math.abs(den)>eps){const t=cross(v,q)/den,u=cross(v,r)/den;if(t>=0&&t<=1&&u>=0&&u<=1){cuts[i].push(t);cuts[j].push(u);}}
  else if(Math.abs(cross(v,r))<eps){for(const [k,p,q,other] of [[i,a,b,[c,d]],[j,c,d,[a,b]]]){const dx=q[0]-p[0],dy=q[1]-p[1],l=dx*dx+dy*dy;if(!l)continue;for(const o of other){const t=((o[0]-p[0])*dx+(o[1]-p[1])*dy)/l;if(t>0&&t<1)cuts[k].push(t);}}}
 }
 const boundary=[],probe=Math.max(s.width,s.height)*1e-7,seen=new Set(),vertexKey=p=>p.map(v=>Math.round(v/probe*100)).join(',');
 edges.forEach(([a,b],i)=>{const ts=cuts[i].sort((a,b)=>a-b),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)return;
  for(let j=1;j<ts.length;j++){if(ts[j]-ts[j-1]<1e-9)continue;const t=(ts[j]+ts[j-1])/2,x=a[0]+dx*t,y=a[1]+dy*t,nx=-dy/length*probe,ny=dx/length*probe;
   const left=filled(x+nx,y+ny),right=filled(x-nx,y-ny);
   if(left!==right){let p=[a[0]+dx*ts[j-1],a[1]+dy*ts[j-1]],q=[a[0]+dx*ts[j],a[1]+dy*ts[j]];if(!left)[p,q]=[q,p];const key=vertexKey(p)+'/'+vertexKey(q);if(!seen.has(key)){seen.add(key);boundary.push([p,q]);}}
   if(boundary.length>4096)throw Error('SVGの交差が多すぎます。パスを簡略化してください。');
  }
 });
 if(!boundary.length)throw Error('SVGに面積のある塗り領域がありません。塗り規則を確認してください。');
 const outgoing=new Map();boundary.forEach(([a],i)=>{const key=vertexKey(a);if(!outgoing.has(key))outgoing.set(key,[]);outgoing.get(key).push(i);});
 const used=new Set(),loops=[];
 for(let first=0;first<boundary.length;first++){if(used.has(first))continue;const loop=[],startKey=vertexKey(boundary[first][0]);let index=first;
  while(!used.has(index)){const [a,b]=boundary[index];used.add(index);loop.push(a);const endKey=vertexKey(b);if(endKey===startKey)break;
   const candidates=(outgoing.get(endKey)||[]).filter(i=>!used.has(i));if(!candidates.length)throw Error('SVGの境界を接続できません。細かすぎる交差を簡略化してください。');
   const dx=b[0]-a[0],dy=b[1]-a[1],angle=i=>{const q=boundary[i][1],turn=Math.atan2(dx*(q[1]-b[1])-dy*(q[0]-b[0]),dx*(q[0]-b[0])+dy*(q[1]-b[1]));return turn<-1e-10?turn+2*PI:turn;};
   candidates.sort((a,b)=>angle(a)-angle(b));index=candidates[0];
  }if(loop.length>=3)loops.push(loop);
 }
 const value={shapes,contours,boundary,loops,filled};svgGeometryCache={key,value};return value;
}
function shapeInfo(s){
 if(s.shape==='svg'){
  const geometry=svgGeometry(s);
  return {...geometry,poly:geometry.contours[0],inside:(x,y,margin=0)=>{
   if(Math.abs(x)>s.width/2||Math.abs(y)>s.height/2)return false;
   const inside=geometry.filled(x,y);if(!inside&&margin>0)return false;
   for(const [a,b] of geometry.boundary){const d=segDist(x,y,a,b);if(margin>0&&d<margin)return false;if(margin===0&&d<1e-8)return true;}
   return inside;
  }};
 }
 let poly=[];if(s.shape==='polygon'){poly=parsePoints(s.polygon,true,s);if(poly.length<3)throw Error('輪郭には3点以上が必要です。');let area=0;poly.forEach((p,i)=>{let q=poly[(i+1)%poly.length];area+=p[0]*q[1]-q[0]*p[1];});if(Math.abs(area)<.01)throw Error('輪郭の面積がありません。');}
 const a=s.width/2,b=s.height/2;
 function inside(x,y,margin=0){
  if(s.shape==='rect')return Math.abs(x)<=a-margin&&Math.abs(y)<=b-margin;
  if(s.shape==='rounded'){
   const r=s.radius,qx=Math.abs(x)-(a-r),qy=Math.abs(y)-(b-r);
   return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r<=-margin;
  }
  if(s.shape==='ellipse'||s.shape==='ring'){
   if(a<=margin||b<=margin)return false;
   const outer=(x/(a-margin))**2+(y/(b-margin))**2<=1;
   return outer&&(s.shape!=='ring'||(x/(a*s.hole+margin))**2+(y/(b*s.hole+margin))**2>=1);
  }
  if(!pointInPoly(x,y,poly))return false;
  if(margin>0)for(let i=0;i<poly.length;i++)if(segDist(x,y,poly[i],poly[(i+1)%poly.length])<margin)return false;
  return true;
 }
 return {inside,poly};
}
function outline(s,n=120){
 const p=[];if(s.shape==='svg')return svgGeometry(s).contours[0];if(s.shape==='polygon')return parsePoints(s.polygon,true,s);
 if(s.shape==='ellipse'||s.shape==='ring'){for(let i=0;i<n;i++){let a=2*PI*i/n;p.push([s.width/2*Math.cos(a),s.height/2*Math.sin(a)]);}return p;}
 if(s.shape==='rect')return [[-s.width/2,-s.height/2],[s.width/2,-s.height/2],[s.width/2,s.height/2],[-s.width/2,s.height/2]];
 const r=s.radius;for(let c=0;c<4;c++){let cx=(c===0||c===3?1:-1)*(s.width/2-r),cy=(c<2?1:-1)*(s.height/2-r);for(let k=0;k<=12;k++){let t=c*PI/2+k/12*PI/2;p.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]);}}return p;
}
function color(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
function srgbToLinear(v){return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}
function linearToSrgb(v){v=Math.max(0,v);return v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;}
function hsv(h){h=((h%1)+1)%1;const i=Math.floor(h*6),f=h*6-i;return [[1,f,0],[1-f,1,0],[0,1,f],[0,1-f,1],[f,0,1],[1,0,1-f]][i%6];}
function ledColors(s,n){if(s.pattern==='gaming'){if(!Gaming)throw Error('点灯演出を読み込めませんでした。');return Gaming.colors(s,n);}const a=color(s.color1),b=color(s.color2),out=[];for(let i=0;i<n;i++){let t=n>1?i/(n-1):0,c;
 if(s.pattern==='gradient')c=a.map((v,k)=>v*(1-t)+b[k]*t);
 else if(s.pattern==='alternating')c=i%2?b:a;
 else if(s.pattern==='rainbow')c=hsv(t*.85);
 else if(s.pattern==='rgb')c=[[1,0,0],[0,1,0],[0,0,1]][i%3];
 else c=a;
 out.push(c.map(v=>(s.pwmMode==='srgb'?srgbToLinear(v):v)*s.brightness/100));}return out;}
function samplePath(p,pitch,closed=false){
 if(p.length<2)return [];
 let segs=[],total=0;for(let i=1;i<p.length+(closed?1:0);i++){const a=p[i-1],b=p[i%p.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>1e-8){segs.push({a,b,l,start:total});total+=l;}}
 const n=Math.floor(total/pitch)+(closed?0:1);if(n>5000)throw Error('LED数が5,000個を超えます。密度を下げるか形状を小さくしてください。');
 const out=[],offset=closed?0:(total-(n-1)*pitch)/2;let j=0;
 for(let i=0;i<n;i++){let d=offset+i*pitch;while(j<segs.length-1&&d>segs[j].start+segs[j].l)j++;const q=segs[j],t=clamp((d-q.start)/q.l,0,1);out.push([q.a[0]+(q.b[0]-q.a[0])*t,q.a[1]+(q.b[1]-q.a[1])*t,Math.atan2(q.b[1]-q.a[1],q.b[0]-q.a[0])]);}return out;
}
function validTapeLengths(n,lengths){
 return Array.isArray(lengths)&&lengths.length&&lengths.every(v=>Number.isInteger(v)&&v>0)&&lengths.reduce((a,b)=>a+b,0)===n?lengths.slice():n?[n]:[];
}
function tapeRanges(layout){let start=0;return validTapeLengths(layout.manual.length,layout.tapeLengths).map((length,index)=>{const tape={index,start,length};start+=length;return tape;});}
function tapeLayout(s){
 if(s.layout==='manual')return {manual:s.manual.map(p=>p.slice()),tapeLengths:validTapeLengths(s.manual.length,s.tapeLengths)};
 const geo=makeLEDs(s);return {manual:geo.leds.map(p=>[p.x,p.y,p.angle]),tapeLengths:geo.tapeLengths};
}
// 選択したテープだけを平行移動する。範囲外では部分的な移動・個別クランプをしない。
function moveTape(s,layout,index,x,y){
 const tape=tapeRanges(layout)[index];if(!tape)throw Error('移動するテープを選択してください。');
 if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('X・Yには数値を入力してください。');
 const anchor=layout.manual[tape.start],dx=x-anchor[0],dy=y-anchor[1],{inside}=shapeInfo(s);
 const manual=layout.manual.map((p,i)=>i>=tape.start&&i<tape.start+tape.length?[p[0]+dx,p[1]+dy,p[2]||0]:p.slice());
 manual[tape.start][0]=x;manual[tape.start][1]=y;
 if(!manual.slice(tape.start,tape.start+tape.length).every(p=>inside(p[0],p[1],s.packageSize/2)))throw Error('テープ全体が輪郭内に収まる位置を指定してください。');
 return {manual,tapeLengths:validTapeLengths(manual.length,layout.tapeLengths)};
}
function makeLEDs(s){
 const {inside}=shapeInfo(s),pitch=1000/s.density,margin=Math.max(s.inset,s.packageSize/2),rot=s.rotation*PI/180;let list=[];
 // 輪郭外の固定LEDも接続データに残す。計算には輪郭内のLEDだけを使う。
 if(s.layout==='manual'){
  if(s.manual.length>5000)throw Error('LED数が5,000個を超えます。');
  const cols=ledColors(s,s.manual.length),all=[];
  for(const tape of tapeRanges(s))for(let i=tape.start;i<tape.start+tape.length;i++){const p=s.manual[i];all.push({x:p[0],y:p[1],angle:p[2]||0,rgb:cols[i],index:i,tapeIndex:tape.index});}
  const leds=all.filter(p=>inside(p.x,p.y));return {leds,tapeLengths:validTapeLengths(s.manual.length,s.tapeLengths),discarded:all.length-leds.length,pitch};
 }
 if(s.layout==='path')list=samplePath(parsePoints(s.path),pitch);
 else if(s.layout==='ring'){
  const a=s.width/2-margin,b=s.height/2-margin;if(a>0&&b>0){let p=[];for(let i=0;i<720;i++){let t=2*PI*i/720;p.push([a*Math.cos(t),b*Math.sin(t)]);}list=samplePath(p,pitch,true);}
 }else if(s.layout==='perimeter'){
  const w=s.width-2*margin,h=s.height-2*margin;if(w>0&&h>0){const smaller={...s,width:w,height:h,radius:Math.max(0,s.radius-margin)};
   if(s.shape==='svg')svgGeometry(smaller).loops.forEach((contour,index)=>list.push(...samplePath(contour,pitch,true).map(p=>[...p,index])));
   else list=samplePath(outline(smaller),pitch,true);
  }
 }else{
  const spacing=s.layout==='grid'?pitch:s.rowSpacing;
  const extent=Math.hypot(s.width,s.height)/2;
  if(Math.ceil(2*extent/pitch)*Math.ceil(2*extent/spacing)>90000)throw Error('配置候補が多すぎます。LED密度を下げてください。');
  const ny=s.layout==='rows'&&s.tapeCount?s.tapeCount:Math.max(1,Math.floor((s.height-2*margin)/spacing)+1),nx=Math.max(1,Math.floor((s.width-2*margin)/pitch)+1);
  if(nx*ny>15000)throw Error('LED数が多すぎます。密度または列間隔を調整してください。');
  for(let j=0;j<ny;j++){const row=[];for(let i=0;i<nx;i++){let x=(i-(nx-1)/2)*pitch,y=(j-(ny-1)/2)*spacing;row.push([x*Math.cos(rot)-y*Math.sin(rot),x*Math.sin(rot)+y*Math.cos(rot),rot,s.layout==='rows'?j:0]);}if(j%2)row.reverse();list.push(...row);}
 }
 const raw=list.length;list=list.filter(p=>inside(p[0],p[1],s.packageSize/2));
 if(list.length>5000)throw Error('LED数が5,000個を超えます。密度を下げてください。');
 const cols=ledColors(s,list.length),groups=new Map(),tapeLengths=[];
 const leds=list.map((p,i)=>{const id=p[3]||0;if(!groups.has(id)){groups.set(id,groups.size);tapeLengths.push(0);}const tapeIndex=groups.get(id);tapeLengths[tapeIndex]++;return {x:p[0],y:p[1],angle:p[2]||0,rgb:cols[i],index:i,tapeIndex};});
 if(s.layout==='rows'&&s.tapeCount&&tapeLengths.length!==s.tapeCount)throw Error('指定本数のテープが輪郭内に収まりません。板の寸法・列間隔を調整してください。');
 return {leds,tapeLengths,discarded:raw-list.length,pitch};
}
const planCache=new Map();
function plan(n){if(planCache.has(n))return planCache.get(n);const rev=new Uint32Array(n),cs=new Float64Array(n/2),sn=new Float64Array(n/2);for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;rev[i]=j;}for(let i=0;i<n/2;i++){cs[i]=Math.cos(-2*PI*i/n);sn[i]=Math.sin(-2*PI*i/n);}const p={rev,cs,sn};planCache.set(n,p);return p;}
function fftLine(re,im,start,stride,n,inverse){const p=plan(n);for(let i=1;i<n;i++){let j=p.rev[i];if(i<j){let a=start+i*stride,b=start+j*stride,t=re[a];re[a]=re[b];re[b]=t;t=im[a];im[a]=im[b];im[b]=t;}}
 for(let size=2;size<=n;size*=2){const half=size/2,step=n/size;for(let j=0;j<half;j++){let cr=p.cs[j*step],ci=p.sn[j*step]*(inverse?-1:1);for(let i=j;i<n;i+=size){const a=start+i*stride,b=a+half*stride,tr=cr*re[b]-ci*im[b],ti=cr*im[b]+ci*re[b],ar=re[a],ai=im[a];re[a]=ar+tr;im[a]=ai+ti;re[b]=ar-tr;im[b]=ai-ti;}}}
 if(inverse)for(let i=0,a=start;i<n;i++,a+=stride){re[a]/=n;im[a]/=n;}
}
function fft2(re,im,w,h,inverse=false){for(let y=0;y<h;y++)fftLine(re,im,y*w,1,w,inverse);for(let x=0;x<w;x++)fftLine(re,im,x,w,h,inverse);}
const pow2=n=>2**Math.ceil(Math.log2(n));
function kernelValue(dx,dy,gap,m){const r2=dx*dx+dy*dy+gap*gap;return 1e6/r2*Math.pow(gap/Math.sqrt(r2),m+1);}
function makeKernel(nx,ny,dx,dy,gap,angle){const w=pow2(2*nx),h=pow2(2*ny),re=new Float32Array(w*h),im=new Float32Array(w*h);const m=angularExponent(angle);
 for(let y=0;y<h;y++){let yy=(y<=h/2?y:y-h)*dy;for(let x=0;x<w;x++){let xx=(x<=w/2?x:x-w)*dx;re[y*w+x]=kernelValue(xx,yy,gap,m);}}
 fft2(re,im,w,h);return {re,im,w,h,m};}
function splat(a,w,nx,ny,x,y,v){const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;for(let j=0;j<2;j++)for(let i=0;i<2;i++){let xx=x0+i,yy=y0+j;if(xx>=0&&xx<nx&&yy>=0&&yy<ny)a[yy*w+xx]+=v*(i?fx:1-fx)*(j?fy:1-fy);}}
function rasterSources(s,leds,nx,ny,dx,dy){const w=pow2(2*nx),h=pow2(2*ny),src=[0,1,2].map(()=>new Float32Array(w*h)),mcd=[s.mcdR,s.mcdG,s.mcdB],chOff=[[-.23,-.14],[.23,-.14],[0,.24]];
 const aperture=s.aperture*(s.splitRGB?.43:1),samples=clamp(Math.ceil(aperture/Math.min(dx,dy)*2),3,24);
 for(const led of leds){const ca=Math.cos(led.angle),sa=Math.sin(led.angle);for(let c=0;c<3;c++){const I=mcd[c]*.001*led.rgb[c];if(!I)continue;let ox=s.splitRGB?chOff[c][0]*s.aperture:0,oy=s.splitRGB?chOff[c][1]*s.aperture:0;
  for(let j=0;j<samples;j++)for(let i=0;i<samples;i++){const lx=((i+.5)/samples-.5)*aperture+ox,ly=((j+.5)/samples-.5)*aperture+oy;const x=(led.x+lx*ca-ly*sa+s.width/2)/dx-.5,y=(led.y+lx*sa+ly*ca+s.height/2)/dy-.5;splat(src[c],w,nx,ny,x,y,I/(samples*samples));}
 }}return {src,w,h,samples};}
function gaussianBlur(a,nx,ny,sigmaX,sigmaY){
 let out=a;
 function pass(inp,n,sigma,horizontal){if(sigma<.15)return inp;const r=Math.min(Math.ceil(sigma*3),Math.max(nx,ny)*3),weights=new Float64Array(2*r+1);let sum=0;for(let i=-r;i<=r;i++){weights[i+r]=Math.exp(-.5*(i/sigma)**2);sum+=weights[i+r];}for(let i=0;i<weights.length;i++)weights[i]/=sum;const dst=new Float32Array(nx*ny);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){let v=0;const lo=Math.max(-r,horizontal?-x:-y),hi=Math.min(r,horizontal?nx-1-x:ny-1-y);for(let k=lo;k<=hi;k++)v+=inp[(horizontal?y:y+k)*nx+(horizontal?x+k:x)]*weights[k+r];dst[y*nx+x]=v;}return dst;}
 out=pass(out,nx,sigmaX,true);out=pass(out,ny,sigmaY,false);return out;
}
function getFilter(argb){const alpha=parseInt(argb.slice(1,3),16)/255,c=color('#'+argb.slice(3));return c.map(v=>(1-alpha)+alpha*srgbToLinear(v));}
function statistics(fields,mask,roiMask,nx,ny,dx,dy){const values=[],all=[];let min=Infinity,max=0,sum=0,sq=0;for(let i=0;i<mask.length;i++)if(mask[i]){let v=Math.max(0,fields[0][i]+fields[1][i]+fields[2][i]);all.push(v);if(roiMask[i])values.push(v);}
 const validROI=values.length>0;if(!validROI)for(const v of all)values.push(v);values.sort((a,b)=>a-b);for(const v of values){min=Math.min(min,v);max=Math.max(max,v);sum+=v;sq+=v*v;}
 const n=values.length,mean=n?sum/n:0,p5=n?values[Math.floor((n-1)*.05)]:0,p95=n?values[Math.floor((n-1)*.95)]:0;
 const profile=[];const row=Math.floor(ny/2);for(let x=0;x<nx;x++){let i=row*nx+x;profile.push(mask[i]?fields.map(c=>c[i]):null);}
 return {mean,min:n?min:0,max,p5,p95,robust:p95>1e-9?p5/p95:null,u0:mean>1e-9?min/mean:null,cv:mean>1e-9?Math.sqrt(Math.max(0,sq/n-mean*mean))/mean:null,n,validROI,area:all.length*dx*dy,profile};}
class Solver {
 constructor(){this.cache=null;this.kernel=null;}
 solve(input,options={}){
  const start=Date.now(),s=normalize(input),geo=makeLEDs(s),{leds}=geo,info=shapeInfo(s);
  const res=options.resolution||s.quality,step=Math.max(s.width,s.height)/res,nx=Math.max(16,Math.round(s.width/step)),ny=Math.max(16,Math.round(s.height/step)),dx=s.width/nx,dy=s.height/ny;
  const sourceKey=JSON.stringify([nx,ny,s.width,s.height,s.aperture,s.splitRGB,s.mcdR,s.mcdG,s.mcdB,leds]);
  let cache=this.cache;
  if(!cache||cache.key!==sourceKey){const ras=rasterSources(s,leds,nx,ny,dx,dy);const trans=ras.src.map(src=>{let re=new Float32Array(src),im=new Float32Array(src.length);fft2(re,im,ras.w,ras.h);return {re,im};});cache={key:sourceKey,...ras,trans};this.cache=cache;}
  const kk=JSON.stringify([nx,ny,dx,dy,s.gap,s.angle]);
  if(!this.kernel||this.kernel.key!==kk)this.kernel={key:kk,...makeKernel(nx,ny,dx,dy,s.gap,s.angle)};
  const ker=this.kernel,mask=new Uint8Array(nx*ny),roiMask=new Uint8Array(nx*ny);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){let xx=(x+.5)*dx-s.width/2,yy=(y+.5)*dy-s.height/2,i=y*nx+x;mask[i]=info.inside(xx,yy)?1:0;roiMask[i]=info.inside(xx,yy,s.roi)?1:0;}
  const filter=getFilter(s.argb),tau=s.transmission/100,haze=s.diffuse/100,sigma=s.thickness*s.spread;
  const fields=[],irradiance=[];
  for(let c=0;c<3;c++){
   const re=new Float32Array(ker.re.length),im=new Float32Array(re.length),t=cache.trans[c];
   for(let i=0;i<re.length;i++){re[i]=t.re[i]*ker.re[i]-t.im[i]*ker.im[i];im[i]=t.re[i]*ker.im[i]+t.im[i]*ker.re[i];}
   fft2(re,im,ker.w,ker.h,true);const E=new Float32Array(nx*ny);
   for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){let i=y*nx+x;E[i]=mask[i]?Math.max(0,re[y*ker.w+x]):0;}
   irradiance.push(E);
   const blurred=gaussianBlur(E,nx,ny,sigma/dx,sigma/dy),L=new Float32Array(nx*ny);
   for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*nx+x;if(mask[i]){const direct=cache.src[c][y*ker.w+x]*1e6/(dx*dy);L[i]=tau*filter[c]*(haze*blurred[i]/PI+(1-haze)*direct);}}
   fields.push(L);
  }
  const stats=statistics(fields,mask,roiMask,nx,ny,dx,dy),warnings=[];
  if(!stats.validROI)roiMask.set(mask);
  if(!leds.length)warnings.push('計算対象のLEDがありません。配置条件を調整するか、テープ配置をコピーしてください。');
  const threeMax=ledProfiles[s.ledModel]?.photometry.threeChannelMax;
  if(threeMax&&leds.some(led=>led.rgb.every(v=>v>0)&&Math.max(...led.rgb)>threeMax/100+1e-9))warnings.push(`参照SK6812-012ではRGB3色同時点灯は${threeMax}%灰階で使用します（資料p.3）。現在その条件を超えるLEDがあります。計算は入力値のままです。`);
  if(geo.discarded)warnings.push(s.layout==='manual'?`輪郭外のLED ${geo.discarded} 個は計算から除外しています。接続と座標は保持しているため、テープ全体を輪郭内に移動してください。`:`輪郭外または端に近いLED候補 ${geo.discarded} 個を除外しました。`);
  if(Math.max(dx,dy)>s.gap/2)warnings.push('距離に対して計算格子が粗い条件です。高精細にするか、形状を小さくして再確認してください。');
  if(s.diffuse<99&&Math.max(dx,dy)>s.aperture/2)warnings.push('直接透過するLED像は格子解像度の影響を受けます。高精細で確認してください。');
  if(!stats.validROI)warnings.push('指定した端の除外幅では評価領域が残らないため、全面で集計しました。');
  if(s.diffuse<95)warnings.push('低拡散材の見え方は簡易的な正面直視モデルです。屈折・視差・レンズ像は再現しません。');
  if(s.shape==='ring'||s.shape==='ellipse')warnings.push('楕円輪郭の評価領域は、長短半径を除外幅だけ縮小・拡大した近似です。');
  return {state:s,nx,ny,dx,dy,fields,irradiance,mask,roiMask,stats,leds,tapeLengths:geo.tapeLengths,pitch:geo.pitch,warnings,ms:Date.now()-start};
 }
}
function rgba(result,display={}){
 const s={...result.state,...display},n=result.nx*result.ny,out=new Uint8ClampedArray(n*4),filter=getFilter(s.argb),ex=Math.pow(2,s.exposure)/s.whiteLevel;
 const scale=s.heatMax||result.stats.p95||1;
 for(let i=0;i<n;i++){
  if(!result.mask[i])continue;
  const L=result.fields.map((f,c)=>f[i]+s.ambient*filter[c]*Y[c]/PI),lum=L[0]+L[1]+L[2];let rgb;
  if(s.view==='heat'){
   const v=clamp(lum/scale,0,1),stops=[[.04,.04,.15],[.10,.14,.46],[.0,.65,.68],[.75,.87,.25],[1,.33,.12]],p=v*4,j=Math.min(3,Math.floor(p)),t=p-j;rgb=stops[j].map((v,c)=>v*(1-t)+stops[j+1][c]*t);
  }else{rgb=L.map((v,c)=>{let x=Math.max(0,v/Y[c]*ex);return linearToSrgb(s.tone==='compress'?1-Math.exp(-x):Math.min(1,x));});}
  for(let c=0;c<3;c++)out[i*4+c]=clamp(rgb[c]*255,0,255);out[i*4+3]=255;
 }return out;
}
const api={defaults,ledProfiles,profileAperture,profileIntensity,selectLEDModel,ledDescription,luminousFlux,normalize,shapeInfo,svgGeometry,outline,parsePoints,makeLEDs,tapeLayout,tapeRanges,moveTape,ledColors,samplePath,color,hsv,Y,srgbToLinear,linearToSrgb,getFilter,fft2,makeKernel,kernelValue,rasterSources,gaussianBlur,statistics,Solver,rgba,clamp};
root.Optics=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
