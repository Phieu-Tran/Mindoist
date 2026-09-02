import postgres from 'npm:postgres@3.4.7';

const connectionString = Deno.env.get('SUPABASE_DB_URL') ?? Deno.env.get('DATABASE_URL');

if (!connectionString) {
  throw new Error('SUPABASE_DB_URL is required for the Edge database adapter');
}

// Supabase Edge Functions must use a small pool and disable prepared
// statements when connecting through the transaction pooler (port 6543 in
// hosted projects). This also keeps the SF0 local runtime representative.
export const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 5,
});
