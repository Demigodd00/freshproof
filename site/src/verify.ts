export type RecordRow = {id:string; value:string};
export type ChangeRow = {id:string; kind:'added'|'corrected'|'removed'; reason:string};
export type Manifest = {version:1;period:number;title:string;records:RecordRow[];changes:ChangeRow[]};
export type Delta = {added:string[];corrected:string[];removed:string[];old:Record<string,string>;new:Record<string,string>};

const shaPattern=/^[0-9a-f]{40}$/i;
const digestPattern=/^[0-9a-f]{64}$/i;
const idPattern=/^[A-Za-z0-9_-]{1,64}$/;

export function rawUrl(owner:string,repo:string,commit:string,path:string):string{
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(owner)||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(repo)||!shaPattern.test(commit)||!/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.json$/.test(path)||path.startsWith('.')||path.includes('/..'))throw new Error('Invalid pinned GitHub identity.');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit.toLowerCase()}/${path}`;
}

export async function sha256(bytes:Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function parseManifest(value:unknown,expectedPeriod:number):Manifest{
  if(!value||typeof value!=='object')throw new Error('Manifest is not an object.');
  const m=value as Record<string,unknown>;
  if(m.version!==1||m.period!==expectedPeriod||typeof m.title!=='string'||!Array.isArray(m.records)||!Array.isArray(m.changes))throw new Error('Manifest version, period, or lists are invalid.');
  if(m.records.length>20||m.changes.length>20)throw new Error('Manifest exceeds bounded item counts.');
  const ids=new Set<string>();
  for(const row of m.records){
    if(!row||typeof row!=='object'||!idPattern.test(row.id)||typeof row.value!=='string'||row.value.length>280||ids.has(row.id))throw new Error('Invalid or duplicate record.');
    ids.add(row.id);
  }
  const changeIds=new Set<string>();
  for(const row of m.changes){
    if(!row||typeof row!=='object'||!idPattern.test(row.id)||!['added','corrected','removed'].includes(row.kind)||typeof row.reason!=='string'||row.reason.trim().length<12||row.reason.length>360||changeIds.has(row.id))throw new Error('Invalid or duplicate disclosure.');
    changeIds.add(row.id);
  }
  return m as Manifest;
}

export function deriveDelta(previous:Manifest|null,current:Manifest):Delta{
  const old:Record<string,string>=Object.fromEntries((previous?.records||[]).map(r=>[r.id,r.value]));
  const now:Record<string,string>=Object.fromEntries(current.records.map(r=>[r.id,r.value]));
  return {
    added:Object.keys(now).filter(id=>!(id in old)).sort(),
    corrected:Object.keys(now).filter(id=>id in old&&old[id]!==now[id]).sort(),
    removed:Object.keys(old).filter(id=>!(id in now)).sort(),
    old,new:now,
  };
}

export function requiredDisclosures(delta:Delta):Array<{id:string;kind:ChangeRow['kind']}>{
  return (['added','corrected','removed'] as const).flatMap(kind=>delta[kind].map(id=>({id,kind})));
}

export function disclosureCoverage(delta:Delta,manifest:Manifest):{ok:boolean;missing:string[];unexpected:string[]}{
  const required=new Map(requiredDisclosures(delta).map(row=>[row.id,row.kind]));
  const supplied=new Map(manifest.changes.map(row=>[row.id,row.kind]));
  return {
    ok:required.size===supplied.size&&[...required].every(([id,kind])=>supplied.get(id)===kind),
    missing:[...required].filter(([id,kind])=>supplied.get(id)!==kind).map(([id])=>id),
    unexpected:[...supplied].filter(([id,kind])=>required.get(id)!==kind).map(([id])=>id),
  };
}

export function releaseCoverage(previous:Manifest|null,delta:Delta,manifest:Manifest):{ok:boolean;missing:string[];unexpected:string[]}{
  if(previous===null){
    const unexpected=manifest.changes.map(row=>row.id);
    return {ok:manifest.records.length>0&&unexpected.length===0,missing:[],unexpected};
  }
  return disclosureCoverage(delta,manifest);
}

export function canonicalDelta(delta:Delta):string{
  // Match Python's sort_keys=True compact JSON used by the contract.
  const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered((value as Record<string,unknown>)[k])])):value;
  return JSON.stringify(ordered(delta));
}

export async function fetchPinnedManifest(url:string,digest:string,period:number):Promise<Manifest>{
  if(!digestPattern.test(digest))throw new Error('Invalid onchain digest.');
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Pinned source unavailable (${response.status}).`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>24_000)throw new Error('Pinned source exceeds 24 KiB.');
  if(await sha256(bytes)!==digest.toLowerCase())throw new Error('Pinned source hash does not match onchain evidence.');
  return parseManifest(JSON.parse(new TextDecoder().decode(bytes)),period);
}
