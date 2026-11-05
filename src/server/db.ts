import "server-only";
import postgres from "postgres";
let erp: ReturnType<typeof postgres> | undefined,
  app: ReturnType<typeof postgres> | undefined;
export function erpDb() {
  const url = process.env.ERP_READONLY_DATABASE_URL;
  if (!url) throw new Error("ERP_DATABASE_NOT_CONFIGURED");
  return (erp ??= postgres(url, {
    max: 3,
    prepare: false,
    ssl: "require",
    connect_timeout: 10,
    idle_timeout: 20,
  }));
}
export function appDb() {
  const url = process.env.APP_DATABASE_URL;
  if (!url) throw new Error("APP_DATABASE_NOT_CONFIGURED");
  return (app ??= postgres(url, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 10,
    idle_timeout: 20,
  }));
}
