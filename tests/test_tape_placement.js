'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js'),P=require('../src/tape-placement.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const state=extra=>O.normalize({shape:'rect',width:120,height:100,layout:'rows',density:100,rowSpacing:20,inset:6,ledModel:'custom',packageSize:2,aperture:1,tapeWidth:8,...extra});
const contour=points=>[{fillRule:'nonzero',contours:[points]}];
const U=[[0,0],[30,0],[30,70],[70,70],[70,0],[100,0],[100,100],[0,100]];
const C=[[0,0],[100,0],[100,25],[30,25],[30,75],[100,75],[100,100],[0,100]];
function groups(layout){let offset=0;return layout.tapeLengths.map(length=>{const out=layout.manual.slice(offset,offset+length);offset+=length;return out;});}
function everyGroupFits(s,layout){assert.equal(layout.tapeLengths.reduce((a,b)=>a+b,0),layout.manual.length);for(const tape of groups(layout))assert.ok(O.tapeFits(s,tape),JSON.stringify(tape));}

test('rectangle rows preserve pitch, row spacing, snake order and one connected group per row',()=>{
 const s=state(),out=P.generate(O,s);assert.deepEqual(out.tapeLengths,[11,11,11,11,11]);assert.equal(out.discarded,0);assert.equal(out.splitCount,0);near(out.pitch,10);
 groups(out).forEach((tape,j)=>{near(tape[0][1],(j-2)*20);near(tape[0][0],j%2?50:-50);for(let i=1;i<tape.length;i++)near(Math.hypot(tape[i][0]-tape[i-1][0],tape[i][1]-tape[i-1][1]),10);});everyGroupFits(s,out);
});
test('rectangle grid keeps the original snake connected through row-end vertical bridges',()=>{
 const s=state({layout:'grid'}),out=P.generate(O,s);assert.deepEqual(out.tapeLengths,[99]);assert.equal(out.splitCount,0);assert.equal(out.discarded,0);everyGroupFits(s,out);
 near(out.manual[10][0],50);near(out.manual[11][0],50);near(out.manual[11][1]-out.manual[10][1],10);
});
test('U cutout splits each interrupted row instead of bridging through the removed LEDs',()=>{
 const s=state({shape:'svg',svgShapes:contour(U)}),out=P.generate(O,s);assert.ok(out.discarded>0);assert.ok(out.splitCount>0);assert.ok(out.tapeLengths.length>5);everyGroupFits(s,out);
 for(const tape of groups(out))if(tape[0][1]<20)assert.ok(tape.every(p=>p[0]<-24)||tape.every(p=>p[0]>24));
});
test('a notch thinner than the LED pitch is detected between valid LEDs without deleting endpoints',()=>{
 const thinU=[[0,0],[49.9,0],[49.9,70],[50.1,70],[50.1,0],[100,0],[100,100],[0,100]],s=state({shape:'svg',width:100,height:60,svgShapes:contour(thinU),packageSize:1,tapeWidth:2,inset:5}),out=P.generate(O,s);
 assert.equal(out.discarded,0);assert.equal(out.splitCount,2);assert.deepEqual(out.tapeLengths,[5,5,5,5,10]);everyGroupFits(s,out);
});
test('C cutout in a grid never reconnects separated filtered rows across the notch',()=>{
 const s=state({shape:'svg',svgShapes:contour(C),layout:'grid'}),out=P.generate(O,s);assert.ok(out.discarded>0);assert.ok(out.splitCount>0);everyGroupFits(s,out);
 for(const tape of groups(out))for(let i=1;i<tape.length;i++)assert.ok(O.tapeFits(s,[tape[i-1],tape[i]]));
});
test('a small hole fully enclosed by a LED bridge still forces a split',()=>{
 const s=state({shape:'svg',width:100,height:60,tapeWidth:2,packageSize:1,inset:5,svgShapes:[{fillRule:'evenodd',contours:[[[0,0],[100,0],[100,100],[0,100]],[[49.9,49.9],[50.1,49.9],[50.1,50.1],[49.9,50.1]]]}]}),out=P.generate(O,s);
 assert.equal(out.discarded,0);assert.equal(out.splitCount,1);everyGroupFits(s,out);
});
test('perimeter uses a local SVG inset and retains both U arms rather than shrinking the whole bounding box',()=>{
 const s=state({shape:'svg',svgShapes:contour(U),layout:'perimeter',density:120}),out=P.generate(O,s);assert.ok(out.manual.length>20);everyGroupFits(s,out);
 assert.ok(out.manual.some(p=>p[0]<-30&&p[1]<-25));assert.ok(out.manual.some(p=>p[0]>30&&p[1]<-25));assert.ok(out.manual.some(p=>p[1]>30));
});
test('perimeter keeps disconnected SVG islands separate and avoids holes',()=>{
 const s=state({shape:'svg',layout:'perimeter',density:120,svgShapes:[{fillRule:'evenodd',contours:[[[0,0],[45,0],[45,100],[0,100]],[[10,30],[35,30],[35,70],[10,70]]]},{fillRule:'nonzero',contours:[[[60,0],[100,0],[100,100],[60,100]]]}]}),out=P.generate(O,s);
 assert.ok(out.tapeLengths.length>=2);everyGroupFits(s,out);for(const tape of groups(out))assert.ok(tape.every(p=>p[0]<0)||tape.every(p=>p[0]>0));
});
test('ring and standard perimeter remain a single connected tape on a roomy board',()=>{
 for(const layout of ['ring','perimeter'])for(const shape of ['rect','rounded','ellipse']){const s=state({layout,shape,inset:10}),out=P.generate(O,s);assert.equal(out.tapeLengths.length,1,`${layout}/${shape}`);assert.equal(out.splitCount,0,`${layout}/${shape}`);everyGroupFits(s,out);}
});
test('zero requested inset still leaves room for tape endcap corners on curved perimeters',()=>{
 for(const layout of ['ring','perimeter']){const s=state({layout,shape:'ellipse',inset:0}),out=P.generate(O,s);assert.ok(out.manual.length>10);assert.equal(out.tapeLengths.length,1);assert.equal(out.discarded,0);everyGroupFits(s,out);}
});
test('a user path crossing a cutout rejects atomically rather than splitting or dropping LED candidates',()=>{
 const s=state({shape:'svg',svgShapes:contour(U),layout:'path',path:'-45,-30\n45,-30'}),snapshot=structuredClone(s);
 assert.throws(()=>P.generate(O,s),/テープ経路全体/);assert.deepEqual(s,snapshot);
});
test('user paths check unsampled segments too and valid paths preserve pitch and original sequence',()=>{
 const s=state({layout:'path',density:1,path:'-40,0\n0,-49\n40,0'});assert.throws(()=>P.generate(O,s),/テープ経路全体/);
 const valid=state({layout:'path',path:'-40,10\n40,10'}),out=P.generate(O,valid);assert.deepEqual(out.tapeLengths,[9]);assert.equal(out.discarded,0);assert.equal(out.splitCount,0);out.manual.forEach((p,i)=>near(p[0],-40+i*10));everyGroupFits(valid,out);
});
test('explicit row count rejects any extra cuts needed by a notch and keeps inputs unchanged',()=>{
 const s=state({shape:'svg',svgShapes:contour(U),tapeCount:3}),snapshot=structuredClone(s);assert.throws(()=>P.generate(O,s),/指定本数.*本数を自動/);assert.deepEqual(s,snapshot);
 const good=state({tapeCount:3}),out=P.generate(O,good);assert.equal(out.tapeLengths.length,3);everyGroupFits(good,out);
});
test('rotation preserves order while invalid point and bridge footprints are split safely',()=>{
 const s=state({rotation:45}),out=P.generate(O,s);assert.ok(out.discarded>0);everyGroupFits(s,out);out.manual.forEach(p=>near(p[2],Math.PI/4));
});
test('LED and candidate ceilings reject high density rather than silently truncating connection data',()=>{
 assert.throws(()=>P.generate(O,state({width:1000,height:600,density:1000,rowSpacing:100})),/5,000/);
 assert.throws(()=>P.generate(O,state({width:1000,height:1000,density:1000,rowSpacing:1})),/配置候補|LED数が多すぎ/);
});
