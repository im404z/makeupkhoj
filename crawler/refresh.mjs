import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {values,positionals}=parseArgs({allowPositionals:true,options:{
  mode:{type:'string',default:'pdp'},limit:{type:'string',default:'0'},pages:{type:'string',default:'0'},
  concurrency:{type:'string',default:'3'},rate:{type:'string',default:'30'},sessions:{type:'string',default:'12'},
  plan:{type:'boolean'},help:{type:'boolean'},
}});
if(values.help){console.log('From project root: node crawler/refresh.mjs amazon|flipkart|myntra|nykaa|all --mode pdp|listing [--limit 100] [--pages 3] [--concurrency 3] [--rate 30] [--sessions 12] [--plan]\nPDP refresh revisits existing records, including already enriched products. Listing refresh scans category pages. Zero limit/pages means all.');process.exit(0);}
const platform=positionals[0];
if(positionals.length!==1||!['amazon','flipkart','myntra','nykaa','all'].includes(platform))throw Error('Specify one marketplace or all; use --help');
if(!['listing','pdp'].includes(values.mode))throw Error('Mode must be listing or pdp');
for(const key of ['limit','pages','concurrency','rate','sessions'])if(!/^\d+$/.test(values[key])||!Number.isSafeInteger(Number(values[key]))||Number(values[key])<(['limit','pages'].includes(key)?0:1))throw Error('Invalid '+key);
if(Number(values.concurrency)>12)throw Error('Use at most 12 concurrent requests');
const args=[fileURLToPath(new URL('./node/src/cli.js',import.meta.url)),'--platform',platform,'--type',values.mode,'--all',
  '--limit',values.limit,'--pages',values.pages,'--concurrency',values.concurrency,'--sessions',values.sessions,'--tabs','1','--rate',values.rate];
if(values.plan)args.push('--plan');
const child=spawn(process.execPath,args,{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
