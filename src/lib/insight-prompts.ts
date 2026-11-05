import type { Permission } from "./access";

export function insightPrompts(
  month: string,
  year?: string,
  permissions: readonly Permission[] = [],
) {
  const period = year ? `${year}年全年` : `${month}自然月`;
  const order = "仅统计已审核、已记账或已关闭的销售订单";
  const prompts = [
    {
      id: "summary",
      group: "销售分析",
      label: "销售额、销量与订单数",
      question: `${period}的不含税销售额、吨制产品订单销量和销售订单数分别是多少？${order}，不同单位不要混加。`,
    },
    {
      id: "companies",
      group: "销售分析",
      label: "各公司销售对比",
      question: `${period}各公司的不含税销售额、吨制订单销量和销售订单数是多少？按销售额降序排列，${order}。`,
    },
    {
      id: "products",
      group: "销售分析",
      label: "产品销售前十",
      question: `${period}不含税销售额最高的10个产品是什么？列出产品名称、销售额及计量单位，销量按各自单位展示，${order}。`,
    },
    {
      id: "categories",
      group: "销售分析",
      label: "产品分类收入占比",
      question: `${period}各产品分类的不含税销售额和收入占比是多少？${order}，使用订单行金额汇总。`,
    },
    {
      id: "packaging",
      group: "销售分析",
      label: "小包装、大包装与散装对比",
      question: `${period}小包装、大包装和散装产品各有多少不含税销售额及收入占比？按物料packaging字段分组，${order}。`,
    },
    {
      id: "trend",
      group: "销售分析",
      label: year ? "全年销售月趋势" : "本期销售日趋势",
      question: `${period}按${year ? "月" : "日"}展示不含税销售额和销售订单数趋势，${order}。`,
    },
    {
      id: "sea",
      group: "销售分析",
      label: "海盐产品销售情况",
      question: `${period}盐源明确标记为sea的海盐产品销售情况如何？列出产品名称、不含税销售额及按各自单位展示的销量；unknown盐源不要归为海盐，${order}。`,
    },
  ];
  if (permissions.includes("profit.view"))
    prompts.push(
      {
        id: "product-profit",
        group: "名义利润",
        label: "产品名义利润排名",
        question: `${period}名义利润最高的10个产品有哪些？列出收入、ERP订单行成本、名义利润及利润率；${order}，成本缺失或小于等于0的行排除并说明，不分摊费用。`,
      },
      {
        id: "company-profit",
        group: "名义利润",
        label: "公司利润与利润率对照",
        question: `${period}各公司名义利润和利润率如何？仅按有效订单行成本计算对应收入和利润，${order}，同时列出有效成本订单行数和总行数，不分摊费用。`,
      },
      {
        id: "cost-coverage",
        group: "名义利润",
        label: "订单成本覆盖情况",
        question: `${period}各公司销售订单行的有效成本覆盖率是多少？成本为空或小于等于0视为缺失，列出总行数、有效成本行数和缺成本行数，${order}。`,
      },
    );
  if (permissions.includes("coordination.view"))
    prompts.push(
      {
        id: "available-stock",
        group: "库存分析",
        label: "各公司产品可用库存",
        question:
          "当前各公司吨制产品的现存量、占用量和可用量是多少？按公司及产品汇总stock_balance，可用量=qty-reserved_qty，按可用量降序列出前30项；库存为当前余额，不按订单期间过滤。",
      },
      {
        id: "reserved-stock",
        group: "库存分析",
        label: "库存占用情况",
        question:
          "当前哪些吨制产品库存已被占用？按公司及产品汇总现存量、占用量和占用比例，现存量大于0且占用量大于0，按占用量降序列出前20项；库存为当前余额，不按订单期间过滤。",
      },
    );
  return prompts;
}
