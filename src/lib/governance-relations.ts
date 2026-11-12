import type { GovernanceItem } from "./governance-workflow";

export const governanceBusinessDomains = [
  {
    page: "authority",
    role: "权限基础",
    category: "治理责任与授权",
    purpose: "明确谁有权办理、审批和承担责任",
    focus: "授权范围与有效期、岗位职责分离、变更及撤销证明",
  },
  {
    page: "major",
    role: "决策程序",
    category: "重大事项程序",
    purpose: "明确重大事项由谁决策、经过什么程序",
    focus: "事项议案、权限判断、风险论证、内部审核与提请集团的依据",
  },
  {
    page: "meetings",
    role: "履职证据",
    category: "会议决议与履职",
    purpose: "记录如何形成决策、如何落实履职",
    focus: "通知、出席、回避、表决、决议签署、执行责任与落实证据",
  },
  {
    page: "checks",
    role: "监督检查",
    category: "制度与合规自查",
    purpose: "检查制度要求在业务中是否得到落实",
    focus: "制度版本、自查清单、取证底稿、发现的问题及审核意见",
  },
] as const;

// parent_id links actions to archives AND rectifications to source cases.
// Follow only rectification ancestry; an archive is a basis, not a problem source.
export function governanceOrigin(item: GovernanceItem, rows: GovernanceItem[]) {
  if (item.item_kind !== "rectification") return undefined;
  const visited = new Set([item.id]);
  let current = item;
  while (current.parent_id) {
    const parent = rows.find(
      (r) =>
        r.id === String(current.parent_id) && r.company_id === item.company_id,
    );
    if (!parent || visited.has(parent.id) || parent.item_kind === "archive")
      return undefined;
    if (parent.item_kind !== "rectification") return parent;
    visited.add(parent.id);
    current = parent;
  }
  return undefined;
}

export function governanceRectifications(
  item: GovernanceItem,
  rows: GovernanceItem[],
) {
  return rows.filter(
    (r) =>
      r.item_kind === "rectification" &&
      governanceOrigin(r, rows)?.id === item.id,
  );
}

export function rectificationSummary(items: GovernanceItem[]) {
  const complete = items.filter((r) =>
    ["已闭环", "已归档"].includes(r.status),
  ).length;
  const review = items.filter((r) => r.status === "整改待验收").length;
  return {
    total: items.length,
    complete,
    review,
    open: items.length - complete,
  };
}
