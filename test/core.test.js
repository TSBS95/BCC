const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseCatalogue,normalizeEffects,searchEffects,suggest,validateLibrary,applyScript} = require('../src/core');
const xml = '<?xml version="1.0"?><bcc-fx-catalogue version="1"><effect id="ofx:glow" name="BCC+ Glow" /><effect id="ofx:shake" name="S_Shake" /><effect id="other" name="A &amp; B" /></bcc-fx-catalogue>';
test('imports the exact VEGAS IDs, XML escapes, and product families',()=>{
  const effects=parseCatalogue(xml);assert.equal(effects.length,3);
  assert.deepEqual(effects.find(e=>e.id==='ofx:glow'),{id:'ofx:glow',name:'BCC+ Glow',family:'BCC+'});
  assert.equal(effects.find(e=>e.id==='other').name,'A & B');assert.equal(effects.find(e=>e.id==='ofx:shake').family,'Sapphire');
});
test('rejects unrelated, empty, oversized, and entity-bearing imports',()=>{
  for(const bad of ['<html/>','<bcc-fx-catalogue version="1"></bcc-fx-catalogue>','<!DOCTYPE a><bcc-fx-catalogue version="1"></bcc-fx-catalogue>','x'.repeat(8*1024*1024+1)])assert.throws(()=>parseCatalogue(bad));
});
test('search intersects every term, family, and folder membership',()=>{
  const effects=parseCatalogue(xml);
  assert.equal(searchEffects(effects,'glow bcc','BCC+',['ofx:glow']).length,1);
  assert.equal(searchEffects(effects,'glow','Sapphire').length,0);
  assert.equal(searchEffects(effects,'','All effects',[]).length,0);
  assert.equal(searchEffects(effects,'SHAKE')[0].id,'ofx:shake');
});
test('suggests only catalogue effects and handles unmatched descriptions',()=>{
  const effects=parseCatalogue(xml), results=suggest('Night neon car scene with impacts on the beat',effects);
  assert.equal(results.length,2);assert(results.every(e=>effects.some(x=>x.id===e.id)));
  assert.deepEqual(suggest('An ordinary empty room',effects),[]);
  assert.deepEqual(suggest('night',effects),[]);
  assert.deepEqual(suggest('A bright night scene',[]),[]);
});
test('deduplicates stable plugin IDs without merging distinct IDs',()=>{
  assert.equal(normalizeEffects([{id:'a',name:'BCC X'},{id:'a',name:'BCC X'},{id:'b',name:'BCC X'}]).length,2);
});
test('library validation preserves folder membership and rejects malformed or duplicate folders',()=>{
  const clean=validateLibrary({folders:[{id:'one',name:' Night ',effects:['a','a']}],favorites:['b','b']});
  assert.deepEqual(clean,{folders:[{id:'one',name:'Night',effects:['a']}],favorites:['b']});
  assert.throws(()=>validateLibrary({folders:[{id:'x',name:'X',effects:[null]}],favorites:[]}));
  assert.throws(()=>validateLibrary({folders:[{id:'x',name:'X',effects:[]},{id:'x',name:'Y',effects:[]}],favorites:[]}));
});
test('apply script uses real IDs, escapes C# strings, and targets selected video events only',()=>{
  const script=applyScript({id:'OFX:"test"\\plugin\n',name:'Example'});
  assert(script.includes('GetChildByUniqueID("OFX:\\"test\\"\\\\plugin\\n")'));
  assert(script.includes('if (!ev.Selected) continue;'));
  assert(script.includes('if (!track.IsVideo()) continue;'));
  assert(!script.includes('OFX:"test"\\plugin\n'));
});
