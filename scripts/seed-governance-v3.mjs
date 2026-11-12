import nextEnv from "@next/env";
import postgres from "postgres";
import { createHash } from "node:crypto";
nextEnv.loadEnvConfig(process.cwd(), true);
const db = postgres(process.env.APP_DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});
try {
  await db.begin(async (t) => {
    const [actor] =
      await t`select p.user_id from platform.user_profile p join auth.users u on u.id=p.user_id where u.email='admin@luyin.com' and p.enabled`;
    const [company] =
      await t`select id,name from public.company where name like '%泰安%' order by id limit 1`;
    if (!actor || !company) throw Error("seed actor or company missing");
    async function item(
      key,
      title,
      kind,
      category,
      status,
      content,
      parent = null,
      payload = {},
      companyId = company.id,
      origin = "company",
    ) {
      const [row] =
        await t`insert into platform.governance_item(company_id,category,title,owner,deadline,basis,materials,finding,status,origin,created_by,data_source,source_refs,seed_key,scenario_version,item_kind,parent_id,payload) values(${companyId},${category},${title},'公司治理经办岗',current_date+10,'V3治理演练规范；待正式章程确认',${content},${content},${status},${origin},${actor.user_id},'synthetic_graph','[]'::jsonb,${key},2,${kind},${parent},${t.json(payload)}) on conflict(seed_key) do nothing returning id::text`;
      if (row)
        await t`insert into platform.governance_item_event(item_id,actor_id,actor_name,perspective,action,note) values(${row.id},${actor.user_id},'情景初始化',${origin},'创建演练情景',${content})`;
      return (
        row?.id ||
        (
          await t`select id::text from platform.governance_item where seed_key=${key}`
        )[0].id
      );
    }
    const archives = [
      [
        "股东权利与出资管理",
        "股东名册记录出资方式、认缴与实缴、期限和变更依据；出资异常需核实并报告，不以台账代替出资凭证。",
        "股东名册、出资证明、验资或付款依据、股权变更批准文件",
      ],
      [
        "董事会与经理层议事规范",
        "会前核对召集通知、议案及权限；记录出席、表决和回避；会议纪要与正式决议分别保存，执行清单明确责任人和期限。",
        "会议通知、议案、签到、表决票、签署决议、执行台账",
      ],
      [
        "关联交易与利益冲突管理",
        "经办与决策人员申报利益冲突；关联交易留存公允性比较及回避证据，按正式章程识别审批层级，不设虚构金额阈值。",
        "关系申报、比价分析、回避记录、审批和签署材料",
      ],
      [
        "投资担保与资产处置程序",
        "投资、担保、处置先形成可行性和风险评估，再核对保留事项及有权决策机构；禁止以事后补签替代前置审批。",
        "专项议案、风险评估、权限判断表、决策文件、实施复盘",
      ],
      [
        "合同印章与档案管理",
        "合同审查覆盖主体、标的、价格、履约与争议条款；用印须与授权和批准文本一致；原件、版本及借阅记录受控。",
        "法律审查、批准文本、用印登记、合同原件、归档目录",
      ],
      [
        "财务监督与资金审批规范",
        "经办、复核、批准职责分离；业务单据、应收应付、会计凭证勾稽；差异先核实来源再更正，留存复核依据。",
        "职责矩阵、付款审批、业务单据、凭证及差异复核表",
      ],
      [
        "合规自查与整改验收规范",
        "整改必须来自具体自查或审核发现；列明差距、依据、责任和期限。反馈附补正材料，独立复核后方可销项；集团事项由集团验收。",
        "自查底稿、审核退回记录、整改方案、反馈、复核结论",
      ],
      [
        "治理人员任职与履职评价",
        "任免保留批准文件、任期及任职资格核验；定期收集履职记录、培训与年度评价，岗位变化触发授权复核。",
        "任免文件、资格声明、履职报告、培训及评价记录",
      ],
    ];
    const ids = [];
    for (let i = 0; i < archives.length; i++) {
      const [name, rule, materials] = archives[i];
      ids.push(
        await item(
          `gov-v3:archive:${company.id}:${i}`,
          `${company.name} · ${name}（规范样例）`,
          "archive",
          "公司治理档案",
          "已归档",
          materials,
          null,
          {
            version: `LYTA-V3-${i + 1}-演练`,
            content: `适用范围：鲁盐泰安公司治理演练。\n核心要求：${rule}\n必备依据：${materials}。\n核查动作：逐项核对文件版本、批准主体、签署时间和原件位置。\n异常处理：缺项生成关联整改，重要风险按权限报集团。\n有效性：仅为规范性结构样例，不能视为公司已生效章程。`,
            filename: `治理规范样例-${i + 1}.md`,
            effectiveStatus: "演练基线，待正式确认",
          },
        ),
      );
    }
    const cases = [
      [
        "会议决议与履职",
        "董事会决议签署不完整",
        "补齐参会董事签署与执行责任",
        "需整改",
        "需整改",
        1,
        "会议记录显示3名董事出席，仅2名签署；缺执行责任人。不得编造追溯签署日期。",
      ],
      [
        "治理责任与授权",
        "经理授权变更撤销证明缺项",
        "补齐旧授权撤销及系统权限回收记录",
        "需整改",
        "整改待验收",
        7,
        "岗位变更后旧授权未见撤销证明；现已提交撤销通知和权限回收截图，待独立复核。",
      ],
      [
        "制度与合规自查",
        "档案借阅登记缺少归还记录",
        "完成借阅台账补正及复核",
        "已归档",
        "已闭环",
        4,
        "原自查发现2笔借阅缺归还日期；已核对原件归还，复核签署完成，留痕关闭。",
      ],
    ];
    for (let i = 0; i < cases.length; i++) {
      const [
        cat,
        parentTitle,
        title,
        parentStatus,
        status,
        archiveIndex,
        finding,
      ] = cases[i];
      const parent = await item(
        `gov-v3:action:${company.id}:${i}`,
        parentTitle,
        "action",
        cat,
        parentStatus,
        finding,
        ids[archiveIndex],
        { requiredMaterials: ["审核意见", "整改材料", "独立复核记录"] },
      );
      const child = await item(
        `gov-v3:rectify:${company.id}:${i}`,
        title,
        "rectification",
        cat,
        status,
        finding,
        parent,
        {
          groupEscalated: false,
          rootActionId: parent,
          acceptanceCriteria:
            "材料逐项补齐、责任人签署、独立复核确认；未复核不得关闭",
        },
      );
      const trail = [
        "演练审核退回并生成整改",
        ...(i > 0 ? ["演练提交整改材料"] : []),
        ...(i === 2 ? ["演练独立复核验收通过"] : []),
      ];
      for (const action of trail) {
        const [exists] =
          await t`select count(*)::int as n from platform.governance_item_event where item_id=${child} and action=${action}`;
        if (!exists.n)
          await t`insert into platform.governance_item_event(item_id,actor_id,actor_name,perspective,action,note) values(${child},${actor.user_id},'模拟公司审核岗','company',${action},${finding})`;
      }
      for (const id of [parent, child]) {
        const content = `# 演练证据\n${finding}\n整改责任：公司治理经办岗。\n验收条件：逐项核对原件、签署与版本，复核人独立于经办人。\n${i === 2 ? "复核结论：演练材料补齐，复核通过。" : "当前结论：尚未验收，不认定已完成。"}`;
        const filename = `V3-${id}-模拟核查底稿.md`;
        const [exists] =
          await t`select count(*)::int as n from platform.governance_attachment where item_id=${id} and filename=${filename}`;
        if (!exists.n)
          await t`insert into platform.governance_attachment(item_id,filename,mime,size_bytes,sha256,content_base64,extracted_text,created_by) values(${id},${filename},'text/markdown',${Buffer.byteLength(content)},${createHash("sha256").update(content).digest("hex")},${Buffer.from(content).toString("base64")},${content},${actor.user_id})`;
      }
    }
    for (const month of ["2026-10", "2026-11"])
      for (let i = 0; i < 4; i++) {
        const issues = [
          [],
          ["未匹配覆盖自然年的合同候选"],
          ["已形成账务单据但未匹配已记账凭证"],
          ["凭证借贷不平衡或缺少分录"],
        ][i];
        const sample = {
          id: `SIM-${month}-${i}`,
          month,
          bill_no: `SIM-GROUP-${month}-${i + 1}`,
          bill_date: `${month}-08`,
          customer: `演练客户${i + 1}`,
          revenue: 100000 + i * 20000,
          is_simulated: true,
          data_source: "platform_simulation",
          annual_candidates: i === 1 ? 0 : 1,
          contract_files: i === 1 ? 0 : 1,
          accounting_documents: 1,
          vouchers: i === 2 ? 0 : 1,
          unbalanced: i === 3 ? 1 : 0,
          bill_refs: `SIM-AR-${month}-${i + 1}`,
          debit: i === 2 ? 0 : 113000 + i * 22600,
          credit: i === 2 ? 0 : 113000 + i * 22600 - (i === 3 ? 1000 : 0),
          issues,
          basis:
            "平台虚拟勾稽样本；模拟订单→应收单→凭证链，非ERP记录。正常、合同缺失、未记账、借贷差异四种情景。",
        };
        await item(
          `gov-v3:contract:${month}:${i}`,
          `集团勾稽演练：${sample.bill_no}`,
          "contract_risk",
          "制度与合规自查",
          "需整改",
          issues.join("；") || "本轮规则未命中；保留人工复核",
          null,
          { reconciliation: sample },
          1,
          "group",
        );
      }
  });
  console.log(
    JSON.stringify(
      await db`select item_kind,count(*)::int as count from platform.governance_item where seed_key like 'gov-v3:%' group by item_kind`,
    ),
  );
} finally {
  await db.end();
}
