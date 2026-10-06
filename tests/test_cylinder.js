'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const O=require('../src/optics.js'),C=require('../src/cylinder-optics.js');
const PI=Math.PI;
function state(values={}){return {...O.normalize({ledModel:'custom',packageSize:2,tapeWidth:4,density:60,pattern:'gradient',color1:'#ff0000',color2:'#0000ff',brightness:35,mcdR:180,mcdG:350,mcdB:90,transmission:80,diffuse:100,spread:0,thickness:3,roi:0,quality:160}),geometryMode:'cylinder',cylinderDiameter:80,cylinderLength:120,cylinderTapeLength:80,cylinderAngle:37,...values};}
function close(actual,expected,label='',relative=5e-7){assert.ok(Math.abs(actual-expected)<=1e-6+Math.abs(expected)*relative,`${label}: ${actual} != ${expected}`);}
function direct3D(s,leds,phi,y){
 const R=s.cylinderDiameter/2,target=[R*Math.cos(phi),y,R*Math.sin(phi)],receiver=[-Math.cos(phi),0,-Math.sin(phi)],m=-Math.log(2)/Math.log(Math.cos(s.angle*PI/360)),E=[0,0,0],mcd=[s.mcdR,s.mcdG,s.mcdB];
 for(const led of leds){
  const delta=target.map((v,i)=>v-led.position3D[i]),r=Math.hypot(...delta),u=delta.map(v=>v/r),emission=Math.max(0,u.reduce((n,v,i)=>n+v*led.normal3D[i],0)),incidence=Math.max(0,u.reduce((n,v,i)=>n-v*receiver[i],0));
  for(let c=0;c<3;c++)E[c]+=mcd[c]*.001*led.rgb[c]*1e6/(r*r)*Math.pow(emission,m)*incidence;
 }
 return E;
}

test('folded tape is one connected wiring sequence with opposite normals and mirrored heights',()=>{
 const s=state(),r=C.layout(O,s),n=r.leds.length/2,footprint=Math.max(s.tapeWidth,s.packageSize),expected=Math.floor((s.cylinderTapeLength-footprint)/(1000/s.density))+1;
 assert.equal(n,expected);assert.deepEqual(r.tapeLengths,[2*n]);assert.equal(r.discarded,0);assert.deepEqual(r.invalidTapes,[]);
 const colors=O.ledColors(s,2*n),a=s.cylinderAngle*PI/180;
 for(let i=0;i<2*n;i++){
  const led=r.leds[i],side=i<n?0:1;assert.equal(led.index,i);assert.equal(led.tapeIndex,0);assert.equal(led.side,side);assert.deepEqual(led.rgb,colors[i]);assert.deepEqual(led.position3D,[0,led.y,0]);
  close(led.normal3D[0],Math.cos(a)*(side?-1:1));close(led.normal3D[2],Math.sin(a)*(side?-1:1));assert.equal(led.normal3D[1],0);
  assert.ok(Math.abs(led.y)+footprint/2<=s.cylinderTapeLength/2+1e-8);
 }
 for(let i=1;i<n;i++)close(r.leds[i].y-r.leds[i-1].y,r.pitch);
 for(let i=n+1;i<2*n;i++)close(r.leds[i-1].y-r.leds[i].y,r.pitch);
 for(let i=0;i<n;i++)assert.equal(r.leds[i].y,r.leds[2*n-1-i].y);
});

test('separated cylinder irradiance agrees with independent 3D dot products at narrow and broad angles',()=>{
 for(const angle of [10,120,175]){
  const s=state({angle}),r=C.solve(O,s,{resolution:64});
  for(let j=0;j<r.ny;j+=3)for(let i=0;i<r.nx;i+=5){
   const phi=(i+.5)*2*PI/r.nx,y=(j+.5)*r.dy-s.cylinderLength/2,E=direct3D(s,r.leds,phi,y);
   for(let c=0;c<3;c++)close(r.irradiance[c][j*r.nx+i],E[c],`angle ${angle} / ${i},${j} / RGB ${c}`);
  }
  assert.ok(r.irradiance.every(a=>a.every(Number.isFinite)));assert.ok(r.fields.every(a=>a.every(v=>Number.isFinite(v)&&v>=0)));
 }
});

test('a side emits only into its front hemisphere without splitting its LED intensity',()=>{
 const oneFace={...O,ledColors:(s,total)=>Array.from({length:total},(_,i)=>i<total/2?[1,1,1]:[0,0,0])},s=state({cylinderAngle:0}),r=C.solve(oneFace,s,{resolution:64});
 for(let i=0;i<r.nx;i++){
  const lit=Math.cos((i+.5)*2*PI/r.nx)>0,k=Math.floor(r.ny/2)*r.nx+i;
  if(!lit)assert.ok(r.irradiance.every(a=>a[k]===0));else assert.ok(r.irradiance.every(a=>a[k]>0));
 }
 const phi=.5*2*PI/r.nx,j=Math.floor(r.ny/2),y=(j+.5)*r.dy-s.cylinderLength/2,E=direct3D(s,r.leds,phi,y);
 close(r.irradiance[0][j*r.nx],E[0]);
});

test('direction rotates the full circular field and RGB gradients follow folded wiring',()=>{
 const s=state({cylinderAngle:0,spread:.7}),a=C.solve(O,s,{resolution:64}),shift=8,b=C.solve(O,{...s,cylinderAngle:shift*360/a.nx},{resolution:64});
 assert.equal(a.nx,b.nx);assert.equal(a.ny,b.ny);
 for(let j=0;j<a.ny;j+=3)for(let i=0;i<a.nx;i++)for(let c=0;c<3;c++)close(b.fields[c][j*a.nx+i],a.fields[c][j*a.nx+(i-shift+a.nx)%a.nx],`cyclic rotation ${i}`,2e-6);
 // 配線前半は赤寄り、折返し後は青寄りなので両方向の色は異なる。
 const front=Math.floor(a.ny/2)*a.nx,back=front+a.nx/2;
 assert.ok(a.irradiance[0][front]/s.mcdR>a.irradiance[2][front]/s.mcdB);
 assert.ok(a.irradiance[0][back]/s.mcdR<a.irradiance[2][back]/s.mcdB);
});

test('circumferential diffusion wraps the 360 degree seam and axial edges lose light',()=>{
 const nx=32,ny=9,impulse=new Float32Array(nx*ny);impulse[4*nx]=1;
 const wrapped=C.diffuseCylinder(impulse,nx,ny,2,0);
 close(wrapped[4*nx+1],wrapped[4*nx+nx-1]);assert.ok(wrapped[4*nx+nx-1]>0);
 close(wrapped.reduce((a,b)=>a+b,0),1);assert.equal(impulse[4*nx],1);
 const uniform=new Float32Array(nx*ny).fill(1),blurred=C.diffuseCylinder(uniform,nx,ny,2,2);
 assert.ok(blurred[0]<blurred[4*nx]);assert.ok(blurred[0]<1);close(blurred[0],blurred[nx-1]);assert.ok(blurred.reduce((a,b)=>a+b,0)<nx*ny);
});

test('RGB photometry ratios and brightness are applied exactly once',()=>{
 const s=state({pattern:'solid',color1:'#ffffff',brightness:20,mcdR:300,mcdG:500,mcdB:700,spread:.5}),a=C.solve(O,s,{resolution:64}),b=C.solve(O,{...s,brightness:40},{resolution:64});
 for(let i=0;i<a.fields[0].length;i+=19){
  close(a.fields[0][i]/a.fields[1][i],.6,'R/G ratio',2e-6);close(a.fields[2][i]/a.fields[1][i],1.4,'B/G ratio',2e-6);
  for(let c=0;c<3;c++)close(b.fields[c][i],a.fields[c][i]*2,'brightness multiplier',2e-6);
 }
 const zero=C.solve(O,{...s,brightness:0},{resolution:64});assert.equal(zero.stats.mean,0);assert.equal(zero.stats.robust,null);assert.ok(zero.fields.every(a=>a.every(v=>v===0)));
});

test('outer area correction conserves transmitted power with no blur',()=>{
 const s=state({thickness:12,spread:0,argb:'#FF80FFFF'}),r=C.solve(O,s,{resolution:80}),filter=O.getFilter(s.argb),innerArea=r.cylinder.innerCircumference/r.nx*r.dy/1e6,outerArea=r.dx*r.dy/1e6;
 for(let c=0;c<3;c++){
  const input=r.irradiance[c].reduce((a,b)=>a+b,0)*innerArea*s.transmission/100*filter[c],output=r.fields[c].reduce((a,b)=>a+b,0)*PI*outerArea;
  close(output,input,'transmitted power',2e-6);
 }
 close(r.stats.area,r.cylinder.outerCircumference*s.cylinderLength);close(r.dx*r.nx,r.cylinder.outerCircumference);
 assert.equal(r.state.width,r.cylinder.outerCircumference);assert.equal(r.state.height,s.cylinderLength);assert.equal(r.state.gap,s.cylinderDiameter/2);assert.equal(r.state.shape,'rect');
});

test('scaling the radius and axial coordinates follows the inverse square law',()=>{
 const s=state({cylinderTapeLength:4,cylinderLength:20,thickness:1,pattern:'solid',color1:'#ffffff',cylinderAngle:0}),a=C.solve(O,s,{resolution:64}),b=C.solve(O,{...s,cylinderDiameter:160,cylinderLength:40,thickness:2},{resolution:64});
 assert.equal(a.leds.length,2);assert.equal(b.leds.length,2);assert.equal(a.nx,b.nx);assert.equal(a.ny,b.ny);
 for(let c=0;c<3;c++)for(let i=0;i<a.irradiance[c].length;i+=11)close(b.irradiance[c][i],a.irradiance[c][i]/4,'inverse square scaling',2e-6);
});

test('ROI excludes only axial ends, and profile traverses the complete circumference',()=>{
 const s=state({roi:15}),r=C.solve(O,s,{resolution:64});
 for(let j=0;j<r.ny;j++){
  const inside=Math.min((j+.5)*r.dy,s.cylinderLength-(j+.5)*r.dy)>=s.roi;
  for(let i=0;i<r.nx;i++){assert.equal(r.mask[j*r.nx+i],1);assert.equal(r.roiMask[j*r.nx+i],inside?1:0);}
 }
 assert.equal(r.stats.profile.length,r.nx);assert.ok(r.stats.profile.every(p=>p&&p.length===3));
 const none=C.solve(O,{...s,roi:100},{resolution:64});assert.equal(none.stats.validROI,false);assert.ok(none.roiMask.every(v=>v===1));assert.ok(none.warnings.some(v=>v.includes('軸端の除外幅')));
});

test('solver preserves the original plane settings and explicitly ignores finite aperture features',()=>{
 const s=state({layout:'manual',manual:[[-30,10,.5]],tapeLengths:[1],width:222,height:111,gap:7,splitRGB:false}),original=JSON.stringify(s),a=C.solve(O,s,{resolution:64}),b=C.solve(O,{...s,aperture:.1,splitRGB:true},{resolution:64});
 assert.equal(JSON.stringify(s),original);assert.deepEqual(a.state.manual,s.manual);assert.equal(a.state.layout,'manual');assert.equal(s.width,222);assert.equal(s.height,111);assert.equal(s.gap,7);
 assert.deepEqual(a.fields,b.fields);assert.deepEqual(a.irradiance,b.irradiance);assert.ok(a.warnings.some(v=>v.includes('点光源')));assert.ok(a.warnings.some(v=>v.includes('折返し')));assert.ok(a.warnings.some(v=>v.includes('遮蔽')));
});

test('invalid geometry, unsupported material and excessive output sizes fail before solving',()=>{
 for(const change of [{cylinderDiameter:0},{cylinderDiameter:Infinity},{cylinderLength:9},{cylinderTapeLength:121},{cylinderTapeLength:2},{tapeWidth:80},{packageSize:20,cylinderDiameter:20},{cylinderAngle:NaN},{density:0},{tapeWidth:NaN}])assert.throws(()=>C.layout(O,state(change)));
 assert.throws(()=>C.layout(O,state({cylinderLength:2000,cylinderTapeLength:2000,density:2000})),/5,000/);
 for(const diffuse of [0,90,99.99])assert.throws(()=>C.solve(O,state({diffuse}),{resolution:64}),/100%/);
 for(const resolution of [0,15,449,Infinity,1e9])assert.throws(()=>C.solve(O,state(),{resolution}),/解像度/);
 assert.throws(()=>C.solve(O,state({spread:6}),{resolution:64}));assert.throws(()=>C.solve(O,state({mcdR:Infinity}),{resolution:64}));
});

test('existing Solver dispatches cylinder mode while leaving plane behavior intact',()=>{
 const s=state(),r=new O.Solver().solve(s,{resolution:64});assert.ok(r.cylinder);assert.equal(r.leds.length,C.layout(O,s).leds.length);
 const plane=O.normalize({...s,geometryMode:'plane',layout:'rows',quality:160}),p=new O.Solver().solve(plane,{resolution:64});assert.equal(p.cylinder,undefined);assert.equal(p.state.width,plane.width);assert.equal(p.state.gap,plane.gap);
});

test('worker rejects unsupported cylinder sweeps without returning duplicated clamped conditions',()=>{
 const messages=[],self={postMessage:message=>messages.push(message)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/worker.js'),'utf8'),{Optics:O,self});
 const s=state(),original=JSON.stringify(s);
 self.onmessage({data:{id:17,type:'sweep',state:s,distances:[2.5,5,10,20,40,80]}});
 assert.equal(messages.length,1);assert.equal(messages[0].id,17);assert.equal(messages[0].type,'error');assert.match(messages[0].message,/円筒の6距離比較/);
 assert.equal(JSON.stringify(s),original);
 messages.length=0;
 self.onmessage({data:{id:18,type:'sweep',state:O.normalize(),distances:[5,10]}});
 assert.deepEqual(messages.map(message=>message.type),['sweepItem','sweepItem','sweepDone']);
 assert.deepEqual(messages.slice(0,2).map(message=>message.result.state.gap),[5,10]);
});
