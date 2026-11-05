export const governanceCategories = [
  "公司治理档案",
  "治理责任与授权",
  "重大事项程序",
  "会议决议与履职",
  "制度与合规自查",
] as const;
export type GovernanceItem = {
  item_kind?:
    "archive" | "action" | "important_risk" | "rectification" | "contract_risk";
  severity?: string;
  parent_id?: string | null;
  payload?: Record<string, any>;
  data_source: "manual" | "synthetic_graph";
  source_refs: {
    documentId: string;
    filename: string;
    usage: string;
    ontologyVersion: string;
  }[];
  id: string;
  company: string;
  company_id: number;
  category: string;
  title: string;
  owner: string;
  deadline: string;
  basis: string;
  materials: string;
  finding: string;
  status: string;
  origin: "group" | "company";
  version: number;
  updated_at: string;
};
export const governanceTransitions = {
  group: {
    需整改: { 风险处置确认: "已闭环", 要求整改: "需整改" },
    待审核: {
      归档通过: "已归档",
      要求整改: "需整改",
      退回补正: "待补正",
      不予通过: "已驳回",
    },
    整改待验收: { 验收销项: "已闭环", 继续整改: "需整改" },
  },
  company: {
    整改待验收: { 公司验收: "已闭环", 再次整改: "需整改" },
    待响应: { 提交材料: "待公司审核" },
    待公司审核: {
      审核通过: "已归档",
      审核退回: "需整改",
      提请集团审核: "待审核",
    },
    需整改: { 提交整改: "整改待验收" },
    待补正: { 提交补正: "待审核" },
  },
} as const;
export function nextGovernanceStatus(
  view: "group" | "company",
  status: string,
  action: string,
): string | null {
  return (
    (governanceTransitions[view] as Record<string, Record<string, string>>)[
      status
    ]?.[action] || null
  );
}
