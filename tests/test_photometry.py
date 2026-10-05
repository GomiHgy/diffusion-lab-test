"""Chromium regression checks for datasheet RGB intensity and estimated LED flux."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from support import LocalSite
import csv
import io
import json
import math
import os

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
if not (ROOT / 'dist' / 'index.html').is_file():
    raise SystemExit('Run python build.py before browser tests.')
PRESETS = {
    'WS2812B': [400, 1150, 250],
    'WS2812B-MINI': [310, 780, 215],
    'WS2812C-2020': [80, 270, 70],
    'SK6812': [397.5, 1045, 240],
    'SK6812-MINI': [397.5, 1045, 292.5],
}
MCD_KEYS = ['mcdR', 'mcdG', 'mcdB']
reports, errors, requests = [], [], []


def check(label, condition):
    assert condition, label
    reports.append({'test': label, 'passed': True})
    print('PASS', len(reports), label, flush=True)


def wait(page):
    page.wait_for_function(
        'window.DiffusionLab && DiffusionLab.getResult() && !DiffusionLab.isBusy()',
        timeout=30000,
    )


def get(page):
    return page.evaluate('DiffusionLab.getState()')


def scene(**overrides):
    value = dict(shape='rect', width=160, height=72, layout='manual', quality=160,
                 view='appearance', renderMode='2d', gamingPlaying=False,
                 manual=[[-25, 0, 0], [0, 0, 0], [25, 0, 0]], tapeLengths=[3],
                 ledModel='custom', packageSize=5.4, aperture=1, angle=120,
                 mcdR=100, mcdG=100, mcdB=100, brightness=37, exposure=1.3,
                 pattern='solid', color1='#ffffff', pwmMode='raw', splitRGB=False,
                 gap=10, transmission=45, diffuse=100, argb='#FFFFFFFF',
                 thickness=3, spread=.65, showLED=True)
    value.update(overrides)
    return value


def set_state(page, **overrides):
    page.evaluate('(s)=>DiffusionLab.setState(s)', scene(**overrides))
    wait(page)


def intensities(state):
    return [state[key] for key in MCD_KEYS]


def sums(page):
    return page.evaluate('DiffusionLab.getResult().fields.map(f=>f.reduce((a,b)=>a+b,0))')


def near(a, b, tolerance=5e-5):
    return math.isclose(a, b, rel_tol=tolerance, abs_tol=1e-8)


def set_number(page, key, value):
    control = page.locator('[data-key="' + key + '"][type="number"]')
    control.fill(str(value))
    control.blur()
    wait(page)


def show_optical_controls(page):
    detail = page.locator('details').filter(has=page.locator('[data-key="mcdR"]'))
    if detail.get_attribute('open') is None:
        detail.locator('summary').click()


def show_source(page):
    detail = page.locator('details').filter(has=page.locator('#ledSpecDetails'))
    if detail.get_attribute('open') is None:
        detail.locator('summary').click()


def flux_expected(mcd, angle, weights):
    power = -math.log(2) / math.log(math.cos(math.radians(angle / 2)))
    return [2 * math.pi * intensity / 1000 * weight / (power + 1)
            for intensity, weight in zip(mcd, weights)]


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
    check('Fresh browser defaults use the WS2812B datasheet midpoint', intensities(get(page)) == PRESETS['WS2812B'])

    set_state(page)
    reference = sums(page)
    geometry = get(page)['manual']
    for model, expected in PRESETS.items():
        page.locator('[data-key="ledModel"]').select_option(model)
        wait(page)
        state = get(page)
        worker_state = page.evaluate('DiffusionLab.getResult().state')
        check('Model selection applies RGB mcd to both controls and worker: ' + model,
              intensities(state) == expected and intensities(worker_state) == expected
              and all(float(page.locator('[data-key="' + key + '"]').input_value()) == value
                      for key, value in zip(MCD_KEYS, expected)))
        check('Model selection preserves output, exposure and connected positions: ' + model,
              state['brightness'] == 37 and state['exposure'] == 1.3
              and state['manual'] == geometry and state['tapeLengths'] == [3])
        expected_basis = '資料のTyp値' if model in ['WS2812B-MINI', 'WS2812C-2020'] else '記載範囲の中点'
        check('UI identifies the adopted intensity basis: ' + model,
              page.evaluate('Optics.ledDescription(DiffusionLab.getState()).intensityBasis') == expected_basis
              and expected_basis in page.locator('#ledPhotometrySummary').inner_text())
        show_source(page)
        details = page.locator('#ledSpecDetails').inner_text()
        check('Source panel includes RGB photometry and measurement conditions: ' + model,
              'mcd' in details and all(word in details for word in ['電流', '電圧', '温度', 'PWM'])
              and page.evaluate('(id)=>Optics.profileIntensity(Optics.ledProfiles[id])', model) == expected)
        # Unify optical geometry; package presets otherwise change the source aperture.
        set_number(page, 'aperture', 1)
        output = sums(page)
        check('Worker RGB luminance scales with the selected source intensity: ' + model,
              all(near(value / base, intensity / 100) for value, base, intensity in zip(output, reference, expected))
              and page.evaluate('DiffusionLab.getResult().stats.mean>0'))
        flux = page.evaluate('Optics.luminousFlux(DiffusionLab.getState())')
        expected_flux = flux_expected(expected, 120, [.37, .37, .37])
        check('Estimated RGB white flux applies output once: ' + model,
              all(near(a, b, 1e-9) for a, b in zip(flux['channels'], expected_flux))
              and near(flux['total'], sum(expected_flux), 1e-9))

    custom_rgb = [.1, .2, .3]
    expected_flux = flux_expected(PRESETS['SK6812-MINI'], 120, custom_rgb)
    flux = page.evaluate('(rgb)=>Optics.luminousFlux(DiffusionLab.getState(),rgb)', custom_rgb)
    check('Explicit RGB weights are already output-scaled and are not dimmed twice',
          all(near(a, b, 1e-9) for a, b in zip(flux['channels'], expected_flux)))
    white_summary = page.locator('#ledFluxSummary').inner_text()
    page.locator('[data-key="color1"]').evaluate('''(el)=>{
        el.value='#ff0000';el.dispatchEvent(new Event('input',{bubbles:true}));
    }''')
    wait(page)
    check('White reference flux is identified as one LED and not the current scene total',
          page.locator('#ledFluxSummary').inner_text() == white_summary
          and '白' in white_summary and '1個' in white_summary
          and page.evaluate('DiffusionLab.getResult().fields[1].every(x=>x===0)&&DiffusionLab.getResult().fields[2].every(x=>x===0)'))

    set_state(page, ledModel='SK6812', mcdR=397.5, mcdG=1045, mcdB=240, brightness=70)
    sum70 = sums(page)
    flux70 = page.evaluate('Optics.luminousFlux(DiffusionLab.getState()).total')
    set_number(page, 'brightness', 85)
    check('SK three-channel limitation is shown without silently reducing source intensity',
          get(page)['brightness'] == 85 and intensities(get(page)) == PRESETS['SK6812']
          and all(near(a / b, 85 / 70) for a, b in zip(sums(page), sum70))
          and near(page.evaluate('Optics.luminousFlux(DiffusionLab.getState()).total') / flux70, 85 / 70))
    check('SK source panel explains the 70 percent recommendation', '70' in page.locator('#ledSpecDetails').inner_text())

    show_optical_controls(page)
    for key, value in zip(MCD_KEYS, [123, 456, 78]):
        set_number(page, key, value)
    check('Manual mcd entries reach the worker and are identified as overrides',
          intensities(get(page)) == [123, 456, 78]
          and page.evaluate('Optics.ledDescription(DiffusionLab.getState()).intensityBasis') == '手動上書き'
          and '手動上書き' in page.locator('#ledPhotometrySummary').inner_text())
    page.locator('#ledPresetBtn').click()
    wait(page)
    check('Restore preset resets photometry while preserving output and exposure',
          intensities(get(page)) == PRESETS['SK6812']
          and get(page)['brightness'] == 85 and get(page)['exposure'] == 1.3)
    page.locator('[data-key="ledModel"]').select_option('custom')
    wait(page)
    check('Switching to custom preserves the current source values',
          intensities(get(page)) == PRESETS['SK6812'] and page.locator('#ledPresetBtn').is_hidden()
          and page.evaluate('Optics.ledDescription(DiffusionLab.getState()).intensityBasis') == '手動・旧設定')
    for key, value in zip(MCD_KEYS, [111, 222, 333]):
        set_number(page, key, value)
    saved_state = get(page)
    with page.expect_download() as event:
        page.locator('#saveBtn').click()
    settings_path = ARTIFACTS / 'photometry-settings.json'
    event.value.save_as(str(settings_path))
    check('Settings export includes exact custom RGB source values',
          json.loads(settings_path.read_text(encoding='utf-8'))['state'] == saved_state)
    page.locator('[data-key="ledModel"]').select_option('WS2812C-2020')
    wait(page)
    page.locator('#fileInput').set_input_files(str(settings_path))
    wait(page)
    check('Settings import preserves custom photometry and display conditions', get(page) == saved_state)

    with page.expect_download() as event:
        page.locator('#csvBtn').click()
    csv_path = ARTIFACTS / 'photometry-grid.csv'
    event.value.save_as(str(csv_path))
    rows = list(csv.DictReader(io.StringIO(csv_path.read_text(encoding='utf-8-sig'))))
    exported = [sum(float(row[key]) for row in rows) for key in ['R_cd_m2', 'G_cd_m2', 'B_cd_m2']]
    check('CSV exports the same RGB luminance calculated by the worker',
          len(rows) > 100 and all(near(a, b, 1e-7) for a, b in zip(exported, sums(page))))
    page.locator('[data-key="renderMode"]').select_option('3d')
    wait(page)
    before = sums(page)
    with page.expect_download() as event:
        page.locator('#pngBtn').click()
    png_path = ARTIFACTS / 'photometry-3d-preview.png'
    event.value.save_as(str(png_path))
    check('3D PNG export retains the same calibrated source values',
          png_path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
          and get(page)['renderMode'] == '3d' and intensities(get(page)) == [111, 222, 333]
          and sums(page) == before)
    page.locator('#ledPhotometrySummary').scroll_into_view_if_needed()
    page.screenshot(path=str(ARTIFACTS / 'preview-datasheet-photometry-3d.png'), full_page=True)

    legacy = scene(ledModel='WS2812B', mcdR=213, mcdG=715, mcdB=72, brightness=20)
    page.locator('#fileInput').set_input_files({
        'name': 'legacy-photometry.json', 'mimeType': 'application/json',
        'buffer': json.dumps({'schemaVersion': 1, 'state': legacy}).encode('utf-8'),
    })
    wait(page)
    check('Legacy JSON with a real model preserves explicitly saved RGB intensity',
          get(page)['ledModel'] == 'WS2812B' and intensities(get(page)) == [213, 715, 72]
          and page.evaluate('Optics.ledDescription(DiffusionLab.getState()).intensityBasis') == '手動上書き')
    page.reload(wait_until='load')
    wait(page)
    check('Reload preserves old photometry instead of overwriting it with new presets', intensities(get(page)) == [213, 715, 72])
    legacy_page = browser.new_page()
    legacy_page.on('pageerror', lambda error: errors.append(str(error)))
    stored = scene(ledModel='SK6812-MINI', mcdR=11, mcdG=22, mcdB=33)
    legacy_page.add_init_script('localStorage.setItem("diffusion-lab-v1",' + json.dumps(json.dumps(stored)) + ');')
    legacy_page.goto(server.url, wait_until='load')
    wait(legacy_page)
    check('Root-site localStorage keeps explicit manual RGB values from older settings',
          intensities(get(legacy_page)) == [11, 22, 33] and get(legacy_page)['ledModel'] == 'SK6812-MINI')

    set_state(page, pattern='gaming', gamingScene='cyberPulse', gamingPlaying=True)
    page.wait_for_function('DiffusionLab.getGaming().frames===24&&!DiffusionLab.getGaming().preparing', timeout=30000)
    page.wait_for_function('DiffusionLab.getResult().state.pattern==="gaming"&&DiffusionLab.getResult().state.gamingScene==="cyberPulse"')
    blue_reference = sums(page)[2]
    page.locator('[data-key="ledModel"]').select_option('WS2812B')
    check('Changing LED type invalidates cached gaming lighting frames',
          intensities(get(page)) == PRESETS['WS2812B']
          and page.evaluate('DiffusionLab.getGaming().preparing || DiffusionLab.getGaming().frames<24'))
    set_number(page, 'aperture', 1)
    page.wait_for_function('DiffusionLab.getGaming().frames===24&&!DiffusionLab.getGaming().preparing')
    page.wait_for_function('DiffusionLab.getResult().state.ledModel==="WS2812B"&&DiffusionLab.getResult().state.aperture===1')
    check('Rebuilt gaming output uses the selected RGB photometry',
          near(sums(page)[2] / blue_reference, 2.5)
          and get(page)['gamingPlaying'] and get(page)['brightness'] == 37 and get(page)['exposure'] == 1.3)
    page.locator('#gamingPlayBtn').click()
    wait(page)
    check('Stopping rebuilt gaming output retains the adopted source values',
          not get(page)['gamingPlaying'] and intensities(get(page)) == PRESETS['WS2812B']
          and page.evaluate('DiffusionLab.getResult().state.mcdB===250'))
    page.locator('[data-key="renderMode"]').select_option('3d')
    wait(page)
    check('Switching 2D and 3D does not auto-compensate exposure', get(page)['exposure'] == 1.3)
    page.locator('#ledPhotometrySummary').scroll_into_view_if_needed()
    page.screenshot(path=str(ARTIFACTS / 'preview-datasheet-gaming-photometry.png'), full_page=True)

    mobile = browser.new_page(viewport={'width': 390, 'height': 1000}, is_mobile=True, has_touch=True)
    mobile.on('pageerror', lambda error: errors.append(str(error)))
    mobile.goto(server.url + 'diffusion-lab/', wait_until='load')
    wait(mobile)
    mobile.locator('#mobileToggle').click()
    mobile.locator('#ledPhotometrySummary').scroll_into_view_if_needed()
    check('Photometry and flux summaries fit a mobile viewport',
          mobile.locator('#ledPhotometrySummary').is_visible() and mobile.locator('#ledFluxSummary').is_visible()
          and mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    mobile.screenshot(path=str(ARTIFACTS / 'preview-datasheet-photometry-mobile.png'), full_page=True)
    check('Photometry tests produce no JavaScript runtime errors', not errors)
    check('Photometry tests do not fetch external assets', all(url.startswith(server.url) or url.startswith('blob:')
          or url.startswith('data:') for url in requests))
    browser.close()

(ARTIFACTS / 'photometry-test-results.json').write_text(
    json.dumps({'tests': reports, 'runtime_errors': errors, 'network_requests': requests,
                'mode': 'HTTP, project path + root path', 'browser_version': browser_version},
               ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(reports)}/{len(reports)} photometry checks passed. Runtime errors: {errors}')
