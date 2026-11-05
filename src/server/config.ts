import "server-only";
import { sampleModeAllowed } from "@/lib/runtime-mode";
export function demoMode() {
  return sampleModeAllowed(process.env);
}
export function integrationStatus() {
  return [
    {
      name: "ERP数据库",
      ready: !!process.env.ERP_READONLY_DATABASE_URL,
      note: "Postgres只读连接",
    },
    {
      name: "平台数据库",
      ready: !!process.env.APP_DATABASE_URL,
      note: "platform schema及写入角色",
    },
    {
      name: "Supabase身份",
      ready: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      note: "登录与法人授权",
    },
    {
      name: "DeepSeek Flash",
      ready: !!process.env.DEEPSEEK_API_KEY,
      note: "服务端密钥",
    },
    {
      name: "OntoRAG",
      ready: !!(
        process.env.ONTORAG_BASE_URL && process.env.ONTORAG_SERVICE_API_KEY
      ),
      note: "API地址与Bearer密钥",
    },
  ];
}
