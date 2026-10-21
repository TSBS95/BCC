(function () {
'use strict';

const families = ['All effects', 'BCC+', 'BCC', 'Sapphire', 'Other'];
function familyOf(name) {
  if (/^BCC\s*\+/i.test(name)) return 'BCC+';
  if (/^BCC\b/i.test(name)) return 'BCC';
  if (/^S_|sapphire/i.test(name)) return 'Sapphire';
  return 'Other';
}
function normalizeEffects(effects) {
  if (!Array.isArray(effects) || effects.length > 20000) throw new Error('Invalid effect list.');
  const seen = new Set();
  return effects.map(e => {
    if (!e || typeof e.id !== 'string' || typeof e.name !== 'string' || !e.id.trim() || !e.name.trim() || e.id.length > 2048 || e.name.length > 512) throw new Error('Each effect needs a valid ID and name.');
    return {id:e.id, name:e.name, family:familyOf(e.name)};
  }).filter(e => !seen.has(e.id) && seen.add(e.id)).sort((a,b) => a.name.localeCompare(b.name));
}
function decodeXml(text) {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[e]);
}
function parseCatalogue(xml) {
  if (typeof xml !== 'string' || xml.length > 8 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid catalogue.');
  if (!/<bcc-fx-catalogue\b[^>]*version="1"[^>]*>/.test(xml) || !/<\/bcc-fx-catalogue>\s*$/.test(xml)) throw new Error('Choose installed-effects.xml exported by the VEGAS bridge.');
  const effects = [];
  for (const match of xml.matchAll(/<effect\s+id="([^"]*)"\s+name="([^"]*)"\s*\/>/g)) effects.push({id:decodeXml(match[1]),name:decodeXml(match[2])});
  if (!effects.length) throw new Error('The catalogue contains no video effects. Run the export script in VEGAS first.');
  return normalizeEffects(effects);
}
function searchEffects(effects, query = '', family = 'All effects', ids = null) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return effects.filter(e => (family === 'All effects' || e.family === family) && (!ids || ids.includes(e.id)) && words.every(w => `${e.name} ${e.family}`.toLowerCase().includes(w)));
}
const looks = [
  {title:'Soft bloom', scene:/night|neon|light|dream|romantic|wedding|glow|city/i, effect:/glow|bloom/i, reason:'Give bright highlights a soft halo while keeping faces readable.', values:['Start with the default preset.', 'Keep the glow subtle; raise the highlight threshold until shadows stay clean.', 'Compare at full preview resolution and reduce the mix if skin loses detail.']},
  {title:'Kinetic impact', scene:/action|sport|beat|music|fast|fight|dance|impact|shake/i, effect:/shake|jitter/i, reason:'Add a brief burst of motion on a beat or an impact.', values:['Use a short burst, around 4–8 frames.', 'Begin with low amplitude and decay back to zero.', 'Check frame edges; crop or use the effect’s edge handling if needed.']},
  {title:'Filmic texture', scene:/film|vintage|retro|memory|warm|old|nostalg/i, effect:/grain|film|damage/i, reason:'A little texture can support a nostalgic or film-inspired scene.', values:['Start at a low strength so the texture is barely visible.', 'Check grain at 100% scale.', 'Reduce the effect if the source is already noisy.']},
  {title:'Directional energy', scene:/speed|car|race|action|sport|motion|fast|transition/i, effect:/blur|streak/i, reason:'Directional blur can emphasize movement or a short transition.', values:['Apply over roughly 4–10 frames for an accent.', 'Align the direction with movement in the shot.', 'Keep the subject readable and return to zero after the accent.']},
  {title:'Atmospheric light', scene:/sun|outdoor|sunset|warm|summer|backlit|flare/i, effect:/flare|light leak|rays/i, reason:'A restrained light accent can reinforce an existing light source.', values:['Place the light source where the scene’s light actually comes from.', 'Start with a low mix and avoid covering faces.', 'Animate gently if the camera moves.']},
  {title:'Digital tension', scene:/glitch|tech|cyber|horror|digital|error|scary/i, effect:/glitch|digital|scan|distort/i, reason:'A short distortion accent can support a digital or unsettling moment.', values:['Try a 2–6 frame accent rather than covering the entire shot.', 'Start with the default preset at a low mix.', 'Keep dialogue and important visual information clear.']},
  {title:'Guide attention', scene:/portrait|face|person|interview|product|focus|cinematic/i, effect:/vignette|color|colour|contrast/i, reason:'A gentle tonal adjustment can guide attention toward the subject.', values:['Begin with a subtle adjustment and protect skin tones.', 'Compare with the untreated shot.', 'Check scopes for clipped highlights or crushed shadows.']}
];
function suggest(scene, effects) {
  if (typeof scene !== 'string' || scene.trim().length < 8) return [];
  return looks.filter(l => l.scene.test(scene)).flatMap(l => effects.filter(e => l.effect.test(e.name)).slice(0,2).map(e => ({...e, title:l.title, reason:l.reason, values:l.values}))).filter((e,i,a) => a.findIndex(x => x.id === e.id) === i).slice(0,6);
}
function validateLibrary(value) {
  if (!value || !Array.isArray(value.folders) || value.folders.length > 100 || !Array.isArray(value.favorites) || value.favorites.length > 20000) throw new Error('Invalid library.');
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 2048 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(id);
  const seen = new Set(), names=new Set();
  const folders = value.folders.map(f => {
    if (!f || !validId(f.id) || seen.has(f.id) || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 60 || !validId(f.name) || names.has(f.name.trim().toLowerCase()) || !Array.isArray(f.effects) || f.effects.length > 20000 || !f.effects.every(validId)) throw new Error('Invalid folder.');
    seen.add(f.id);
    names.add(f.name.trim().toLowerCase());
    return {id:f.id,name:f.name.trim(),effects:[...new Set(f.effects)]};
  });
  if (!value.favorites.every(validId)) throw new Error('Invalid favorites.');
  return {folders,favorites:[...new Set(value.favorites)]};
}
function recommendValues(scene, controls) {
  const strength=/subtle|soft|gentle|natural|interview|wedding/i.test(scene)?0.2:/strong|intense|heavy|aggressive|impact/i.test(scene)?0.65:0.35;
  return controls.filter(p=>Number.isFinite(p.min)&&Number.isFinite(p.max)&&Number.isFinite(p.default)&&p.min<=p.max).flatMap(p=>{
    const label=p.label+' '+p.name;
    let value,reason;
    if(/mix|blend|opacity/i.test(label)&&p.min===0&&(p.max===1||p.max===100)){
      value=p.max*strength;reason='Blend strength based on the mood you described.';
    }else if(/intensity|brightness|amplitude|amount/i.test(label)&&p.min>=0&&p.max<=100&&p.default>0){
      value=p.default*(strength<0.3?0.5:strength>0.5?1.2:0.75);reason='A restrained adjustment from this effect’s own default.';
    }else return [];
    value=Math.max(p.min,Math.min(p.max,value));value=p.type==='integer'?Math.round(value):Number(value.toFixed(4));
    return [{...p,value,reason}];
  }).slice(0,5);
}
function csharpString(s) { return '"' + s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/[\u0000-\u001f]/g,c => '\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')) + '"'; }
function applyScript(effect) {
  return `// Generated by BCC FX Manager. Adds one default effect to selected video events.\n// Save your VEGAS project first. Run through Tools > Scripting > Run Script.\nusing System;\nusing System.Windows.Forms;\nusing ScriptPortal.Vegas;\npublic class EntryPoint {\n  public void FromVegas(Vegas vegas) {\n    PlugInNode plugin = vegas.VideoFX.GetChildByUniqueID(${csharpString(effect.id)});\n    if (plugin == null) { MessageBox.Show("This effect is not available in this VEGAS session."); return; }\n    int count = 0;\n    foreach (Track track in vegas.Project.Tracks) {\n      if (!track.IsVideo()) continue;\n      foreach (TrackEvent ev in track.Events) {\n        if (!ev.Selected) continue;\n        VideoEvent video = ev as VideoEvent;\n        if (video == null) continue;\n        video.Effects.Add(new Effect(plugin));\n        count++;\n      }\n    }\n    MessageBox.Show("Added the default effect to " + count + " selected video event(s). Adjust its controls in VEGAS.");\n  }\n}\n`;
}
const api = {families,familyOf,normalizeEffects,parseCatalogue,searchEffects,suggest,validateLibrary,applyScript,recommendValues};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.BCCCore = api;
})();
