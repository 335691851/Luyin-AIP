# 鲁银智能化平台

当前功能基线以 [V0.5业务迭代说明](docs/业务迭代V0.5说明.md) 为准；ERP尾货和备货填充要求见 [数据契约](docs/ERP数据补充与联调要求.md)。下文保留了分阶段实施记录，早期限制以V0.5说明覆盖。

单仓库Next.js应用，提供智能经营与监管风控两个工作空间。技术底座为Node.js 24、Next.js/React、Ant Design/ECharts、LangChain/DeepSeek及Supabase；通过GitHub连接Vercel部署，ERP和平台数据使用Supabase Postgres直连。

## 本地启动

在包含package.json的仓库根目录执行：

```text
npm ci
```

仅在.env.local不存在时，从.env.example复制模板并填写配置，不覆盖已有密钥。保持APP_DEMO_MODE=false使用真实登录，然后执行：

```text
npm run env:check
npm run dev
```

访问http://127.0.0.1:3100/login。Windows开发启动会读取系统代理，仅作用于当前进程；Vercel不运行这个开发脚本。样例模式只允许显式本地评审，生产与Vercel环境强制禁用。

## 云端部署

- [Vercel与Supabase部署要求](docs/deployment/README.md)
- [10项环境变量及获取位置](docs/deployment/environment-variables.md)
- [Supabase迁移、账号与权限要求](supabase/README.md)
- [生产变量模板](.env.production.example)

Vercel Root Directory选择仓库根目录，Framework为Next.js，Node为24.x。vercel.json已配置npm ci、生产变量检查、Next.js构建及与当前数据库同区域的cle1。无需另设Express服务、dist目录或固定监听端口。

Supabase当前使用已有ERP项目，private platform授权表依赖同项目public.company和auth.users。部署构建不自动迁移或重置数据库。既有账号及12法人授权可继续使用，不会因为推送代码自动创建其他用户。

## 验证

```text
npm run env:check -- --production
npm run db:check
npm run db:check -- --strict
npm test
npm run build
npm run typecheck
npm run test:e2e
```

环境检查不打印密钥；db:check只读检查连接、结构和运行权限。strict会拒绝高权限账号和ERP写权限。浏览器测试未指定目标时自动启动/复用本地3100；指定PLAYWRIGHT_BASE_URL时测试已有服务。真实账号验证使用npm run verify:live-access，并仅从当前进程环境读取LIVE_TEST_BASE_URL、LIVE_TEST_EMAIL、LIVE_TEST_PASSWORD；凭证、会话和登录截图不提交。

GitHub CI在Linux上使用Chromium与不可用的公开配置占位值，运行构建、单元测试和匿名权限边界；不读取线上业务、不调用模型、不自动发布或改库。只有样例模式启用时才运行旧样例场景，跳过项不计为通过。

## 业务设计与实现状态

当前目标设计见[docs/README.md](docs/README.md)：V0.4 PRD、106项功能细化及线上语义核验。已有真实Supabase登录、数据库授权、ERP自然月订单查询、固定报表/XLSX、有限LangChain问数与实际连接检测。

完整利润语义发布、多行调价持久化与真实AI评估、库存/年度合同检查、制度治理及文件归档仍按功能清单继续开发；本地样例流程不属于这些能力的正式验收。源ERP记录含模拟标识，真实连接与来源真实性应分别呈现。

监管风控新增`/governance/graph`知识图谱解析：直接读取已配置OntoRAG的本体、制度目录、实体关系和引用摘录，支持制度范围、类型与关键词筛选、一跳关系、属性及出处查看。领域本体中的对象关系与类型继承分别展示；制度概念不代表已发生的企业风险，多条号/条文冲突与未知页码明确提示。

`/api/knowledge-graph`仅允许真实登录且具有`admin.manage`权限的用户读取，尚无制度与租户的绑定时不向普通企业角色开放全域图谱。服务端分页适配OntoRAG每次500行限制，内存缓存最长30秒；完整读取超限时返回错误，不以不完整结果冒充全量。前端最多绘制220节点、列表前100项，可通过制度/类型/搜索缩小范围；详情最多120项文字属性、60条出处并标识截断。此功能不上传、修改图谱，不自动生成违规结论或发布治理规则，无新增数据库迁移。真实联调脚本`scripts/verify-knowledge-graph.mjs`从与`verify:live-access`相同的进程环境读取测试凭证。

## 仓库约定

提交package-lock.json与源码，使用npm ci安装。密钥放.env.local或Vercel Secrets；.env*只允许无密钥模板入库。.local、.vercel、evidence、测试结果和Supabase临时文件均被忽略。源码不依赖本机C盘目录，历史资料路径仅见业务文档。

### 线上报表验收

`scripts/verify-live-reports.mjs`使用进程变量`LIVE_TEST_EMAIL`、`LIVE_TEST_PASSWORD`及可选`LIVE_TEST_BASE_URL`运行真实登录验收，不写入凭证。它使用只读SQL独立汇总2026-10销售订单，核对API行数与收入、页面合计、订单明细抽屉、XLSX下载、分类模板、关键词与法人筛选，并检查成本缺失提示和移动端溢出。线上源库部分产品带“模拟”标识，页面对此提示；真实连接不等于来源记录已经核实为实际经营业绩。成本、区域未映射时不推算利润或区域。

报表首次进入时若当前自然月无订单，会在授权法人范围内查询最近有已审核订单的月份并自动加载；用户手动选择期间后不自动改写选择。月份、法人变化会重新只读查询ERP，关键词和模板变化会自动重算当前查询结果。加载中显示计算状态，失败显示错误，无数据时明确说明并提供最近有数据月份入口，接口及前端禁用报表响应缓存。端到端脚本包含无数据月份保持选择、切换有数据月份自动恢复的验证。

### 产销协同建议处理

正式模式读取ERP成品、吨单位库存余额与流水，计算尾库核查和库存订单覆盖候选；每类最多100项，界面每页6项。法人过滤在服务端先应用授权范围，再计算；备货缺口所需需求计划、在途、产能尚未映射，因此不生成。60天覆盖为试运行分析参数，库存流水最大日期不是余额快照日期，不认定为真实滞销。

建议详情支持LangChain调用DeepSeek生成解释，模型只有给定事实、规则和数据局限，没有ERP写工具。用户可同意、否决、待定并填写依据；写入`platform.coordination_review`及追加的`coordination_review_event`，保留AI文本、模型、证据快照、处理人、时间和版本。使用证据指纹及版本冲突检查，旧页面不能覆盖新处理结果。采纳建议不会自动生成销售、调拨或生产单据。

结构见`supabase/migrations/20261105010000_coordination_review.sql`，本次已在当前平台数据库事务应用；迁移仅创建平台表，不修改ERP业务记录。未来使用Supabase CLI前须按`supabase/README.md`对齐既有手工迁移历史；构建不自动迁移。运行角色需要新表读写与事件序列权限。

真实验证脚本`scripts/verify-live-coordination.mjs`使用进程环境中的`LIVE_TEST_EMAIL`和`LIVE_TEST_PASSWORD`；验证真实ERP候选、DeepSeek调用、待定保存、刷新后历史及AI快照、越权范围拒绝、旧版本冲突和移动端。该验证会留下一条明确标注“端到端联调核查”的待定记录，不自动批准真实业务。

### 工作区交互响应

经营、监管及管理后台使用持久化布局，首次进入由服务端验证身份并注入权限状态；菜单导航复用该状态，不再每页串行调用权限API。权限在窗口重新聚焦（至少30秒间隔）与每60秒后台复核，失效跳转登录。页面按已确认权限显示，所有数据及写操作API继续独立读取真实身份与数据库授权，布局状态不是数据授权依据。服务端身份查询仅通过React cache在一次渲染内去重，不跨请求或跨用户缓存。

报表查询在同一浏览器工作区内以用户、角色、法人授权、权限和筛选条件为键，复用最多30秒的成功结果，并合并相同的在途请求；缓存不写入localStorage，退出或刷新销毁。切换模板与报表页可复用，未查询过的条件仍自动请求ERP；需要即时读取可点击页面刷新。较重业务组件按需加载。验证脚本`scripts/verify-navigation.mjs`检查菜单切换耗时、重复权限/报表请求、未缓存月份读取；凭证只从进程变量读取。

### 监管与公司自治理双视角

监管工作区右上角提供集团监管/公司治理与自查视角；视角与当前公司在工作区内保留，切换菜单不更换登录账号或提升权限。集团范围用户且有治理查看权限可使用集团视角，集团审核仍需`governance.review`；企业经办需要`governance.create`。公司视角必选一个已授权法人，集团查询可汇总授权成员，服务端不因父子公司名称自动扩大权限。

集团菜单包括监管总览、风险问题、治理审核、整改督办及集团合同风险；公司菜单包括治理工作台、档案、职责授权、重大事项、会议履职、自查和整改反馈，不展示集团审核或集团图谱。视角切换不替代正式账号授权。

新建`platform.governance_item`及`governance_item_event`，结构见`supabase/migrations/20261105020000_governance_workflow.sql`，已在当前平台数据库事务应用。公司提交后待审核；集团可归档通过、要求整改、退回补正或不予通过；公司补正/整改反馈后由集团复审或验收销项。材料仅记录引用与说明，尚不支持上传；制度与公司适用性、有效版本未发布前，不自动认定违规或代替正式治理决议。每次写入校验视角权限、法人范围、状态和版本，并追加办理事件。

`scripts/verify-governance-perspectives.mjs`使用进程中的测试凭证验证不同菜单、公司提交、集团要求整改、公司反馈、集团验收、事件留痕和越权拒绝。会留下明确标为“联调核查、非正式治理事项”的测试记录，不代表真实合规结论。

### 业务数据表格与每日销售日报

销售报表表格独占报表内容宽度，图表统一排在下方。每日销售日报增加月份内的独立日期筛选，默认本月查询结果中最近有订单的日期；按ERP父子分类展示分类/品种、本日量、月初至选择日累计、年初至选择日累计。日报接口`/api/reports/daily`在授权范围内只读聚合全年订单，不以当月明细推算全年累计，支持相同条件的XLSX下载。盐源/包装“其中”表是交叉结构，不能再次计入总计；未知盐源不按产品名称推断。非吨单位影响的期间显示空值，未自动换算。

`scripts/verify-daily-sales.mjs`验证匿名拒绝、独立SQL对账、XLSX与页面同口径、表格全宽/图表下置、二级日期自动计算、无效日期与越权拒绝、移动端溢出。进程凭证与其他线上测试相同；此测试不写ERP。

### 监管演练数据与来源

已通过`scripts/seed-governance-exercises.mjs`向当前平台数据库创建66条演练事项，覆盖11家授权下级单位、五个治理领域和年度框架合同核查，包含待审核、待补正、需整改、整改待验收、已归档、已闭环、已驳回。均为虚拟情景，不能据此认定公司风险或违规。制度来源引用的是线上OntoRAG中5份真实文件目录，适用单位、有效版本和具体条款尚未确认；来源真实不等于演练事实真实。

新增结构见`supabase/migrations/20261105030000_governance_data_provenance.sql`（已在平台数据库应用）：`data_source`、`source_refs`、唯一`seed_key`。人工登记默认为manual，演练数据标记synthetic_graph，办理后仍保留演练属性。页面可按来源过滤，统计注明含演练，详情展示来源文件标识；年度合同页展示登记核查线索，不声称已自动核验ERP合同原件。

种子脚本需运维数据库权限及进程变量`GOVERNANCE_SEED_ACTOR_EMAIL`，不自动创建用户，不修改ERP或OntoRAG；根据稳定seed_key去重，重复执行不会覆盖用户办理结果。可通过`GOVERNANCE_SOURCE_FILE`指定已核验的图谱目录JSON；无本地目录时从已配置OntoRAG读取。Windows外网请求沿用系统代理或Node环境代理。该脚本包含结构迁移，生产部署需先按Supabase说明对齐迁移历史，禁止在构建时自动执行。

`scripts/verify-governance-seeded-data.mjs`检查66条来源标记、11公司范围、图谱引用、来源筛选、合同/制度数据页，以及演练事项补正后来源属性与事件记录保留。

当前基础设施检查：1个有效平台用户、已有Supabase存储桶、数据库/DeepSeek/OntoRAG连接可用。文件原件上传归档与鉴权尚未接入；公司适用制度和有效版本尚无正式发布映射；真实经办人账号与责任分工、定时巡检和消息通知尚未配置。现有演练可直接运行，不需要新增云服务。
