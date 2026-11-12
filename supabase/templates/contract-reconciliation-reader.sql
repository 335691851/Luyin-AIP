-- Target: the existing ERP database and its restricted backend LOGIN role.
-- Run by the table owner/DBA. No ERP rows, passwords or Auth users are changed.
-- The pooler suffix (.project_ref) is NOT part of the Postgres role name.
BEGIN;
SET LOCAL lock_timeout = '5s';

GRANT SELECT (id, name) ON public.partner TO erp_aip_runtime;

-- Keep RLS enabled. Only customers referenced by the group's sales orders
-- are needed by /api/contracts/risk; do not expose all partner columns/rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'partner' AND policyname = 'aip_group_contract_customer_read'
  ) THEN
    CREATE POLICY aip_group_contract_customer_read ON public.partner
      FOR SELECT TO erp_aip_runtime
      USING (EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.partner_id = partner.id AND d.company_id = 1
          AND d.type_code = 'sales_order'
      ));
  END IF;
END $$;
COMMIT;
