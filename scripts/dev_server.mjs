import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(root,'.'+requested);if(!file.startsWith(root)){res.writeHead(403).end('Forbidden');return}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end('Not found');return}res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)})}).listen(8766,'127.0.0.1',()=>console.log('JK Chennai preview: http://127.0.0.1:8766'));
