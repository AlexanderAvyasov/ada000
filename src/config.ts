import dotenv from 'dotenv';

dotenv.config();

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const config = {
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN'),
  SUPABASE_URL: getEnv('SUPABASE_URL'),
  SUPABASE_KEY: getEnv('SUPABASE_KEY'),
  // Optional service role key for server-side operations (use only on trusted servers)
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ENCRYPTION_SECRET: getEnv('ENCRYPTION_SECRET'),
  DEFAULT_BRIEF_TIME: process.env.DEFAULT_BRIEF_TIME ?? '08:00',
  DEFAULT_MIN_STOCK_DAYS: Number(process.env.DEFAULT_MIN_STOCK_DAYS ?? '5'),
  DEFAULT_ROI_THRESHOLD: Number(process.env.DEFAULT_ROI_THRESHOLD ?? '15'),
  SCHEDULE_CHECK_INTERVAL_MINUTES: Number(process.env.SCHEDULE_CHECK_INTERVAL_MINUTES ?? '10'),
};
