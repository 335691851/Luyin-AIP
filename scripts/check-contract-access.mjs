import nextEnv from "@next/env";
import postgres from "postgres";
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const db = postgres(process.env.ERP_READONLY_DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
  connect_timeout: 10,
});
// Read-only verification using the actual ERP runtime connection, never the owner.
const reads = [
  ["partner", ["id", "name"]],
  [
    "document",
    [
      "id",
      "company_id",
      "partner_id",
      "type_code",
      "status",
      "bill_date",
      "bill_no",
      "net_cents",
      "is_simulated",
    ],
  ],
  ["sales_contract", ["id", "company_id", "status", "valid_from", "valid_to"]],
  ["contract_customer", ["contract_id", "partner_id"]],
  ["contract_attachment", ["contract_id"]],
  ["document_link", ["source_id", "target_id", "relation"]],
  ["voucher", ["id", "document_id", "company_id", "status"]],
  ["voucher_line", ["voucher_id", "debit_cents", "credit_cents"]],
];
try {
  await db.begin(async (t) => {
    await t`set transaction read only`;
    await t`set local statement_timeout='12000'`;
    for (const [table, columns] of reads) {
      await t`select ${t(columns)} from ${t("public." + table)} limit 1`;
      console.log(JSON.stringify({ table, read: "passed" }));
    }
    const [coverage] =
      await t`select count(*)::int as orders, count(p.id)::int as customer_matches from public.document d left join public.partner p on p.id=d.partner_id where d.company_id=1 and d.type_code='sales_order' and d.status in ('approved','posted','closed')`;
    const [boundary] =
      await t`select count(*)::int as outside_group from public.partner p where not exists(select 1 from public.document d where d.partner_id=p.id and d.company_id=1 and d.type_code='sales_order')`;
    const [writes] =
      await t`select has_any_column_privilege(current_user,'public.partner','INSERT') as insertable,has_any_column_privilege(current_user,'public.partner','UPDATE') as updatable,has_table_privilege(current_user,'public.partner','DELETE') as deletable, has_column_privilege(current_user,'public.partner','code','SELECT') as extra_column_readable`;
    if (
      boundary.outside_group ||
      writes.insertable ||
      writes.updatable ||
      writes.deletable ||
      writes.extra_column_readable
    )
      throw Error("Restricted permission boundary failed");
    if (coverage.orders > 0 && coverage.customer_matches === 0)
      throw Error("RLS hides all group customers");
    console.log(JSON.stringify({ coverage, restrictedBoundary: "passed" }));
  });
} catch (error) {
  console.error(
    JSON.stringify({
      code: error.code || "ACCESS_CHECK_FAILED",
      message: error.message.split("\n")[0],
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
