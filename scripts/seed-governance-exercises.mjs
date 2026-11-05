import nextEnv from "@next/env";
import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd(), true);
const db = postgres(process.env.APP_DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});
try {
  if (!process.env.GOVERNANCE_SEED_ACTOR_EMAIL)
    throw Error("Provide GOVERNANCE_SEED_ACTOR_EMAIL in process environment");
  const file =
    process.env.GOVERNANCE_SOURCE_FILE ||
    ".local/governance-live-documents.json";
  let catalog;
  if (existsSync(file))
    catalog = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  else {
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
    if (!r.ok) throw Error("Knowledge directory unavailable");
    catalog = await r.json();
  }
  const docs = catalog.items.filter((d) => d.status === "completed");
  const templates = [
    [
      "公司治理档案",
      "章程及治理机构任职资料完整性核查",
      "合规管理办法",
      "章程、治理机构任职文件、资料版本清单",
      "章程版本与任职资料未形成统一核对清单",
    ],
    [
      "治理责任与授权",
      "经理层授权范围与有效期复核",
      "内部控制审计制度",
      "授权文件、有效期台账、职责边界说明",
      "授权范围或有效期记录存在待补充项",
    ],
    [
      "重大事项程序",
      "重大事项集体决策程序资料自查",
      "全面风险控制管理办法",
      "决策权限清单、决策过程记录、适用制度说明",
      "需核查重大事项是否具备相应程序资料",
    ],
    [
      "会议决议与履职",
      "董事会决议及履职记录归档检查",
      "内部审计管理办法",
      "会议通知、议案、决议、履职记录索引",
      "会议及履职材料索引存在待核实环节",
    ],
    [
      "制度与合规自查",
      "年度合规自查与适用制度清单确认",
      "合规管理办法",
      "适用制度目录、自查底稿、问题清单",
      "部分制度的适用范围与现行有效版本尚待确认",
    ],
    [
      "制度与合规自查",
      "年度框架合同覆盖证据核验",
      "合同管理办法",
      "自然年年度框架合同目录、客户订单匹配记录",
      "年度框架合同与客户订单的覆盖关系需要核实",
    ],
  ];
  let inserted = 0;
  await db.begin(async (t) => {
    await t.unsafe(
      readFileSync(
        "supabase/migrations/20261105030000_governance_data_provenance.sql",
        "utf8",
      ).replace(/^\uFEFF/, ""),
    );
    const users =
      await t`select p.user_id,p.display_name from platform.user_profile p join auth.users a on a.id=p.user_id where a.email=${process.env.GOVERNANCE_SEED_ACTOR_EMAIL} and p.enabled=true`;
    if (users.length !== 1) throw Error("Seed actor missing");
    const actor = users[0];
    const companies =
      await t`select c.id,c.name from public.company c join platform.membership m on m.company_id=c.id where m.user_id=${actor.user_id} and m.enabled=true and c.parent_id is not null order by c.id`;
    const statuses = [
      "待审核",
      "待补正",
      "需整改",
      "整改待验收",
      "已闭环",
      "已归档",
      "已驳回",
    ];
    for (let i = 0; i < companies.length; i++)
      for (let j = 0; j < templates.length; j++) {
        const [category, title, keyword, materials, finding] = templates[j],
          doc = docs.find((d) => d.filename.includes(keyword));
        if (!doc) throw Error("Required knowledge document missing");
        const status = statuses[(i + j) % statuses.length],
          company = companies[i];
        const source = [
          {
            documentId: doc.id,
            filename: doc.filename,
            ontologyVersion: doc.ontology_version || "legal-audit-v1",
            usage:
              "制度核查候选来源，适用公司、有效版本和条款待人工确认；不作为已生效监管规则。",
          },
        ];
        const deadline = new Date();
        deadline.setUTCDate(
          deadline.getUTCDate() +
            (["需整改", "待补正"].includes(status) ? -3 : 10 + j),
        );
        const day = deadline.toISOString().slice(0, 10);
        const result =
          await t`insert into platform.governance_item(company_id,category,title,owner,deadline,basis,materials,finding,status,origin,created_by,data_source,source_refs,seed_key) values(${company.id},${category},${"[演练] " + title},${"公司治理经办岗（演练）"},${day},${"图谱目录参考候选：" + doc.filename + "。尚未确认对本公司的适用性、有效版本和具体条款；不据此认定违规。"},${"演练材料目录：" + materials + "。未上传任何正式文件，未绑定真实ERP订单或合同。"},${"演练假设：" + finding + "。这是虚拟创建的治理场景，非企业真实问题。"},${status},'company',${actor.user_id},'synthetic_graph',${t.json(source)},${"gov-exercise-v1:" + company.id + ":" + j}) on conflict(seed_key) do nothing returning id`;
        if (!result.length) continue;
        inserted++;
        const id = result[0].id;
        const flow = [
          [
            "company",
            "提交治理自查",
            "演练初始化：按图谱制度目录构造核查情景；尚未验证制度适用性或上传原始材料。",
          ],
        ];
        if (status === "待补正")
          flow.push([
            "group",
            "退回补正",
            "演练：请补充有效版本、适用范围和受控材料引用。",
          ]);
        if (["需整改", "整改待验收", "已闭环"].includes(status))
          flow.push([
            "group",
            "要求整改",
            "演练：明确责任人，核对材料目录并补齐证据；不认定真实违规。",
          ]);
        if (["整改待验收", "已闭环"].includes(status))
          flow.push([
            "company",
            "提交整改",
            "演练：已整理补正目录与整改说明，等待集团核对原件。",
          ]);
        if (status === "已闭环")
          flow.push([
            "group",
            "验收销项",
            "演练流程销项，不代表实际企业整改已验收。",
          ]);
        if (status === "已归档")
          flow.push([
            "group",
            "归档通过",
            "演练归档通过，不替代有效治理决议或制度适用确认。",
          ]);
        if (status === "已驳回")
          flow.push([
            "group",
            "不予通过",
            "演练：依据适用性尚未确认，退回重新核实，不作违规认定。",
          ]);
        for (const [perspective, action, note] of flow)
          await t`insert into platform.governance_item_event(item_id,actor_id,actor_name,perspective,action,note) values(${id},${actor.user_id},${actor.display_name + "（演练代录）"},${perspective},${action},${note})`;
      }
  });
  console.log(
    JSON.stringify({
      inserted,
      summary:
        await db`select data_source,status,count(*)::int from platform.governance_item group by data_source,status order by data_source,status`,
    }),
  );
} catch {
  console.error("Governance exercise seeding failed; transaction rolled back.");
  process.exitCode = 1;
} finally {
  await db.end();
}
