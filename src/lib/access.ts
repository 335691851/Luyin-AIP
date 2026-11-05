import { companies } from "./demo";
export const permissionLabels = {
  "sales.view": "业务数据",
  "profit.view": "名义利润分析",
  "price.view": "调价申请查看",
  "price.create": "调价申请发起",
  "price.review": "调价逐行审核",
  "coordination.view": "产销建议查看",
  "coordination.feedback": "产销处理反馈",
  "governance.view": "企业治理查看",
  "governance.create": "治理事项发起/补正",
  "governance.review": "治理审核/销项",
  "contracts.view": "集团合同风险",
  "data.export": "报表下载",
  "question.use": "智能问数",
  "admin.manage": "后台用户与配置管理",
} as const;
export type Permission = keyof typeof permissionLabels;
export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
};
export type LocalUser = {
  id: string;
  name: string;
  email: string;
  company: string;
  department: string;
  scope: "group" | "company" | "department";
  roleId: string;
  enabled: boolean;
};
export type AccessConfig = { version: 1; roles: Role[]; users: LocalUser[] };
export type AccessSession = {
  demo: boolean;
  preview: boolean;
  user: LocalUser;
  role: Role;
  companies: string[];
  permissions: Permission[];
};
export const defaultAccess: AccessConfig = {
  version: 1,
  roles: [
    {
      id: "luyan_admin",
      name: "鲁盐集团管理员",
      description: "监管范围内的业务、逐行审批和平台配置。",
      permissions: Object.keys(permissionLabels) as Permission[],
    },
    {
      id: "business_viewer",
      name: "集团经营查看人员",
      description: "查看经营报表与分析，不发起或审核业务。",
      permissions: [
        "sales.view",
        "profit.view",
        "price.view",
        "coordination.view",
        "data.export",
        "question.use",
      ],
    },
    {
      id: "group_supervisor",
      name: "集团监管人员",
      description: "查看合同与治理材料，不承担最终审批。",
      permissions: ["governance.view", "contracts.view", "question.use"],
    },
    {
      id: "marketing_operator",
      name: "营销部门经办人",
      description: "鲁盐法人内营销部门业务，发起调价，无审核权。",
      permissions: [
        "sales.view",
        "profit.view",
        "price.view",
        "price.create",
        "coordination.view",
        "question.use",
      ],
    },
    {
      id: "factory_manager",
      name: "工厂负责人",
      description: "本工厂经营分析、备货与尾库处理。",
      permissions: [
        "sales.view",
        "profit.view",
        "coordination.view",
        "coordination.feedback",
        "data.export",
        "question.use",
      ],
    },
    {
      id: "venture_operator",
      name: "合资公司经办人",
      description: "本法人经营分析、调价申请与治理事项办理。",
      permissions: [
        "sales.view",
        "profit.view",
        "price.view",
        "price.create",
        "coordination.view",
        "coordination.feedback",
        "governance.view",
        "governance.create",
        "question.use",
      ],
    },
  ],
  users: [
    {
      id: "demo-admin",
      name: "鲁盐管理员",
      email: "admin@example.test",
      company: companies[0],
      department: "集团管理",
      scope: "group",
      roleId: "luyan_admin",
      enabled: true,
    },
    {
      id: "demo-business",
      name: "经营查看人员",
      email: "business@example.test",
      company: companies[0],
      department: "经营管理",
      scope: "group",
      roleId: "business_viewer",
      enabled: true,
    },
    {
      id: "demo-supervisor",
      name: "监管人员",
      email: "supervisor@example.test",
      company: companies[0],
      department: "综合管理",
      scope: "group",
      roleId: "group_supervisor",
      enabled: true,
    },
    {
      id: "demo-marketing",
      name: "营销经办人",
      email: "marketing@example.test",
      company: companies[0],
      department: "营销部",
      scope: "department",
      roleId: "marketing_operator",
      enabled: true,
    },
    {
      id: "demo-factory",
      name: "岱岳工厂负责人",
      email: "factory@example.test",
      company: companies[1],
      department: "销售部",
      scope: "company",
      roleId: "factory_manager",
      enabled: true,
    },
    {
      id: "demo-venture",
      name: "泰安公司经办人",
      email: "venture@example.test",
      company: companies[3],
      department: "销售部",
      scope: "company",
      roleId: "venture_operator",
      enabled: true,
    },
  ],
};
export function resolveSession(
  config: AccessConfig,
  userId = "demo-admin",
): AccessSession {
  const user = config.users.find((u) => u.id === userId && u.enabled);
  if (!user) throw Error("FORBIDDEN");
  const role = config.roles.find((r) => r.id === user.roleId);
  if (!role) throw Error("FORBIDDEN");
  const scope =
    user.scope === "group" && user.company === companies[0]
      ? [...companies]
      : [user.company];
  return {
    demo: true,
    preview: user.id !== "demo-admin",
    user,
    role,
    companies: scope,
    permissions: role.permissions,
  };
}
export function can(
  session: AccessSession | null | undefined,
  permission: Permission,
) {
  return !!session?.permissions.includes(permission);
}
export function inScope(
  session: AccessSession,
  company: string,
  department?: string,
) {
  return (
    session.companies.includes(company) &&
    (session.user.scope !== "department" ||
      department === session.user.department)
  );
}
export function pagePermission(area: string, page: string): Permission {
  if (area === "admin") return "admin.manage";
  if (area === "governance" && page === "graph") return "admin.manage";
  if (area === "governance")
    return page === "contracts" ? "contracts.view" : "governance.view";
  return (
    (
      {
        reports: "sales.view",
        profit: "profit.view",
        pricing: "price.view",
        coordination: "coordination.view",
      } as Record<string, Permission>
    )[page] || "sales.view"
  );
}
export function landing(session: AccessSession) {
  if (can(session, "sales.view")) return "/operation/reports";
  if (can(session, "profit.view")) return "/operation/profit";
  if (can(session, "price.view")) return "/operation/pricing";
  if (can(session, "coordination.view")) return "/operation/coordination";
  if (can(session, "governance.view")) return "/governance";
  if (can(session, "contracts.view")) return "/governance/contracts";
  return "/operation/reports";
}
export function validateAccess(config: AccessConfig) {
  const ids = config.users.map((u) => u.id);
  if (
    new Set(config.users.map((u) => u.email.toLowerCase())).size !==
    config.users.length
  )
    throw Error("邮箱标识重复");
  if (new Set(ids).size !== ids.length) throw Error("用户ID重复");
  if (
    !config.users.some(
      (u) =>
        u.id === "demo-admin" &&
        u.enabled &&
        u.roleId === "luyan_admin" &&
        u.scope === "group" &&
        u.company === companies[0],
    )
  )
    throw Error("须保留初始鲁盐管理员及监管范围");
  for (const role of config.roles) {
    for (const [action, view] of [
      ["price.create", "price.view"],
      ["price.review", "price.view"],
      ["governance.create", "governance.view"],
      ["governance.review", "governance.view"],
      ["coordination.feedback", "coordination.view"],
    ] as [Permission, Permission][]) {
      if (role.permissions.includes(action) && !role.permissions.includes(view))
        throw Error("操作权限需要同时勾选对应查看权限");
    }
    if (
      role.id !== "luyan_admin" &&
      role.permissions.some((p) =>
        ["admin.manage", "price.review", "governance.review"].includes(p),
      )
    )
      throw Error("审核和后台管理权限仅分配给鲁盐集团管理员");
  }
  if (
    !config.roles
      .find((r) => r.id === "luyan_admin")
      ?.permissions.includes("admin.manage")
  )
    throw Error("不能移除管理员后台权限");
  for (const u of config.users) {
    if (
      !companies.includes(u.company) ||
      !config.roles.some((r) => r.id === u.roleId)
    )
      throw Error("法人或角色无效");
    if (u.scope === "group" && u.company !== companies[0])
      throw Error("仅鲁盐管理方法人可配置监管范围");
    if (u.scope === "department" && !u.department.trim())
      throw Error("部门范围必须指定部门");
    if (u.roleId === "luyan_admin" && u.company !== companies[0])
      throw Error("管理员须属于鲁盐管理方");
  }
}
