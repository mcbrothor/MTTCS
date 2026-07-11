import fs from 'node:fs/promises';
import path from 'node:path';
import { request, type FullConfig } from '@playwright/test';

export const E2E_AUTH_STATE = path.join(process.cwd(), 'playwright', '.auth', 'user.json');

const WARMUP_ROUTES = [
  '/',
  '/master-filter',
  '/macro',
  '/scanner',
  '/canslim',
  '/leader',
  '/momentum',
  '/qullamaggie',
  '/reversal',
  '/contest',
  '/watchlist',
  '/plan',
  '/portfolio',
  '/history',
  '/guide',
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use.baseURL || 'http://localhost:3000');
  const username = process.env.MTN_ADMIN_USERNAME;
  const password = process.env.MTN_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error('MTN E2E credentials are not configured.');
  }

  await fs.mkdir(path.dirname(E2E_AUTH_STATE), { recursive: true });
  const context = await request.newContext({ baseURL });
  const response = await context.post('/api/auth/login', { data: { username, password } });

  if (!response.ok()) {
    throw new Error(`MTN E2E login failed (${response.status()}).`);
  }

  for (const route of WARMUP_ROUTES) {
    const warmup = await context.get(route);
    if (!warmup.ok()) throw new Error(`MTN E2E route warmup failed: ${route} (${warmup.status()}).`);
  }

  await context.storageState({ path: E2E_AUTH_STATE });
  await context.dispose();
}
