import { parse } from "pgsql-ast-parser";
const functions = new Set(
  "sum count avg min max round abs coalesce nullif greatest least lower upper trim length to_char date_trunc extract date_part concat concat_ws lag lead rank dense_rank row_number".split(
    " ",
  ),
);
const types = new Set(
  "numeric decimal integer int int4 int8 bigint float float8 real double precision text varchar date timestamp timestamptz interval boolean".split(
    " ",
  ),
);
export function validateReadQuery(sql: string, tables: string[]) {
  if (sql.length > 12000 || /--|\/\*|;|\$\d|\\/.test(sql))
    throw Error("只允许单条只读SELECT查询");
  const ast = parse(sql);
  if (ast.length !== 1 || ast[0].type !== "select")
    throw Error("请使用SELECT查询，不包含WITH或写入操作");
  const allowed = new Set(tables);
  function semanticCheck(node: any) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "select" &&
      node.from?.some(
        (f: any) => f.type === "table" && f.name.name === "document_line",
      )
    ) {
      const headers = new Set(
        node.from
          .filter((f: any) => f.type === "table" && f.name.name === "document")
          .map((f: any) => f.name.alias || f.name.name),
      );
      function check(n: any) {
        if (!n || typeof n !== "object") return;
        if (
          n.type === "call" &&
          ["sum", "avg"].includes(n.function?.name?.toLowerCase()) &&
          n.args?.some(
            (a: any) =>
              a.type === "ref" &&
              headers.has(a.table?.name) &&
              ["net_cents", "total_cents", "tax_cents"].includes(a.name),
          )
        )
          throw Error("关联订单行时请汇总行金额，避免订单头金额重复累计");
        Object.values(n).forEach((v) =>
          Array.isArray(v) ? v.forEach(check) : check(v),
        );
      }
      node.columns?.forEach(check);
    }
    Object.values(node).forEach((v) =>
      Array.isArray(v) ? v.forEach(semanticCheck) : semanticCheck(v),
    );
  }
  semanticCheck(ast);
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const n = node as Record<string, any>;
    if (
      n.schema ||
      n.into ||
      n.for ||
      n.with ||
      n.type === "with" ||
      n.type === "with recursive"
    )
      throw Error("查询包含不支持的数据库操作");
    if (n.type === "table" && (!allowed.has(n.name?.name) || n.name?.schema))
      throw Error("查询引用了未授权数据表");
    if (
      n.type === "call" &&
      (!functions.has(n.function?.name?.toLowerCase()) || n.function?.schema)
    )
      throw Error("查询包含未开放的数据库函数");
    if (n.type === "cast" && !types.has(n.to?.name?.toLowerCase()))
      throw Error("不支持该类型转换");
    for (const v of Object.values(n)) visit(v);
  }
  visit(ast);
  return sql;
}
