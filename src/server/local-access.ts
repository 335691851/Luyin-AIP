import "server-only";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { defaultAccess, resolveSession, validateAccess } from "@/lib/access";
import type { AccessConfig } from "@/lib/access";
import { demoMode } from "./config";
const file = path.join(process.cwd(), ".local", "access.json");
export async function readAccess(): Promise<AccessConfig> {
  if (!demoMode()) throw Error("FORBIDDEN");
  try {
    const config = JSON.parse(await readFile(file, "utf8")) as AccessConfig;
    validateAccess(config);
    return config;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return structuredClone(defaultAccess);
    throw e;
  }
}
let queue: Promise<unknown> = Promise.resolve();
export async function changeAccess(
  update: (config: AccessConfig) => AccessConfig,
) {
  const task = queue.then(async () => {
    const config = update(await readAccess());
    validateAccess(config);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file + ".tmp", JSON.stringify(config, null, 2), "utf8");
    await rename(file + ".tmp", file);
    return config;
  });
  queue = task.catch(() => {});
  return task;
}
export async function previewSession() {
  const id = (await cookies()).get("luyin-preview-user")?.value || "demo-admin";
  return resolveSession(await readAccess(), id);
}
