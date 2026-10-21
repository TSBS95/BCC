'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {XMLParser,XMLValidator} = require('fast-xml-parser');
const {validateLibrary} = require('./core');
const parser = new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',parseAttributeValue:false,processEntities:true,isArray:name=>name==='parameter'});
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function parse(xml) {
  if(typeof xml!=='string'||xml.length>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('Invalid VEGAS bridge response.');
  return parser.parse(xml);
}
async function read(file) {
  try { if((await fs.stat(file)).size>1024*1024)throw new Error('Bridge file exceeds the size limit.');return await fs.readFile(file,'utf8'); }
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function atomic(file,text) {await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,text,'utf8');await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}}
function folderXml(value) {
  const library=validateLibrary(value);
  return '<?xml version="1.0" encoding="utf-8"?><folders version="1">'+library.folders.map(f=>`<folder id="${escape(f.id)}" name="${escape(f.name)}">${f.effects.map(id=>`<effect id="${escape(id)}" />`).join('')}</folder>`).join('')+`<favorites>${library.favorites.map(id=>`<effect id="${escape(id)}" />`).join('')}</favorites></folders>`;
}
function cleanControls(parameters) {
  if(!Array.isArray(parameters)||parameters.length>5000)throw new Error('Invalid plugin controls.');
  return parameters.filter(p=>p&&typeof p.name==='string'&&p.name.length<=512&&['double','integer'].includes(p.type)&&Number.isFinite(Number(p.default))).map(p=>{
    const result={name:p.name,label:String(p.label||p.name).slice(0,512),type:p.type,default:Number(p.default)};
    if(p.min!==undefined&&p.max!==undefined&&Number.isFinite(Number(p.min))&&Number.isFinite(Number(p.max))&&Number(p.min)<=Number(p.max)){result.min=Number(p.min);result.max=Number(p.max);}
    return result;
  });
}
function validateValues(values,controls) {
  if(!Array.isArray(values)||values.length>100)throw new Error('Invalid settings.');
  const seen=new Set();
  return values.map(v=>{
    const p=controls.find(c=>c.name===v.name);
    if(!p||seen.has(v.name)||!Number.isFinite(p.min)||!Number.isFinite(p.max)||typeof v.value!=='number'||!Number.isFinite(v.value)||v.value<p.min||v.value>p.max||(p.type==='integer'&&!Number.isInteger(v.value)))throw new Error('A setting is unavailable or outside the plugin range. Read its controls from VEGAS again.');
    seen.add(v.name);return {name:v.name,value:v.value};
  });
}
class Bridge {
  constructor(directory){this.directory=directory;this.busy=false;}
  async status(){
    try {
      const xml=await read(path.join(this.directory,'state.xml'));
      if(!xml)return {connected:false};
      const value=parse(xml).bridge;
      const age=Date.now()-Date.parse(value?.utc);
      if(value?.version!=='2'||!/^\w{32}$/.test(value.session)||!Number.isFinite(age)||age< -5000||age>5000)return {connected:false};
      return {connected:true,session:value.session};
    }catch{return {connected:false};}
  }
  async writeFolders(library){await atomic(path.join(this.directory,'folders.xml'),folderXml(library));}
  async request(action,effect,parameters=[]){
    if(this.busy)throw new Error('VEGAS is handling another request. Please wait.');
    if(!['inspect','apply'].includes(action)||typeof effect!=='string'||!effect||effect.length>2048)throw new Error('Invalid bridge request.');
    this.busy=true;
    const id=randomUUID().replaceAll('-','');let sent=false;
    const file=path.join(this.directory,'request.xml');
    try {
      const status=await this.status();
      if(!status.connected)throw new Error('Open the BCC FX Manager panel in VEGAS first. Use Connect VEGAS for instructions.');
      const expires=new Date(Date.now()+12000).toISOString();
      const xml=`<request id="${id}" session="${status.session}" expires="${expires}" action="${action}" effect="${escape(effect)}">${parameters.map(p=>`<parameter name="${escape(p.name)}" value="${escape(p.value)}" />`).join('')}</request>`;
      await atomic(file,xml);sent=true;
      while(Date.now()<Date.parse(expires)){
        await new Promise(resolve=>setTimeout(resolve,150));
        const raw=await read(path.join(this.directory,'response.xml'));
        if(!raw)continue;
        const response=parse(raw).response;
        if(response?.id!==id||response.session!==status.session)continue;
        if(response.error)throw new Error(response.error);
        return {message:response.message||'Done.',controls:cleanControls(response.parameter||[])};
      }
      throw new Error('VEGAS did not respond in time. Check the VEGAS panel and selected events before trying again.');
    }finally{
      if(sent){try{const existing=await read(file);if(existing&&parse(existing).request?.id===id)await fs.rm(file,{force:true});}catch{}}
      this.busy=false;
    }
  }
}
module.exports={Bridge,folderXml,cleanControls,validateValues,parse,atomic};
