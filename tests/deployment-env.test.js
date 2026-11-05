import { describe, it, expect } from "vitest";
import { validateDeploymentEnv } from "../scripts/lib/deployment-env.mjs";

const valid = () => ({
  APP_DEMO_MODE: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://exampleproject.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture",
  ERP_READONLY_DATABASE_URL:
    "postgresql://reader.exampleproject:private_canary@aws-0-us-east-2.pooler.supabase.com:6543/postgres",
  APP_DATABASE_URL:
    "postgresql://app.exampleproject:private_canary@aws-0-us-east-2.pooler.supabase.com:6543/postgres",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "deepseek-flash",
  DEEPSEEK_API_KEY: "private_canary",
  ONTORAG_BASE_URL: "https://knowledge.example.org",
  ONTORAG_SERVICE_API_KEY: "private_canary",
});

describe("production environment boundaries", () => {
  it("accepts the supported serverless connection shape", () => {
    expect(validateDeploymentEnv(valid(), { production: true })).toEqual({
      errors: [],
      warnings: [],
    });
  });
  it("blocks missing variables and cloud sample mode", () => {
    const env = valid();
    delete env.DEEPSEEK_API_KEY;
    env.APP_DEMO_MODE = "true";
    const result = validateDeploymentEnv(env, { production: true });
    expect(result.errors.some((e) => e.startsWith("DEEPSEEK_API_KEY:"))).toBe(
      true,
    );
    expect(result.errors.some((e) => e.startsWith("APP_DEMO_MODE:"))).toBe(
      true,
    );
  });
  it("rejects secret keys in browser variables without printing values", () => {
    const env = { ...valid(), NEXT_PUBLIC_DEEPSEEK_API_KEY: "private_canary" };
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_private_canary";
    const result = validateDeploymentEnv(env, { production: true });
    expect(result.errors).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("private_canary");
  });
  it("rejects localhost connections and local proxy settings on Vercel", () => {
    const env = {
      ...valid(),
      VERCEL: "1",
      HTTPS_PROXY: "http://127.0.0.1:7890",
    };
    env.APP_DATABASE_URL =
      "postgresql://app:private_canary@localhost:5432/postgres";
    expect(validateDeploymentEnv(env).errors).toHaveLength(2);
  });
  it("prevents connecting the Auth account and platform FK data to different projects", () => {
    const env = valid();
    env.APP_DATABASE_URL = env.APP_DATABASE_URL.replace(
      "app.exampleproject",
      "app.otherproject",
    );
    expect(
      validateDeploymentEnv(env).errors.some((e) =>
        e.startsWith("APP_DATABASE_URL:"),
      ),
    ).toBe(true);
  });
  it("rejects a dashboard or MCP endpoint as the OntoRAG root", () => {
    for (const url of [
      "https://vercel.com/team/project",
      "https://knowledge.example.org/mcp/",
    ]) {
      expect(
        validateDeploymentEnv({
          ...valid(),
          ONTORAG_BASE_URL: url,
        }).errors.some((e) => e.startsWith("ONTORAG_BASE_URL:")),
      ).toBe(true);
    }
  });
});
