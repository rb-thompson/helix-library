import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { chatMessages, chatThreads } from "@/lib/db/schema";

export function listThreads(limit = 30) {
  const db = getDb();
  return db
    .select()
    .from(chatThreads)
    .orderBy(chatThreads.updatedAt)
    .all()
    .reverse()
    .slice(0, limit);
}

export function getThread(id: number) {
  const db = getDb();
  return db.select().from(chatThreads).where(eq(chatThreads.id, id)).get() ?? null;
}

export function createThread(title = "New conversation"): number {
  const db = getDb();
  const now = Date.now();
  const result = db
    .insert(chatThreads)
    .values({
      title,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export function touchThread(id: number, title?: string): void {
  const db = getDb();
  const patch: { updatedAt: number; title?: string } = { updatedAt: Date.now() };
  if (title) patch.title = title;
  db.update(chatThreads).set(patch).where(eq(chatThreads.id, id)).run();
}

export function deleteThread(id: number): void {
  const db = getDb();
  db.delete(chatThreads).where(eq(chatThreads.id, id)).run();
}

export function listMessages(threadId: number) {
  const db = getDb();
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function appendMessage(input: {
  threadId: number;
  role: "user" | "assistant" | "system";
  content: string;
}): void {
  const db = getDb();
  db.insert(chatMessages)
    .values({
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: Date.now(),
    })
    .run();
  touchThread(input.threadId);
}

export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 56 ? `${clean.slice(0, 53)}…` : clean;
}
