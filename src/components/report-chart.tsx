"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, PieChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
echarts.use([
  BarChart,
  PieChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  SVGRenderer,
]);
export default function ReportChart({
  kind,
  data,
  unit = "元",
}: {
  kind: "pie" | "bar" | "column" | "line";
  data: { name: string; value: number | null }[];
  unit?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    const color = [
      "#b3212b",
      "#cd676e",
      "#d8a29b",
      "#596d81",
      "#829b9b",
      "#c9b58c",
      "#a3b1bf",
      "#e5c4c5",
    ];
    const common = {
      animation: false,
      color,
      textStyle: { fontFamily: "Microsoft YaHei, sans-serif" },
      tooltip: {
        trigger: kind === "pie" ? "item" : "axis",
        valueFormatter: (v: unknown) =>
          v == null
            ? "—"
            : `${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ${unit}`,
      },
    };
    chart.setOption(
      kind === "pie"
        ? {
            ...common,
            legend: {
              bottom: 0,
              type: "scroll",
              formatter: (name: string) =>
                name.replace(/山东省|有限公司|合资公司|山东/g, "").slice(0, 10),
              textStyle: { fontSize: 10, color: "#7b8796" },
            },
            series: [
              {
                type: "pie",
                radius: ["46%", "69%"],
                center: ["50%", "43%"],
                label: { show: false },
                itemStyle: { borderColor: "#fff", borderWidth: 3 },
                data,
              },
            ],
          }
        : {
            ...common,
            grid: {
              left: 15,
              right: 32,
              top: 15,
              bottom: 20,
              containLabel: true,
            },
            xAxis:
              kind !== "bar"
                ? {
                    type: "category",
                    data: data.map((d) =>
                      d.name
                        .replace(/山东省|有限公司|合资公司|山东/g, "")
                        .slice(-10),
                    ),
                    axisLabel: { fontSize: 9, color: "#7b8796", rotate: 25 },
                    axisTick: { show: false },
                  }
                : {
                    type: "value",
                    splitNumber: 3,
                    axisLabel: {
                      fontSize: 9,
                      color: "#9ba3af",
                      formatter: (v: number) =>
                        v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v),
                    },
                    splitLine: { lineStyle: { color: "#eef0f3" } },
                  },
            yAxis:
              kind !== "bar"
                ? {
                    type: "value",
                    splitNumber: 3,
                    axisLabel: { fontSize: 9, color: "#9ba3af" },
                    splitLine: { lineStyle: { color: "#eef0f3" } },
                  }
                : {
                    type: "category",
                    inverse: true,
                    data: data.map((d) =>
                      d.name
                        .replace(/山东省|有限公司|合资公司|山东/g, "")
                        .slice(0, 11),
                    ),
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { fontSize: 10, color: "#697586" },
                  },
            series: [
              {
                type: kind === "line" ? "line" : "bar",
                connectNulls: false,
                symbolSize: 6,
                barMaxWidth: 17,
                data: data.map((d, i) => ({
                  value: d.value,
                  itemStyle: {
                    color: kind === "line" ? color[0] : color[i % color.length],
                    borderRadius:
                      kind === "column" ? [3, 3, 0, 0] : [0, 3, 3, 0],
                  },
                })),
              },
            ],
          },
    );
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      chart.dispose();
    };
  }, [data, kind, unit]);
  return (
    <div
      ref={ref}
      className="report-chart"
      role="img"
      aria-label={`${kind === "pie" ? "占比饼图" : kind === "line" ? "月度趋势折线图" : "排名柱状图"}：${data.map((d) => `${d.name} ${d.value == null ? "无完整数据" : `${d.value.toFixed(2)}${unit}`}`).join("，")}`}
    />
  );
}
