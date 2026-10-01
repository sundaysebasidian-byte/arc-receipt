import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['index.html','text/html']], ['/index.html', ['index.html','text/html']], ['/style.css', ['style.css','text/css']], ['/app.mjs', ['app.mjs','text/javascript']], ['/verifier.mjs', ['verifier.mjs','text/javascript']], ['/sample.mjs', ['sample.mjs','text/javascript']], ['/live-example.mjs', ['live-example.mjs','text/javascript']], ['/receipt.mjs', ['receipt.mjs','text/javascript']]]);
const port = Number(process.env.PORT || 4313);
export const server = createServer(async (req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://rpc.mainnet.arc.io; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
  if (req.method !== 'GET' || !file) { res.writeHead(404, headers); res.end('Not found'); return; }
  try { const body = await readFile(new URL(`../web/${file[0]}`, import.meta.url)); res.writeHead(200, { ...headers, 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(body); }
  catch { res.writeHead(500, headers); res.end('File unavailable'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Arc Receipt: http://127.0.0.1:${port}`));
