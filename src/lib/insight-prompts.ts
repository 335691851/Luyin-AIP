import type { Permission } from "./access";

export function insightPrompts(
  month: string,
  year?: string,
  permissions: readonly Permission[] = [],
) {
  const period = year
    ? `${year}年`
    : `${month.slice(0, 4)}年${Number(month.slice(5))}月`;
  const prompts = [
    {
      id: "summary",
      group: "销售分析",
      label: "销售额、销量与订单数",
      question: `${period}的销售额和销量怎么样，一共有多少笔订单？`,
    },
    {
      id: "companies",
      group: "销售分析",
      label: "各公司销售对比",
      question: `${period}各公司的销售额和销量怎么样，哪家公司表现最好？`,
    },
    {
      id: "products",
      group: "销售分析",
      label: "产品销售前十",
      question: `${period}销售额最高的10个产品是哪些？`,
    },
    {
      id: "categories",
      group: "销售分析",
      label: "产品分类收入占比",
      question: `${period}各类产品分别贡献了多少销售额？`,
    },
    {
      id: "packaging",
      group: "销售分析",
      label: "小包装、大包装与散装对比",
      question: `${period}小包装、大包装和散装产品，哪类销售额占比更高？`,
    },
    {
      id: "trend",
      group: "销售分析",
      label: year ? "全年销售月趋势" : "本期销售日趋势",
      question: `${period}的销售额${year ? "每个月" : "每天"}有什么变化？`,
    },
    {
      id: "sea",
      group: "销售分析",
      label: "海盐产品销售情况",
      question: `${period}海盐产品卖得怎么样？`,
    },
  ];
  if (permissions.includes("profit.view"))
    prompts.push(
      {
        id: "product-profit",
        group: "名义利润",
        label: "产品名义利润排名",
        question: `${period}哪些产品的名义利润最高？`,
      },
      {
        id: "company-profit",
        group: "名义利润",
        label: "公司利润与利润率对照",
        question: `${period}哪家公司的名义利润和利润率比较好？`,
      },
      {
        id: "cost-coverage",
        group: "名义利润",
        label: "订单成本覆盖情况",
        question: `${period}哪些公司的订单还缺少成本数据？`,
      },
    );
  if (permissions.includes("coordination.view"))
    prompts.push(
      {
        id: "available-stock",
        group: "库存分析",
        label: "各公司产品可用库存",
        question: "现在各公司有哪些产品库存可以销售，分别还有多少？",
      },
      {
        id: "reserved-stock",
        group: "库存分析",
        label: "库存占用情况",
        question: "现在哪些产品的库存被占用了，各公司分别占用了多少？",
      },
    );
  return prompts;
}
