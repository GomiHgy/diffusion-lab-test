/* Diffusion Lab — axial, folded LED tape inside a diffusing cylinder.
 * 同じ軸上の点光源を逆向きの2面へ並べる比較モデル。反射・遮蔽は計算しない。 */
(function(root){
'use strict';
const PI=Math.PI,MAX_LEDS=5000,MAX_RESOLUTION=448;
let axialCache=null;
const blurCache=new Map();
function positive(s,key,label){const v=Number(s[key]);if(!Number.isFinite(v)||v<=0)throw Error(label+'には正の数値を指定してください。');return v;}
function dimensions(s){
 const diameter=positive(s,'cylinderDiameter','円筒の内径'),length=positive(s,'cylinderLength','円筒の長さ'),tapeLength=positive(s,'cylinderTapeLength','折返し後の片側テープ長'),tapeWidth=positive(s,'tapeWidth','LEDテープの幅'),packageSize=positive(s,'packageSize','LED外形の代表幅'),density=positive(s,'density','LED密度');
 const footprint=Math.max(tapeWidth,packageSize),pitch=1000/density;
 if(diameter<10||diameter>2000||length<10||length>2000||tapeLength<1||tapeLength>2000)throw Error('円筒の内径・長さは10〜2,000 mm、片側テープ長は1〜2,000 mmで指定してください。');
 if(tapeWidth<.1||tapeWidth>100||packageSize<.5||packageSize>20||!Number.isFinite(pitch))throw Error('テープ幅・LED外形幅・密度が計算範囲外です。');
 if(tapeLength>length+1e-9)throw Error('折返し後の片側テープ長は円筒の長さ以下にしてください。');
 if(footprint>=diameter)throw Error('テープ幅とLED外形幅は円筒の内径より小さくしてください。');
 if(tapeLength<footprint)throw Error('片側テープ長が基板の端部・LED外形より短いため配置できません。');
 const perSideLEDs=Math.floor((tapeLength-footprint)/pitch+1e-10)+1;
 if(perSideLEDs*2>MAX_LEDS)throw Error('両面合計のLED数が5,000個を超えます。密度または片側テープ長を減らしてください。');
 const angle=Number(s.cylinderAngle);if(!Number.isFinite(angle))throw Error('円筒内のLED発光方向には数値を指定してください。');
 return {diameter,length,tapeLength,tapeWidth,packageSize,pitch,perSideLEDs,angle,innerRadius:diameter/2};
}
function layout(O,s){
 const d=dimensions(s),total=d.perSideLEDs*2,colors=O.ledColors(s,total),a=d.angle*PI/180,normal=[Math.cos(a),0,Math.sin(a)],leds=[];
 if(!colors.every(rgb=>rgb.length===3&&rgb.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('LEDの点灯出力が計算範囲外です。');
 for(let i=0;i<total;i++){
  const side=i<d.perSideLEDs?0:1,j=side?total-1-i:i,y=(j-(d.perSideLEDs-1)/2)*d.pitch,n=normal.map(v=>side&&v!==0?-v:v);
  leds.push({x:0,y,angle:0,index:i,tapeIndex:0,rgb:colors[i].slice(),side,position3D:[0,y,0],normal3D:n});
 }
 return {leds,tapeLengths:[total],discarded:0,pitch:d.pitch,splitCount:0,invalidTapes:[]};
}
function weights(sigma,n,periodic){
 const key=[sigma,n,periodic].join('/');if(blurCache.has(key))return blurCache.get(key);
 const radius=Math.ceil(3*sigma),raw=new Float64Array(2*radius+1);let sum=0;
 for(let k=-radius;k<=radius;k++){const w=Math.exp(-.5*(k/sigma)**2);raw[k+radius]=w;sum+=w;}
 const out=[];
 if(periodic){
  const wrapped=new Float64Array(n);for(let k=-radius;k<=radius;k++)wrapped[((k%n)+n)%n]+=raw[k+radius]/sum;
  for(let i=0;i<n;i++)if(wrapped[i]>0)out.push([i,wrapped[i]]);
 }else for(let k=Math.max(-radius,1-n);k<=Math.min(radius,n-1);k++)out.push([k,raw[k+radius]/sum]);
 if(blurCache.size>=8)blurCache.delete(blurCache.keys().next().value);blurCache.set(key,out);return out;
}
// 円周は周期境界、軸端はゼロ。端の不足分を再正規化せず光の流出を残す。
function diffuseCylinder(input,nx,ny,sigmaX,sigmaY){
 let out=input;
 if(sigmaX>=.15){const kernel=weights(sigmaX,nx,true),dst=new Float32Array(input.length);
  for(let y=0;y<ny;y++){const row=y*nx;for(let x=0;x<nx;x++){let v=0;for(const [k,w] of kernel){let xx=x+k;if(xx>=nx)xx-=nx;v+=out[row+xx]*w;}dst[row+x]=v;}}out=dst;
 }
 if(sigmaY>=.15){const kernel=weights(sigmaY,ny,false),dst=new Float32Array(input.length);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){let v=0;for(const [k,w] of kernel){const yy=y+k;if(yy>=0&&yy<ny)v+=out[yy*nx+x]*w;}dst[y*nx+x]=v;}out=dst;
 }
 return out;
}
function axialKernel(d,m,ny){
 const key=JSON.stringify([d.innerRadius,d.length,d.pitch,d.perSideLEDs,m,ny]);if(axialCache&&axialCache.key===key)return axialCache.values;
 const values=new Float64Array(ny*d.perSideLEDs),R=d.innerRadius,dy=d.length/ny;
 for(let j=0;j<ny;j++){
  const y=(j+.5)*dy-d.length/2;for(let i=0;i<d.perSideLEDs;i++){
   const delta=y-(i-(d.perSideLEDs-1)/2)*d.pitch,r2=R*R+delta*delta;
   // R^(m+1)/r^(m+3)を直接計算すると狭い配光で桁あふれするため比で計算。
   values[j*d.perSideLEDs+i]=1e6/r2*Math.pow(R/Math.sqrt(r2),m+1);
  }
 }
 axialCache={key,values};return values;
}
function solve(O,s,options={}){
 const start=Date.now(),d=dimensions(s),geo=layout(O,s);
 if(Number(s.diffuse)!==100)throw Error('円筒モードは拡散成分比100%の材料に対応しています。透明・低拡散材の透過像は未対応です。');
 const thickness=positive(s,'thickness','拡散筒の厚さ'),spread=Number(s.spread),roi=Number(s.roi),angle=Number(s.angle);
 if(thickness>30||!Number.isFinite(spread)||spread<0||spread>5)throw Error('円筒の厚さ・内部にじみ係数が計算範囲外です。');
 if(!Number.isFinite(roi)||roi<0||!Number.isFinite(angle)||angle<10||angle>175)throw Error('評価領域またはLED配光が計算範囲外です。');
 const resolution=Number(options.resolution??s.quality);if(!Number.isInteger(resolution)||resolution<16||resolution>MAX_RESOLUTION)throw Error('円筒の計算解像度は16〜448点の整数で指定してください。');
 const outerRadius=d.innerRadius+thickness,innerCircumference=2*PI*d.innerRadius,outerCircumference=2*PI*outerRadius,step=Math.max(outerCircumference,d.length)/resolution;
 const nx=Math.max(16,Math.round(outerCircumference/step)),ny=Math.max(16,Math.round(d.length/step)),dx=outerCircumference/nx,dy=d.length/ny,innerDx=innerCircumference/nx;
 const state={...s,shape:'rect',width:outerCircumference,height:d.length,gap:d.innerRadius},mask=new Uint8Array(nx*ny).fill(1),roiMask=new Uint8Array(nx*ny);
 for(let j=0;j<ny;j++){const y=(j+.5)*dy;for(let i=0;i<nx;i++)roiMask[j*nx+i]=Math.min(y,d.length-y)>=roi?1:0;}
 const m=-Math.log(2)/Math.log(Math.cos(angle*PI/360)),kernel=axialKernel(d,m,ny),factors=[new Float64Array(nx),new Float64Array(nx)],a=d.angle*PI/180;
 for(let i=0;i<nx;i++){const phi=(i+.5)*2*PI/nx,c=Math.cos(phi-a);factors[0][i]=Math.pow(Math.max(0,c),m);factors[1][i]=Math.pow(Math.max(0,-c),m);}
 const irradiance=[0,1,2].map(()=>new Float32Array(nx*ny)),mcd=[s.mcdR,s.mcdG,s.mcdB].map(Number);
 if(!mcd.every(v=>Number.isFinite(v)&&v>=0&&v<=200000))throw Error('RGB正面光度が計算範囲外です。');
 for(let j=0;j<ny;j++){
  const sums=[[0,0,0],[0,0,0]];for(let i=0;i<d.perSideLEDs;i++){
   const k=kernel[j*d.perSideLEDs+i],front=geo.leds[i].rgb,back=geo.leds[geo.leds.length-1-i].rgb;
   for(let c=0;c<3;c++){sums[0][c]+=k*mcd[c]*.001*front[c];sums[1][c]+=k*mcd[c]*.001*back[c];}
  }
  for(let i=0;i<nx;i++)for(let c=0;c<3;c++)irradiance[c][j*nx+i]=sums[0][c]*factors[0][i]+sums[1][c]*factors[1][i];
 }
 const filter=O.getFilter(s.argb),transmission=Number(s.transmission)/100,ratio=d.innerRadius/outerRadius,sigma=thickness*spread;
 if(!Number.isFinite(transmission)||transmission<0||transmission>1)throw Error('透過率が計算範囲外です。');
 const fields=irradiance.map((E,c)=>{const blurred=diffuseCylinder(E,nx,ny,sigma/innerDx,sigma/dy),L=new Float32Array(E.length),scale=transmission*filter[c]*ratio/PI;for(let i=0;i<L.length;i++)L[i]=Math.max(0,blurred[i]*scale);return L;});
 const stats=O.statistics(fields,mask,roiMask,nx,ny,dx,dy),warnings=[
  '円筒は中心軸上の点光源近似です。有効発光幅・RGBダイ分離・発光面間の距離は再現していません。',
  '1本のLEDテープを折って背中合わせにした2面を、1群の配線順で扱います。実際の曲げ半径・折返し部分・コネクタはモデル化していません。',
  '円筒内の棒・基板による遮蔽、内面反射・多重反射・屈折は計算していません。円周の拡散は周期境界、軸端は光の流出として近似しています。'
 ];
 if(!stats.validROI){roiMask.set(mask);warnings.push('軸端の除外幅では評価領域が残らないため、全面で集計しました。');}
 if(Math.max(innerDx,dy)>d.innerRadius/2||360/nx>angle/4)warnings.push('円筒の径・配光に対して計算格子が粗い条件です。高精細で確認してください。');
 const threeMax=O.ledProfiles?.[s.ledModel]?.photometry.threeChannelMax;if(threeMax&&geo.leds.some(led=>led.rgb.every(v=>v>0)&&Math.max(...led.rgb)>threeMax/100+1e-9))warnings.push(`参照SK6812-012ではRGB3色同時点灯は${threeMax}%灰階で使用します（資料p.3）。現在その条件を超えるLEDがあります。計算は入力値のままです。`);
 const cylinder={innerRadius:d.innerRadius,outerRadius,innerDiameter:d.diameter,outerDiameter:2*outerRadius,innerCircumference,outerCircumference,length:d.length,tapeLength:d.tapeLength,totalTapeLength:2*d.tapeLength,perSideLEDs:d.perSideLEDs,folded:true,axis:'y',angleDegrees:d.angle};
 return {state,nx,ny,dx,dy,fields,irradiance,mask,roiMask,stats,...geo,warnings,ms:Date.now()-start,cylinder};
}
const api={layout,solve,diffuseCylinder};root.CylinderOptics=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
