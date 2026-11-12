"use client";
import { useMemo, useState } from "react";
import { Alert, Button, Input, Table, Tag, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import type { GovernanceItem } from "@/lib/governance-workflow";
import PricingAssessment from "./pricing-assessment";
export default function CompanyPolicyLibrary({
  rows,
  company,
  loading,
  error,
}: {
  rows: GovernanceItem[];
  company: string;
  loading: boolean;
  error: string;
}) {
  const [query, setQuery] = useState(""),
    [selection, setSelection] = useState("");
  const docs = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.company === company &&
          r.item_kind === "archive" &&
          r.payload?.policyLibrary,
      ),
    [rows, company],
  );
  const filtered = useMemo(
    () =>
      docs.filter((r) =>
        [
          r.title,
          r.payload?.area,
          r.payload?.subcategory,
          r.owner,
          r.payload?.code,
          r.payload?.content,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [docs, query],
  );
  const tree = useMemo(() => {
    const roots: DataNode[] = [];
    for (const doc of filtered) {
      const area = String(doc.payload?.area),
        sub = String(doc.payload?.subcategory);
      let root = roots.find((r) => r.key === `area:${area}`);
      if (!root) {
        root = { key: `area:${area}`, title: area, children: [] };
        roots.push(root);
      }
      let branch = root.children!.find((r) => r.key === `sub:${area}/${sub}`);
      if (!branch) {
        branch = { key: `sub:${area}/${sub}`, title: sub, children: [] };
        root.children!.push(branch);
      }
      branch.children!.push({ key: doc.id, title: doc.title, isLeaf: true });
    }
    return roots;
  }, [filtered]);
  const active = filtered.find((r) => r.id === selection);
  const visible = filtered.filter((r) =>
    selection.startsWith("area:")
      ? `area:${r.payload?.area}` === selection
      : selection.startsWith("sub:")
        ? `sub:${r.payload?.area}/${r.payload?.subcategory}` === selection
        : true,
  );
  return (
    <section className="company-policy-library" aria-label="公司制度树形知识库">
      <Alert
        type="warning"
        showIcon
        title={`${company}制度知识库 · 模拟制度草案`}
        description="按治理领域和业务子类组织。供流程演练和制度体系展示，尚未正式批准生效；具体适用要求以公司确认的有效文件为准。"
      />
      {error && <Alert type="error" title={error} />}
      <div className="policy-library-toolbar">
        <Input
          aria-label="搜索制度"
          placeholder="搜索制度名称、编号、部门或正文"
          value={query}
          allowClear
          onChange={(e) => {
            setQuery(e.target.value);
            setSelection("");
          }}
        />
        <span>
          {docs.length} 项制度 · {tree.length} 个匹配领域
        </span>
        <Button onClick={() => setSelection("")}>全部制度</Button>
      </div>
      <div className="policy-library-layout">
        <aside className="policy-library-tree" aria-label="制度分类目录">
          <Tree
            key={`${query}:${docs.length}`}
            showLine
            defaultExpandAll
            treeData={tree}
            selectedKeys={selection ? [selection] : []}
            onSelect={(keys) => setSelection(String(keys[0] || ""))}
          />
        </aside>
        <div className="policy-library-content">
          {active ? (
            <article>
              <Tag color="orange">模拟草案 · 未正式生效</Tag>
              <h2>{active.title}</h2>
              <p>
                {active.payload?.code} · {active.payload?.version}
              </p>
              <p>
                <b>责任部门：</b>
                {active.owner}　<b>适用范围：</b>
                {active.payload?.scope}
              </p>
              <p>
                <b>分类：</b>
                {active.payload?.area} / {active.payload?.subcategory}
              </p>
              <a
                download={active.payload?.filename}
                href={
                  "data:text/markdown;charset=utf-8," +
                  encodeURIComponent(active.payload?.content || "")
                }
              >
                下载制度样例
              </a>
              <PricingAssessment
                text={active.payload?.content || ""}
                label="模拟制度正文"
              />
            </article>
          ) : (
            <>
              <h2>
                {selection
                  ? String(
                      tree
                        .flatMap((r) => [r, ...(r.children || [])])
                        .find((r) => r.key === selection)?.title || "制度目录",
                    )
                  : "制度分类总览"}
              </h2>
              <p className="muted">
                展开左侧领域、子类查看文件，点击制度阅读正文及配套材料。
              </p>
              <Table
                rowKey="id"
                loading={loading}
                dataSource={visible}
                pagination={{ pageSize: 8 }}
                scroll={{ x: 650 }}
                columns={[
                  {
                    title: "制度名称",
                    render: (_, r) => (
                      <Button type="link" onClick={() => setSelection(r.id)}>
                        {r.title}
                      </Button>
                    ),
                  },
                  { title: "制度编号", render: (_, r) => r.payload?.code },
                  { title: "责任部门", dataIndex: "owner" },
                  {
                    title: "版本状态",
                    render: () => <Tag color="orange">V1.0 演练草案</Tag>,
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
