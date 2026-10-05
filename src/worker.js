'use strict';
const solver=new Optics.Solver();
self.onmessage=function(e){const {id,type,state,distances}=e.data;
 try{
  if(type==='sweep'){
   for(let i=0;i<distances.length;i++){
    const result=solver.solve({...state,gap:distances[i]},{resolution:160});
    self.postMessage({id,type:'sweepItem',index:i,total:distances.length,result});
   }
   self.postMessage({id,type:'sweepDone'});
  }else{
   const result=solver.solve(state);
   const transfers=[...result.fields,...result.irradiance,result.mask,result.roiMask].map(a=>a.buffer);
   self.postMessage({id,type:'result',result},transfers);
  }
 }catch(error){self.postMessage({id,type:'error',message:error.message||String(error)});}
};
