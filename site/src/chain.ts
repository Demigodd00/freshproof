import {createClient,chains} from 'genlayer-js';
import {TransactionHashVariant} from 'genlayer-js/types';
import type {Manifest} from './verify';
import {sha256} from './verify';

export type Address=`0x${string}`;
export type Hash=`0x${string}`;
export type Provider={request(args:{method:string;params?:unknown[]}):Promise<unknown>};
export type Deployment={network:'studionet';chainId:number;address:string|null;sourceSha256:string|null;verified:boolean;note?:string};
export type Pending={hash:Hash;method:string;address:Address;account:Address;createdAt:number;sourceSha256?:string};
export type ChainState={sponsor:string;publisher:string;repo:string;manifest_path:string;disclosure_rule:string;start_unix:string;period_seconds:string;grace_seconds:string;epoch_count:string;reward_atto:string;funded:boolean;next_epoch:string;last_pass_commit:string;last_pass_digest:string;last_pass_epoch:string;total_credited:string;total_withdrawn:string};
export type EpochState={epoch:string;state:string;deadline:string;commit_sha?:string;manifest_sha256?:string;baseline_commit_sha?:string;baseline_sha256?:string;baseline_epoch?:string;revision?:string;prior_commit_sha?:string;prior_manifest_sha256?:string;prior_verdict?:string;verdict?:string;delta_sha256?:string;added?:string;corrected?:string;removed?:string;reviewed_at?:string};

const pendingKey='freshproof:pending:61999';
const addressPattern=/^0x[0-9a-fA-F]{40}$/;
const hashPattern=/^0x[0-9a-fA-F]{64}$/;
const reader=createClient({chain:chains.studionet});
let signing=false;

export function browserProvider():Provider|null{return (window as Window&{ethereum?:Provider}).ethereum||null;}

export async function loadDeployment():Promise<Deployment>{
  const response=await fetch('/deployment.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Deployment record unavailable.');
  return await response.json() as Deployment;
}

export async function readState(address:Address):Promise<ChainState>{
  if(!addressPattern.test(address))throw new Error('Enter a 40-byte contract address.');
  return await reader.readContract({address,functionName:'get_state',args:[],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}) as unknown as ChainState;
}

export async function readEpoch(address:Address,epoch:number):Promise<EpochState>{
  return await reader.readContract({address,functionName:'get_epoch',args:[epoch],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}) as unknown as EpochState;
}

export async function readCredit(address:Address,account:Address):Promise<string>{
  return String(await reader.readContract({address,functionName:'get_credit',args:[account],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}));
}

export async function verifyDeployment(deployment:Deployment):Promise<Address>{
  if(!deployment.verified||deployment.network!=='studionet'||deployment.chainId!==61999||!addressPattern.test(deployment.address||'')||!deployment.sourceSha256||!hashPattern.test('0x'+deployment.sourceSha256))throw new Error('No verified StudioNet FreshProof deployment is configured.');
  const address=deployment.address as Address;
  await verifyContractSource(address,deployment.sourceSha256);
  return address;
}

export async function verifyContractSource(address:Address,expectedHash?:string):Promise<Address>{
  if(!addressPattern.test(address))throw new Error('Enter a valid StudioNet contract address.');
  const local=await fetch('/contract-source.py',{cache:'no-store'});
  if(!local.ok)throw new Error('Published contract source is missing.');
  const localCode=(await local.text()).replaceAll('\r\n','\n');
  const localHash=await sha256(new TextEncoder().encode(localCode));
  if(expectedHash&&localHash!==expectedHash.toLowerCase())throw new Error('Published contract source does not match the recorded deployment source.');
  const chainCode=(await reader.getContractCode(address)).replaceAll('\r\n','\n');
  if(await sha256(new TextEncoder().encode(chainCode))!==localHash)throw new Error('Onchain source does not match this app release. Live signing is blocked.');
  return address;
}

export async function connectWallet():Promise<{address:Address;provider:Provider}>{
  const provider=browserProvider();
  if(!provider)throw new Error('No browser wallet found. Open this app in Chrome with MetaMask or another EIP-1193 wallet.');
  const accounts=await provider.request({method:'eth_requestAccounts'}) as string[];
  if(!addressPattern.test(accounts?.[0]||''))throw new Error('No wallet account selected.');
  const chain=Number(await provider.request({method:'eth_chainId'}));
  if(chain!==61999){
    try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xf22f'}]});}
    catch(error){
      if((error as {code?:number}).code!==4902)throw error;
      await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0xf22f',chainName:chains.studionet.name,nativeCurrency:chains.studionet.nativeCurrency,rpcUrls:chains.studionet.rpcUrls.default.http,blockExplorerUrls:['https://explorer-studio.genlayer.com']}]});
    }
  }
  return {address:accounts[0].toLowerCase() as Address,provider};
}

export async function checkWallet(account:Address,provider:Provider){
  const accounts=await provider.request({method:'eth_accounts'}) as string[];
  const chain=Number(await provider.request({method:'eth_chainId'}));
  if(accounts?.[0]?.toLowerCase()!==account||chain!==61999)throw new Error('Wallet account or network changed. Reconnect before signing.');
}

export function savedPending():Pending|null{
  try{const value=localStorage.getItem(pendingKey);if(!value)return null;const parsed=JSON.parse(value) as Pending;return hashPattern.test(parsed.hash)&&addressPattern.test(parsed.address)?parsed:null;}
  catch{return null;}
}

export function formatError(error:unknown):string{
  if(typeof error==='string')return error;
  if(!error||typeof error!=='object')return 'Unknown wallet or contract error.';
  const value=error as Record<string,unknown>;
  const nested=value.cause&&typeof value.cause==='object'?value.cause as Record<string,unknown>:{};
  const message=[value.shortMessage,value.message,nested.shortMessage,nested.message].find(v=>typeof v==='string'&&v.length>0);
  return typeof message==='string'?message.replace(/^\[EXPECTED\]\s*/,''):JSON.stringify(value).slice(0,500);
}

export async function send(
  address:Address,
  wallet:{address:Address;provider:Provider},
  method:'fund'|'submit'|'review'|'close'|'withdraw',
  args:unknown[]=[],
  value=0n,
):Promise<Pending>{
  if(signing||savedPending())throw new Error('A transaction is already pending. Check its status before another write.');
  if(!navigator.locks)throw new Error('A modern HTTPS browser is required for safe wallet signing.');
  const expectedArgs={fund:0,submit:3,review:1,close:1,withdraw:0};
  if(args.length!==expectedArgs[method]||(method!=='fund'&&value!==0n))throw new Error('Invalid action arguments or GEN value.');
  return navigator.locks.request('freshproof:sign:61999',{ifAvailable:true},async lock=>{
    if(!lock)throw new Error('Another FreshProof tab is signing.');
    signing=true;
    let requested=false;
    let known:Pending|undefined;
    try{
      await verifyContractSource(address);
      await checkWallet(wallet.address,wallet.provider);
      const guarded:Provider={request:async input=>{
        const submitting=['eth_sendTransaction','eth_sendRawTransaction'].includes(input.method);
        if(submitting){
          if(requested)throw new Error('A second wallet submission was blocked.');
          requested=true;
        }
        const result=await wallet.provider.request(input);
        if(submitting&&typeof result==='string'&&hashPattern.test(result)&&!known){
          known={hash:result as Hash,method,address,account:wallet.address,createdAt:Date.now()};
          localStorage.setItem(pendingKey,JSON.stringify(known));
        }
        return result;
      }};
      const writer=createClient({chain:chains.studionet,account:wallet.address,provider:guarded as never});
      const hash=await writer.writeContract({address,functionName:method,args:args as never[],value});
      if(!hashPattern.test(hash))throw new Error('Wallet returned no valid transaction hash.');
      if(known&&known.hash!==hash)throw new Error('Conflicting wallet and SDK transaction hashes.');
      known??={hash:hash as Hash,method,address,account:wallet.address,createdAt:Date.now()};
      localStorage.setItem(pendingKey,JSON.stringify(known));
      return known;
    }catch(error){
      const detail=formatError(error);
      if(known)throw new Error(`A transaction hash exists (${known.hash}); inspect it before retrying. ${detail}`);
      if(requested)throw new Error(`Wallet submission status is uncertain. Check wallet Activity and the StudioNet explorer; no retry was sent. ${detail}`);
      throw new Error(detail);
    }finally{signing=false;}
  });
}

export async function createCovenant(
  wallet:{address:Address;provider:Provider},
  args:[string,string,string,string,string,number,number,number,number,bigint],
):Promise<Pending>{
  if(signing||savedPending())throw new Error('A transaction is already pending. Check its status before another write.');
  if(!navigator.locks)throw new Error('A modern HTTPS browser is required for safe wallet signing.');
  const source=await fetch('/contract-source.py',{cache:'no-store'});
  if(!source.ok)throw new Error('Published contract source is unavailable. Deployment is blocked.');
  const code=(await source.text()).replaceAll('\r\n','\n');
  const digest=await sha256(new TextEncoder().encode(code));
  const zero='0x0000000000000000000000000000000000000000' as Address;
  return navigator.locks.request('freshproof:sign:61999',{ifAvailable:true},async lock=>{
    if(!lock)throw new Error('Another FreshProof tab is signing.');
    signing=true;
    let requested=false;
    let known:Pending|undefined;
    try{
      await checkWallet(wallet.address,wallet.provider);
      const guarded:Provider={request:async input=>{
        const submitting=['eth_sendTransaction','eth_sendRawTransaction'].includes(input.method);
        if(submitting){if(requested)throw new Error('A second wallet submission was blocked.');requested=true;}
        const result=await wallet.provider.request(input);
        if(submitting&&typeof result==='string'&&hashPattern.test(result)&&!known){
          known={hash:result as Hash,method:'deploy',address:zero,account:wallet.address,createdAt:Date.now(),sourceSha256:digest};
          localStorage.setItem(pendingKey,JSON.stringify(known));
        }
        return result;
      }};
      const writer=createClient({chain:chains.studionet,account:wallet.address,provider:guarded as never});
      const hash=await writer.deployContract({code,args:args as Parameters<typeof writer.deployContract>[0]['args']});
      if(!hashPattern.test(hash))throw new Error('Wallet returned no valid deployment transaction hash.');
      if(known&&known.hash!==hash)throw new Error('Conflicting wallet and SDK transaction hashes.');
      known??={hash:hash as Hash,method:'deploy',address:zero,account:wallet.address,createdAt:Date.now(),sourceSha256:digest};
      localStorage.setItem(pendingKey,JSON.stringify(known));
      return known;
    }catch(error){
      const detail=formatError(error);
      if(known)throw new Error(`A deployment hash exists (${known.hash}); inspect it before retrying. ${detail}`);
      if(requested)throw new Error(`Deployment submission status is uncertain. Check wallet Activity and the StudioNet explorer; no retry was sent. ${detail}`);
      throw new Error(detail);
    }finally{signing=false;}
  });
}

export async function pollPending():Promise<{pending:Pending;state:'pending'|'success'|'error'|'unknown';contractAddress?:Address}|null>{
  const pending=savedPending();if(!pending)return null;
  const receipt=await reader.getTransaction({hash:pending.hash as Parameters<typeof reader.getTransaction>[0]['hash']});
  const r=receipt as unknown as Record<string,unknown>;
  const status=String(r.statusName??r.status_name??r.status??'').toUpperCase();
  if(status!=='FINALIZED')return {pending,state:'pending'};
  const execution=String(r.txExecutionResultName??r.tx_execution_result_name??'').toUpperCase();
  const result=String(r.resultName??r.result_name??'').toUpperCase();
  const state=execution==='FINISHED_WITH_RETURN'&&result!=='FAILURE'?'success':execution==='FINISHED_WITH_ERROR'||result==='FAILURE'?'error':'unknown';
  if(state==='unknown')return {pending,state};
  const decoded=r.txDataDecoded&&typeof r.txDataDecoded==='object'?r.txDataDecoded as Record<string,unknown>:{};
  const data=r.data&&typeof r.data==='object'?r.data as Record<string,unknown>:{};
  const deployed=decoded.contractAddress??data.contract_address;
  if(pending.method==='deploy'&&state==='success'&&!(typeof deployed==='string'&&addressPattern.test(deployed)))return {pending,state:'unknown'};
  localStorage.removeItem(pendingKey);
  return {pending,state,contractAddress:typeof deployed==='string'&&addressPattern.test(deployed)?deployed as Address:undefined};
}

export function pinnedUrl(state:ChainState,commit:string):string{
  const [owner,repo]=state.repo.split('/');
  if(!owner||!repo)throw new Error('Invalid frozen repository.');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${state.manifest_path}`;
}

export type VerifiedRelease={current:Manifest;baseline:Manifest|null;currentUrl:string;baselineUrl:string|null};
