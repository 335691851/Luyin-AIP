"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AccessState } from "./access-controls";
import type { Sale } from "@/lib/report-model";
type Report = {
  mode: "demo" | "live";
  rows: Sale[];
  latestMonth?: string | null;
};
type Entry = { expires: number; value: Promise<Report> };
const WorkspaceContext = createContext<{
  perspective: "group" | "company";
  setPerspective: (v: "group" | "company") => void;
  governanceCompany: string;
  setGovernanceCompany: (v: string) => void;
  data: AccessState | null;
  reports: Map<string, Entry>;
} | null>(null);
export function WorkspaceSession({
  initial,
  children,
}: {
  initial: AccessState | null;
  children: React.ReactNode;
}) {
  const [perspective, setPerspective] = useState<"group" | "company">("group");
  const [governanceCompany, setGovernanceCompany] = useState("");
  const [data, setData] = useState(initial);
  const reports = useRef(new Map<string, Entry>());
  useEffect(() => {
    const ctrl = new AbortController();
    let pending = false,
      last = initial ? Date.now() : 0;
    const refresh = async () => {
      if (pending || Date.now() - last < 30000) return;
      pending = true;
      try {
        const r = await fetch("/api/access", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (r.status === 401 || r.status === 403) {
          reports.current.clear();
          setData(null);
          location.replace("/login");
          return;
        }
        if (r.ok) {
          setData(await r.json());
          last = Date.now();
        }
      } catch {
      } finally {
        pending = false;
      }
    };
    if (!initial) void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    window.addEventListener("focus", refresh);
    return () => {
      ctrl.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [initial]);
  const value = useMemo(
    () => ({
      data,
      reports: reports.current,
      perspective,
      setPerspective,
      governanceCompany,
      setGovernanceCompany,
    }),
    [data, perspective, governanceCompany],
  );
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  return useContext(WorkspaceContext);
}
export function useReportLoader() {
  const workspace = useWorkspace();
  const local = useRef(new Map<string, Entry>());
  const store = workspace?.reports || local.current;
  return useMemo(
    () => async (query: string, scope: string) => {
      const key = scope + "|" + query,
        cached = store.get(key);
      if (cached && cached.expires > Date.now()) return cached.value;
      if (store.size >= 32) store.delete(store.keys().next().value!);
      const entry: Entry = {
        expires: Date.now() + 30000,
        value: Promise.resolve(null as unknown as Report),
      };
      entry.value = fetch(`/api/reports?${query}`, { cache: "no-store" })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw Error(data.error || "报表查询失败");
          entry.expires = Date.now() + 30000;
          return data as Report;
        })
        .catch((e) => {
          if (store.get(key) === entry) store.delete(key);
          throw e;
        });
      store.set(key, entry);
      return entry.value;
    },
    [store],
  );
}
