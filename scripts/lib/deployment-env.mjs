export const requiredVariables = [
  "APP_DEMO_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ERP_READONLY_DATABASE_URL",
  "APP_DATABASE_URL",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_API_KEY",
  "ONTORAG_BASE_URL",
  "ONTORAG_SERVICE_API_KEY",
];

// Errors contain variable names and instructions, never variable values.
export function validateDeploymentEnv(env, { production = false } = {}) {
  const errors = [],
    warnings = [];
  for (const key of requiredVariables) {
    if (!env[key]?.trim()) errors.push(`${key}: 未配置`);
  }
  if (env.APP_DEMO_MODE && !["true", "false"].includes(env.APP_DEMO_MODE))
    errors.push("APP_DEMO_MODE: 只能为true或false");
  if ((production || env.VERCEL) && env.APP_DEMO_MODE !== "false")
    errors.push("APP_DEMO_MODE: 云端与生产部署必须为false");
  const urls = {};
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "DEEPSEEK_BASE_URL",
    "ONTORAG_BASE_URL",
  ]) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw Error();
      if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
        throw Error();
      if (
        key === "ONTORAG_BASE_URL" &&
        (url.hostname === "vercel.com" || url.pathname !== "/")
      )
        throw Error();
      urls[key] = url;
    } catch {
      errors.push(`${key}: 需有效HTTPS服务地址；OntoRAG请填写API根地址`);
    }
  }
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (publicKey && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey))
    errors.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 使用sb_publishable_发布密钥，不能填写服务端密钥",
    );
  const ref = urls.NEXT_PUBLIC_SUPABASE_URL?.hostname.match(
    /^([a-z0-9]+)\.supabase\.co$/,
  )?.[1];
  for (const key of ["ERP_READONLY_DATABASE_URL", "APP_DATABASE_URL"]) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !url.username ||
        !url.password ||
        !url.pathname ||
        url.pathname === "/"
      )
        throw Error();
      if (
        (production || env.VERCEL) &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw Error();
      if (url.searchParams.get("sslmode") === "disable") throw Error();
      const pooler = url.hostname.endsWith(".pooler.supabase.com");
      if (!pooler || url.port !== "6543")
        warnings.push(`${key}: Vercel建议使用Transaction Pooler的6543端口`);
      if (
        pooler &&
        ref &&
        decodeURIComponent(url.username).split(".").at(-1) !== ref
      )
        errors.push(
          `${key}: 当前架构要求ERP、平台数据库与Auth属于同一Supabase项目`,
        );
    } catch {
      errors.push(
        `${key}: 需含数据库账号、密码、数据库名的Postgres连接串，并启用TLS`,
      );
    }
  }
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("NEXT_PUBLIC_") &&
      key !== "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" &&
      /(SECRET|PASSWORD|DATABASE|API_KEY|TOKEN|SERVICE_ROLE)/.test(key) &&
      env[key]
    )
      errors.push(`${key}: 敏感配置不能使用NEXT_PUBLIC_前缀`);
  }
  if (production || env.VERCEL) {
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) {
      if (env[key] && /localhost|127\.0\.0\.1|\[::1\]/.test(env[key]))
        errors.push(`${key}: 云端不能使用本机代理`);
    }
  }
  return { errors, warnings };
}
