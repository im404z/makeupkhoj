import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {values,positionals}=parseArgs({allowPositionals:true,options:{
  mode:{type:'string',default:'pdp'},limit:{type:'string',default:'0'},pages:{type:'string',default:'0'},
  concurrency:{type:'string',default:'3'},rate:{type:'string',default:'30'},sessions:{type:'string',default:'12'},
  'parallel-stores':{type:'string',default:'1'},
  engine:{type:'string',default:'auto'},'browser-stores':{type:'string'},delay:{type:'string',default:'250'},
  proxy:{type:'boolean'},'verbose-changes':{type:'boolean'},'block-media':{type:'boolean'},
  plan:{type:'boolean'},help:{type:'boolean'},
}});
if(values.help){console.log(`From project root: node crawler/refresh.mjs all|flipkart,myntra --mode pdp|listing|price-update
[--limit 100] [--pages 3] [--concurrency 3] [--rate 30] [--sessions 12] [--delay 250]
[--parallel-stores 2] [--engine auto|browser|http] [--browser-stores amazon,myntra] [--proxy] [--verbose-changes] [--block-media] [--plan]
PDP refresh revisits existing products. Listing and price-update scan category pages without visiting PDPs. Zero limit/pages means all.
Connections are direct unless --proxy is supplied.`);process.exit(0);}
const platform=positionals[0];
if(positionals.length!==1||(platform!=='all'&&platform.split(',').some(store=>!['amazon','flipkart','myntra','nykaa'].includes(store.trim()))))throw Error('Specify marketplaces separated by commas, or all; use --help');
if(!['listing','pdp','price-update'].includes(values.mode))throw Error('Mode must be listing, pdp or price-update');
const crawlType=values.mode==='price-update'?'listing':values.mode;
if(!['auto','browser','http'].includes(values.engine))throw Error('Mode must use the browser or http engine');
for(const key of ['limit','pages','concurrency','rate','sessions','delay'])if(!/^\d+$/.test(values[key])||!Number.isSafeInteger(Number(values[key]))||Number(values[key])<(['limit','pages','delay'].includes(key)?0:1))throw Error('Invalid '+key);
if(Number(values.concurrency)>12)throw Error('Use at most 12 concurrent requests');
const args=[fileURLToPath(new URL('./node/src/cli.js',import.meta.url)),'--platform',platform,'--type',crawlType,'--all',
  '--limit',values.limit,'--pages',values.pages,'--concurrency',values.concurrency,'--sessions',values.sessions,'--tabs','1','--rate',values.rate,'--engine',values.engine,'--delay',values.delay,'--parallel-stores',values['parallel-stores']];
if(values['browser-stores'])args.push('--browser-stores',values['browser-stores']);
for(const flag of ['plan','proxy','verbose-changes','block-media'])if(values[flag])args.push('--'+flag);
const child=spawn(process.execPath,args,{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
