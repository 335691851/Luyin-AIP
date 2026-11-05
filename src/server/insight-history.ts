import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { appDb } from "./db";
import { identity } from "./auth";
import { can } from "@/lib/access";
import type { InsightAnswer, InsightContext, InsightTurn } from "@/lib/insight";

export async function insightOwner(
  existing?: Awaited<ReturnType<typeof identity>>,
) {
  const user = existing || (await identity());
  if (!can(user.access, "question.use")) throw Error("FORBIDDEN");
  const accessKey = createHash("sha256")
    .update(
      JSON.stringify({
        role: user.access.role.id,
        scope: user.access.user.scope,
        department: user.access.user.department,
        companies: [...user.companyIds].sort((a, b) => a - b),
        permissions: [...user.access.permissions].sort(),
      }),
    )
    .digest("hex");
  return { user, accessKey };
}
type Owner = Awaited<ReturnType<typeof insightOwner>>;
export async function conversationHistory(id?: string, owner?: Owner) {
  const { user, accessKey } = owner || (await insightOwner());
  if (!id) return [];
  const db = appDb();
  const [conversation] =
    await db`select id from platform.insight_conversation where id=${id} and user_id=${user.id} and access_key=${accessKey}`;
  if (!conversation) throw Error("INSIGHT_NOT_FOUND");
  return db`select question,answer->>'basis' as basis,answer->>'query' as query from platform.insight_message where conversation_id=${id} order by seq desc limit 4`.then(
    (rows) =>
      rows
        .reverse()
        .map((r) => ({
          question: String(r.question),
          basis: String(r.basis || ""),
          query: String(r.query || ""),
        })),
  );
}
export async function saveInsight(
  question: string,
  answer: InsightAnswer,
  context: InsightContext,
  conversationId?: string,
  owner?: Owner,
) {
  const { user, accessKey } = owner || (await insightOwner());
  if (Buffer.byteLength(JSON.stringify(answer), "utf8") > 450000)
    throw Error("INSIGHT_RESULT_TOO_LARGE");
  const id = conversationId || randomUUID();
  const messageId = randomUUID();
  return appDb().begin(async (tx) => {
    if (conversationId) {
      const [owner] =
        await tx`select id from platform.insight_conversation where id=${id} and user_id=${user.id} and access_key=${accessKey} for update`;
      if (!owner) throw Error("INSIGHT_NOT_FOUND");
    } else
      await tx`insert into platform.insight_conversation(id,user_id,access_key,title) values(${id},${user.id},${accessKey},${question.slice(0, 100)})`;
    const [row] =
      await tx`insert into platform.insight_message(id,conversation_id,question,context,answer) values(${messageId},${id},${question},${tx.json(context)},${tx.json(answer as never)}) returning created_at`;
    await tx`update platform.insight_conversation set updated_at=now() where id=${id}`;
    return {
      conversationId: id,
      turn: {
        id: messageId,
        question,
        answer,
        context,
        createdAt: String(row.created_at),
      } satisfies InsightTurn,
    };
  });
}
