const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('desktop IPC imports a real file, persists folders, exports scripts, and rejects foreign senders',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bcc-desktop-'));
  try {
    const handlers=new Map(), sender={}, frame={};let ready, nextOpen, nextSave;
    class Window {
      constructor(){this.webContents=sender;sender.mainFrame=frame;sender.setWindowOpenHandler=()=>{};sender.on=()=>{};}
      async loadFile(){}
      on(){}
    }
    const electron={
      app:{getPath:name=>path.join(temp,name),whenReady:()=>({then:fn=>{ready=Promise.resolve().then(fn);}}),on(){},quit(){}},
      BrowserWindow:Window,
      ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
      dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[nextOpen]}),showSaveDialog:async()=>({canceled:false,filePath:nextSave})},
      shell:{showItemInFolder(){}}
    };
    const source=await fs.readFile(path.join(__dirname,'../src/main.js'),'utf8');
    vm.runInNewContext(source,{require:id=>id==='electron'?electron:id==='./core'?require('../src/core'):id==='./bridge'?require('../src/bridge'):require(id),__dirname:path.join(__dirname,'../src'),process});
    await ready;
    const call=async(name,...args)=>{
      const result=await handlers.get(name)({sender,senderFrame:frame},...args);
      if(result.error)throw new Error(result.error);return result.value;
    };
    assert.equal((await call('state')).effects.length,0);
    nextOpen=path.join(temp,'export.xml');
    await fs.writeFile(nextOpen,'<bcc-fx-catalogue version="1"><effect id="OFX.real.glow" name="BCC+ Glow" /></bcc-fx-catalogue>');
    assert.equal((await call('import'))[0].id,'OFX.real.glow');
    await call('save-library',{folders:[{id:'night',name:'Night',effects:['OFX.real.glow']}],favorites:['OFX.real.glow']});
    const state=await call('state');
    assert.equal(state.library.folders[0].effects[0],'OFX.real.glow');
    assert.equal(JSON.parse(await fs.readFile(path.join(temp,'userData','library.json'),'utf8')).favorites[0],'OFX.real.glow');
    nextSave=path.join(temp,'apply.cs');await call('export-apply','OFX.real.glow');
    assert.match(await fs.readFile(nextSave,'utf8'),/GetChildByUniqueID\("OFX.real.glow"\)/);
    await assert.rejects(()=>call('export-apply','invented-id'),/Import your installed effects/);
    nextSave=path.join(temp,'bridge.cs');await call('export-bridge');
    assert.match(await fs.readFile(nextSave,'utf8'),/ReadChildren\(vegas.VideoFX\)/);
    assert.match(await fs.readFile(path.join(temp,'documents','BCC FX Manager','folders.xml'),'utf8'),/name="Night"/);
    assert.equal((await handlers.get('state')({sender:{},senderFrame:frame})).error,'Unauthorized request.');
    assert.equal((await handlers.get('state')({sender,senderFrame:{}})).error,'Unauthorized request.');
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});
