import {describe,it,expect} from 'vitest';
import {deriveDelta,disclosureCoverage,releaseCoverage,parseManifest,rawUrl} from './verify';

const baseline=parseManifest({version:1,period:1,title:'Base',records:[{id:'a',value:'Old'},{id:'b',value:'Keep'}],changes:[]},1);

describe('public release verifier',()=>{
  it('treats the initial snapshot as a baseline, not an undisclosed change',()=>{
    expect(releaseCoverage(null,deriveDelta(null,baseline),baseline)).toMatchObject({ok:true,missing:[],unexpected:[]});
  });
  it('derives the longitudinal delta and matches disclosures',()=>{
    const current=parseManifest({version:1,period:2,title:'Next',records:[{id:'a',value:'New'},{id:'c',value:'Added'}],changes:[{id:'a',kind:'corrected',reason:'Value changed from Old to New.'},{id:'b',kind:'removed',reason:'Record b was retired from this feed.'},{id:'c',kind:'added',reason:'Record c was newly published.'}]},2);
    const delta=deriveDelta(baseline,current);
    expect(delta).toMatchObject({added:['c'],corrected:['a'],removed:['b']});
    expect(disclosureCoverage(delta,current).ok).toBe(true);
  });
  it('flags silent removals',()=>{
    const current=parseManifest({version:1,period:2,title:'Next',records:[{id:'a',value:'Old'}],changes:[]},2);
    expect(disclosureCoverage(deriveDelta(baseline,current),current)).toMatchObject({ok:false,missing:['b']});
  });
  it('rejects moving refs and unsafe source paths',()=>{
    expect(()=>rawUrl('owner','repo','main','release.json')).toThrow();
    expect(()=>rawUrl('owner','repo','a'.repeat(40),'../secret.json')).toThrow();
  });
});
