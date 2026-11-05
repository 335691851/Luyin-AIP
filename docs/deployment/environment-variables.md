# 部署环境变量

更新日期：2026-11-04。变量模板为仓库根目录[.env.production.example](../../.env.production.example)。在Vercel项目的Settings → Environment Variables分别配置Production和需要启用的Preview；实际值不写GitHub仓库。

## 应用运行变量

|变量|Vercel类型|要求与来源|生产值/格式|
|---|---|---|---|
|APP_DEMO_MODE|Config|本平台运行开关|false；生产和所有Vercel环境均禁止免登录样例模式|
|NEXT_PUBLIC_SUPABASE_URL|Config，浏览器可见|Supabase项目Connect/API设置|https://项目编号.supabase.co；对应当前ERP、平台及Auth所在项目|
|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|Config，浏览器可见|同项目Publishable key|sb_publishable_开头；不是secret/service_role密钥|
|ERP_READONLY_DATABASE_URL|Secret，仅服务端|Supabase Connect → Transaction pooler；专用只读LOGIN账号|postgresql://账号.项目编号:URL编码后的密码@连接池主机:6543/postgres|
|APP_DATABASE_URL|Secret，仅服务端|同一项目Transaction pooler；平台受限LOGIN账号|同样使用6543；可读取platform授权表，并按已实现业务获得必要权限|
|DEEPSEEK_BASE_URL|Config，仅服务端使用|DeepSeek API根地址|https://api.deepseek.com|
|DEEPSEEK_MODEL|Config，仅服务端使用|本期模型名称|deepseek-flash；问数和连接检测统一读取此配置|
|DEEPSEEK_API_KEY|Secret，仅服务端|DeepSeek开放平台API Keys|真实API密钥，不放NEXT_PUBLIC_变量|
|ONTORAG_BASE_URL|Config，仅服务端使用|已部署OntoRAG API域名|https://实际API域名；不含/mcp/、/v1或控制台项目路径|
|ONTORAG_SERVICE_API_KEY|Secret，仅服务端|与OntoRAG服务端配置一致的Bearer密钥|REST/MCP使用的有效服务密钥|

当前仓库采用现代Publishable key，不需要新增Supabase service_role/secret key即可运行现有登录、ERP读取和授权逻辑。未来文件归档等如引入管理API，需要单独设计，不应提前把服务端密钥放进发布密钥变量。

这11项用于运行应用。数据库密码与超级用户登录密码不是同一种密码；超级用户登录密码无需放Vercel变量，也不写迁移文件。运行连接模式与源数据is_simulated标识是独立概念。

## 环境范围

- Production：真实部署使用的项目、运行账号、模型和知识服务配置。
- Preview：部署预览也必须配置上述变量，APP_DEMO_MODE仍为false。建议使用隔离项目或受限授权；不能默认给任意分支/外部PR注入生产数据库和知识服务密钥。Preview的Auth与数据库也必须相互匹配。
- Development：维护在本机.env.local；该文件被Git与Vercel上传排除。不要覆盖已有文件。Windows系统代理只在npm run dev当前进程使用，不配置到Vercel。

NEXT_PUBLIC_变量会进入构建产物。修改Supabase URL或发布密钥后需重新部署；Vercel中修改其他变量也要让新部署使用新值。Secret值不会可靠地被env pull取回，首次填写时使用自己的密钥保管方式。[Vercel环境变量说明](https://vercel.com/docs/environment-variables)

## CLI与测试变量

以下不属于应用运行必填项，不填到普通Vercel运行环境：

|变量|使用场景|
|---|---|
|SUPABASE_ACCESS_TOKEN|运维机器上使用Supabase CLI登录/链接项目时按CLI支持方式配置|
|SUPABASE_DB_PASSWORD|运维机器使用CLI连接数据库时使用，不是APP_DATABASE_URL的替代配置|
|LIVE_TEST_BASE_URL|可选，真实账号验证脚本的目标；默认http://127.0.0.1:3100|
|LIVE_TEST_EMAIL、LIVE_TEST_PASSWORD|仅手工验证时通过当前进程环境传入，不提交、不保存登录截图或会话文件|
|PLAYWRIGHT_BASE_URL|可选，浏览器测试已有服务时的地址；不设置时自动启动本机3100服务|
|PLAYWRIGHT_CHANNEL|可选浏览器通道；Windows默认msedge，Linux CI默认内置Chromium|

GitHub CI不使用真实数据库/模型密钥，只做构建、单元测试和匿名权限边界测试。原生Vercel Git部署不需要在GitHub额外填写VERCEL_TOKEN、组织ID和项目ID；如未来改为CLI部署，再另行配置。

## 检查命令

在仓库根目录执行：

```text
npm run env:check -- --production
npm run db:check
npm run db:check -- --strict
```

env:check只检查必填项、格式、公开/私密变量边界、同项目约束和本机代理误配置，不验证密钥有效性。db:check只读检查连接、表权限、授权表与启用账号；strict另外要求ERP没有写权限、两个运行账号都不是superuser/bypassrls高权限角色。模型和知识服务的实际连通在登录后的管理后台检测。

本轮环境格式检查通过；现有数据库连接可用，但严格检查因运行账号仍有高权限而未通过。见[Supabase要求](../../supabase/README.md)的受限角色模板。
