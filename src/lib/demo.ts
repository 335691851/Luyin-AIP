// Fictional fixtures. Never used as fallback for a failed live connection.
export const companies = [
  "山东省鲁盐集团有限公司",
  "山东岱岳制盐有限公司",
  "山东肥城精制盐厂有限公司",
  "鲁盐泰安合资公司",
  "鲁盐鲁中合资公司",
];
export const products = [
  "精制食用盐 500g",
  "天然海盐 400g",
  "食品加工用盐 50kg",
  "精工饲料盐 50kg",
  "软水盐 10kg",
  "低钠盐 350g",
  "药用氯化钠 25kg",
  "散湿盐",
];
export const sales = Array.from({ length: 32 }, (_, i) => {
  const qty = Number((18 + i * 3.7).toFixed(2));
  const unit = 920 + (i % 8) * 185;
  const cost = unit - 160 - (i % 4) * 30;
  return {
    id: `SO-DEMO-${String(i + 1).padStart(4, "0")}`,
    date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
    company: companies[i % 5],
    department: i % 5 === 0 ? "营销部" : "销售部",
    product: products[i % 8],
    category: [
      "小包装食盐",
      "小包装食盐",
      "食品加工用盐",
      "饲料盐",
      "软水盐",
      "小包装食盐",
      "药用盐",
      "工业盐",
    ][i % 8],
    region: ["济南", "泰安", "潍坊", "济宁"][i % 4],
    qty,
    unit: "吨",
    revenue: Number((qty * unit).toFixed(2)),
    unitCost: cost,
    status: "已审核",
  };
});
export type PriceLine = {
  department?: string;
  id: string;
  application: string;
  company: string;
  product: string;
  original: number;
  requested: number;
  qty: number;
  status: import("./domain").ReviewStatus;
  reason: string;
  opinion?: string;
  approved?: number;
  version: number;
};
export const priceLines: PriceLine[] = [
  {
    id: "L-001",
    application: "TJ-DEMO-20261101",
    company: companies[3],
    product: products[0],
    original: 1680,
    requested: 1600,
    qty: 20,
    status: "待审核",
    reason: "渠道阶段性促销，申请专项供货价格。",
    version: 1,
  },
  {
    id: "L-002",
    application: "TJ-DEMO-20261101",
    company: companies[3],
    product: products[1],
    original: 1820,
    requested: 1700,
    qty: 12,
    status: "待审核",
    reason: "同单不同产品独立申请，需核对库存与内部结算价。",
    version: 1,
  },
  {
    id: "L-003",
    application: "TJ-DEMO-20261102",
    company: companies[4],
    product: products[2],
    original: 960,
    requested: 930,
    qty: 50,
    status: "待补正",
    reason: "长期客户计划采购，缺少客户订单依据。",
    version: 1,
  },
];
export const governanceModules = [
  "公司治理档案",
  "治理责任与授权",
  "重大事项程序",
  "会议决议与履职记录",
  "制度与合规自查",
  "问题整改",
  "制度知识库",
];
export type GovernanceCase = {
  department?: string;
  id: string;
  title: string;
  company: string;
  module: string;
  owner: string;
  deadline: string;
  status: string;
  evidence: string;
  history: string[];
};
export const cases: GovernanceCase[] = [
  {
    id: "G-DEMO-001",
    title: "公司章程及治理机构资料复核",
    company: companies[3],
    module: "公司治理档案",
    owner: "企业经办人",
    deadline: "2026-11-12",
    status: "待审核",
    evidence: "演示资料目录：章程、治理机构职责。未附真实文件。",
    history: ["企业提交治理资料目录"],
  },
  {
    id: "G-DEMO-002",
    title: "经理层授权有效期检查",
    company: companies[4],
    module: "治理责任与授权",
    owner: "企业负责人",
    deadline: "2026-11-15",
    status: "待补正",
    evidence: "缺少有效授权文件，需补充授权范围与有效期。",
    history: ["管理员退回补正：请提供授权文件"],
  },
  {
    id: "G-DEMO-003",
    title: "年度决议及履职记录自查",
    company: companies[3],
    module: "制度与合规自查",
    owner: "综合管理岗",
    deadline: "2026-11-18",
    status: "待审核",
    evidence: "演示自查说明，正式制度版本尚未绑定。",
    history: ["企业提交自查说明"],
  },
];
export const synonyms = [
  {
    id: "S01",
    term: "销量 / 销售数量",
    standard: "订单数量",
    scope: "销售订单",
    note: "按订单业务日期，不等于出库量",
  },
  {
    id: "S02",
    term: "名义毛利 / 名义利润",
    standard: "订单名义利润",
    scope: "利润",
    note: "收入减数量乘有效单位成本，不分摊费用",
  },
  {
    id: "S03",
    term: "上月 / 上个月",
    standard: "上一自然月",
    scope: "时间",
    note: "按Asia/Shanghai当前日计算",
  },
  {
    id: "S04",
    term: "库存量 / 现存量",
    standard: "现存数量",
    scope: "库存",
    note: "可用量另扣占用，不与现存量等同",
  },
];
