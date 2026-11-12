import type { GovernanceItem } from "./governance-workflow";

// An ordinary company archive is not a group approval application.
export function isGroupReview(
  item: GovernanceItem,
  events: { item_id: string; perspective: string; action: string }[],
) {
  return (
    item.item_kind === "action" &&
    item.origin === "company" &&
    (["待审核", "待补正", "已驳回"].includes(item.status) ||
      events.some(
        (e) =>
          e.item_id === item.id &&
          (e.action === "提请集团审核" ||
            (e.perspective === "group" &&
              ["归档通过", "不予通过", "退回补正", "要求整改"].includes(
                e.action,
              ))),
      ))
  );
}
