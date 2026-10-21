from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
from threading import Thread
server=ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1]/"src")))
Thread(target=server.serve_forever,daemon=True).start()
from playwright.sync_api import sync_playwright,expect
import json
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1240,'height':820});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''
 let lib={folders:[],favorites:[]};
 const fx=[{id:'ofx:glow',name:'BCC+ Glow',family:'BCC+'},{id:'ofx:shake',name:'S_Shake',family:'Sapphire'},{id:'ofx:grain',name:'BCC Film Grain',family:'BCC'}];
 window.bcc={state:async()=>({effects:fx,library:structuredClone(lib),bridge:{connected:true}}),saveLibrary:async v=>{lib=structuredClone(v);return v;},bridgeStatus:async()=>({connected:true}),exportBridge:async()=>null,importCatalogue:async()=>null,exportApply:async()=>null,backupLibrary:async()=>null,restoreLibrary:async()=>null,inspectEffect:async()=>({controls:[{name:'realMix',label:'Mix',type:'double',default:1,min:0,max:1},{name:'realIntensity',label:'Intensity',type:'double',default:1,min:0,max:10}]}),applyEffect:async(id,values)=>{window.lastApply={id,values};return {message:'Applied to 1 selected video event(s).'};}};
 ''')
 page.goto(f'http://127.0.0.1:{server.server_port}');expect(page.locator('.effect-card')).to_have_count(3)
 assert page.locator('body').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(246, 246, 246)'
 page.locator('#search').fill('shake');expect(page.locator('.effect-card')).to_have_count(1)
 page.get_by_role('button',name='Toggle favorite S_Shake').click();expect(page.locator('#favorite-count')).to_have_text('1')
 page.locator('#search').fill('');page.locator('#add-folder').click();page.locator('#folder-name').fill('Night edits');page.locator('#folder-form button[type=submit]').click()
 page.locator('.effect-card').filter(has_text='BCC+ Glow').get_by_role('button',name='Manage',exact=True).click()
 page.locator('#add-to-folder').click();page.locator('#read-controls').click();expect(page.locator('.parameter-row')).to_have_count(2)
 expect(page.get_by_role('spinbutton',name='Mix value',exact=True)).to_have_value('0.2')
 page.locator('#apply-direct').click();expect(page.locator('#toast')).to_contain_text('Applied to 1')
 sent=page.evaluate('window.lastApply');assert sent=={'id':'ofx:glow','values':[{'name':'realMix','value':0.2},{'name':'realIntensity','value':0.5}]},sent
 page.locator('#effect-dialog .close-dialog').click();page.locator('#folder-list .nav').click();expect(page.locator('.effect-card')).to_have_count(1)
 page.locator('#rename-folder').click();page.locator('#folder-name').fill('Night scenes');page.locator('#folder-form button[type=submit]').click();expect(page.locator('#library-title')).to_have_text('Night scenes')
 page.locator('#nav-search').click();page.screenshot(path='/tmp/bcc-white-grey-search.png',full_page=True)
 page.locator('#nav-suggest').click();page.get_by_role('button',name='Action edit',exact=True).click();expect(page.locator('.suggest-card')).to_have_count(1)
 page.get_by_role('button',name='Settings & apply',exact=True).click();page.locator('#read-controls').click();expect(page.get_by_role('spinbutton',name='Mix value',exact=True)).to_have_value('0.65')
 page.locator('#effect-dialog .close-dialog').click();page.screenshot(path='/tmp/bcc-white-grey-suggest.png',full_page=True)
 page.locator('#folder-list .folder-delete').click();expect(page.locator('#delete-dialog')).to_be_visible();page.locator('#confirm-delete').click();expect(page.locator('#folder-list .nav')).to_have_count(0)
 page.locator('#settings-button').click();expect(page.locator('#settings-dialog')).to_be_visible();page.locator('#settings-dialog .close-dialog').click()
 assert not errors,errors
 print(json.dumps({'white_grey_theme':'passed','search':'passed','favorites':'passed','folder_create_rename_delete':'passed','scene_suggestions':'passed','numeric_values_from_live_metadata_fixture':'passed','direct_apply_payload':'passed','page_errors':errors}))
 b.close()

server.shutdown()
