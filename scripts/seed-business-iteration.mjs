import nextEnv from "@next/env";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
nextEnv.loadEnvConfig(process.cwd(), true);
const db = postgres(process.env.APP_DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});
const archiveTemplates = [
  [
    "公司章程与议事权限（规范样例）",
    "合规管理办法",
    "第一章：股东会决定章程修改、重大投资与对外担保等保留事项。\n第二章：董事会在股东会授权范围内决策，关联事项须申报利益冲突并回避。\n第三章：经理层按书面授权履职，超权限事项提交有权机构审议。\n第四章：决议、签署与履职记录应完整留档，不以事后补签替代前置程序。",
    "章程、股东名册、治理机构任职文件",
    "LYTA-ZC-2026-样例",
  ],
  [
    "治理责任与授权清单（规范样例）",
    "内部控制审计制度",
    "授权应写明授权主体、受权人、事项范围、有效期及转授权限制。临近到期应复核续期；岗位变更应同步调整授权。业务办理前核对权限，不使用过期授权。",
    "授权矩阵、签发文件、岗位变动与授权复核表",
    "LYTA-SQ-2026-样例",
  ],
  [
    "重大事项决策与会议议事规则（规范样例）",
    "全面风险控制管理办法",
    "重大投资、担保及重要关联事项应形成专项议案、风险论证与决策依据；按章程判断审议层级。董事会会议应保存通知、议案、出席名单、表决、回避、决议签署与落实记录。",
    "议案、前置论证、权限判断表、会议决议与履职记录",
    "LYTA-ZD-2026-样例",
  ],
  [
    "制度与合规自查管理规范（样例）",
    "合规管理办法",
    "每季度开展制度适用性与版本复核、自查取证。发现缺项生成整改任务，记录责任人、期限、整改材料、复核结论与关闭依据。重要风险或保留事项提交集团，不以一般台账替代报告。",
    "制度清单、自查底稿、整改反馈与复核记录",
    "LYTA-HG-2026-样例",
  ],
];
const actions = [
  [
    "治理责任与授权",
    "经理层年度授权续期申请",
    1,
    "待响应",
    "请核对2026年经理层授权有效期，提交续期范围与受权人变更清单。",
    "授权复核表、续期申请、拟授权矩阵",
  ],
  [
    "重大事项程序",
    "办公场所长期租赁决策程序确认",
    2,
    "待审核",
    "公司已提交租赁方案与风险论证，提请集团确认是否属于保留事项。",
    "事项议案、金额测算、风险论证、权限判断记录",
  ],
  [
    "会议决议与履职",
    "第四季度董事会决议签署与履职归档",
    2,
    "待公司审核",
    "已上传会议记录样例，需公司审核出席、回避、签署与落实责任。",
    "会议通知、出席名单、表决票、决议、执行清单",
  ],
  [
    "制度与合规自查",
    "季度制度版本与适用性自查",
    3,
    "需整改",
    "自查发现制度版本清单未记录确认人，需补齐版本确认和责任签署。",
    "制度目录、自查底稿、现行版本确认表",
  ],
  [
    "治理责任与授权",
    "关键岗位职责分离复核",
    1,
    "已归档",
    "已对经办、审核、批准职责分离形成确认记录。",
    "岗位职责说明、权限矩阵、复核签署表",
  ],
  [
    "重大事项程序",
    "关联事项回避说明核验",
    0,
    "待公司审核",
    "已申报关联关系，需核对回避人员、表决权限与决策记录一致性。",
    "关联关系申报、回避说明、决议签署材料",
  ],
];
let governance = 0,
  pricing = 0;
try {
  let catalog;
  try {
    catalog = JSON.parse(
      readFileSync(".local/governance-live-documents.json", "utf8").replace(
        /^\uFEFF/,
        "",
      ),
    );
  } catch {
    const r = await fetch(
      new URL(
        "v1/documents?limit=100",
        process.env.ONTORAG_BASE_URL.replace(/\/?$/, "/"),
      ),
      {
        headers: {
          Authorization: `Bearer ${process.env.ONTORAG_SERVICE_API_KEY}`,
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw Error("OntoRAG directory unavailable");
    catalog = await r.json();
  }
  const docs = catalog.items.filter((d) => d.status === "completed");
  await db.begin(async (t) => {
    const [actor] =
      await t`select p.user_id from platform.user_profile p join auth.users u on u.id=p.user_id where u.email=${process.env.GOVERNANCE_SEED_ACTOR_EMAIL || "admin@luyin.com"} and p.enabled`;
    if (!actor) throw Error("Authorized seed actor not found");
    const companies =
      await t`select id,name from public.company where kind='营销法人' order by id`;
    async function item(
      c,
      kind,
      key,
      category,
      title,
      status,
      basis,
      materials,
      finding,
      parentId = null,
      payload = {},
      refs = [],
    ) {
      const [r] =
        await t`insert into platform.governance_item(company_id,category,title,owner,deadline,basis,materials,finding,status,origin,created_by,data_source,source_refs,seed_key,scenario_version,item_kind,severity,parent_id,payload) values(${c.id},${category},${title},${kind === "important_risk" ? "公司负责人 / 集团监管岗" : "公司治理经办岗"},current_date+10,${basis},${materials},${finding},${status},${kind === "important_risk" || kind === "contract_risk" ? "group" : "company"},${actor.user_id},'synthetic_graph',${t.json(refs)},${key},2,${kind},${kind === "important_risk" ? "重要" : "一般"},${parentId},${t.json(payload)}) on conflict(seed_key) do nothing returning id::text`;
      if (r) {
        governance++;
        await t`insert into platform.governance_item_event(item_id,actor_id,actor_name,perspective,action,note) values(${r.id},${actor.user_id},'系统情景初始化',${kind === "important_risk" ? "group" : "company"},'创建差异化模拟情景',${finding})`;
        return r.id;
      }
      return (
        await t`select id::text from platform.governance_item where seed_key=${key}`
      )[0].id;
    }
    for (const c of companies) {
      const archives = [];
      for (let i = 0; i < archiveTemplates.length; i++) {
        const [title, keyword, content, materials, version] =
          archiveTemplates[i];
        const doc = docs.find((d) => d.filename.includes(keyword));
        const refs = doc
          ? [
              {
                documentId: doc.id,
                filename: doc.filename,
                ontologyVersion: doc.ontology_version,
                usage:
                  "真实图谱参考目录；具体公司适用性待确认，以下条款为演练规范样例",
              },
            ]
          : [];
        const id = await item(
          c,
          "archive",
          `v2:archive:${c.id}:${i}`,
          "公司治理档案",
          `${c.name} · ${title}`,
          "已归档",
          "规范性结构样例，未确认正式生效",
          materials,
          "只读治理基线；用于模拟管理动作与材料审核",
          null,
          {
            version,
            content,
            filename: `${c.name}-${version}.md`,
            effectiveStatus: "演练基线，待替换正式文件",
          },
          refs,
        );
        archives.push({ id, refs });
      }
      for (let j = 0; j < actions.length; j++) {
        const [category, title, archive, status, description, materials] =
          actions[j];
        const basis = `档案：${archiveTemplates[archive][0]}；${archiveTemplates[archive][4]}。本情景为模拟演练。`;
        const id = await item(
          c,
          "action",
          `v2:action:${c.id}:${j}`,
          category,
          `${c.name} · ${title}`,
          status,
          basis,
          materials,
          description,
          archives[archive].id,
          {
            requiredMaterials: materials.split("、"),
            actionCode: `GOV-${c.id}-${j + 1}`,
          },
          archives[archive].refs,
        );
        if (j === 3)
          await item(
            c,
            "rectification",
            `v2:rectify:${c.id}:3`,
            category,
            `${c.name} · 补齐制度版本确认人和签署记录`,
            "需整改",
            basis,
            "补正后的版本确认表、责任人签署、自查复核记录",
            "关联自查审核退回，补齐材料后提交公司复核",
            id,
            { groupEscalated: false, rootActionId: id },
            archives[archive].refs,
          );
        if ([1, 2, 4, 5].includes(j)) {
          const filename = `${c.name}-${j === 2 ? "董事会履职记录" : j === 1 ? "长期租赁决策材料" : j === 4 ? "岗位分离复核" : "回避说明"}-模拟.md`;
          const content = `# ${filename}\n本文件为虚拟演练材料，不代表真实治理行为。\n事项：${title}\n公司：${c.name}\n${description}\n${j === 2 ? "会议出席：董事3名；审议事项与表决记录齐备；决议签署栏缺少1名参会董事签名，执行责任尚未明确。" : j === 1 ? "已形成方案、租期与风险测算；是否属于保留事项尚待集团确认，不预设金额权限阈值。" : j === 4 ? "经办、审核和批准岗位已分别确认，由治理经办人复核。" : "申报人已说明关联关系，但回避期间记录尚待核对。"}`;
          const [n] =
            await t`select count(*)::int as n from platform.governance_attachment where item_id=${id}`;
          if (!n.n)
            await t`insert into platform.governance_attachment(item_id,filename,mime,size_bytes,sha256,content_base64,extracted_text,created_by) values(${id},${filename},'text/markdown',${Buffer.byteLength(content)},${createHash("sha256").update(content).digest("hex")},${Buffer.from(content).toString("base64")},${content},${actor.user_id})`;
        }
      }
      await item(
        c,
        "important_risk",
        `v2:risk:${c.id}:1`,
        "重大事项程序",
        `${c.name} · 对外担保事项前置决策证据缺项`,
        "需整改",
        "章程保留事项与重大事项决策样例要求",
        "担保议案、审批权限判断、董事会/股东会决议",
        "模拟重要风险：拟办理担保，材料中未见有权机构前置决策记录。集团先核查，不认定真实违规。",
        null,
        {
          riskLevel: "重要",
          impact: "可能涉及超越授权办理保留事项",
          suggestion: "暂缓后续办理，补齐权限判断与决议证据",
        },
        archives[0].refs,
      );
      await item(
        c,
        "important_risk",
        `v2:risk:${c.id}:2`,
        "治理责任与授权",
        `${c.name} · 已报告重大授权冲突的处置复核`,
        "整改待验收",
        "授权矩阵及职责分离样例要求",
        "修订后的授权矩阵、原授权撤销确认、复核记录",
        "模拟重要问题：原经办与审批权限重叠，公司已报告调整方案，待集团复核。",
        null,
        {
          riskLevel: "重要",
          impact: "授权冲突可能影响治理制衡",
          suggestion: "核对新授权生效时间及旧权限撤销证明",
        },
        archives[1].refs,
      );
      const products =
        await t`select m.id,m.name,m.code,m.list_price_cents from public.material m join public.uom u on u.id=m.uom_id where m.kind='product' and u.name='吨' and m.list_price_cents>0 order by m.id limit 3`;
      for (let k = 0; k < 3; k++) {
        const id = `TJ-SIM-V2-${c.id}-${k + 1}`;
        const ls = products.map((m, i) => {
          const original = Number(m.list_price_cents) / 100;
          return {
            id: String(i + 1),
            materialId: m.id,
            product: m.name,
            original,
            requested: Math.round(original * (0.94 + i * 0.01) * 100) / 100,
            qty: 10 + i * 5,
            status:
              k === 0
                ? "待审核"
                : k === 1
                  ? i === 0
                    ? "已通过"
                    : "待补正"
                  : "已驳回",
            version: 1,
            approved:
              k === 1 && i === 0
                ? Math.round(original * 0.96 * 100) / 100
                : null,
            reason: [
              "阶段性促销申请，需核对订单需求和存货",
              "客户集中采购申请，需核实可比历史价格",
              "渠道价格调整申请，缺少财务结算价证据",
            ][k],
            opinion:
              k === 0
                ? ""
                : k === 1
                  ? i === 0
                    ? "模拟历史：已核对专项范围，按本行价留档"
                    : "模拟历史：补充财务价格与申请证据"
                  : "模拟历史：申请理由与已提供证据不一致",
          };
        });
        const r =
          await t`insert into platform.price_application(id,company_id,lines,source,created_by,created_at) values(${id},${c.id},${t.json(ls)},'synthetic',${actor.user_id},now()-(${k}::int*interval '15 days')) on conflict(id) do nothing returning id`;
        if (r.length) {
          pricing++;
          await t`insert into platform.price_application_event(application_id,actor_id,action,note) values(${id},${actor.user_id},'初始化模拟历史批次','多行混合审核状态情景，非真实调价')`;
        }
      }
    }
    for (const [i, title, finding] of [
      [
        1,
        "年度框架合同与内部凭证索引缺失",
        "模拟：年度合同目录存在，但客户订单未形成合同、应收单与凭证的可追溯索引。",
      ],
      [
        2,
        "合同金额与账务科目口径复核",
        "模拟：合同为含税价格，应收单为不含税收入，需要核对税额与记账科目，不直接认定金额异常。",
      ],
      [
        3,
        "内部凭证借贷与合同附件核对",
        "模拟：需核验原始合同附件、内部应收凭证及借贷平衡，尚未形成正式违规结论。",
      ],
    ])
      await item(
        { id: 1, name: "鲁盐集团" },
        "contract_risk",
        `v2:contract:1:${i}`,
        "重大事项程序",
        title,
        "需整改",
        "集团合同、内部凭证与账务对应核查情景",
        "年度合同、内部业务凭证、应收单、记账凭证及分录",
        finding,
      );
  });
  console.log(
    JSON.stringify({
      insertedGovernance: governance,
      insertedPriceBatches: pricing,
      source: "明确标记的模拟情景；未改写ERP业务表",
    }),
  );
} finally {
  await db.end();
}
