import { describe, expect, it } from "vitest";
import { isGroupReview } from "../src/lib/governance-review";
import type { GovernanceItem } from "../src/lib/governance-workflow";
const item = (overrides: Partial<GovernanceItem> = {}) =>
  ({
    id: "1",
    item_kind: "action",
    origin: "company",
    status: "已归档",
    ...overrides,
  }) as GovernanceItem;
describe("group governance review boundary", () => {
  it("excludes company internal archives and group risk records", () => {
    expect(isGroupReview(item(), [])).toBe(false);
    expect(
      isGroupReview(
        item({
          item_kind: "important_risk",
          origin: "group",
          status: "待审核",
        }),
        [],
      ),
    ).toBe(false);
  });
  it("accepts pending company submissions and retains explicit group decisions", () => {
    expect(isGroupReview(item({ status: "待审核" }), [])).toBe(true);
    expect(
      isGroupReview(item(), [
        { item_id: "1", perspective: "group", action: "归档通过" },
      ]),
    ).toBe(true);
  });
  it("retains applications transferred to rectification without including unrelated items", () => {
    expect(
      isGroupReview(item({ status: "需整改" }), [
        { item_id: "1", perspective: "group", action: "要求整改" },
      ]),
    ).toBe(true);
    expect(
      isGroupReview(item({ status: "需整改" }), [
        { item_id: "other", perspective: "group", action: "要求整改" },
      ]),
    ).toBe(false);
  });
});
