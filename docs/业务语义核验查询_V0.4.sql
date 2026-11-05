-- 鲁银平台语义核验。只读、无参数、无业务数据写入。
-- 统计以实际执行时点为准；2026年度和2026-11-04尾库检查日为本次核验参数。
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '12000';

-- Q01 数据来源与单据类型，不能把线上记录自动当真实经营记录。
SELECT type_code, status, is_simulated, count(*) AS documents,
       min(bill_date) AS first_day, max(bill_date) AS last_day
FROM public.document GROUP BY type_code, status, is_simulated ORDER BY type_code, status;

-- Q02 订单行成本、部门及销售条款可用性。
SELECT count(*) AS order_lines, count(DISTINCT d.id) AS orders,
       count(*) FILTER (WHERE l.cost_cents > 0) AS positive_cost_lines,
       count(*) FILTER (WHERE dep.name = s.department) AS matching_department,
       count(DISTINCT s.sales_group) AS sales_groups
FROM public.document d JOIN public.document_line l ON l.document_id = d.id
LEFT JOIN public.sales_terms s ON s.document_id = d.id
LEFT JOIN public.employee e ON e.id = d.employee_id
LEFT JOIN public.department dep ON dep.id = e.department_id
WHERE d.type_code = 'sales_order';

-- Q03 内部销售与关联采购。当前一单一行样本可对账，不表示未来行级关联天然唯一。
SELECT count(*) AS joined_rows,
       count(*) FILTER (WHERE a.company_id = p.related_company_id AND b.company_id = q.related_company_id) AS party_matches,
       count(*) FILTER (WHERE x.material_id = y.material_id) AS sku_matches,
       count(*) FILTER (WHERE x.net_cents = y.cost_cents) AS cost_matches
FROM public.document_link k
JOIN public.document a ON a.id = k.source_id
JOIN public.document b ON b.id = k.target_id
JOIN public.document_line x ON x.document_id = a.id
JOIN public.document_line y ON y.document_id = b.id
LEFT JOIN public.partner p ON p.id = b.partner_id
LEFT JOIN public.partner q ON q.id = a.partner_id
WHERE k.relation = 'intercompany';

-- Q04 成品计量单位与属性完整性。kind实际枚举为product。
SELECT m.kind, u.name AS unit, m.classification_status, m.salt_origin, count(*) AS materials
FROM public.material m JOIN public.uom u ON u.id = m.uom_id
GROUP BY m.kind, u.name, m.classification_status, m.salt_origin ORDER BY m.kind, u.name;

-- Q05 库存余额与流水按完整业务键核对。
WITH ledger AS (
  SELECT company_id, warehouse_id, material_id, lot_id, sum(qty_delta) AS qty,
         min(posted_on::date) FILTER (WHERE qty_delta > 0) AS first_receipt
  FROM public.stock_transaction GROUP BY company_id, warehouse_id, material_id, lot_id
)
SELECT count(*) AS balances,
       count(*) FILTER (WHERE x.company_id IS NULL) AS no_ledger,
       count(*) FILTER (WHERE x.qty <> b.qty) AS qty_mismatch,
       count(*) FILTER (WHERE x.first_receipt IS NULL) AS no_positive_receipt
FROM public.stock_balance b LEFT JOIN ledger x
ON x.company_id = b.company_id AND x.warehouse_id = b.warehouse_id
AND x.material_id = b.material_id AND x.lot_id IS NOT DISTINCT FROM b.lot_id;

-- Q06 尾库：公司/SKU/批次合并跨仓；当前日期与阈值显式列出。
WITH first_receipt AS (
  SELECT company_id, material_id, lot_id,
         min(posted_on::date) FILTER (WHERE qty_delta > 0) AS first_day
  FROM public.stock_transaction GROUP BY company_id, material_id, lot_id
), balances AS (
  SELECT b.company_id, b.material_id, b.lot_id, sum(b.qty) AS qty
  FROM public.stock_balance b JOIN public.material m ON m.id = b.material_id
  JOIN public.uom u ON u.id = m.uom_id WHERE m.kind = 'product' AND u.name = '吨'
  GROUP BY b.company_id, b.material_id, b.lot_id
)
SELECT date '2026-11-04' AS check_day, date '2026-08-04' AS cutoff,
       count(*) FILTER (WHERE b.qty > 0 AND b.qty < 0.5) AS small_balances,
       count(*) FILTER (WHERE b.qty > 0 AND b.qty < 0.5 AND f.first_day < date '2026-08-04') AS tail_candidates
FROM balances b LEFT JOIN first_receipt f
ON f.company_id = b.company_id AND f.material_id = b.material_id AND f.lot_id = b.lot_id;

-- Q07 排程已完成与无排程是不同状态。
SELECT d.type_code, count(*) AS schedules,
       count(*) FILTER (WHERE s.qty > s.fulfilled_qty) AS open_schedules,
       count(*) FILTER (WHERE s.qty = s.fulfilled_qty) AS completed_schedules
FROM public.delivery_schedule s JOIN public.document_line l ON l.id = s.line_id
JOIN public.document d ON d.id = l.document_id GROUP BY d.type_code;

-- Q08 两套合同对象不得按数字id混接。
SELECT (SELECT count(*) FROM public.document WHERE type_code = 'sales_contract') AS transaction_contracts,
       (SELECT count(*) FROM public.sales_contract) AS contract_forms,
       (SELECT count(*) FROM public.sales_contract c JOIN public.document d
         ON d.type_code = 'sales_contract' AND d.bill_no = c.contract_no) AS business_number_matches,
       (SELECT count(*) FROM public.sales_contract c JOIN public.document d
         ON d.type_code = 'sales_contract' AND d.id = c.id) AS coincident_numeric_ids;

-- Q09 仅日期和业务类型候选，不是年度框架合规结论。
SELECT count(*) AS contracts,
       count(*) FILTER (WHERE status = 'approved') AS approved,
       count(*) FILTER (WHERE status = 'approved' AND kind IN ('goods','mixed')
         AND valid_from::date <= date '2026-01-01' AND valid_to::date >= date '2026-12-31') AS full_year_date_candidates
FROM public.sales_contract;

-- Q10 历史调价的状态、模拟标识和价格比较前提。
SELECT status, is_simulated, price_unit, currency, price_includes_tax, freight_included,
       count(*) AS rows, count(DISTINCT application_no) AS applications,
       min(snapshot_as_of) AS snapshot_day
FROM public.pricechangerecord
GROUP BY status, is_simulated, price_unit, currency, price_includes_tax, freight_included ORDER BY status;

-- Q11 分值一致性及1分反算差。金额以源net_cents为准。
SELECT count(*) FILTER (WHERE l.net_cents + l.tax_cents <> l.total_cents) AS tax_total_mismatch,
       count(*) FILTER (WHERE l.net_cents <> round(l.qty*l.unit_price_cents/(1+l.tax_rate))) AS price_rounding_differences,
       max(abs(l.net_cents-round(l.qty*l.unit_price_cents/(1+l.tax_rate)))) AS max_rounding_delta_cents
FROM public.document d JOIN public.document_line l ON l.document_id = d.id WHERE d.type_code = 'sales_order';

ROLLBACK;
