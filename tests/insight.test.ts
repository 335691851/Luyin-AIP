import { describe, expect, it } from "vitest";
import {
  numericValue,
  resultFields,
  shouldSendOnEnter,
  chartUnit,
  questionChartData,
} from "../src/lib/insight";
describe("insight interaction and result inference", () => {
  it("aggregates repeated monthly amounts without averaging ratios or filling missing values", () => {
    const answer = {
      answer: "",
      basis: "",
      query: "",
      sample: 3,
      rows: [
        { 月份: "1月", 销售额: "0.1", 利润率: 10 },
        { 月份: "1月", 销售额: "0.2", 利润率: 30 },
        { 月份: "2月", 销售额: null, 利润率: null },
      ],
    };
    expect(questionChartData(answer, "月份", "销售额").data).toEqual([
      { name: "1月", value: 0.3 },
      { name: "2月", value: null },
    ]);
    const ratio = questionChartData(answer, "月份", "利润率");
    expect(ratio.detail).toBe(true);
    expect(ratio.data).toHaveLength(3);
    expect(ratio.data[0].value).toBe(10);
  });
  it("only sends a plain Enter outside Chinese composition", () => {
    expect(
      shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false }),
    ).toBe(true);
    expect(
      shouldSendOnEnter({ key: "Enter", shiftKey: true, isComposing: false }),
    ).toBe(false);
    expect(
      shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: true }),
    ).toBe(false);
    expect(
      shouldSendOnEnter({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        keyCode: 229,
      }),
    ).toBe(false);
  });
  it("accepts numeric SQL strings, preserves null gaps and rejects dates or infinities", () => {
    expect(numericValue("123.45")).toBe(123.45);
    expect(numericValue(null)).toBeNull();
    expect(numericValue("2026-10")).toBeNull();
    expect(numericValue(Infinity)).toBeNull();
    expect(numericValue(" ")).toBeNull();
  });
  it("keeps identifiers out of chart metrics and permits sparse numeric results", () => {
    const fields = resultFields({
      answer: "",
      basis: "",
      query: "",
      sample: 2,
      columns: ["客户编号", "月份", "销售额", "利润"],
      rows: [
        { 客户编号: "123", 月份: "2026-01", 销售额: "100.5", 利润: null },
        { 客户编号: "456", 月份: "2026-02", 销售额: "200.5", 利润: -20 },
      ],
    });
    expect(fields.metrics).toEqual(["销售额", "利润"]);
    expect(fields.dimensions).toEqual(["客户编号", "月份"]);
  });
  it("does not invent tonnes or percentages for ambiguous SQL aliases", () => {
    expect(chartUnit("产品数量")).toBe("");
    expect(chartUnit("利润率")).toBe("");
    expect(chartUnit("利润率（%）")).toBe("%");
    expect(chartUnit("销售额")).toBe("元");
    expect(chartUnit("销量（吨）")).toBe("吨");
  });
});
