/* 接続したLEDテープを剛体として編集する。入力データは変更しない。 */
(function(root){
'use strict';
const rad=Math.PI/180;
function copy(layout){return {manual:layout.manual.map(p=>p.slice()),tapeLengths:layout.tapeLengths.slice()};}
function indices(O,layout,selected){const ranges=O.tapeRanges(layout);return selected===null?ranges.map(t=>t.index):selected;}
function points(O,layout,selected){const wanted=new Set(indices(O,layout,selected));return O.tapeRanges(layout).filter(t=>wanted.has(t.index)).flatMap(t=>layout.manual.slice(t.start,t.start+t.length));}
function bounds(O,s,layout,selected=null){const wanted=new Set(indices(O,layout,selected));let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const tape of O.tapeRanges(layout)){if(!wanted.has(tape.index))continue;const footprints=O.tapeFootprints(s,layout.manual.slice(tape.start,tape.start+tape.length));for(const polygon of [...footprints.tapes,...footprints.packages])for(const p of polygon){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}}
 if(!Number.isFinite(x0))throw Error('編集するLEDテープを選択してください。');return {x0,y0,x1,y1};}
function validate(O,s,layout,selected=null){const wanted=new Set(indices(O,layout,selected));for(const tape of O.tapeRanges(layout))if(wanted.has(tape.index)&&!O.tapeFits(s,layout.manual.slice(tape.start,tape.start+tape.length)))throw Error('テープの幅・端部・LED間の接続が輪郭内に収まる位置・角度を指定してください。');return layout;}
function rotation(O,layout,index){const tape=O.tapeRanges(layout)[index];if(!tape)throw Error('回転するLEDテープを選択してください。');return ((layout.manual[tape.start][2]/rad+180)%360+360)%360-180;}
function rotate(O,s,layout,index,degrees){if(!Number.isFinite(degrees))throw Error('角度に数値を入力してください。');const tape=O.tapeRanges(layout)[index];if(!tape)throw Error('回転するLEDテープを選択してください。');const out=copy(layout),ps=points(O,layout,[index]),cx=ps.reduce((a,p)=>a+p[0],0)/ps.length,cy=ps.reduce((a,p)=>a+p[1],0)/ps.length,delta=(degrees-rotation(O,layout,index))*rad,c=Math.cos(delta),sn=Math.sin(delta);
 for(let i=tape.start;i<tape.start+tape.length;i++){const p=layout.manual[i],x=p[0]-cx,y=p[1]-cy;out.manual[i]=[cx+x*c-y*sn,cy+x*sn+y*c,(p[2]||0)+delta];}return validate(O,s,out,[index]);}
function align(O,s,layout,selected,mode){const ids=indices(O,layout,selected),b=bounds(O,s,layout,ids),inset=s.inset;let dx=0,dy=0;
 if(mode==='left')dx=-s.width/2+inset-b.x0;else if(mode==='right')dx=s.width/2-inset-b.x1;else if(mode==='centerX')dx=-(b.x0+b.x1)/2;else if(mode==='top')dy=-s.height/2+inset-b.y0;else if(mode==='bottom')dy=s.height/2-inset-b.y1;else if(mode==='centerY')dy=-(b.y0+b.y1)/2;else throw Error('整列方向が不正です。');
 const out=copy(layout),wanted=new Set(ids);for(const t of O.tapeRanges(layout))if(wanted.has(t.index))for(let i=t.start;i<t.start+t.length;i++){out.manual[i][0]+=dx;out.manual[i][1]+=dy;}return validate(O,s,out,ids);}
function overlaps(a,b){return a.x0<b.x1+1&&a.x1>b.x0-1&&a.y0<b.y1+1&&a.y1>b.y0-1;}
function resize(O,s,layout,count,selected=-1){if(!Number.isInteger(count)||count<0||count>100)throw Error('LEDテープの本数は0〜100の整数で指定してください。');const out=copy(layout);if(!count)return {manual:[],tapeLengths:[]};
 if(count<out.tapeLengths.length){out.manual=out.manual.slice(0,out.tapeLengths.slice(0,count).reduce((a,b)=>a+b,0));out.tapeLengths=out.tapeLengths.slice(0,count);return out;}
 if(count===out.tapeLengths.length)return out;
 if(!out.manual.length){
  // 凹形の中央行が複数群に分かれても、最初の適合群を1本の種にする。
  // 中央が穴・空白なら通常の列間隔で探し、輪郭を跨ぐ接続を作らない。
  let auto=O.tapeLayout({...s,layout:'rows',tapeCount:0,rowSpacing:s.height*2,rotation:0});
  if(!auto.manual.length)auto=O.tapeLayout({...s,layout:'rows',tapeCount:0,rotation:0});
  const seed=O.tapeRanges(auto)[0];if(!seed)throw Error('輪郭内に新しいテープを配置できません。');
  out.manual=auto.manual.slice(seed.start,seed.start+seed.length);out.tapeLengths=[seed.length];
 }
 const ranges=O.tapeRanges(out),source=ranges[selected]||ranges[ranges.length-1],original=out.manual.slice(source.start,source.start+source.length),single={manual:original,tapeLengths:[original.length]},bb=bounds(O,s,single),stepX=Math.max(s.tapeWidth,bb.x1-bb.x0+2),stepY=Math.max(s.tapeWidth,bb.y1-bb.y0+2),candidates=[];
 if(out.manual.length+(count-out.tapeLengths.length)*original.length>5000)throw Error('LED数が5,000個を超えます。');
 const nx=Math.min(100,Math.ceil(s.width/stepX)),ny=Math.min(100,Math.ceil(s.height/stepY));for(let j=-ny;j<=ny;j++)for(let i=-nx;i<=nx;i++)if(i||j)candidates.push([i*stepX,j*stepY]);candidates.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b)||a[1]-b[1]||a[0]-b[0]);
 while(out.tapeLengths.length<count){const occupied=O.tapeRanges(out).map(t=>bounds(O,s,out,[t.index]));let added=false;
  for(const [dx,dy] of candidates){const moved={manual:original.map(p=>[p[0]+dx,p[1]+dy,p[2]]),tapeLengths:[original.length]},b=bounds(O,s,moved);if(occupied.some(a=>overlaps(a,b)))continue;try{validate(O,s,moved);}catch(_){continue;}out.manual.push(...moved.manual);out.tapeLengths.push(original.length);added=true;break;}
  if(!added)throw Error('指定本数のテープを重ならずに配置できません。板を広げるか、本数・テープ長を減らしてください。');
 }return out;
}
const api={bounds,rotation,rotate,align,resize,validate};root.TapeTools=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
