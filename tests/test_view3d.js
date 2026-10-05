'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js'),V=require('../src/view3d.js');
const signedArea=p=>p.reduce((v,a,i)=>{const b=p[(i+1)%p.length];return v+a[0]*b[1]-a[1]*b[0];},0)/2;

test('3D camera fits physical extrema at desktop and mobile dimensions',()=>{
 for(const [width,height] of [[280,280],[640,355]])for(const [w,h,gap,t] of [[160,72,10,3],[2000,10,300,30],[10,2000,.25,.1],[10,10,300,30]])for(const [yaw,pitch] of [[-25,55],[170,8],[-90,82]]){
  const s=O.normalize({width:w,height:h,gap,thickness:t}),c=V.createCamera(s,{width,height,yaw,pitch});
  for(const x of [-w/2,w/2])for(const y of [-h/2,h/2])for(const z of [-2.2,gap+t]){
   const p=c.project(x,y,z);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.perspective>0);
   assert.ok(p.x>=27.99&&p.x<=width-27.99,`horizontal fit ${w}×${h}`);assert.ok(p.y>=24.99&&p.y<=height-36.99,`vertical fit ${w}×${h}`);
  }
 }
});
test('physical gap and thickness produce separate, depth-ordered planes',()=>{
 const s=O.normalize(),c=V.createCamera(s),base=c.project(0,0,0),underside=c.project(0,0,s.gap),front=c.project(0,0,s.gap+s.thickness);
 assert.ok(base.y>underside.y&&underside.y>front.y);assert.ok(base.depth<underside.depth&&underside.depth<front.depth);
 assert.ok(Math.hypot(front.x-underside.x,front.y-underside.y)>0);
});
test('zoom changes magnification while preserving physical coordinates and camera depth',()=>{
 const s=O.normalize(),a=V.createCamera(s,{zoom:1}),b=V.createCamera(s,{zoom:2}),p=a.project(33,-14,7),q=b.project(33,-14,7);
 assert.equal(b.scale,a.scale*2);assert.equal(p.depth,q.depth);assert.equal(p.perspective,q.perspective);
 assert.equal(s.gap,10);assert.equal(s.width,160);
});
test('ring geometry retains a reversed inner wall instead of filling its hole',()=>{
 const s=O.normalize({shape:'ring',hole:.6}),g=V.geometry(s,O);
 assert.equal(g.loops.length,2);assert.ok(signedArea(g.loops[0])>0);assert.ok(signedArea(g.loops[1])<0);
 assert.ok(Math.abs(Math.abs(signedArea(g.loops[1]))/signedArea(g.loops[0])-.36)<1e-10);
 assert.equal(g.boundary.length,g.loops[0].length+g.loops[1].length);
});
test('SVG 3D walls use the union boundary, holes, and separate islands',()=>{
 const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
 const s=O.normalize({shape:'svg',svgShapes:[{fillRule:'evenodd',contours:[rect(0,0,70,100),rect(20,20,15,30)]},{fillRule:'nonzero',contours:[rect(60,0,10,100)]},{fillRule:'nonzero',contours:[rect(90,20,10,40)]}]}),g=V.geometry(s,O),source=O.svgGeometry(s);
 assert.deepEqual(g.boundary,source.boundary);assert.equal(g.loops.length,3);
 assert.ok(g.loops.some(p=>signedArea(p)<0));
 // 内部の重なりの辺を板の側面として追加しない。
 assert.ok(!g.boundary.some(([a,b])=>a[0]===s.width*.1&&b[0]===s.width*.1));
});
test('all supported standard contours yield finite closed 3D geometry',()=>{
 for(const shape of ['rect','rounded','ellipse','polygon']){
  const s=O.normalize({shape}),g=V.geometry(s,O);assert.ok(g.boundary.length>=3);assert.equal(g.loops.length,1);
  assert.ok(g.boundary.flat(2).every(Number.isFinite));assert.ok(signedArea(g.loops[0])>0);
  assert.deepEqual(g.boundary.at(-1)[1],g.boundary[0][0]);
 }
});


test('mounted layers touch the support while preserving the optical gap reference',()=>{
 for(const [gap,thickness] of [[.25,.1],[10,3],[300,30]]){
  const s=O.normalize({gap,thickness}),h=V.layerHeights(s);
  assert.equal(h.tapeBottom,h.baseTop,'no air gap below the tape');
  assert.equal(h.packageBottom,h.tapeTop,'LED package rests on the tape PCB');
  assert.equal(h.packageTop,h.emission,'the light aperture is flush with the package top');
  assert.equal(h.emission,0);assert.equal(h.plateBottom-h.emission,gap);
  assert.ok(Math.abs(h.plateTop-h.plateBottom-thickness)<1e-10);
  assert.ok(h.baseBottom<h.baseTop&&h.tapeBottom<h.tapeTop&&h.packageBottom<h.packageTop);
 }
});

test('a single LED has a supporting tape footprint and its package keeps its rotation',()=>{
 const s=O.normalize(),angle=37*Math.PI/180,led={x:13,y:-6,angle,tapeIndex:0,rgb:[.2,.1,.05]},g=V.mountedTapeGeometry({state:s,leds:[led]});
 assert.equal(g.tapes.length,1);assert.equal(g.packages.length,1);
 const tape=g.tapes[0],pack=g.packages[0],edge=[pack.polygon[1][0]-pack.polygon[0][0],pack.polygon[1][1]-pack.polygon[0][1]];
 assert.ok(Math.abs(Math.hypot(...edge)-s.packageSize)<1e-10);
 assert.ok(Math.abs(Math.atan2(edge[1],edge[0])-angle)<1e-10);
 for(const part of [tape,pack]){
  assert.ok(Math.abs(part.polygon.reduce((n,p)=>n+p[0],0)/4-led.x)<1e-10);
  assert.ok(Math.abs(part.polygon.reduce((n,p)=>n+p[1],0)/4-led.y)<1e-10);
 }
 for(const p of pack.polygon){
  const dx=p[0]-led.x,dy=p[1]-led.y,localX=dx*Math.cos(angle)+dy*Math.sin(angle),localY=-dx*Math.sin(angle)+dy*Math.cos(angle);
  assert.ok(Math.abs(localX)<(s.packageSize+2)/2&&Math.abs(localY)<(s.packageSize+2)/2,'package stays within its tape footprint');
 }
 assert.equal(tape.bottom,g.layers.baseTop);assert.equal(pack.bottom,tape.top);
});

test('tape PCB bridges remain within their connected group and reach both LED centers',()=>{
 const s=O.normalize(),leds=[{x:-30,y:-8,angle:.3,index:0,tapeIndex:0},{x:10,y:5,angle:.3,index:1,tapeIndex:0},{x:25,y:20,angle:1,index:2,tapeIndex:1}],g=V.mountedTapeGeometry({state:s,leds});
 const bridges=g.tapes.filter(p=>p.ledIndices.length===2);
 assert.equal(bridges.length,1);assert.deepEqual(bridges[0].ledIndices,[0,1]);assert.equal(bridges[0].tapeIndex,0);
 const bridge=bridges[0].polygon;
 for(const [a,b,led] of [[bridge[0],bridge[1],leds[0]],[bridge[2],bridge[3],leds[1]]]){
  assert.ok(Math.abs((a[0]+b[0])/2-led.x)<1e-10);assert.ok(Math.abs((a[1]+b[1])/2-led.y)<1e-10);
  assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-(s.packageSize+2))<1e-10);
 }
 assert.ok(g.tapes.every(p=>p.bottom===g.layers.baseTop&&p.top===g.layers.packageBottom));
 assert.deepEqual(g.packages.map(p=>p.led),leds);
});

test('render retains hole clipping and omits mounted tape faces when showLED is disabled',()=>{
 function context(){
  const clips=[],fills=[],ctx={clips,fills,measureText:s=>({width:s.length*6}),clip:rule=>clips.push(rule),fill:rule=>fills.push(rule)};
  for(const name of ['save','restore','clearRect','beginPath','moveTo','lineTo','closePath','stroke','rect','fillRect','fillText','transform','drawImage'])ctx[name]=()=>{};
  return ctx;
 }
 const state=O.normalize({shape:'ring'}),led={x:65,y:0,angle:.2,tapeIndex:0,rgb:[.2,0,.1]},result={state,leds:[led]};
 const hiddenCtx=context(),shownCtx=context(),options={width:640,height:355,optics:O,showGrid:false};
 const hidden=V.render(hiddenCtx,result,{...options,showLED:false}),shown=V.render(shownCtx,result,{...options,showLED:true});
 assert.ok(shown.surfaces>hidden.surfaces,'showLED adds mounted PCB and package faces');
 assert.deepEqual(shown.layers,V.layerHeights(state));assert.deepEqual(hidden.layers,shown.layers);
 assert.deepEqual(hiddenCtx.clips,['evenodd','evenodd']);assert.deepEqual(shownCtx.clips,hiddenCtx.clips);
 assert.equal(shownCtx.fills[0],'evenodd','support retains the ring hole');
});
