'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js');
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const sum=a=>a.reduce((s,v)=>s+v,0);
const base={...O.defaults,width:40,height:30,shape:'rect',layout:'manual',manual:[[0,0,0]],pattern:'solid',color1:'#ffffff',quality:160,aperture:1,gap:10,spread:0,roi:0};
let solver=new O.Solver();
test('FFT forward/inverse round trip',()=>{let re=Float32Array.from({length:256},(_,i)=>Math.sin(i*.37)),im=new Float32Array(256),original=new Float32Array(re);O.fft2(re,im,16,16);O.fft2(re,im,16,16,true);re.forEach((v,i)=>close(v,original[i],2e-5));});
test('Kernel inverse square on axis',()=>{close(O.kernelValue(0,0,10,1),10000);close(O.kernelValue(0,0,10,1)/O.kernelValue(0,0,20,1),4);});
test('Lambertian off-axis geometry includes both cosines',()=>close(O.kernelValue(10,0,10,1),2500));
test('Angular exponent matches half-maximum convention',()=>{for(const a of [60,90,120,150]){const m=-Math.log(2)/Math.log(Math.cos(a*Math.PI/360));close(Math.cos(a*Math.PI/360)**m,.5);}});
test('FFT convolution matches direct sum, with no wraparound',()=>{let nx=16,ny=12,k=O.makeKernel(nx,ny,1,1,5,120),re=new Float32Array(k.re.length),im=new Float32Array(k.re.length);re[3*k.w+4]=.8;re[10*k.w+14]=.2;O.fft2(re,im,k.w,k.h);for(let i=0;i<re.length;i++){const a=re[i],b=im[i];re[i]=a*k.re[i]-b*k.im[i];im[i]=a*k.im[i]+b*k.re[i];}O.fft2(re,im,k.w,k.h,true);for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)close(re[y*k.w+x],.8*O.kernelValue(x-4,y-3,5,1)+.2*O.kernelValue(x-14,y-10,5,1),2e-5);});
test('Finite emitter deposition conserves per-channel normal intensity',()=>{const s=O.normalize(base),leds=O.makeLEDs(s).leds,r=O.rasterSources(s,leds,160,120,.25,.25);[s.mcdR,s.mcdG,s.mcdB].forEach((v,c)=>close(sum(r.src[c]),v/1000*s.brightness/100,1e-7));});
test('Separated RGB apertures conserve normal intensity',()=>{const s=O.normalize({...base,splitRGB:true}),leds=O.makeLEDs(s).leds,r=O.rasterSources(s,leds,160,120,.25,.25);[s.mcdR,s.mcdG,s.mcdB].forEach((v,c)=>close(sum(r.src[c]),v/1000*s.brightness/100,1e-7));});
test('sRGB round trip',()=>{for(const v of [0,.001,.03,.04,.18,.5,1])close(O.linearToSrgb(O.srgbToLinear(v)),v,1e-10);});
test('ARGB alpha is tint strength, not optical throughput',()=>{assert.deepEqual(O.getFilter('#00FF0000'),[1,1,1]);assert.deepEqual(O.getFilter('#FFFF0000'),[1,0,0]);});
test('Zero transmission produces exactly zero emitted luminance',()=>{let r=solver.solve({...base,transmission:0});for(const f of r.fields)assert.ok(f.every(v=>v===0));assert.equal(r.stats.robust,null);});
test('Zero LED output produces a black display in a dark room',()=>{let r=solver.solve({...base,brightness:0});assert.equal(r.stats.mean,0);let img=O.rgba(r);assert.ok(img.every((v,i)=>i%4===3||v===0));});
test('Doubling PWM doubles untonemapped luminance',()=>{let a=solver.solve({...base,brightness:10}),b=solver.solve({...base,brightness:20});close(b.stats.mean/a.stats.mean,2,2e-6);});
test('Halving transmission halves luminance',()=>{let a=solver.solve({...base,transmission:80}),b=solver.solve({...base,transmission:40});close(b.stats.mean/a.stats.mean,.5,2e-6);});
test('Red transmission filter removes G/B components',()=>{const r=solver.solve({...base,argb:'#FFFF0000'});assert.ok(r.fields[1].every(v=>v===0));assert.ok(r.fields[2].every(v=>v===0));assert.ok(r.stats.mean>0);});
test('Exposure does not change physical statistics',()=>{const a=solver.solve({...base,exposure:-3}),b=solver.solve({...base,exposure:3});close(a.stats.mean,b.stats.mean,1e-10);});
test('Symmetric source and sheet produce a symmetric field',()=>{const r=solver.solve(base),f=r.fields[1];for(let y=0;y<r.ny;y++)for(let x=0;x<r.nx;x++)close(f[y*r.nx+x],f[(r.ny-1-y)*r.nx+r.nx-1-x],1e-5);});
test('Increased distance lowers isolated LED peak',()=>{const a=solver.solve({...base,gap:5}),b=solver.solve({...base,gap:20});assert.ok(b.stats.max<a.stats.max);});
test('Diffuser blur does not create net diffuse output',()=>{const a=solver.solve({...base,spread:0}),b=solver.solve({...base,spread:1});assert.ok(b.fields.reduce((s,f)=>s+sum(f),0)<=a.fields.reduce((s,f)=>s+sum(f),0)*(1+1e-6));});
test('Ring mask leaves the central aperture empty',()=>{const r=solver.solve({...base,shape:'ring',width:40,height:40,layout:'ring',inset:4,hole:.5,density:150,roi:1});const i=Math.floor(r.ny/2)*r.nx+Math.floor(r.nx/2);assert.equal(r.mask[i],0);for(const f of r.fields)assert.equal(f[i],0);});
test('Empty ROI falls back to full sheet and matches exported mask',()=>{const r=solver.solve({...base,roi:500});assert.equal(r.stats.validROI,false);assert.deepEqual(r.roiMask,r.mask);});
test('Empty LED list is a valid zero-light result',()=>{const r=solver.solve({...base,manual:[]});assert.equal(r.leds.length,0);assert.equal(r.stats.mean,0);assert.ok(r.warnings.length>0);});
test('Manual coordinates are sanitized without deforming tapes; only known keys retained',()=>{const s=O.normalize({width:100,manual:[[Infinity,1],[1000,1000],[1,2]],junk:'x'});assert.equal(s.manual.length,2);assert.equal(s.manual[0][0],1000);assert.deepEqual(s.tapeLengths,[2]);assert.equal('junk' in s,false);});
test('Overlarge LED layouts fail rather than silently truncate',()=>{assert.throws(()=>O.makeLEDs(O.normalize({...base,layout:'grid',width:2000,height:2000,density:1000})),/多|超/);});
test('Polygon rejects too few points before automatic placement or even an empty manual layout',()=>{
 const invalid={...base,shape:'polygon',polygon:'0,0\n100,100'};
 assert.throws(()=>O.shapeInfo(O.normalize(invalid)),/3点/);
 for(const layout of ['rows','grid','ring','perimeter','path','manual'])assert.throws(()=>O.makeLEDs(O.normalize({...invalid,layout,manual:[]})),/3点/);
});

test('Narrow beam and maximum gap remain finite',()=>{const m=-Math.log(2)/Math.log(Math.cos(10*Math.PI/360));for(const x of [0,100,2000])assert.ok(Number.isFinite(O.kernelValue(x,10,300,m)));close(O.kernelValue(0,0,300,m),1e6/90000);});

test('Parallel rows become separate connected tapes in snake wiring order',()=>{
 const s=O.normalize({shape:'rect',width:100,height:60,density:100,rowSpacing:20,inset:10}),g=O.makeLEDs(s);
 assert.deepEqual(g.tapeLengths,[9,9,9]);assert.equal(g.leds[0].x,-40);assert.equal(g.leds[9].x,40);
 assert.equal(g.leds[8].tapeIndex,0);assert.equal(g.leds[9].tapeIndex,1);assert.equal(g.leds[18].tapeIndex,2);
});
test('Grid, perimeter, ring and folded path each stay one connected assembly',()=>{
 for(const layout of ['grid','perimeter','ring','path']){const s=O.normalize({layout}),g=O.makeLEDs(s);assert.deepEqual(g.tapeLengths,[g.leds.length]);assert.ok(g.leds.every(p=>p.tapeIndex===0));}
});
test('Converting auto layout preserves positions, angles, color and wiring order',()=>{
 for(const layout of ['rows','grid','perimeter','ring','path']){
  const s=O.normalize({layout,rotation:17}),before=O.makeLEDs(s),fixed=O.normalize({...s,layout:'manual',...O.tapeLayout(s)}),after=O.makeLEDs(fixed);
  assert.deepEqual(after.leds,before.leds);assert.deepEqual(after.tapeLengths,before.tapeLengths);
 }
});
test('Translation preserves a folded tape, orientation and every other tape',()=>{
 const s=O.normalize({shape:'rect',width:160,height:72,layout:'manual',manual:[[-40,-10,.7],[-20,-10,.7],[-20,10,1.57],[20,-10,0],[40,-10,0]],tapeLengths:[3,2]});
 const layout=O.tapeLayout(s),moved=O.moveTape(s,layout,0,-37.3,-14.2);
 for(let i=0;i<3;i++){close(moved.manual[i][0]-s.manual[i][0],2.7,1e-12);close(moved.manual[i][1]-s.manual[i][1],-4.2,1e-12);assert.equal(moved.manual[i][2],s.manual[i][2]);}
 assert.deepEqual(moved.manual.slice(3),s.manual.slice(3));assert.deepEqual(layout,O.tapeLayout(s));assert.deepEqual(moved.tapeLengths,[3,2]);
 const before=O.makeLEDs(s),after=O.makeLEDs({...s,...moved});assert.deepEqual(after.leds.map(p=>[p.index,p.rgb,p.tapeIndex]),before.leds.map(p=>[p.index,p.rgb,p.tapeIndex]));
});
test('Movement rejects an outlying tail or invalid target without partial mutation',()=>{
 const s=O.normalize({shape:'rect',width:100,height:60,layout:'manual',manual:[[-20,0,0],[20,0,0]],tapeLengths:[2]}),layout=O.tapeLayout(s),copy=structuredClone(layout);
 assert.throws(()=>O.moveTape(s,layout,0,20,0),/輪郭内/);assert.throws(()=>O.moveTape(s,layout,0,NaN,0),/数値/);assert.throws(()=>O.moveTape(s,layout,9,0,0),/選択/);assert.deepEqual(layout,copy);
});
test('Movement checks rounded edges and ring holes, not only a bounding rectangle',()=>{
 const s=O.normalize({shape:'ring',width:100,height:100,layout:'manual',manual:[[35,0,0],[35,10,0]],tapeLengths:[2]});
 assert.throws(()=>O.moveTape(s,O.tapeLayout(s),0,0,0),/輪郭内/);
 const rounded=O.normalize({...s,shape:'rounded',radius:20});assert.throws(()=>O.moveTape(rounded,O.tapeLayout(rounded),0,45,40),/輪郭内/);
});
test('Legacy manual settings become one tape; malformed groups fall back intact',()=>{
 const manual=[[0,0],[10,0],[20,0]];
 for(const tapeLengths of [undefined,[1,1],[0,3],[1.5,1.5],'bad'])assert.deepEqual(O.normalize({manual,tapeLengths}).tapeLengths,[3]);
 assert.deepEqual(O.normalize({manual,tapeLengths:[1,2]}).tapeLengths,[1,2]);assert.deepEqual(O.normalize({manual:[],tapeLengths:[1]}).tapeLengths,[]);
});
test('Sanitizing or truncating manual points keeps surviving group membership',()=>{
 const s=O.normalize({manual:[[NaN,0],[0,0],[10,0],[20,0]],tapeLengths:[2,2]});assert.deepEqual(s.tapeLengths,[1,2]);
 const big=O.normalize({manual:Array.from({length:5100},(_,i)=>[i,0]),tapeLengths:[3000,2100]});assert.deepEqual(big.tapeLengths,[3000,2000]);assert.equal(big.manual.length,5000);
});
test('Resizing the board preserves tape geometry and colors; an invalid tape is excluded as a whole',()=>{
 const s=O.normalize({layout:'manual',width:100,height:60,manual:[[-40,0,0],[0,0,0],[40,0,0]],tapeLengths:[3]}),smaller=O.normalize({...s,width:30}),g=O.makeLEDs(smaller);
 assert.deepEqual(smaller.manual,s.manual);assert.deepEqual(smaller.tapeLengths,[3]);assert.equal(g.discarded,3);assert.deepEqual(g.invalidTapes,[0]);assert.equal(g.leds.length,0);
 assert.deepEqual(O.makeLEDs({...smaller,width:100}).leds,O.makeLEDs(s).leds,'restoring the board restores the original colors and wiring');
 const r=solver.solve({...smaller,quality:160});assert.ok(r.warnings.some(w=>w.includes('接続と座標は保持')));assert.deepEqual(r.tapeLengths,[3]);
});
