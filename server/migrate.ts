import { getMigrations } from 'better-auth/db/migration';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { auth, pool } from './auth';
try {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  console.log('Authentication and project migrations applied.');
} finally { await pool.end(); }
