#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 3001
DIRECTORY = "/opt/kathi-credentials"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # Proxy /api/* and /health to backend
        if self.path.startswith('/api/') or self.path == '/api' or self.path.startswith('/health'):
            from urllib.parse import urlparse
            import http.client

            # Rewrite path
            path = self.path.replace('/api/', '/').replace('/api', '/')

            conn = http.client.HTTPConnection('localhost', 8124, timeout=5)
            headers = {k: v for k, v in self.headers.items()}
            if 'Host' in headers:
                del headers['Host']
            if 'Connection' in headers:
                del headers['Connection']

            try:
                conn.request('GET', path, headers=headers)
                resp = conn.getresponse()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.getheader('Content-Type', 'application/json'))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp.read())
            except Exception as e:
                self.send_response(502)
                self.end_headers()
                self.wfile.write(f'Proxy error: {e}'.encode())
            finally:
                conn.close()
            return

        # Static files - serve from directory
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            # SPA fallback: serve index.html for directory requests
            index_path = os.path.join(self.directory, 'index.html')
            if os.path.exists(index_path):
                with open(index_path, 'rb') as f:
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html')
                    self.end_headers()
                    self.wfile.write(f.read())
                return

        return super().do_GET()

    def do_POST(self):
        self._proxy_request('POST')

    def do_DELETE(self):
        self._proxy_request('DELETE')

    def do_PUT(self):
        self._proxy_request('PUT')

    def _proxy_request(self, method: str):
        from urllib.parse import urlparse
        import http.client

        path = self.path.replace('/api/', '/').replace('/api', '/')

        content_length = int(self.headers.get('Content-Length', 0)) if method != 'GET' else 0
        body = self.rfile.read(content_length) if content_length > 0 else b''

        conn = http.client.HTTPConnection('localhost', 8124, timeout=5)
        headers = {k: v for k, v in self.headers.items()}
        if 'Host' in headers:
            del headers['Host']
        if 'Content-Length' not in headers:
            headers['Content-Length'] = str(content_length) if content_length > 0 else '0'

        try:
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()
            self.send_response(resp.status)
            self.send_header('Content-Type', resp.getheader('Content-Type', 'application/json'))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(resp.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f'Proxy error: {e}'.encode())
        finally:
            conn.close()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
    print(f'Serving on http://0.0.0.0:{PORT}')
    httpd.serve_forever()