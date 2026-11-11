import type { GraphEdge, GraphNode } from "./knowledge-graph";

// Calculate once per data change. Interactive dragging must not restart physics.
export function graphPositions(nodes: GraphNode[], edges: GraphEdge[]) {
  const positions = nodes.map((_, i) => {
    const angle = i * 2.399963229728653;
    const radius = 36 * Math.sqrt(i + 1);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const links = edges.flatMap((edge) => {
    const a = index.get(edge.source),
      b = index.get(edge.target);
    return a === undefined || b === undefined || a === b ? [] : [[a, b]];
  });
  for (let step = 0; step < 240; step++) {
    const forces = positions.map((point) => ({
      x: -point.x * 0.008,
      y: -point.y * 0.008,
    }));
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        const dx = positions[a].x - positions[b].x;
        const dy = positions[a].y - positions[b].y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        // Leave room for short labels around nearby nodes, including hubs.
        const strength =
          1600 / (distance * distance) + Math.max(0, 72 - distance) * 0.5;
        const x = (dx / distance) * strength,
          y = (dy / distance) * strength;
        forces[a].x += x;
        forces[a].y += y;
        forces[b].x -= x;
        forces[b].y -= y;
      }
    }
    for (const [a, b] of links) {
      const dx = positions[b].x - positions[a].x;
      const dy = positions[b].y - positions[a].y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const strength = (distance - 125) * 0.025;
      const x = (dx / distance) * strength,
        y = (dy / distance) * strength;
      forces[a].x += x;
      forces[a].y += y;
      forces[b].x -= x;
      forces[b].y -= y;
    }
    const maxMove = 8 * (1 - step / 240) + 0.2;
    positions.forEach((point, i) => {
      const magnitude = Math.max(
        1,
        Math.hypot(forces[i].x, forces[i].y) / maxMove,
      );
      point.x += forces[i].x / magnitude;
      point.y += forces[i].y / magnitude;
    });
  }
  return positions;
}
