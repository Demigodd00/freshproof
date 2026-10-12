import {beforeEach,describe,expect,it,vi} from 'vitest';

const {getContractCode,getTransaction}=vi.hoisted(()=>({
  getContractCode:vi.fn(),
  getTransaction:vi.fn(),
}));

vi.mock('genlayer-js',()=>({
  createClient:()=>({getContractCode,getTransaction}),
  chains:{studionet:{}},
}));
vi.mock('genlayer-js/types',()=>({TransactionHashVariant:{LATEST_FINAL:'latest-final'}}));

import {pollPending,verifyContractSource} from './chain';
import {sha256} from './verify';

const address='0x'+'1'.repeat(40);
const hash='0x'+'a'.repeat(64);
const source='class FreshProof: pass\n';
const entries=new Map<string,string>();

beforeEach(()=>{
  entries.clear();
  vi.stubGlobal('localStorage',{
    getItem:(key:string)=>entries.get(key)??null,
    setItem:(key:string,value:string)=>{entries.set(key,value);},
    removeItem:(key:string)=>{entries.delete(key);},
  });
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,text:async()=>source}));
  getContractCode.mockReset();
  getTransaction.mockReset();
});

describe('source-verified contract access',()=>{
  it('accepts a finalized contract only when its code matches the published source',async()=>{
    const digest=await sha256(new TextEncoder().encode(source));
    getContractCode.mockResolvedValueOnce(source).mockResolvedValueOnce('different code');
    await expect(verifyContractSource(address as `0x${string}`,digest)).resolves.toBe(address);
    await expect(verifyContractSource(address as `0x${string}`,digest)).rejects.toThrow('Onchain source does not match');
  });

  it('retains an ambiguous deploy hash rather than allowing a duplicate submission',async()=>{
    entries.set('freshproof:pending:61999',JSON.stringify({hash,method:'deploy',address:'0x'+'0'.repeat(40),account:address,createdAt:1}));
    getTransaction.mockResolvedValueOnce({statusName:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN',resultName:'SUCCESS'});
    await expect(pollPending()).resolves.toMatchObject({state:'unknown'});
    expect(entries.has('freshproof:pending:61999')).toBe(true);
  });

  it('reads the deployed address from the SDK transaction format',async()=>{
    entries.set('freshproof:pending:61999',JSON.stringify({hash,method:'deploy',address:'0x'+'0'.repeat(40),account:address,createdAt:1}));
    getTransaction.mockResolvedValueOnce({statusName:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN',resultName:'SUCCESS',txDataDecoded:{contractAddress:address}});
    await expect(pollPending()).resolves.toMatchObject({state:'success',contractAddress:address});
    expect(entries.has('freshproof:pending:61999')).toBe(false);
  });
});
