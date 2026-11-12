import env from "@next/env";
import postgres from "postgres";
import { readFileSync } from "node:fs";
env.loadEnvConfig(process.cwd(), true);
const db = postgres(process.env.APP_DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});
try {
  await db.begin(async (t) => {
    const [company] =
      await t`select id,name from public.company where name='鲁盐泰安'`;
    const [actor] =
      await t`select p.user_id from platform.user_profile p join auth.users u on u.id=p.user_id where u.email='admin@luyin.com' and p.enabled`;
    if (!company || !actor) throw Error("Authorized company or actor missing");
    const docs = JSON.parse(
      readFileSync("data/governance-policy-samples.json", "utf8"),
    );
    for (const d of docs) {
      const content = `# ${d.title}（模拟制度）\n\n> 演练草案，未履行公司正式批准发布程序，不作为已生效制度或法律依据。\n\n## 一、目的与适用范围\n规范${d.area}领域的办理、审核及监督。适用于${d.scope}。\n\n## 二、职责分工\n${d.owner}负责组织实施和维护；经办岗位准备材料，审核岗位独立核验，有权批准人按正式授权决定；监督岗位跟踪异常。\n\n## 三、核心控制要求\n${d.rules
        .split("；")
        .map((r, i) => `${i + 1}. **${r}**。`)
        .join(
          "\n",
        )}\n\n## 四、办理与审核程序\n提出事项并核对适用版本 → 准备证据及权限依据 → 审核完整性和一致性 → 按权限批准后办理 → 留存执行证据。不得将本草案中的示例作为正式授权或具体金额阈值。\n\n## 五、必备材料与记录\n${d.materials
        .split("、")
        .map((m) => `- ${m}`)
        .join(
          "\n",
        )}\n材料应标注事项、形成时间、责任人及受控保存位置，签署与版本可追溯。\n\n## 六、异常处理与整改\n发现材料缺项先补充核实；确认实质问题后，关联原事项生成整改，明确责任人、期限和验收标准。重要问题按权限提请集团，未经复核不销项。\n\n## 七、档案与版本管理\n保留申请、审核、批准、执行和复核记录；修订应记录原因、批准主体及替代关系。保管期限和发布要求以正式确认文件为准。\n\n## 八、配套核查要点\n- 是否属于适用范围，权限和版本是否已确认？\n- ${d.rules.split("；")[0]}是否有对应材料支持？\n- ${d.materials}是否齐全且可追溯？\n- 异常是否记录来源并完成独立复核？\n`;
      await t`insert into platform.governance_item(company_id,category,title,owner,deadline,basis,materials,finding,status,origin,created_by,data_source,source_refs,seed_key,scenario_version,item_kind,payload) values(${company.id},'公司治理档案',${d.title},${d.owner},current_date+30,'模拟制度草案，待正式确认',${d.materials},'只读知识库演练条目，不代表企业已发布制度','已归档','company',${actor.user_id},'synthetic_graph','[]'::jsonb,${d.key},2,'archive',${t.json({ ...d, policyLibrary: true, content, filename: d.code + ".md", effectiveStatus: "模拟草案，未正式生效" })}) on conflict(seed_key) do nothing`;
    }
    const [count] =
      await t`select count(*)::int as documents,count(distinct payload->>'area')::int as domains from platform.governance_item where company_id=${company.id} and payload->>'policyLibrary'='true'`;
    console.log(JSON.stringify(count));
  });
} finally {
  await db.end();
}
