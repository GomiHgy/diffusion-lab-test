"""Real-browser acceptance for an axial folded tape and a diffusing cylinder."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from support import LocalSite
import csv
import json
import math
import os

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'tests' / 'artifacts'
ART.mkdir(exist_ok=True)
checks = []


def check(label, value):
    assert value, label
    checks.append(label)
    print('PASS', len(checks), label, flush=True)


def wait(page):
    # Display controls need not recompute; optical inputs must match the returned state.
    page.wait_for_function('''()=>{
      if(!window.DiffusionLab||!DiffusionLab.getResult()||DiffusionLab.isBusy())return false;
      if(!document.getElementById('errorBanner').hidden)return false;
      const s=DiffusionLab.getState(),r=DiffusionLab.getResult().state;
      const keys=['geometryMode','ledModel','packageSize','density','tapeWidth','pattern','brightness','color1','color2','pwmMode','angle','mcdR','mcdG','mcdB','transmission','diffuse','thickness','spread','argb','roi'];
      keys.push(...(s.geometryMode==='cylinder'?['cylinderDiameter','cylinderLength','cylinderTapeLength','cylinderAngle']:['shape','width','height','gap','layout']));
      if(s.pattern==='gaming'&&!s.gamingPlaying)keys.push('gamingScene','gamingPhase');
      return keys.every(k=>r[k]===s[k]);
    }''', timeout=60000)


def wait_error(page):
    page.wait_for_function('''()=>window.DiffusionLab&&!DiffusionLab.isBusy()&&
      !document.getElementById('errorBanner').hidden''', timeout=30000)


def state(page):
    return page.evaluate('DiffusionLab.getState()')


def set_state(page, values, valid=True):
    page.evaluate('(s)=>DiffusionLab.setState(s)', values)
    (wait if valid else wait_error)(page)


def input_value(page, key, value):
    numeric = page.locator('[data-key="' + key + '"][type="number"]')
    locator = numeric if numeric.count() else page.locator('[data-key="' + key + '"]')
    locator.fill(str(value))
    locator.blur()
    wait(page)


def light(page):
    return page.evaluate('''()=>{const r=DiffusionLab.getResult();return {
      nx:r.nx,ny:r.ny,mean:r.stats.mean,fields:r.fields.map(f=>Array.from(f)),
      cylinder:r.cylinder,leds:r.leds,tapeLengths:r.tapeLengths};}''')


def download(page, selector, name):
    with page.expect_download() as pending:
        page.locator(selector).click()
    path = ART / name
    pending.value.save_as(str(path))
    return path


options = {'headless': True}
if os.environ.get('CHROMIUM_PATH'):
    options['executable_path'] = os.environ['CHROMIUM_PATH']
with LocalSite(ROOT / 'dist').start() as site, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1536, 'height': 1100}, accept_downloads=True)
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    page.goto(site.url + 'diffusion-lab/')
    wait(page)
    check('New startup retains the plane model', state(page)['geometryMode'] == 'plane')

    legacy = {'version': 1, 'width': 120, 'height': 100, 'gap': 15,
              'shape': 'rect', 'layout': 'manual', 'manual': [[-30, -20, 0], [0, -20, 0], [30, -20, 0]],
              'tapeLengths': [3], 'ledModel': 'custom', 'packageSize': 2, 'aperture': 1,
              'density': 100, 'pattern': 'gradient', 'color1': '#ff0000', 'color2': '#0000ff',
              'pwmMode': 'raw', 'mcdR': 600, 'mcdG': 1200, 'mcdB': 300,
              'brightness': 20, 'transmission': 45, 'diffuse': 100,
              'thickness': 3, 'spread': 0, 'roi': 5, 'angle': 120, 'quality': 160}
    legacy_file = ART / 'cylinder-legacy-plane.json'
    legacy_file.write_text(json.dumps({'app': 'Diffusion Lab', 'schemaVersion': 1, 'state': legacy}), encoding='utf-8')
    page.locator('#fileInput').set_input_files(str(legacy_file))
    wait(page)
    before = state(page)
    plane_mean = page.evaluate('DiffusionLab.getResult().stats.mean')
    check('An old JSON without geometryMode imports as plane without changing coordinates', before['geometryMode'] == 'plane' and before['manual'] == legacy['manual'] and before['tapeLengths'] == [3])

    page.locator('[data-key="geometryMode"]').select_option('cylinder')
    wait(page)
    check('Cylinder UI reaches the separate optical solver', page.evaluate("DiffusionLab.getResult().state.geometryMode==='cylinder' && !!DiffusionLab.getResult().cylinder"))
    check('Cylinder defaults are 80 mm diameter, 200 mm axis and 160 mm folded-side length', all(state(page)[k] == v for k, v in [('cylinderDiameter', 80), ('cylinderLength', 200), ('cylinderTapeLength', 160), ('cylinderAngle', 0)]))
    check('Cylinder mode hides plane tape placement and free editing controls', not page.locator('[data-key="layout"]').is_visible() and not page.locator('#tapeCount').is_visible() and not page.locator('#tapeEditor').is_visible())
    check('Cylinder mode keeps actual tape width and density editable', page.locator('[data-key="tapeWidth"]').is_visible() and page.locator('[data-key="density"]').is_visible())
    check('Plane-only distance input and sweep are unavailable in cylinder mode', not page.locator('#gapNumber').is_visible() and (not page.locator('#sweepBtn').is_visible() or page.locator('#sweepBtn').is_disabled()))

    for key, value in [('cylinderDiameter', 100), ('cylinderLength', 240), ('cylinderTapeLength', 160), ('cylinderAngle', 0), ('tapeWidth', 8)]:
        input_value(page, key, value)
    r = light(page)
    n = math.floor((160 - 8) / 10) + 1
    check('Folded tape count uses package and tape end width with two physical LED sides', r['cylinder']['perSideLEDs'] == n and len(r['leds']) == 2 * n and r['tapeLengths'] == [2 * n])
    check('A single tape has consecutive wiring indices across the fold', [led['index'] for led in r['leds']] == list(range(2 * n)) and all(led['tapeIndex'] == 0 for led in r['leds']))
    check('The first side progresses along the axis and the second returns in reverse', all(r['leds'][i]['y'] < r['leds'][i + 1]['y'] for i in range(n - 1)) and all(r['leds'][i]['y'] > r['leds'][i + 1]['y'] for i in range(n, 2 * n - 1)))
    check('Opposite LEDs share an axial position and have opposite outward normals', all(abs(r['leds'][i]['y'] - r['leds'][2 * n - 1 - i]['y']) < 1e-9 and abs(sum(a * b for a, b in zip(r['leds'][i]['normal3D'], r['leds'][2 * n - 1 - i]['normal3D'])) + 1) < 1e-9 for i in range(n)))
    check('One global gradient follows the fold instead of restarting on the reverse side', r['leds'][0]['rgb'][0] == .2 and r['leds'][0]['rgb'][2] == 0 and r['leds'][-1]['rgb'][0] == 0 and r['leds'][-1]['rgb'][2] == .2)
    check('Cylinder edits preserve the stored plane geometry and connected coordinates', all(state(page)[k] == before[k] for k in ['width', 'height', 'gap', 'shape', 'layout', 'manual', 'tapeLengths']))

    set_state(page, {'pattern': 'solid', 'color1': '#ffffff', 'brightness': 20, 'cylinderAngle': 0, 'spread': 0})
    first = light(page)
    check('Cylinder fields are finite and emit positive luminance', first['mean'] > 0 and all(math.isfinite(v) and v >= 0 for channel in first['fields'] for v in channel))
    row = first['ny'] // 2
    values = first['fields'][0][row * first['nx']:(row + 1) * first['nx']]
    check('Both physical LED sides produce equal opposite lobes for equal RGB drive', max(abs(values[i] - values[i + first['nx'] // 2]) for i in range(first['nx'] // 2)) <= max(values) * 1e-6)
    check('The output has directional lobes rather than an isotropic doubled LED', values[first['nx'] // 4] < values[0] * .1 and values[3 * first['nx'] // 4] < values[0] * .1)
    input_value(page, 'cylinderAngle', 90)
    rotated = light(page)
    nx = first['nx']
    error = max(abs(rotated['fields'][c][y * nx + x] - first['fields'][c][y * nx + ((x - nx // 4) % nx)]) for c in range(3) for y in range(first['ny']) for x in range(nx))
    maximum = max(max(channel) for channel in first['fields'])
    check('A 90 degree direction change rotates the complete optical field around the wrap', nx % 4 == 0 and error <= maximum * 2e-6)
    input_value(page, 'brightness', 40)
    brighter = light(page)
    check('Doubling LED output doubles physical cylinder luminance exactly once', abs(brighter['mean'] / rotated['mean'] - 2) < 2e-6)
    check('The exterior diameter and cell area include diffuser thickness', page.evaluate('''()=>{const r=DiffusionLab.getResult();return Math.abs(r.cylinder.outerDiameter-106)<1e-9&&Math.abs(r.stats.area-r.cylinder.outerCircumference*240)<1e-6;}'''))
    check('Circumferential diffusion wraps across both sides of the seam without losing energy', page.evaluate('''()=>{const a=new Float32Array(8);a[0]=1;const b=CylinderOptics.diffuseCylinder(a,8,1,1,0);return b[7]>0&&Math.abs(b[1]-b[7])<1e-8&&Math.abs(Array.from(b).reduce((v,x)=>v+x,0)-1)<1e-6;}'''))

    page.locator('[data-view="appearance"]').click()
    page.locator('[data-key="renderMode"]').select_option('2d')
    image2d = page.locator('#mainCanvas').evaluate('(c)=>c.toDataURL()')
    check('Cylinder 2D surface is an angular by axial image', page.evaluate('''()=>{const r=DiffusionLab.getResult();return Math.abs(r.nx*r.dx-r.cylinder.outerCircumference)<1e-9&&Math.abs(r.ny*r.dy-r.cylinder.length)<1e-9;}'''))
    page.screenshot(path=str(ART / 'cylinder-2d.png'), full_page=True)
    png2d = download(page, '#pngBtn', 'cylinder-2d-export.png')
    check('Cylinder unfolded 2D surface exports a nonempty PNG', png2d.stat().st_size > 10000)
    page.locator('[data-key="renderMode"]').select_option('3d')
    check('3D cylinder uses a distinct render with the shared camera controls', page.locator('#cameraControls').is_visible() and image2d != page.locator('#mainCanvas').evaluate('(c)=>c.toDataURL()'))
    check('Cylinder camera projects its own physical diameter with finite coordinates', page.evaluate('''()=>{const s=DiffusionLab.getState(),camera=CylinderView.createCamera(s,{width:800,height:400,yaw:-25,pitch:55,zoom:1}),q=camera.project(0,0,s.cylinderDiameter/2+s.thickness);return Number.isFinite(q.x)&&Number.isFinite(q.y);}'''))
    camera_before = state(page)
    optical_before = page.evaluate('DiffusionLab.getResult().stats.mean')
    canvas = page.locator('#mainCanvas')
    canvas.scroll_into_view_if_needed()
    box = canvas.bounding_box()
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 40, cy + 20, steps=6)
    page.mouse.up()
    check('Cylinder 3D orbit changes camera while preserving the optical solution', state(page)['cameraYaw'] != camera_before['cameraYaw'] and state(page)['cameraPitch'] != camera_before['cameraPitch'] and page.evaluate('DiffusionLab.getResult().stats.mean') == optical_before)
    zoom = state(page)['cameraZoom']
    page.mouse.wheel(0, -150)
    page.wait_for_function('(z)=>DiffusionLab.getState().cameraZoom>z', arg=zoom)
    check('Cylinder 3D wheel zoom retains its geometry and optical fields', page.evaluate('DiffusionLab.getResult().stats.mean') == optical_before and state(page)['cylinderDiameter'] == 100)
    page.screenshot(path=str(ART / 'cylinder-3d.png'), full_page=True)
    png = download(page, '#pngBtn', 'cylinder-3d-export.png')
    check('Cylinder 3D exports a nonempty PNG snapshot', png.stat().st_size > 10000 and png.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
    check('Cylinder 2D and 3D exports carry distinct surface presentations', png.read_bytes() != png2d.read_bytes())
    page.locator('#pinBtn').click()
    baseline_label = page.locator('#baselineLabel').inner_text()
    input_value(page, 'cylinderDiameter', 104)
    check('Cylinder comparison pins its original diameter while the current diameter changes', page.locator('#baselineCard').is_visible() and '内径100' in baseline_label and page.locator('#baselineLabel').inner_text() == baseline_label and '内径104' in page.locator('#currentSmallLabel').inner_text())
    check('Cylinder diameter change recomputes physical luminance with fixed display exposure', page.evaluate('DiffusionLab.getResult().stats.mean') != optical_before and state(page)['exposure'] == camera_before['exposure'])
    input_value(page, 'cylinderDiameter', 100)

    page.locator('[data-view="layout"]').click()
    check('Cylinder layout provides its diagram while plane tape selection remains hidden', page.locator('#mainCanvas').is_visible() and not page.locator('#tapeEditor').is_visible() and page.locator('#mainCanvas').evaluate('(c)=>c.toDataURL()') != image2d)
    snapshot = state(page)['manual']
    canvas = page.locator('#mainCanvas')
    canvas.scroll_into_view_if_needed()
    box = canvas.bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] / 2 + 30, box['y'] + box['height'] / 2 + 20, steps=5)
    page.mouse.up()
    page.keyboard.press('ArrowRight')
    check('Cylinder diagrams cannot move the preserved plane tape coordinates', state(page)['manual'] == snapshot)
    page.screenshot(path=str(ART / 'cylinder-layout.png'), full_page=True)
    page.locator('[data-view="heat"]').click()
    check('Cylinder heat map retains positive physical fields', page.locator('#heatKey').is_visible() and page.evaluate('DiffusionLab.getResult().stats.mean>0'))

    set_state(page, {'view': 'appearance', 'pattern': 'gaming', 'gamingScene': 'chase', 'gamingPhase': .2, 'gamingPlaying': True})
    check('Cylinder gaming prepares the same 24 optical phase snapshots', page.evaluate('DiffusionLab.getGaming().frames===24&&!DiffusionLab.getGaming().preparing'))
    phase = state(page)['gamingPhase']
    page.wait_for_function('(p)=>Math.abs(DiffusionLab.getState().gamingPhase-p)>.02', arg=phase, timeout=30000)
    check('Live cylinder gaming retains cylinder metadata and its single folded group', page.evaluate('''()=>{const r=DiffusionLab.getResult();return !!r.cylinder&&r.tapeLengths.length===1&&r.leds.every(p=>p.tapeIndex===0)&&r.stats.mean>0;}'''))
    check('Moving cylinder output cannot export a stale optical snapshot', page.locator('#pngBtn').is_disabled() and page.locator('#csvBtn').is_disabled())
    page.locator('#gamingPlayBtn').click()
    wait(page)
    paused = state(page)['gamingPhase']
    check('Stopping cylinder gaming freezes and solves the current phase', not state(page)['gamingPlaying'] and page.evaluate('(p)=>DiffusionLab.getResult().state.gamingPhase===p', paused) and page.locator('#pngBtn').is_enabled())
    saved_file = download(page, '#saveBtn', 'cylinder-settings.json')
    saved = json.loads(saved_file.read_text(encoding='utf-8'))['state']
    check('Cylinder JSON stores dimensions, mode, direction, and a stopped gaming phase', saved['geometryMode'] == 'cylinder' and saved['cylinderDiameter'] == 100 and saved['cylinderLength'] == 240 and saved['cylinderTapeLength'] == 160 and saved['cylinderAngle'] == 90 and saved['gamingPhase'] == paused and not saved['gamingPlaying'])
    check('Cylinder JSON also preserves the independent plane tape data', saved['manual'] == before['manual'] and saved['tapeLengths'] == before['tapeLengths'] and saved['width'] == before['width'] and saved['height'] == before['height'])
    csv_file = download(page, '#csvBtn', 'cylinder-grid.csv')
    with csv_file.open(encoding='utf-8-sig', newline='') as stream:
        table = list(csv.reader(stream))
    check('Cylinder CSV labels angular and axial coordinates instead of plane X', table[0][:3] == ['theta_deg', 'axial_mm', 'outer_arc_mm'])
    check('Cylinder CSV contains every angular and axial cell with finite fields', len(table) - 1 == page.evaluate('DiffusionLab.getResult().nx*DiffusionLab.getResult().ny') and all(math.isfinite(float(v)) for row in table[1:] for v in row))
    check('Cylinder CSV spans cell-center angles around 360 degrees and both axial directions', 0 < float(table[1][0]) < 360 and float(table[1][1]) < 0 and float(table[-1][0]) < 360 and float(table[-1][1]) > 0 and len({row[0] for row in table[1:]}) == page.evaluate('DiffusionLab.getResult().nx'))

    set_state(page, {'diffuse': 50}, valid=False)
    check('Low-diffusion cylinder material yields an explicit unsupported-model error', '100%' in page.locator('#errorBanner').inner_text() and page.locator('#pngBtn').is_disabled() and page.locator('#csvBtn').is_disabled())
    input_value(page, 'diffuse', 100)
    check('Restoring full diffusion clears the error and recomputes the cylinder', page.locator('#errorBanner').is_hidden() and page.evaluate('DiffusionLab.getResult().state.diffuse===100'))
    set_state(page, {'cylinderLength': 100, 'cylinderTapeLength': 160}, valid=False)
    check('A folded side longer than the cylinder is rejected without an exported result', '以下' in page.locator('#errorBanner').inner_text() and page.locator('#csvBtn').is_disabled())
    input_value(page, 'cylinderTapeLength', 80)
    check('Correcting folded length restores one valid connected tape', page.evaluate('DiffusionLab.getResult().cylinder.tapeLength===80&&DiffusionLab.getResult().tapeLengths.length===1'))
    page.locator('#fileInput').set_input_files(str(saved_file))
    wait(page)
    check('Cylinder JSON import restores a paused, reproducible optical state', state(page)['geometryMode'] == 'cylinder' and state(page)['cylinderLength'] == 240 and state(page)['gamingPhase'] == paused and not state(page)['gamingPlaying'])
    page.reload()
    wait(page)
    check('Cylinder mode and its folded dimensions survive browser storage reload', state(page)['geometryMode'] == 'cylinder' and state(page)['cylinderTapeLength'] == 160 and state(page)['manual'] == before['manual'])

    page.locator('#fileInput').set_input_files(str(legacy_file))
    wait(page)
    restored = state(page)
    check('Loading an old plane JSON after cylinder use restores the plane controls', restored['geometryMode'] == 'plane' and page.locator('[data-key="layout"]').is_visible() and page.locator('#gapNumber').is_visible())
    check('Legacy plane JSON round-trip preserves all old coordinates and optical inputs', all(restored[k] == before[k] for k in legacy if k != 'version'))
    check('Legacy plane optics are unchanged after a cylinder session', abs(page.evaluate('DiffusionLab.getResult().stats.mean') - plane_mean) <= plane_mean * 1e-6)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('#mobileToggle').click()
    page.locator('[data-key="geometryMode"]').select_option('cylinder')
    wait(page)
    check('Cylinder dimensions and tape width stay accessible on mobile', page.locator('[data-key="cylinderDiameter"]').is_visible() and page.locator('[data-key="tapeWidth"]').is_visible())
    page.locator('[data-view="appearance"]').click()
    page.locator('[data-key="renderMode"]').select_option('3d')
    check('Cylinder 3D and camera toolbar fit the mobile width', page.locator('#cameraControls').is_visible() and page.evaluate('document.documentElement.scrollWidth<=390'))
    page.screenshot(path=str(ART / 'cylinder-mobile.png'), full_page=True)

    # 長い基板に奥半分のLEDが覆われた実際の設定を、描画ピクセルまで検証する。
    page.set_viewport_size({'width': 1680, 'height': 1320})
    set_state(page, {'geometryMode': 'cylinder', 'cylinderDiameter': 100, 'cylinderLength': 200,
                     'cylinderTapeLength': 200, 'cylinderAngle': 0, 'tapeWidth': 10, 'density': 144,
                     'ledModel': 'WS2812B', 'packageSize': 5.4, 'aperture': 3.545,
                     'pattern': 'rainbow', 'brightness': 40, 'renderMode': '3d', 'showLED': True,
                     'cameraYaw': -25, 'cameraPitch': 75, 'cameraZoom': 1, 'showGrid': False})
    check('Reported 100 by 200 cylinder places 28 LEDs on each full-length folded side', page.evaluate('''()=>{
      const r=DiffusionLab.getResult();return r.leds.length===56&&r.tapeLengths[0]===56&&
        Math.min(...r.leds.map(p=>p.y))===-93.75&&Math.max(...r.leds.map(p=>p.y))===93.75;
    }'''))
    page.locator('#mainCanvas').screenshot(path=str(ART / 'cylinder-full-length-3d.png'))

    def emitter_pixels(yaw, pitch, angle, shown=True):
        return page.evaluate('''({yaw,pitch,angle,shown})=>{
          const r=new Optics.Solver().solve({...DiffusionLab.getState(),pattern:'solid',color1:'#ff0000',cylinderAngle:angle});
          const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1400;
          const ctx=canvas.getContext('2d'),out=CylinderView.render(ctx,r,{width:canvas.width,height:canvas.height,yaw,pitch,showLED:shown,showGrid:false});
          const packs=out.tape.packages.filter(pack=>pack.normal.reduce((v,n,k)=>v+n*(out.camera.position[k]-pack.position[k]),0)>0);
          return packs.map(pack=>{
            const center=pack.light.reduce((v,p)=>v.map((a,k)=>a+p[k]/4),[0,0,0]),p=out.project(...center);
            // 発光点からカメラへの線が開口面を通る位置を独立に求める。
            // 側面寄りの視点では、筒壁に隠れるLEDがあるのが正しい。
            const u=(r.state.cylinderLength/2-center[1])/(out.camera.position[1]-center[1]);
            const entry=center.map((v,k)=>v+(out.camera.position[k]-v)*u);
            if(Math.hypot(entry[0],entry[2])>r.state.cylinderDiameter/2-2)return null;
            const data=ctx.getImageData(Math.floor(p.x)-1,Math.floor(p.y)-1,3,3).data;
            let red=0;for(let i=0;i<data.length;i+=4)red=Math.max(red,data[i]-Math.max(data[i+1],data[i+2]));
            return {index:pack.index,axial:pack.position[1],red};
          }).filter(Boolean);
        }''', {'yaw': yaw, 'pitch': pitch, 'angle': angle, 'shown': shown})

    for label, yaw, pitch, angle in [('reported view', -25, 75, 0), ('oblique view', -25, 55, 0),
                                     ('opposite side', 155, 75, 0), ('rotated tape', 0, 75, 90),
                                     ('near axial view', -25, 82, 0)]:
        samples = emitter_pixels(yaw, pitch, angle)
        count_correct = 0 < len(samples) < 28 if pitch == 55 else len(samples) == 28
        check('Every emitter visible through the opening survives PCB occlusion: ' + label,
              count_correct and all(sample['red'] > 45 for sample in samples))
    hidden = emitter_pixels(-25, 75, 0, shown=False)
    check('Hidden tape does not leave red emitters at their projected axis positions', all(sample['red'] <= 5 for sample in hidden))
    check('Cylinder operations produce no browser exceptions', not errors)
    check('Cylinder optics, rendering and exports require no external runtime requests', all(url.startswith(site.url) or url.startswith('blob:') or url.startswith('data:') for url in requests))
    browser.close()

(ART / 'cylinder-browser-report.json').write_text(json.dumps({'count': len(checks), 'tests': checks}, ensure_ascii=False, indent=2), encoding='utf-8')
print('TOTAL', len(checks), 'PASS')
