"""Chromium regression tests. Default: actual local HTTP at /diffusion-lab/.
Use --embedded only when browser navigation is forbidden by environment policy.
The embedded mode does NOT claim to test HTTP navigation or GitHub Pages.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse, atexit, json, os
from support import LocalSite
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--embedded', action='store_true')
args = parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
if not (ROOT / 'dist' / 'index.html').is_file():
    raise SystemExit('Run python build.py before browser tests.')
server = None if args.embedded else LocalSite(ROOT / 'dist').start()
if server:
    atexit.register(server.close)
site_url = server.url + 'diffusion-lab/' if server else None
reports=[]
def load(page, *, root_path=False):
    if args.embedded:
        page.set_content((ROOT / 'dist' / 'index.html').read_text(encoding='utf-8'), wait_until='load')
    else:
        response = page.goto(server.url if root_path else site_url, wait_until='load')
        assert response and response.status == 200, 'HTTP navigation must return 200'
    wait(page)
def launch_options():
    options = {'headless': True, 'args': ['--disable-dev-shm-usage']}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    return options
def check(label, condition):
    assert condition, label
    reports.append({'test':label,'passed':True});print('PASS',len(reports),label,flush=True)
def wait(page):
    page.wait_for_function('window.DiffusionLab && DiffusionLab.getResult() && !DiffusionLab.isBusy()', timeout=20000)
def set_state(page, data):
    page.evaluate('(s)=>DiffusionLab.setState(s)',data);wait(page)
with sync_playwright() as p:
    browser=p.chromium.launch(**launch_options())
    page=browser.new_page(viewport={'width':1536,'height':1100},device_scale_factor=1,accept_downloads=True)
    errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    load(page)
    check('Initial scene produces a positive result',page.evaluate('DiffusionLab.getResult().stats.mean>0'))
    # Numeric input must not be rewritten/clamped while the user is typing.
    width=page.locator('[data-key="width"]');width.fill('');width.press_sequentially('255',delay=25);width.blur();wait(page)
    check('Numeric typing preserves all digits',page.evaluate('DiffusionLab.getState().width===255 && DiffusionLab.getResult().state.width===255'))
    set_state(page,{'width':160,'quality':160})
    for model in ['WS2812B','WS2812B-MINI','WS2812C-2020','SK6812','SK6812-MINI']:
        page.locator('[data-key="ledModel"]').select_option(model);wait(page)
        check('LED model selection reaches the calculation: '+model,page.evaluate('''(id)=>{
            const s=DiffusionLab.getState(),r=DiffusionLab.getResult().state,p=Optics.ledProfiles[id];
            return s.ledModel===id && r.ledModel===id && s.packageSize===p.packageSize &&
                r.aperture===Optics.profileAperture(p) && s.mcdR===213 &&
                document.querySelector('[data-key="packageSize"]').readOnly &&
                !document.querySelector('[data-key="aperture"]').disabled &&
                !document.querySelector('[data-key="angle"]').disabled &&
                document.getElementById('ledSpecDetails').textContent.includes(p.revision);
        }''',model))
    page.locator('[data-key="aperture"]').fill('1.25');page.locator('[data-key="aperture"]').blur();wait(page)
    check('Manual emitter width keeps model identity and reports an override',page.evaluate('DiffusionLab.getState().ledModel==="SK6812-MINI" && DiffusionLab.getResult().state.aperture===1.25') and '幅：手動上書き' in page.locator('#ledValueSummary').inner_text())
    page.locator('details').filter(has=page.locator('[data-key="angle"]')).locator('summary').click()
    page.locator('[data-key="angle"]').fill('110');page.locator('[data-key="angle"]').blur();wait(page)
    spec_summary=page.locator('details').filter(has=page.locator('#ledSpecDetails')).locator('summary')
    spec_summary.click()
    check('Manual viewing angle and emitter width are reflected in source details','角度：手動上書き' in page.locator('#ledValueSummary').inner_text() and '現在の計算角度：全幅 110°（手動上書き）' in page.locator('#ledSpecDetails').inner_text() and '現在の計算幅：1.250 mm（手動上書き）' in page.locator('#ledSpecDetails').inner_text())
    spec_summary.click()
    page.locator('#ledPresetBtn').click();wait(page)
    check('Restore model values clears both manual overrides',page.evaluate('DiffusionLab.getResult().state.aperture===1.9 && DiffusionLab.getResult().state.angle===120') and '角度：資料の半値角' in page.locator('#ledValueSummary').inner_text())
    page.locator('[data-key="ledModel"]').select_option('custom');wait(page)
    check('Custom model allows editing the outer dimensions',not page.locator('[data-key="packageSize"]').evaluate('(el)=>el.readOnly') and page.locator('#ledPresetBtn').is_hidden())
    page.locator('[data-key="transmission"]').fill('0');wait(page)
    check('Transmission slider/number reaches zero output',page.evaluate('DiffusionLab.getResult().stats.mean===0'))
    page.locator('[data-key="transmission"]').fill('45');wait(page)
    page.locator('[data-key="argb"]').fill('#FFFF0000');wait(page)
    check('ARGB UI applies channel filtering',page.evaluate('DiffusionLab.getResult().fields[1].every(x=>x===0) && DiffusionLab.getResult().fields[2].every(x=>x===0)'))
    page.locator('[data-key="argb"]').fill('#FFFFFFFF');page.locator('[data-key="argb"]').blur();wait(page)
    for shape in ['rect','rounded','ellipse','ring','polygon']:
        set_state(page,{'shape':shape,'layout':'rows'})
        check('Shape: '+shape,page.evaluate('Number.isFinite(DiffusionLab.getResult().stats.mean) && document.getElementById("errorBanner").hidden'))
    set_state(page,{'shape':'rounded','width':160,'height':72})
    for layout in ['rows','grid','perimeter','ring','path']:
        set_state(page,{'layout':layout})
        check('LED layout: '+layout,page.evaluate('DiffusionLab.getResult().leds.length>0 && document.getElementById("errorBanner").hidden'))
    # Manual editing in the layout canvas.
    set_state(page,{'layout':'manual','manual':[],'view':'layout'})
    box=page.locator('#mainCanvas').bounding_box()
    page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2+3);wait(page)
    check('Canvas click adds a manual LED',page.evaluate('DiffusionLab.getResult().leds.length===1'))
    page.keyboard.down('Shift');page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2+3);page.keyboard.up('Shift');wait(page)
    check('Shift-click removes a manual LED',page.evaluate('DiffusionLab.getResult().leds.length===0'))
    # Successful and rejected JSON imports.
    valid={'schemaVersion':1,'state':{'width':120,'height':36,'gap':7,'layout':'rows','rowSpacing':100,'quality':160}}
    page.locator('#fileInput').set_input_files({'name':'valid.json','mimeType':'application/json','buffer':json.dumps(valid).encode()});page.wait_for_function('DiffusionLab.getState().width===120');wait(page)
    check('Settings JSON import',page.evaluate('DiffusionLab.getState().width===120 && DiffusionLab.getResult().state.gap===7'))
    for package,size,aperture in [('5050',5,2.8),('3535',3.5,1.9),('2020',2,1.1),('custom',6,4.2)]:
        old={'schemaVersion':1,'state':{'width':120,'height':36,'gap':7,'package':package,'packageSize':size,'aperture':aperture,'angle':137,'mcdR':410,'layout':'rows','rowSpacing':100,'quality':160}}
        page.locator('#fileInput').set_input_files({'name':'old.json','mimeType':'application/json','buffer':json.dumps(old).encode()});wait(page)
        page.wait_for_function('(expected)=>{const s=DiffusionLab.getState();return s.packageSize===expected[0] && s.aperture===expected[1]}',arg=[size,aperture])
        wait(page)
        check('Legacy JSON retains optical values without inventing a model: '+package,page.evaluate('DiffusionLab.getState().ledModel==="custom" && DiffusionLab.getResult().state.angle===137 && DiffusionLab.getResult().state.mcdR===410'))
    invalid={'state':{'width':900,'gap':8,'shape':'polygon','polygon':'0,0\n100,100'}}
    page.locator('#fileInput').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()});page.wait_for_timeout(150)
    check('Invalid geometry import does not mutate current state',page.evaluate('DiffusionLab.getState().width===120'))
    page.locator('[data-key="ledModel"]').select_option('WS2812C-2020');wait(page)
    page.locator('[data-key="aperture"]').fill('1.25');page.locator('[data-key="aperture"]').blur();wait(page)
    # Three portable exports.
    for button,filename in [('saveBtn','test-settings.json'),('csvBtn','test-grid.csv'),('pngBtn','test-preview.png')]:
        with page.expect_download(timeout=10000) as event:page.locator('#'+button).click()
        download=event.value;download.save_as(str(ARTIFACTS/filename));check('Export: '+filename,(ARTIFACTS/filename).stat().st_size>100)
    data=json.loads((ARTIFACTS/'test-settings.json').read_text(encoding='utf-8'));check('Exported settings include model identity and optical overrides',data['state']['width']==120 and data['schemaVersion']==2 and data['state']['ledModel']=='WS2812C-2020' and data['state']['aperture']==1.25)
    set_state(page,{'ledModel':'custom','aperture':2})
    page.locator('#fileInput').set_input_files(ARTIFACTS/'test-settings.json')
    page.wait_for_function('DiffusionLab.getState().ledModel==="WS2812C-2020"');wait(page)
    check('Version two JSON restores model and manual calibration',page.evaluate('DiffusionLab.getResult().state.aperture===1.25') and '幅：手動上書き' in page.locator('#ledValueSummary').inner_text())
    csv=(ARTIFACTS/'test-grid.csv').read_text(encoding='utf-8-sig');check('CSV contains physical field values',csv.startswith('x_mm,y_mm,in_evaluation_region') and len(csv.splitlines())>100)
    page.locator('#pinBtn').click();set_state(page,{'gap':20});check('Baseline retained while current gap changes','7.00' in page.locator('#baselineLabel').inner_text() and '20.00' in page.locator('#currentSmallLabel').inner_text())
    page.locator('#sweepBtn').click();page.wait_for_function('DiffusionLab.getSweep().filter(Boolean).length===6',timeout=20000)
    check('Six-distance sweep completes',page.locator('.tile').count()==6)
    set_state(page,{'gap':10});check('Changing distance preserves sweep',page.evaluate('DiffusionLab.getSweep().filter(Boolean).length===6'))
    page.locator('[data-key="ledModel"]').select_option('SK6812');wait(page)
    check('Changing LED model invalidates the old distance sweep',page.evaluate('DiffusionLab.getSweep().length===0'))
    set_state(page,{'density':144})
    page.evaluate('DiffusionLab.setState({gap:5});DiffusionLab.setState({gap:10});DiffusionLab.setState({gap:20});');wait(page)
    check('Rapid updates render newest request only',page.evaluate('DiffusionLab.getResult().state.gap===20'))
    page.locator('#modelBtn').click();check('Model help dialog opens',page.locator('#modelModal').is_visible());page.keyboard.press('Escape');check('Escape closes help dialog',not page.locator('#modelModal').is_visible())
    page.locator('#selfTestBtn').click();check('In-app numerical self tests pass','5/5' in page.locator('#toast').inner_text())
    # Screenshot with the initial scene and comparison, scroll reset avoids sticky sidebar displacement.
    page.locator('#scenePreset').select_option('color');wait(page);page.locator('#sweepBtn').click();page.wait_for_function('DiffusionLab.getSweep().filter(Boolean).length===6',timeout=20000)
    page.locator('#clearBaseline').click();page.evaluate('window.scrollTo(0,0);document.getElementById("sidebar").scrollTop=0');page.wait_for_timeout(400)
    page.wait_for_function('document.getElementById("toast").hidden', timeout=6000)
    page.screenshot(path=str(ARTIFACTS/'preview-comparison.png'),full_page=True)
    check('No JavaScript runtime errors',not errors)
    check('No external network requests',not [u for u in requests if u.startswith(('http://','https://')) and (server is None or not u.startswith(server.url))])
    # Responsive layout.
    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    mobile.on('pageerror',lambda e:errors.append(str(e)))
    load(mobile)
    check('Mobile has no horizontal overflow',mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    mobile.locator('#mobileToggle').click();check('Mobile controls are accessible',mobile.locator('#sidebar').is_visible());mobile.locator('#mobileToggle').click()
    mobile.locator('#mobileToggle').click();mobile.locator('[data-key="ledModel"]').select_option('WS2812C-2020');wait(mobile)
    check('Mobile LED controls and source notes fit the viewport',mobile.evaluate('document.documentElement.scrollWidth <= innerWidth') and '資料未記載・仮定' in mobile.locator('#ledValueSummary').inner_text())
    mobile.locator('#mobileToggle').click()
    mobile.screenshot(path=str(ARTIFACTS/'preview-mobile.png'),full_page=True)
    check('No mobile JavaScript runtime errors',not errors)
    # Standalone/offline payload still calculates after the page has been loaded.
    offline=browser.new_page()
    offline.on('pageerror',lambda e:errors.append(str(e)))
    load(offline, root_path=True)
    check('Standalone payload calculates' if args.embedded else 'Root-site payload calculates',offline.evaluate('DiffusionLab.getResult().stats.mean>0'))
    offline.context.set_offline(True)
    set_state(offline,{'width':110,'gap':12,'quality':160,'ledModel':'SK6812-MINI','aperture':1.3,'angle':111})
    check('Calculation works with network disabled after load',offline.evaluate('DiffusionLab.getResult().state.gap===12'))
    if not args.embedded:
        offline.context.set_offline(False)
        offline.reload(wait_until='load');wait(offline)
        check('Settings persist across reload on HTTP',offline.evaluate('DiffusionLab.getState().width===110 && DiffusionLab.getState().gap===12 && DiffusionLab.getState().ledModel==="SK6812-MINI" && DiffusionLab.getState().aperture===1.3 && DiffusionLab.getState().angle===111'))
        check('Project-site URL is preserved',page.url==site_url)
        legacy=browser.new_page()
        legacy.add_init_script('localStorage.setItem("diffusion-lab-v1",JSON.stringify({package:"2020",packageSize:2,aperture:1.1,angle:132,width:120,gap:8}));')
        load(legacy)
        check('Legacy localStorage settings migrate without altering optics',legacy.evaluate('DiffusionLab.getState().ledModel==="custom" && DiffusionLab.getResult().state.packageSize===2 && DiffusionLab.getResult().state.aperture===1.1 && DiffusionLab.getResult().state.angle===132'))
    check('No additional JavaScript runtime errors',not errors)
    browser.close()
(ARTIFACTS/'browser-test-results.json').write_text(json.dumps({'tests':reports,'runtime_errors':errors,'network_requests':requests,'mode':'embedded (HTTP navigation not tested)' if args.embedded else 'HTTP, project path + root path','browser_version':browser.version,'site_url':site_url},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(reports)}/{len(reports)} browser checks passed. Runtime errors: {errors}')
