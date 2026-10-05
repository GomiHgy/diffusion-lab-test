'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../src/optics.js');

// 取得した各メーカー資料の光電表を期待値に固定する。Typ未記載の中央値は規格Typではない。
const specifications={
 'WS2812B':{min:[300,800,200],typ:null,max:[500,1500,300],currentMA:16,page:3,selected:[400,1150,250]},
 'WS2812B-MINI':{min:[300,600,200],typ:[310,780,215],max:[500,1000,300],currentMA:12,page:3,selected:[310,780,215]},
 'WS2812C-2020':{min:[50,200,50],typ:[80,270,70],max:[100,300,100],currentMA:5,page:3,selected:[80,270,70]},
 'SK6812':{min:[280,815,160],typ:null,max:[515,1275,320],currentMA:12,page:6,selected:[397.5,1045,240]},
 'SK6812-MINI':{min:[280,815,200],typ:null,max:[515,1275,385],currentMA:12,page:6,selected:[397.5,1045,292.5]}
};
const intensity=s=>[s.mcdR,s.mcdG,s.mcdB];
const sum=values=>values.reduce((total,value)=>total+value,0);
function close(actual,expected,relative=1e-6,absolute=1e-10){
 assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=absolute+relative*Math.abs(expected),`${actual} != ${expected}`);
}
const geometry={shape:'rect',width:40,height:30,layout:'manual',manual:[[0,0,0]],pattern:'solid',color1:'#ffffff',brightness:50,aperture:1,angle:120,gap:10,transmission:60,diffuse:100,spread:0,roi:0};
const lowResolution={resolution:32};

for(const [model,expected] of Object.entries(specifications)){
 test(`${model}: 資料の光度範囲・Typ・電流と採用RGB値`,()=>{
  const profile=O.ledProfiles[model],data=profile.photometry;
  for(const key of ['min','typ','max','currentMA','page'])assert.deepEqual(data[key],expected[key],`${model} ${key}`);
  assert.deepEqual(O.profileIntensity(profile),expected.selected);
  assert.equal(O.ledDescription(O.normalize({ledModel:model})).intensityBasis,expected.typ?'資料のTyp値':'記載範囲の中点');
 });
}

test('採用光度配列の変更がメーカー資料の配列や次の選択を壊さない',()=>{
 for(const [model,expected] of Object.entries(specifications)){
  const profile=O.ledProfiles[model],before=structuredClone(profile.photometry),selected=O.profileIntensity(profile);
  selected[0]=99999;selected.push(123);
  assert.deepEqual(profile.photometry,before);
  assert.deepEqual(O.profileIntensity(profile),expected.selected);
 }
});

test('型番だけの新設定には資料光度を入れ、明示された旧光度は保持する',()=>{
 const saved={mcdR:213,mcdG:715,mcdB:72};
 for(const [model,expected] of Object.entries(specifications)){
  assert.deepEqual(intensity(O.normalize({ledModel:model})),expected.selected);
  assert.deepEqual(intensity(O.normalize({ledModel:model,...saved})),[213,715,72]);
  assert.deepEqual(intensity(O.normalize({ledModel:model,mcdG:0})),[expected.selected[0],0,expected.selected[2]]);
 }
 for(const packageCode of ['5050','3535','2020']){
  const savedState=O.normalize({package:packageCode,...saved,brightness:37});
  assert.equal(savedState.ledModel,'custom');assert.deepEqual(intensity(savedState),[213,715,72]);assert.equal(savedState.brightness,37);
  assert.deepEqual(intensity(O.normalize({package:packageCode})),[213,715,72]);
 }
});

test('型番選択と同じ型番の復帰は光度を更新し、出力・色・材料・配置を保持する',()=>{
 const input=O.normalize({...geometry,ledModel:'custom',mcdR:11,mcdG:22,mcdB:33,brightness:43,color1:'#124578',color2:'#abc123',gap:14,transmission:51,spread:.4,exposure:2});
 const unchanged=['brightness','color1','color2','gap','transmission','spread','exposure','manual','pattern','pwmMode'];
 const original=structuredClone(input);
 for(const [model,expected] of Object.entries(specifications)){
  const selected=O.selectLEDModel(input,model);
  assert.deepEqual(intensity(selected),expected.selected);
  for(const key of unchanged)assert.deepEqual(selected[key],input[key],key);
  const restored=O.selectLEDModel({...selected,mcdR:1,mcdG:2,mcdB:3,aperture:.2,angle:45},model);
  assert.deepEqual(intensity(restored),expected.selected);
  close(restored.aperture,O.profileAperture(O.ledProfiles[model]),1e-12);
  assert.equal(restored.angle,120);
  for(const key of unchanged)assert.deepEqual(restored[key],input[key],key);
 }
 assert.deepEqual(input,original);
});

test('光度0は保持し、負値と上限超過は入力範囲へ制限する',()=>{
 const state=O.normalize({ledModel:'SK6812',mcdR:-1,mcdG:0,mcdB:200001});
 assert.deepEqual(intensity(state),[0,0,200000]);
 assert.deepEqual(intensity(O.normalize({mcdR:'0',mcdG:'12.5',mcdB:'300000'})),[0,12.5,200000]);
 const black=O.normalize({...geometry,mcdR:0,mcdG:0,mcdB:0});
 assert.deepEqual(O.luminousFlux(black),{channels:[0,0,0],total:0});
 const result=new O.Solver().solve(black,lowResolution);
 assert.equal(result.stats.mean,0);assert.ok(result.fields.every(field=>field.every(value=>value===0)));
});

test('非有限光度は選択中の型番値へ戻し、カスタムは従来の既定値へ戻す',()=>{
 for(const [model,expected] of Object.entries(specifications)){
  const state=O.normalize({ledModel:model,mcdR:NaN,mcdG:Infinity,mcdB:-Infinity});
  assert.deepEqual(intensity(state),expected.selected,model);
  assert.ok(O.luminousFlux(state).channels.every(Number.isFinite));
 }
 assert.deepEqual(intensity(O.normalize({ledModel:'custom',mcdR:NaN,mcdG:Infinity,mcdB:-Infinity})),[400,1150,250]);
});

// 閉形式の光束係数を使わず、半値条件を二分探索し、球面の帯を積分する独立の参照計算。
function integratedSolidAngle(fullAngle){
 const halfCos=Math.cos(fullAngle*Math.PI/360);let lower=0,upper=100000;
 for(let i=0;i<70;i++){
  const middle=(lower+upper)/2;
  if(Math.pow(halfCos,middle)>.5)lower=middle;else upper=middle;
 }
 const exponent=(lower+upper)/2,bands=65536,step=Math.PI/(2*bands);let result=0;
 for(let i=0;i<bands;i++){
  const low=i*step,high=(i+1)*step;
  result+=Math.pow(Math.cos((low+high)/2),exponent)*2*Math.PI*(Math.cos(low)-Math.cos(high));
 }
 return result;
}

test('半球光束は独立した球面数値積分と一致する（全幅10/90/120/175°）',()=>{
 for(const angle of [10,90,120,175]){
  const state=O.normalize({...geometry,angle,brightness:100,mcdR:150,mcdG:900,mcdB:230}),solidAngle=integratedSolidAngle(angle),flux=O.luminousFlux(state);
  intensity(state).forEach((value,channel)=>close(flux.channels[channel],value/1000*solidAngle,2e-6));
  close(flux.total,sum(intensity(state))/1000*solidAngle,2e-6);
 }
});

test('120°ではΦ=π I(cd)で、RGB光束を加算する',()=>{
 for(const [model,expected] of Object.entries(specifications)){
  const state=O.normalize({ledModel:model,brightness:100,angle:120}),flux=O.luminousFlux(state);
  expected.selected.forEach((value,channel)=>close(flux.channels[channel],Math.PI*value/1000,1e-12));
  close(flux.total,Math.PI*sum(expected.selected)/1000,1e-12);
 }
});

test('光束の出力係数と色係数は各1回だけ掛かる',()=>{
 const state=O.normalize({...geometry,brightness:25,color1:'#804020',pwmMode:'raw',mcdR:400,mcdG:1150,mcdB:250}),white=O.luminousFlux(state);
 const full=O.luminousFlux({...state,brightness:100});
 close(white.total/full.total,.25,1e-12);
 const coefficients=[128/255,64/255,32/255],rgb=O.ledColors(state,1)[0],colored=O.luminousFlux(state,rgb);
 coefficients.forEach((coefficient,channel)=>{
  close(rgb[channel],coefficient*.25,1e-12);
  close(colored.channels[channel],Math.PI*intensity(state)[channel]/1000*coefficient*.25,1e-12);
 });
 // 明示rgbにはすでに出力係数が入っているので、stateの出力を再適用しない。
 assert.deepEqual(O.luminousFlux({...state,brightness:100},rgb),colored);
 close(colored.total,sum(colored.channels),1e-12);
});

test('正面光度を固定した全幅の変更は、前方半球の総光束を変える',()=>{
 const state=O.normalize({...geometry,mcdR:1000,mcdG:0,mcdB:0,brightness:100});
 const narrow=O.luminousFlux({...state,angle:90}).total,lambertian=O.luminousFlux({...state,angle:120}).total,wide=O.luminousFlux({...state,angle:175}).total;
 assert.ok(narrow<lambertian&&lambertian<wide);
 close(lambertian,Math.PI,1e-12);
});

test('発光幅・面要素数・RGB分離を変えても正面光度の総和を増やさない',()=>{
 const samples=new Set();
 for(const aperture of [.1,1,5])for(const splitRGB of [false,true]){
  const state=O.normalize({...geometry,ledModel:'WS2812B',aperture,splitRGB,brightness:40,color1:'#ff8040',pwmMode:'raw'}),leds=O.makeLEDs(state).leds;
  const source=O.rasterSources(state,leds,96,72,40/96,30/72);samples.add(source.samples);
  const coefficients=[1,128/255,64/255];
  specifications.WS2812B.selected.forEach((value,channel)=>close(sum(source.src[channel]),value/1000*.4*coefficients[channel],2e-6));
 }
 assert.ok(samples.size>=3,'異なる面要素数で総光度を検証する');
});

test('各型番のRGBフィールドと平均輝度は、同じ幾何条件で資料光度の比に一致する',()=>{
 const reference=new O.Solver().solve({...geometry,ledModel:'custom',mcdR:1000,mcdG:1000,mcdB:1000},lowResolution);
 for(const [model,expected] of Object.entries(specifications)){
  const state=O.normalize({ledModel:model,...geometry}),result=new O.Solver().solve(state,lowResolution);
  assert.equal(result.leds.length,1);assert.deepEqual(intensity(result.state),expected.selected);
  for(let channel=0;channel<3;channel++)for(let i=0;i<result.fields[channel].length;i++){
   close(result.fields[channel][i],reference.fields[channel][i]*expected.selected[channel]/1000,3e-6);
  }
  close(result.stats.mean,reference.stats.mean*sum(expected.selected)/3000,3e-6);
 }
});

test('光学値が変わる型番選択では既存の光源キャッシュを更新する',()=>{
 const solver=new O.Solver(),firstState=O.normalize({ledModel:'WS2812B',...geometry});
 solver.solve(firstState,lowResolution);const originalCache=solver.cache;
 solver.solve(firstState,lowResolution);assert.equal(solver.cache,originalCache);
 // 発光幅も角度も固定し、型番の光度変更だけで無効化する。
 const selected=O.selectLEDModel(firstState,'WS2812C-2020'),nextState={...selected,aperture:1,angle:120};
 const changed=solver.solve(nextState,lowResolution),fresh=new O.Solver().solve(nextState,lowResolution);
 assert.notEqual(solver.cache,originalCache);
 close(changed.stats.mean,fresh.stats.mean,1e-12);
 for(let channel=0;channel<3;channel++)assert.deepEqual(changed.fields[channel],fresh.fields[channel]);
});

test('SK6812の3色70%条件は実際のチャンネル出力で警告し、単色やMINIへ適用しない',()=>{
 const scenarios=[
  {model:'SK6812',brightness:100,color:'#ffffff',warning:true},
  {model:'SK6812',brightness:70.01,color:'#ffffff',warning:true},
  {model:'SK6812',brightness:70,color:'#ffffff',warning:false},
  {model:'SK6812',brightness:50,color:'#ffffff',warning:false},
  {model:'SK6812',brightness:100,color:'#808080',warning:false},
  {model:'SK6812',brightness:100,color:'#ff0000',warning:false},
  {model:'SK6812',brightness:100,color:'#00ff00',warning:false},
  {model:'SK6812',brightness:100,color:'#ffff00',warning:false},
  {model:'SK6812-MINI',brightness:100,color:'#ffffff',warning:false}
 ];
 assert.equal(O.ledProfiles.SK6812.photometry.threeChannelMax,70);
 assert.equal(O.ledProfiles['SK6812-MINI'].photometry.threeChannelMax,null);
 for(const scenario of scenarios){
  const result=new O.Solver().solve({ledModel:scenario.model,...geometry,brightness:scenario.brightness,color1:scenario.color},lowResolution);
  assert.equal(result.warnings.some(message=>message.includes('RGB3色同時点灯')),scenario.warning,JSON.stringify(scenario));
 }
});

test('SK6812の70%注意は入力を自動で0.7倍せず、光束と光学フィールドを保持する',()=>{
 const state=O.normalize({ledModel:'SK6812',...geometry,brightness:100}),result=new O.Solver().solve(state,lowResolution);
 const custom=new O.Solver().solve({...state,ledModel:'custom'},lowResolution),at70=new O.Solver().solve({...state,brightness:70},lowResolution);
 assert.equal(result.state.brightness,100);assert.deepEqual(result.leds[0].rgb,[1,1,1]);
 assert.deepEqual(intensity(result.state),specifications.SK6812.selected);
 close(O.luminousFlux(state).total,Math.PI*(397.5+1045+240)/1000,1e-12);
 close(result.stats.mean,custom.stats.mean,1e-12);close(at70.stats.mean/result.stats.mean,.7,3e-6);
 for(let channel=0;channel<3;channel++)assert.deepEqual(result.fields[channel],custom.fields[channel]);
});
