import { openDb, run } from './db.js';
import { createApp } from './app.js';

const db = await openDb();
const app = createApp(db);

// Remove cadastros pendentes vencidos e visitantes antigos
const cleanup = async () => {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  await run(db, 'DELETE FROM users WHERE is_guest = 1 AND created_at < ?', cutoff).catch(console.error);
  const nowIso = new Date().toISOString();
  await run(db, 'DELETE FROM pending_registrations WHERE expires_at < ?', nowIso).catch(console.error);
  await run(db, 'DELETE FROM password_resets WHERE expires_at < ?', nowIso).catch(console.error);
};
await cleanup();
setInterval(cleanup, 6 * 60 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API do Controle Financeiro (${db.kind}) rodando em http://localhost:${port}`);
});
