"""Real Chromium checks for keyboard movement and the tape rotation editor."""
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
reports = []


def check(label, condition):
    assert condition, label
    reports.append({'test': label, 'passed': True})
    print('PASS', len(reports), label, flush=True)


def wait(page):
    page.wait_for_function(
        'window.DiffusionLab && DiffusionLab.getResult() && !DiffusionLab.isBusy()',
        timeout=20000,
    )


def set_state(page, **overrides):
    scene = dict(shape='rect', width=100, height=100, layout='manual', quality=160,
                 view='layout', renderMode='2d', gamingPlaying=False, pattern='gradient',
                 manual=[[-20, 0, 0], [0, 0, 0], [20, 0, 0],
                         [-20, 28, 0], [0, 28, 0], [20, 28, 0]],
                 tapeLengths=[3, 3], packageSize=5.4, inset=4)
    scene.update(overrides)
    page.evaluate('(s)=>DiffusionLab.setState(s)', scene)
    wait(page)


def layout(page):
    return page.evaluate('Optics.tapeLayout(DiffusionLab.getState())')


def point(page, x, y):
    page.locator('#mainCanvas').scroll_into_view_if_needed()
    return page.evaluate('''([x,y])=>{
        const r=document.getElementById('mainCanvas').getBoundingClientRect();
        const s=DiffusionLab.getState();
        const scale=Math.min((r.width-120)/s.width,(r.height-108)/s.height);
        return [r.left+r.width/2+x*scale,r.top+r.height/2+3+y*scale];
    }''', [x, y])


def select(page, index=0):
    page.locator('#tapeSelect').select_option(str(index))
    page.locator('#mainCanvas').focus()


def translated(before, after, index, dx, dy):
    start = sum(before['tapeLengths'][:index])
    end = start + before['tapeLengths'][index]
    return (before['tapeLengths'] == after['tapeLengths']
            and len(before['manual']) == len(after['manual'])
            and all(abs(b[0] - a[0] - (dx if start <= i < end else 0)) < 1e-8
                    and abs(b[1] - a[1] - (dy if start <= i < end else 0)) < 1e-8
                    and b[2] == a[2]
                    for i, (a, b) in enumerate(zip(before['manual'], after['manual']))))


def rotated(before, after, index, degrees):
    start = sum(before['tapeLengths'][:index])
    end = start + before['tapeLengths'][index]
    selected = before['manual'][start:end]
    cx = sum(p[0] for p in selected) / len(selected)
    cy = sum(p[1] for p in selected) / len(selected)
    radians = math.radians(degrees)
    cosine, sine = math.cos(radians), math.sin(radians)
    if before['tapeLengths'] != after['tapeLengths'] or len(before['manual']) != len(after['manual']):
        return False
    for i, (a, b) in enumerate(zip(before['manual'], after['manual'])):
        if not start <= i < end:
            if a != b:
                return False
            continue
        x, y = a[0] - cx, a[1] - cy
        expected = [cx + x * cosine - y * sine, cy + x * sine + y * cosine, a[2] + radians]
        if any(abs(actual - value) > 1e-7 for actual, value in zip(b, expected)):
            return False
    return True


def enter_rotation(page, x=20, y=0):
    page.mouse.dblclick(*point(page, x, y), delay=70)
    page.wait_for_function("document.getElementById('mainCanvas').dataset.tapeMode==='rotate'")


def drag(page, start, end, *, shift=False, release=True):
    a, b = point(page, *start), point(page, *end)
    page.mouse.move(*a)
    if shift:
        page.keyboard.down('Shift')
    page.mouse.down()
    page.mouse.move(*b)
    if release:
        page.mouse.up()
    if shift:
        page.keyboard.up('Shift')
    if release:
        wait(page)


options = {'headless': True, 'args': ['--disable-dev-shm-usage']}
if os.environ.get('CHROMIUM_PATH'):
    options['executable_path'] = os.environ['CHROMIUM_PATH']
errors, requests = [], []
with LocalSite(ROOT / 'dist') as server, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**options)
    browser_version = browser.version
    page = browser.new_page(viewport={'width': 1536, 'height': 1100}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    response = page.goto(server.url + 'diffusion-lab/', wait_until='load')
    assert response and response.status == 200
    wait(page)
    set_state(page)
    canvas = page.locator('#mainCanvas')
    canvas.focus()
    check('Layout canvas accepts keyboard focus', canvas.get_attribute('tabindex') == '0'
          and page.evaluate("document.activeElement.id==='mainCanvas'"))
    before = layout(page)
    page.keyboard.press('ArrowRight')
    check('Arrow keys without a selected tape leave the layout unchanged', layout(page) == before)

    select(page)
    for key, dx, dy in [('ArrowLeft', -1, 0), ('ArrowRight', 1, 0),
                        ('ArrowUp', 0, -1), ('ArrowDown', 0, 1)]:
        before = layout(page)
        page.keyboard.press(key)
        wait(page)
        check(key + ' moves the whole selected tape by 1 mm', translated(before, layout(page), 0, dx, dy))
    for key, dx, dy in [('Shift+ArrowRight', 10, 0), ('Control+ArrowUp', 0, -0.1)]:
        before = layout(page)
        page.keyboard.press(key)
        wait(page)
        check(key + ' changes the movement step and preserves tape geometry', translated(before, layout(page), 0, dx, dy))

    before = layout(page)
    coordinate = page.locator('#tapeX')
    coordinate.focus()
    value = float(coordinate.input_value())
    coordinate.press('ArrowUp')
    check('Number input keeps native arrow editing without moving a tape', layout(page) == before
          and abs(float(coordinate.input_value()) - value - 0.1) < 1e-8)
    page.locator('#tapeSelect').focus()
    page.keyboard.press('ArrowDown')
    check('Select keyboard navigation does not move a tape', layout(page) == before)
    select(page)
    for tag in ['textarea', 'contenteditable']:
        page.evaluate('''(kind)=>{
            const el=document.createElement(kind==='textarea'?'textarea':'div');
            el.id='keyboardGuardProbe';
            if(kind==='contenteditable')el.contentEditable='true';
            el.textContent='入力の矢印操作';document.body.appendChild(el);el.focus();
        }''', tag)
        page.keyboard.press('ArrowRight')
        check(tag + ' cursor navigation does not move a tape', layout(page) == before)
        page.locator('#keyboardGuardProbe').evaluate('(el)=>el.remove()')
    canvas.focus()
    page.locator('#modelBtn').click()
    page.keyboard.press('ArrowLeft')
    check('Open modal blocks tape keyboard movement', page.locator('#modelModal').is_visible()
          and layout(page) == before)
    page.locator('#closeModal').click()
    page.locator('[data-view="appearance"]').click()
    page.locator('[data-key="renderMode"]').select_option('3d')
    canvas.focus()
    page.keyboard.press('ArrowRight')
    check('3D appearance does not consume layout movement keys', layout(page) == before)

    set_state(page, manual=[[45, 0, 0], [47, 0, 0], [-20, 28, 0], [20, 28, 0]], tapeLengths=[2, 2])
    select(page)
    before = layout(page)
    page.keyboard.press('ArrowRight')
    check('Keyboard movement outside the board is rejected atomically', layout(page) == before
          and page.locator('#tapePositionStatus').evaluate("el=>el.classList.contains('invalid')"))
    svg = [{'fillRule': 'evenodd', 'contours': [
        [[0, 0], [100, 0], [100, 100], [0, 100]],
        [[40, 40], [60, 40], [60, 60], [40, 60]],
    ]}]
    set_state(page, shape='svg', svgShapes=svg,
              manual=[[-30, 0, 0], [-13.3, 0, 0], [20, 28, 0], [30, 28, 0]], tapeLengths=[2, 2])
    select(page)
    before = layout(page)
    page.keyboard.press('ArrowRight')
    check('SVG hole boundary also rejects the complete keyboard move', layout(page) == before
          and page.locator('#tapePositionStatus').evaluate("el=>el.classList.contains('invalid')"))

    set_state(page)
    before = layout(page)
    enter_rotation(page)
    check('Double click selects rotation mode without changing the layout', layout(page) == before
          and page.locator('#tapeRotationMode').is_visible()
          and page.locator('#tapeSelect').input_value() == '0')
    drag(page, (20, 0), (0, 20), release=False)
    check('Rotation preview leaves committed geometry unchanged', layout(page) == before)
    page.mouse.up()
    wait(page)
    check('Rotation drag turns the whole tape 90 degrees around its centroid', rotated(before, layout(page), 0, 90))
    check('Rotation mode remains active after committing a turn', canvas.get_attribute('data-tape-mode') == 'rotate'
          and page.locator('#tapeRotationMode').is_visible())

    before = layout(page)
    drag(page, (0, 20), (-20, 0), release=False)
    page.keyboard.press('Escape')
    page.mouse.up()
    wait(page)
    check('Escape rolls back an in-progress rotation', layout(page) == before)
    page.evaluate("document.getElementById('mainCanvas').addEventListener('pointerdown',e=>window.__testPointer=e.pointerId,{once:true})")
    drag(page, (0, 20), (-20, 0), release=False)
    canvas.dispatch_event('pointercancel', {'pointerId': page.evaluate('window.__testPointer'), 'isPrimary': True})
    page.mouse.up()
    wait(page)
    check('Pointer cancellation also rolls back rotation', layout(page) == before)

    set_state(page)
    before = layout(page)
    enter_rotation(page)
    angle = math.radians(22.4)
    drag(page, (20, 0), (20 * math.cos(angle), 20 * math.sin(angle)))
    check('Rotation drag snaps to whole degrees', rotated(before, layout(page), 0, 22))
    set_state(page)
    before = layout(page)
    enter_rotation(page)
    angle = math.radians(22)
    drag(page, (20, 0), (20 * math.cos(angle), 20 * math.sin(angle)), shift=True)
    check('Shift rotation snaps to 15 degree increments', rotated(before, layout(page), 0, 15))

    set_state(page, height=40,
              manual=[[-35, 0, 0], [0, 0, 0], [35, 0, 0], [-20, 14, 0], [20, 14, 0]], tapeLengths=[3, 2])
    before = layout(page)
    enter_rotation(page, 35, 0)
    angle = math.radians(20)
    drag(page, (35, 0), (35 * math.cos(angle), 35 * math.sin(angle)), release=False)
    page.mouse.move(*point(page, 0, 35))
    page.mouse.up()
    wait(page)
    check('An out-of-board turn commits the last valid preview', rotated(before, layout(page), 0, 20))

    set_state(page)
    before = layout(page)
    enter_rotation(page, 10, 0)
    check('Double clicking a connecting segment also enters rotation mode', canvas.get_attribute('data-tape-mode') == 'rotate'
          and layout(page) == before)
    page.locator('#tapeMoveModeBtn').click()
    check('Move mode button restores translation mode', canvas.get_attribute('data-tape-mode') == 'move'
          and page.locator('#tapeRotationMode').is_hidden())
    drag(page, (20, 0), (23, 4))
    check('Dragging after exiting rotation translates the connected tape', translated(before, layout(page), 0, 3, 4))
    page.screenshot(path=str(ARTIFACTS / 'preview-tape-keyboard-editor.png'), full_page=True)
    enter_rotation(page, 23, 4)
    page.screenshot(path=str(ARTIFACTS / 'preview-tape-rotation-editor.png'), full_page=True)

    root_page = browser.new_page(viewport={'width': 1536, 'height': 1100})
    root_page.on('pageerror', lambda error: errors.append(str(error)))
    response = root_page.goto(server.url, wait_until='load')
    assert response and response.status == 200
    wait(root_page)
    set_state(root_page)
    select(root_page)
    before = layout(root_page)
    root_page.keyboard.press('ArrowDown')
    wait(root_page)
    check('Keyboard editing also works at the root-site deployment URL', translated(before, layout(root_page), 0, 0, 1))
    check('Interaction tests produce no JavaScript runtime errors', not errors)
    check('Interaction tests do not fetch external assets', all(url.startswith(server.url) or url.startswith('blob:')
          or url.startswith('data:') for url in requests))
    browser.close()

(ARTIFACTS / 'interaction-test-results.json').write_text(
    json.dumps({'tests': reports, 'runtime_errors': errors, 'network_requests': requests,
                'mode': 'HTTP, project path + root path', 'browser_version': browser_version},
               ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(reports)}/{len(reports)} interaction checks passed. Runtime errors: {errors}')
