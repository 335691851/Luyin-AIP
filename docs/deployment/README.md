# GitHub Vercel Supabase部署

本仓库为单个Next.js应用，GitHub仓库根目录就是Vercel Root Directory。Vercel运行页面和API，Supabase提供Postgres/Auth及后续私有文件存储；OntoRAG继续使用独立部署。不是把Next.js代码上传到Supabase运行。

## 1 仓库路径

```text
/
├─ package.json / package-lock.json / .nvmrc
├─ vercel.json                    Vercel框架、构建及函数区域
├─ .env.example                   本地变量模板
├─ .env.production.example        云端变量清单，无密钥
├─ .github/workflows/ci.yml        无生产凭证的仓库检查
├─ src/app/                       页面与Route Handler API
├─ src/server/                    服务端数据库、Auth、查询与配置
├─ scripts/check-env.mjs          配置格式检查
├─ scripts/check-db.mjs           数据库只读准入检查
├─ scripts/dev.mjs                本地启动与Windows代理适配
├─ supabase/config.toml           CLI/本地端口、PG17、禁用种子
├─ supabase/migrations/           受版本管理的平台结构迁移
├─ supabase/templates/            DBA审核使用的环境权限模板
└─ docs/deployment/               当前部署指南
```

构建和运行代码使用仓库相对路径、process.cwd和TypeScript的@/别名，不依赖C盘路径。文档中历史资料的本机路径仅为来源索引，不是部署时要读取的文件。Vercel不上传.env.local、.local、evidence、测试结果和数据库操作文件。

## 2 Vercel要求

|设置|配置|
|---|---|
|Framework Preset|Next.js|
|Root Directory|仓库根目录，即包含package.json和vercel.json的目录；不选src、src/app或supabase|
|Node.js Version|24.x，与package.json及.nvmrc一致|
|Install Command|npm ci|
|Build Command|npm run env:check -- --production && npm run build，已写入vercel.json|
|Output Directory|保持Next.js默认自动识别，不填dist或静态out|
|运行方式|Node.js Vercel Functions；API显式声明nodejs与maxDuration=60|
|区域|当前配置cle1，对应现有Supabase us-east-2；更换数据库区域时同步调整|
|Production Branch|选择实际发布分支；当前本地分支为master，若推送前改为main则在控制台选择main|
|应用变量|按[变量清单](environment-variables.md)分别设置Production/Preview|

Vercel使用框架构建产物，不运行npm run dev，也不通过npm start维持3100端口。仓库的本地生产预览脚本与云端函数运行方式不同。cle1与us-east-2的对应关系及就近数据库部署建议见[Vercel区域表](https://vercel.com/docs/regions)。

当前请求为同步短任务。模型已有超时，Route Handler设置60秒上限；这不是未来大批量分析的后台任务机制。当前XLSX导入限制2 MiB，在线导出限制4 MiB，避免超出[Vercel Functions请求/响应限制](https://vercel.com/docs/functions/limitations)。大文件应改为私有Storage直传/归档链接后才能开放。

## 3 Supabase要求

当前实现要求ERP public表、platform授权表与Auth属于同一个Supabase项目：平台迁移存在public.company及auth.users外键。两个运行连接使用不同数据库账号，分别限制ERP读取与平台访问；它们不是两套数据库项目。连接采用Transaction Pooler 6543、TLS、prepare=false与小连接池，适合Vercel无常驻进程的运行方式。[Supabase连接说明](https://supabase.com/docs/guides/database/connecting-to-postgres)

已有项目的ERP、Auth账号和平台授权已存在时，只需完成角色权限检查，不重复初始化或重建账号。新建空项目需要先恢复ERP基础结构与必要主数据，再应用平台迁移、建立Auth账号并绑定其真实UUID。详见[supabase/README.md](../../supabase/README.md)。

Supabase控制台Auth URL Configuration：Site URL填写实际生产HTTPS域名；Additional Redirect URLs添加明确的生产路径、受控Preview域名及需要保留的本机地址。当前密码登录使用同源/api/auth，不依赖虚构的OAuth回调路由；邮箱找回/邀请流程后续接入时需实现对应回调。[Auth重定向说明](https://supabase.com/docs/guides/auth/redirect-urls)

platform保持private schema，不加入Data API exposed schemas，不给anon/authenticated直接浏览器访问。未来文件证据需要private Storage bucket与访问策略；当前部署成功不代表文件归档模块已实现。OntoRAG API必须能由Vercel服务器通过HTTPS及Bearer密钥访问，不能只在本机代理环境可用。

## 4 GitHub与首次发布顺序

1. 提交源代码、package-lock、vercel.json、变量模板、supabase结构文件和文档；.env.local、.local和本地证据均已忽略。
2. GitHub连接仓库后运行Repository checks：npm ci、23项单元测试、生产构建、TypeScript、Linux Chromium匿名权限检查。CI不访问线上数据库或模型，不创建账号。
3. 在Supabase确认目标项目、现有迁移记录、受限运行账号与平台成员授权。先运行db:check --strict，处理权限不足或高权限提示。
4. 在Vercel导入GitHub仓库，设置上表及10项变量。使用已有ERP项目时无需在每次部署运行数据库迁移。
5. 配置Supabase生产域名，触发部署。在实际域名验证匿名拦截、指定账号登录、ERP报表、后台四项连接及退出。

Git集成会为实际生产分支部署Production、为其他分支生成Preview。仓库CI默认与Vercel Git构建并行，不能宣称已经配置了自动发布门禁；需要时在GitHub分支保护或Vercel Deployment Checks中显式选择检查。当前工作流不自动迁移数据库，也不调用Vercel发布API。[Vercel Git集成](https://vercel.com/docs/git)

生产密钥不进入外部PR的检查任务；Preview如需真实联调，配置独立/受限项目与文档权限，不能默认沿用生产写账号。

## 5 迁移与回滚

数据库迁移不放在npm build或Vercel buildCommand中，避免并行部署、预览和重试重复执行DDL。现有远端迁移还包含上游ERP历史，本仓库当前仅含平台bootstrap迁移：先核对并整理基线，再执行后续迁移，不能直接repair为已应用或对现有ERP执行reset。

代码回滚使用Vercel部署版本；数据库回滚与备份恢复单独评估，回滚代码不会自动撤销数据库结构。新增表/列优先采用兼容式迁移。当前任务没有推送GitHub、创建Vercel项目、执行权限模板或修改线上数据库。

## 6 验证记录和业务完成度

本轮本地环境格式检查、23项单元测试、生产构建及生产服务下2项匿名权限测试通过；9项仅用于样例模式的场景明确跳过。运行账号严格检查未通过：当前两个连接仍有高权限，ERP账号可写源表。未进行实际GitHub Actions运行或Vercel远程发布。

本轮完成的是部署环境和仓库适配。现有真实登录、ERP订单查询、有限问数、导出和连接检测可运行；V0.4中规划的完整利润语义、多行业务审批、库存/合同/治理智能体仍按功能清单继续开发，不能因为部署成功就标记全部交付。
