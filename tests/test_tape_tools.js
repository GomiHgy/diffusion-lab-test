'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js'),T=require('../src/tape-tools.js');
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-9,message||`${a} != ${b}`);
const s=O.normalize({shape:'rect',width:120,height:100,inset:8,ledModel:'custom',packageSize:2,aperture:1,layout:'manual'});
const make=()=>({manual:[[-25,-12,0],[-10,-12,Math.PI/12],[5,-12,-Math.PI/12],[25,20,0],[35,20,0]],tapeLengths:[3,2]});
const centroid=ps=>[ps.reduce((v,p)=>v+p[0],0)/ps.length,ps.reduce((v,p)=>v+p[1],0)/ps.length];
const distances=ps=>ps.flatMap((a,i)=>ps.slice(i+1).map(b=>Math.hypot(a[0]-b[0],a[1]-b[1])));

test('tape rotation preserves centroid, every pair distance, and the other tape',()=>{
 const original=make(),snapshot=structuredClone(original),before=original.manual.slice(0,3),rotated=T.rotate(O,s,original,0,90),after=rotated.manual.slice(0,3);
 const [cx,cy]=centroid(after);near(cx,-10);near(cy,-12);distances(after).forEach((v,i)=>near(v,distances(before)[i]));
 near(after[0][0],-10);near(after[0][1],-27);near(after[2][0],-10);near(after[2][1],3);
 after.forEach((p,i)=>near(p[2]-before[i][2],Math.PI/2));assert.deepEqual(rotated.manual.slice(3),original.manual.slice(3));assert.deepEqual(rotated.tapeLengths,[3,2]);assert.deepEqual(original,snapshot);
});
test('angle is absolute while local path tangent offsets remain intact',()=>{
 const original=make(),once=T.rotate(O,s,original,0,40),twice=T.rotate(O,s,once,0,-20),direct=T.rotate(O,s,original,0,-20);
 near(T.rotation(O,twice,0),-20);twice.manual.forEach((p,i)=>p.forEach((v,k)=>near(v,direct.manual[i][k])));
 near(twice.manual[1][2]-twice.manual[0][2],Math.PI/12);
});
test('rotation rejects invalid angles and outside positions atomically',()=>{
 const board=O.normalize({...s,width:100,height:20}),layout={manual:[[-30,0,0],[0,0,0],[30,0,0]],tapeLengths:[3]},snapshot=structuredClone(layout);
 assert.throws(()=>T.rotate(O,board,layout,0,90),/輪郭内/);assert.throws(()=>T.rotate(O,board,layout,0,NaN),/数値/);assert.throws(()=>T.rotate(O,board,layout,4,0),/選択/);assert.deepEqual(layout,snapshot);
});
test('alignment provides all six directions including vertical center',()=>{
 const expected={left:['x0',-52],right:['x1',52],top:['y0',-42],bottom:['y1',42]};
 for(const mode of ['left','right','centerX','top','bottom','centerY']){
  const layout=make(),aligned=T.align(O,s,layout,[1],mode),b=T.bounds(O,s,aligned,[1]);
  if(expected[mode])near(b[expected[mode][0]],expected[mode][1]);else if(mode==='centerX')near((b.x0+b.x1)/2,0);else near((b.y0+b.y1)/2,0);
  assert.deepEqual(aligned.manual.slice(0,3),layout.manual.slice(0,3));near(Math.hypot(aligned.manual[4][0]-aligned.manual[3][0],aligned.manual[4][1]-aligned.manual[3][1]),10);
  assert.deepEqual(layout,make());
 }
});
test('all-tape alignment translates the assembly without collapsing relative positions',()=>{
 const layout=make(),aligned=T.align(O,s,layout,null,'centerY'),delta=aligned.manual[0][1]-layout.manual[0][1],b=T.bounds(O,s,aligned);
 near((b.y0+b.y1)/2,0);aligned.manual.forEach((p,i)=>{near(p[0],layout.manual[i][0]);near(p[1]-layout.manual[i][1],delta);near(p[2],layout.manual[i][2]);});assert.deepEqual(aligned.tapeLengths,[3,2]);
});
test('bounds include the wider rotated tape rather than only the smaller package',()=>{
 const layout={manual:[[10,20,Math.PI/4]],tapeLengths:[1]},b=T.bounds(O,s,layout);
 near(b.x0,10-4*Math.sqrt(2));near(b.x1,10+4*Math.sqrt(2));near(b.y0,20-4*Math.sqrt(2));near(b.y1,20+4*Math.sqrt(2));
});
test('alignment into a ring hole fails without partially changing the tape',()=>{
 const board=O.normalize({...s,shape:'ring',width:100,height:100,hole:.5}),layout={manual:[[35,-4,0],[35,4,0]],tapeLengths:[2]},snapshot=structuredClone(layout);
 assert.throws(()=>T.align(O,board,layout,[0],'centerX'),/輪郭内/);assert.deepEqual(layout,snapshot);
 assert.throws(()=>T.align(O,board,layout,[],'left'),/選択/);assert.throws(()=>T.align(O,board,layout,[0],'unknown'),/方向/);
});
test('increasing tape count duplicates the selected tape rigidly and preserves existing tapes',()=>{
 const layout=make(),snapshot=structuredClone(layout),out=T.resize(O,s,layout,4,0);
 assert.deepEqual(out.tapeLengths,[3,2,3,3]);assert.deepEqual(out.manual.slice(0,5),layout.manual);assert.deepEqual(layout,snapshot);
 for(const t of O.tapeRanges(out).slice(2)){
  const ps=out.manual.slice(t.start,t.start+t.length),original=layout.manual.slice(0,3),dx=ps[0][0]-original[0][0],dy=ps[0][1]-original[0][1];
  ps.forEach((p,i)=>{near(p[0]-original[i][0],dx);near(p[1]-original[i][1],dy);near(p[2],original[i][2]);});T.validate(O,s,{manual:ps,tapeLengths:[3]});
 }
 const bs=O.tapeRanges(out).map(t=>T.bounds(O,s,out,[t.index]));for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++)assert.ok(bs[i].x1<=bs[j].x0||bs[j].x1<=bs[i].x0||bs[i].y1<=bs[j].y0||bs[j].y1<=bs[i].y0);
});
test('decreasing tape count removes trailing whole tapes and zero clears all',()=>{
 const layout=make(),one=T.resize(O,s,layout,1),empty=T.resize(O,s,layout,0);
 assert.deepEqual(one,{manual:layout.manual.slice(0,3),tapeLengths:[3]});assert.deepEqual(empty,{manual:[],tapeLengths:[]});assert.deepEqual(layout,make());
 const same=T.resize(O,s,layout,2);same.manual[0][0]=999;assert.equal(layout.manual[0][0],-25);
});
test('empty layout can create a new connected tape from current board and density',()=>{
 const board=O.normalize({...s,width:100,height:60,density:60}),out=T.resize(O,board,{manual:[],tapeLengths:[]},2);
 assert.equal(out.tapeLengths.length,2);assert.ok(out.tapeLengths.every(n=>n>1));T.validate(O,board,out);
 for(const t of O.tapeRanges(out))for(let i=t.start+1;i<t.start+t.length;i++)near(Math.hypot(out.manual[i][0]-out.manual[i-1][0],out.manual[i][1]-out.manual[i-1][1]),1000/60);
});
test('empty U-shaped layout selects one legal central-row group before duplicating whole tapes',()=>{
 const board=O.normalize({...s,shape:'svg',width:120,height:100,density:100,inset:6,tapeWidth:8,svgShapes:[{fillRule:'nonzero',contours:[[[0,0],[30,0],[30,70],[70,70],[70,0],[100,0],[100,100],[0,100]]]}]}),empty={manual:[],tapeLengths:[]},snapshot=structuredClone([board,empty]);
 const center=O.tapeLayout({...board,layout:'rows',tapeCount:0,rowSpacing:board.height*2,rotation:0});assert.equal(center.tapeLengths.length,2);
 const one=T.resize(O,board,empty,1);assert.deepEqual(one.manual,center.manual.slice(0,center.tapeLengths[0]));assert.deepEqual(one.tapeLengths,[center.tapeLengths[0]]);T.validate(O,board,one);
 assert.ok(one.manual.every(p=>p[0]<0&&p[1]===0));
 const two=T.resize(O,board,empty,2);assert.equal(two.tapeLengths.length,2);assert.deepEqual(two.manual.slice(0,one.manual.length),one.manual);T.validate(O,board,two);
 const clone=two.manual.slice(one.manual.length),dx=clone[0][0]-one.manual[0][0],dy=clone[0][1]-one.manual[0][1];clone.forEach((p,i)=>{near(p[0]-one.manual[i][0],dx);near(p[1]-one.manual[i][1],dy);near(p[2],one.manual[i][2]);});assert.deepEqual([board,empty],snapshot);
});
test('empty disconnected SVG layout falls back to normal rows when the central row is blank',()=>{
 const board=O.normalize({...s,shape:'svg',width:120,height:100,density:100,inset:6,tapeWidth:8,rowSpacing:20,svgShapes:[{fillRule:'nonzero',contours:[[[0,0],[35,0],[35,30],[0,30]]]},{fillRule:'nonzero',contours:[[[65,70],[100,70],[100,100],[65,100]]]}]}),empty={manual:[],tapeLengths:[]},snapshot=structuredClone(empty);
 assert.equal(O.tapeLayout({...board,layout:'rows',tapeCount:0,rowSpacing:board.height*2,rotation:0}).manual.length,0);
 const fallback=O.tapeLayout({...board,layout:'rows',tapeCount:0,rotation:0}),out=T.resize(O,board,empty,1);assert.ok(fallback.tapeLengths.length>1);
 assert.deepEqual(out.manual,fallback.manual.slice(0,fallback.tapeLengths[0]));assert.deepEqual(out.tapeLengths,[fallback.tapeLengths[0]]);T.validate(O,board,out);assert.ok(out.manual.every(p=>p[0]<0&&p[1]<0));assert.deepEqual(empty,snapshot);
});
test('empty layout with no room for the tape width fails without inserting partial data',()=>{
 const board=O.normalize({...s,shape:'svg',width:100,height:100,tapeWidth:8,density:100,svgShapes:[{fillRule:'nonzero',contours:[[[0,0],[3,0],[3,100],[0,100]]]},{fillRule:'nonzero',contours:[[[97,0],[100,0],[100,100],[97,100]]]}]}),empty={manual:[],tapeLengths:[]};
 assert.throws(()=>T.resize(O,board,empty,1),/輪郭内に新しいテープ/);assert.deepEqual(empty,{manual:[],tapeLengths:[]});
});
test('count overflow and insufficient space fail atomically after attempted placement',()=>{
 const board=O.normalize({...s,width:12,height:12}),layout={manual:[[0,0,0]],tapeLengths:[1]},snapshot=structuredClone(layout);
 assert.throws(()=>T.resize(O,board,layout,100),/配置できません/);assert.deepEqual(layout,snapshot);
 for(const count of [-1,101,1.5,NaN])assert.throws(()=>T.resize(O,board,layout,count),/整数/);
});
test('LED ceiling counts existing heterogeneous tapes plus proposed duplicates',()=>{
 const layout={manual:[...Array.from({length:4999},()=>[0,0,0]),[20,20,0]],tapeLengths:[4999,1]},snapshot=structuredClone(layout);
 assert.throws(()=>T.resize(O,s,layout,3,1),/5,000/);assert.deepEqual(layout,snapshot);
});
