import nextEnv from "@next/env";
import { spawn, spawnSync } from "node:child_process";

// Load before launching Node so its built-in fetch reads proxy settings at startup.
nextEnv.loadEnvConfig(process.cwd(), true);
const env = { ...process.env };
if (process.platform === "win32" && !env.HTTPS_PROXY && !env.https_proxy) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$u=[Uri]'https://vercel.com'; $p=[System.Net.WebRequest]::GetSystemWebProxy(); $r=$p.GetProxy($u); if($r.AbsoluteUri -ne $u.AbsoluteUri){[Console]::Write($r.AbsoluteUri)}",
    ],
    { encoding: "utf8", timeout: 5000, windowsHide: true },
  );
  const candidate = result.stdout?.trim();
  if (candidate) {
    try {
      const proxy = new URL(candidate);
      if (["http:", "https:"].includes(proxy.protocol)) {
        env.HTTPS_PROXY = proxy.href;
        console.log("本地开发已启用 Windows 系统代理（仅当前进程）。");
      }
    } catch {
      // A missing or unsupported system proxy leaves the normal network unchanged.
    }
  }
}
env.NO_PROXY = [env.NO_PROXY || env.no_proxy, "localhost", "127.0.0.1", "::1"]
  .filter(Boolean)
  .join(",");
const child = spawn(
  process.execPath,
  [
    "--use-env-proxy",
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { env, stdio: "inherit", windowsHide: true },
);
child.on("error", () => {
  console.error("开发服务启动失败，请确认 Node.js 24 和项目依赖已安装。");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
