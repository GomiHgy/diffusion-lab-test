'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../src/cylinder-view.js');
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const state=(extra={})=>({geometryMode:'cylinder',width:99999,height:99999,cylinderDiameter:80,cylinderLength:200,cylinderTapeLength:160,cylinderAngle:30,thickness:3,tapeWidth:8,packageSize:5.4,aperture:2.8,...extra});
function result(extra={}){
 const s=state(extra),angle=s.cylinderAngle*Math.PI/180,n=[Math.cos(angle),0,Math.sin(angle)],ys=[-60,-40,-20,0,20,40,60];
 const leds=[...ys,...ys.slice().reverse()].map((y,index)=>({x:0,y,index,angle:0,tapeIndex:0,position3D:[0,y,0],normal3D:n.map(v=>v*(index<ys.length?1:-1)),rgb:index<ys.length?[.2,.05,.1]:[.02,.1,.2]}));
 return {state:s,leds,nx:160,ny:128,fields:[new Float32Array(160*128),new Float32Array(160*128),new Float32Array(160*128)]};
}
function context(){
 const ctx={paths:[],clips:[],fills:[],texts:[],images:[],transforms:[],dashes:[],arcs:[]};let path=[];
 ctx.beginPath=()=>{path=[];};ctx.moveTo=(x,y)=>path.push([x,y]);ctx.lineTo=(x,y)=>path.push([x,y]);ctx.closePath=()=>{};
 ctx.clip=rule=>ctx.clips.push({rule,path:path.map(p=>p.slice())});ctx.fill=rule=>ctx.fills.push({rule,path:path.map(p=>p.slice())});
 ctx.stroke=()=>ctx.paths.push(path.map(p=>p.slice()));ctx.fillText=(text,x,y)=>ctx.texts.push({text,x,y});ctx.drawImage=(...args)=>ctx.images.push(args);
 ctx.transform=(...args)=>ctx.transforms.push(args);ctx.setLineDash=value=>ctx.dashes.push(value);ctx.arc=(...args)=>ctx.arcs.push(args);
 ctx.measureText=text=>({width:text.length*6});
 for(const key of ['save','restore','clearRect','fillRect','strokeRect'])ctx[key]=()=>{};
 return ctx;
}

test('open shell geometry uses inner diameter, thickness and cylinder length',()=>{
 const s=state(),g=V.geometry(s);assert.equal(g.innerRadius,40);assert.equal(g.outerRadius,43);assert.equal(g.length,200);assert.equal(g.tapeLength,160);
 assert.deepEqual(g.ends.map(e=>e.y),[-100,100]);
 for(const end of g.ends)for(const [radius,key] of [[g.innerRadius,'inner'],[g.outerRadius,'outer']]){
  assert.equal(end[key].length,64);for(const [x,y,z] of end[key]){close(Math.hypot(x,z),radius);assert.equal(y,end.y);}
 }
 assert.equal(V.geometry(state({cylinderTapeLength:300})).tapeLength,200,'drawing cannot extend the folded tape beyond the axis length');
});

test('camera fits finite physical cylinder extrema independently of the unfolded dimensions',()=>{
 for(const [width,height]of[[280,280],[640,355],[80,80]])for(const [diameter,length,thickness]of[[80,200,3],[10,2000,.1],[2000,10,30],[10,10,30]])for(const [yaw,pitch]of[[-25,55],[170,8],[-90,82]]){
  const s=state({cylinderDiameter:diameter,cylinderLength:length,thickness}),camera=V.createCamera(s,{width,height,yaw,pitch}),radius=diameter/2+thickness;
  close(Math.hypot(...camera.direction),1);
  for(const x of[-radius,radius])for(const y of[-length/2,length/2])for(const z of[-radius,radius]){
   const p=camera.project(x,y,z);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.perspective>0);
   const pad=width<400?24:42;assert.ok(p.x>=pad-1e-8&&p.x<=width-pad+1e-8);assert.ok(p.y>=25-1e-8&&p.y<=height-38+1e-8);
  }
 }
});

test('zoom scales the cylinder projection while yaw rotates around its Y axis',()=>{
 const s=state(),a=V.createCamera(s,{yaw:0}),b=V.createCamera(s,{yaw:90}),z=V.createCamera(s,{yaw:0,zoom:2});
 const x=a.project(20,13,0),rotated=b.project(0,13,20);close(x.x,rotated.x);close(x.y,rotated.y);close(x.depth,rotated.depth);
 close(z.scale,a.scale*2);close(z.project(20,13,0).depth,x.depth);
 assert.deepEqual(V.createCamera({...s,width:1,height:1}).bounds,V.createCamera({...s,width:9999,height:9999}).bounds);
});

test('folded LED packages preserve axis positions, opposite normals and wiring order',()=>{
 const r=result(),snapshot=structuredClone(r.leds),t=V.tapeGeometry(r);assert.equal(t.packages.length,14);assert.equal(t.width,8);assert.equal(t.length,160);assert.equal(t.thickness,.2);
 close(Math.hypot(...t.normal),1);close(t.normal[0]*t.tangent[0]+t.normal[2]*t.tangent[2],0);
 assert.deepEqual(t.packages.map(p=>p.index),Array.from({length:14},(_,i)=>i));assert.deepEqual(t.packages.map(p=>p.leg),[0,0,0,0,0,0,0,1,1,1,1,1,1,1]);
 for(const pack of t.packages){
  assert.deepEqual(pack.position,pack.led.position3D);close(Math.hypot(...pack.normal),1);assert.equal(pack.position[0],0);assert.equal(pack.position[2],0);
  for(const p of [...pack.front,...pack.back,...pack.light])assert.ok(p.every(Number.isFinite));
  const center=pack.front.reduce((a,p)=>a.map((v,i)=>v+p[i]/4),[0,0,0]);for(let i=0;i<3;i++)close(center[i],pack.position[i]+1.1*pack.normal[i]);
 }
 assert.deepEqual(t.packages.slice(0,7).map(p=>p.position[1]),[-60,-40,-20,0,20,40,60]);
 assert.deepEqual(t.packages.slice(7).map(p=>p.position[1]),[60,40,20,0,-20,-40,-60]);assert.deepEqual(r.leds,snapshot);
});

test('angle rotation changes the emitting plane without translating the physical source',()=>{
 for(const angle of[-180,-90,0,37,90,180]){
  const t=V.tapeGeometry(result({cylinderAngle:angle})),a=angle*Math.PI/180;close(t.normal[0],Math.cos(a));close(t.normal[2],Math.sin(a));
  for(const [i,p]of t.packages.entries()){assert.equal(p.position[0],0);assert.equal(p.position[2],0);const sign=i<7?1:-1;close(p.normal[0],sign*Math.cos(a));close(p.normal[2],sign*Math.sin(a));}
 }
});

test('textured outer shell renders angular by height triangles and retains both open ends',()=>{
 const r=result(),texture={width:160,height:128},ctx=context(),out=V.render(ctx,r,{width:640,height:355,texture,showLED:true,showGrid:false,annotate:true});
 assert.ok(out.textureTriangles>0&&out.textureTriangles<1500);assert.equal(ctx.images.length,out.textureTriangles);assert.ok(ctx.images.every(args=>args[0]===texture));
 assert.ok(ctx.transforms.every(args=>args.length===6&&args.every(Number.isFinite)));assert.equal(ctx.fills.filter(f=>f.rule==='evenodd').length,2,'two annuli and no filled end disks');
 const mouth=out.geometry.ends[1].inner.map(p=>out.project(...p));assert.deepEqual(ctx.clips[0].path,mouth.map(p=>[p.x,p.y]),'interior parts are clipped to the near opening');
 assert.ok(out.ledFaces>0);assert.ok(ctx.texts.some(t=>t.text.includes('両端は開放')));
});

test('showLED omits mounted faces and edge-on emitters are not drawn as front faces',()=>{
 const r=result(),hidden=V.render(context(),r,{showLED:false,showGrid:false}),shown=V.render(context(),r,{showLED:true,showGrid:false});
 assert.equal(hidden.ledFaces,0);assert.ok(shown.ledFaces>0);assert.ok(shown.surfaces>hidden.surfaces);assert.equal(shown.textureTriangles,0);
 const edge=V.render(context(),result({cylinderAngle:0}),{yaw:0,showLED:true,showGrid:false});assert.equal(edge.ledFaces,0);
});

test('default 3D rendering leaves annotations to the app and draws a coarse grid',()=>{
 const plain=context(),grid=context(),r=result();V.render(plain,r,{showGrid:false});V.render(grid,r,{showGrid:true});
 assert.equal(plain.texts.length,0);assert.equal(grid.texts.length,0);
 assert.ok(grid.paths.length>plain.paths.length);assert.ok(grid.paths.length-plain.paths.length<250,'grid omits fine tessellation edges');
});

test('layout shows the same center-axis normals and the forward-then-return wiring',()=>{
 const r=result(),ctx=context(),out=V.renderLayout(ctx,r,{width:640,height:355});assert.ok(out.side);assert.equal(out.tape.packages.length,14);
 const origin=out.projectSection(0,0);assert.equal(origin.x,out.section.x);assert.equal(origin.y,out.section.y);
 const normal=out.tape.normal,p=out.projectSection(normal[0]*10,normal[2]*10);assert.ok(p.x>origin.x&&p.y<origin.y,'positive Z is upwards in the cross-section');
 for(let i=0;i<7;i++){
  const a=out.projectSide(out.tape.packages[i].position[1],0),b=out.projectSide(out.tape.packages[13-i].position[1],1);close(a.y,b.y);assert.ok(a.x<b.x);
 }
 assert.ok(ctx.texts.some(t=>t.text.includes('合計 14 LED')));assert.ok(ctx.texts.some(t=>t.text.includes('模式的に2列')));
 for(const item of ctx.texts)assert.ok(Number.isFinite(item.x)&&Number.isFinite(item.y));
});

test('sectionOnly keeps the cross-section and omits the duplicated side schematic',()=>{
 const ctx=context(),out=V.renderLayout(ctx,result(),{width:340,height:190,sectionOnly:true,showGrid:false});
 assert.equal(out.side,null);assert.equal(out.projectSide,null);assert.equal(ctx.dashes.length,0);assert.equal(ctx.arcs.length,2);
 assert.ok(!ctx.texts.some(t=>t.text.includes('側面')));assert.ok(ctx.texts.some(t=>t.text.includes('角度 30')));
 assert.ok(ctx.texts.every(t=>t.y>=0&&t.y<=190));
});

test('mobile layout stays finite and uses short labels for the folded schematic',()=>{
 const ctx=context(),out=V.renderLayout(ctx,result(),{width:280,height:280});assert.ok(out.section.outerRadius>0);assert.ok(out.side.scale>0);
 assert.ok(ctx.texts.some(t=>t.text==='側面：折り返し'));assert.ok(ctx.texts.some(t=>t.text==='同じ軸の2面（模式図）'));
 for(const item of ctx.texts)assert.ok(item.x>=0&&item.x<=280&&item.y>=0&&item.y<=280);
});

test('small section widget reserves readable dimension labels below its circle',()=>{
 const ctx=context(),out=V.renderLayout(ctx,result(),{width:420,height:148,sectionOnly:true,showGrid:false});
 const labels=ctx.texts.filter(t=>t.text.includes('内径')||t.text.includes('面の角度'));
 assert.equal(labels.length,2);assert.ok(labels.every(t=>t.y>out.section.y+out.section.outerRadius+8&&t.y<148));
});
