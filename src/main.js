'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {parseCatalogue,validateLibrary,applyScript} = require('./core');
const {Bridge,atomic,validateValues} = require('./bridge');
const smokeMode=process.argv.includes('--smoke-test')&&!!process.env.BCC_SMOKE_RESULT;
let win,bridge;
const dataFile = () => path.join(app.getPath('userData'),'library.json');
const catalogueFile = () => path.join(app.getPath('userData'),'catalogue.xml');
const controlsFile = () => path.join(app.getPath('userData'),'controls.json');
const bridgeDirectory = () => smokeMode?path.join(app.getPath('userData'),'test-bridge'):path.join(app.getPath('documents'),'BCC FX Manager');
let writeQueue = Promise.resolve(), lastBridgeXml='';
async function readOptional(file,fallback) {
  try { if((await fs.stat(file)).size>8*1024*1024)throw new Error('Local data file is too large.');return await fs.readFile(file,'utf8'); }
  catch(e){if(e.code==='ENOENT')return fallback;throw e;}
}
async function readCatalogue(){const xml=await readOptional(catalogueFile(),null);return xml?parseCatalogue(xml):[];}
async function readLibrary(){await writeQueue;const raw=await readOptional(dataFile(),null);return raw?validateLibrary(JSON.parse(raw)):{folders:[],favorites:[]};}
async function syncBridge(){
  const xml=await readOptional(path.join(bridgeDirectory(),'installed-effects.xml'),null);
  if(xml&&xml!==lastBridgeXml){parseCatalogue(xml);await atomic(catalogueFile(),xml);lastBridgeXml=xml;return true;}return false;
}
async function installed(id){if(typeof id!=='string')throw new Error('Choose an installed effect.');const effect=(await readCatalogue()).find(e=>e.id===id);if(!effect)throw new Error('Import your installed effects first. Demo effects cannot be applied.');return effect;}
function handle(name,fn){
  ipcMain.handle(name,async(event,...args)=>{
    if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return {error:'Unauthorized request.'};
    try{return {value:await fn(...args)};}catch(e){return {error:e.message||'Something went wrong.'};}
  });
}
const ownsLock=!app.requestSingleInstanceLock||app.requestSingleInstanceLock();
if(!ownsLock)app.quit();
else app.whenReady().then(async()=>{
  if(smokeMode)app.setPath('userData',await fs.mkdtemp(path.join(require('node:os').tmpdir(),'bcc-app-smoke-')));
  await fs.mkdir(app.getPath('userData'),{recursive:true});bridge=new Bridge(bridgeDirectory());
  handle('state',async()=>{
    let warning='';try{await syncBridge();}catch(e){warning='Could not read the VEGAS catalogue: '+e.message;}
    const library=await readLibrary();await bridge.writeFolders(library);
    return {library,effects:await readCatalogue(),bridge:await bridge.status(),platform:process.platform,warning};
  });
  handle('bridge-status',async()=>({...(await bridge.status()),catalogueChanged:await syncBridge()}));
  handle('save-library',value=>{
    const clean=validateLibrary(value);
    const task=writeQueue.catch(()=>{}).then(async()=>{await atomic(dataFile(),JSON.stringify(clean,null,2));await bridge.writeFolders(clean);return clean;});writeQueue=task;return task;
  });
  handle('import',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'Import your VEGAS effects',properties:['openFile'],filters:[{name:'VEGAS effect catalogue',extensions:['xml']}]});
    if(result.canceled)return null;
    const xml=await readOptional(result.filePaths[0],null), effects=parseCatalogue(xml);await atomic(catalogueFile(),xml);return effects;
  });
  handle('export-bridge',async()=>{
    const result=await dialog.showSaveDialog(win,{title:'Save the VEGAS connection script',defaultPath:path.join(app.getPath('documents'),'BCC-FX-Manager.cs'),filters:[{name:'VEGAS C# script',extensions:['cs']}]});
    if(result.canceled)return null;
    await fs.copyFile(path.join(__dirname,'../vegas/BCC-Export-Effects.cs'),result.filePath);
    await fs.copyFile(path.join(__dirname,'../vegas/BCC-Export-Effects.cs.config'),result.filePath+'.config');
    shell.showItemInFolder(result.filePath);return result.filePath;
  });
  handle('inspect-effect',async id=>{
    await installed(id);const result=await bridge.request('inspect',id);
    const raw=await readOptional(controlsFile(),'{}'),cache=JSON.parse(raw);cache[id]=result.controls;await atomic(controlsFile(),JSON.stringify(cache));return result;
  });
  handle('apply-effect',async(id,values=[])=>{
    await installed(id);const cache=JSON.parse(await readOptional(controlsFile(),'{}'));
    const settings=validateValues(values,cache[id]||[]);return bridge.request('apply',id,settings);
  });
  handle('export-apply',async id=>{
    const effect=await installed(id);
    const result=await dialog.showSaveDialog(win,{title:'Save a fallback VEGAS apply script',defaultPath:path.join(app.getPath('documents'),'BCC-Apply-Effect.cs'),filters:[{name:'VEGAS C# script',extensions:['cs']}]});
    if(result.canceled)return null;await fs.writeFile(result.filePath,applyScript(effect),'utf8');return result.filePath;
  });
  handle('backup-library',async()=>{
    const result=await dialog.showSaveDialog(win,{title:'Back up folders and favorites',defaultPath:path.join(app.getPath('documents'),'BCC-library-backup.json'),filters:[{name:'Library backup',extensions:['json']}]});
    if(result.canceled)return null;await fs.writeFile(result.filePath,JSON.stringify(await readLibrary(),null,2));return result.filePath;
  });
  handle('restore-library',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'Restore folders and favorites',properties:['openFile'],filters:[{name:'Library backup',extensions:['json']}]});
    if(result.canceled)return null;const value=validateLibrary(JSON.parse(await readOptional(result.filePaths[0],null)));
    const task=writeQueue.catch(()=>{}).then(async()=>{await atomic(dataFile(),JSON.stringify(value,null,2));await bridge.writeFolders(value);return value;});writeQueue=task;return task;
  });
  win=new BrowserWindow({show:!smokeMode,width:1240,height:820,minWidth:960,minHeight:680,backgroundColor:'#f6f6f6',title:'BCC FX Manager',icon:path.join(__dirname,'../assets/icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  await win.loadFile(path.join(__dirname,'index.html'));win.on('closed',()=>{win=null;});
  if(smokeMode){
    try{
      const result=await win.webContents.executeJavaScript('(async()=>{const state=await window.bcc.state();return {title:document.title,theme:getComputedStyle(document.body).backgroundColor,preload:typeof window.bcc.applyEffect,search:!!document.getElementById("search"),suggest:!!document.getElementById("generate"),effects:state.effects.length,folders:state.library.folders.length};})()');
      if(result.title!=='BCC FX Manager'||result.theme!=='rgb(246, 246, 246)'||result.preload!=='function'||!result.search||!result.suggest||result.effects!==0||result.folders!==0)throw new Error('Packaged desktop readiness check failed.');
      await atomic(process.env.BCC_SMOKE_RESULT,JSON.stringify({passed:true,...result}));app.quit();
    }catch(e){await atomic(process.env.BCC_SMOKE_RESULT,JSON.stringify({passed:false,error:e.message}));app.exit(1);}
  }
});
app.on('window-all-closed',()=>app.quit());
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
