'use strict';
const $ = id => document.getElementById(id);
const {families,normalizeEffects,searchEffects,suggest,recommendValues} = window.BCCCore;
let effects = [], library = {folders:[],favorites:[]}, family = 'All effects', folder = null, favoritesOnly = false, demo = false, selected = null, toastTimer, connected=false, editingFolder=null, deletingFolder=null;
const demoEffects = normalizeEffects([
  {id:'demo-glow',name:'BCC+ Glow'}, {id:'demo-leaks',name:'BCC+ Light Leaks'},
  {id:'demo-grain',name:'BCC Film Grain'}, {id:'demo-flare',name:'BCC Lens Flare 3D'},
  {id:'demo-sglow',name:'S_Glow'}, {id:'demo-shake',name:'S_Shake'},
  {id:'demo-blur',name:'S_BlurMotion'}, {id:'demo-glitch',name:'S_DigitalDamage'},
  {id:'demo-vignette',name:'BCC Vignette'}
]);
function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className=cls; if (text !== undefined) el.textContent=text; return el; }
function toast(text) { $('toast').textContent=text; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),8500); }
async function run(fn) { try { await fn(); } catch(e) { toast(e.message || 'Something went wrong.'); } }
function openConnect() { $('connect-dialog').showModal(); }
for (const id of ['connect','connect-small','connect-empty']) $(id).onclick=openConnect;
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
async function persist() { if (demo) return; try {await window.bcc.saveLibrary(library);}catch(e){await refresh();throw e;} }
function setPage(page) {
  $('search-page').classList.toggle('hidden',page!=='search'); $('suggest-page').classList.toggle('hidden',page!=='suggest');
  $('nav-search').classList.toggle('active',page==='search'&&!folder&&!favoritesOnly);
  $('nav-suggest').classList.toggle('active',page==='suggest');
  $('nav-favorites').classList.toggle('active',page==='search'&&favoritesOnly);
  $('breadcrumb').textContent=page==='suggest'?'FX Suggest':folder?library.folders.find(f=>f.id===folder)?.name||'Folder':favoritesOnly?'Favorites':'Search';
}
function showLibrary() { setPage('search'); render(); }
$('nav-search').onclick=()=>{folder=null;favoritesOnly=false;showLibrary();};
$('nav-suggest').onclick=()=>{setPage('suggest');};
$('nav-favorites').onclick=()=>{folder=null;favoritesOnly=true;showLibrary();};
families.forEach(f=>{const b=node('button','chip',f);b.onclick=()=>{family=f;render();};$('families').append(b);});
$('search').oninput=render;
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPage('search');$('search').focus();}});
function renderFolders() {
  $('folder-list').replaceChildren();
  for (const f of library.folders) {
    const row=node('div','folder-row'), b=node('button','nav'+(folder===f.id?' active':''));
    b.append(node('span','','▱'),node('span','folder-name',f.name),node('small','',String(f.effects.length)));
    b.onclick=()=>{folder=f.id;favoritesOnly=false;showLibrary();};
    const del=node('button','folder-delete','×');del.title='Delete folder '+f.name;del.setAttribute('aria-label',del.title);
    del.onclick=()=>{deletingFolder=f.id;$('delete-description').textContent=`This removes “${f.name}” from the manager and its VEGAS panel. Your effects stay installed.`;$('delete-dialog').showModal();};
    row.append(b,del);$('folder-list').append(row);
  }
  $('favorite-count').textContent=library.favorites.length;
}
function render() {
  renderFolders();
  $('families').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.textContent===family));
  const currentFolder=library.folders.find(f=>f.id===folder);
  const ids=favoritesOnly?library.favorites:currentFolder?currentFolder.effects:null;
  const results=searchEffects(effects,$('search').value,family,ids);
  $('library-title').replaceChildren();
  if (currentFolder||favoritesOnly) $('library-title').textContent=currentFolder?currentFolder.name:'Your favorites.';
  else $('library-title').textContent='Find your effects.';
  $('rename-folder').classList.toggle('hidden',!currentFolder);
  $('total-count').textContent=effects.length;
  $('result-count').textContent=`${results.length} EFFECT${results.length===1?'':'S'} ${currentFolder?'IN THIS FOLDER':'IN YOUR COLLECTION'}`;
  $('catalogue-label').textContent=demo?'DEMO EXAMPLES':'IMPORTED FROM VEGAS';
  $('demo-notice').classList.toggle('hidden',!demo);
  $('empty-library').classList.toggle('hidden',effects.length>0);
  $('no-results').classList.toggle('hidden',!effects.length||results.length>0);
  $('effects').replaceChildren();
  results.forEach((e,i)=>{
    const card=node('article','effect-card');
    const visual=node('div','card-visual '+(e.family==='Sapphire'?'sapphire':e.family==='BCC+'?'bccplus':''));
    visual.append(node('span','visual-symbol',e.family==='Sapphire'?'S':e.family==='BCC+'?'B+':e.family==='BCC'?'B':'FX'));
    const favorite=node('button','favorite'+(library.favorites.includes(e.id)?' selected':''),library.favorites.includes(e.id)?'★':'☆');
    favorite.setAttribute('aria-label',`Toggle favorite ${e.name}`);favorite.setAttribute('aria-pressed',String(library.favorites.includes(e.id)));
    favorite.onclick=()=>run(async()=>{library.favorites=library.favorites.includes(e.id)?library.favorites.filter(id=>id!==e.id):[...library.favorites,e.id];await persist();render();});visual.append(favorite);
    const info=node('div','card-info');info.append(node('span','badge',e.family.toUpperCase()),node('h3','',e.name));
    const bottom=node('div','card-bottom');bottom.append(node('span','',demo?'Demo effect':'VEGAS catalogue'));
    const details=node('button','','Manage');details.onclick=()=>showEffect(e);bottom.append(details);info.append(bottom);card.append(visual,info);$('effects').append(card);
  });
  renderConnection();
}
function renderConnection(){
  $('connection').replaceChildren(document.createTextNode(demo?'Demo mode':connected?'VEGAS connected':effects.length?'Saved effect list':'Not connected'),node('small','',demo?'Changes are temporary':connected?'Keep the VEGAS panel open':effects.length?'Open the panel for direct apply':'Connect VEGAS to get started'));
  document.querySelector('.connection-dot').classList.toggle('connected',connected&&!demo);
  $('connect').textContent=connected?'VEGAS connected':'Connect VEGAS';
}
async function refresh() {
  const state=await window.bcc.state();
  connected=!!state.bridge?.connected;
  if (!demo) {effects=state.effects;library=state.library;render();}
  if (state.warning) toast(state.warning);
}
let refreshing=false;
window.addEventListener('focus',()=>{if(refreshing||demo)return;refreshing=true;run(refresh).finally(()=>{refreshing=false;});});
async function importCatalogue() {
  const result=await window.bcc.importCatalogue();
  if (!result) return;
  demo=false;await refresh();effects=result;render();$('connect-dialog').close();$('suggest-results').replaceChildren();$('suggest-empty').classList.remove('hidden');toast(`Imported ${effects.length} effects from VEGAS.`);
}
$('import').onclick=()=>run(importCatalogue);$('import-dialog').onclick=()=>run(importCatalogue);
$('save-bridge').onclick=()=>run(async()=>{const saved=await window.bcc.exportBridge();if(saved)toast('Script saved. Run it in VEGAS through Tools → Scripting → Run Script, and keep the panel open.');});
$('try-demo').onclick=()=>{demo=true;effects=demoEffects;library={folders:[],favorites:[]};render();toast('Exploring demo effects. Demo folders and favorites are temporary.');};
$('exit-demo').onclick=()=>run(async()=>{demo=false;await refresh();$('suggest-results').replaceChildren();$('suggest-empty').classList.remove('hidden');});
$('add-folder').onclick=()=>{editingFolder=null;$('folder-dialog-title').textContent='Create a folder';$('folder-name').value='';$('folder-dialog').showModal();$('folder-name').focus();};
$('rename-folder').onclick=()=>{const f=library.folders.find(x=>x.id===folder);if(!f)return;editingFolder=f.id;$('folder-dialog-title').textContent='Rename folder';$('folder-name').value=f.name;$('folder-dialog').showModal();$('folder-name').focus();};
$('folder-form').onsubmit=e=>{e.preventDefault();run(async()=>{
  const name=$('folder-name').value.trim();if(!name)return;
  if(!editingFolder&&library.folders.length>=100)throw new Error('The library supports up to 100 folders.');
  if(library.folders.some(f=>f.id!==editingFolder&&f.name.toLowerCase()===name.toLowerCase()))throw new Error('A folder with that name already exists.');
  if(editingFolder){const f=library.folders.find(x=>x.id===editingFolder);if(f)f.name=name;}
  else library.folders.push({id:crypto.randomUUID(),name,effects:[]});
  await persist();$('folder-dialog').close();render();setPage('search');toast(demo?'Demo folder saved temporarily.':'Folder saved. It will also appear in the connected VEGAS panel.');
});};
$('confirm-delete').onclick=()=>run(async()=>{library.folders=library.folders.filter(x=>x.id!==deletingFolder);if(folder===deletingFolder)folder=null;await persist();$('delete-dialog').close();showLibrary();toast('Folder deleted. Effects stay installed.');});
function showEffect(effect) {
  selected=effect;$('detail-family').textContent=effect.family.toUpperCase();$('detail-name').textContent=effect.name;
  $('folder-select').replaceChildren();
  library.folders.forEach(f=>{const option=node('option','',f.name);option.value=f.id;$('folder-select').append(option);});
  if(!library.folders.length)$('folder-select').append(node('option','','Create a folder in the sidebar first'));
  $('add-to-folder').disabled=!library.folders.length;
  $('save-apply').disabled=demo;
  $('read-controls').disabled=demo;
  $('apply-direct').disabled=demo;
  $('parameter-controls').replaceChildren();
  $('controls-status').textContent=demo?'Demo effects cannot be applied. Connect to your own VEGAS effect list.':'Without selected settings, the default effect will be applied.';
  $('remove-from-folder').classList.toggle('hidden',!folder);
  $('effect-dialog').showModal();
}
$('add-to-folder').onclick=()=>run(async()=>{const f=library.folders.find(x=>x.id===$('folder-select').value);if(!f||!selected)return;if(!f.effects.includes(selected.id))f.effects.push(selected.id);await persist();render();toast(`Added to ${f.name}.`);});
$('remove-from-folder').onclick=()=>run(async()=>{const f=library.folders.find(x=>x.id===folder);if(!f||!selected)return;f.effects=f.effects.filter(id=>id!==selected.id);await persist();$('effect-dialog').close();render();});
$('save-apply').onclick=()=>run(async()=>{if(!selected)return;const saved=await window.bcc.exportApply(selected.id);if(saved)toast('Script saved. Save your VEGAS project, select video events, then run the script in VEGAS.');});
$('read-controls').onclick=()=>run(async()=>{
  if(!selected||demo)return;
  const effect=selected;$('read-controls').disabled=true;$('controls-status').textContent='Reading controls from VEGAS…';
  try{
    const result=await window.bcc.inspectEffect(effect.id);
    if(selected?.id!==effect.id)return;
    const controls=result.controls.filter(p=>Number.isFinite(p.min)&&Number.isFinite(p.max)&&p.min<=p.default&&p.default<=p.max);
    const recommendations=recommendValues($('scene').value||'a subtle natural look',controls);
    $('parameter-controls').replaceChildren();
    controls.forEach((p,i)=>{
      const recommendation=recommendations.find(r=>r.name===p.name), row=node('div','parameter-row'), check=node('input'), input=node('input'), label=node('label');
      check.type='checkbox';check.id='parameter-check-'+i;check.checked=!!recommendation;check.dataset.parameter=p.name;
      label.htmlFor=check.id;label.append(document.createTextNode(p.label),node('small','',`Default ${p.default} · range ${p.min}–${p.max}${recommendation?' · suggested starting value':''}`));
      input.type='number';input.value=recommendation?recommendation.value:p.default;input.min=p.min;input.max=p.max;input.step=p.type==='integer'?'1':'any';input.setAttribute('aria-label',p.label+' value');
      input.oninput=()=>{check.checked=true;};row.append(check,label,input);$('parameter-controls').append(row);
    });
    $('controls-status').textContent=controls.length?`${controls.length} controls read from your plugin. ${recommendations.length} starting values suggested; checked values will be applied.`:'This effect did not expose usable numeric ranges. Apply its defaults and adjust the controls in VEGAS.';
  }catch(e){$('controls-status').textContent=e.message;throw e;}
  finally{$('read-controls').disabled=demo;}
});
$('apply-direct').onclick=()=>run(async()=>{
  if(!selected||demo)return;
  const values=[];
  for(const row of $('parameter-controls').children){const check=row.querySelector('input[type=checkbox]'),input=row.querySelector('input[type=number]');if(check.checked){if(!input.value.trim()||!input.checkValidity())throw new Error('Enter a value within the displayed plugin range.');values.push({name:check.dataset.parameter,value:Number(input.value)});}}
  $('apply-direct').disabled=true;
  try{const result=await window.bcc.applyEffect(selected.id,values);toast(result.message);}
  finally{$('apply-direct').disabled=demo;}
});
$('settings-button').onclick=()=>$('settings-dialog').showModal();
$('backup-library').onclick=()=>run(async()=>{if(demo)throw new Error('Exit demo mode to back up your real library.');const saved=await window.bcc.backupLibrary();if(saved)toast('Library backup saved.');});
$('restore-library').onclick=()=>run(async()=>{if(demo)throw new Error('Exit demo mode before restoring a backup.');const value=await window.bcc.restoreLibrary();if(value){library=value;folder=null;favoritesOnly=false;render();toast('Folders and favorites restored.');}});
$('generate').onclick=()=>{
  const text=$('scene').value.trim();
  if(text.length<8){toast('Describe your scene in a little more detail.');return;}
  if(!effects.length){toast('Connect VEGAS first, or explore the demo catalogue in Effect library.');return;}
  const suggestions=suggest(text,effects);$('suggest-results').replaceChildren();$('suggest-empty').classList.toggle('hidden',suggestions.length>0);
  if(!suggestions.length){$('suggest-empty').replaceChildren(node('span','','✧'),node('h2','','No matching effects in this catalogue.'),node('p','','Try describing the mood, lighting, motion, or style. The suggestion rules currently cover glow, texture, motion, light, distortion, and tonal looks.'));return;}
  suggestions.forEach(e=>{const card=node('article','suggest-card');card.append(node('span','badge',`${demo?'DEMO · ':''}${e.family.toUpperCase()} · ${e.title.toUpperCase()}`),node('h3','',e.name),node('p','',e.reason));const ol=node('ol');e.values.forEach(v=>ol.append(node('li','',v)));card.append(ol);const b=node('button','button secondary','Settings & apply');b.onclick=()=>showEffect(e);card.append(b);$('suggest-results').append(card);});
};
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{$('scene').value=b.dataset.scene;$('generate').click();});
run(refresh);
let polling=false;
setInterval(async()=>{
  if(polling||demo||!window.bcc.bridgeStatus)return;polling=true;
  try{const state=await window.bcc.bridgeStatus();connected=state.connected;renderConnection();if(state.catalogueChanged)await refresh();}
  catch{connected=false;renderConnection();}
  finally{polling=false;}
},2000);
