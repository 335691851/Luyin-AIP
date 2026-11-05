import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const strict = process.argv.includes("--strict");
const sources = [
  {
    key: "ERP_READONLY_DATABASE_URL",
    name: "ERP",
    tables: [
      "public.document",
      "public.document_line",
      "public.company",
      "public.material",
      "public.material_category",
      "public.uom",
    ],
  },
  {
    key: "APP_DATABASE_URL",
    name: "平台",
    tables: [
      "platform.role",
      "platform.user_profile",
      "platform.membership",
      "platform.access_audit",
    ],
  },
];
let failed = false;
for (const source of sources) {
  const url = process.env[source.key];
  if (!url) {
    console.error(`${source.key}: 未配置`);
    failed = true;
    continue;
  }
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
  });
  try {
    const result = await sql.begin(async (tx) => {
      await tx`set transaction read only`;
      await tx`set local statement_timeout='10000'`;
      const missing = [],
        writable = [];
      for (const name of source.tables) {
        const [table] = await tx`select to_regclass(${name})::text as name`;
        if (!table.name) {
          missing.push(name);
          continue;
        }
        await tx`select 1 from ${tx(name)} limit 0`;
        if (source.name === "ERP") {
          const [permission] =
            await tx`select has_table_privilege(current_user,${name},'INSERT,UPDATE,DELETE,TRUNCATE') as writable`;
          if (permission.writable) writable.push(name);
        }
      }
      const [role] =
        await tx`select rolsuper or rolbypassrls as privileged from pg_roles where rolname=current_user`;
      let enabledUsers;
      if (source.name === "平台" && !missing.length) {
        const [count] =
          await tx`select count(*)::int as n from platform.user_profile where enabled=true`;
        enabledUsers = count.n;
      }
      return { missing, writable, privileged: !!role.privileged, enabledUsers };
    });
    const incomplete = result.missing.length > 0 || result.enabledUsers === 0;
    const unsafeRole = result.privileged || result.writable.length > 0;
    console.log(
      JSON.stringify({
        source: source.name,
        connected: true,
        ...result,
        strictPassed: !incomplete && !unsafeRole,
      }),
    );
    if (unsafeRole)
      console.warn(
        `${source.name}: 连接仍有高权限或ERP写权限；生产应改为受限运行账号。`,
      );
    if (incomplete || (strict && unsafeRole)) failed = true;
  } catch (error) {
    console.error(
      JSON.stringify({
        source: source.name,
        connected: false,
        code:
          typeof error.code === "string" ? error.code : "DATABASE_CHECK_FAILED",
      }),
    );
    failed = true;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
process.exitCode = failed ? 1 : 0;
