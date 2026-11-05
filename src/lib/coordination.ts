export type CoordinationCandidate = {
  id: string;
  evidenceKey: string;
  kind: "tail" | "clear" | "prepare";
  companyId: number;
  company: string;
  product: string;
  qty: number;
  facts: [string, string][];
  formula: string;
  source: string;
  suggestion: string;
  checkedAt: string;
  status: "待处理" | "同意" | "否决" | "待定";
  version: number;
  aiText: string | null;
};
export type CoordinationEvent = {
  id: string;
  suggestion_id: string;
  decision: string;
  note: string;
  actor_name: string;
  created_at: string;
  snapshot: CoordinationCandidate;
  ai_text: string | null;
};
