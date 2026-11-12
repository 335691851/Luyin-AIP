import { describe, expect, it } from "vitest";
import {
  governanceOrigin,
  governanceRectifications,
  rectificationSummary,
} from "../src/lib/governance-relations";
import type { GovernanceItem } from "../src/lib/governance-workflow";
const item = (
  id: string,
  kind: GovernanceItem["item_kind"],
  parent_id: string | null = null,
  extra: Partial<GovernanceItem> = {},
) =>
  ({
    id,
    item_kind: kind,
    parent_id,
    company_id: 2,
    status: "需整改",
    ...extra,
  }) as GovernanceItem;
describe("governance business and rectification relationships", () => {
  it("separates archive basis from the business source of a rectification", () => {
    const archive = item("archive", "archive"),
      business = item("business", "action", "archive"),
      task = item("task", "rectification", "business");
    const rows = [archive, business, task];
    expect(governanceOrigin(business, rows)).toBeUndefined();
    expect(governanceOrigin(task, rows)?.id).toBe("business");
    expect(governanceRectifications(business, rows)).toEqual([task]);
  });
  it("does not infer a source from an archive, missing parent or another company", () => {
    const archive = item("archive", "archive"),
      other = item("other", "action", null, { company_id: 3 });
    for (const parent of ["archive", "missing", "other"]) {
      const task = item("task", "rectification", parent);
      expect(governanceOrigin(task, [archive, other, task])).toBeUndefined();
    }
  });
  it("resolves legacy nested ancestry and stops at cycles", () => {
    const root = item("root", "important_risk"),
      a = item("a", "rectification", "root"),
      b = item("b", "rectification", "a");
    expect(governanceOrigin(b, [root, a, b])?.id).toBe("root");
    const cyclicA = { ...a, parent_id: "b" };
    expect(governanceOrigin(cyclicA, [cyclicA, b])).toBeUndefined();
  });
  it("counts pending verification as open and does not equate one closure with all closures", () => {
    const root = item("root", "action");
    const tasks = [
      item("a", "rectification", "root"),
      item("b", "rectification", "root", { status: "整改待验收" }),
      item("c", "rectification", "root", { status: "已闭环" }),
      item("elsewhere", "rectification", "other"),
    ];
    expect(
      rectificationSummary(governanceRectifications(root, [root, ...tasks])),
    ).toEqual({ total: 3, complete: 1, review: 1, open: 2 });
  });
});
