"use client";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { governanceNavigation } from "@/lib/governance-navigation";

export default function GovernanceNavigation({
  view,
  page,
  entries,
  onNavigate,
}: {
  view: "group" | "company";
  page: string;
  entries: readonly (readonly [string, string, ReactNode])[];
  onNavigate: () => void;
}) {
  const groups = governanceNavigation(view);
  const activeGroup = groups.find((g) => g.pages.includes(page))?.id || "";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    [activeGroup]: true,
  });
  const prefix = useId();
  useEffect(
    () => setExpanded((previous) => ({ ...previous, [activeGroup]: true })),
    [activeGroup],
  );
  const link = (
    [id, label, icon]: readonly [string, string, ReactNode],
    description?: string,
  ) => (
    <Link
      key={id}
      href={`/governance/${id === "overview" ? "" : id}`}
      onClick={onNavigate}
      className={page === id ? "nav-link active" : "nav-link"}
      aria-current={page === id ? "page" : undefined}
    >
      <span aria-hidden="true">{icon}</span>
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
      {page === id && <span className="nav-dot" />}
    </Link>
  );
  return (
    <nav
      className="governance-navigation"
      aria-label={view === "group" ? "集团监管业务导航" : "企业治理业务导航"}
    >
      {groups.map((group) => {
        const children = group.pages.flatMap((id) => {
          const entry = entries.find((e) => e[0] === id);
          return entry ? [entry] : [];
        });
        if (!children.length) return null;
        if (group.pages.length === 1)
          return (
            <div key={group.id} className="governance-nav-single">
              {view === "group" && (
                <div className="governance-nav-topic">{group.title}</div>
              )}
              {link(children[0], group.description)}
            </div>
          );
        return (
          <section key={group.id} className="governance-nav-group">
            <button
              type="button"
              className={
                group.id === activeGroup
                  ? "governance-nav-heading current"
                  : "governance-nav-heading"
              }
              aria-expanded={!!expanded[group.id]}
              aria-controls={`${prefix}-${group.id}`}
              onClick={() =>
                setExpanded((previous) => ({
                  ...previous,
                  [group.id]: !previous[group.id],
                }))
              }
            >
              <span>
                <b>{group.title}</b>
                <small>{group.description}</small>
              </span>
              <span aria-hidden="true">{expanded[group.id] ? "⌄" : "›"}</span>
            </button>
            <div
              id={`${prefix}-${group.id}`}
              className="governance-nav-children"
              hidden={!expanded[group.id]}
            >
              {group.sections
                ? group.sections.map((section) => {
                    const visible = children.filter((e) =>
                      section.pages.includes(e[0]),
                    );
                    return visible.length ? (
                      <div key={section.title}>
                        <div className="governance-nav-level">
                          {section.title}
                        </div>
                        {visible.map((e) => link(e))}
                      </div>
                    ) : null;
                  })
                : children.map((e) => link(e))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
