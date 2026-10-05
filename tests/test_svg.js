'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../src/svg-import.js'),O=require('../src/optics.js');
const square=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const state=shapes=>O.normalize({shape:'svg',width:100,height:100,quality:160,svgShapes:shapes});
test('All standard path commands, relative coordinates and repeated arguments are parsed',()=>{
 const d='m1 2 3 4 h5 v6 l1 2 c1 2 3 4 5 6 s1 2 3 4 q1 2 3 4 t5 6 a7 8 30 0 1 9 10 z';
 const paths=S.splitPath(d);assert.equal(paths.length,1);assert.equal(paths[0].closed,true);assert.equal(paths[0].commands[0],'M 1 2');assert.equal(paths[0].commands[1],'l 3 4');assert.equal(paths[0].commands.at(-1),'Z');
});
test('Relative subpaths preserve the global current position after close',()=>{
 const p=S.splitPath('M10 20h30v40z m5 6 l10 0z m-2 -3h5v5z');assert.equal(p[1].commands[0],'M 15 26');assert.equal(p[2].commands[0],'M 13 23');
});
test('A new subpath after close without moveto starts at the previous start point',()=>{
 const p=S.splitPath('M10 20h30v40z l10 10v-10z');assert.equal(p.length,2);assert.equal(p[1].commands[0],'M 10 20');
});
test('Exponents, adjacent signed values and compact arc flags follow SVG syntax',()=>{
 const p=S.splitPath('M1e1-2e1 A5 5 0 0110 10 L.5.6Z');assert.equal(p[0].commands[0],'M 10 -20');assert.equal(p[0].commands[1],'A 5 5 0 0 1 10 10');assert.equal(p[0].commands[2],'L 0.5 0.6');
});
test('Malformed commands and incomplete data fail instead of importing a partial path',()=>{
 for(const d of ['','L0 0','M0 0L10','M0 0 X1 2','M0,,0','M0 0 A5 5 0 2 0 1 2','M0 0 A-5 5 0 0 1 1 2','M0 0L1e999 0','M0 0,'])assert.throws(()=>S.splitPath(d));
 assert.throws(()=>S.splitPath('M0 0'+'L1 1'.repeat(1024)),/複雑/);
});
test('SVG transform order includes nested groups and reflection',()=>{
 assert.deepEqual(S.transform('translate(10,20) scale(2,-3)'),[2,0,0,-3,10,20]);assert.deepEqual(S.transform('matrix(1 0 0 1 3 4)'),[1,0,0,1,3,4]);
 const r=S.transform('rotate(90,10,20)'),p=[r[0]*10+r[2]*20+r[4],r[1]*10+r[3]*20+r[5]];assert.ok(Math.abs(p[0]-10)<1e-9&&Math.abs(p[1]-20)<1e-9);
 assert.ok(Math.abs(S.transform('skewX(45)')[2]-1)<1e-9);assert.ok(Math.abs(S.transform('skewY(45)')[1]-1)<1e-9);assert.throws(()=>S.transform('scale(1,2,3)'));assert.throws(()=>S.transform('bogus(1)'));
});
test('Evenodd holes, nonzero filled centers and reverse-winding holes are distinct',()=>{
 const outer=square(0,0,100,100),inner=square(30,30,40,40);
 const even=O.shapeInfo(state([{fillRule:'evenodd',contours:[outer,inner]}]));assert.equal(even.inside(0,0),false);assert.equal(even.inside(-30,0),true);assert.equal(even.inside(-21,0,2),false);
 const nonzero=O.shapeInfo(state([{fillRule:'nonzero',contours:[outer,inner]}]));assert.equal(nonzero.inside(0,0,5),true);assert.equal(nonzero.inside(-21,0,5),true);assert.equal(nonzero.boundary.length,4);
 const reversed=O.shapeInfo(state([{fillRule:'nonzero',contours:[outer,inner.slice().reverse()]}]));assert.equal(reversed.inside(0,0),false);
});
test('Overlapping paths are a union and interior seams do not erode the ROI',()=>{
 const info=O.shapeInfo(state([{fillRule:'evenodd',contours:[square(0,0,60,100)]},{fillRule:'evenodd',contours:[square(40,0,60,100)]}]));
 assert.equal(info.inside(0,0,10),true);assert.equal(info.inside(10,0,10),true);assert.equal(info.inside(-10,0,10),true);assert.equal(info.inside(49,0,2),false);
 assert.equal(info.loops.length,1);
 const g=O.makeLEDs(O.normalize({...state([{fillRule:'evenodd',contours:[square(0,0,60,100)]},{fillRule:'evenodd',contours:[square(40,0,60,100)]}]),layout:'perimeter',inset:8,density:100}));assert.equal(g.tapeLengths.length,1);
});
test('Duplicate paths retain the union; disconnected outlines leave the middle empty',()=>{
 const full={fillRule:'nonzero',contours:[square(0,0,100,100)]},dup=O.shapeInfo(state([full,full]));assert.equal(dup.inside(0,0,5),true);assert.equal(dup.boundary.length,4);assert.equal(dup.loops.length,1);
 const info=O.shapeInfo(state([{fillRule:'nonzero',contours:[square(0,0,30,100)]},{fillRule:'nonzero',contours:[square(70,0,30,100)]}]));assert.equal(info.inside(0,0),false);assert.equal(info.inside(-35,0),true);assert.equal(info.inside(35,0),true);assert.equal(info.loops.length,2);
});
test('Self-intersections have a usable boundary rather than a zero signed-area rejection',()=>{
 const info=O.shapeInfo(state([{fillRule:'evenodd',contours:[[[0,0],[100,100],[0,100],[100,0]]]}]));assert.equal(info.inside(0,-30),true);assert.equal(info.inside(-30,0),false);
 assert.equal(info.loops.length,2);
});
test('Invalid stored geometry is rejected without sanitizing away holes or vertices',()=>{
 for(const svgShapes of [null,[{fillRule:'bad',contours:[square(0,0,100,100)]}],[{fillRule:'nonzero',contours:[[[0,0],[100,0]]]}],[{fillRule:'nonzero',contours:[[[0,0],[101,0],[0,100]]]}]])assert.throws(()=>O.normalize({svgShapes}));
 assert.throws(()=>O.shapeInfo(O.normalize({shape:'svg'})),/読み込み/);
 assert.throws(()=>O.shapeInfo(state([{fillRule:'evenodd',contours:[square(0,0,100,100),square(0,0,100,100)]}])),/塗り領域/);
});
test('Solver, LED placement and tape movement honor SVG holes',()=>{
 const s=state([{fillRule:'evenodd',contours:[square(0,0,100,100),square(30,30,40,40)]}]);
 const r=new O.Solver().solve({...s,layout:'grid',density:100,inset:5});const i=Math.floor(r.ny/2)*r.nx+Math.floor(r.nx/2);assert.equal(r.mask[i],0);assert.ok(r.fields.every(f=>f[i]===0));assert.ok(r.leds.every(p=>Math.abs(p.x)>20||Math.abs(p.y)>20));
 const layout={manual:[[-35,-5,0],[-35,5,0]],tapeLengths:[2]};assert.throws(()=>O.moveTape(s,layout,0,0,-5),/輪郭内/);assert.equal(O.moveTape(s,layout,0,-30,-5).manual[0][0],-30);
});
test('SVG geometry survives JSON round trip and changes physical size independently',()=>{
 const s=state([{fillRule:'evenodd',contours:[square(0,0,100,100),square(30,30,40,40)]}]);const restored=O.normalize(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored.svgShapes,s.svgShapes);
 const resized=O.shapeInfo(O.normalize({...s,width:200,height:60}));assert.equal(resized.inside(0,0),false);assert.equal(resized.inside(-50,0),true);assert.equal(resized.inside(101,0),false);
});
