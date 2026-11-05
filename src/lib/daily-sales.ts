import Decimal from "decimal.js";
export type DailyRow = {
  id: string;
  category: string;
  variety: string;
  day: number | null;
  month: number | null;
  year: number | null;
};
export type DailyRaw = {
  category: string;
  variety: string;
  origin: string;
  packaging: string;
  unit: string;
  day: string;
  month: string;
  year: string;
  day_count: number;
  month_count: number;
  year_count: number;
};
export function buildDailySales(
  raw: DailyRaw[],
  catalog: { category: string; variety: string }[],
) {
  const aggregate = (
    id: string,
    category: string,
    variety: string,
    rows: DailyRaw[],
  ): DailyRow =>
    ({
      id,
      category,
      variety,
      ...Object.fromEntries(
        (["day", "month", "year"] as const).map((k) => [
          k,
          rows.some((r) => r.unit !== "吨" && Number(r[`${k}_count`]) > 0)
            ? null
            : Number(
                rows.reduce((s, r) => s.plus(r[k]), new Decimal(0)).toFixed(3),
              ),
        ]),
      ),
    }) as DailyRow;
  const pairs = new Map<string, { category: string; variety: string }>();
  for (const c of [...catalog, ...raw])
    pairs.set(JSON.stringify([c.category, c.variety]), c);
  const rows = [...pairs.entries()].map(([id, c]) =>
    aggregate(
      id,
      c.category,
      c.variety,
      raw.filter((r) => r.category === c.category && r.variety === c.variety),
    ),
  );
  const origins = new Set(["sea", "mine", ...raw.map((r) => r.origin)]);
  const labels: Record<string, string> = {
    sea: "海盐",
    mine: "矿盐",
    lake: "湖盐",
    well: "井盐",
    unknown: "盐源待确认",
  };
  const breakdown: DailyRow[] = [];
  for (const origin of origins) {
    const label = labels[origin] || "盐源待确认",
      selected = raw.filter((r) => r.origin === origin);
    breakdown.push(
      aggregate(`origin:${origin}`, "其中", `${label}合计`, selected),
    );
    for (const [pack, name] of [
      ["small", "小包装"],
      ["large", "大包装"],
      ["bulk", "散装"],
      ["unknown", "包装待确认"],
    ])
      if (pack !== "unknown" || selected.some((r) => r.packaging === "unknown"))
        breakdown.push(
          aggregate(
            `${origin}:${pack}`,
            "其中",
            `${label} · ${name}`,
            selected.filter((r) => r.packaging === pack),
          ),
        );
  }
  return { rows, total: aggregate("total", "合计", "", raw), breakdown };
}
