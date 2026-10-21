'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
async function main(){
 const executable=process.argv[2];if(!executable)throw new Error('Pass the packaged application EXE path.');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bcc-launch-check-')),resultFile=path.join(temp,'result.json');
 try{
  const status=await new Promise((resolve,reject)=>{
   const child=spawn(path.resolve(executable),['--smoke-test'],{env:{...process.env,BCC_SMOKE_RESULT:resultFile},stdio:'inherit'});
   const timeout=setTimeout(()=>{child.kill();reject(new Error('Packaged desktop did not finish its smoke test within 45 seconds.'));},45000);
   child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('exit',code=>{clearTimeout(timeout);resolve(code);});
  });
  const result=JSON.parse(await fs.readFile(resultFile,'utf8'));
  if(status!==0||!result.passed)throw new Error('Packaged desktop smoke test failed: '+JSON.stringify(result));
  console.log('Real packaged Electron launch, renderer, preload, and filesystem IPC passed:',JSON.stringify(result));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
