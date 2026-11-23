import { openDb, run } from './db.js';
import { createApp } from './app.js';

const db = openDb();
const app = createApp(db);

// Remove contas de visitante com mais de 30 dias
const cleanup = () => run(db, "DELETE FROM users WHERE is_guest = 1 AND created_at < datetime('now','-30 days')");
cleanup();
setInterval(cleanup, 6 * 60 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API do Controle Financeiro rodando em http://localhost:${port}`);
});
