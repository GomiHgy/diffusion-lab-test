"""Browser checks for whole-tape tools, physical 3D preview and moving RGB scenes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from support import LocalSite
import os,json,base64
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'tests'/'artifacts';ART.mkdir(exist_ok=True)
checks=[]
def check(label,value):
    assert value,label
    checks.append(label);print('PASS',len(checks),label,flush=True)
def wait(page):
    page.wait_for_function('window.DiffusionLab && DiffusionLab.getResult() && !DiffusionLab.isBusy()',timeout=30000)
def set_state(page,values):
    page.evaluate('(s)=>DiffusionLab.setState(s)',values);wait(page)
def get(page):return page.evaluate('DiffusionLab.getState()')
def result(page):return page.evaluate('({phase:DiffusionLab.getResult().state.gamingPhase,quality:DiffusionLab.getResult().nx,mean:DiffusionLab.getResult().stats.mean})')
def click_wait(page,selector):page.locator(selector).click();wait(page)
options={'headless':True}
if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
with LocalSite(ROOT/'dist').start() as site,sync_playwright() as p:
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1536,'height':1100},accept_downloads=True)
    errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    page.goto(site.url+'diffusion-lab/');wait(page)
    check('Legacy defaults retain three automatic tapes',page.locator('#tapeCount').input_value()=='3')
    page.locator('#tapeCount').fill('5');click_wait(page,'#applyTapeCount')
    check('Explicit tape count produces five connected rows',page.evaluate('DiffusionLab.getResult().tapeLengths.length===5 && DiffusionLab.getState().tapeCount===5'))
    page.reload();wait(page)
    check('Explicit tape count survives reload',page.locator('#tapeCount').input_value()=='5')
    page.locator('#tapeCount').fill('2');click_wait(page,'#applyTapeCount')
    check('Reducing automatic count removes complete rows',page.evaluate('DiffusionLab.getResult().tapeLengths.length===2'))
    set_state(page,{'shape':'rect','width':200,'height':160,'layout':'manual','manual':[[-25,-20,0],[0,-20,0],[25,-20,0],[-25,25,0],[0,25,0],[25,25,0]],'tapeLengths':[3,3],'view':'layout','pattern':'solid','quality':160,'inset':8})
    page.locator('#tapeSelect').select_option('0');before=get(page)
    page.locator('#tapeAngle').fill('90');click_wait(page,'#applyTapeAngle');after=get(page)
    check('Angle editor rotates the entire tape around its centroid',all(abs(a[0])<1e-9 for a in after['manual'][:3]) and [round(a[1]) for a in after['manual'][:3]]==[-45,-20,5])
    check('Rotation preserves wiring and leaves the second tape untouched',after['tapeLengths']==[3,3] and after['manual'][3:]==before['manual'][3:])
    original=after
    for mode,axis,expected in [('left',0,-92),('centerX',0,0),('right',0,92),('top',1,-72),('centerY',1,0),('bottom',1,72)]:
        click_wait(page,'[data-align="'+mode+'"]')
        bounds=page.evaluate('TapeTools.bounds(Optics,DiffusionLab.getState(),Optics.tapeLayout(DiffusionLab.getState()),[0])')
        actual=(bounds['x0'] if mode=='left' else bounds['x1'] if mode=='right' else (bounds['x0']+bounds['x1'])/2) if axis==0 else (bounds['y0'] if mode=='top' else bounds['y1'] if mode=='bottom' else (bounds['y0']+bounds['y1'])/2)
        check('Alignment '+mode+' uses package bounds and board margin',abs(actual-expected)<1e-8)
    click_wait(page,'[data-align="centerY"]')
    page.locator('#alignScope').select_option('all');all_before=get(page)
    click_wait(page,'[data-align="centerX"]');all_after=get(page)
    delta=[all_after['manual'][0][j]-all_before['manual'][0][j] for j in [0,1]]
    check('Aligning the complete layout preserves spacing between tapes',all(abs(b[j]-a[j]-delta[j])<1e-9 for a,b in zip(all_before['manual'],all_after['manual']) for j in [0,1]))
    page.locator('#tapeCount').fill('3');click_wait(page,'#applyTapeCount');expanded=get(page)
    check('Increasing manual count clones a whole tape without moving existing tapes',expanded['tapeLengths']==[3,3,3] and expanded['manual'][:6]==all_after['manual'])
    page.locator('#tapeCount').fill('100');page.locator('#applyTapeCount').click()
    check('Unavailable count fails atomically with an actionable message',get(page)==expanded and page.locator('#tapeCount').get_attribute('aria-invalid')=='true' and '配置できません' in page.locator('#tapeCountStatus').inner_text())
    page.locator('#tapeCount').fill('1');click_wait(page,'#applyTapeCount')
    check('Reducing manual count retains complete first tape',get(page)['tapeLengths']==[3] and get(page)['manual']==expanded['manual'][:3])
    set_state(page,{'view':'appearance','renderMode':'3d','showLED':True,'gap':18,'thickness':6})
    check('3D mode exposes camera controls and physical plate dimensions',page.locator('#cameraControls').is_visible() and '厚さ 6.0 mm' in page.locator('#dimensionLabel').inner_text())
    cv=page.locator('#mainCanvas');cv.scroll_into_view_if_needed();box=cv.bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2
    camera=get(page);leds=camera['manual']
    page.mouse.move(cx,cy);page.mouse.down();page.mouse.move(cx+60,cy+30,steps=10);page.mouse.up()
    check('3D orbit changes camera while preserving tape coordinates',get(page)['cameraYaw']!=camera['cameraYaw'] and get(page)['cameraPitch']!=camera['cameraPitch'] and get(page)['manual']==leds)
    zoom=get(page)['cameraZoom'];page.mouse.wheel(0,-200)
    page.wait_for_function('(z)=>DiffusionLab.getState().cameraZoom>z',arg=zoom)
    check('3D wheel zoom updates the camera',get(page)['cameraZoom']>zoom)
    page.locator('#resetCamera').click()
    check('Camera reset restores the documented viewpoint',get(page)['cameraYaw']==-25 and get(page)['cameraPitch']==55 and get(page)['cameraZoom']==1)
    page.screenshot(path=str(ART/'features-3d.png'),full_page=True)
    with page.expect_download() as dl:page.locator('#pngBtn').click()
    dl.value.save_as(str(ART/'features-3d-export.png'))
    check('3D appearance exports a nonempty PNG', (ART/'features-3d-export.png').stat().st_size>10000)
    encoded=base64.b64encode((ART/'features-3d-export.png').read_bytes()).decode()
    alpha=page.evaluate('''async b=>{const img=new Image();img.src='data:image/png;base64,'+b;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(100,200,1,1).data[3];}''',encoded)
    check('3D PNG preserves its opaque background',alpha==255)
    check('3D SVG front keeps its hole open',page.evaluate('''()=>{const s=Optics.normalize({shape:'svg',width:100,height:100,svgShapes:[{fillRule:'evenodd',contours:[[[0,0],[100,0],[100,100],[0,100]],[[30,30],[70,30],[70,70],[30,70]]]}]}),c=document.createElement('canvas');c.width=500;c.height=355;const t=document.createElement('canvas');t.width=100;t.height=100;t.getContext('2d').fillStyle='#ff0000';t.getContext('2d').fillRect(0,0,100,100);const r=DiffusionView3D.render(c.getContext('2d'),{state:s,leds:[]},{width:500,height:355,texture:t,optics:Optics,showGrid:false});const p=r.project(0,0,s.gap+s.thickness);const rgb=c.getContext('2d').getImageData(Math.round(p.x),Math.round(p.y),1,1).data;return rgb[0]<100;}'''))
    set_state(page,{'layout':'rows','width':160,'height':72,'rowSpacing':24,'tapeCount':0,'quality':288,'pattern':'gaming','gamingScene':'rainbowWave','gamingPhase':.15,'gamingPlaying':True})
    check('Animation prepares 24 optical keyframes',page.evaluate('DiffusionLab.getGaming().frames===24 && !DiffusionLab.getGaming().preparing'))
    optical=page.evaluate('Array.from(DiffusionLab.getResult().fields[0]).reduce((a,b)=>a+b,0)')
    phase=get(page)['gamingPhase'];page.wait_for_function('(p)=>Math.abs(DiffusionLab.getState().gamingPhase-p)>.025',arg=phase)
    check('Playing RGB actually changes LED phase and optical output',page.evaluate('DiffusionLab.getResult().nx===160 && DiffusionLab.getResult().state.gamingPhase!==.15'))
    page.wait_for_function('(v)=>Math.abs(Array.from(DiffusionLab.getResult().fields[0]).reduce((a,b)=>a+b,0)-v)>1',arg=optical)
    check('Animation updates physical linear fields rather than only display color',True)
    check('Live exports require a stopped optical snapshot',page.locator('#pngBtn').is_disabled() and page.locator('#csvBtn').is_disabled() and page.locator('#pinBtn').is_disabled())
    for scene in ['chase','breathe','cyberPulse']:
        page.locator('[data-key="gamingScene"]').select_option(scene);wait(page)
        page.wait_for_function('DiffusionLab.getResult().state.gamingScene===DiffusionLab.getState().gamingScene && DiffusionLab.getResult().state.gamingPhase>0')
        check('Moving RGB scene '+scene+' produces finite positive light',page.evaluate('Number.isFinite(DiffusionLab.getResult().stats.mean) && DiffusionLab.getResult().stats.mean>0'))
    page.locator('[data-key="gamingSpeed"]').fill('2');page.locator('[data-key="gamingSpeed"]').blur()
    check('Playback speed changes without recomputing keyframes',get(page)['gamingSpeed']==2 and page.evaluate('DiffusionLab.getGaming().frames===24 && !DiffusionLab.getGaming().preparing'))
    click_wait(page,'#gamingPlayBtn');paused=get(page)['gamingPhase'];snapshot=result(page)
    page.wait_for_timeout(180)
    check('Stopping freezes phase and recomputes at selected precision',get(page)['gamingPhase']==paused and snapshot['quality']==288 and snapshot['phase']==paused and result(page)==snapshot and page.locator('#pngBtn').is_enabled())
    page.locator('#gamingPhase').fill('62');wait(page)
    check('Phase scrub computes a reproducible paused snapshot',get(page)['gamingPhase']==.62 and result(page)['phase']==.62 and not get(page)['gamingPlaying'])
    with page.expect_download() as dl:page.locator('#saveBtn').click()
    dl.value.save_as(str(ART/'features-settings.json'));saved=json.loads((ART/'features-settings.json').read_text(encoding='utf-8'))['state']
    check('Settings save scene, phase, speed, camera and tape groups',saved['gamingScene']=='cyberPulse' and saved['gamingPhase']==.62 and saved['gamingSpeed']==2 and not saved['gamingPlaying'] and saved['renderMode']=='3d')
    click_wait(page,'#gamingPlayBtn');wait(page)
    with page.expect_download() as dl:page.locator('#saveBtn').click()
    dl.value.save_as(str(ART/'features-playing-settings.json'));saved=json.loads((ART/'features-playing-settings.json').read_text(encoding='utf-8'))['state']
    check('Saving during playback restores a paused frame',not saved['gamingPlaying'] and saved['gamingPhase']>=0)
    click_wait(page,'#sweepBtn')
    page.wait_for_function('DiffusionLab.getSweep().length===6 && document.getElementById("cancelSweep").hidden',timeout=30000)
    check('Distance comparison freezes the same phase for every distance',not get(page)['gamingPlaying'] and page.evaluate('DiffusionLab.getSweep().every(r=>r.state.gamingPhase===DiffusionLab.getState().gamingPhase)'))
    page.locator('[data-key="pattern"]').select_option('gradient');wait(page)
    click_wait(page,'#sweepBtn');page.wait_for_function('DiffusionLab.getSweep().length===6 && document.getElementById("cancelSweep").hidden',timeout=30000)
    page.locator('[data-key="pattern"]').select_option('gaming');wait(page)
    check('An existing distance comparison cannot prevent gaming playback',get(page)['gamingPlaying'] and page.evaluate('DiffusionLab.getGaming().frames===24'))
    page.locator('#fileInput').set_input_files(str(ART/'features-settings.json'));wait(page)
    check('JSON import restores paused scene and 3D camera',get(page)['gamingPhase']==.62 and not get(page)['gamingPlaying'] and get(page)['renderMode']=='3d')
    set_state(page,{'shape':'rect','width':100,'height':60,'layout':'manual','manual':[[-25,12,0],[0,12,0],[25,12,0]],'tapeLengths':[3],'view':'layout','pattern':'solid','gap':25,'quality':160,'showLED':False})
    body_widths=[]
    for model in ['WS2812B','WS2812B-MINI','WS2812C-2020']:
        page.locator('[data-key="ledModel"]').select_option(model);wait(page)
        painted=page.evaluate("""()=>{const c=document.getElementById('mainCanvas'),rect=c.getBoundingClientRect(),s=DiffusionLab.getState(),scale=Math.min((rect.width-120)/s.width,(rect.height-108)/s.height),dpr=c.width/rect.width,x=rect.width/2,y=rect.height/2+3+12*scale,ctx=c.getContext('2d'),data=ctx.getImageData(Math.round((x-20)*dpr),Math.round(y*dpr),40*dpr,1).data,positions=[];for(let i=0;i<data.length;i+=4)if(data[i]===201&&data[i+1]===198&&data[i+2]===180)positions.push(i/4);return positions.length?Math.max(...positions)-Math.min(...positions)+1:0;}""")
        body_widths.append(painted)
        check('LED model '+model+' enables dimensions and reaches both geometry and optics',get(page)['showLED'] and page.locator('[data-key="showLED"]').is_checked() and page.evaluate('DiffusionLab.getResult().state.packageSize===Optics.ledProfiles[DiffusionLab.getState().ledModel].packageSize'))
    check('5050, 3535 and 2020 footprints visibly differ in the layout canvas',body_widths[0]>body_widths[1]>body_widths[2]>0)
    set_state(page,{'view':'appearance','renderMode':'3d','cameraPitch':78,'showLED':False})
    images=[]
    for model in ['WS2812B','WS2812B-MINI','WS2812C-2020']:
        page.locator('[data-key="ledModel"]').select_option(model);wait(page)
        images.append(page.locator('#mainCanvas').evaluate('(c)=>c.toDataURL()'))
        check('3D model '+model+' uses its own mounted package footprint',page.evaluate("""()=>{const r=DiffusionLab.getResult(),g=DiffusionView3D.mountedTapeGeometry(r),p=g.packages[0];return Math.abs(p.polygon[1][0]-p.polygon[0][0]-r.state.packageSize)<1e-9 && g.layers.tapeBottom===g.layers.baseTop && g.layers.packageBottom===g.layers.tapeTop && DiffusionLab.getState().showLED;}"""))
    check('3D canvas refreshes across all three LED package sizes',len(set(images))==3)
    page.screenshot(path=str(ART/'features-mounted-tapes.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150)
    check('3D camera toolbar fits a mobile viewport',page.evaluate('document.documentElement.scrollWidth<=390') and page.locator('#cameraControls').is_visible())
    page.screenshot(path=str(ART/'features-mobile.png'),full_page=True)
    page.locator('#mobileToggle').click()
    page.locator('[data-view="layout"]').click()
    page.locator('#tapeSelect').select_option('0')
    check('Mobile tape angle and six alignment controls stay accessible',page.locator('#tapeAngle').is_enabled() and page.locator('[data-align="centerY"]').is_enabled() and page.evaluate('document.documentElement.scrollWidth<=390'))
    page.screenshot(path=str(ART/'features-mobile-editor.png'),full_page=True)
    check('New feature operations produce no browser exceptions',not errors)
    check('All new features work without external runtime requests',all(r.startswith(site.url) or r.startswith('blob:') or r.startswith('data:') for r in requests))
    browser.close()
(ART/'features-report.json').write_text(json.dumps({'count':len(checks),'tests':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print('TOTAL',len(checks),'PASS')
