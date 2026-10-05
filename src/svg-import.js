/* SVGのパスだけを読み取り、輪郭を数値へ変換する。元の文書を画面へ挿入しない。 */
(function(root){
'use strict';
const NS='http://www.w3.org/2000/svg',MAX_POINTS=2048,MAX_COMMANDS=1024;
const count={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
const number=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
function splitPath(d){
 if(typeof d!=='string'||!d.trim()||d.length>100000)throw Error('パスのd属性を入力してください（最大100,000文字）。');
 let i=0,cmd='',x=0,y=0,sx=0,sy=0,current=null,n=0,previousValue=false;const paths=[];
 function space(){while(/[\t\n\r ]/.test(d[i]||'!'))i++;}
 function value(flag=false){space();if(d[i]===','){if(!previousValue)throw Error('パスの区切りが不正です。');i++;space();}let v;
  if(flag){if(d[i]!=='0'&&d[i]!=='1')throw Error('円弧のフラグは0または1です。');v=Number(d[i++]);}
  else{const m=d.slice(i).match(number);if(!m)throw Error('パスの数値または引数の数が不正です。');i+=m[0].length;v=Number(m[0]);if(!Number.isFinite(v)||Math.abs(v)>1e9)throw Error('SVGの座標が大きすぎます。');}
  previousValue=true;return v;
 }
 function finish(){if(current)paths.push(current);current=null;}
 while(true){space();if(i>=d.length)break;
  if(/[a-zA-Z]/.test(d[i])){cmd=d[i++];previousValue=false;if(cmd.toUpperCase()==='Z'){
   if(!current)throw Error('パスはMから開始してください。');current.commands.push('Z');current.closed=true;x=sx;y=sy;cmd='';continue;
  }if(!(cmd.toUpperCase() in count))throw Error('対応していないSVGパス命令です。');}
  else if(!cmd)throw Error('SVGパス命令が必要です。');
  const c=cmd.toUpperCase(),relative=cmd!==c,a=[];
  if(!current&&c!=='M')throw Error('パスはMから開始してください。');
  if(++n>MAX_COMMANDS)throw Error('パスが複雑すぎます。1,024命令以下に簡略化してください。');
  for(let k=0;k<count[c];k++)a.push(value(c==='A'&&(k===3||k===4)));
  if(c==='A'&&(a[0]<0||a[1]<0))throw Error('円弧の半径は0以上にしてください。');
  const ox=x,oy=y;
  if(c==='H')x=(relative?ox:0)+a[0];
  else if(c==='V')y=(relative?oy:0)+a[0];
  else{x=(relative?ox:0)+a[a.length-2];y=(relative?oy:0)+a[a.length-1];}
  if(!Number.isFinite(x)||!Number.isFinite(y)||Math.max(Math.abs(x),Math.abs(y))>1e9)throw Error('SVGの座標が大きすぎます。');
  if(c==='M'){finish();sx=x;sy=y;current={commands:[`M ${x} ${y}`],closed:false};cmd=relative?'l':'L';}
  else{if(current.closed){finish();sx=ox;sy=oy;current={commands:[`M ${sx} ${sy}`],closed:false};}current.commands.push(cmd+' '+a.join(' '));}
 }
 finish();if(!paths.length)throw Error('パスがありません。');return paths;
}
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function transform(text=''){
 let m=[1,0,0,1,0,0],i=0;
 while(i<text.length){const sep=text.slice(i).match(/^[\s,]*/);i+=sep[0].length;if(i===text.length)break;
  const match=text.slice(i).match(/^(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/);if(!match)throw Error('SVGのtransform属性が不正です。');i+=match[0].length;
  const values=match[2].trim();let rest=values,a=[];while(rest){const value=rest.match(number);if(!value||!Number.isFinite(+value[0])||Math.abs(+value[0])>1e9)throw Error('SVG変換の数値が不正です。');a.push(+value[0]);rest=rest.slice(value[0].length);const sep=rest.match(/^[\s,]*/)[0];rest=rest.slice(sep.length);}
  const name=match[1],rad=(a[0]||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);let t;
  if(name==='matrix'&&a.length===6)t=a;
  else if(name==='translate'&&(a.length===1||a.length===2))t=[1,0,0,1,a[0],a[1]||0];
  else if(name==='scale'&&(a.length===1||a.length===2))t=[a[0],0,0,a.length===2?a[1]:a[0],0,0];
  else if(name==='rotate'&&(a.length===1||a.length===3)){t=[c,s,-s,c,0,0];if(a.length===3)t=multiply(multiply([1,0,0,1,a[1],a[2]],t),[1,0,0,1,-a[1],-a[2]]);}
  else if(name==='skewX'&&a.length===1)t=[1,0,Math.tan(rad),1,0,0];
  else if(name==='skewY'&&a.length===1)t=[1,Math.tan(rad),0,1,0,0];
  else throw Error('SVG変換の引数の数が不正です。');
  m=multiply(m,t);if(!m.every(Number.isFinite))throw Error('SVG変換の数値が不正です。');
 }
 return m;
}
function styleValue(el,name){const values=(el.getAttribute('style')||'').split(';');let value='';for(const item of values){const k=item.indexOf(':');if(item.slice(0,k).trim().toLowerCase()===name)value=item.slice(k+1).trim().replace(/\s*!important$/i,'');}return value;}
function read(text){
 if(typeof text!=='string'||text.length>2*1024*1024)throw Error('SVGは2 MB以下にしてください。');
 text=text.trim();if(!text)throw Error('SVGまたはパスのd属性を入力してください。');
 if(!text.startsWith('<')){splitPath(text);return {paths:[{label:'貼り付けたパス',d:text,matrix:[1,0,0,1,0,0],fillRule:'nonzero'}],cssFill:false};}
 if(/<!ENTITY/i.test(text))throw Error('ENTITY定義を含まないSVGとして保存してください。');
 // 一般的なSVG 1.1の外部DOCTYPEは参照せず、宣言だけを取り除く。
 const declaration=text.search(/<!DOCTYPE/i);if(declaration>=0){let end=declaration+9,quote='';for(;end<text.length;end++){
  const c=text[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='[')throw Error('内部DTDを含まないSVGとして保存してください。');else if(c==='>')break;
 }if(end===text.length)throw Error('DOCTYPE宣言が不正です。');text=text.slice(0,declaration)+text.slice(end+1);}
 const doc=new DOMParser().parseFromString(text,'image/svg+xml'),svg=doc.documentElement;
 if(doc.getElementsByTagName('parsererror').length||svg.localName!=='svg'||(svg.namespaceURI&&svg.namespaceURI!==NS))throw Error('SVG文書を解析できませんでした。');
 const paths=[];let cssFill=false,cssTransform=false;for(const el of doc.getElementsByTagName('*')){
  if(el.localName==='style'){if(/fill-rule\s*:/i.test(el.textContent))cssFill=true;if(/(?:^|[;{\s])transform\s*:/i.test(el.textContent))cssTransform=true;}
  if(el.localName!=='path'||(el.namespaceURI&&el.namespaceURI!==NS)||!el.getAttribute('d'))continue;
  const parents=[];let p=el,skip=false;while(p&&p.nodeType===1){parents.unshift(p);if(['defs','clipPath','mask','pattern','marker','symbol','foreignObject'].includes(p.localName))skip=true;p=p.parentElement;}
  if(skip)continue;if(paths.length>=100)throw Error('SVGのパスは100個以下にしてください。');
  let matrix=[1,0,0,1,0,0],fillRule='nonzero',unsupported='';
  for(const node of parents){
   if(node.localName==='svg'&&node!==svg)unsupported='入れ子のsvg要素は単一のSVGへ変換してください。';
   if(styleValue(node,'transform'))unsupported='CSSのtransformをSVGのtransform属性へ変換してください。';
   matrix=multiply(matrix,transform(node.getAttribute('transform')||''));
   const rule=styleValue(node,'fill-rule')||node.getAttribute('fill-rule');if(rule&&rule!=='inherit'){if(!['nonzero','evenodd'].includes(rule))unsupported='fill-ruleはnonzeroまたはevenoddを指定してください。';else fillRule=rule;}
  }
  paths.push({label:((el.getAttribute('id')||el.getAttribute('inkscape:label')||`パス ${paths.length+1}`)).slice(0,100),d:el.getAttribute('d'),matrix,fillRule,unsupported});
 }
 if(!paths.length)throw Error('取り込めるpath要素がありません。図形・文字はパスへ変換して保存してください。');
 return {paths,cssFill,cssTransform};
}
function flatten(document,index,rule='auto'){
 const selected=index==='all'?document.paths:[document.paths[Number(index)]];
 if(!selected.length||selected.some(p=>!p))throw Error('取り込むパスを選択してください。');
 if(document.cssTransform)throw Error('CSSのtransformをSVGのtransform属性へ変換してください。');
 if(document.cssFill&&rule==='auto')throw Error('CSSで指定したfill-ruleには未対応です。下の塗り規則を明示指定してください。');
 if(!['auto','nonzero','evenodd'].includes(rule))throw Error('塗り規則が不正です。');
 const svg=window.document.createElementNS(NS,'svg');svg.setAttribute('width','1');svg.setAttribute('height','1');svg.style.cssText='position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none';window.document.body.appendChild(svg);
 let pointCount=0,open=0;const shapes=[];
 try{for(const item of selected){
  if(item.unsupported)throw Error(item.unsupported);
  const subpaths=splitPath(item.d),contours=[];
  for(const sub of subpaths){
   const path=window.document.createElementNS(NS,'path');svg.appendChild(path);
   const commands=sub.closed?sub.commands:[...sub.commands,'Z'];if(!sub.closed)open++;
   let prefix='',ends=[0];for(const command of commands){prefix+=command+' ';path.setAttribute('d',prefix);const length=path.getTotalLength();if(!Number.isFinite(length)||length>1e10)throw Error('SVGのパス長が大きすぎます。');ends.push(length);}
   path.setAttribute('d',prefix);const box=path.getBBox(),m=item.matrix;
   const extent=Math.max(box.width,box.height)*Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]));
   if(!Number.isFinite(extent)||extent<=1e-9)throw Error('面積のある輪郭を指定してください。');
   const tolerance=extent*.0005,points=[];
   const at=length=>{const q=path.getPointAtLength(length);const p=[m[0]*q.x+m[2]*q.y+m[4],m[1]*q.x+m[3]*q.y+m[5]];if(!p.every(Number.isFinite))throw Error('SVGの座標が不正です。');return p;};
   function append(p){const prev=points[points.length-1];if(prev&&Math.hypot(p[0]-prev[0],p[1]-prev[1])<extent*1e-9)return;if(++pointCount>MAX_POINTS)throw Error('輪郭が複雑すぎます。2,048頂点以下になるようパスを簡略化してください。');points.push(p);}
   function distance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
   function sample(a,b,p,q,depth=0){
    const mid=(a+b)/2,r=at(mid),u=at((a+mid)/2),v=at((mid+b)/2),error=Math.max(distance(r,p,q),distance(u,p,q),distance(v,p,q));
    if(error>tolerance){if(depth>=16)throw Error('輪郭の曲線を十分な精度で近似できませんでした。パスを簡略化してください。');sample(a,mid,p,r,depth+1);sample(mid,b,r,q,depth+1);}else append(q);
   }
   append(at(0));for(let k=1;k<ends.length;k++)if(ends[k]-ends[k-1]>1e-9)sample(ends[k-1],ends[k],at(ends[k-1]),at(ends[k]));
   // ブラウザの曲線計測はFloat32相当の丸めを含むため、閉じた終点の微小なずれを吸収する。
   if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<extent*1e-6){points.pop();pointCount--;}
   if(points.length<3||!points.some(p=>distance(p,points[0],points[1])>extent*1e-8))throw Error('面積のある輪郭を指定してください。');
   contours.push(points);path.remove();
  }
  shapes.push({contours,fillRule:rule==='auto'?item.fillRule:rule});
 }
 const all=shapes.flatMap(s=>s.contours.flat()),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
 if(width<=1e-9||height<=1e-9)throw Error('幅と高さのある輪郭を指定してください。');
 for(const shape of shapes)for(const contour of shape.contours)for(const p of contour){p[0]=(p[0]-x)/width*100;p[1]=(p[1]-y)/height*100;}
 return {shapes,aspect:height/width,points:pointCount,contours:shapes.reduce((n,s)=>n+s.contours.length,0),open,label:selected.length===1?selected[0].label:`${selected.length}パスの輪郭`};
 }finally{svg.remove();}
}
const api={splitPath,transform,multiply,read,flatten};root.SVGImport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
