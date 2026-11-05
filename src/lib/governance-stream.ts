export type GovernanceSource = {
  label: string;
  evidence: { quote: string; filename?: string; page?: string | null }[];
};
export type GovernanceStreamEvent =
  | { type: "status"; message: string }
  | { type: "sources"; graphStatus: string; sources: GovernanceSource[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

// Decode bytes incrementally: network chunks may split UTF-8 characters or JSON lines.
export async function readGovernanceStream(
  stream: ReadableStream<Uint8Array>,
  receive: (event: GovernanceStreamEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  const line = (value: string) => {
    if (!value.trim()) return;
    const event = JSON.parse(value) as GovernanceStreamEvent;
    if (event.type === "error") throw Error(event.message);
    receive(event);
    if (event.type === "done") completed = true;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = pending.indexOf("\n")) >= 0) {
        line(pending.slice(0, boundary));
        pending = pending.slice(boundary + 1);
      }
      if (done) break;
    }
    line(pending);
    if (!completed) throw Error("连接已中断，已生成内容已保留，请重新提问。");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
