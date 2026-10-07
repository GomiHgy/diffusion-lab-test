/* 円筒の外面計算を3Dへ貼り付け、中心の折り返しテープを模式表示する。 */
(function(root){
'use strict';
const PI=Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const positive=(v,fallback)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):fallback;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
function dimensions(s){
 const innerRadius=positive(s.cylinderDiameter,80)/2,thickness=positive(s.thickness,3),length=positive(s.cylinderLength,200);
 return {innerRadius,outerRadius:innerRadius+thickness,thickness,length,tapeLength:Math.min(positive(s.cylinderTapeLength,160),length)};
}
function ring(radius,y,segments){return Array.from({length:segments},(_,i)=>{const a=i*2*PI/segments;return [radius*Math.cos(a),y,radius*Math.sin(a)];});}
function geometry(s,segments=64){
 const d=dimensions(s),n=clamp(Math.round(positive(segments,64)),16,128);
 return {...d,segments:n,ends:[-1,1].map(sign=>({y:sign*d.length/2,inner:ring(d.innerRadius,sign*d.length/2,n),outer:ring(d.outerRadius,sign*d.length/2,n)}))};
}
function createCamera(s,options={}){
 const d=dimensions(s),width=Math.max(80,positive(options.width,640)),height=Math.max(80,positive(options.height,355));
 const yaw=(Number.isFinite(options.yaw)?options.yaw:-25)*PI/180,pitch=clamp(Number.isFinite(options.pitch)?options.pitch:55,8,82)*PI/180;
 const zoom=clamp(Number.isFinite(options.zoom)?options.zoom:1,.5,2.5),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const distance=Math.hypot(d.outerRadius*2,d.length)*3.8,direction=[-sy*cp,sp,cy*cp],position=direction.map(v=>v*distance);
 // Yが筒の軸、X/Zが断面。yawは筒軸の周り、pitchは側面から開端へ向く。
 function raw(x,y,z){const rx=cy*x+sy*z,rz=-sy*x+cy*z,depth=sp*y+cp*rz,perspective=distance/(distance-depth);return {x:rx*perspective,y:(cp*y-sp*rz)*perspective,depth,perspective};}
 const corners=[];for(const x of [-d.outerRadius,d.outerRadius])for(const y of [-d.length/2,d.length/2])for(const z of [-d.outerRadius,d.outerRadius])corners.push(raw(x,y,z));
 const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
 const padX=width<400?24:42,top=25,bottom=38,scale=Math.min((width-2*padX)/(maxX-minX),(height-top-bottom)/(maxY-minY))*zoom;
 const offsetX=width/2-(minX+maxX)/2*scale,offsetY=(height+top-bottom)/2-(minY+maxY)/2*scale;
 const project=(x,y,z)=>{const p=raw(x,y,z);return {x:p.x*scale+offsetX,y:p.y*scale+offsetY,depth:p.depth,perspective:p.perspective};};
 return {width,height,scale,project,distance,direction,position,yaw:yaw*180/PI,pitch:pitch*180/PI,zoom,bounds:{x:minX*scale+offsetX,y:minY*scale+offsetY,width:(maxX-minX)*scale,height:(maxY-minY)*scale}};
}
function normalizedNormal(value,fallback){if(Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)){const n=Math.hypot(...value);if(n>1e-9)return value.map(v=>v/n);}return fallback.slice();}
function sourcePosition(led){return Array.isArray(led.position3D)&&led.position3D.length===3&&led.position3D.every(Number.isFinite)?led.position3D.slice():[0,Number.isFinite(led.y)?led.y:0,0];}
function rectangle(position,tangent,normal,width,height,depth){
 const center=add(position,normal,depth);
 return [[-1,-1],[-1,1],[1,1],[1,-1]].map(([u,v])=>add(add(center,tangent,u*width/2),[0,1,0],v*height/2));
}
function tapeGeometry(result){
 const s=result.state,d=dimensions(s),angle=(Number(s.cylinderAngle)||0)*PI/180,normal=[Math.cos(angle),0,Math.sin(angle)],tangent=[-normal[2],0,normal[0]];
 const width=positive(s.tapeWidth,positive(s.packageSize,5.4)+2),packageSize=positive(s.packageSize,5.4),aperture=Math.min(positive(s.aperture,2.8),packageSize);
 const tapeFaces=[1,-1].map(sign=>({polygon:rectangle([0,0,0],tangent,normal,width,d.tapeLength,sign*.1),normal:normal.map(v=>v*sign),leg:sign>0?0:1}));
 const leds=result.leds||[],packages=leds.map((led,i)=>{
  const fallback=normal.map(v=>v*(i<Math.ceil(leds.length/2)?1:-1)),n=normalizedNormal(led.normal3D,fallback),t=normalizedNormal([-n[2],0,n[0]],tangent),position=sourcePosition(led);
  const front=rectangle(position,t,n,packageSize,packageSize,1.1),back=rectangle(position,t,n,packageSize,packageSize,.1),light=rectangle(position,t,n,aperture*.7,aperture*.7,1.11);
  // 1 mmのパッケージと0.2 mmの基板は描画用。計算の発光位置は軸上のまま。
  return {led,index:led.index??i,position,normal:n,tangent:t,front,back,light,leg:dot(n,normal)>=0?0:1};
 });
 return {normal,tangent,width,length:d.tapeLength,thickness:.2,tapeFaces,packages};
}
function path(ctx,points,close=true){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(close)ctx.closePath();}
function fill(ctx,points,color,stroke=null){path(ctx,points);ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
function projectPoints(points,project){return points.map(p=>project(...p));}
function annulus(ctx,end,project,fillColor){ctx.beginPath();for(const points of [end.outer,end.inner]){projectPoints(points,project).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}ctx.fillStyle=fillColor;ctx.fill('evenodd');ctx.strokeStyle='#c9d1e745';ctx.lineWidth=.7;ctx.stroke();}
function textureTriangle(ctx,texture,source,dest){
 const [a,b,c]=source,[p,q,r]=dest,det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);if(Math.abs(det)<1e-12)return;
 const ax=((q.x-p.x)*(c[1]-a[1])-(r.x-p.x)*(b[1]-a[1]))/det,ay=((q.y-p.y)*(c[1]-a[1])-(r.y-p.y)*(b[1]-a[1]))/det;
 const bx=((r.x-p.x)*(b[0]-a[0])-(q.x-p.x)*(c[0]-a[0]))/det,by=((r.y-p.y)*(b[0]-a[0])-(q.y-p.y)*(c[0]-a[0]))/det;
 // 細長い円筒の三角形は、中心から頂点を押し広げるだけでは辺の継ぎ目が残る。
 // 各辺の外向き法線へ広げたベベル形状で、辺全体を1ピクセル重ねる。
 const winding=Math.sign(dest.reduce((v,a,i)=>{const b=dest[(i+1)%3];return v+a.x*b.y-b.x*a.y;},0))||1;
 const normals=dest.map((a,i)=>{const b=dest[(i+1)%3],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;return {x:dy/d*winding,y:-dx/d*winding};});
 const clip=dest.flatMap((v,i)=>[normals[(i+2)%3],normals[i]].map(n=>({x:v.x+n.x,y:v.y+n.y})));
 ctx.save();path(ctx,clip);ctx.clip();ctx.transform(ax,ay,bx,by,p.x-ax*a[0]-bx*a[1],p.y-ay*a[0]-by*a[1]);ctx.drawImage(texture,0,0);ctx.restore();
}
function rgbColor(rgb,fallback='#c5c7cb'){if(!rgb)return fallback;const max=Math.max(...rgb);return `rgb(${rgb.map(v=>Math.round(255*clamp(v/Math.max(.3,max),0,1))).join(',')})`;}
function render(ctx,result,options={}){
 const s=result.state,camera=createCamera(s,options),{project}=camera,g=geometry(s,64),tape=tapeGeometry(result),texture=options.texture,outer=[],inner=[],parts=[];
 const rows=clamp(Math.ceil(camera.bounds.height/42),4,10),near=g.ends[1],far=g.ends[0];let textureTriangles=0;
 for(let i=0;i<g.segments;i++){
  const a0=i/g.segments*2*PI,a1=(i+1)/g.segments*2*PI,a=(a0+a1)/2,n=[Math.cos(a),0,Math.sin(a)];
  for(let j=0;j<rows;j++){
   const y0=-g.length/2+j/rows*g.length,y1=-g.length/2+(j+1)/rows*g.length,ym=(y0+y1)/2;
   for(const [radius,list,sign] of [[g.outerRadius,outer,1],[g.innerRadius,inner,-1]]){
    const midpoint=[radius*n[0],ym,radius*n[2]],view=camera.position.map((v,k)=>v-midpoint[k]);if(dot(n,view)*sign<=0)continue;
    const world=[[radius*Math.cos(a0),y0,radius*Math.sin(a0)],[radius*Math.cos(a1),y0,radius*Math.sin(a1)],[radius*Math.cos(a1),y1,radius*Math.sin(a1)],[radius*Math.cos(a0),y1,radius*Math.sin(a0)]];
    const points=projectPoints(world,project),depth=points.reduce((v,p)=>v+p.depth,0)/4;
    list.push({points,depth,i,j,uv:[[i/g.segments,j/rows],[(i+1)/g.segments,j/rows],[(i+1)/g.segments,(j+1)/rows],[i/g.segments,(j+1)/rows]],shade:Math.abs(dot(n,camera.direction))});
   }
  }
 }
 function part(world,color,normal,position,kind,layer=1){if(normal&&dot(normal,camera.position.map((v,i)=>v-position[i]))<=1e-9)return;const points=projectPoints(world,project);parts.push({points,color,kind,layer,depth:points.reduce((v,p)=>v+p.depth,0)/points.length});}
 if(options.showLED!==false){
  for(const face of tape.tapeFaces)part(face.polygon,'#151922',face.normal,[0,0,0],'tape');
  const a=tape.tapeFaces[0].polygon,b=tape.tapeFaces[1].polygon;
  for(let i=0;i<4;i++){const k=(i+1)%4;part([a[i],a[k],b[k],b[i]],'#394353',null,[0,0,0],'tape');}
  for(const pack of tape.packages){
   const layer=dot(pack.normal,camera.position.map((v,i)=>v-pack.position[i]))>=0?2:0;
   part(pack.front,'#c3c7ce',pack.normal,pack.position,'package',layer);part(pack.light,rgbColor(pack.led.rgb),pack.normal,pack.position,'light',layer);
   for(let i=0;i<4;i++){const k=(i+1)%4;part([pack.back[i],pack.back[k],pack.front[k],pack.front[i]],'#6c788c',null,pack.position,'package',layer);}
  }
 }
 ctx.save();ctx.clearRect(0,0,camera.width,camera.height);ctx.imageSmoothingEnabled=true;
 annulus(ctx,far,project,'#252d3a');
 // 内壁と軸上のLEDは、手前の開端から見える範囲だけに描く。
 // 不透明な側壁を透かしてLEDを浮き上がらせない。
 ctx.save();path(ctx,projectPoints(near.inner,project));ctx.clip();
 inner.sort((a,b)=>a.depth-b.depth);for(const face of inner){const v=Math.round(24+face.shade*14);fill(ctx,face.points,`rgb(${v},${v+5},${v+14})`);}
 // 長い基板を平均深度でLEDと混ぜると、基板が奥半分のLEDを覆ってしまう。
 // 基板から見た裏側のパッケージ→基板→表側のLEDの順にし、各層の中だけ深度順にする。
 parts.sort((a,b)=>a.layer-b.layer||a.depth-b.depth);
 for(const p of parts)fill(ctx,p.points,p.color,p.kind==='light'?null:'#a5b1c533');ctx.restore();
 outer.sort((a,b)=>a.depth-b.depth);ctx.save();
 // 三角形の重なりが側壁のシルエットや開端へはみ出さないよう、面の合成輪郭で制限する。
 ctx.beginPath();for(const face of outer){face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}ctx.clip();
 for(const face of outer){
  if(texture&&texture.width&&texture.height){for(const ids of [[0,1,2],[0,2,3]]){textureTriangle(ctx,texture,ids.map(k=>[face.uv[k][0]*texture.width,face.uv[k][1]*texture.height]),ids.map(k=>face.points[k]));textureTriangles++;}}
  else fill(ctx,face.points,'#3c465a');
  // 投影メッシュの全辺ではなく、周方向8区分と軸方向の目安だけを重ねる。
  if(options.showGrid!==false&&(face.i%8===0||face.j%2===0)){
   ctx.beginPath();if(face.i%8===0){ctx.moveTo(face.points[0].x,face.points[0].y);ctx.lineTo(face.points[3].x,face.points[3].y);}
   if(face.j%2===0){ctx.moveTo(face.points[0].x,face.points[0].y);ctx.lineTo(face.points[1].x,face.points[1].y);}ctx.strokeStyle='#e3e9ff14';ctx.lineWidth=.65;ctx.stroke();
  }
 }
 ctx.restore();
 annulus(ctx,near,project,'#657086');
 // アプリ内の寸法欄と重複しない。単独図版として使う場合だけ注記を付ける。
 if(options.annotate===true){ctx.font=`${camera.width<400?9:10}px "Yu Gothic UI",sans-serif`;ctx.fillStyle='#9aa9c2';ctx.textAlign='left';
  ctx.fillText(`内径 ${g.innerRadius*2} mm / 外径 ${Number((g.outerRadius*2).toFixed(2))} mm`,12,camera.height-21);
  ctx.fillText(`軸長 ${g.length} mm · 両端は開放`,12,camera.height-7);
 }ctx.restore();
 return {project,bounds:camera.bounds,camera,geometry:g,tape,surfaces:outer.length+inner.length+parts.length+2,textureTriangles,ledFaces:parts.filter(p=>p.kind==='light').length};
}
function arrow(ctx,a,b,color){ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();const angle=Math.atan2(b.y-a.y,b.x-a.x);fill(ctx,[b,{x:b.x-6*Math.cos(angle-.45),y:b.y-6*Math.sin(angle-.45)},{x:b.x-6*Math.cos(angle+.45),y:b.y-6*Math.sin(angle+.45)}],color);}
function renderLayout(ctx,result,options={}){
 const s=result.state,g=geometry(s),tape=tapeGeometry(result),width=Math.max(80,positive(options.width,640)),height=Math.max(80,positive(options.height,355)),only=options.sectionOnly===true,small=width<460;
 // 小さい断面ウィジェットでも円の下へ寸法2行を置ける余白を確保する。
 const cx=only?width/2:width*.235,cy=height*(only?.42:.48),radius=only?Math.min(width*.26,Math.max(8,(height-60)/2)):Math.min(width*.19,(height-70)*.38),scale=radius/g.outerRadius;
 const section={x:cx,y:cy,scale,innerRadius:g.innerRadius*scale,outerRadius:radius};
 const projectSection=(x,z)=>({x:cx+x*scale,y:cy-z*scale});
 ctx.save();ctx.clearRect(0,0,width,height);ctx.font=`${small?9:11}px "Yu Gothic UI",sans-serif`;ctx.textAlign='center';ctx.fillStyle='#a7b4ce';
 ctx.fillText('断面：中心軸の両面LED',cx,only?14:23);
 ctx.beginPath();ctx.arc(cx,cy,radius,0,2*PI);ctx.arc(cx,cy,g.innerRadius*scale,0,2*PI,true);ctx.fillStyle='#394356';ctx.fill('evenodd');ctx.strokeStyle='#8c9bb577';ctx.lineWidth=.8;ctx.stroke();
 if(options.showGrid!==false){ctx.strokeStyle='#9baac225';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(cx-radius-6,cy);ctx.lineTo(cx+radius+6,cy);ctx.moveTo(cx,cy-radius-6);ctx.lineTo(cx,cy+radius+6);ctx.stroke();ctx.setLineDash([]);}
 const n=tape.normal,t=tape.tangent,board=Math.max(2,tape.thickness*scale);
 const crossRect=(offset,span,depth)=>[[-1,-1],[-1,1],[1,1],[1,-1]].map(([u,v])=>projectSection(t[0]*u*span/2+n[0]*(offset+v*depth/2),t[2]*u*span/2+n[2]*(offset+v*depth/2)));
 fill(ctx,crossRect(0,tape.width,board/scale),'#757e92','#c5cede70');
 for(const sign of [1,-1]){
  const pack=tape.packages.filter(p=>p.leg===(sign>0?0:1)).sort((a,b)=>Math.abs(a.position[1])-Math.abs(b.position[1]))[0];
  fill(ctx,crossRect(sign*Math.max(1.1,3/scale),positive(s.packageSize,5.4),Math.max(1,2/scale)),rgbColor(pack&&pack.led.rgb,sign>0?'#6ee1cf':'#c0a2ff'),'#edf1fb77');
  const a=projectSection(n[0]*sign*Math.max(2,5/scale),n[2]*sign*Math.max(2,5/scale)),b=projectSection(n[0]*sign*g.innerRadius*.74,n[2]*sign*g.innerRadius*.74);arrow(ctx,a,b,sign>0?'#6ee1cf':'#c0a2ff');
 }
 ctx.fillStyle='#99a8c1';ctx.textAlign='center';const labelY=Math.min(cy+radius+18,height-26);ctx.fillText(`内径 ${g.innerRadius*2} mm / 厚さ ${g.thickness} mm`,cx,labelY);
 ctx.fillText(`面の角度 ${Number((Number(s.cylinderAngle)||0).toFixed(1))}°`,cx,Math.min(labelY+14,height-10));
 let side=null,projectSide=null;
 if(!only){
  const sx=width*.755,top=45,bottom=height-48,axisScale=(bottom-top)/g.length,legGap=small?12:19;
  projectSide=(y,leg)=>({x:sx+(leg===0?-legGap:legGap),y:top+(y+g.length/2)*axisScale});side={x:sx,top,bottom,scale:axisScale,legGap};
  ctx.fillStyle='#a7b4ce';ctx.textAlign='center';ctx.fillText(small?'側面：折り返し':'側面：1本を折り返す配線',sx,23);
  ctx.strokeStyle='#6c7b9450';ctx.lineWidth=1;ctx.strokeRect(sx-(small?45:70),top,(small?90:140),bottom-top);
  const y0=-tape.length/2,y1=tape.length/2,a=projectSide(y0,0),b=projectSide(y1,0),c=projectSide(y1,1),d=projectSide(y0,1);
  ctx.strokeStyle='#525d71';ctx.lineWidth=Math.max(3,Math.min(10,tape.width*axisScale));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.stroke();
  arrow(ctx,{x:a.x,y:a.y+3},{x:b.x,y:b.y-4},'#6ee1cf');arrow(ctx,{x:c.x,y:c.y-3},{x:d.x,y:d.y+4},'#c0a2ff');
  const marker=Math.max(2,Math.min(6,positive(s.packageSize,5.4)*axisScale)),labels=tape.packages.length<=32;
  for(const pack of tape.packages){const p=projectSide(pack.position[1],pack.leg);ctx.fillStyle=rgbColor(pack.led.rgb);ctx.fillRect(p.x-marker/2,p.y-marker/2,marker,marker);if(labels){ctx.font='8px ui-monospace,monospace';ctx.fillStyle='#a3afc5';ctx.textAlign=pack.leg===0?'right':'left';ctx.fillText(String(pack.index+1),p.x+(pack.leg===0?-6:6),p.y+3);}}
  ctx.textAlign='center';ctx.font=`${small?9:10}px "Yu Gothic UI",sans-serif`;ctx.fillStyle='#adb9cf';ctx.fillText(`片側 ${tape.length} mm / 合計 ${tape.packages.length} LED`,sx,height-27);ctx.fillStyle='#8493ad';ctx.fillText(small?'同じ軸の2面（模式図）':'同じ軸上の2面を模式的に2列で表示',sx,height-12);
 }
 ctx.restore();return {section,side,geometry:g,tape,projectSection,projectSide};
}
const api={dimensions,geometry,createCamera,tapeGeometry,render,renderLayout};root.CylinderView=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
