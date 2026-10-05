"""Real Chromium checks for physical tape width and continuous SVG containment."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from support import LocalSite
import json
import math
import os

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
if not (ROOT / 'dist' / 'index.html').is_file():
    raise SystemExit('Run python build.py before browser tests.')
U = [{'fillRule': 'nonzero', 'contours': [[
    [0, 0], [25, 0], [25, 75], [75, 75], [75, 0], [100, 0], [100, 100], [0, 100],
]]}]
C = [{'fillRule': 'nonzero', 'contours': [[
    [0, 0], [100, 0], [100, 25], [25, 25], [25, 75], [100, 75], [100, 100], [0, 100],
]]}]
reports, errors, requests = [], [], []


def check(label, condition):
    assert condition, label
    reports.append({'test': label, 'passed': True})
    print('PASS', len(reports), label, flush=True)


def wait(page):
    page.wait_for_function(
        'window.DiffusionLab && DiffusionLab.getResult() && !DiffusionLab.isBusy()', timeout=30000,
    )


def scene(**overrides):
    value = dict(shape='svg', svgShapes=U, width=160, height=120, layout='manual',
                 view='layout', renderMode='2d', quality=160, gamingPlaying=False,
                 pattern='solid', color1='#ffffff', packageSize=5.4, tapeWidth=8,
                 aperture=2.8, angle=120, ledModel='custom', rotation=0,
                 manual=[[-55, 40, 0], [55, 40, 0], [-65, -30, math.pi / 2], [-65, 0, math.pi / 2]],
                 tapeLengths=[2, 2], density=60, rowSpacing=24, tapeCount=0, inset=8,
                 brightness=20, exposure=0, gap=10)
    value.update(overrides)
    return value


def set_state(page, **overrides):
    page.evaluate('(s)=>DiffusionLab.setState(s)', scene(**overrides))
    wait(page)


def state(page):
    return page.evaluate('DiffusionLab.getState()')


def layout(page):
    return page.evaluate('Optics.tapeLayout(DiffusionLab.getState())')


def point(page, x, y):
    page.locator('#mainCanvas').scroll_into_view_if_needed()
    return page.evaluate('''([x,y])=>{
        const r=document.getElementById('mainCanvas').getBoundingClientRect(),s=DiffusionLab.getState();
        const scale=Math.min((r.width-120)/s.width,(r.height-108)/s.height);
        return [r.left+r.width/2+x*scale,r.top+r.height/2+3+y*scale];
    }''', [x, y])


def select(page, index=0):
    page.locator('#tapeSelect').select_option(str(index))


def move(page, x, y):
    page.locator('#tapeX').fill(str(x))
    page.locator('#tapeY').fill(str(y))
    page.locator('#applyTapePosition').click()
    wait(page)


def rotate(page, degrees):
    page.locator('#tapeAngle').fill(str(degrees))
    page.locator('#applyTapeAngle').click()
    wait(page)


def all_tapes_fit(page):
    return page.evaluate('''()=>{
        const s=DiffusionLab.getState(),l=Optics.tapeLayout(s);
        return l.tapeLengths.length>0&&Optics.tapeRanges(l).every(t=>
            Optics.tapeFits(s,l.manual.slice(t.start,t.start+t.length)));
    }''')


def translated(before, after, index, dx, dy):
    start = sum(before['tapeLengths'][:index])
    end = start + before['tapeLengths'][index]
    return (before['tapeLengths'] == after['tapeLengths'] and len(before['manual']) == len(after['manual'])
            and all(abs(b[0] - a[0] - (dx if start <= i < end else 0)) < 1e-8
                    and abs(b[1] - a[1] - (dy if start <= i < end else 0)) < 1e-8 and b[2] == a[2]
                    for i, (a, b) in enumerate(zip(before['manual'], after['manual']))))


options = {'headless': True, 'args': ['--disable-dev-shm-usage']}
if os.environ.get('CHROMIUM_PATH'):
    options['executable_path'] = os.environ['CHROMIUM_PATH']

with LocalSite(ROOT / 'dist') as server, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**options)
    browser_version = browser.version
    page = browser.new_page(viewport={'width': 1536, 'height': 1100}, accept_downloads=True)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    response = page.goto(server.url + 'diffusion-lab/', wait_until='load')
    assert response and response.status == 200
    wait(page)
    check('New scenes expose an 8 mm physical tape width control', state(page)['tapeWidth'] == 8
          and page.locator('[data-key="tapeWidth"]').input_value() == '8')
    set_state(page)
    check('Manual layout keeps tape width and outline diagnostics accessible',
          page.locator('[data-key="tapeWidth"]').is_visible() and page.locator('#tapeOutlineStatus').is_visible())
    check('Safe U-shaped manual tapes fit including all PCB bridges', all_tapes_fit(page)
          and page.evaluate('DiffusionLab.getResult().leds.length===4'))
    select(page)
    before = layout(page)
    check('U cutout test has both translated LED endpoints inside the board',
          page.evaluate('''()=>{
              const s=DiffusionLab.getState(),inside=Optics.shapeInfo(s).inside;
              return inside(-55,0,s.packageSize/2)&&inside(55,0,s.packageSize/2)
                  &&!Optics.tapeFits(s,[[-55,0,0],[55,0,0]]);
          }'''))
    move(page, -55, 0)
    check('Move across a U cutout rejects the whole connected tape atomically',
          layout(page) == before and page.locator('#tapePositionStatus').evaluate("el=>el.classList.contains('invalid')"))
    move(page, -55, 42)
    check('Safe move preserves LED interval, package angles and the other tape',
          translated(before, layout(page), 0, 0, 2) and all_tapes_fit(page))
    set_state(page)
    select(page)
    before = layout(page)
    check('U rotated endpoints are inside while the width-bearing bridge is outside',
          page.evaluate('''()=>{
              const s=DiffusionLab.getState(),a=Math.PI/12,inside=Optics.shapeInfo(s).inside;
              const p=[[-55*Math.cos(a),40-55*Math.sin(a),a],[55*Math.cos(a),40+55*Math.sin(a),a]];
              return p.every(p=>inside(p[0],p[1],s.packageSize/2))&&!Optics.tapeFits(s,p);
          }'''))
    rotate(page, 15)
    check('Rotation whose bridge crosses the U cutout is rejected atomically',
          layout(page) == before and page.locator('#tapePositionStatus').evaluate("el=>el.classList.contains('invalid')"))
    rotate(page, 5)
    check('A safe rotation is accepted without disconnecting either tape',
          layout(page)['tapeLengths'] == [2, 2] and layout(page)['manual'][2:] == before['manual'][2:]
          and abs(layout(page)['manual'][0][2] - math.radians(5)) < 1e-8 and all_tapes_fit(page))
    page.locator('#tapeOutlineStatus').scroll_into_view_if_needed()
    page.screenshot(path=str(ARTIFACTS / 'preview-tape-width-u-outline.png'), full_page=True)

    c_points = [[-45, -45, math.pi / 2], [-45, 45, math.pi / 2], [-70, -20, math.pi / 2], [-70, 20, math.pi / 2]]
    set_state(page, svgShapes=C, manual=c_points)
    select(page)
    before = layout(page)
    check('C cutout test has inside LED endpoints but an outside bridge',
          page.evaluate('''()=>{
              const s=DiffusionLab.getState(),inside=Optics.shapeInfo(s).inside;
              return inside(-20,-45,s.packageSize/2)&&inside(-20,45,s.packageSize/2)
                  &&!Optics.tapeFits(s,[[-20,-45,Math.PI/2],[-20,45,Math.PI/2]]);
          }'''))
    move(page, -20, -45)
    check('Moving across the C cutout keeps the previous complete layout', layout(page) == before)
    rotate(page, 105)
    check('A rotated PCB crossing the C cutout is also rejected', layout(page) == before)
    rotate(page, 91)
    check('Safe C-shaped rotation retains a continuous valid footprint', all_tapes_fit(page)
          and abs(layout(page)['manual'][0][2] - math.radians(91)) < 1e-8)

    for outline_name, outline in [('U', U), ('C', C)]:
        for automatic in ['rows', 'grid']:
            # Rotate C rows so the open right-hand cutout creates an interior gap,
            # rather than merely trimming the trailing end of a horizontal row.
            set_state(page, svgShapes=outline, layout=automatic,
                      rotation=90 if outline_name == 'C' and automatic == 'rows' else 0)
            generation = page.evaluate('Optics.makeLEDs(DiffusionLab.getState())')
            check('Automatic ' + automatic + ' splits at the ' + outline_name + ' cutout',
                  generation['splitCount'] > 0 and len(layout(page)['tapeLengths']) > 1 and all_tapes_fit(page))
            check('3D ' + automatic + ' avoids reconnecting separated ' + outline_name + ' fragments',
                  page.evaluate('''()=>{
                      const r=DiffusionLab.getResult(),g=DiffusionView3D.mountedTapeGeometry(r,Optics);
                      return g.tapes.filter(t=>t.ledIndices.length===2).every(t=>{
                          const a=r.leds.find(p=>p.index===t.ledIndices[0]),b=r.leds.find(p=>p.index===t.ledIndices[1]);
                          return a&&b&&a.tapeIndex===b.tapeIndex&&a.index+1===b.index
                              &&Optics.tapeFits(r.state,[[a.x,a.y,a.angle],[b.x,b.y,b.angle]]);
                      });
                  }'''))
    check('Automatic splitting is explained in the tape outline status',
          '分割' in page.locator('#tapeOutlineStatus').inner_text())

    set_state(page, shape='rect', layout='rows', tapeCount=2)
    check('A fixed parallel tape count remains an explicit setting',
          state(page)['tapeCount'] == 2 and len(layout(page)['tapeLengths']) == 2)
    page.locator('#autoTapeCount').click()
    wait(page)
    check('Return to automatic count restores all rows that fit the board',
          state(page)['tapeCount'] == 0 and len(layout(page)['tapeLengths']) == 5 and all_tapes_fit(page))
    page.locator('[data-key="shape"]').select_option('svg')
    wait(page)
    check('Automatic count continues to split when an SVG cutout is applied',
          state(page)['tapeCount'] == 0
          and page.evaluate('Optics.makeLEDs(DiffusionLab.getState()).splitCount>0') and all_tapes_fit(page))

    set_state(page)
    page.locator('#clearManual').click()
    wait(page)
    check('All tapes can be removed without losing the applied SVG outline',
          state(page)['manual'] == [] and state(page)['tapeLengths'] == [] and state(page)['svgShapes'] == U)
    page.locator('#tapeCount').fill('1')
    page.locator('#applyTapeCount').click()
    wait(page)
    check('A safe tape can be added again after clearing an SVG U-shaped layout',
          len(state(page)['tapeLengths']) == 1 and len(state(page)['manual']) > 0
          and all_tapes_fit(page) and page.locator('#tapeCount').get_attribute('aria-invalid') != 'true')

    set_state(page, manual=[[-55, 0, 0], [55, 0, 0], [-55, 40, 0], [55, 40, 0]], tapeLengths=[2, 2])
    check('Legacy invalid manual group keeps saved coordinates and connections',
          state(page)['manual'] == [[-55, 0, 0], [55, 0, 0], [-55, 40, 0], [55, 40, 0]]
          and state(page)['tapeLengths'] == [2, 2])
    check('The whole invalid manual group is excluded while the valid tape still calculates',
          page.evaluate('DiffusionLab.getResult().leds.length===2&&DiffusionLab.getResult().leds.every(p=>p.y===40)&&DiffusionLab.getResult().warnings.length>0'))
    check('Excluded manual tape is reported in the outline status',
          any(word in page.locator('#tapeOutlineStatus').inner_text() for word in ['輪郭', '除外', '問題']))
    check('3D never draws a bridge across the excluded manual group',
          page.evaluate('''()=>{
              const g=DiffusionView3D.mountedTapeGeometry(DiffusionLab.getResult(),Optics);
              return g.packages.length===2&&g.tapes.every(t=>t.polygon.every(p=>p[1]>30));
          }'''))

    set_state(page, layout='path', path='-55,40\n55,40')
    before_path = state(page)['path']
    page.locator('[data-key="path"]').fill('-55,0\n55,0')
    page.wait_for_function("document.querySelector('[data-key=path]').getAttribute('aria-invalid')==='true'")
    wait(page)
    check('Unsafe typed path is rejected while the previous applied path is retained',
          state(page)['path'] == before_path and all_tapes_fit(page)
          and '保持' in page.locator('#tapeOutlineStatus').inner_text())
    page.locator('[data-key="path"]').fill('-55,42\n55,42')
    page.wait_for_function("DiffusionLab.getState().path==='-55,42\\n55,42'")
    wait(page)
    check('A safe replacement path is accepted', all_tapes_fit(page)
          and page.locator('[data-key="path"]').get_attribute('aria-invalid') != 'true')
    before_path = state(page)['path']
    page.locator('#pathDrawBtn').click()
    page.mouse.click(*point(page, -55, 0))
    page.mouse.click(*point(page, 55, 0))
    page.locator('#pathFinishBtn').click()
    wait(page)
    check('An unsafe screen-drawn path is rejected and keeps the applied layout',
          state(page)['path'] == before_path and all_tapes_fit(page))
    page.keyboard.press('Escape')
    page.locator('#pathDrawBtn').click()
    page.mouse.click(*point(page, -55, 40))
    page.mouse.click(*point(page, 55, 40))
    page.locator('#pathFinishBtn').click()
    wait(page)
    check('A safe screen-drawn path can still be committed after cancellation',
          state(page)['path'] == '-55,40\n55,40' and all_tapes_fit(page))

    set_state(page, shape='rect', width=160, height=100, view='appearance', renderMode='3d',
              manual=[[-30, 0, 0], [30, 0, 0]], tapeLengths=[2], tapeWidth=12, gap=80, showLED=True)
    page.locator('[data-key="tapeWidth"]').fill('14')
    page.locator('[data-key="tapeWidth"]').blur()
    wait(page)
    check('Width changes reach the state, worker and physical 3D tape polygons',
          state(page)['tapeWidth'] == 14
          and page.evaluate('''()=>{
              const r=DiffusionLab.getResult(),g=DiffusionView3D.mountedTapeGeometry(r,Optics),f=Optics.tapeFootprints(r.state,r.leds.map(p=>[p.x,p.y,p.angle]));
              return r.state.tapeWidth===14&&JSON.stringify(g.tapes.map(t=>t.polygon))===JSON.stringify(f.tapes)
                  &&Math.abs(Math.hypot(g.tapes[0].polygon[1][0]-g.tapes[0].polygon[0][0],g.tapes[0].polygon[1][1]-g.tapes[0].polygon[0][1])-14)<1e-8;
          }'''))
    check('3D rendering uses the common physical footprint generation',
          page.evaluate('''()=>{
              const original=Optics.tapeFootprints,widths=[];
              Optics.tapeFootprints=(s,p)=>{widths.push(s.tapeWidth);return original(s,p);};
              try{
                  DiffusionView3D.render(document.createElement('canvas').getContext('2d'),DiffusionLab.getResult(),{width:640,height:355,optics:Optics,showLED:true,showGrid:false});
              }finally{Optics.tapeFootprints=original;}
              return widths.length>0&&widths.every(w=>w===14);
          }'''))
    check('Old filtered LED indices cannot create a replacement bridge across a gap',
          page.evaluate('''()=>{
              const r=DiffusionLab.getResult(),leds=[{...r.leds[0],index:0,tapeIndex:0},{...r.leds[1],index:2,tapeIndex:0}],g=DiffusionView3D.mountedTapeGeometry({...r,leds},Optics);
              return g.tapes.length===2&&g.tapes.every(t=>t.ledIndices.length===1);
          }'''))
    with page.expect_download() as event:
        page.locator('#saveBtn').click()
    settings = ARTIFACTS / 'tape-width-settings.json'
    event.value.save_as(str(settings))
    check('Settings JSON includes the physical tape width',
          json.loads(settings.read_text(encoding='utf-8'))['state']['tapeWidth'] == 14)
    set_state(page, shape='rect', tapeWidth=8)
    page.locator('#fileInput').set_input_files(str(settings))
    page.wait_for_function('DiffusionLab.getState().tapeWidth===14')
    wait(page)
    page.reload(wait_until='load')
    wait(page)
    check('Width survives JSON import and localStorage reload', state(page)['tapeWidth'] == 14
          and page.evaluate('DiffusionLab.getResult().state.tapeWidth===14'))
    page.locator('[data-key="tapeWidth"]').scroll_into_view_if_needed()
    page.screenshot(path=str(ARTIFACTS / 'preview-tape-width-3d.png'), full_page=True)

    legacy = scene(shape='rect', svgShapes=[], packageSize=3.7, version=1)
    del legacy['tapeWidth']
    page.locator('#fileInput').set_input_files({
        'name': 'old-tape-width.json', 'mimeType': 'application/json',
        'buffer': json.dumps({'schemaVersion': 1, 'state': legacy}).encode('utf-8'),
    })
    page.wait_for_function('DiffusionLab.getState().packageSize===3.7')
    wait(page)
    check('Legacy settings without tape width retain the earlier package plus 2 mm footprint',
          abs(state(page)['tapeWidth'] - 5.7) < 1e-8)

    mobile = browser.new_page(viewport={'width': 390, 'height': 1000}, is_mobile=True, has_touch=True)
    mobile.on('pageerror', lambda error: errors.append(str(error)))
    mobile.on('request', lambda request: requests.append(request.url))
    mobile.goto(server.url, wait_until='load')
    wait(mobile)
    mobile.locator('#mobileToggle').click()
    mobile.locator('[data-key="tapeWidth"]').fill('12')
    mobile.locator('[data-key="tapeWidth"]').blur()
    wait(mobile)
    mobile.locator('#tapeOutlineStatus').scroll_into_view_if_needed()
    check('Root-site mobile width editing fits the viewport and reaches the worker',
          state(mobile)['tapeWidth'] == 12 and mobile.evaluate('DiffusionLab.getResult().state.tapeWidth===12&&document.documentElement.scrollWidth<=innerWidth'))
    mobile.screenshot(path=str(ARTIFACTS / 'preview-tape-width-mobile.png'))
    check('Tape outline tests produce no JavaScript runtime errors', not errors)
    check('Tape outline tests do not fetch external assets', all(url.startswith(server.url) or url.startswith('blob:')
          or url.startswith('data:') for url in requests))
    browser.close()

(ARTIFACTS / 'tape-outline-test-results.json').write_text(
    json.dumps({'tests': reports, 'runtime_errors': errors, 'network_requests': requests,
                'mode': 'HTTP, project path + root path', 'browser_version': browser_version},
               ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(reports)}/{len(reports)} tape outline checks passed. Runtime errors: {errors}')
