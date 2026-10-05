'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js');
const models=['WS2812B','WS2812B-MINI','WS2812C-2020','SK6812','SK6812-MINI'];
const close=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('The initial state identifies a supported LED rather than an outer package',()=>{
 const state=O.normalize();
 assert.equal(state.ledModel,'WS2812B');
 assert.deepEqual(Object.keys(O.ledProfiles).sort(),[...models].sort());
});

test('Datasheets with missing dimensions or angles do not acquire fabricated specifications',()=>{
 const noWindow=new Set(['WS2812C-2020','SK6812','SK6812-MINI']);
 const noAngle=new Set(['WS2812B','WS2812B-MINI','WS2812C-2020']);
 for(const id of models){
  const profile=O.ledProfiles[id];
  if(noWindow.has(id))assert.equal(profile.windowDiameter,null,`${id}: window size is not specified`);
  else assert.ok(Number.isFinite(profile.windowDiameter)&&profile.windowDiameter>0,id);
  if(noAngle.has(id))assert.equal(profile.angle,null,`${id}: the comparison angle must not be labeled a specification`);
  else assert.ok(Number.isFinite(profile.angle)&&profile.angle>0,id);
  assert.ok(Number.isFinite(profile.assumedAperture)&&profile.assumedAperture>0,id);
  assert.ok(Number.isFinite(profile.assumedAngle)&&profile.assumedAngle>0,id);
  assert.match(profile.datasheetUrl,/^https:\/\//,id);
 }
});

test('Legacy package settings retain their values without assigning a product identity',()=>{
 for(const [outer,size,width] of [['5050',5,2.8],['3535',3.5,1.9],['2020',2,1.1],['custom',6.4,4.3]]){
  const old={version:1,package:outer,packageSize:size,aperture:width,angle:137,mcdR:410,mcdG:820,mcdB:205,width:120,height:40,gap:7};
  const state=O.normalize(JSON.parse(JSON.stringify(old)));
  assert.equal(state.ledModel,'custom',outer);
  for(const key of ['packageSize','aperture','angle','mcdR','mcdG','mcdB','width','height','gap'])assert.equal(state[key],old[key],`${outer}: ${key}`);
  assert.deepEqual(O.normalize(state),state,`${outer}: normalizing an imported state twice changes it`);
 }
});

test('An unrecognized model retains numeric inputs as a custom LED',()=>{
 const input={ledModel:'unverified-future-led',packageSize:3.2,aperture:1.7,angle:98,mcdR:45,mcdG:67,mcdB:89};
 const state=O.normalize(input);
 assert.equal(state.ledModel,'custom');
 for(const key of ['packageSize','aperture','angle','mcdR','mcdG','mcdB'])assert.equal(state[key],input[key],key);
});

test('A circular window becomes a square source of the same area, not its outside package',()=>{
 let specified=0;
 for(const id of models){
  const profile=O.ledProfiles[id],state=O.normalize({ledModel:id});
  assert.equal(state.packageSize,profile.packageSize,id);
  if(profile.windowDiameter!==null){
   specified++;
   close(state.aperture**2,Math.PI*(profile.windowDiameter/2)**2);
   assert.ok(state.aperture<state.packageSize,`${id}: the window was replaced by the outer package`);
  }else{
   assert.equal(state.aperture,profile.assumedAperture,`${id}: unspecified window requires an explicit assumption`);
  }
  assert.equal(state.angle,profile.angle===null?profile.assumedAngle:profile.angle,id);
 }
 assert.ok(specified>0,'No profile exercises the datasheet window conversion');
});

test('Explicit optical inputs survive normalization for a named model',()=>{
 for(const id of models){
  const input={ledModel:id,packageSize:6,aperture:1.23,angle:101,mcdR:321,mcdG:654,mcdB:987};
  const state=O.normalize(input);
  assert.equal(state.ledModel,id);
  for(const key of ['packageSize','aperture','angle','mcdR','mcdG','mcdB'])assert.equal(state[key],input[key],`${id}: ${key}`);
  assert.deepEqual(O.normalize(state),state,`${id}: explicit overrides must remain stable`);
 }
});

test('Selecting a product updates LED geometry, angle and intensity, preserving the rest of the design',()=>{
 const initial=O.normalize({ledModel:'custom',packageSize:6,aperture:1.5,angle:81,mcdR:111,mcdG:222,mcdB:333,width:120,height:44,layout:'manual',manual:[[-12,3,.4],[14,-5,.9]],splitRGB:true,density:144,brightness:37,gap:9,transmission:61,spread:.8,exposure:2,showLED:true});
 const preserved=['width','height','layout','manual','splitRGB','density','brightness','gap','transmission','spread','exposure','showLED'];
 for(const id of models){
  const before=structuredClone(initial),selected=O.selectLEDModel(initial,id),profile=O.ledProfiles[id];
  assert.equal(selected.ledModel,id);
  assert.equal(selected.packageSize,profile.packageSize,id);
  if(profile.windowDiameter===null)assert.equal(selected.aperture,profile.assumedAperture,id);
  else close(selected.aperture**2,Math.PI*(profile.windowDiameter/2)**2);
  assert.equal(selected.angle,profile.angle===null?profile.assumedAngle:profile.angle,id);
  assert.deepEqual([selected.mcdR,selected.mcdG,selected.mcdB],O.profileIntensity(profile),id);
  for(const key of preserved)assert.deepEqual(selected[key],initial[key],`${id}: ${key}`);
  assert.deepEqual(initial,before,'Choosing a model mutated the original design');
 }
});

test('Switching to custom preserves the current geometry and optical calibration',()=>{
 const before=O.normalize({ledModel:'SK6812',packageSize:5,aperture:2.12,angle:117,mcdR:98,mcdG:76,mcdB:54});
 const after=O.selectLEDModel(before,'custom');
 assert.equal(after.ledModel,'custom');
 for(const key of ['packageSize','aperture','angle','mcdR','mcdG','mcdB'])assert.equal(after[key],before[key],key);
});

test('Settings round trips preserve named models, custom values and explicit overrides',()=>{
 for(const id of [...models,'custom']){
  const state=O.normalize({ledModel:id,packageSize:6,aperture:1.25,angle:109,mcdR:219,gap:13});
  const json=JSON.stringify({app:'Diffusion Lab',schemaVersion:2,state});
  assert.deepEqual(O.normalize(JSON.parse(json).state),state,id);
 }
});

test('Source labels distinguish datasheet values, model assumptions and manual overrides',()=>{
 for(const id of models){
  const profile=O.ledProfiles[id],selected=O.normalize({ledModel:id});
  const description=O.ledDescription(selected);
  assert.equal(description.label,id);
  assert.equal(description.widthBasis,profile.windowDiameter===null?'資料未記載・仮定':'開口面積からの近似',id);
  assert.equal(description.angleBasis,profile.angle===null?'資料未記載・仮定':'資料の半値角',id);
  const overridden=O.normalize({...selected,aperture:1.23,angle:101});
  assert.equal(overridden.ledModel,id);
  const manual=O.ledDescription(overridden);
  assert.equal(manual.widthBasis,'手動上書き',id);
  assert.equal(manual.angleBasis,'手動上書き',id);
  assert.deepEqual(O.ledDescription(O.normalize(JSON.parse(JSON.stringify(overridden)))),manual,id);
 }
 const migrated=O.normalize({package:'2020',packageSize:2,aperture:1.1,angle:120});
 assert.deepEqual(O.ledDescription(migrated),{label:'カスタム',widthBasis:'手動・旧設定',angleBasis:'手動・旧設定',intensityBasis:'手動・旧設定'});
});

test('The selected full viewing angle maps to half normal intensity at each half-angle',()=>{
 for(const id of models){
  const state=O.normalize({ledModel:id}),kernel=O.makeKernel(16,16,1,1,10,state.angle);
  const theta=state.angle*Math.PI/360;
  close(Math.cos(theta)**kernel.m,.5);
  // カーネルには逆二乗則と受光面の余弦も含むため、配光の半値をそれらと分けて検証する。
  const lateral=state.gap*Math.tan(theta),radius=Math.hypot(lateral,state.gap);
  const recoveredIntensity=O.kernelValue(lateral,0,state.gap,kernel.m)*radius**2/1e6/Math.cos(theta);
  close(recoveredIntensity,.5);
 }
});

test('Switching between 5050 and 2020 products applies package clearance to automatic placement',()=>{
 const design=O.normalize({shape:'rect',width:10,height:10,tapeWidth:2,layout:'grid',density:500,inset:0,pattern:'solid',color1:'#ffffff'});
 const large=O.selectLEDModel(design,'WS2812B'),small=O.selectLEDModel(large,'WS2812C-2020');
 const largeLayout=O.makeLEDs(large),smallLayout=O.makeLEDs(small);
 assert.equal(largeLayout.leds.length,9);
 assert.equal(smallLayout.leds.length,16);
 for(const state of [large,small]){
  const layout=O.makeLEDs(state),inside=O.shapeInfo(state).inside;
  assert.ok(layout.leds.every(led=>inside(led.x,led.y,state.packageSize/2)));
 }
 // LEDピッチはテープ密度で決まる。パッケージ選択では密度を変えない。
 assert.equal(largeLayout.pitch,2);
 assert.equal(smallLayout.pitch,largeLayout.pitch);
});

test('The selected optical width changes the raster footprint while preserving LED output',()=>{
 const design=O.normalize({shape:'rect',width:20,height:20,layout:'manual',manual:[[0,0,0]],pattern:'solid',color1:'#ffffff',brightness:100,mcdR:1000,mcdG:1000,mcdB:1000});
 const states=['WS2812B','WS2812C-2020'].map(id=>O.normalize({...O.selectLEDModel(design,id),mcdR:1000,mcdG:1000,mcdB:1000}));
 const rasters=states.map(state=>O.rasterSources(state,O.makeLEDs(state).leds,80,80,.25,.25));
 const occupied=raster=>raster.src[0].reduce((count,v)=>count+(v>0?1:0),0);
 assert.ok(occupied(rasters[0])>occupied(rasters[1]),'The larger window retained the previous small LED footprint');
 for(const raster of rasters)for(const field of raster.src)close(field.reduce((sum,v)=>sum+v,0),1,1e-7);
});

test('Sequential model changes produce the same optical result as a new solver',()=>{
 let state=O.normalize({shape:'rect',width:20,height:20,layout:'manual',manual:[[0,0,.3]],pattern:'solid',color1:'#ffffff',gap:2,thickness:1,spread:0,roi:0});
 const reused=new O.Solver(),options={resolution:40};
 let first=null;
 for(const id of [...models,'WS2812B']){
  state=O.selectLEDModel(state,id);
  const actual=reused.solve(state,options),expected=new O.Solver().solve(state,options);
  assert.equal(actual.state.packageSize,state.packageSize,id);
  assert.equal(actual.state.aperture,state.aperture,id);
  assert.deepEqual(actual.leds,expected.leds,id);
  for(let c=0;c<3;c++)assert.deepEqual(actual.fields[c],expected.fields[c],`${id}: an earlier model remained in the source cache`);
  if(id==='WS2812B'&&!first)first=actual;
  if(id==='WS2812C-2020')assert.notDeepEqual(actual.fields[1],first.fields[1],'The optical result did not change after selecting a 2020 LED');
 }
});

test('Changing only a fixed LED package does not replace its calibrated emitting width',()=>{
 const state=O.normalize({ledModel:'custom',packageSize:5.4,aperture:1.1,shape:'rect',width:20,height:20,layout:'manual',manual:[[0,0,0]],pattern:'solid',color1:'#ffffff'});
 const smaller=O.normalize({...state,packageSize:2.2}),solver=new O.Solver(),options={resolution:40};
 const largeResult=solver.solve(state,options),smallResult=solver.solve(smaller,options);
 assert.equal(smallResult.state.packageSize,2.2);
 assert.equal(smallResult.state.aperture,1.1);
 for(let c=0;c<3;c++)assert.deepEqual(smallResult.fields[c],largeResult.fields[c]);
});
