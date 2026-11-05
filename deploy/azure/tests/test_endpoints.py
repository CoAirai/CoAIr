import json
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from _support import ROOT, load
preflight = load('azure_preflight', ROOT / 'deploy/azure/preflight.py')

class EndpointTests(unittest.TestCase):
    def config(self, url='http://10.1.0.4:8000/api/health'):
        return {'stateful_api_replicas': 1, 'endpoints': [{'name': 'api', 'url': url, 'expected_port': 8000, 'scope': 'cross_host', 'check': 'api_health'}]}

    def test_private_cross_host_endpoint_is_valid(self):
        self.assertEqual(len(preflight.validate(self.config())), 1)

    def test_docker_alias_and_loopback_are_rejected_for_cross_host(self):
        for host in ('api', 'localhost', '127.0.0.1'):
            with self.subTest(host=host), self.assertRaises(ValueError): preflight.validate(self.config('http://' + host + ':8000/api/health'))

    def test_cross_host_dns_cannot_silently_probe_localhost(self):
        item = self.config('http://api.example.internal:8000/api/health')['endpoints'][0]
        with patch.object(preflight.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 8000))]):
            self.assertFalse(preflight.probe(item)['ok'])

    def test_wrong_port_and_replica_count_are_rejected(self):
        with self.assertRaises(ValueError): preflight.validate(self.config('http://10.1.0.4:8080/api/health'))
        config = self.config(); config['stateful_api_replicas'] = 2
        with self.assertRaises(ValueError): preflight.validate(config)

    def test_credentials_and_signed_urls_are_rejected(self):
        for url in ('http://user:secret@10.1.0.4:8000/', 'http://10.1.0.4:8000/?sig=secret'):
            with self.subTest(url=url), self.assertRaises(ValueError): preflight.validate(self.config(url))

    def test_duplicate_names_are_rejected(self):
        config = self.config(); config['endpoints'] *= 2
        with self.assertRaises(ValueError): preflight.validate(config)

    def test_health_probe_distinguishes_ready_unready_and_redirect(self):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == '/redirect':
                    self.send_response(302); self.send_header('Location', '/ready'); self.end_headers(); return
                if self.path == '/toolkit':
                    self.send_response(200); self.end_headers(); self.wfile.write(b'ok'); return
                self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
                self.wfile.write(json.dumps({'status': 'healthy' if self.path == '/ready' else 'initializing'}).encode())
            def log_message(self, *args): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            for path, expected in (('/ready', True), ('/unready', False), ('/redirect', False)):
                item = {'name': 'api', 'url': f'http://127.0.0.1:{server.server_port}{path}', 'check': 'api_health'}
                self.assertEqual(preflight.probe(item)['ok'], expected)
            for path, expected in (('/toolkit', True), ('/ready', False)):
                self.assertEqual(preflight.probe({'name': 'toolkit', 'url': f'http://127.0.0.1:{server.server_port}{path}', 'check': 'toolkit_health'})['ok'], expected)
        finally:
            server.shutdown(); server.server_close(); thread.join()


