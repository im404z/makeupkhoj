import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Daily listing-only refresh. Defaults to all stores and all category pages.
const supplied=process.argv.slice(2);
const platform=supplied[0]&&!supplied[0].startsWith('-')?supplied.shift():'all';
if(supplied.some(arg=>arg==='--mode'||arg.startsWith('--mode=')))throw Error('This command only refreshes listings; use refresh.mjs for PDP mode.');
const child=spawn(process.execPath,[fileURLToPath(new URL('./refresh.mjs',import.meta.url)),platform,...supplied,'--mode','price-update'],{
  stdio:'inherit',windowsHide:true,
});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
