export type GovernanceNavGroup = {
  id: string;
  title: string;
  description: string;
  pages: string[];
};
export function governanceNavigation(
  view: "group" | "company",
): GovernanceNavGroup[] {
  return view === "group"
    ? [
        {
          id: "subsidiaries",
          title: "下属单位监管",
          description: "总览、重要问题与公司申请",
          pages: ["overview", "risks", "reviews"],
        },
        {
          id: "group-contracts",
          title: "集团自身风控",
          description: "合同、凭证与账务勾稽",
          pages: ["contracts"],
        },
        {
          id: "knowledge",
          title: "制度与知识",
          description: "查制度、溯依据、看关系",
          pages: ["policies", "graph"],
        },
      ]
    : [
        {
          id: "workbench",
          title: "治理工作台",
          description: "集中看待办，分流到业务办理",
          pages: ["overview"],
        },
        {
          id: "business",
          title: "治理业务办理",
          description: "上传材料、内部审核、提请集团",
          pages: ["authority", "major", "meetings", "checks"],
        },
        {
          id: "rectification",
          title: "整改与验收",
          description: "原事项关联、反馈证据与复核",
          pages: ["rectification"],
        },
        {
          id: "basis",
          title: "治理依据",
          description: "公司档案基线与参考制度",
          pages: ["archives", "policies"],
        },
        {
          id: "assistant",
          title: "智能治理助手",
          description: "制度答疑与办理指引",
          pages: ["assistant"],
        },
      ];
}
