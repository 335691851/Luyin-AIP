"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const GovernanceWorkbench = dynamic(() => import("./governance-workbench"));
const KnowledgeGraph = dynamic(() => import("./knowledge-graph"));
const ReportCanvas = dynamic(() => import("./report-canvas"));
const AnnualReport = dynamic(() => import("./annual-report"));
const LivePricing = dynamic(() => import("./live-pricing"));
const PriceBatches = dynamic(() => import("./price-batches"));
import QuestionDrawer from "./question-drawer";
const CoordinationCards = dynamic(() => import("./coordination-cards"));
import { useReportLoader, useWorkspace } from "./workspace-session";
import { RolePreview, useAccess } from "./access-controls";
import { can, pagePermission, landing, inScope } from "@/lib/access";
import {
  Alert,
  App,
  Button,
  ConfigProvider,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tabs,
  Timeline,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import zhCN from "antd/locale/zh_CN";
import {
  AppstoreOutlined,
  BarChartOutlined,
  FileTextOutlined,
  AuditOutlined,
  DatabaseOutlined,
  SettingOutlined,
  SearchOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  RobotOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MenuOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import {
  companies,
  products,
  priceLines as initialLines,
  cases as initialCases,
  synonyms,
  governanceModules,
} from "@/lib/demo";
import type { PriceLine, GovernanceCase } from "@/lib/demo";
import {
  aggregateReview,
  nominalProfit,
  requireReview,
  monthCutoff,
  shanghaiToday,
  isTailStock,
} from "@/lib/domain";

type Sale = {
  id: string;
  date: string;
  company: string;
  department: string;
  product: string;
  category: string;
  region: string;
  qty: number;
  unit: string;
  revenue: number;
  unitCost: number | null;
  status: string;
};
type Status = {
  mode: "demo" | "live";
  integrations: { name: string; ready: boolean; note: string }[];
};
type Area = "operation" | "governance";
const money = (v: number | string | null | undefined) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const num = (v: number) =>
  v.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const tone = (s: string) =>
  /通过|完成|覆盖已确认|销项/.test(s)
    ? "green"
    : /驳回|缺少|不完整/.test(s)
      ? "red"
      : /补正|审核|核实/.test(s)
        ? "gold"
        : "default";
const badge = (s: string) => <Tag color={tone(s)}>{s}</Tag>;
const operationNav = [
  ["reports", "业务数据", <BarChartOutlined aria-hidden="true" key="r" />],
  ["profit", "名义利润分析", <FileTextOutlined aria-hidden="true" key="p" />],
  ["pricing", "调价辅助决策", <AuditOutlined aria-hidden="true" key="pr" />],
  [
    "coordination",
    "产销协同建议",
    <ApartmentOutlined aria-hidden="true" key="c" />,
  ],
] as const;
const governanceNav = [
  ["overview", "治理工作台", <AppstoreOutlined aria-hidden="true" key="g" />],
  [
    "contracts",
    "集团合同风险",
    <SafetyCertificateOutlined aria-hidden="true" key="co" />,
  ],
  [
    "archives",
    "公司治理档案",
    <ApartmentOutlined aria-hidden="true" key="ar" />,
  ],
  [
    "authority",
    "治理责任与授权",
    <AuditOutlined aria-hidden="true" key="au" />,
  ],
  ["major", "重大事项程序", <FileTextOutlined aria-hidden="true" key="ma" />],
  [
    "meetings",
    "会议决议与履职",
    <FileTextOutlined aria-hidden="true" key="me" />,
  ],
  [
    "checks",
    "制度与合规自查",
    <CheckCircleOutlined aria-hidden="true" key="ch" />,
  ],
  [
    "rectification",
    "问题整改",
    <ClockCircleOutlined aria-hidden="true" key="re" />,
  ],
  ["policies", "制度知识库", <DatabaseOutlined aria-hidden="true" key="po" />],
  ["graph", "知识图谱解析", <ApartmentOutlined aria-hidden="true" key="kg" />],
  ["assistant", "智能治理助手", <RobotOutlined aria-hidden="true" key="as" />],
] as const;
const moduleMap: Record<string, string> = {
  archives: "公司治理档案",
  authority: "治理责任与授权",
  major: "重大事项程序",
  meetings: "会议决议与履职记录",
  checks: "制度与合规自查",
  rectification: "问题整改",
  policies: "制度知识库",
};

export default function Platform(props: { area: Area; page: string }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#b3212b",
          borderRadius: 6,
          fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
          fontSize: 13,
          colorText: "#263040",
          colorBorder: "#e4e7ec",
        },
        components: {
          Table: {
            headerBg: "#f7f8fa",
            headerColor: "#667085",
            cellPaddingBlock: 13,
          },
          Button: { primaryShadow: "none" },
        },
      }}
    >
      <App>
        <Workspace {...props} />
      </App>
    </ConfigProvider>
  );
}

function Workspace({
  area,
  page: requestedPage,
}: {
  area: Area;
  page: string;
}) {
  const [viewReady, setViewReady] = useState(false);
  useEffect(() => setViewReady(true), []);
  const router = useRouter();
  const workspace = useWorkspace();
  const { message } = App.useApp();
  const accessData = useAccess();
  const loadReport = useReportLoader();
  const session = accessData?.session;
  const permittedCompanies = session?.companies || [];
  const canReview = can(session, "governance.review");
  const [status, setStatus] = useState<Status | null>(null),
    [sales, setSales] = useState<Sale[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const periodChosen = useRef(false);
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  const [month, setMonth] = useState("2026-10"),
    [company, setCompany] = useState(""),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState(false);
  const [reportPeriod, setReportPeriod] = useState("month");
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 651px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobile(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const [reportYear, setReportYear] = useState(shanghaiToday().slice(0, 4));
  const [lines, setLines] = useState<PriceLine[]>([]),
    [records, setRecords] = useState<GovernanceCase[]>([]),
    [selectedCase, setSelectedCase] = useState<GovernanceCase | null>(null),
    [opinion, setOpinion] = useState(""),
    [newPrice, setNewPrice] = useState(false),
    [newCase, setNewCase] = useState(false),
    [form] = Form.useForm(),
    [caseForm] = Form.useForm();
  const [caseStatus, setCaseStatus] = useState("");
  const [semantic, setSemantic] = useState(synonyms);
  const demo = status?.mode === "demo";
  const canGroup =
    session?.user.scope === "group" &&
    (can(session, "governance.view") || can(session, "admin.manage"));
  const perspective = canGroup ? workspace?.perspective || "group" : "company";
  const companyOptions = permittedCompanies.filter(
    (c) => !canGroup || c !== session?.user.company,
  );
  const governanceCompany = companyOptions.includes(
    workspace?.governanceCompany || "",
  )
    ? workspace!.governanceCompany
    : companyOptions.find((c) => c.includes("泰安")) ||
      companyOptions[0] ||
      session?.user.company ||
      "";
  const groupNav = [
    ["overview", "集团监管总览", <AppstoreOutlined key="go" />],
    ["risks", "监管风险问题", <SafetyCertificateOutlined key="ri" />],
    ["reviews", "治理事项审核", <AuditOutlined key="rv" />],
    ...governanceNav.filter((n) =>
      ["contracts", "policies", "graph"].includes(n[0]),
    ),
  ] as const;
  const companyNav = governanceNav.filter(
    (n) => !["contracts", "graph"].includes(n[0]),
  );
  const activeGovernanceNav = perspective === "group" ? groupNav : companyNav;
  const page =
    area === "governance" &&
    !activeGovernanceNav.some((n) => n[0] === requestedPage)
      ? activeGovernanceNav[0][0]
      : requestedPage;
  const nav = (
    area === "operation" ? operationNav : activeGovernanceNav
  ).filter((n) => can(session, pagePermission(area, n[0])));
  const title =
    page === "settings"
      ? "连接与集成"
      : page === "semantic"
        ? "问数语义建模"
        : nav.find((n) => n[0] === page)?.[1] || "页面未找到";
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((s) => {
        setStatus(s);
        if (s.mode === "demo") {
          let saved;
          try {
            saved = JSON.parse(localStorage.getItem("luyin-demo-v1") || "null");
          } catch {}
          setLines(saved?.lines || initialLines);
          setRecords(saved?.records || initialCases);
          setSemantic(saved?.semantic || synonyms);
        } else {
          if (!periodChosen.current) setMonth(shanghaiToday().slice(0, 7));
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!status || !accessData) return;
    if (status.mode !== "demo" && !["reports", "profit"].includes(page)) {
      setSales([]);
      setLoading(false);
      return;
    }
    if (
      area !== "operation" ||
      (!can(session, "sales.view") && !can(session, "profit.view"))
    ) {
      setSales([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSales([]);
    const annual =
      ["reports", "profit"].includes(page) && reportPeriod === "year";
    const query = new URLSearchParams(
      annual ? { year: reportYear } : { month },
    );
    if (company) query.set("company", company);
    loadReport(
      query.toString(),
      JSON.stringify([
        session?.user.id,
        session?.role.id,
        session?.companies,
        session?.permissions,
      ]),
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setSales(data.rows);
          setLatestMonth(
            data.latestMonth || data.rows[0]?.date.slice(0, 7) || null,
          );
          if (
            !periodChosen.current &&
            !annual &&
            !data.rows.length &&
            data.latestMonth &&
            data.latestMonth !== month
          ) {
            setMonth(data.latestMonth);
          }
          periodChosen.current = true;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    status,
    month,
    company,
    accessData,
    session,
    area,
    page,
    loadReport,
    reportPeriod,
    reportYear,
  ]);
  const persist = (
    newLines: PriceLine[],
    newRecords: GovernanceCase[],
    newSemantic = semantic,
  ) => {
    if (!demo) return;
    try {
      localStorage.setItem(
        "luyin-demo-v1",
        JSON.stringify({
          lines: newLines,
          records: newRecords,
          semantic: newSemantic,
        }),
      );
    } catch {
      message.error("浏览器无法保存，本次修改未持久化");
    }
  };
  const filtered = useMemo(
    () =>
      sales.filter(
        (r) =>
          !!session &&
          inScope(session, r.company, r.department) &&
          r.date.startsWith(
            ["reports", "profit"].includes(page) && reportPeriod === "year"
              ? `${reportYear}-`
              : month,
          ) &&
          (!company || r.company === company) &&
          (!search ||
            [r.id, r.product, r.company, r.region].join(" ").includes(search)),
      ),
    [sales, month, company, search, session, page, reportPeriod, reportYear],
  );
  const module = moduleMap[page];
  const visibleCases = records.filter(
    (r) =>
      !!session &&
      inScope(session, r.company, r.department) &&
      (!module || r.module === module) &&
      (!company || r.company === company) &&
      (!caseStatus || r.status === caseStatus) &&
      (!search || [r.title, r.company, r.owner].join(" ").includes(search)),
  );
  const caseColumns: ColumnsType<GovernanceCase> = [
    {
      title: "治理事项",
      dataIndex: "title",
      width: 260,
      render: (v, r) => (
        <>
          <button
            type="button"
            className="text-action"
            onClick={() => {
              setSelectedCase(r);
              setOpinion("");
            }}
          >
            {v}
          </button>
          <small className="sub">{r.id}</small>
        </>
      ),
    },
    { title: "所属法人", dataIndex: "company", width: 200 },
    { title: "治理领域", dataIndex: "module", width: 170 },
    { title: "责任人", dataIndex: "owner", width: 120 },
    { title: "办理期限", dataIndex: "deadline", width: 120 },
    { title: "状态", dataIndex: "status", width: 110, render: badge },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, r) => (
        <Button
          type="link"
          onClick={() => {
            setSelectedCase(r);
            setOpinion("");
          }}
        >
          查看事项
        </Button>
      ),
    },
  ];
  const demoGuard = (
    <Alert
      type="info"
      showIcon
      title="本地演示流程"
      description="以下记录为虚构样例，仅保存在当前浏览器；尚未写入ERP或平台数据库。"
    />
  );
  const emptyLive = (
    <Empty description="此模块的正式存储和权限接口正在接入；当前不展示演示记录。" />
  );
  if (!accessData)
    return (
      <div className="access-loading">
        <Spin /> 正在加载用户与权限…
      </div>
    );
  if (!session || !can(session, pagePermission(area, page)))
    return (
      <div className="access-denied">
        <header>
          <span className="seal">鲁</span>
          <b>鲁银智能化平台</b>
          <RolePreview data={accessData} />
        </header>
        <section className="panel setup-note">
          <h1>当前角色无此页面权限</h1>
          <p>
            {session
              ? `${session.user.name} / ${session.role.name}`
              : "预览用户已停用或身份失效"}
          </p>
          {session && <Link href={landing(session)}>进入本角色工作空间</Link>}
        </section>
      </div>
    );
  const navigation = (
    <>
      <div className="workspace-label">
        工作空间 <span>WORKSPACE</span>
      </div>
      <div className="platform-switch">
        {operationNav.some((n) =>
          can(session, pagePermission("operation", n[0])),
        ) && (
          <Link
            className={area === "operation" ? "active" : ""}
            onClick={() => setMobile(false)}
            href={
              can(session, "sales.view")
                ? "/operation/reports"
                : landing(session)
            }
          >
            智能经营
          </Link>
        )}
        {governanceNav.some((n) =>
          can(session, pagePermission("governance", n[0])),
        ) && (
          <Link
            className={area === "governance" ? "active" : ""}
            onClick={() => setMobile(false)}
            href={
              can(session, "governance.view")
                ? "/governance"
                : "/governance/contracts"
            }
          >
            监管风控
          </Link>
        )}
      </div>
      <div className="nav-caption">
        {area === "operation"
          ? "经营分析与辅助决策"
          : perspective === "group"
            ? "集团监督与问题处置"
            : "本企业治理与自查"}
      </div>
      <nav>
        {nav.map(([id, label, icon]) => (
          <Link
            key={id}
            className={page === id ? "nav-link active" : "nav-link"}
            href={`/${area}/${id === "overview" ? "" : id}`}
            onClick={() => setMobile(false)}
          >
            {icon}
            <span>{label}</span>
            {page === id && <span className="nav-dot" />}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <span className="status-dot" /> LangChain · DeepSeek Flash
        <small>鲁盐管理方 / 授权法人工作空间</small>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="app-company-logo">
            <Image
              src="/luyin-investment-logo.png"
              alt="鲁银集团 · 鲁银投资 LUYIN INVESTMENT"
              width={172}
              height={58}
              unoptimized
              preload
            />
          </div>
          <span className="brand-divider" />
          <strong>鲁银智能化平台</strong>
        </div>
        <div className="top-right">
          {area === "governance" && (
            <Space wrap className="governance-view-switch">
              <select
                className="governance-native-select"
                aria-label="监管工作视角"
                disabled={!viewReady}
                value={perspective}
                onChange={(e) => {
                  workspace?.setPerspective(
                    e.target.value as "group" | "company",
                  );
                  setCompany("");
                  router.replace("/governance");
                }}
              >
                {canGroup && <option value="group">集团监管视角</option>}
                <option value="company">公司治理与自查</option>
              </select>
              {perspective === "company" && (
                <select
                  className="governance-native-select governance-unit-select"
                  aria-label="当前治理公司"
                  disabled={!viewReady}
                  value={governanceCompany}
                  onChange={(e) =>
                    workspace?.setGovernanceCompany(e.target.value)
                  }
                >
                  {(companyOptions.length
                    ? companyOptions
                    : [governanceCompany]
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </Space>
          )}
          <span className="top-meta">经营有据 · 治理有序</span>
          <Tag color={demo ? "gold" : "green"}>
            {status ? (demo ? "本地演示空间" : "正式连接模式") : "连接检查中"}
          </Tag>
          {can(session, "admin.manage") && (
            <Link href="/admin/integrations" aria-label="进入管理后台">
              <SettingOutlined aria-hidden="true" />
            </Link>
          )}
          <Link className="avatar" href="/login" title={session.user.name}>
            管
          </Link>
          {!demo && (
            <Button
              size="small"
              onClick={async () => {
                try {
                  const response = await fetch("/api/auth", {
                    method: "DELETE",
                  });
                  if (!response.ok) throw Error("退出失败，请重试");
                  location.href = "/login";
                } catch {
                  message.error("退出失败，请重试");
                }
              }}
            >
              退出登录
            </Button>
          )}
        </div>
      </header>
      <div className="body-shell">
        <aside className="sidebar">{navigation}</aside>
        <Drawer
          className="mobile-navigation"
          rootClassName="mobile-navigation-root"
          title="工作导航"
          placement="left"
          size={288}
          open={mobile}
          onClose={() => setMobile(false)}
        >
          {navigation}
        </Drawer>
        <main className="main">
          <div className="contextbar">
            <Space>
              <Button
                className="mobile-toggle"
                aria-label="展开导航"
                aria-expanded={mobile}
                aria-haspopup="dialog"
                icon={<MenuOutlined aria-hidden="true" />}
                onClick={() => setMobile(!mobile)}
              />
              <span>
                {area === "operation"
                  ? "鲁银智能经营平台"
                  : "鲁银监管和风控平台"}
              </span>
              <span className="muted">/</span>
              <b>{title}</b>
            </Space>
            <div className="context-meta">
              <RolePreview data={accessData} />
              <span
                className="context-scope"
                title={`${session.user.company} · ${session.user.scope === "group" ? "鲁盐监管范围" : session.user.scope === "department" ? session.user.department : "本法人"}`}
              >
                {area === "governance" && perspective === "company"
                  ? governanceCompany
                  : session.user.company}{" "}
                ·{" "}
                {session.user.scope === "group"
                  ? "鲁盐监管范围"
                  : session.user.scope === "department"
                    ? session.user.department
                    : "本法人"}
              </span>
              <span className="muted context-date">
                {page === "graph"
                  ? "制度出处 · 关系解析"
                  : "自然日历 · 订单口径"}
              </span>
            </div>
          </div>
          <div className="page">
            <div className="page-heading compact-heading">
              <div>
                <h1>{title}</h1>
              </div>
              <Space>
                <Button
                  icon={<ReloadOutlined aria-hidden="true" />}
                  onClick={() => location.reload()}
                >
                  刷新
                </Button>
                {page === "pricing" && demo && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined aria-hidden="true" />}
                    disabled={!demo || !can(session, "price.create")}
                    onClick={() => setNewPrice(true)}
                  >
                    新建申请
                  </Button>
                )}
                {area === "governance" &&
                  demo &&
                  module &&
                  can(session, "governance.create") && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined aria-hidden="true" />}
                      disabled={!demo}
                      onClick={() => setNewCase(true)}
                    >
                      发起事项
                    </Button>
                  )}
              </Space>
            </div>
            {error && (
              <Alert
                className="section-gap"
                showIcon
                type="warning"
                title={error}
                action={<Link href="/login">登录 / 检查配置</Link>}
              />
            )}
            {demo && (
              <div className="mode-note">
                <span className="status-dot" />
                演示数据 · 非企业真实经营记录
                <span>销售按自然月统计 / 审批统一至鲁盐管理员</span>
              </div>
            )}
            {!["settings", "semantic", "assistant", "graph"].includes(page) && (
              <div className="filters">
                {area === "operation" &&
                  ["reports", "profit"].includes(page) && (
                    <label>
                      报表范围
                      <select
                        aria-label="报表范围"
                        className="period-select"
                        disabled={!status}
                        value={reportPeriod}
                        onChange={(e) => setReportPeriod(e.target.value)}
                      >
                        <option value="year">年度概览</option>
                        <option value="month">月度报表</option>
                      </select>
                    </label>
                  )}
                <label>
                  法人范围
                  <Select
                    aria-label="法人范围"
                    value={
                      area === "governance" && perspective === "company"
                        ? governanceCompany
                        : company
                    }
                    disabled={
                      area === "governance" && perspective === "company"
                    }
                    onChange={setCompany}
                    style={{ width: 220 }}
                    options={[
                      {
                        value: "",
                        label:
                          session.user.scope === "group"
                            ? "全部授权法人"
                            : "当前授权法人",
                      },
                      ...[
                        ...new Set(
                          sales
                            .map((r) => r.company)
                            .concat(permittedCompanies),
                        ),
                      ]
                        .filter((x) => permittedCompanies.includes(x))
                        .map((x) => ({ value: x, label: x })),
                    ]}
                  />
                </label>
                {area === "operation" &&
                  ["overview", "reports", "profit", "ask"].includes(page) && (
                    <label>
                      {reportPeriod === "year" &&
                      ["reports", "profit"].includes(page)
                        ? "统计年度"
                        : "业务期间"}
                      {reportPeriod === "year" &&
                      ["reports", "profit"].includes(page) ? (
                        <select
                          aria-label="统计年度"
                          className="period-select"
                          disabled={!status}
                          value={reportYear}
                          onChange={(e) => setReportYear(e.target.value)}
                        >
                          {Array.from({ length: 10 }, (_, i) => {
                            const year = String(
                              Number(shanghaiToday().slice(0, 4)) - i,
                            );
                            return (
                              <option key={year} value={year}>
                                {year}年
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input
                          aria-label="业务期间"
                          type="month"
                          value={month}
                          onChange={(e) => {
                            periodChosen.current = true;
                            setMonth(e.target.value);
                          }}
                        />
                      )}
                    </label>
                  )}
                <span className="filter-spacer" />
                <Input
                  aria-label="搜索当前列表"
                  prefix={<SearchOutlined aria-hidden="true" />}
                  placeholder="搜索产品、事项或编号"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: 245 }}
                />
              </div>
            )}
            {(page === "reports" || page === "profit") &&
              (reportPeriod === "year" ? (
                <AnnualReport
                  sales={filtered}
                  year={reportYear}
                  company={company}
                  search={search}
                  profit={can(session, "profit.view")}
                  loading={loading}
                  error={error}
                  demo={demo}
                  canExport={can(session, "data.export")}
                />
              ) : (
                <ReportCanvas
                  key={page}
                  errorMessage={error}
                  latestMonth={latestMonth}
                  onLatest={() => {
                    periodChosen.current = true;
                    if (latestMonth) setMonth(latestMonth);
                  }}
                  variant={page === "profit" ? "profit" : "sales"}
                  sales={filtered}
                  month={month}
                  company={
                    company ||
                    (session.user.scope !== "group" ? session.user.company : "")
                  }
                  search={search}
                  demo={demo}
                  loading={loading}
                  canExport={can(session, "data.export")}
                />
              ))}
            {page === "pricing" && !demo && (
              <LivePricing
                company={company}
                companies={permittedCompanies}
                search={search}
                canCreate={can(session, "price.create")}
                canReview={can(session, "price.review")}
              />
            )}
            {page === "pricing" && demo && (
              <PriceBatches
                lines={lines.filter((l) =>
                  inScope(session, l.company, l.department),
                )}
                canReview={can(session, "price.review")}
                canCreate={can(session, "price.create")}
                onChange={(next) => {
                  const replacements = new Map(next.map((l) => [l.id, l]));
                  const merged = lines.map((l) => replacements.get(l.id) || l);
                  setLines(merged);
                  persist(merged, records);
                }}
                demo={demo}
                company={company}
                search={search}
                sales={filtered}
              />
            )}
            {page === "coordination" && (
              <CoordinationCards
                demo={demo}
                allowedCompanies={
                  session.user.scope === "department" ? [] : permittedCompanies
                }
                canFeedback={can(session, "coordination.feedback")}
                company={company}
                search={search}
              />
            )}
            {area === "governance" && demo && page === "overview" && (
              <>
                <div className="kpi-row">
                  {[
                    [
                      "待管理员审核",
                      records.filter(
                        (r) =>
                          inScope(session, r.company, r.department) &&
                          r.status === "待审核",
                      ).length,
                      "单级审批",
                    ],
                    [
                      "需补正材料",
                      records.filter(
                        (r) =>
                          inScope(session, r.company, r.department) &&
                          r.status === "待补正",
                      ).length,
                      "一次列明缺项",
                    ],
                    [
                      "治理事项",
                      records.filter((r) =>
                        inScope(session, r.company, r.department),
                      ).length,
                      "责任与证据留痕",
                    ],
                    ["制度知识", 0, "待导入有效版本"],
                  ].map(([label, v, n]) => (
                    <div className="kpi" key={label}>
                      <span className="kpi-label">{label}</span>
                      <strong>{v}</strong>
                      <small>{n}</small>
                    </div>
                  ))}
                </div>
                <section className="intro-strip">
                  <div className="intro-icon">
                    <SafetyCertificateOutlined aria-hidden="true" />
                  </div>
                  <div>
                    <b>聚焦规范治理，保留企业自治</b>
                    <p>
                      治理程序、责任授权、履职记录与制度自查，统一由鲁盐管理员审批。
                    </p>
                  </div>
                  <Link href="/governance/checks">
                    开展自查 <ArrowRightOutlined aria-hidden="true" />
                  </Link>
                </section>
                <section className="panel">
                  <div className="panel-title">
                    <h2>治理待办事项</h2>
                    <Tag>按授权范围查看</Tag>
                  </div>
                  {!demo ? (
                    emptyLive
                  ) : (
                    <Table
                      rowKey="id"
                      columns={caseColumns}
                      dataSource={visibleCases}
                      scroll={{ x: 1100 }}
                    />
                  )}
                </section>
              </>
            )}
            {area === "governance" &&
              demo &&
              module &&
              can(session, "governance.create") && (
                <>
                  {demo ? demoGuard : emptyLive}
                  <section className="panel section-gap">
                    <div className="panel-title">
                      <h2>{module}台账</h2>
                      <Select
                        aria-label="事项状态"
                        value={caseStatus}
                        onChange={setCaseStatus}
                        style={{ width: 140 }}
                        options={[
                          "",
                          "待审核",
                          "待补正",
                          "已通过",
                          "已驳回",
                        ].map((x) => ({ value: x, label: x || "全部状态" }))}
                      />
                    </div>
                    <Table
                      rowKey="id"
                      columns={caseColumns}
                      dataSource={visibleCases}
                      scroll={{ x: 1100 }}
                    />
                    <div className="table-note">
                      仅依照适用的有效章程、制度和授权开展辅助检查；平台审批不替代正式治理决议。
                    </div>
                  </section>
                </>
              )}
            {area === "governance" && !demo && page !== "graph" && (
              <GovernanceWorkbench
                authorizedCompanies={session.companies.filter(
                  (name) => name !== "山东省鲁盐集团有限公司",
                )}
                search={search}
                view={perspective}
                company={
                  perspective === "company" ? governanceCompany : company
                }
                page={page}
                canCreate={can(session, "governance.create")}
                canReview={can(session, "governance.review")}
              />
            )}
            {page === "contracts" && demo && (
              <Contracts
                demo={demo}
                company={company}
                search={search}
                allowedCompanies={
                  session.user.scope === "department" ? [] : permittedCompanies
                }
              />
            )}
            {area === "governance" && page === "graph" && <KnowledgeGraph />}
            {demo && page === "assistant" && (
              <section className="panel assistant-empty">
                <div className="ai-mark">
                  <RobotOutlined aria-hidden="true" />
                </div>
                <h2>智能治理助手</h2>
                <p>围绕具体事项检索适用制度、材料清单与办理程序。</p>
                <Alert
                  type="info"
                  showIcon
                  title="尚未绑定有效制度与文档权限"
                  description="接通OntoRAG并完成制度版本确认后开放治理查询。当前不根据演示制度输出合规结论。"
                />
                <Link href="/governance/settings">
                  查看连接与集成 <ArrowRightOutlined aria-hidden="true" />
                </Link>
              </section>
            )}
            {![
              "overview",
              "reports",
              "profit",
              "ask",
              "pricing",
              "coordination",
              "contracts",
              "assistant",
              "graph",
              "risks",
              "reviews",
              "semantic",
              "settings",
              ...Object.keys(moduleMap),
            ].includes(page) && <Empty description="页面不存在" />}
            <footer className="page-footer">
              <span>
                <DatabaseOutlined aria-hidden="true" />{" "}
                {demo ? "本地虚构样例 · 不代表真实业绩" : "授权数据工作空间"} ·
                不含自动业务执行
              </span>
              <span>鲁银智能化平台 / 鲁盐集团</span>
            </footer>
          </div>
        </main>
      </div>
      <QuestionDrawer
        key={JSON.stringify([
          session.user.id,
          session.role.id,
          session.user.scope,
          session.user.department,
          session.companies,
          session.permissions,
        ])}
        area={area}
        pageTitle={title}
        month={month}
        year={
          ["reports", "profit"].includes(page) && reportPeriod === "year"
            ? reportYear
            : undefined
        }
        company={company}
        demo={demo}
        enabled={area === "operation" && can(session, "question.use")}
      />
      <Drawer
        title="治理事项与材料"
        open={!!selectedCase}
        size={650}
        onClose={() => setSelectedCase(null)}
      >
        {selectedCase && (
          <>
            <Tag>{selectedCase.module}</Tag>
            {badge(selectedCase.status)}
            <h2>{selectedCase.title}</h2>
            <Descriptions
              column={1}
              items={[
                { key: "c", label: "法人", children: selectedCase.company },
                { key: "o", label: "责任人", children: selectedCase.owner },
                { key: "d", label: "期限", children: selectedCase.deadline },
              ]}
            />
            <h3>材料与办理说明</h3>
            <p>{selectedCase.evidence}</p>
            <Alert
              type="warning"
              title="待核实"
              description="尚未关联有效制度版本与真实附件，不能据此认定已合规。"
            />
            <h3>办理履历</h3>
            <Timeline
              items={selectedCase.history.map((h, i) => ({
                key: i,
                content: h,
              }))}
            />
            {selectedCase.status === "待审核" && canReview ? (
              <>
                <Input.TextArea
                  aria-label="治理审核意见"
                  placeholder="填写审批或补正意见"
                  value={opinion}
                  onChange={(e) => setOpinion(e.target.value)}
                />
                <Space className="section-gap">
                  {["已通过", "待补正", "已驳回"].map((action) => (
                    <Button
                      key={action}
                      type={action === "已通过" ? "primary" : "default"}
                      onClick={() => {
                        if (!opinion.trim())
                          return void message.warning("请填写审核意见");
                        const updated = {
                          ...selectedCase,
                          status: action,
                          history: [
                            ...selectedCase.history,
                            `演示管理员${action}：${opinion}`,
                          ],
                        };
                        const next = records.map((r) =>
                          r.id === updated.id ? updated : r,
                        );
                        setRecords(next);
                        persist(lines, next);
                        setSelectedCase(updated);
                        message.success("演示处理结果已保存");
                      }}
                    >
                      {action === "待补正"
                        ? "退回补正"
                        : action === "已通过"
                          ? "审核通过"
                          : "驳回"}
                    </Button>
                  ))}
                </Space>
              </>
            ) : (
              selectedCase.status === "待补正" &&
              can(session, "governance.create") && (
                <>
                  <Input.TextArea
                    aria-label="补正材料说明"
                    value={opinion}
                    onChange={(e) => setOpinion(e.target.value)}
                    placeholder="补充办理说明，真实文件归档待接入"
                  />
                  <Button
                    className="section-gap"
                    onClick={() => {
                      if (!opinion.trim())
                        return void message.warning("请填写补充说明");
                      const updated = {
                        ...selectedCase,
                        status: "待审核",
                        evidence: opinion,
                        history: [
                          ...selectedCase.history,
                          "企业补正并重新提交（演示）",
                        ],
                      };
                      const next = records.map((r) =>
                        r.id === updated.id ? updated : r,
                      );
                      setRecords(next);
                      persist(lines, next);
                      setSelectedCase(updated);
                    }}
                  >
                    补正并提交
                  </Button>
                </>
              )
            )}
          </>
        )}
      </Drawer>
      <Modal
        title="新建多行调价申请（本地演示）"
        open={newPrice}
        onCancel={() => setNewPrice(false)}
        width={850}
        onOk={() => form.submit()}
        okText="确认并提交演示申请"
      >
        <Alert
          title="首版支持手填及XLSX字段读取；原件归档、产品编码匹配待正式接入。"
          type="info"
        />
        <Upload
          accept=".xlsx"
          showUploadList={false}
          beforeUpload={async (file) => {
            const body = new FormData();
            body.append("file", file);
            try {
              const r = await fetch("/api/import", { method: "POST", body });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              form.setFieldValue("rows", d.rows);
              d.errors.length
                ? message.warning(d.errors.join("；"))
                : message.success(`已读取${d.rows.length}行，请人工确认`);
            } catch (e) {
              message.error((e as Error).message);
            }
            return false;
          }}
        >
          <Button
            className="section-gap"
            icon={<InboxOutlined aria-hidden="true" />}
          >
            导入XLSX（产品、原价、申请价、数量、理由）
          </Button>
        </Upload>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            company: permittedCompanies[0],
            rows: [
              {
                product: products[0],
                original: 1680,
                requested: 1600,
                qty: 10,
                reason: "",
              },
            ],
          }}
          onFinish={(values) => {
            const id = `TJ-DEMO-${Date.now()}`;
            const added: PriceLine[] = values.rows.map(
              (
                r: Omit<
                  PriceLine,
                  "id" | "application" | "company" | "status" | "version"
                >,
                i: number,
              ) => ({
                ...r,
                id: `${id}-${i + 1}`,
                application: id,
                company: values.company,
                department: session.user.department,
                status: "待审核",
                version: 1,
              }),
            );
            const next = [...added, ...lines];
            setLines(next);
            persist(next, records);
            setNewPrice(false);
            form.resetFields();
            message.success("申请已提交，每条明细独立待审");
          }}
        >
          <Form.Item
            name="company"
            label="申请法人"
            rules={[{ required: true }]}
          >
            <Select
              options={permittedCompanies.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.List
            name="rows"
            rules={[
              {
                validator: async (_, v) => {
                  if (!v?.length) throw Error("至少保留一条明细");
                },
              },
            ]}
          >
            {(fields, { add, remove }, errors) => (
              <>
                {fields.map((field) => (
                  <div className="price-form-row" key={field.key}>
                    <Form.Item
                      name={[field.name, "product"]}
                      label="产品"
                      rules={[{ required: true }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "original"]}
                      label="原价"
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={0.01} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "requested"]}
                      label="申请价"
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={0.01} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "qty"]}
                      label="吨位"
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={0.001} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "reason"]}
                      label="申请理由"
                      rules={[{ required: true, message: "请补充理由" }]}
                    >
                      <Input />
                    </Form.Item>
                    <Button
                      danger
                      type="text"
                      onClick={() => remove(field.name)}
                    >
                      移除
                    </Button>
                  </div>
                ))}
                <Form.ErrorList errors={errors.errors} />
                <Button
                  onClick={() => add({})}
                  icon={<PlusOutlined aria-hidden="true" />}
                >
                  添加明细行
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
      <Modal
        title="发起治理事项（本地演示）"
        open={newCase}
        onCancel={() => setNewCase(false)}
        onOk={() => caseForm.submit()}
      >
        <Form
          form={caseForm}
          layout="vertical"
          initialValues={{
            company: permittedCompanies[0],
            module: module || governanceModules[0],
          }}
          onFinish={(v) => {
            const r: GovernanceCase = {
              ...v,
              id: `G-DEMO-${Date.now()}`,
              department: session.user.department,
              status: "待审核",
              history: ["企业提交治理事项（演示）"],
            };
            const next = [r, ...records];
            setRecords(next);
            persist(lines, next);
            setNewCase(false);
            caseForm.resetFields();
            message.success("已提交演示事项至鲁盐管理员");
          }}
        >
          {[
            { name: "title", label: "事项名称" },
            { name: "owner", label: "责任人" },
            { name: "deadline", label: "办理期限" },
          ].map((f) => (
            <Form.Item
              key={f.name}
              name={f.name}
              label={f.label}
              rules={[{ required: true }]}
            >
              <Input type={f.name === "deadline" ? "date" : "text"} />
            </Form.Item>
          ))}
          <Form.Item name="company" label="所属法人">
            <Select
              options={permittedCompanies.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.Item name="module" label="治理领域">
            <Select
              options={governanceModules.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.Item
            name="evidence"
            label="事项及材料说明"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function Contracts({
  demo,
  allowedCompanies,
  company,
  search,
}: {
  demo: boolean;
  allowedCompanies: string[];
  company: string;
  search: string;
}) {
  const rows = demo
    ? [
        {
          id: "SO-DEMO-001",
          company: companies[3],
          customer: "演示客户甲",
          year: 2026,
          frame: "KF-DEMO-2026-01",
          status: "待确认签署",
        },
        {
          id: "SO-DEMO-002",
          company: companies[4],
          customer: "演示客户乙",
          year: 2026,
          frame: "未关联",
          status: "缺少年度框架",
        },
      ]
    : [];
  return (
    <>
      <Alert
        className="section-gap"
        type="info"
        showIcon
        title="年度框架必须完整覆盖订单自然年"
        description="核对正式签署、订单法人、客户与适用范围。普通单笔合同或只覆盖部分月份不能满足年度框架要求。"
      />
      <section className="panel">
        <div className="panel-title">
          <h2>订单年度框架覆盖检查</h2>
          <Tag>不作法律效力自动裁判</Tag>
        </div>
        <Table
          rowKey="id"
          dataSource={rows.filter(
            (r) =>
              allowedCompanies.includes(r.company) &&
              (!company || r.company === company) &&
              (!search ||
                [r.company, r.customer, r.id].join(" ").includes(search)),
          )}
          columns={[
            { title: "订单", dataIndex: "id" },
            { title: "法人", dataIndex: "company" },
            { title: "客户", dataIndex: "customer" },
            { title: "自然年", dataIndex: "year" },
            { title: "年度框架", dataIndex: "frame" },
            { title: "检查结果", dataIndex: "status", render: badge },
          ]}
        />
        <div className="table-note">
          演示检查记录，不代表已读取真实合同；正式原件、范围与签署确认尚待接入。
        </div>
      </section>
    </>
  );
}
