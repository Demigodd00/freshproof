import './style.css';
import {browserProvider,connectWallet,formatError,loadDeployment,pinnedUrl,pollPending,readCredit,readEpoch,readState,savedPending,send,verifyDeployment} from './chain';
import type {Address,ChainState,Deployment,EpochState,Pending} from './chain';
import {canonicalDelta,deriveDelta,disclosureCoverage,fetchPinnedManifest,rawUrl,sha256} from './verify';
import type {Delta,Manifest} from './verify';

type Mode='example'|'live';
type Inspection={current:Manifest;baseline:Manifest|null;delta:Delta;coverage:ReturnType<typeof disclosureCoverage>;digestOk:boolean;countsOk:boolean;currentUrl:string;baselineUrl:string|null};
const app=document.querySelector<HTMLDivElement>('#app')!;
const query=new URLSearchParams(location.search);
let mode:Mode=query.get('contract')?'live':'example';
let deployment:Deployment|null=null;
let configured:Address|null=null;
let viewing:Address|null=(query.get('contract')||'') as Address|null;
let state:ChainState|null=null;
let epochs:EpochState[]=[];
let selected=1;
let inspection:Inspection|null=null;
let wallet:Awaited<ReturnType<typeof connectWallet>>|null=null;
let credit='0';
let loading=false;
let busy=false;
let notice='';
let noticeKind:'info'|'error'|'good'='info';

const demo=[
  {number:1,status:'Paid',date:'01 / Foundation',delta:'12 records established',tone:'good',description:'The first snapshot creates the public baseline. No fictional before/after history is asserted.',changes:[['+','river_level','Initial river-level record published.'],['+','sampling_site','Initial sampling-site record published.']]},
  {number:2,status:'Paid',date:'02 / Correction',delta:'1 correction · 1 addition',tone:'good',description:'A changed reading is linked to a specific reason, while a new record is disclosed as an addition.',changes:[['~','river_level','Corrected from 2.4m to 2.1m after gauge recalibration.'],['+','rainfall','Added a verified daily rainfall measurement.']]},
  {number:3,status:'Refunded',date:'03 / Missed',delta:'No release submitted',tone:'warn',description:'The publication window elapsed without a new snapshot. The fixed reward returns to the sponsor.',changes:[]},
] as const;

function esc(input:unknown):string{return String(input??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
function short(input:string,n=8):string{return input.length>n*2+3?`${input.slice(0,n)}…${input.slice(-n)}`:input;}
function message(value:string,kind:'info'|'error'|'good'='info'){notice=value;noticeKind=kind;render();}
function readableTime(unix:string){return new Date(Number(unix)*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
function gen(atto:string){const whole=BigInt(atto||'0');const leading=whole/10n**18n;const fraction=(whole%10n**18n).toString().padStart(18,'0').slice(0,5).replace(/0+$/,'');return `${leading}${fraction?'.'+fraction:''} GEN`;}
function canSign(){return mode==='live'&&!!wallet&&!!configured&&viewing?.toLowerCase()===configured.toLowerCase()&&!savedPending()&&!busy;}
function explorer(hash:string){return `https://explorer-studio.genlayer.com/transactions/${encodeURIComponent(hash)}`;}
function contractExplorer(address:string){return `https://explorer-studio.genlayer.com/address/${encodeURIComponent(address)}`;}
function jump(epoch:number){selected=epoch;inspection=null;render();}
function setBusy(value:boolean){busy=value;render();}

async function initialize(){
  try{deployment=await loadDeployment();if(deployment.verified)configured=await verifyDeployment(deployment);}
  catch(error){notice=`Live deployment unavailable: ${formatError(error)}`;noticeKind='info';}
  if(!viewing&&configured)viewing=configured;
  if(mode==='live'&&viewing)await refresh();
  else render();
}

async function refresh(){
  if(!viewing)return;
  loading=true;render();
  try{
    const result=await readState(viewing);
    const count=Math.min(Number(result.epoch_count),12);
    const records=await Promise.all(Array.from({length:count},(_,i)=>readEpoch(viewing!,i+1)));
    state=result;epochs=records;
    if(selected>count)selected=1;
    if(wallet)credit=await readCredit(viewing,wallet.address);
    notice='Finalized contract state refreshed.';noticeKind='good';
  }catch(error){state=null;epochs=[];notice=formatError(error);noticeKind='error';}
  finally{loading=false;render();}
}

async function inspect(){
  if(!state||!viewing)return;
  const row=epochs[selected-1];
  if(!row?.commit_sha||!row.manifest_sha256){message('This epoch has no onchain snapshot to verify.');return;}
  setBusy(true);
  try{
    const [owner,repo]=state.repo.split('/');
    const currentUrl=rawUrl(owner,repo,row.commit_sha,state.manifest_path);
    const current=await fetchPinnedManifest(currentUrl,row.manifest_sha256,selected);
    let baseline:Manifest|null=null;
    let baselineUrl:string|null=null;
    if(row.baseline_commit_sha){
      baselineUrl=rawUrl(owner,repo,row.baseline_commit_sha,state.manifest_path);
      baseline=await fetchPinnedManifest(baselineUrl,row.baseline_sha256!,Number(row.baseline_epoch));
    }
    const delta=deriveDelta(baseline,current);
    const digest=await sha256(new TextEncoder().encode(canonicalDelta(delta)));
    const countsOk=Number(row.added)===delta.added.length&&Number(row.corrected)===delta.corrected.length&&Number(row.removed)===delta.removed.length;
    inspection={current,baseline,delta,coverage:disclosureCoverage(delta,current),digestOk:row.delta_sha256===digest,countsOk,currentUrl,baselineUrl};
    message('Pinned source fetched and independently compared with finalized onchain fields.','good');
  }catch(error){inspection=null;message(formatError(error),'error');}
  finally{setBusy(false);}
}

async function connect(){
  setBusy(true);
  try{wallet=await connectWallet();if(state&&viewing)credit=await readCredit(viewing,wallet.address);message(`Wallet connected: ${short(wallet.address)}.`,'good');}
  catch(error){message(formatError(error),'error');}
  finally{setBusy(false);}
}

async function act(method:'fund'|'submit'|'review'|'close'|'withdraw',args:unknown[]=[],value=0n){
  if(!deployment||!wallet||!canSign()){message('Live signing requires a verified deployment, connected wallet, and no pending transaction.','error');return;}
  setBusy(true);
  try{
    const pending=await send(deployment,wallet,method,args,value);
    message(`${method} submitted once. Wait for finality before any further action. Hash: ${pending.hash}`,'good');
  }catch(error){message(formatError(error),'error');}
  finally{setBusy(false);}
}

async function checkPending(){
  setBusy(true);
  try{
    const result=await pollPending();
    if(!result){message('No saved transaction hash.','info');return;}
    if(result.state==='pending')message(`Transaction ${short(result.pending.hash)} has not reached finality. Do not resubmit.`);
    else if(result.state==='unknown')message(`Transaction ${short(result.pending.hash)} is finalized, but the execution outcome is unclear. The pending hash was preserved; inspect the explorer before retrying.`,'error');
    else {message(`Transaction ${short(result.pending.hash)} finalized ${result.state==='success'?'successfully':'with an execution error'}.`,result.state==='success'?'good':'error');await refresh();}
  }catch(error){message(`Status check failed; pending hash was preserved. ${formatError(error)}`,'error');}
  finally{setBusy(false);}
}

function renderHero(){return `<header class="masthead"><a class="wordmark" href="/" aria-label="FreshProof home"><span class="mark">F<span>•</span></span><span>freshproof<small>PUBLIC DATA COVENANTS</small></span></a><nav class="topnav"><a href="#how">How it works</a><a href="#releases">Release ledger</a><a href="#verifier">Verifier</a><a href="https://docs.genlayer.com/" target="_blank" rel="noopener noreferrer">GenLayer ↗</a></nav><span class="network"><span class="live-dot"></span> StudioNet</span></header><section class="hero"><div class="hero-copy"><p class="eyebrow">GENLAYER NATIVE <span class="hairline"></span> 01 / 03</p><h1>Every change<br>leaves a <em>trace.</em></h1><p class="hero-sub">A public data release should explain what changed since the last one. FreshProof turns that promise into a recurring, validator-reviewed covenant.</p><div class="hero-actions"><button class="primary" data-action="mode-live">Explore live contract <span>↗</span></button><button class="text-button" data-action="mode-example">View example <span>→</span></button></div><p class="honest">${configured?'Verified StudioNet deployment configured.':'Illustrative example only · No verified FreshProof deployment is configured yet.'}</p></div><div class="hero-art"><div class="grid-lines"></div><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="center-ring"><span>Δ</span><small>CHANGE<br>ACCOUNTABILITY</small></div><div class="art-tag tag-one"><b>01</b> Pinned snapshot</div><div class="art-tag tag-two"><b>02</b> Validator review</div><div class="art-tag tag-three"><b>03</b> Fixed settlement</div></div></section>`;}

function renderHow(){return `<section class="how" id="how"><div class="section-intro"><p class="eyebrow">THE COVENANT</p><h2>Not a score. A record of responsibility.</h2><p>Each epoch is its own public promise. Exact data differences are computed mechanically; GenLayer intelligence evaluates the explanation.</p></div><div class="how-cards"><article><span class="step">01 / COMMIT</span><div class="step-icon">⌁</div><h3>Freeze the source</h3><p>Publisher submits a full snapshot at an immutable Git commit plus its SHA-256 digest. No mutable branch links.</p></article><article><span class="step">02 / COMPARE</span><div class="step-icon">≠</div><h3>Expose the delta</h3><p>Additions, corrections, and removals are derived against the last accepted release—not a convenient cherry-picked version.</p></article><article><span class="step">03 / SETTLE</span><div class="step-icon">◎</div><h3>Pay for disclosure</h3><p>Validators independently inspect the pinned source and agree on the material verdict. The contract sets fixed payment or refund.</p></article></div></section>`;}

function renderMode(){return `<div class="workspace-top"><div><p class="eyebrow">THE RELEASE WORKSPACE</p><h2>One feed. A visible history.</h2></div><div class="segmented" role="group" aria-label="Workspace mode"><button class="${mode==='example'?'selected':''}" data-action="mode-example">Example</button><button class="${mode==='live'?'selected':''}" data-action="mode-live">Live StudioNet</button></div></div>`;}

function renderExample(){
  const item=demo[selected-1]||demo[0];
  return `<div class="demo-label">ILLUSTRATIVE WALKTHROUGH <span>— NOT AN ONCHAIN RECEIPT</span></div><div class="workspace-grid"><div class="panel release-panel"><div class="panel-kicker">RELEASE LEDGER <span>EXAMPLE</span></div><div class="timeline">${demo.map(entry=>`<button class="timeline-row ${selected===entry.number?'active':''}" data-epoch="${entry.number}"><span class="timeline-node ${entry.tone}">${entry.number}</span><span class="timeline-main"><b>${esc(entry.date)}</b><small>${esc(entry.delta)}</small></span><span class="status ${entry.tone}">${entry.status}</span></button>`).join('')}</div><div class="panel-foot">Payouts depend on the frozen epoch rules, not an AI-generated number.</div></div><div class="panel detail-panel"><div class="panel-kicker">RELEASE ${String(item.number).padStart(2,'0')} / 03 <span class="status ${item.tone}">${item.status}</span></div><h3>${item.delta}</h3><p>${item.description}</p><div class="diff-list">${item.changes.length?item.changes.map(([symbol,id,reason])=>`<div class="diff-row"><span class="diff-symbol">${symbol}</span><div><b>${esc(id)}</b><small>${esc(reason)}</small></div></div>`).join(''):'<div class="empty-diff">No snapshot. No explanation. No publisher reward.</div>'}</div><div class="detail-bottom"><span>THIS IS A PRODUCT EXAMPLE</span><button data-action="mode-live">Inspect an actual contract →</button></div></div></div>`;
}

function renderLive(){
  const row=epochs[selected-1];
  const pending=savedPending();
  const writeReady=canSign();
  return `<div class="live-banner ${configured?'configured':'unconfigured'}"><span class="banner-icon">${configured?'✓':'!'}</span><div><b>${configured?'Verified deployment configured':'No verified deployment yet'}</b><p>${configured?'Wallet actions are available only when viewing the exact verified contract. All reads use latest finalized state.':'You can inspect an existing FreshProof contract by address. Signing is locked until this repository has a verified deployment record.'}</p></div></div><div class="live-controls"><label>CONTRACT ADDRESS<input id="contract-input" spellcheck="false" autocomplete="off" placeholder="0x… contract address" value="${esc(viewing||'')}"></label><button class="secondary" data-action="load" ${loading?'disabled':''}>${loading?'Loading…':'Load finalized state'}</button><button class="secondary" data-action="connect" ${busy?'disabled':''}>${wallet?short(wallet.address):'Connect wallet'}</button></div>${pending?`<div class="pending"><div><b>Transaction awaiting finality</b><p>${esc(pending.method)} · <a href="${explorer(pending.hash)}" target="_blank" rel="noopener noreferrer">${short(pending.hash)} ↗</a></p></div><button class="secondary" data-action="poll">Check transaction</button></div>`:''}${state?`<div class="contract-summary"><div><span>FROZEN SOURCE</span><b>${esc(state.repo)}</b><small>${esc(state.manifest_path)}</small></div><div><span>CADENCE</span><b>${esc(state.epoch_count)} epochs</b><small>${esc(state.period_seconds)} seconds each</small></div><div><span>REWARD</span><b>${gen(state.reward_atto)}</b><small>fixed per epoch</small></div><div><span>POOL</span><b>${state.funded?'Funded':'Not funded'}</b><small>credit: ${gen(credit)}</small></div></div><div class="rule"><span>FROZEN REVIEW RULE</span><p>${esc(state.disclosure_rule)}</p><small>Sponsor ${short(state.sponsor)} · Publisher ${short(state.publisher)} · <a href="${contractExplorer(viewing!)}" target="_blank" rel="noopener noreferrer">contract ↗</a></small></div><div class="workspace-grid"><div class="panel release-panel"><div class="panel-kicker">FINALIZED RELEASE LEDGER <span>STUDIONET</span></div><div class="timeline">${epochs.map((entry,i)=>`<button class="timeline-row ${selected===i+1?'active':''}" data-epoch="${i+1}"><span class="timeline-node ${entry.state==='CLOSED_PAID'?'good':entry.state==='CLOSED_REFUNDED'||entry.state==='MISSED'?'warn':''}">${i+1}</span><span class="timeline-main"><b>Epoch ${String(i+1).padStart(2,'0')}</b><small>Closes ${esc(readableTime(entry.deadline))}</small></span><span class="status ${entry.state==='CLOSED_PAID'?'good':entry.state==='CLOSED_REFUNDED'||entry.state==='MISSED'?'warn':''}">${esc(entry.state.replaceAll('_',' ').toLowerCase())}</span></button>`).join('')}</div><div class="panel-foot">Finalized reads only. An empty epoch is not proof of a successful release.</div></div><div class="panel detail-panel"><div class="panel-kicker">EPOCH ${String(selected).padStart(2,'0')} / ${esc(state.epoch_count)} <span>${esc(row?.state||'')}</span></div><h3>${row?.commit_sha?'Commit-pinned snapshot':'Waiting for a snapshot'}</h3><p>${row?.commit_sha?`Commit ${short(row.commit_sha,10)} · revision ${esc(row.revision)}. Review verdict: ${esc(row.verdict||'pending')}.`:'No snapshot has been submitted for this epoch.'}</p>${row?.commit_sha?`<div class="evidence-line"><span>MANIFEST</span><a href="${esc(pinnedUrl(state,row.commit_sha))}" target="_blank" rel="noopener noreferrer">${short(row.manifest_sha256||'',11)} ↗</a></div><div class="evidence-line"><span>BASELINE</span><b>${row.baseline_commit_sha?`Epoch ${esc(row.baseline_epoch)} · ${short(row.baseline_commit_sha,10)}`:'First release'}</b></div><div class="evidence-line"><span>ONCHAIN DELTA</span><b>+${esc(row.added||'0')} / ~${esc(row.corrected||'0')} / −${esc(row.removed||'0')}</b></div><button class="primary compact" data-action="inspect" ${busy?'disabled':''}>Verify pinned evidence ↗</button>`:'<div class="empty-diff">A release becomes inspectable after the publisher signs its commit and content digest.</div>'}</div></div>${renderInspection()}${renderActions(row,writeReady)}`:`<div class="empty-state"><div class="empty-symbol">Δ</div><h3>Bring a contract into view</h3><p>Paste a FreshProof StudioNet address to inspect its finalized release history. The example tab shows the intended experience without suggesting it is live proof.</p></div>`}`;
}

function renderInspection(){
  if(!inspection)return '';
  const i=inspection;
  const lines=(['added','corrected','removed'] as const).flatMap(kind=>i.delta[kind].map(id=>`<div class="diff-row"><span class="diff-symbol">${kind==='added'?'+':kind==='corrected'?'~':'−'}</span><div><b>${esc(id)}</b><small>${kind==='added'?`New: ${esc(i.delta.new[id])}`:kind==='removed'?`Previous: ${esc(i.delta.old[id])}`:`${esc(i.delta.old[id])} → ${esc(i.delta.new[id])}`}</small></div></div>`)).join('');
  return `<section class="verification panel" id="verifier"><div class="panel-kicker">INDEPENDENT BROWSER VERIFICATION <span>FINALIZED SOURCE</span></div><h3>${esc(i.current.title)}</h3><div class="checks"><div class="${i.digestOk?'pass':'fail'}">${i.digestOk?'✓':'×'} Derived delta matches onchain SHA-256</div><div class="${i.countsOk?'pass':'fail'}">${i.countsOk?'✓':'×'} Added / corrected / removed counts match</div><div class="${i.coverage.ok?'pass':'fail'}">${i.coverage.ok?'✓':'×'} Every structural change has a disclosure</div></div>${!i.coverage.ok?`<p class="mismatch">Missing: ${esc(i.coverage.missing.join(', ')||'none')} · Unexpected: ${esc(i.coverage.unexpected.join(', ')||'none')}</p>`:''}<div class="diff-list">${lines||'<div class="empty-diff">No structural change in this snapshot.</div>'}</div><p class="verification-note">This verifies the pinned bytes and exact structural delta. The semantic adequacy of explanations is the validator verdict recorded by GenLayer; browser checks do not independently reproduce validator inference.</p><div class="proof-links"><a href="${esc(i.currentUrl)}" target="_blank" rel="noopener noreferrer">Current pinned source ↗</a>${i.baselineUrl?`<a href="${esc(i.baselineUrl)}" target="_blank" rel="noopener noreferrer">Baseline pinned source ↗</a>`:''}</div></section>`;
}

function renderPrior(){
  const prior=epochs[selected-1];
  if(!prior?.prior_commit_sha||!state)return '';
  return `<div class="prior-release panel"><div class="panel-kicker">PREVIOUS REVISION <span>${esc(prior.prior_verdict||'unreviewed')}</span></div><p>Earlier commit ${short(prior.prior_commit_sha,10)} remains part of this epoch's signed history.</p><a href="${esc(pinnedUrl(state,prior.prior_commit_sha))}" target="_blank" rel="noopener noreferrer">View prior pinned manifest ↗</a></div>`;
}

function renderActions(row:EpochState|undefined,writeReady:boolean){
  if(!state)return '';
  const now=Math.floor(Date.now()/1000);
  const current=selected===Number(state.next_epoch);
  const active=current&&now<=Number(row?.deadline||'0');
  const account=wallet?.address.toLowerCase();
  const sponsor=account===state.sponsor.toLowerCase();
  const publisher=account===state.publisher.toLowerCase();
  return `<section class="action-panel" id="actions"><div class="section-intro"><p class="eyebrow">ROLE-GATED ACTIONS</p><h2>Signed by people. Settled by rules.</h2></div><div class="action-grid"><div class="action-card"><span>SPONSOR</span><h3>Fund the schedule</h3><p>Exactly ${gen((BigInt(state.reward_atto)*BigInt(state.epoch_count)).toString())} once for every epoch.</p><button class="secondary" data-action="fund" ${!writeReady||!sponsor||state.funded?'disabled':''}>Fund covenant</button></div><div class="action-card"><span>PUBLISHER</span><h3>Submit pinned release</h3><p>Use a full 40-character commit SHA and 64-character SHA-256 of the raw manifest bytes.</p><input id="commit-input" placeholder="Commit SHA (40 hex)" spellcheck="false"><input id="digest-input" placeholder="Manifest SHA-256 (64 hex)" spellcheck="false"><button class="secondary" data-action="submit" ${!writeReady||!publisher||!active||!state.funded?'disabled':''}>Sign release</button></div><div class="action-card"><span>ANYONE</span><h3>Review & close</h3><p>GenLayer validators review a submitted release. Closing occurs after the frozen deadline.</p><div class="dual-actions"><button class="secondary" data-action="review" ${!writeReady||!current||row?.state!=='SUBMITTED'?'disabled':''}>Review</button><button class="secondary" data-action="close" ${!writeReady||!current||now<=Number(row?.deadline||'0')||!state.funded?'disabled':''}>Close epoch</button></div></div><div class="action-card"><span>BENEFICIARY</span><h3>Claim credit</h3><p>Your finalized available credit: ${gen(credit)}. Withdrawal is pull-based.</p><button class="secondary" data-action="withdraw" ${!writeReady||BigInt(credit||'0')<=0n?'disabled':''}>Withdraw GEN</button></div></div><p class="action-disclaimer">Disabled actions may be due to role, timing, insufficient state, wallet connection, or missing verified deployment. No action is auto-retried when a hash is missing or uncertain.</p></section>`;
}

function renderFooter(){return `<footer><div class="footer-main"><span class="wordmark"><span class="mark">F<span>•</span></span><span>freshproof<small>EVERY CHANGE LEAVES A TRACE</small></span></span><p>Honest release histories for public data. Built for GenLayer StudioNet.</p></div><div class="footer-links"><a href="#how">Method</a><a href="#releases">Workspace</a><a href="https://docs.genlayer.com/" target="_blank" rel="noopener noreferrer">GenLayer docs ↗</a></div><div class="footer-bottom">FreshProof verifies disclosed changes—not the factual truth of underlying data. <span>© 2026 FRESHPROOF</span></div></footer>`;}

function render(){
  app.innerHTML=`${renderHero()}<main>${renderHow()}<section class="workspace" id="releases">${renderMode()}${notice?`<div class="notice ${noticeKind}" role="status">${esc(notice)} <button data-action="dismiss" aria-label="Dismiss notice">×</button></div>`:''}${mode==='example'?renderExample():renderLive()+renderPrior()}</section><section class="closing"><span class="eyebrow">A DIFFERENT KIND OF PROOF</span><h2>The important question isn’t only<br><em>what’s in the data.</em></h2><p>It’s whether the public can see what changed, why, and who remains accountable when a release is missed.</p><a href="#releases">Explore the release ledger →</a></section></main>${renderFooter()}`;
}

app.addEventListener('click',async event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-action],[data-epoch]');
  if(!button||button.disabled)return;
  if(button.dataset.epoch){jump(Number(button.dataset.epoch));return;}
  const action=button.dataset.action;
  if(action==='dismiss'){notice='';render();}
  if(action==='mode-example'){mode='example';selected=1;inspection=null;history.replaceState(null,'',location.pathname);render();document.querySelector('#releases')?.scrollIntoView({behavior:'smooth'});}
  if(action==='mode-live'){mode='live';selected=1;inspection=null;render();document.querySelector('#releases')?.scrollIntoView({behavior:'smooth'});}
  if(action==='load'){
    const value=(document.querySelector<HTMLInputElement>('#contract-input')?.value||'').trim();
    if(!/^0x[0-9a-fA-F]{40}$/.test(value)){message('Enter a valid 40-byte StudioNet contract address.','error');return;}
    viewing=value as Address;selected=1;inspection=null;credit='0';history.replaceState(null,'',`?contract=${encodeURIComponent(value)}#releases`);await refresh();
  }
  if(action==='connect')await connect();
  if(action==='poll')await checkPending();
  if(action==='inspect')await inspect();
  if(action==='fund'&&state)await act('fund',[],BigInt(state.reward_atto)*BigInt(state.epoch_count));
  if(action==='submit'){
    const commit=document.querySelector<HTMLInputElement>('#commit-input')?.value.trim().toLowerCase()||'';
    const digest=document.querySelector<HTMLInputElement>('#digest-input')?.value.trim().toLowerCase()||'';
    if(!/^[0-9a-f]{40}$/.test(commit)||!/^[0-9a-f]{64}$/.test(digest)){message('A full 40-character commit SHA and 64-character SHA-256 digest are required.','error');return;}
    await act('submit',[selected,commit,digest]);
  }
  if(action==='review')await act('review',[selected]);
  if(action==='close')await act('close',[selected]);
  if(action==='withdraw')await act('withdraw');
});

window.addEventListener('focus',()=>{if(savedPending())void checkPending();});
const provider=browserProvider();
if(provider){
  const events=provider as typeof provider&{on?:(name:string,handler:()=>void)=>void};
  events.on?.('accountsChanged',()=>{wallet=null;credit='0';message('Wallet account changed. Reconnect to sign.');});
  events.on?.('chainChanged',()=>{wallet=null;credit='0';message('Wallet network changed. Reconnect to sign.');});
}
render();
void initialize();
