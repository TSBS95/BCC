const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Bridge,folderXml,cleanControls,validateValues,parse,atomic}=require('../src/bridge');
const {recommendValues}=require('../src/core');

test('folder mirror preserves exact IDs and names with XML escaping',()=>{
 const xml=folderXml({folders:[{id:'a',name:'Night & neon',effects:['OFX:"quoted"']}],favorites:['OFX:"quoted"']});
 const data=parse(xml).folders;
 assert.equal(data.folder.name,'Night & neon');assert.equal(data.folder.effect.id,'OFX:"quoted"');
});
test('bridge XML rejects entity expansion and malformed data',()=>{
 assert.throws(()=>parse('<!DOCTYPE a [<!ENTITY x "secret">]><bridge/>'));
 assert.throws(()=>parse('<bridge>'));
});
test('only plugin-reported numeric controls and bounded values may be applied',()=>{
 const controls=cleanControls([{name:'mix',type:'double',default:'1',min:'0',max:'1'},{name:'text',type:'string',default:'hello'},{name:'bad',type:'double',default:'NaN'}]);
 assert.equal(controls.length,1);assert.deepEqual(validateValues([{name:'mix',value:0.25}],controls),[{name:'mix',value:0.25}]);
 for(const values of [[{name:'invented',value:1}],[{name:'mix',value:2}],[{name:'mix',value:NaN}],[{name:'mix',value:0.1},{name:'mix',value:0.2}]])assert.throws(()=>validateValues(values,controls));
 assert.throws(()=>validateValues([{name:'steps',value:1.5}],[{name:'steps',min:0,max:10,type:'integer'}]));
});
test('scene values use real parameter names, stay bounded, and adapt to scene strength',()=>{
 const controls=[{name:'actualMixId',label:'Mix',type:'double',default:1,min:0,max:1},{name:'actualAmplitudeId',label:'Amplitude',type:'integer',default:10,min:0,max:20},{name:'unrelated',label:'Seed',type:'integer',default:4,min:0,max:100},{name:'unbounded',label:'Brightness',type:'double',default:1}];
 const subtle=recommendValues('a subtle wedding scene',controls),strong=recommendValues('an intense impact',controls);
 assert.equal(subtle[0].name,'actualMixId');assert.equal(subtle[0].value,0.2);assert.equal(strong[0].value,0.65);
 assert.equal(subtle.length,2);assert(Number.isInteger(subtle[1].value));assert(subtle.every(p=>p.value>=p.min&&p.value<=p.max));
});
test('live bridge round trip binds session and request, ignoring stale responses',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bcc-bridge-'));let timer;
 try{
  const session='a'.repeat(32),bridge=new Bridge(dir);
  assert.equal((await bridge.status()).connected,false);
  await assert.rejects(()=>bridge.request('apply','effect'),/Open the BCC FX Manager panel/);
  await atomic(path.join(dir,'state.xml'),`<bridge version="2" session="${session}" utc="${new Date().toISOString()}" />`);
  await atomic(path.join(dir,'response.xml'),`<response id="stale" session="${session}" message="old" />`);
  assert.equal((await bridge.status()).connected,true);
  let writing=false;
  timer=setInterval(async()=>{
   if(writing)return;writing=true;
   try{
    const request=parse(await fs.readFile(path.join(dir,'request.xml'),'utf8')).request;
    assert.equal(request.effect,'OFX:&glow');assert.equal(request.session,session);
    await fs.rm(path.join(dir,'request.xml'));
    await atomic(path.join(dir,'response.xml'),`<response id="${request.id}" session="${session}" message="Done"><parameter name="mix" label="Mix" type="double" default="1" min="0" max="1" /></response>`);
   }catch(e){if(e.code!=='ENOENT')throw e;}finally{writing=false;}
  },30);
  const pending=bridge.request('inspect','OFX:&glow');
  await assert.rejects(()=>bridge.request('apply','second'),/another request/);
  const result=await pending;assert.equal(result.controls[0].name,'mix');assert.equal(result.message,'Done');
  assert.equal(bridge.busy,false);
  clearInterval(timer);timer=null;
  await atomic(path.join(dir,'state.xml'),`<bridge version="2" session="${session}" utc="2000-01-01T00:00:00Z" />`);
  assert.equal((await bridge.status()).connected,false);
 }finally{if(timer)clearInterval(timer);await fs.rm(dir,{recursive:true,force:true});}
});
