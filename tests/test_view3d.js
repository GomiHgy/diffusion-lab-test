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
