import { openDb, run } from './db.js';
import { createApp } from './app.js';

const db = await openDb();
const app = createApp(db);

// Remove contas de visitante com mais de 30 dias
const cleanup = () => {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  return run(db, 'DELETE FROM users WHERE is_guest = 1 AND created_at < ?', cutoff).catch(console.error);
};
await cleanup();
setInterval(cleanup, 6 * 60 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API do Controle Financeiro (${db.kind}) rodando em http://localhost:${port}`);
});
