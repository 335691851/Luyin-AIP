import nextEnv from "@next/env";
import { validateDeploymentEnv } from "./lib/deployment-env.mjs";
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const result = validateDeploymentEnv(process.env, {
  production: process.argv.includes("--production"),
});
for (const warning of result.warnings) console.warn(`提示：${warning}`);
for (const error of result.errors) console.error(`配置错误：${error}`);
if (result.errors.length) process.exitCode = 1;
else console.log("环境变量格式检查通过（不代表数据库/模型已连通）。");
