const http = require('http');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');

const DIST_DIR = '/opt/kathi-credentials';
const PORT = 3001;
const API_TARGET = 'http://localhost:8124';

// Create proxy
const proxy = httpProxy.createProxyServer({
  target: API_TARGET,
  changeOrigin: true,
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error');
  }
});

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // API proxy
  if (url.startsWith('/api/') || url === '/api' || url.startsWith('/health')) {
    // Rewrite /api/xxx -> /xxx for backend
    const targetPath = url.replace(/^\/api\//, '/').replace(/^\/api$/, '/');
    const options = {
      target: API_TARGET,
      changeOrigin: true,
      pathRewrite: url.startsWith('/api') ? { ['^' + url.replace(/\\/api.+$/, '/api')]: '' } : {},
    };

    // Special handling for /health (no rewrite needed)
    if (url === '/health') {
      options.pathRewrite = {};
    }

    proxy.web(req, res, options, (err) => {
      console.error('Proxy error:', err);
    });
    return;
  }

  // Static files
  let filePath = path.join(DIST_DIR, url === '/' ? '/index.html' : url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback - serve index.html for any missing file
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(indexPath, (idxErr, idxData) => {
        if (idxErr) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(idxData);
      });
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});