"""Build and static deployment checks, using only Python's standard library."""
from __future__ import annotations
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build
from support import LocalSite


class HTMLInventory(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.auto_loads = []
        self.root_links = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.append(a['id'])
        if tag in ('script', 'img', 'iframe', 'audio', 'video', 'source') and a.get('src'):
            self.auto_loads.append(a['src'])
        if tag == 'link' and a.get('href') and not a['href'].startswith('data:'):
            self.auto_loads.append(a['href'])
        for attr in ('src', 'href'):
            if a.get(attr, '').startswith('/'):
                self.root_links.append(a[attr])


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = build.render_html(ROOT / 'src')

    def test_bundle_matches_sources(self):
        self.assertTrue(build.build(check=True))
        self.assertEqual((ROOT / 'dist/index.html').read_text(encoding='utf-8'), self.html)

    def test_render_is_deterministic(self):
        self.assertEqual(self.html, build.render_html(ROOT / 'src'))

    def test_all_sources_are_embedded_without_modification(self):
        for name in build.SOURCES.values():
            self.assertIn((ROOT / 'src' / name).read_text(encoding='utf-8'), self.html)
        self.assertNotRegex(self.html, build.TOKEN_PATTERN)

    def test_no_automatic_external_resources_or_root_relative_links(self):
        document = HTMLInventory()
        document.feed(self.html)
        self.assertEqual(document.auto_loads, [])
        self.assertEqual(document.root_links, [])
        self.assertEqual(len(document.ids), len(set(document.ids)))
        self.assertIn('solver-core', document.ids)
        self.assertIn('worker-source', document.ids)

    def test_payload_contains_only_allowlisted_files(self):
        expected = set(build.site_files(ROOT, self.html))
        actual = {p.relative_to(ROOT / 'dist').as_posix() for p in (ROOT / 'dist').rglob('*') if p.is_file()}
        self.assertEqual(actual, expected)
        self.assertEqual(len(expected), 7)  # HTML + .nojekyll + five JSON examples

    def test_samples_are_valid_version_one_settings(self):
        samples = list((ROOT / 'examples').glob('*.json'))
        self.assertEqual(len(samples), 5)
        for sample in samples:
            data = json.loads(sample.read_text(encoding='utf-8'))
            self.assertEqual(data['schemaVersion'], 1)
            self.assertIn('state', data)

    def test_missing_placeholder_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'src'
            shutil.copytree(ROOT / 'src', source)
            template = source / 'index.template.html'
            template.write_text(template.read_text(encoding='utf-8').replace('/*__CSS__*/', ''), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'exactly one'):
                build.render_html(source)

    def test_closing_script_in_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'src'
            shutil.copytree(ROOT / 'src', source)
            with (source / 'app.js').open('a', encoding='utf-8') as file:
                file.write('\n// </script>\n')
            with self.assertRaisesRegex(ValueError, 'Unexpected'):
                build.render_html(source)

    def test_rebuild_removes_stale_files_and_check_does_not_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copytree(ROOT / 'src', root / 'src')
            shutil.copytree(ROOT / 'examples', root / 'examples')
            self.assertFalse(build.build(root, check=True))
            self.assertFalse((root / 'index.html').exists())
            build.build(root)
            (root / 'dist/stale-secret.txt').write_text('must not publish', encoding='utf-8')
            build.build(root)
            self.assertFalse((root / 'dist/stale-secret.txt').exists())
            self.assertTrue(build.build(root, check=True))

    def test_http_root_and_repository_path_have_identical_payloads(self):
        with LocalSite(ROOT / 'dist') as site:
            expected = (ROOT / 'dist/index.html').read_bytes()
            for suffix in ('', 'index.html', 'diffusion-lab/', 'diffusion-lab/index.html'):
                with urlopen(site.url + suffix, timeout=5) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.read(), expected)

    def test_http_sample_from_repository_path(self):
        with LocalSite(ROOT / 'dist') as site:
            with urlopen(site.url + 'diffusion-lab/examples/01-thin-strip-white.json', timeout=5) as response:
                self.assertEqual(json.load(response)['schemaVersion'], 1)

    def test_development_files_are_not_in_public_payload(self):
        with LocalSite(ROOT / 'dist') as site:
            for suffix in ('src/app.js', '.github/workflows/pages.yml', 'tests/test_optics.js', '.env'):
                with self.assertRaises(HTTPError) as result:
                    urlopen(site.url + 'diffusion-lab/' + suffix, timeout=5)
                self.assertEqual(result.exception.code, 404)


if __name__ == '__main__':
    unittest.main()
