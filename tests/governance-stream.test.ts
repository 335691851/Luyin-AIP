import { describe, expect, it } from "vitest";
import {
  readGovernanceStream,
  type GovernanceStreamEvent,
} from "../src/lib/governance-stream";
const encoder = new TextEncoder();
function bytes(parts: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      parts.forEach((p) => c.enqueue(p));
      c.close();
    },
  });
}
describe("governance streaming protocol", () => {
  it("decodes split Chinese UTF-8 bytes and multiple lines", async () => {
    const data = encoder.encode(
      JSON.stringify({ type: "delta", text: "**治理**建议" }) +
        "\n" +
        JSON.stringify({ type: "done" }),
    );
    const events: GovernanceStreamEvent[] = [];
    await readGovernanceStream(
      bytes([...data].map((b) => new Uint8Array([b]))),
      (e) => events.push(e),
    );
    expect(events).toEqual([
      { type: "delta", text: "**治理**建议" },
      { type: "done" },
    ]);
  });
  it("delivers the first answer before the server completes", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    let first!: () => void;
    const arrived = new Promise<void>((resolve) => {
      first = resolve;
    });
    const events: GovernanceStreamEvent[] = [];
    const reading = readGovernanceStream(stream, (e) => {
      events.push(e);
      first();
    });
    controller.enqueue(encoder.encode('{"type":"delta","text":"先行结论"}\n'));
    await arrived;
    expect(events).toHaveLength(1);
    controller.enqueue(encoder.encode('{"type":"done"}\n'));
    controller.close();
    await reading;
  });
  it("preserves partial output and reports an interrupted connection", async () => {
    const events: GovernanceStreamEvent[] = [];
    await expect(
      readGovernanceStream(
        bytes([encoder.encode('{"type":"delta","text":"已生成"}\n')]),
        (e) => events.push(e),
      ),
    ).rejects.toThrow("连接已中断");
    expect(events).toEqual([{ type: "delta", text: "已生成" }]);
  });
  it("surfaces service failures and cancels the reader", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          encoder.encode('{"type":"error","message":"模型暂不可用"}\n'),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readGovernanceStream(stream, () => {})).rejects.toThrow(
      "模型暂不可用",
    );
    expect(cancelled).toBe(true);
  });
});
