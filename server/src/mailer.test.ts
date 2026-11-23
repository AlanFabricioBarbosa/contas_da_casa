import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { sendVerificationMail } from './mailer.js';

test('sendVerificationMail envia via MAIL_WEBHOOK_URL (inclusive com redirect 302 do Apps Script)', async () => {
  let received: Record<string, unknown> | null = null;
  const srv = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/exec') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        received = JSON.parse(raw);
        res.writeHead(302, { Location: '/result' });
        res.end();
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/result') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  process.env.MAIL_WEBHOOK_URL = `http://127.0.0.1:${port}/exec`;
  process.env.MAIL_WEBHOOK_SECRET = 'segredo-teste';

  try {
    await sendVerificationMail({ to: 'ana@teste.com', name: 'Ana', code: '654321' });
    assert.ok(received);
    assert.equal((received as { secret: string }).secret, 'segredo-teste');
    assert.equal((received as { to: string }).to, 'ana@teste.com');
    assert.match((received as { subject: string }).subject, /654321/);
  } finally {
    delete process.env.MAIL_WEBHOOK_URL;
    delete process.env.MAIL_WEBHOOK_SECRET;
    srv.close();
  }
});
