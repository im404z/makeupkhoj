import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {STORES} from './data';
const project=path.resolve(process.cwd(),process.cwd().endsWith('website')?'..':'.'),folder=path.join(project,'website','.admin'),stateFile=path.join(folder,'crawler.json'),stateDir=path.join(project,'crawler/node/state'),cli=path.join(project,'crawler/node/src/cli.js');
type Job={id:string;pid:number;status:string;startedAt:string;finishedAt?:string;exitCode?:number|null;platform:string;type:string;concurrency:number;pages:number;limit:number;tabs?:number;rate?:number;sessions?:number;sessionUses?:number;timeout?:number;delay?:number;external?:boolean};
const read=(file:string)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
function alive(pid:number){try{process.kill(pid,0);return true;}catch(e:any){return e.code==='EPERM';}}
function write(file:string,value:unknown){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file);}
function redact(s:string){s=s.replace(/\x1b\[[0-9;]*m/g,'').replace(/(https?:\/\/|mongodb(?:\+srv)?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[redacted]@');for(const [key,value] of Object.entries(process.env))if(value&&value.length>5&&/PASSWORD|SECRET|PROXY|MONGODB_URI|MONGO_URI/.test(key))s=s.split(value).join('[redacted]');return s;}
let legacyCache:{until:number;rows:any[]}|null=null;
function legacyRunners(){if(process.platform!=='win32')return [];if(legacyCache&&legacyCache.until>Date.now())return legacyCache.rows;
 const script=String.raw`$rows=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python.*exe$' -and $_.CommandLine -match 'crawler[\/].*\.py' }); $ids=@($rows.ProcessId); @($rows | Where-Object { $_.ParentProcessId -notin $ids } | ForEach-Object { [PSCustomObject]@{pid=$_.ProcessId;name=([regex]::Match($_.CommandLine,'crawler[\/][^"\r\n]*?\.py').Value)} }) | ConvertTo-Json -Compress`;
 try{const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:8000,encoding:'utf8'}).trim(),rows=raw?[JSON.parse(raw)].flat():[];legacyCache={until:Date.now()+4000,rows};return rows;}catch{throw Error('Could not verify other crawler processes');}}
function runnerLock(){const value=read(path.join(stateDir,'runner.lock'));return typeof value==='number'?{pid:value}:value;}
function recoverLock(){const owner=runnerLock();if(owner?.pid&&!alive(owner.pid))fs.unlinkSync(path.join(stateDir,'runner.lock'));else if(owner?.pid)throw Error('Another Node crawler is still running');else if(fs.existsSync(path.join(stateDir,'runner.lock')))throw Error('Runner lock is malformed; inspect it before starting');}
export function crawlerStatus(){
 let job:Job|null=read(stateFile);const runtime=read(path.join(stateDir,'runtime.json')),owner=runnerLock();
 if(runtime&&alive(runtime.pid)&&owner?.pid===runtime.pid&&runtime.runId!==job?.id){const saved=read(path.join(stateDir,'latest.json'));job={id:runtime.runId,pid:runtime.pid,status:runtime.status,startedAt:runtime.startedAt,platform:runtime.store||'all',type:runtime.phase||'pdp',concurrency:saved?.options?.concurrency||1,pages:saved?.options?.pages||0,limit:saved?.options?.limit||0,external:true};write(stateFile,job);}
 if(job){if(runtime?.runId===job.id&&runtime.pid===job.pid){job={...job,status:runtime.status,finishedAt:runtime.finishedAt};}if(['running','stopping'].includes(job.status)&&!alive(job.pid))job.status='interrupted';write(stateFile,job);}
 let log='';if(job){const logfile=path.join(folder,job.id+'.log');if(fs.existsSync(logfile)){const fd=fs.openSync(logfile,'r');try{const size=fs.fstatSync(fd).size,b=Buffer.alloc(Math.min(size,30000));fs.readSync(fd,b,0,b.length,Math.max(0,size-b.length));log=redact(b.toString());}finally{fs.closeSync(fd);}}}
 return {job,runtime:job&&runtime?.runId===job.id?runtime:null,legacy:legacyRunners(),log};
}
export function launchCrawler(input:Record<string,unknown>){
 fs.mkdirSync(folder,{recursive:true});const lockfile=path.join(folder,'launch.lock');let fd:number;try{fd=fs.openSync(lockfile,'wx');}catch{throw Error('Another launch is in progress');}
 try{const state=crawlerStatus();if(state.job&&['running','stopping'].includes(state.job.status))throw Error('Stop the active crawler first');if(state.legacy.length)throw Error('Stop other legacy crawler runs first');recoverLock();
 const platform=String(input.platform),type=String(input.type);if(![...STORES,'all'].includes(platform as typeof STORES[number])||!['listing','pdp','all'].includes(type))throw Error('Invalid marketplace or type');
 const n=(key:string,min:number,max:number,fallback:number)=>{const value=Number(input[key]??fallback);if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('Invalid '+key);return value;};
 const concurrency=n('concurrency',1,12,4),pages=n('pages',0,1000,0),limit=n('limit',0,100000,0),tabs=n('tabs',1,4,1),sessions=n('sessions',1,100,12),rate=n('rate',1,600,120),sessionUses=n('sessionUses',1,100,5),timeout=n('timeout',30,1800,90),delay=n('delay',0,10000,250);
 const id=randomUUID(),output=fs.openSync(path.join(folder,id+'.log'),'a'),env={...process.env};for(const key of Object.keys(env))if(key.startsWith('ADMIN_'))delete env[key];
 let child;try{child=spawn(process.execPath,[cli,'--run-id',id,'--platform',platform,'--type',type,'--pages',String(pages),'--limit',String(limit),'--concurrency',String(concurrency),'--sessions',String(sessions),'--tabs',String(tabs),'--rate',String(rate),'--session-uses',String(sessionUses),'--timeout',String(timeout),'--delay',String(delay),'--block-media',...(input.proxy===true?['--proxy']:[])],{cwd:project,env,detached:true,windowsHide:true,stdio:['ignore',output,output]});}finally{fs.closeSync(output);}
 if(!child.pid)throw Error('Could not start crawler');const job:Job={id,pid:child.pid,status:'running',startedAt:new Date().toISOString(),platform,type,concurrency,pages,limit,tabs,sessions,rate,sessionUses,timeout,delay};write(stateFile,job);
 child.once('error',()=>{const current=read(stateFile);if(current?.id===id)write(stateFile,{...current,status:'failed',finishedAt:new Date().toISOString()});});
 child.once('close',code=>{const current=read(stateFile),runtime=read(path.join(stateDir,'runtime.json'));if(current?.id===id)write(stateFile,{...current,status:current.status==='stopped'?'stopped':runtime?.runId===id?runtime.status:code===0?'completed':'failed',exitCode:code,finishedAt:new Date().toISOString()});});child.unref();return job;
 }finally{fs.closeSync(fd);fs.unlinkSync(lockfile);}
}
function verifiedNodePid(pid:number){
 if(!Number.isSafeInteger(pid)||pid<1||!alive(pid))return false;
 let command='';if(process.platform==='win32')command=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','(Get-CimInstance Win32_Process -Filter "ProcessId='+pid+'").CommandLine'],{windowsHide:true,encoding:'utf8',timeout:8000});else command=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');
 return command.replaceAll('\\','/').includes(cli.replaceAll('\\','/'))||command.replaceAll('\\','/').includes('crawler/node/src/cli.js');
}
export function stopCrawler(force=false){const {job}=crawlerStatus();if(!job)throw Error('No known crawler');if(!alive(job.pid)){recoverLock();return job;}
 if(!verifiedNodePid(job.pid))throw Error('Process identity changed; refusing to stop an unrelated process');
 if(force){if(process.platform==='win32')execFileSync('taskkill.exe',['/PID',String(job.pid),'/T','/F'],{windowsHide:true,timeout:15000});else process.kill(-job.pid,'SIGKILL');const stopped={...job,status:'stopped',finishedAt:new Date().toISOString()};write(stateFile,stopped);const runtime=read(path.join(stateDir,'runtime.json'));if(runtime?.runId===job.id)write(path.join(stateDir,'runtime.json'),{...runtime,status:'stopped',reason:'Force stopped by admin',finishedAt:stopped.finishedAt});recoverLock();return stopped;}
 write(path.join(stateDir,job.id,'control.json'),{command:'stop',at:new Date().toISOString()});const stopping={...job,status:'stopping'};write(stateFile,stopping);return stopping;}
export function stopLegacyCrawlers(){const rows=legacyRunners();for(const row of rows){if(Number.isSafeInteger(row.pid)&&row.pid>0)try{execFileSync('taskkill.exe',['/PID',String(row.pid),'/T','/F'],{windowsHide:true,timeout:15000});}catch{if(alive(row.pid))throw Error('Could not stop legacy crawler '+row.pid);}}legacyCache=null;return {stopped:rows.length};}
