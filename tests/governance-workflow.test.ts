import { describe, it, expect } from "vitest";
import { nextGovernanceStatus } from "../src/lib/governance-workflow";
describe("governance perspective workflow", () => {
  it("separates corporate submission from group review", () => {
    expect(nextGovernanceStatus("company", "待审核", "归档通过")).toBeNull();
    expect(nextGovernanceStatus("group", "待审核", "要求整改")).toBe("需整改");
    expect(nextGovernanceStatus("company", "需整改", "提交整改")).toBe(
      "整改待验收",
    );
    expect(nextGovernanceStatus("group", "整改待验收", "验收销项")).toBe(
      "已闭环",
    );
  });
  it("requires company correction before group review and prevents reopening closed records", () => {
    expect(nextGovernanceStatus("group", "待审核", "退回补正")).toBe("待补正");
    expect(nextGovernanceStatus("company", "待补正", "提交补正")).toBe(
      "待审核",
    );
    expect(nextGovernanceStatus("group", "已闭环", "要求整改")).toBeNull();
    expect(nextGovernanceStatus("company", "待审核", "提交整改")).toBeNull();
  });
});
