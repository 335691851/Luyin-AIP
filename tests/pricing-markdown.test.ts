import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PricingAssessment from "../src/components/pricing-assessment";

describe("pricing assessment Markdown", () => {
  it("renders headings, lists, bold advice and GFM tables", () => {
    const html = renderToStaticMarkup(
      createElement(PricingAssessment, {
        text: "## 整批结论\n\n**需补正**\n\n- 补充库存\n\n| 产品 | 建议 |\n| --- | --- |\n| 食盐 | 核实 |",
      }),
    );
    expect(html).toContain("<h2>整批结论</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong");
    expect(html).toContain("<table>");
    expect(html).not.toContain("| --- |");
  });
  it("does not execute raw HTML or javascript links", () => {
    const html = renderToStaticMarkup(
      createElement(PricingAssessment, {
        text: "<script>alert(1)</script>\n\n[危险](javascript:alert(1))",
      }),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
