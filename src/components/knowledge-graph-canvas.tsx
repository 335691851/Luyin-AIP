"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Space } from "antd";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import * as echarts from "echarts/core";
import { GraphChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { LabelLayout } from "echarts/features";
import type { GraphNode, GraphEdge } from "@/lib/knowledge-graph";
import { graphPositions } from "@/lib/graph-layout";
echarts.use([GraphChart, TooltipComponent, CanvasRenderer, LabelLayout]);

const palette = [
  "#7452b6",
  "#3d79b5",
  "#c58a35",
  "#3c938a",
  "#bd6176",
  "#6776b5",
  "#71864a",
];
export default function KnowledgeGraphCanvas({
  nodes,
  edges,
  ontology,
  labels,
  selected,
  resetKey,
  onNode,
  onEdge,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ontology: boolean;
  labels: boolean;
  selected: string | null;
  resetKey: number;
  onNode: (id: string) => void;
  onEdge: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const movedNodes = useRef(new Map<string, { x: number; y: number }>());
  const [panMode, setPanMode] = useState(true);
  const positions = useMemo(() => graphPositions(nodes, edges), [nodes, edges]);
  const interaction = useRef({ labels, panMode });
  interaction.current = { labels, panMode };
  const handlers = useRef({ onNode, onEdge });
  useEffect(() => {
    handlers.current = { onNode, onEdge };
  }, [onNode, onEdge]);
  useEffect(() => {
    if (!element.current) return;
    const instance = echarts.init(element.current, undefined, {
      renderer: "canvas",
    });
    chart.current = instance;
    let pressedNode: string | null = null;
    instance.on("mousedown", (event) => {
      pressedNode =
        event.dataType === "node"
          ? (event.data as { rawId: string }).rawId
          : null;
    });
    instance.getZr().on("dragend", (event) => {
      const matrix = event.target?.getComputedTransform();
      if (pressedNode && matrix) {
        const point = instance.convertFromPixel({ seriesIndex: 0 }, [
          matrix[4],
          matrix[5],
        ]) as number[];
        movedNodes.current.set(pressedNode, { x: point[0], y: point[1] });
      }
      pressedNode = null;
    });
    instance.on("click", (event) => {
      const data = event.data as { rawId?: string; edgeId?: string };
      if (event.dataType === "edge" && data.edgeId)
        handlers.current.onEdge(data.edgeId);
      else if (data.rawId) handlers.current.onNode(data.rawId);
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    movedNodes.current.clear();

    const degrees = new Map<string, number>();
    for (const edge of edges)
      for (const id of [edge.source, edge.target])
        degrees.set(id, (degrees.get(id) || 0) + 1);
    instance.setOption(
      {
        animation: false,
        textStyle: { fontFamily: "Microsoft YaHei, PingFang SC, sans-serif" },
        tooltip: {
          renderMode: "richText",
          formatter: (params: unknown) => {
            const event = params as {
              dataType: string;
              data: { fullName?: string; name?: string; relation?: string };
            };
            return event.dataType === "edge"
              ? event.data.relation || "关系"
              : event.data.fullName || event.data.name || "实体";
          },
        },
        series: [
          {
            type: "graph",
            layout: "none",
            roam: true,
            draggable: !interaction.current.panMode,
            cursor: interaction.current.panMode ? "grab" : "move",
            zoom: 0.85,
            // ECharts 6 treats zero as its default ratio (1). A tiny positive
            // ratio keeps dots effectively fixed in screen pixels when zooming.
            nodeScaleRatio: 0.000001,
            scaleLimit: { min: 0.2, max: 4 },
            edgeSymbol: ["none", "arrow"],
            edgeSymbolSize: [0, 6],
            emphasis: {
              scale: 1.3,
              focus: "adjacency",
              label: {
                show: true,
                width: 220,
                overflow: "break",
                fontWeight: "bold",
              },
              itemStyle: {
                color: "#d58a29",
                borderColor: "#a66821",
                borderWidth: 1.5,
              },
              lineStyle: { width: 2, opacity: 1 },
            },
            label: {
              show: true,
              position: "right",
              fontSize: 11,
              distance: 6,
              width: 120,
              overflow: "truncate",
              color: "#334155",
              backgroundColor: "rgba(255,255,255,.8)",
              padding: 2,
            },
            labelLayout: { hideOverlap: true },
            edgeLabel: {
              show: interaction.current.labels,
              fontSize: 9,
              color: "#718096",
              formatter: "{c}",
            },
            lineStyle: {
              color: "#b8c4d4",
              width: 1,
              opacity: 0.4,
              curveness: 0.08,
            },
            data: nodes.map((n, i) => ({
              id: n.id,
              rawId: n.id,
              name: n.label.length > 12 ? `${n.label.slice(0, 12)}…` : n.label,
              fullName: `${n.label} · ${n.typeLabel}`,
              symbolSize: Math.min(10, 6 + Math.sqrt(degrees.get(n.id) || 0)),
              x: positions[i].x,
              y: positions[i].y,
              itemStyle: {
                color: ontology
                  ? "#7955b4"
                  : palette[
                      Array.from(n.type).reduce(
                        (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
                        0,
                      ) % palette.length
                    ],
                borderColor: "#fff",
                borderWidth: 1,
              },
            })),
            links: edges.map((e) => ({
              source: e.source,
              target: e.target,
              edgeId: e.id,
              value: e.label,
              relation: `${e.label} (${e.predicate})`,
              lineStyle: e.inherited
                ? { type: "dashed", color: "#c8bddb" }
                : undefined,
            })),
          },
        ],
      },
      { notMerge: true },
    );
  }, [nodes, edges, ontology, positions, resetKey]);
  useEffect(() => {
    // Merge presentation changes so dragged positions and the viewport survive.
    const instance = chart.current;
    if (!instance) return;
    const data = (
      instance.getOption() as { series: { data: { id: string }[] }[] }
    ).series[0].data;
    instance.setOption({
      series: [
        {
          data: data.map((node) => ({
            ...node,
            ...movedNodes.current.get(node.id),
          })),
          draggable: !panMode,
          cursor: panMode ? "grab" : "move",
          edgeLabel: { show: labels },
        },
      ],
    });
  }, [labels, panMode]);
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    instance.dispatchAction({ type: "downplay", seriesIndex: 0 });
    const index = nodes.findIndex((n) => n.id === selected);
    if (index >= 0)
      instance.dispatchAction({
        type: "highlight",
        seriesIndex: 0,
        dataIndex: index,
      });
  }, [selected, nodes]);
  const zoom = (factor: number) => {
    const instance = chart.current;
    if (!instance) return;
    // Roam changes only the viewport, without rebuilding the graph.
    instance.dispatchAction({
      type: "graphRoam",
      seriesIndex: 0,
      zoom: factor,
      originX: instance.getWidth() / 2,
      originY: instance.getHeight() / 2,
    });
  };
  return (
    <div className="kg-canvas-wrap">
      <div
        ref={element}
        className="kg-canvas"
        role="img"
        aria-label={ontology ? "领域本体交互关系图" : "制度实体交互关系图"}
      />
      <Space className="kg-zoom">
        <Button
          aria-label="拖动节点模式"
          aria-pressed={!panMode}
          type={!panMode ? "primary" : "default"}
          onClick={() => setPanMode(false)}
        >
          拖动节点
        </Button>
        <Button
          aria-label="平移画布模式"
          aria-pressed={panMode}
          type={panMode ? "primary" : "default"}
          onClick={() => setPanMode(true)}
        >
          平移画布
        </Button>
        <Button
          aria-label="放大图谱"
          icon={<PlusOutlined />}
          onClick={() => zoom(1.25)}
        />
        <Button
          aria-label="缩小图谱"
          icon={<MinusOutlined />}
          onClick={() => zoom(0.8)}
        />
      </Space>
      <div className="kg-canvas-hint">
        {panMode ? "拖动任意位置平移画布" : "拖动圆点调整节点 · 拖动空白处平移"}{" "}
        · 滚轮或双指缩放 · 点击查看解析
      </div>
    </div>
  );
}
