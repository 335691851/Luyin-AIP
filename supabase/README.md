# Supabase数据库与运行权限

本目录管理本平台的结构与部署要求。ERP为已存在的上游系统；本仓库不包含完整ERP建库脚本或生产业务数据，也不保存Auth密码。

## 当前结构

- config.toml：CLI/本地环境默认配置，PostgreSQL 17、禁用自动seed；不是远端项目配置同步操作。
- migrations/20261104081849_platform_access_bootstrap.sql：role、user_profile、membership、access_audit，private platform schema及RLS。该迁移已经在当前已连接项目执行，不要重复手工执行。
- templates/runtime-roles.sql：DBA审核后可执行的权限组模板，不属于自动迁移，不含密码和LOGIN账号，不自动修改线上环境。

平台结构依赖auth.users和ERP public.company。运行还读取document、document_line、material、material_category、uom等ERP表。因此，supabase start/db reset不能被当成在空数据库创建完整ERP的方法；需要先取得并恢复上游ERP基线。当前正式环境直接连接既有远端项目，不依赖本地Docker数据库。

## 已有项目

1. 本机配置两个运行连接，执行npm run db:check。检查基础表、授权表及至少一个启用平台账号。
2. 超级用户已经存在且授权正确时不重复建账号；Supabase Auth账号、初始密码和公司授权记录不是结构迁移的种子数据。
3. 在DBA确认下创建两个独立的受限LOGIN角色；不使用postgres、superuser或bypassrls运行账号。
4. 审核templates/runtime-roles.sql，为可信后端建立NOLOGIN权限组：ERP组只能SELECT当前读取表；平台组只能读取现有授权结构。将对应组授予独立LOGIN账号，并为各LOGIN角色设置私密密码；账号密码仅进入本地或Vercel Secret。
5. 连接池用户名通常为LOGIN角色名.项目编号，主机与端口以Supabase Connect实际显示为准。修改URL后重启本地服务或重新部署，使缓存连接更新。
6. 执行npm run db:check -- --strict。当前角色模板只覆盖已实现的基础读取；新增库存、合同或写业务接口时，须在相应迁移中明确增加对象授权与RLS策略。

权限组的SELECT策略只给可信后端角色，不给anon/authenticated。每次应用请求仍由服务端检查Auth用户、平台角色和公司范围。直接Postgres连接没有浏览器JWT上下文，不能用auth.uid()不加处理地替代服务端授权。

不要将platform加入Data API exposed schemas。ERP和平台数据库必须与NEXT_PUBLIC_SUPABASE_URL的Auth项目匹配；当前迁移不支持把platform随意放到另一个空项目。

## 新环境与迁移历史

已有ERP远端还包含其他仓库管理的迁移。先核对完整迁移历史并与ERP维护方整理基线；本仓库单个bootstrap文件不能覆盖全部远端历史。账号及授权数据需要单独初始化，新的Auth UUID不能沿用旧项目UUID。

以下为运维步骤，CLI应使用团队固定并验证的版本，先查看--help；本轮核对了本机CLI的对应命令，未执行link、pull、push或repair：

```text
supabase --version
supabase link --project-ref <PROJECT_REF>
supabase migration list --linked
```

如果历史不一致，先整理上游历史并审查基线。db pull可能创建迁移并记录远端历史，不是无副作用的纯查询；不要在Vercel构建或无人审核的PR任务中调用。历史对齐后，新结构变更的流程是：

```text
supabase migration new <migration_name>
supabase db push --linked --dry-run
supabase db push --linked
```

实际执行前检查目标project ref、迁移清单和备份；不把数据库URL或密码放命令行参数和仓库文件。运行账号不应具备执行迁移所需的DDL权限；运维凭证与应用凭证分开。

参考：[迁移部署](https://supabase.com/docs/guides/deployment/database-migrations)、[数据库连接](https://supabase.com/docs/guides/database/connecting-to-postgres)、[API与RLS](https://supabase.com/docs/guides/api/securing-your-api)。
