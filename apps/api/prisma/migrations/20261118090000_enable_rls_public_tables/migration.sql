-- The API and the reminder worker connect as the table owner (Supabase
-- `postgres`), which RLS does not restrict. The Supabase Data API (PostgREST)
-- connects as `anon` / `authenticated`: with RLS on and no policy, those roles
-- see no rows, so the tables are no longer readable or writable with the
-- project's anon key. Mindoist never calls the Data API.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Supabase grants every new object in `public` to `anon` and `authenticated`.
-- Remove those grants as well, now and for tables later migrations create.
-- Plain PostgreSQL (local dev, CI) has no such roles, so this is skipped there.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;
