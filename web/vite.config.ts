import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function git(cmd: string): string {
  return execSync(cmd, { cwd: import.meta.dirname, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

function resolveAppVersion(): string {
  const pkgPath = path.resolve(import.meta.dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
  const [maj = '1', min = '0', pkgPatch = '0'] = (pkg.version ?? '1.0.0').split('.');
  let patch = Number(pkgPatch) || 0;
  let sha = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? '';

  try {
    if (!sha) sha = git('git rev-parse --short HEAD');
    if (git('git rev-parse --is-shallow-repository') === 'false') {
      const count = Number(git('git rev-list --count HEAD'));
      if (Number.isFinite(count) && count > patch) patch = count;
    }
  } catch {
    /* sem git disponível */
  }

  const ver = `v${maj}.${min}.${patch}`;
  return sha ? `${ver} (${sha})` : ver;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
