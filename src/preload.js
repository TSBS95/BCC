const {contextBridge,ipcRenderer} = require('electron');
const invoke = async (channel,...args) => {
  const result = await ipcRenderer.invoke(channel,...args);
  if (result.error) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('bcc',{
  state:()=>invoke('state'),
  saveLibrary:value=>invoke('save-library',value),
  importCatalogue:()=>invoke('import'),
  exportBridge:()=>invoke('export-bridge'),
  exportApply:id=>invoke('export-apply',id),
  bridgeStatus:()=>invoke('bridge-status'),
  inspectEffect:id=>invoke('inspect-effect',id),
  applyEffect:(id,values)=>invoke('apply-effect',id,values),
  backupLibrary:()=>invoke('backup-library'),
  restoreLibrary:()=>invoke('restore-library')
});
