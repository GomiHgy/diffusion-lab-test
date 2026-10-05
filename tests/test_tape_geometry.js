'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js'),T=require('../src/tape-geometry.js');
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const state=(values={})=>({...O.normalize({width:100,height:100,shape:'rect',ledModel:'custom',packageSize:2,...values}),tapeWidth:values.tapeWidth??4});
function svg(contours,other=[],fillRule='evenodd'){
 const convert=p=>p.map(([x,y])=>[x+50,y+50]);
 return state({shape:'svg',svgShapes:[{fillRule,contours:contours.map(convert)},...other.map(p=>({fillRule:'nonzero',contours:[convert(p)]}))]});
}
const fit=(s,p,c=0)=>T.contains(O,s,p,c);

test('footprints preserve all inputs and build rotated end caps, packages and bridges',()=>{
 const s=state({tapeWidth:8,packageSize:5}),points=[[-12,3,.4],[20,8,.4],[20,8,.4]],original=JSON.stringify([s,points]),f=T.footprints(s,points);
 assert.equal(f.tapes.length,4);assert.equal(f.packages.length,3);assert.equal(JSON.stringify([s,points]),original);
 const length=p=>Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]);
 assert.ok(Math.abs(length(f.tapes[0])-8)<1e-10);assert.ok(Math.abs(length(f.packages[0])-5)<1e-10);
 const edge=[f.packages[0][1][0]-f.packages[0][0][0],f.packages[0][1][1]-f.packages[0][0][1]];
 assert.ok(Math.abs(Math.atan2(edge[1],edge[0])-.4)<1e-10);
 const legacy={...s};delete legacy.tapeWidth;assert.ok(Math.abs(length(T.footprints(legacy,points).tapes[0])-7)<1e-10);
});

test('tape and package width are both enforced with exact boundary contact allowed',()=>{
 const s=state({tapeWidth:8});assert.equal(fit(s,[[46,0,0]]),true);assert.equal(fit(s,[[46.001,0,0]]),false);
 assert.equal(O.shapeInfo(s).inside(47,0,s.packageSize/2),true);assert.equal(fit(s,[[47,0,0]]),false);
 const widePackage=state({tapeWidth:2,packageSize:8});assert.equal(fit(widePackage,[[45,0,Math.PI/4]]),false);assert.equal(fit(widePackage,[[44,0,Math.PI/4]]),true);
 assert.equal(fit(s,[[44,0,0]],2),true);assert.equal(fit(s,[[44.001,0,0]],2),false);
});

test('a thin off-center SVG notch intersecting only the tape edge rejects the bridge',()=>{
 const outer=[[-50,-50],[50,-50],[50,50],[3.002,50],[3.002,1],[3,1],[3,50],[-50,50]],s=svg([outer]),points=[[-20,0,0],[20,0,0]];
 assert.ok(points.every(p=>O.shapeInfo(s).inside(p[0],p[1])));assert.equal(O.shapeInfo(s).inside(0,0),true);
 assert.equal(fit(s,points),false);assert.equal(fit(s,[[-20,-3,0],[20,-3,0]]),true);
});

test('a bridge cannot cover a thin hole even when every corner and its center is filled',()=>{
 const s=svg([rect(-50,-50,100,100),rect(3,.5,.002,.003)]),points=[[-20,0,0],[20,0,0]],bridge=T.footprints(s,points).tapes.at(-1);
 assert.ok(bridge.every(p=>O.shapeInfo(s).inside(...p)));assert.equal(O.shapeInfo(s).inside(0,0),true);
 assert.equal(fit(s,points),false);
});

test('a footprint exactly matching a hole is rejected while contact from the solid side is accepted',()=>{
 const s=svg([rect(-50,-50,100,100),rect(-2,-2,4,4)]);
 assert.equal(fit(s,[[0,0,0]]),false);assert.equal(fit(s,[[4,0,0]]),true);assert.equal(fit(s,[[3.99,0,0]]),false);
});

test('U and C concavities and disconnected SVG islands cannot be crossed by a connected tape',()=>{
 const u=[[-50,-50],[-30,-50],[-30,30],[30,30],[30,-50],[50,-50],[50,50],[-50,50]],c=[[-50,-50],[50,-50],[50,-30],[-30,-30],[-30,30],[50,30],[50,50],[-50,50]];
 for(const [s,points] of [[svg([u]),[[-40,-30,0],[40,-30,0]]],[svg([c]),[[30,-40,0],[30,40,0]]],[svg([rect(-40,-20,20,40)],[rect(20,-20,20,40)]),[[-30,0,0],[30,0,0]]]]){
  assert.ok(points.every(p=>O.shapeInfo(s).inside(p[0],p[1])));assert.equal(fit(s,points),false);
  assert.equal(fit(s,[points[0]]),true);assert.equal(fit(s,[points[1]]),true);
 }
});

test('SVG union seams do not reject a tape but actual union boundaries enforce clearance',()=>{
 const s=svg([rect(-40,-10,40,20)],[rect(-10,-10,50,20)]),points=[[-25,0,0],[25,0,0]];
 assert.equal(fit(s,points),true);assert.equal(fit(s,points,8),true);assert.equal(fit(s,points,8.01),false);
 const patchedHole=svg([rect(-50,-50,100,100),rect(-3,-3,6,6)],[rect(-4,-4,8,8)]);
 assert.equal(fit(patchedHole,[[-20,0,0],[20,0,0]]),true,'a second path fills the first path\'s hole');
 const windingFilled=svg([rect(-50,-50,100,100),rect(-3,-3,6,6)],[],'nonzero');
 assert.equal(fit(windingFilled,[[-20,0,0],[20,0,0]]),true,'same-direction nonzero contours do not make a hole');
});

test('an explicitly closed tape also validates the final bridge back to its first LED',()=>{
 const s=svg([rect(-50,-50,100,100),rect(0,-20,10,40)]),points=[[-20,-30,0],[20,-30,0],[20,30,0]];
 assert.equal(fit(s,points),true);assert.equal(fit(s,[...points,points[0]]),false);
});

test('polygon contour containment catches a thin concavity without sparse sampling',()=>{
 const p=[[-50,-50],[50,-50],[50,50],[3.002,50],[3.002,1],[3,1],[3,50],[-50,50]],s=state({shape:'polygon',polygon:p.map(q=>q.map(v=>v+50).join(',')).join('\n')});
 assert.equal(fit(s,[[-20,0,0],[20,0,0]]),false);assert.equal(fit(s,[[-20,-3,0],[20,-3,0]]),true);
 const rectangular=state({shape:'polygon',polygon:'0,0\n100,0\n100,100\n0,100',tapeWidth:8});
 assert.equal(fit(rectangular,[[46,0,0]]),true);assert.equal(fit(rectangular,[[44,0,0]],2),true);assert.equal(fit(rectangular,[[44.01,0,0]],2),false);
});

test('convex rounded and ellipse shapes check the complete rotated footprint',()=>{
 const rounded=state({shape:'rounded',radius:20,tapeWidth:8});assert.equal(fit(rounded,[[38,38,0]]),true);assert.equal(fit(rounded,[[42,42,0]]),false);
 const ellipse=state({shape:'ellipse',tapeWidth:8});assert.equal(fit(ellipse,[[45,0,0]]),true);assert.equal(fit(ellipse,[[45,0,Math.PI/4]]),false);
 assert.equal(fit(ellipse,[[-25,0,0],[25,0,0]],5),true);assert.equal(fit(ellipse,[[45,0,0]],5),false);
});

test('ring hole intersection is analytic for bridges, contained holes and rotated corners',()=>{
 const ring=state({shape:'ring',hole:.6,tapeWidth:8});
 assert.equal(fit(ring,[[34,0,0]]),true);assert.equal(fit(ring,[[34,0,Math.PI/4]]),false);
 assert.equal(fit(ring,[[-40,0,0],[40,0,0]]),false);assert.equal(fit(ring,[[0,0,0]]),false);
 assert.equal(fit(ring,[[36,0,0]],2),true);assert.equal(fit(ring,[[36,0,0]],2.01),false);
 const thinHole=state({shape:'ring',hole:.05,tapeWidth:8});assert.equal(fit(thinHole,[[-20,0,0],[20,0,0]]),false);
});

test('geometry caches immutable shape boundaries and invalidates on contour edits',()=>{
 const s=svg([rect(-50,-50,100,100),rect(3,.5,2,2)]),a=T.geometry(O,s),original=JSON.stringify(s),points=[[-20,0,.1],[20,0,.1]];
 assert.equal(T.geometry(O,s),a);fit(s,points);assert.equal(JSON.stringify(s),original);
 const next={...s,width:120};assert.notEqual(T.geometry(O,next),a);assert.equal(T.geometry(O,next),T.geometry(O,next));
});

test('invalid coordinates and clearances fail closed and empty valid tapes are harmless',()=>{
 const s=state();assert.equal(fit(s,[]),true);
 for(const points of [null,[[NaN,0]],[[0,Infinity]],[[0,0,NaN]],[[0]],['bad']])assert.equal(fit(s,points),false);
 for(const clearance of [-1,NaN,Infinity])assert.equal(fit(s,[[0,0,0]],clearance),false);
 assert.equal(fit({...s,tapeWidth:-2},[[0,0,0]]),false);assert.equal(fit({...s,shape:'svg',svgShapes:[]},[[0,0,0]]),false);
});
