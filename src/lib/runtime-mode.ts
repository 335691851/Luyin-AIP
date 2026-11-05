export function sampleModeAllowed(env: Record<string, string | undefined>) {
  return (
    env.APP_DEMO_MODE === "true" && env.NODE_ENV !== "production" && !env.VERCEL
  );
}
