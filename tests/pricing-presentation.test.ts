import { describe, it, expect } from "vitest";
import {
  assessmentTone,
  pricingStatusTone,
  pricingStatusColors,
} from "../src/lib/pricing-presentation";
describe("pricing advice emphasis", () => {
  it("prioritizes negative and incomplete evidence over generic advice words", () => {
    expect(assessmentTone("**不建议直接批准**，建议驳回本行")).toBe("risk");
    expect(assessmentTone("建议补齐结算价，当前证据不足")).toBe("warning");
    expect(assessmentTone("总体建议：优先复核申请数量")).toBe("advice");
  });
  it("does not label a negated general risk statement as a rejection", () => {
    expect(assessmentTone("未发现高风险情形")).toBe("normal");
    expect(assessmentTone("近期销量为20吨")).toBe("normal");
  });
  it("keeps actual human review statuses distinct from AI text", () => {
    expect(pricingStatusTone("已通过")).toBe("approved");
    expect(pricingStatusTone("已驳回")).toBe("rejected");
    expect(pricingStatusColors.待补正).toBe("gold");
  });
});
