import { betterAuth } from 'better-auth';
import pg from 'pg';

export const appURL = process.env.APP_URL ?? 'http://localhost:5173';
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) throw new Error('DATABASE_URL and BETTER_AUTH_SECRET are required');
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
export const auth = betterAuth({
  appName: 'Omer',
  baseURL: appURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins: [appURL],
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
});
