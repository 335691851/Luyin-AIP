"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  SVGRenderer,
]);
export default function QuestionChart({
  kind,
  data,
  metric,
  unit,
}: {
  kind: "bar" | "column" | "line" | "pie";
  data: { name: string; value: number | null }[];
  metric: string;
  unit: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const height =
    kind === "bar" ? Math.min(680, Math.max(300, data.length * 26 + 80)) : 340;
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const chart = echarts.init(el, undefined, { renderer: "svg" });
    function render() {
      const narrow = el.clientWidth < 500,
        horizontal = kind === "bar",
        pie = kind === "pie";
      const visibleBars = Math.max(
        6,
        Math.min(20, Math.floor((el.clientHeight - 80) / 26)),
      );
      const verticalZoom = horizontal && data.length > visibleBars;
      const color = [
        "#b3212b",
        "#cd676e",
        "#596d81",
        "#829b9b",
        "#c9b58c",
        "#a3b1bf",
      ];
      chart.setOption(
        {
          animation: false,
          color,
          textStyle: { fontFamily: "Microsoft YaHei,sans-serif" },
          tooltip: {
            trigger: pie ? "item" : "axis",
            renderMode: "richText",
            confine: true,
            valueFormatter: (v: unknown) =>
              v == null
                ? "—"
                : `${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}${unit}`,
          },
          ...(pie
            ? {
                legend: {
                  type: "scroll",
                  bottom: 0,
                  textStyle: { fontSize: 11 },
                  formatter: (name: string) =>
                    name.length > 14 ? name.slice(0, 14) + "…" : name,
                },
                series: [
                  {
                    name: metric,
                    type: "pie",
                    radius: ["35%", "65%"],
                    center: ["50%", "43%"],
                    label: { show: !narrow, formatter: "{d}%" },
                    data,
                    itemStyle: { borderColor: "#fff", borderWidth: 2 },
                  },
                ],
              }
            : {
                grid: {
                  left: horizontal ? (narrow ? 100 : 180) : 56,
                  right: verticalZoom ? 45 : 20,
                  top: 24,
                  bottom: !horizontal && data.length > 16 ? 65 : 40,
                },
                xAxis: horizontal
                  ? {
                      type: "value",
                      axisLabel: { fontSize: 10 },
                      splitLine: { lineStyle: { color: "#eef0f3" } },
                    }
                  : {
                      type: "category",
                      data: data.map((r) => r.name),
                      axisLabel: {
                        fontSize: 10,
                        hideOverlap: true,
                        formatter: (v: string) =>
                          v.length > 10 ? v.slice(0, 10) + "…" : v,
                      },
                    },
                yAxis: horizontal
                  ? {
                      type: "category",
                      inverse: true,
                      data: data.map((r) => r.name),
                      axisLabel: {
                        width: narrow ? 85 : 160,
                        overflow: "truncate",
                        fontSize: 11,
                      },
                    }
                  : {
                      type: "value",
                      axisLabel: { fontSize: 10 },
                      splitLine: { lineStyle: { color: "#eef0f3" } },
                    },
                dataZoom: verticalZoom
                  ? [
                      {
                        type: "slider",
                        yAxisIndex: 0,
                        right: 4,
                        start: 0,
                        end: Math.min(100, (visibleBars / data.length) * 100),
                        filterMode: "empty",
                      },
                    ]
                  : !horizontal && data.length > 16
                    ? [
                        {
                          type: "slider",
                          xAxisIndex: 0,
                          bottom: 4,
                          start: 0,
                          end: Math.min(100, (16 / data.length) * 100),
                        },
                      ]
                    : [],
                series: [
                  {
                    name: metric,
                    type: kind === "line" ? "line" : "bar",
                    data: data.map((r) => ({
                      value: r.value,
                      itemStyle: {
                        color:
                          r.value != null && r.value < 0
                            ? "#cd676e"
                            : "#b3212b",
                      },
                    })),
                    barMaxWidth: 24,
                    connectNulls: false,
                    symbolSize: 5,
                    lineStyle: { color: "#b3212b" },
                  },
                ],
              }),
        },
        true,
      );
      chart.resize();
    }
    render();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      chart.dispose();
    };
  }, [kind, data, metric, unit]);
  return (
    <div
      ref={ref}
      className="question-adaptive-chart"
      style={{ height, width: "100%", minWidth: 0 }}
      role="img"
      aria-label={`${metric}${kind === "line" ? "趋势图" : kind === "pie" ? "占比图" : "分布图"}，共${data.length}行`}
    />
  );
}
