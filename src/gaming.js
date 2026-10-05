/* 周期演出のPWMと、線形な光学計算結果の時間補間。 */
(function(root){
'use strict';
const scenes={rainbowWave:{label:'レインボーウェーブ',period:6},chase:{label:'RGBチェイス',period:5},breathe:{label:'虹色ブリージング',period:8},cyberPulse:{label:'シアン・マゼンタパルス',period:4}};
const wrap=v=>((v%1)+1)%1;
function hsv(h){h=wrap(h);const i=Math.floor(h*6),f=h*6-i;return [[1,f,0],[1-f,1,0],[0,1,f],[0,1-f,1],[f,0,1],[1,0,1-f]][i%6];}
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
function colors(s,n){const phase=wrap(s.gamingPhase||0),out=[];for(let i=0;i<n;i++){const x=i/Math.max(n,1);let c;
 if(s.gamingScene==='chase'){const d=wrap(x-phase),v=.03+.97*Math.exp(-(Math.min(d,1-d)**2)/.012);c=hsv(phase+x).map(vv=>vv*v);}
 else if(s.gamingScene==='breathe'){const v=.08+.92*(1-Math.cos(phase*2*Math.PI))/2;c=hsv(phase+x*.35).map(vv=>vv*v);}
 else if(s.gamingScene==='cyberPulse'){const t=(1+Math.sin(2*Math.PI*(x*2-phase)))/2;c=[t,.9*(1-t),1];}
 else c=hsv(x-phase);
 out.push(c.map(v=>(s.pwmMode==='srgb'?linear(v):v)*s.brightness/100));}return out;}
function interpolate(frames,phase,out=null){const p=wrap(phase)*frames.length,i=Math.floor(p),t=p-i,a=frames[i],b=frames[(i+1)%frames.length];if(!a||!b)throw Error('演出の計算フレームが不足しています。');
 if(!out||out.nx!==a.nx||out.ny!==a.ny)out={...a,state:{...a.state},fields:a.fields.map(f=>new Float32Array(f.length)),irradiance:a.irradiance.map(f=>new Float32Array(f.length)),leds:a.leds.map(led=>({...led,rgb:led.rgb.slice()}))};
 for(const key of ['fields','irradiance'])for(let c=0;c<3;c++){const dst=out[key][c],aa=a[key][c],bb=b[key][c];for(let k=0;k<dst.length;k++)dst[k]=aa[k]*(1-t)+bb[k]*t;}
 out.leds.forEach((led,k)=>{for(let c=0;c<3;c++)led.rgb[c]=a.leds[k].rgb[c]*(1-t)+b.leds[k].rgb[c]*t;});out.state.gamingPhase=wrap(phase);return out;
}
const api={scenes,colors,interpolate,wrap};root.Gaming=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
