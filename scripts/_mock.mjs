import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http'; import { createReadStream } from 'node:fs'; import { join } from 'node:path';
const D = process.argv[2];
const srv = createServer((q, r) => { const f = join(D, q.url === '/' ? 'index.html' : q.url); r.setHeader('Content-Type', f.endsWith('.html') ? 'text/html' : 'image/webp'); createReadStream(f).on('error', () => r.end()).pipe(r); }).listen(0);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.setViewport({ width: 700, height: 260, deviceScaleFactor: 2 });
await p.goto(`http://localhost:${srv.address().port}/`, { waitUntil: 'networkidle0' });
await p.screenshot({ path: join(D, 'mock.png') }); await b.close(); srv.close();
