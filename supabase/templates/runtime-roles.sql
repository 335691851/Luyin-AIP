-- DBA-reviewed environment template, NOT an automatic application migration.
-- Creates permission groups only; no passwords, login accounts, Auth users or business rows.
-- An administrator must separately create two restricted LOGIN roles and grant group membership.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('luyin_erp_reader','luyin_app_runtime')
    AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Runtime group name collides with an existing login or privileged role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='luyin_erp_reader') THEN
    CREATE ROLE luyin_erp_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='luyin_app_runtime') THEN
    CREATE ROLE luyin_app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO luyin_erp_reader;
GRANT SELECT ON public.company, public.document, public.document_line,
  public.material, public.material_category, public.uom TO luyin_erp_reader;
-- Public ERP tables currently have RLS. Restrict this policy to the trusted backend group.
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['company','document','document_line','material','material_category','uom'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=relation_name AND policyname='luyin_backend_read'
    ) THEN
      EXECUTE format('CREATE POLICY luyin_backend_read ON public.%I FOR SELECT TO luyin_erp_reader USING (true)',relation_name);
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA platform TO luyin_app_runtime;
GRANT SELECT ON platform.role, platform.user_profile,
  platform.membership, platform.access_audit TO luyin_app_runtime;
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['role','user_profile','membership','access_audit'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='platform' AND tablename=relation_name AND policyname='luyin_backend_read'
    ) THEN
      EXECUTE format('CREATE POLICY luyin_backend_read ON platform.%I FOR SELECT TO luyin_app_runtime USING (true)',relation_name);
    END IF;
  END LOOP;
END $$;
-- Replace login names after securely provisioning them outside this repository:
-- GRANT luyin_erp_reader TO your_erp_login;
-- GRANT luyin_app_runtime TO your_app_login;
-- Future business migrations must explicitly grant the necessary INSERT/UPDATE and RLS policies.
COMMIT;
