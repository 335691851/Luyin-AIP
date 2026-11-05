import "server-only";
import { ChatOpenAI } from "@langchain/openai";
export function intelligence(tokens = 1600) {
  if (!process.env.DEEPSEEK_API_KEY) throw Error("模型服务尚未配置");
  return new ChatOpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
    configuration: {
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    },
    useResponsesApi: false,
    timeout: 22000,
    maxRetries: 0,
    maxTokens: tokens,
    modelKwargs: { thinking: { type: "disabled" } },
  });
}
export function modelText(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}
export function modelJson(content: unknown) {
  return JSON.parse(
    modelText(content).replace(/^```(?:json)?\s*|\s*```$/g, ""),
  );
}
