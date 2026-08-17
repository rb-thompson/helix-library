import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const locations = sqliteTable(
  "locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    rootPath: text("root_path").notNull(),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("locations_root_path_uq").on(t.rootPath)],
);

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    relPath: text("rel_path").notNull(),
    name: text("name").notNull(),
    ext: text("ext"),
    kind: text("kind").notNull(),
    mime: text("mime"),
    sizeBytes: integer("size_bytes").notNull(),
    mtimeMs: integer("mtime_ms").notNull(),
    ctimeMs: integer("ctime_ms").notNull(),
    contentHash: text("content_hash"),
    title: text("title").notNull(),
    /** filename | arxiv | manual (season PR1); later: yt-dlp | pdf | … */
    titleSource: text("title_source").notNull().default("filename"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    indexedAt: integer("indexed_at").notNull(),
    isMissing: integer("is_missing").notNull().default(0),
  },
  (t) => [
    uniqueIndex("items_path_uq").on(t.path),
    index("items_location_idx").on(t.locationId),
    index("items_kind_idx").on(t.kind),
    index("items_name_idx").on(t.name),
    index("items_mtime_idx").on(t.mtimeMs),
  ],
);

export const itemText = sqliteTable("item_text", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  extractedAt: integer("extracted_at").notNull(),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    status: text("status").notNull().default("pending"),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    /** Reindex stats payload (kept for reindex only). */
    statsJson: text("stats_json"),
    error: text("error"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** reindex | arxiv | youtube | image | openalex | clip | grokipedia | image_url */
    kind: text("kind").notNull().default("reindex"),
    label: text("label"),
    progressJson: text("progress_json"),
    /** Acquire result payload (itemId, path, …). */
    resultJson: text("result_json"),
    cancelRequested: integer("cancel_requested").notNull().default(0),
    /** 1 = user dismissed failed job from rescue/dashboard warnings */
    dismissed: integer("dismissed").notNull().default(0),
  },
  (t) => [
    index("jobs_kind_status_idx").on(t.kind, t.status),
    index("jobs_created_idx").on(t.createdAt),
  ],
);

export const collections = sqliteTable(
  "collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** manual | smart */
    kind: text("kind").notNull().default("manual"),
    /** Smart shelf CatalogSearchParams subset JSON; null for manual */
    queryJson: text("query_json"),
  },
  (t) => [uniqueIndex("collections_name_uq").on(t.name)],
);

export const collectionItems = sqliteTable(
  "collection_items",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    addedAt: integer("added_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.itemId] })],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** Hide from facets/graph when 1 (user or meta). */
    hidden: integer("hidden").notNull().default(0),
  },
  (t) => [uniqueIndex("tags_name_uq").on(t.name)],
);

export const itemTags = sqliteTable(
  "item_tags",
  {
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    /** manual | vision | exif | acquire — application-level provenance */
    source: text("source").notNull().default("manual"),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.itemId] }),
    index("item_tags_source_idx").on(t.source),
  ],
);

export const chatThreads = sqliteTable("chat_threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().default("New conversation"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    threadId: integer("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("chat_messages_thread_idx").on(t.threadId)],
);

/** Durable Deep Lens insights bound to a catalog holding. */
export const insights = sqliteTable(
  "insights",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    /** Selected quote / highlight text (required). */
    quoteText: text("quote_text").notNull(),
    /** Optional freeform note body. */
    body: text("body"),
    /** Optional source label (e.g. selection, manual). */
    source: text("source"),
    /** Optional character offsets into source text (best-effort). */
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("insights_item_idx").on(t.itemId)],
);

/** Machine-generated Deep Lens dossier analyses (not human insights). */
export const lensAnalyses = sqliteTable(
  "lens_analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    contentHash: text("content_hash"),
    fingerprint: text("fingerprint").notNull(),
    mode: text("mode").notNull(),
    model: text("model"),
    status: text("status").notNull().default("completed"),
    payloadJson: text("payload_json"),
    error: text("error"),
    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("lens_analyses_item_uq").on(t.itemId),
    index("lens_analyses_fp_idx").on(t.fingerprint),
  ],
);

export type LocationRow = typeof locations.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type ChatThreadRow = typeof chatThreads.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
/** Server open/read events (Discovery PR6). Dual-write with helix-open-history. */
export const itemEvents = sqliteTable(
  "item_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    /** open | read (future) */
    kind: text("kind").notNull(),
    at: integer("at").notNull(),
    metaJson: text("meta_json"),
  },
  (t) => [
    index("item_events_item_at_idx").on(t.itemId, t.at),
    index("item_events_at_idx").on(t.at),
  ],
);

export const arcadeScores = sqliteTable(
  "arcade_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    game: text("game").notNull(),
    score: integer("score").notNull(),
    night: integer("night").notNull(),
    nectar: integer("nectar").notNull(),
    durationMs: integer("duration_ms").notNull(),
    abilitiesJson: text("abilities_json"),
    createdAt: integer("created_at").notNull(),
    initials: text("initials"),
  },
  (t) => [index("arcade_scores_game_score_idx").on(t.game, t.score, t.createdAt)],
);

export const arcadeProgress = sqliteTable("arcade_progress", {
  game: text("game").primaryKey(),
  xp: integer("xp").notNull().default(0),
  unlockedJson: text("unlocked_json"),
  tutorialDone: integer("tutorial_done").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export type InsightRow = typeof insights.$inferSelect;
export type LensAnalysisRow = typeof lensAnalyses.$inferSelect;
export type ItemEventRow = typeof itemEvents.$inferSelect;
export type ArcadeScoreRow = typeof arcadeScores.$inferSelect;
export type ArcadeProgressRow = typeof arcadeProgress.$inferSelect;
