// A dependency-free local preview server. Run: node server.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.PORT) || 4173;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); return response.end('Bad request'); }
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); return response.end('Forbidden'); }
  fs.readFile(target, (error, data) => {
    if (error) { response.writeHead(404); return response.end('Not found'); }
    response.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    response.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Little Rush is ready at http://127.0.0.1:${port}`));
