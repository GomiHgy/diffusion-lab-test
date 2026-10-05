(function(){
'use strict';
const $=id=>document.getElementById(id), O=Optics, KEY='diffusion-lab-v1';
let state=O.normalize(), result=null, baseline=null, worker=null, busy=false, pending=null, latest=0, timer=null, toastTimer=null;
let sweepWorker=null,sweepResults=[],sweepKey='',sweepRun=0,sweepComplete=false;
let map=null,dragIndex=-1,drawingPath=false,pathDraft=[],lastAutoLEDs=[];
try{const saved=localStorage.getItem(KEY);if(saved)state=O.normalize(JSON.parse(saved));}catch(_){/* Private/file contexts may deny storage. */}
const displayKeys=new Set(['view','exposure','tone','ambient','showLED','showGrid','whiteLevel','target','customLabel']);
const materialPresets={opal:{argb:'#FFFFFFFF',thickness:3,transmission:45,diffuse:100,spread:.65},strong:{argb:'#FFFFFFFF',thickness:3,transmission:30,diffuse:100,spread:1.1},frost:{argb:'#FFFFFFFF',thickness:2,transmission:82,diffuse:90,spread:.2},clear:{argb:'#00FFFFFF',thickness:2,transmission:92,diffuse:0,spread:0},foam:{argb:'#FFFFFEF5',thickness:3,transmission:25,diffuse:100,spread:1.25}};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(_){}}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function error(text){$('errorBanner').textContent=text;$('errorBanner').hidden=!text;}
function format(n,dec=1){if(n===null||!Number.isFinite(n))return '—';return n.toLocaleString('ja-JP',{maximumFractionDigits:dec,minimumFractionDigits:dec});}
function metric(el,value,unit){const box=$(el);box.textContent=value;const sm=document.createElement('small');sm.textContent=unit;box.appendChild(sm);}
function status(text,kind=''){const box=$('status');box.className='status '+kind;$('statusText').textContent=text;}
function createWorker(){const content=$('solver-core').textContent+'\n'+$('worker-source').textContent;const url=URL.createObjectURL(new Blob([content],{type:'text/javascript'}));let w=new Worker(url);URL.revokeObjectURL(url);return w;}
function initWorker(){try{worker=createWorker();worker.onmessage=onWorkerMessage;worker.onerror=e=>{busy=false;status('WORKER ERROR','error');error('計算プロセスでエラーが発生しました。ページを再読み込みしてください。 '+e.message);toggleExport();};}catch(e){error('Web Workerを開始できませんでした。Chrome / Edge / Firefoxの通常ウィンドウで開くか、ローカルHTTPサーバーで開いてください。 '+e.message);status('UNAVAILABLE','error');}}
function requestCompute(delay=130){
 latest++;pending={id:latest,type:'solve',state:structuredClone(state)};
 status(result?'計算待ち · 画像は直前の条件':'計算中…','busy');$('progress').style.width='35%';toggleExport();
 clearTimeout(timer);timer=setTimeout(sendPending,delay);
}
function sendPending(){if(busy||!pending||!worker)return;busy=true;const task=pending;pending=null;worker.postMessage(task);status('計算中 · 距離 '+format(task.state.gap,2)+' mm','busy');$('progress').style.width='65%';}
function onWorkerMessage(e){
 const data=e.data;if(data.type!=='result'&&data.type!=='error')return;busy=false;
 if(data.id===latest){
  if(data.type==='error'){error(data.message);status('入力を確認してください','error');$('initialLoading').hidden=true;$('progress').style.width='0';}
  else{result=data.result;error('');$('initialLoading').hidden=true;$('progress').style.width='100%';setTimeout(()=>{if(!busy&&!pending)$('progress').style.width='0';},250);status('READY · '+format(result.ms/1000,2)+' s');if(state.layout!=='manual')lastAutoLEDs=result.leds.map(p=>[p.x,p.y,p.angle]);renderAll();}
 }
 toggleExport();if(pending)sendPending();
}
function toggleExport(){const disabled=!result||busy||pending!==null||!$('errorBanner').hidden;for(const id of ['pngBtn','csvBtn','pinBtn','autoExposure'])$(id).disabled=disabled;}
function designKey(s){const a={...s};for(const k of displayKeys)delete a[k];delete a.gap;delete a.quality;return JSON.stringify(a);}
function clearSweepForChange(){if(sweepKey&&sweepKey!==designKey(state)){cancelSweep(false);sweepResults=[];sweepKey='';sweepComplete=false;$('sweepBottom').hidden=true;$('comparisonTiles').replaceChildren();const div=document.createElement('div');div.className='empty-comparison';div.textContent='条件が変わりました。「6つの距離を計算」で再比較してください。';$('comparisonTiles').appendChild(div);$('sweepStatus').textContent='過去の比較を破棄しました。距離以外の設定をそろえて再計算します。';}}
function syncControls(){
 document.querySelectorAll('[data-key]').forEach(el=>{const k=el.dataset.key;if(document.activeElement===el&&(el.tagName==='TEXTAREA'||el.type==='text'||el.type==='number'))return;if(el.type==='checkbox')el.checked=!!state[k];else el.value=k==='aperture'?Number(state[k].toFixed(3)):state[k];});
 document.querySelectorAll('[data-out]').forEach(el=>{const k=el.dataset.out;el.textContent=String(state[k])+(el.dataset.suffix||'');});
 document.querySelectorAll('[data-show],[data-hide]').forEach(el=>{const rule=el.dataset.show||el.dataset.hide,[k,list]=rule.split(':'),matches=list.split(',').includes(String(state[k]));el.hidden=el.hasAttribute('data-show')?!matches:matches;});
 document.querySelectorAll('[data-view]').forEach(btn=>{const active=btn.dataset.view===state.view;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));});
 document.querySelectorAll('[data-gap]').forEach(btn=>btn.classList.toggle('active',Math.abs(+btn.dataset.gap-state.gap)<.01));
 $('gapSlider').value=1000*Math.log(state.gap/.25)/Math.log(1200);
 $('materialPicker').value='#'+state.argb.slice(3);
 $('heatKey').style.display=state.view==='heat'?'block':'none';
 $('canvasLabel').textContent=state.view==='layout'?'LED LAYOUT · X → / Y ↓':state.view==='heat'?'LUMINANCE MAP · IMAGE P95 SCALE':'FRONT VIEW · PARALLEL PLANES';
 syncLEDSpec();
}
function syncLEDSpec(){
 const p=O.ledProfiles[state.ledModel],description=O.ledDescription(state);
 const size=document.querySelector('[data-key="packageSize"]');size.readOnly=!!p;
 $('ledPresetBtn').hidden=!p;
 $('ledValueSummary').textContent=`幅：${description.widthBasis} / 角度：${description.angleBasis}`;
 $('ledSpecDetails').replaceChildren();
 if(!p){$('ledSpecDetails').textContent='型番未指定の手入力です。旧設定ファイルは元の幅・角度・光度を保持して読み込みます。製品に対応づける場合は型番を選び直してください。';return;}
 const lines=[p.revision+' · '+p.pages,
  p.windowDiameter===null?`発光窓・有効発光面の寸法は未記載。型番選択時の初期値は比較用の仮定 ${p.assumedAperture} mm です。`:`型番選択時の初期値は、機械図の開口 ${p.windowDiameter} mm を円形とみなし、同じ面積の正方形幅 d × √π / 2 = ${format(O.profileAperture(p),3)} mm に近似した値です。実際のダイ幅や光学的な有効発光幅ではありません。`,
  `現在の計算幅：${format(state.aperture,3)} mm（${description.widthBasis}）。`,
  p.angle===null?`半値角の規格は未記載。型番選択時の初期値は比較用の全幅 ${p.assumedAngle}° です。外形・開口寸法から発光角度は算出できません。`:`型番選択時の初期値は、資料の50%光度における全幅 ${p.angle}° です。cosⁿ配光に近似します。`,
  `現在の計算角度：全幅 ${state.angle}°（${description.angleBasis}）。`,
  `資料の外形最大辺は ${p.packageSize} mm。配置は現在の代表幅 ${state.packageSize} mm の正方形に近似します。光度は型番選択では変わりません。実際の製品に合わせて各色を入力してください。`];
 for(const text of lines){const paragraph=document.createElement('p');paragraph.textContent=text;$('ledSpecDetails').appendChild(paragraph);}
 const link=document.createElement('a');link.href=p.datasheetUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='参照データシートを開く';$('ledSpecDetails').appendChild(link);
}
function applyChange(key,value){
 const previous=state.layout;
 if(key==='ledModel')state=O.selectLEDModel(state,value);
 if(key==='material'&&materialPresets[value])Object.assign(state,materialPresets[value]);
 state[key]=value;
 if(['argb','thickness','transmission','diffuse','spread'].includes(key))state.material='custom';
 if(key==='layout'&&value==='manual'){
  if(previous!=='manual'&&result)lastAutoLEDs=result.leds.map(p=>[p.x,p.y,p.angle]);
  if(state.manual.length===0&&lastAutoLEDs.length)state.manual=structuredClone(lastAutoLEDs);
  state.view='layout';
 }
 state=O.normalize(state);persist();syncControls();
 if(displayKeys.has(key)){renderAll();return;}
 clearSweepForChange();drawSection();if(state.view==='layout')drawMain();requestCompute(key==='polygon'||key==='path'?550:140);
}
$('ledPresetBtn').addEventListener('click',()=>applyChange('ledModel',state.ledModel));
for(const el of document.querySelectorAll('[data-key]')){
 if(el.type==='number')el.addEventListener('blur',()=>{el.value=el.dataset.key==='aperture'?Number(state.aperture.toFixed(3)):state[el.dataset.key];});
 el.addEventListener('input',()=>{
  let k=el.dataset.key,v=el.type==='checkbox'?el.checked:el.value;
  if(['number','range'].includes(el.type)){if(el.value===''||!Number.isFinite(+v))return;v=+v;}
  if(k==='quality'||k==='ambient')v=+v;
  if(k==='argb'&&!/^#[0-9a-f]{8}$/i.test(v)){el.setAttribute('aria-invalid','true');return;}
  el.removeAttribute('aria-invalid');applyChange(k,v);
 });
 if(el.dataset.key==='argb')el.addEventListener('change',()=>{if(!/^#[0-9a-f]{8}$/i.test(el.value)){toast('ARGBは #AARRGGBB の8桁で入力してください。');el.value=state.argb;el.removeAttribute('aria-invalid');}});
}
$('materialPicker').addEventListener('input',e=>applyChange('argb',state.argb.slice(0,3)+e.target.value.slice(1).toUpperCase()));
$('gapSlider').addEventListener('input',e=>applyChange('gap',Math.round(.25*Math.pow(1200,+e.target.value/1000)*100)/100));
for(const btn of document.querySelectorAll('[data-gap]'))btn.addEventListener('click',()=>applyChange('gap',+btn.dataset.gap));
for(const btn of document.querySelectorAll('[data-density]'))btn.addEventListener('click',()=>applyChange('density',+btn.dataset.density));
for(const btn of document.querySelectorAll('[data-view]'))btn.addEventListener('click',()=>applyChange('view',btn.dataset.view));
$('scenePreset').addEventListener('change',e=>{
 const scene=e.target.value;if(!scene)return;let s=O.normalize();
 if(scene==='strip')Object.assign(s,{width:140,height:22,radius:3,layout:'rows',rowSpacing:100,density:60,pattern:'solid',color1:'#ffffff',gap:2.5,roi:2});
 if(scene==='panel')Object.assign(s,{width:144,height:96,layout:'grid',density:60,pattern:'solid',color1:'#ffffff',gap:15});
 if(scene==='ring'){s=O.selectLEDModel(s,'WS2812C-2020');Object.assign(s,{width:100,height:100,shape:'ring',hole:.5,layout:'ring',inset:12,density:150,pattern:'rainbow',gap:8,roi:2});}
 if(scene==='foam')Object.assign(s,{width:140,height:28,layout:'rows',rowSpacing:100,density:144,pattern:'solid',color1:'#ffffff',gap:5,roi:2,material:'foam',...materialPresets.foam});
 if(scene==='rgb')Object.assign(s,{width:40,height:24,layout:'rows',rowSpacing:100,density:150,pattern:'solid',color1:'#ffffff',gap:1,splitRGB:true,material:'custom',transmission:75,diffuse:100,spread:0,roi:1,quality:448,exposure:-3});
 state=O.normalize(s);drawingPath=false;pathDraft=[];persist();syncControls();clearSweepForChange();requestCompute(0);e.target.value='';
});
function fitCanvas(canvas){const rect=canvas.getBoundingClientRect();const w=Math.max(10,rect.width),h=Math.max(10,rect.height),dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w,h};}
function polygonPath(ctx,s,ox,oy,scale){ctx.beginPath();const p=O.outline(s);p.forEach((v,i)=>{const x=ox+v[0]*scale,y=oy+v[1]*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();if(s.shape==='ring'){ctx.moveTo(ox+s.width/2*s.hole*scale,oy);ctx.ellipse(ox,oy,s.width/2*s.hole*scale,s.height/2*s.hole*scale,0,0,Math.PI*2);}}
function bitmap(r,display={}){const c=document.createElement('canvas');c.width=r.nx;c.height=r.ny;c.getContext('2d').putImageData(new ImageData(O.rgba(r,display),r.nx,r.ny),0,0);return c;}
function displayOptions(view='appearance'){return {exposure:state.exposure,whiteLevel:state.whiteLevel,tone:state.tone,ambient:state.ambient,view};}
function drawSurface(ctx,r,box,opts=displayOptions(),border=true){const s=r.state,scale=Math.min(box.w/s.width,box.h/s.height),w=s.width*scale,h=s.height*scale,x=box.x+(box.w-w)/2,y=box.y+(box.h-h)/2;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap(r,opts),x,y,w,h);if(border){polygonPath(ctx,s,x+w/2,y+h/2,scale);ctx.strokeStyle='#d8e1ff24';ctx.lineWidth=1;ctx.stroke();}return {x,y,w,h,scale,ox:x+w/2,oy:y+h/2};}
function drawGrid(ctx,w,h,s,m){
 ctx.fillStyle='#0b0e14';ctx.fillRect(0,0,w,h);
 if(!state.showGrid)return;
 const rough=s.width/8,p=10**Math.floor(Math.log10(rough)),step=rough/p>5?10*p:rough/p>2?5*p:2*p;
 ctx.strokeStyle='#242b393f';ctx.lineWidth=1;ctx.beginPath();
 for(let x=Math.ceil(-w/2/m.scale/step)*step;x<w/2/m.scale;x+=step){let xx=m.ox+x*m.scale;ctx.moveTo(xx,0);ctx.lineTo(xx,h);}
 for(let y=Math.ceil(-h/2/m.scale/step)*step;y<h/2/m.scale;y+=step){let yy=m.oy+y*m.scale;ctx.moveTo(0,yy);ctx.lineTo(w,yy);}ctx.stroke();
 ctx.strokeStyle='#424b6355';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(0,m.oy);ctx.lineTo(w,m.oy);ctx.moveTo(m.ox,0);ctx.lineTo(m.ox,h);ctx.stroke();ctx.setLineDash([]);
}
function drawDimensions(ctx,s,m){if(!state.showGrid)return;const y=m.y-17,x=m.x-18;ctx.strokeStyle='#67718a88';ctx.fillStyle='#8590aa';ctx.lineWidth=1;ctx.font='10px ui-monospace,Consolas,monospace';ctx.textAlign='center';ctx.beginPath();ctx.moveTo(m.x,y);ctx.lineTo(m.x+m.w,y);for(const xx of [m.x,m.x+m.w]){ctx.moveTo(xx,y-4);ctx.lineTo(xx,y+4);}ctx.stroke();ctx.fillText(format(s.width,0)+' mm',m.ox,y-7);ctx.beginPath();ctx.moveTo(x,m.y);ctx.lineTo(x,m.y+m.h);for(const yy of [m.y,m.y+m.h]){ctx.moveTo(x-4,yy);ctx.lineTo(x+4,yy);}ctx.stroke();ctx.save();ctx.translate(x-8,m.oy);ctx.rotate(-Math.PI/2);ctx.fillText(format(s.height,0)+' mm',0,0);ctx.restore();ctx.textAlign='left';}
function drawLEDs(ctx,leds,s,m,overlay=false){
 if(!overlay&&leds.length){
  ctx.strokeStyle='#9aa6b11b';ctx.lineWidth=Math.max(2,(s.packageSize+2)*m.scale);ctx.lineCap='round';
  ctx.beginPath();let prev=null;for(const p of leds){if(prev&&Math.hypot(p.x-prev.x,p.y-prev.y)<1000/s.density*1.75)ctx.lineTo(m.ox+p.x*m.scale,m.oy+p.y*m.scale);else ctx.moveTo(m.ox+p.x*m.scale,m.oy+p.y*m.scale);prev=p;}ctx.stroke();
 }
 for(const p of leds){const x=m.ox+p.x*m.scale,y=m.oy+p.y*m.scale,bs=Math.max(2,s.packageSize*m.scale),ap=Math.max(1,s.aperture*m.scale);ctx.save();ctx.translate(x,y);ctx.rotate(p.angle);if(overlay){ctx.strokeStyle='#ffffff90';ctx.lineWidth=1;ctx.strokeRect(-bs/2,-bs/2,bs,bs);ctx.fillStyle='#ffffff66';ctx.fillRect(-1,-1,2,2);}else{ctx.fillStyle='#c9c6b4';ctx.fillRect(-bs/2,-bs/2,bs,bs);ctx.fillStyle='#202126';ctx.fillRect(-ap/2,-ap/2,ap,ap);const rgb=p.rgb.map(v=>Math.round(O.linearToSrgb(v)*255));ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(-ap*.35,-ap*.35,ap*.7,ap*.7);}ctx.restore();
  if(!overlay&&leds.length<=90&&m.scale>2){ctx.font='8px ui-monospace,Consolas,monospace';ctx.fillStyle='#71819c';ctx.textAlign='center';ctx.fillText(p.index+1,x,y+bs/2+10);ctx.textAlign='left';}
 }
}
function drawMain(){
 const {ctx,w,h}=fitCanvas($('mainCanvas'));let s=result?result.state:state,leds=result?result.leds:[];
 if(state.view==='layout'){s=state;try{leds=O.makeLEDs(state).leds;}catch(_){}}
 const scale=Math.min((w-120)/s.width,(h-108)/s.height),bw=s.width*scale,bh=s.height*scale;
 const m={scale,x:(w-bw)/2,y:(h-bh)/2+3,w:bw,h:bh,ox:w/2,oy:h/2+3};map={...m,state:s};drawGrid(ctx,w,h,s,m);
 if(state.view==='layout'){
  try{polygonPath(ctx,s,m.ox,m.oy,m.scale);ctx.fillStyle='#1b222b';ctx.fill('evenodd');ctx.strokeStyle='#4c596b';ctx.lineWidth=1;ctx.stroke();drawLEDs(ctx,leds,s,m,false);}catch(_){return;}
 }else if(result){drawSurface(ctx,result,{x:m.x,y:m.y,w:m.w,h:m.h},displayOptions(state.view));if(state.showLED)drawLEDs(ctx,leds,s,m,true);}
 drawDimensions(ctx,s,m);
 if(drawingPath){ctx.strokeStyle='#71e5cf';ctx.lineWidth=2;ctx.beginPath();pathDraft.forEach((p,i)=>i?ctx.lineTo(m.ox+p[0]*m.scale,m.oy+p[1]*m.scale):ctx.moveTo(m.ox+p[0]*m.scale,m.oy+p[1]*m.scale));ctx.stroke();ctx.fillStyle='#71e5cf';for(const p of pathDraft){ctx.beginPath();ctx.arc(m.ox+p[0]*m.scale,m.oy+p[1]*m.scale,4,0,Math.PI*2);ctx.fill();}}
 $('dimensionLabel').textContent=format(s.width,0)+' × '+format(s.height,0)+' mm';
 $('gridLabel').textContent=drawingPath?'クリックで点を追加 · Enterで確定':state.view==='layout'&&state.layout==='manual'?'追加 / ドラッグ移動 / Shiftで削除':result?format(result.dx,2)+' × '+format(result.dy,2)+' mm / 計算セル':'未校正モデル';
 if(result)$('heatUpper').textContent=format(result.stats.p95,1)+' cd/m²';
}
function drawProfile(){const {ctx,w,h}=fitCanvas($('profileCanvas'));ctx.clearRect(0,0,w,h);if(!result)return;const pr=result.stats.profile,top=17,bottom=h-24,left=43,right=w-10;let max=0;for(const p of pr)if(p)max=Math.max(max,p[0]+p[1]+p[2]);max=max||1;
 ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillStyle='#77839e';ctx.strokeStyle='#30384b';ctx.lineWidth=1;
 for(let j=0;j<3;j++){let y=top+(bottom-top)*j/2;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(format(max*(1-j/2),0),left-7,y+3);}ctx.textAlign='left';ctx.fillText('cd/m²',1,9);
 const cols=['#fe7188','#69d9ac','#739eff','#e5eaf8'];for(let c=0;c<4;c++){ctx.beginPath();let pen=false;for(let i=0;i<pr.length;i++){let p=pr[i];if(!p){pen=false;continue;}let v=c===3?p[0]+p[1]+p[2]:p[c],x=left+i/(pr.length-1)*(right-left),y=bottom-v/max*(bottom-top);pen?ctx.lineTo(x,y):ctx.moveTo(x,y);pen=true;}ctx.strokeStyle=cols[c];ctx.lineWidth=c===3?1.7:1.1;ctx.stroke();}
 ctx.fillStyle='#77839e';ctx.textAlign='left';ctx.fillText(format(-result.state.width/2,0),left,bottom+16);ctx.textAlign='center';ctx.fillText('0',left+(right-left)/2,bottom+16);ctx.textAlign='right';ctx.fillText(format(result.state.width/2,0)+' mm',right,bottom+16);ctx.textAlign='left';}
function drawSection(){const {ctx,w,h}=fitCanvas($('sectionCanvas'));ctx.clearRect(0,0,w,h);const s=state,x0=15,x1=w-76,top=37,chipY=top+35+Math.log(1+s.gap)/Math.log(301)*43,plateH=Math.min(17,4+s.thickness);const colors=[s.color1,s.pattern==='solid'?s.color1:s.color2];
 ctx.fillStyle='#c9d2e033';ctx.fillRect(x0,top-plateH,x1-x0,plateH);ctx.strokeStyle='#aab5c26b';ctx.strokeRect(x0,top-plateH,x1-x0,plateH);
 ctx.fillStyle='#96a3bd';ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText('拡散板  '+format(s.thickness,1)+' mm',x0,top-plateH-7);
 for(let i=0;i<5;i++){const x=x0+14+i*(x1-x0-28)/4,spread=Math.min((x1-x0)/2,s.gap*Math.tan(s.angle*Math.PI/360)*.8);ctx.beginPath();ctx.moveTo(x,chipY);ctx.lineTo(Math.max(x0,x-spread),top);ctx.lineTo(Math.min(x1,x+spread),top);ctx.closePath();ctx.fillStyle=colors[i%2]+'13';ctx.fill();ctx.strokeStyle=colors[i%2]+'36';ctx.stroke();ctx.fillStyle='#d5d1b9';ctx.fillRect(x-4,chipY-2,8,4);}
 ctx.fillStyle='#353b4c';ctx.fillRect(x0,chipY+4,x1-x0,4);ctx.fillStyle='#77839e';ctx.fillText('LED発光面 / 非反射ベース',x0,chipY+23);
 const xx=x1+13;ctx.strokeStyle='#a99aff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,chipY);ctx.moveTo(xx-3,top+4);ctx.lineTo(xx,top);ctx.lineTo(xx+3,top+4);ctx.moveTo(xx-3,chipY-4);ctx.lineTo(xx,chipY);ctx.lineTo(xx+3,chipY-4);ctx.stroke();ctx.fillStyle='#c4b9ff';ctx.font='11px ui-monospace,Consolas,monospace';ctx.fillText(format(s.gap,1),xx+8,(top+chipY)/2);ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillText('mm',xx+8,(top+chipY)/2+13);}
function updateMetrics(){if(!result)return;const r=result,st=r.stats;metric('metricUniform',st.robust===null?'—':format(st.robust*100,1),'%');metric('metricMean',format(st.mean,1),'cd/m²');metric('metricLED',format(r.leds.length,0),'個');metric('metricRatio',format(r.state.gap/r.pitch,2),'×');$('roiLabel').textContent=st.validROI?'端から '+format(r.state.roi,1)+' mm を除いて評価':'評価領域なし → 全面で評価';$('pitchLabel').textContent=state.layout==='manual'?'自由配置 · 基準ピッチ '+format(r.pitch,2)+' mm':format(r.pitch,2)+' mm pitch';$('warnings').replaceChildren();for(const text of r.warnings){const div=document.createElement('div');div.textContent='△ '+text;$('warnings').appendChild(div);}if(state.layout==='manual'){const div=document.createElement('div');div.textContent='△ 自由配置時のピッチ・距離比は密度入力からの基準値です。実際のLED間隔を表しません。';$('warnings').appendChild(div);}}
function drawSmall(canvas,r){if(!r)return;const {ctx,w,h}=fitCanvas(canvas);ctx.fillStyle='#0b0e14';ctx.fillRect(0,0,w,h);drawSurface(ctx,r,{x:8,y:8,w:w-16,h:h-16},displayOptions());}
function summary(r){return `${format(r.state.width,0)}×${format(r.state.height,0)} mm · d=${format(r.state.gap,2)} mm · ${r.leds.length} LED · 均一さ ${r.stats.robust===null?'—':format(r.stats.robust*100,1)}% · ${format(r.stats.mean,1)} cd/m²`;}
function drawBaseline(){if(!baseline||!result)return;drawSmall($('baselineCanvas'),baseline);drawSmall($('currentSmallCanvas'),result);$('baselineLabel').textContent=summary(baseline);$('currentSmallLabel').textContent=summary(result);}
function renderAll(){drawMain();drawProfile();drawSection();updateMetrics();drawSweepTiles();drawSweepGraph();drawBaseline();}
function drawSweepTiles(){if(!sweepResults.length)return;const box=$('comparisonTiles');
 const currentCards=box.querySelectorAll('.tile');if(currentCards.length!==sweepResults.filter(Boolean).length){box.replaceChildren();sweepResults.forEach((r,i)=>{if(!r)return;const btn=document.createElement('button');btn.className='tile';btn.dataset.i=i;const gap=document.createElement('div');gap.className='gap';gap.textContent=format(r.state.gap,r.state.gap%1?1:0)+' mm';btn.appendChild(gap);const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',r.state.gap+'mmでの面発光');btn.appendChild(canvas);const sub=document.createElement('div');sub.className='tile-sub';btn.appendChild(sub);btn.addEventListener('click',()=>applyChange('gap',r.state.gap));box.appendChild(btn);});}
 for(const btn of box.querySelectorAll('.tile')){const r=sweepResults[+btn.dataset.i];drawSmall(btn.querySelector('canvas'),r);btn.classList.toggle('pass',r.stats.robust!==null&&r.stats.robust*100>=state.target);const sub=btn.querySelector('.tile-sub');sub.textContent='均一 '+(r.stats.robust===null?'—':format(r.stats.robust*100,1))+'%';const br=document.createElement('br');sub.appendChild(br);sub.appendChild(document.createTextNode(format(r.stats.mean,1)+' cd/m²'));}
}
function drawSweepGraph(){const rs=sweepResults.filter(Boolean);if(!rs.length)return;$('sweepBottom').hidden=false;const {ctx,w,h}=fitCanvas($('sweepCanvas'));ctx.clearRect(0,0,w,h);const left=34,right=w-48,top=20,bottom=h-23,maxL=Math.max(1,...rs.map(r=>r.stats.mean));const xx=d=>left+Math.log2(d/2.5)/5*(right-left),yy=u=>bottom-u*(bottom-top);
 ctx.font='9px ui-monospace,Consolas,monospace';ctx.fillStyle='#8490ac';ctx.textAlign='right';ctx.strokeStyle='#30384b';for(let i=0;i<3;i++){let u=i/2,y=yy(u);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText(format(u*100,0),left-6,y+3);ctx.textAlign='left';ctx.fillText(format(maxL*u,0),right+6,y+3);ctx.textAlign='right';}ctx.textAlign='left';ctx.fillStyle='#69e1df';ctx.fillText('均一さ %',left,10);ctx.textAlign='right';ctx.fillStyle='#a0a9bf';ctx.fillText('平均 cd/m²',right+44,10);
 ctx.setLineDash([3,4]);ctx.strokeStyle='#a99aff70';ctx.beginPath();ctx.moveTo(left,yy(state.target/100));ctx.lineTo(right,yy(state.target/100));ctx.stroke();ctx.setLineDash([]);
 for(let channel=0;channel<2;channel++){ctx.strokeStyle=channel?'#a0a9bf':'#69e1df';ctx.lineWidth=1.5;ctx.beginPath();let pen=false;for(const r of rs){const value=channel?r.stats.mean/maxL:r.stats.robust;if(value===null){pen=false;continue;}let x=xx(r.state.gap),y=yy(value);pen?ctx.lineTo(x,y):ctx.moveTo(x,y);pen=true;}ctx.stroke();for(const r of rs){const value=channel?r.stats.mean/maxL:r.stats.robust;if(value===null)continue;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(xx(r.state.gap),yy(value),2.4,0,2*Math.PI);ctx.fill();}}
 ctx.textAlign='center';ctx.fillStyle='#8490ac';for(const d of [2.5,5,10,20,40,80])ctx.fillText(String(d),xx(d),bottom+15);ctx.textAlign='left';
 const pass=rs.find(r=>r.stats.robust!==null&&r.stats.robust*100>=state.target);let text;
 if(pass)text=`${sweepComplete?'今回の6条件':'計算済みの条件'}では、${format(pass.state.gap,1)} mm で初めて目標に届きます。平均輝度は ${format(pass.stats.mean,1)} cd/m² です。これは試した離散距離の中の結果で、最小必要距離を探索した結果ではありません。`;
 else text=`${sweepComplete?'今回の6条件':'現在計算済みの条件'}には、目標 ${state.target}% に届く距離がありません。LED間隔・列間隔・評価領域・材料を見直して比較してください。`;
 $('sweepFinding').textContent=text;
}
function cancelSweep(notify=true){if(sweepWorker){sweepWorker.terminate();sweepWorker=null;}sweepRun++;$('cancelSweep').hidden=true;$('sweepBtn').disabled=false;if(notify){$('sweepStatus').textContent='比較を中止しました。表示されているのは計算済みの条件のみです。';sweepComplete=false;drawSweepGraph();}}
$('sweepBtn').addEventListener('click',()=>{
 cancelSweep(false);sweepResults=[];sweepComplete=false;sweepKey=designKey(state);const id=++sweepRun;$('comparisonTiles').replaceChildren();const d=document.createElement('div');d.className='empty-comparison';d.textContent='同じ条件で距離を変えながら計算しています…';$('comparisonTiles').appendChild(d);$('sweepBtn').disabled=true;$('cancelSweep').hidden=false;$('sweepBottom').hidden=true;$('sweepStatus').textContent='比較を計算中…';
 try{sweepWorker=createWorker();}catch(e){toast('比較用プロセスを開始できませんでした。');cancelSweep(false);return;}
 sweepWorker.onmessage=e=>{const data=e.data;if(data.id!==sweepRun)return;if(data.type==='sweepItem'){sweepResults[data.index]=data.result;$('sweepStatus').textContent=`${data.index+1} / ${data.total} 条件を計算済み · 同一露出 · 高速解像度`;drawSweepTiles();drawSweepGraph();}else if(data.type==='sweepDone'){sweepComplete=true;$('sweepStatus').textContent='6条件の計算完了 · 高速解像度・同一露出。最終判断前に高精細と実機で確認してください。';$('cancelSweep').hidden=true;$('sweepBtn').disabled=false;sweepWorker.terminate();sweepWorker=null;drawSweepGraph();}else if(data.type==='error'){toast(data.message);cancelSweep(false);}};
 sweepWorker.onerror=e=>{toast('比較の計算でエラーが発生しました。 '+e.message);cancelSweep(false);};
 sweepWorker.postMessage({id,type:'sweep',state:structuredClone(state),distances:[2.5,5,10,20,40,80]});
});
$('cancelSweep').addEventListener('click',()=>cancelSweep());
$('pinBtn').addEventListener('click',()=>{if(!result||busy||pending)return;baseline=structuredClone(result);$('baselineCard').hidden=false;drawBaseline();toast('現在の条件を比較基準 A として保存しました。基準はこのページを閉じるまで保持します。');});
$('clearBaseline').addEventListener('click',()=>{baseline=null;$('baselineCard').hidden=true;});
$('autoExposure').addEventListener('click',()=>{if(!result||result.stats.p95<=1e-9){toast('光がないため、露出を調整できません。');return;}let max=0;const tmp=[];for(let i=0;i<result.mask.length;i++)if(result.mask[i])tmp.push(Math.max(...result.fields.map((f,c)=>f[i]/O.Y[c])));tmp.sort((a,b)=>a-b);max=tmp[Math.floor((tmp.length-1)*.95)]||1;applyChange('exposure',O.clamp(Math.round(Math.log2(state.whiteLevel*.9/max)*10)/10,-6,6));toast('この条件に合わせて露出を調整しました。以後の距離変更では固定されます。');});
function mousePoint(e){const rect=$('mainCanvas').getBoundingClientRect();return {x:(e.clientX-rect.left-map.ox)/map.scale,y:(e.clientY-rect.top-map.oy)/map.scale};}
$('mainCanvas').addEventListener('pointerdown',e=>{
 if(!map||state.view!=='layout')return;const p=mousePoint(e);let inside;try{inside=O.shapeInfo(state).inside(p.x,p.y);}catch(_){return;}if(!inside)return;
 if(drawingPath){pathDraft.push([Math.round(p.x*10)/10,Math.round(p.y*10)/10]);drawMain();return;}
 if(state.layout!=='manual')return;e.preventDefault();const threshold=Math.max(state.packageSize,10/map.scale);let nearest=-1,best=Infinity;state.manual.forEach((q,i)=>{const d=Math.hypot(p.x-q[0],p.y-q[1]);if(d<best){nearest=i;best=d;}});
 if(e.shiftKey){if(best<threshold){state.manual.splice(nearest,1);applyChange('manual',state.manual);}return;}
 if(best<threshold){dragIndex=nearest;$('mainCanvas').setPointerCapture(e.pointerId);}else if(state.manual.length<5000){state.manual.push([Math.round(p.x*10)/10,Math.round(p.y*10)/10,0]);applyChange('manual',state.manual);}else toast('LEDは5,000個まで配置できます。');
});
$('mainCanvas').addEventListener('pointermove',e=>{if(dragIndex<0||state.layout!=='manual'||!map)return;const p=mousePoint(e);if(!O.shapeInfo(state).inside(p.x,p.y))return;state.manual[dragIndex]=[Math.round(p.x*10)/10,Math.round(p.y*10)/10,state.manual[dragIndex][2]||0];drawMain();});
function endDrag(){if(dragIndex>=0){dragIndex=-1;applyChange('manual',state.manual);}}
$('mainCanvas').addEventListener('pointerup',endDrag);$('mainCanvas').addEventListener('pointercancel',endDrag);
$('convertManual').addEventListener('click',()=>{state.manual=structuredClone(lastAutoLEDs);state.view='layout';applyChange('layout','manual');});
$('clearManual').addEventListener('click',()=>applyChange('manual',[]));
$('pathDrawBtn').addEventListener('click',()=>{drawingPath=true;pathDraft=[];applyChange('view','layout');toast('輪郭内をクリックして経路の点を追加します。Enterで確定、Escapeで取り消します。');});
function finishPath(){if(!drawingPath)return;if(pathDraft.length<2){toast('経路には2点以上が必要です。');return;}drawingPath=false;applyChange('path',pathDraft.map(p=>p.join(',')).join('\n'));pathDraft=[];drawMain();}
$('pathFinishBtn').addEventListener('click',finishPath);
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(drawingPath){drawingPath=false;pathDraft=[];drawMain();toast('経路の描画を取り消しました。');}closeModal();}if(e.key==='Enter'&&drawingPath&&document.activeElement.tagName!=='TEXTAREA')finishPath();});
function download(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
$('saveBtn').addEventListener('click',()=>{download('diffusion-settings-'+stamp()+'.json',new Blob([JSON.stringify({app:'Diffusion Lab',schemaVersion:2,savedAt:new Date().toISOString(),state},null,2)],{type:'application/json'}));toast('設定JSONを保存しました。');});
$('loadBtn').addEventListener('click',()=>$('fileInput').click());
$('fileInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2*1024*1024)throw Error('設定ファイルは2 MB以下にしてください。');const data=JSON.parse(await f.text());if(data.schemaVersion&&![1,2].includes(data.schemaVersion))throw Error('この設定ファイルの版には対応していません。');const s=data.state||data;if(!s||typeof s!=='object'||Array.isArray(s)||!('width' in s)||!('gap' in s))throw Error('Diffusion Labの設定JSONではありません。');const loaded=O.normalize(s);O.makeLEDs(loaded);state=loaded;persist();syncControls();clearSweepForChange();requestCompute(0);toast('設定を読み込みました。');}catch(error){toast('読み込みできません: '+error.message);}finally{e.target.value='';}});
$('csvBtn').addEventListener('click',()=>{if(!result)return;const r=result,lines=['x_mm,y_mm,in_evaluation_region,R_cd_m2,G_cd_m2,B_cd_m2,total_cd_m2,incident_total_lux'];for(let y=0;y<r.ny;y++)for(let x=0;x<r.nx;x++){const i=y*r.nx+x;if(!r.mask[i])continue;const v=r.fields.map(f=>f[i]);lines.push([(x+.5)*r.dx-r.state.width/2,(y+.5)*r.dy-r.state.height/2,r.roiMask[i],...v,v[0]+v[1]+v[2],r.irradiance.reduce((sum,f)=>sum+f[i],0)].map(n=>typeof n==='number'?Number(n.toPrecision(8)):n).join(','));}download('diffusion-grid-'+stamp()+'.csv',new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));toast('線形データをCSVで保存しました。');});
$('pngBtn').addEventListener('click',()=>{
 if(!result)return;const r=result,c=document.createElement('canvas');c.width=1600;c.height=1060;const ctx=c.getContext('2d');ctx.fillStyle='#10131a';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#eef0f8';ctx.font='bold 34px system-ui,sans-serif';ctx.fillText('Diffusion Lab — LED 面発光シミュレーション',64,76);ctx.fillStyle='#a0a9bf';ctx.font='18px system-ui,sans-serif';ctx.fillText('正面・平行平面の近似 / 未校正 / 同一露出で比較',64,113);ctx.fillStyle='#0b0e14';ctx.fillRect(48,150,1504,620);drawSurface(ctx,r,{x:110,y:190,w:1380,h:530},displayOptions());ctx.fillStyle='#edf0f8';ctx.font='24px ui-monospace,monospace';ctx.fillText(`${format(r.state.width,0)} × ${format(r.state.height,0)} mm   |   d = ${format(r.state.gap,2)} mm   |   ${O.ledDescription(r.state).label}   |   ${r.leds.length} LEDs`,64,819);ctx.font='19px system-ui,sans-serif';ctx.fillStyle='#a0a9bf';ctx.fillText(`均一さ P5/P95: ${r.stats.robust===null?'—':format(r.stats.robust*100,1)}%   平均輝度: ${format(r.stats.mean,1)} cd/m²   端除外: ${r.state.roi} mm`,64,858);ctx.fillText(`材料 ${r.state.argb} / 厚さ ${r.state.thickness} mm / 透過率 ${r.state.transmission}% / 拡散成分 ${r.state.diffuse}% / σ ${format(r.state.thickness*r.state.spread,2)} mm`,64,892);ctx.fillText(`LED出力 ${r.state.brightness}% / ピッチ ${format(r.pitch,2)} mm / 半値角全幅 ${r.state.angle}° / 表示露出 ${state.exposure} EV`,64,926);ctx.fillStyle='#7b86a1';ctx.font='16px system-ui,sans-serif';const ledInfo=O.ledDescription(r.state);ctx.fillText(`有効幅 ${format(r.state.aperture,3)} mm（${ledInfo.widthBasis}） / 半値角全幅 ${r.state.angle}°（${ledInfo.angleBasis}）`,64,960);ctx.fillText('未校正の比較モデル。開口寸法からの幅は近似、未記載値は仮定。反射・屈折・曲面は非対応。',64,989);ctx.fillText('Diffusion Lab 1.0  |  '+new Date().toISOString(),64,1017);c.toBlob(blob=>{if(blob)download('diffusion-preview-'+stamp()+'.png',blob);else toast('PNG生成に失敗しました。');},'image/png');
});
let modalReturn=null;
function showModal(){modalReturn=document.activeElement;$('modelModal').hidden=false;$('closeModal').focus();}
function closeModal(){if(!$('modelModal').hidden){$('modelModal').hidden=true;if(modalReturn)modalReturn.focus();}}
$('modelBtn').addEventListener('click',showModal);$('closeModal').addEventListener('click',closeModal);$('modelModal').addEventListener('click',e=>{if(e.target===$('modelModal'))closeModal();});
$('modelModal').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const list=Array.from($('modelModal').querySelectorAll('button,a'));const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
$('mobileToggle').addEventListener('click',()=>{const open=$('sidebar').classList.toggle('open');$('mobileToggle').textContent=open?'条件を隠す':'条件を表示';});
$('selfTestBtn').addEventListener('click',()=>{
 const failures=[];function check(name,test){if(!test)failures.push(name);}
 check('逆二乗則',Math.abs(O.kernelValue(0,0,10,1)/O.kernelValue(0,0,20,1)-4)<1e-9);
 check('sRGB往復',Math.abs(O.linearToSrgb(O.srgbToLinear(.5))-.5)<1e-8);
 check('ARGB無着色',O.getFilter('#00FF0000').every(v=>Math.abs(v-1)<1e-12));
 check('ARGB色フィルタ',O.getFilter('#FFFF0000')[1]===0);
 const re=new Float32Array(64),im=new Float32Array(64);re[13]=1;O.fft2(re,im,8,8);O.fft2(re,im,8,8,true);check('FFT往復',Math.abs(re[13]-1)<1e-5&&re.every((v,i)=>i===13||Math.abs(v)<1e-5));
 toast(failures.length?'セルフテスト失敗: '+failures.join(' / '):'セルフテスト 5/5 合格：逆二乗則・色変換・ARGB・FFT。実物との一致を保証するテストではありません。');
});
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderAll,80);}).observe($('canvasWrap'));
window.addEventListener('beforeunload',()=>{if(worker)worker.terminate();if(sweepWorker)sweepWorker.terminate();});
// Read-only diagnostics and an explicit setter are useful for reproducible validation.
window.DiffusionLab={getState:()=>structuredClone(state),getResult:()=>result,setState:s=>{state=O.normalize({...state,...s});persist();syncControls();clearSweepForChange();requestCompute(0);},isBusy:()=>busy||pending!==null,getSweep:()=>sweepResults,version:'1.0'};
syncControls();initWorker();renderAll();requestCompute(0);
})();
