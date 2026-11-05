import { describe, it, expect } from "vitest";
import { validateReadQuery } from "../src/lib/sql-guard";
const tables = ["document", "document_line", "company", "material"];
describe("NLP2SQL authorization boundary", () => {
  it("accepts quoted Chinese columns and rejects duplicate header aggregation", () => {
    expect(
      validateReadQuery(
        'select sum(l.net_cents)/100 as "销售额" from document d join document_line l on l.document_id=d.id',
        tables,
      ),
    ).toContain("销售额");
    expect(() =>
      validateReadQuery(
        "select sum(d.net_cents) from document d join document_line l on l.document_id=d.id",
        tables,
      ),
    ).toThrow("重复累计");
  });
  it("allows filtered multi-table sales aggregation", () =>
    expect(
      validateReadQuery(
        "select m.name,sum(l.net_cents)/100 as amount from document d join document_line l on l.document_id=d.id join material m on m.id=l.material_id where d.type_code='sales_order' group by m.name order by amount desc limit 10",
        tables,
      ),
    ).toContain("sum"));
  it.each([
    "delete from document",
    "select * from public.document",
    "select * from auth.users",
    "select * from pg_authid",
    "select pg_read_file('/etc/passwd')",
    "select set_config('role','postgres',false)",
    "select 1; select 2",
    "with x as (delete from document returning *) select * from x",
    "select 'auth.users'::regclass",
    "select * from document for update",
  ])("rejects unsafe query %s", (sql) =>
    expect(() => validateReadQuery(sql, tables)).toThrow(),
  );
  it("validates nested table access", () =>
    expect(() =>
      validateReadQuery(
        "select * from document where id in (select id from secret)",
        tables,
      ),
    ).toThrow());
});
