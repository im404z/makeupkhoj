import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { directory, stores, targets } from './config.js';
import { Storage } from './storage.js';
import {atomicJson,readJson,acquireRunnerLock} from './runtime.js';
import { crawl, checkProxy } from './crawler.js';

const { values: v } = parseArgs({ options: {
  platform: { type: 'string', default: 'all' }, type: { type: 'string', default: 'listing' },
  engine: { type: 'string', default: 'browser' }, concurrency: { type: 'string', default: '3' },
  sessions: { type: 'string', default: '5' }, tabs: { type: 'string', default: '1' },
  pages: { type: 'string', default: '3' }, limit: { type: 'string', default: '50' },
  rate: { type: 'string', default: '30' }, retries: { type: 'string', default: '2' },
  timeout: { type: 'string' }, 'session-uses': { type: 'string', default: '20' },
  delay: { type: 'string', default: '1000' }, url: { type: 'string' }, 'sub-cat': { type: 'string' },
  id: { type: 'string' }, headful: { type: 'boolean' }, all: { type: 'boolean' },
  'dry-run': { type: 'boolean' }, 'sync-master': { type: 'boolean' }, 'block-media': { type: 'boolean' },
  plan: { type: 'boolean' }, resume: { type: 'boolean' }, status: { type: 'boolean' },
  'run-id': {type:'string'}, 'navigation-timeout': {type:'string',default:'45'}, 'stall-timeout': {type:'string',default:'180'}, stop:{type:'boolean'}, 'check-proxy': { type: 'boolean' }, help: { type: 'boolean' }, debug: { type: 'boolean' }
} });
if (v.help) {
  console.log(`Native Crawlee crawler (no Python)\n
--platform all|amazon|flipkart|myntra|nykaa --type listing|pdp|all
--concurrency 3 --sessions 5 --tabs 1 --pages 3 --limit 50
--engine browser|http --rate 30 --retries 2 --delay 1000 --headful
--url URL --id PRODUCT_ID --sub-cat Face --all --dry-run --sync-master
--plan --resume --status --check-proxy
pages/limit 0 means all. Browser mode is recommended for Myntra pagination.
Concurrency is across requests/categories for the current store; stores run in sequence.
Use --url and --id for PDP dry-run. Proxy configuration: crawler/node/.env`);
  process.exit(0);
}
let options = { engine: v.engine, headful: !!v.headful, all: !!v.all, dryRun: !!v['dry-run'], syncMaster: !!v['sync-master'], blockMedia: !!v['block-media'], debug: !!v.debug, url: v.url };
for (const [flag, key] of Object.entries({ concurrency: 'concurrency', sessions: 'sessions', tabs: 'tabs', pages: 'pages', limit: 'limit', rate: 'rate', retries: 'retries', timeout: 'timeout', delay: 'delay', 'navigation-timeout':'navigationTimeout','stall-timeout':'stallTimeout','session-uses': 'sessionUses' })) {
  options[key] = Number(flag==='timeout'?(v.timeout||(v.type==='pdp'?'90':'1800')):v[flag]);
  if (!Number.isSafeInteger(options[key]) || options[key] < (['pages', 'limit', 'retries', 'delay'].includes(flag) ? 0 : 1)) throw Error(`Invalid --${flag}`);
}
if (!['browser', 'http'].includes(options.engine)) throw Error('Invalid --engine');
if (!['listing', 'pdp', 'all'].includes(v.type)) throw Error('Invalid --type');
const selected = v.platform === 'all' ? stores : [v.platform];
if (selected.some(s => !stores.includes(s))) throw Error('Invalid platform');
if (v.url && selected.length !== 1) throw Error('--url requires one --platform');
const stateDir = path.join(directory, 'state');
const statePath = path.join(stateDir, 'latest.json');
if(v.status){console.log(JSON.stringify(readJson(path.join(stateDir,'runtime.json'))||{status:'idle'},null,2));process.exit(0);}
if(v.stop){const current=readJson(path.join(stateDir,'runtime.json'));if(!current?.runId)throw Error('No known run');atomicJson(path.join(stateDir,current.runId,'control.json'),{command:'stop',at:new Date().toISOString()});console.log('Stop requested');process.exit(0);}
if (v['check-proxy']) { await checkProxy(options); process.exit(process.exitCode || 0); }
let state;
if (v.resume) { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); options = state.options; }
else {
  const jobs = [];
  for (const store of selected) {
    if (v.type !== 'pdp') jobs.push({ store, phase: 'listing', targets: targets(store, v.url, v['sub-cat']), status: 'pending' });
    if (v.type !== 'listing') jobs.push({ store, phase: 'pdp', status: 'pending' });
  }
  if (v.url && v.type === 'pdp') {
    targets(selected[0], v.url); // Validate marketplace domain.
    if (!v.id) throw Error('Single PDP requires --id (preserve existing marketplace ID)');
    options.product = { id: v.id, ...(selected[0] === 'amazon' ? { asin: v.id } : {}), url: v.url };
  }
  if (v.url && v.type === 'all') throw Error('--url supports listing or pdp, not all');
  state = { runId:v['run-id']||randomUUID(), options, jobs };
}
if (v.plan) { console.log(JSON.stringify(state, null, 2)); process.exit(0); }
if (state.jobs.some(j => j.phase === 'listing' && !j.targets.length)) throw Error('No matching categories');
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(state.runId))throw Error('Invalid run ID');
fs.mkdirSync(stateDir,{recursive:true});fs.mkdirSync(path.join(stateDir,state.runId),{recursive:true});
const release=acquireRunnerLock(path.join(stateDir,'runner.lock'),state.runId),controller=new AbortController();
const runtime={runId:state.runId,pid:process.pid,status:'running',stage:'starting',startedAt:new Date().toISOString(),queued:0,handled:0,failures:0,saved:0,activeBrowsers:0};
const runtimePath=path.join(stateDir,'runtime.json'),controlPath=path.join(stateDir,state.runId,'control.json');
let lastActivity=Date.now(),previousCounts='',stalled=false;
const writeRuntime=()=>atomicJson(runtimePath,{...runtime,heartbeat:new Date().toISOString()});
const stop=reason=>{if(controller.signal.aborted)return;runtime.status='stopping';runtime.reason=reason;writeRuntime();controller.abort();};
const interrupt=()=>stop('Stop requested');process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
const monitor=setInterval(()=>{const control=readJson(controlPath);if(control?.command==='stop')stop('Stop requested from admin');if(!controller.signal.aborted&&Date.now()-lastActivity>(options.stallTimeout||180)*1000){stalled=true;stop('No crawl progress within stall timeout');}writeRuntime();},1000);monitor.unref();
const persist=()=>atomicJson(statePath,state);
const storage=new Storage({...options,runId:state.runId});
writeRuntime();persist();
try{
 await storage.open();
 for(const job of state.jobs){
  if(controller.signal.aborted)break;if(job.status==='done')continue;
  if(job.phase==='pdp'&&state.jobs.some(j=>j.store===job.store&&j.phase==='listing'&&j.status!=='done')){job.status='blocked';persist();continue;}
  job.status='running';lastActivity=Date.now();persist();
  let lastLog = 0;
  try{await storage.prepare(job.store);const result=await crawl({...job,storage,options,runId:state.runId,signal:controller.signal,onProgress:fields=>{const counts=[fields.queued,fields.handled,fields.failures,fields.saved,fields.stage].join('|');if(counts!==previousCounts){lastActivity=Date.now();previousCounts=counts;}if(Date.now()-lastLog>5000){lastLog=Date.now();console.log(`[${job.store.toUpperCase()} ${job.phase.toUpperCase()}] Queued: ${fields.queued} | Handled: ${fields.handled} | Saved: ${fields.saved} | Failures: ${fields.failures} | Active: ${fields.active||0} | Browsers: ${fields.activeBrowsers||0}`);}Object.assign(runtime,fields);writeRuntime();}});job.status=result.stopped?'stopped':result.failures?'failed':'done';job.failures=result.failures;}
  catch(error){job.status=controller.signal.aborted?'stopped':'failed';job.error=error.message;console.error(job.store+': '+error.message);}
  persist();
 }
 state.saved=storage.saved;runtime.saved=storage.saved;runtime.status=stalled?'stalled':controller.signal.aborted?'stopped':state.jobs.every(j=>j.status==='done')?'completed':'failed';
 if(runtime.status==='failed')process.exitCode=1;
}catch(error){runtime.status='failed';runtime.reason='Crawler initialization failed';console.error(error.message);process.exitCode=1;}
finally{clearInterval(monitor);process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);await storage.close();runtime.finishedAt=new Date().toISOString();writeRuntime();persist();release();console.log('Crawler '+runtime.status+'. Saved '+storage.saved+' products.');}
