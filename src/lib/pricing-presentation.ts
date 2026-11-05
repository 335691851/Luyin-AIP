export type AssessmentTone = "risk" | "warning" | "advice" | "normal";
export function assessmentTone(text: string): AssessmentTone {
  // Highlight explicit advice; never turn an AI phrase into a recorded approval status.
  const plain = text.replace(/[*#`]/g, "");
  if (
    /不建议(?:直接|本次|予以)?(?:批准|通过|执行|下调)|建议(?:驳回|否决|拒绝)|不予(?:通过|批准)/.test(
      plain,
    )
  )
    return "risk";
  if (
    /证据不足|证据缺失|无法判断|不能确认|不能认定|不能直接批准|待补充|需补充|缺少|尚未|待核验|暂缓|待补正|补齐/.test(
      plain,
    )
  )
    return "warning";
  if (
    /整批结论|综合结论|综合判断|总体判断|总体建议|评估结论|审核建议|结论[:：]|建议|优先|核查|复核|应当/.test(
      plain,
    )
  )
    return "advice";
  return "normal";
}
export function pricingStatusTone(status: string) {
  return status === "已通过"
    ? "approved"
    : status === "已驳回"
      ? "rejected"
      : status === "待补正"
        ? "correction"
        : "pending";
}
export const pricingStatusColors: Record<string, string> = {
  已通过: "green",
  已驳回: "red",
  待补正: "gold",
  待审核: "blue",
};
