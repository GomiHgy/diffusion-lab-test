'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/gaming.js');
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function frame(value){return {nx:2,ny:1,state:{gamingScene:'rainbowWave',gamingPhase:value/10},fields:[0,1,2].map(c=>new Float32Array([value+c,value*2+c])),irradiance:[0,1,2].map(c=>new Float32Array([value*3+c,value*4+c])),leds:[{x:0,y:0,angle:0,index:0,tapeIndex:0,rgb:[value,value+1,value+2]}],mask:new Uint8Array([1,0]),stats:{mean:value}};}

test('four gaming scenes expose positive periods and distinct names',()=>{
 assert.deepEqual(Object.keys(G.scenes),['rainbowWave','chase','breathe','cyberPulse']);assert.equal(new Set(Object.values(G.scenes).map(s=>s.label)).size,4);Object.values(G.scenes).forEach(s=>assert.ok(s.period>0&&Number.isFinite(s.period)));
});
test('all moving RGB scenes repeat each cycle including negative phases',()=>{
 for(const gamingScene of Object.keys(G.scenes)){
  const base={gamingScene,brightness:37,pwmMode:'raw'},a=G.colors({...base,gamingPhase:.173},17),b=G.colors({...base,gamingPhase:1.173},17),c=G.colors({...base,gamingPhase:-.827},17);
  a.forEach((rgb,i)=>rgb.forEach((v,k)=>{near(v,b[i][k]);near(v,c[i][k]);}));assert.notDeepEqual(a,G.colors({...base,gamingPhase:.673},17));
 }
});
test('gaming PWM remains within brightness limit for every scene and both PWM modes',()=>{
 for(const gamingScene of Object.keys(G.scenes))for(const pwmMode of ['raw','srgb'])for(const brightness of [0,20,100])for(const gamingPhase of [0,.125,.5,.9]){
  const c=G.colors({gamingScene,pwmMode,brightness,gamingPhase},31);assert.equal(c.length,31);assert.ok(c.flat().every(v=>Number.isFinite(v)&&v>=0&&v<=brightness/100+1e-12));
 }
});
test('brightness scales RGB exactly once and zero turns every channel off',()=>{
 for(const gamingScene of Object.keys(G.scenes))for(const pwmMode of ['raw','srgb']){
  const s={gamingScene,pwmMode,gamingPhase:.31},full=G.colors({...s,brightness:100},13),quarter=G.colors({...s,brightness:25},13);
  quarter.forEach((rgb,i)=>rgb.forEach((v,k)=>near(v,full[i][k]*.25,1e-12)));assert.ok(G.colors({...s,brightness:0},13).flat().every(v=>v===0));
 }
 const reference=G.colors({gamingScene:'rainbowWave',pwmMode:'raw',brightness:25,gamingPhase:0},6);near(reference[0][0],.25);assert.equal(reference[0][1],0);
});
test('sRGB conversion happens before brightness scaling',()=>{
 const s={gamingScene:'rainbowWave',gamingPhase:0,brightness:50},raw=G.colors({...s,pwmMode:'raw'},12),converted=G.colors({...s,pwmMode:'srgb'},12);
 // 12 LEDs makes the second LED hue 1/12: raw red=1, green=.5.
 near(raw[1][1],.25);near(converted[1][1],(((.5+.055)/1.055)**2.4)*.5);near(converted[1][0],.5);
});
test('rainbow, chase, breathe, and cyber pulse visibly change over time',()=>{
 const s={brightness:100,pwmMode:'raw'};
 for(const gamingScene of Object.keys(G.scenes))assert.notDeepEqual(G.colors({...s,gamingScene,gamingPhase:0},8),G.colors({...s,gamingScene,gamingPhase:.25},8));
 const dim=G.colors({...s,gamingScene:'breathe',gamingPhase:0},1)[0],bright=G.colors({...s,gamingScene:'breathe',gamingPhase:.5},1)[0];near(Math.max(...dim),.08);near(Math.max(...bright),1);
 assert.deepEqual(G.colors({...s,gamingScene:'rainbowWave'},0),[]);
});
test('interpolation mixes linear optical fields, irradiance, and LED PWM without mutating frames',()=>{
 const frames=[frame(1),frame(5),frame(9),frame(13)],snapshot=structuredClone(frames),out=G.interpolate(frames,.125);
 // Four frames, phase .125 means halfway between first and second frame.
 for(const key of ['fields','irradiance'])for(let c=0;c<3;c++)for(let k=0;k<2;k++)near(out[key][c][k],(frames[0][key][c][k]+frames[1][key][c][k])/2);
 assert.deepEqual(out.leds[0].rgb,[3,4,5]);assert.equal(out.state.gamingPhase,.125);assert.equal(out.leds[0].x,0);assert.deepEqual(out.mask,frames[0].mask);assert.deepEqual(frames,snapshot);
 assert.notStrictEqual(out.fields[0],frames[0].fields[0]);assert.notStrictEqual(out.leds[0].rgb,frames[0].leds[0].rgb);
});
test('interpolation closes the cycle from the last frame back to the first',()=>{
 const frames=[frame(1),frame(5),frame(9),frame(13)],end=G.interpolate(frames,.875),one=G.interpolate(frames,1),negative=G.interpolate(frames,-.125);
 near(end.fields[0][0],7);assert.deepEqual(end.fields,negative.fields);assert.deepEqual(one.fields,frames[0].fields);assert.equal(one.state.gamingPhase,0);
});
test('reusable interpolation buffers update every channel and preserve source geometry',()=>{
 const frames=[frame(2),frame(6)],out=G.interpolate(frames,0),field=out.fields[0],irradiance=out.irradiance[0],rgb=out.leds[0].rgb,next=G.interpolate(frames,.25,out);
 assert.strictEqual(next,out);assert.strictEqual(next.fields[0],field);assert.strictEqual(next.irradiance[0],irradiance);assert.strictEqual(next.leds[0].rgb,rgb);
 near(next.fields[0][0],4);near(next.irradiance[2][1],18);assert.deepEqual(next.leds[0].rgb,[4,5,6]);assert.equal(next.state.gamingPhase,.25);assert.deepEqual(frames[0].leds[0].rgb,[2,3,4]);
 const changed=[{...frame(7),nx:1,ny:2},{...frame(9),nx:1,ny:2}],resized=G.interpolate(changed,0,out);assert.notStrictEqual(resized,out);assert.equal(resized.nx,1);assert.equal(resized.ny,2);
});
test('one-frame cycles are constant and absent frames fail explicitly',()=>{
 const source=frame(3);assert.deepEqual(G.interpolate([source],.42).fields,source.fields);assert.throws(()=>G.interpolate([],.2),/フレーム/);
});
test('moving PWM reaches the optical solver and its fields interpolate linearly',()=>{
 const O=require('../src/optics.js'),solver=new O.Solver(),s=O.normalize({shape:'rect',width:40,height:30,layout:'manual',manual:[[0,0,0]],tapeLengths:[1],pattern:'gaming',gamingScene:'breathe',brightness:30,quality:160});
 const a=solver.solve({...s,gamingPhase:0}),b=solver.solve({...s,gamingPhase:.5}),mixed=G.interpolate([a,b],.25);
 assert.ok(b.stats.mean>a.stats.mean*5);assert.notDeepEqual(a.leds[0].rgb,b.leds[0].rgb);
 for(const key of ['fields','irradiance'])for(let c=0;c<3;c++)for(let i=0;i<a.mask.length;i++)assert.ok(Math.abs(mixed[key][c][i]-(a[key][c][i]+b[key][c][i])/2)<1e-4);
 const st=O.statistics(mixed.fields,mixed.mask,mixed.roiMask,mixed.nx,mixed.ny,mixed.dx,mixed.dy);
 assert.ok(Math.abs(st.mean-(a.stats.mean+b.stats.mean)/2)<1e-4);
});
