import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLooperCodexQueryService, loadLooperCodexArtifact } from '@helixa/loopers-codex';

const HARD_CAP = 128 * 1024 * 1024;
const TEXT_CAP = 512;
const ARRAY_CAP = 16;
export const LOOPER_CODEX_CONSOLE_RELEASE = Object.freeze({ count:7777, artifactBytes:60_203_971, fileSha256:'aa4f92f4e580f19691d591797826d750d45707ef0984a8b7e419d1e334813073', artifactHash:'5a776e6c2cacb211dedbbec7837416be46775f9e46a1a4cda4b3a96c70262f24' });
export class LooperCodexUnavailableError extends Error { constructor(message='Looper Codex is unavailable',options){super(message,options);this.name='LooperCodexUnavailableError';} }
export class LooperCodexInputError extends Error { constructor(message='Invalid Looper Codex input',options){super(message,options);this.name='LooperCodexInputError';} }

export async function createLooperCodexRuntime({artifactPath,expectedCount,release=LOOPER_CODEX_CONSOLE_RELEASE,logger=console}={}){
 if(!artifactPath){log(logger,'warn',{event:'looper_codex_unavailable',reason:'not_configured'});return unavailable('not_configured');}
 const started=Date.now(),rss=process.memoryUsage().rss;
 try{
  const count=expectedCount??release.count; validateRelease(release,count);
  const artifact=await loadPinnedArtifact(artifactPath,release,count);
  if(artifact.semantic.count!==count||count!==release.count)throw new RangeError('artifact count mismatch');
  if(artifact.artifactHash!==release.artifactHash)throw new TypeError('artifact semantic hash mismatch');
  const service=createLooperCodexQueryService(artifact);
  const status=deepFreeze({available:true,schemaVersion:artifact.semantic.schemaVersion,artifactHash:artifact.artifactHash,codexVersion:artifact.semantic.versions.traitCodexVersion,count});
  const runtime=Object.freeze({available:true,status,query:(name,input)=>query(service,name,input),getProfileContext:(tokenId)=>project(query(service,'getTokenProfile',{tokenId}))});
  log(logger,'info',{event:'looper_codex_ready',schemaVersion:status.schemaVersion,artifactHashPrefix:status.artifactHash.slice(0,12),count,loadMs:Date.now()-started,rssDeltaBytes:process.memoryUsage().rss-rss});
  return runtime;
 }catch(error){log(logger,'warn',{event:'looper_codex_unavailable',reason:'invalid_artifact',errorClass:errorClass(error)});return unavailable('invalid_artifact');}
}

const specs=Object.freeze({
 getTokenProfile:spec(['tokenId'],[],(s,i)=>s.getTokenProfile(i.tokenId)),
 explainTraits:spec(['tokenId'],[],(s,i)=>s.explainTraits(i.tokenId)),
 compareTokens:spec(['leftTokenId','rightTokenId'],[],(s,i)=>s.compareTokens(i.leftTokenId,i.rightTokenId)),
 findByTraits:spec(['filters'],['cursor','limit'],(s,i)=>s.findByTraits(i.filters,Object.hasOwn(i,'cursor')?i.cursor:null,Object.hasOwn(i,'limit')?i.limit:25)),
 findSimilar:spec(['tokenId'],['limit'],(s,i)=>s.findSimilar(i.tokenId,Object.hasOwn(i,'limit')?i.limit:10)),
 getTraitStats:spec(['traitType','value'],[],(s,i)=>s.getTraitStats(i.traitType,i.value)),
 getCollectionSummary:spec([],[],s=>s.getCollectionSummary()),
});
function spec(required,optional,call){return Object.freeze({required:Object.freeze(required),optional:Object.freeze(optional),call});}
function query(service,name,input){try{if(typeof name!=='string'||!Object.hasOwn(specs,name))throw new LooperCodexInputError('unknown Looper Codex operation');const s=specs[name];exact(input,s.required,s.optional);return s.call(service,input);}catch(error){if(error instanceof LooperCodexInputError)throw error;if(error instanceof TypeError||error instanceof RangeError)throw new LooperCodexInputError(error.message,{cause:error});throw new LooperCodexUnavailableError('Looper Codex query execution failed',{cause:error});}}
function exact(input,required,optional){if(!plain(input))throw new LooperCodexInputError('input must be a plain object');const allowed=new Set([...required,...optional]);const unknown=Object.keys(input).find(k=>!allowed.has(k));if(unknown!==undefined)throw new LooperCodexInputError('unknown input key: '+unknown);const missing=required.find(k=>!Object.hasOwn(input,k));if(missing!==undefined)throw new LooperCodexInputError('missing input key: '+missing);}
function plain(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function project(profile){const {identity,interpretation:i,visualTraits,versions}=profile.result;return deepFreeze({schemaVersion:text(profile.schemaVersion),artifactHash:text(profile.artifactHash),codexVersion:text(profile.codexVersion),identity:{tokenId:identity.tokenId,canonicalName:text(identity.canonicalName)},interpretation:{primaryClass:text(i.primaryClass),secondaryClass:text(i.secondaryClass),specialization:text(i.specialization),risk:labelValue(i.risk),autonomy:labelValue(i.autonomy),voice:text(i.voice),values:texts(i.values),communicationStyle:texts(i.communicationStyle),humor:texts(i.humor),origin:text(i.origin),shortLore:text(i.shortLore),missionBias:text(i.missionBias),firstMission:text(i.firstMission),recommendedSkills:i.recommendedSkills.slice(0,8).map(x=>({skillFamily:text(x.skillFamily),reason:text(x.reason),status:'recommended'}))},traits:visualTraits.slice(0,ARRAY_CAP).map(x=>({type:text(x.type),value:text(x.value)})),versions:{traitCodexVersion:text(versions.traitCodexVersion),classModelVersion:text(versions.classModelVersion)},evidence:profile.evidence.slice(0,ARRAY_CAP).map(x=>({id:text(x.id),kind:text(x.kind),label:text(x.label)}))});}
function labelValue(x){return {value:x.value,label:text(x.label)};} function texts(x){return x.slice(0,ARRAY_CAP).map(text);} function text(x){return String(x).slice(0,TEXT_CAP);}
function unavailable(reason){const status=deepFreeze({available:false,reason});const fail=()=>{throw new LooperCodexUnavailableError();};return Object.freeze({available:false,status,query:fail,getProfileContext:fail});}
function validateRelease(r,count){if(!plain(r))throw new TypeError('release descriptor must be plain');if(!Number.isSafeInteger(count)||count<1||count!==r.count)throw new RangeError('invalid release count');if(!Number.isSafeInteger(r.artifactBytes)||r.artifactBytes<1)throw new RangeError('invalid release byte length');if(!/^[a-f0-9]{64}$/.test(r.fileSha256)||!/^[a-f0-9]{64}$/.test(r.artifactHash))throw new TypeError('invalid release hash');}
async function loadPinnedArtifact(file,release,count){
 const inspected=await lstat(file);
 if(!inspected.isFile()||inspected.isSymbolicLink())throw new TypeError('artifact must be a regular non-symlink file');
 if(inspected.size>HARD_CAP)throw new RangeError('artifact exceeds hard byte cap');
 const directory=await mkdtemp(join(tmpdir(),'looper-codex-runtime-'));
 const snapshotName=join(directory,'artifact.json');
 let input; let snapshot;
 try{
  input=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const opened=await input.stat();
  if(!opened.isFile())throw new TypeError('artifact must be a regular file');
  if(opened.size>HARD_CAP)throw new RangeError('artifact exceeds hard byte cap');
  snapshot=await open(snapshotName,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
  const hash=createHash('sha256'); const buffer=Buffer.allocUnsafe(64*1024); let total=0; let position=0;
  while(true){
   const {bytesRead}=await input.read(buffer,0,buffer.length,position);
   if(bytesRead===0)break;
   total+=bytesRead;
   if(total>HARD_CAP)throw new RangeError('artifact exceeds hard byte cap while reading');
   hash.update(buffer.subarray(0,bytesRead));
   let written=0;
   while(written<bytesRead){const result=await snapshot.write(buffer,written,bytesRead-written,position+written);written+=result.bytesWritten;}
   position+=bytesRead;
  }
  if(total!==release.artifactBytes)throw new RangeError('artifact byte length mismatch');
  if(hash.digest('hex')!==release.fileSha256)throw new TypeError('artifact serialized SHA mismatch');
  await snapshot.sync(); await snapshot.close(); snapshot=undefined;
  await input.close(); input=undefined;
  return await loadLooperCodexArtifact({path:snapshotName,expectedCount:count});
 }finally{
  await snapshot?.close().catch(()=>{}); await input?.close().catch(()=>{}); await rm(directory,{recursive:true,force:true});
 }
}
function errorClass(e){const n=e?.constructor?.name;return typeof n==='string'&&/^[A-Za-z][A-Za-z0-9]*$/.test(n)?n:'Error';}
function log(logger,level,event){try{logger?.[level]?.(event);}catch{}}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const child of Object.values(value))deepFreeze(child);return Object.freeze(value);}
