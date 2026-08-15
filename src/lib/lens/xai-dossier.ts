import { createXai } from "@ai-sdk/xai";
import { generateObject } from "ai";
import { z } from "zod";
import {
  hasXaiApiKey,
  resolveAgentMode,
  xaiCloudAllowed,
} from "@/lib/agent/mode";
import type { LensContext } from "@/lib/lens/context";
import {
  parseLensDossier,
  type LensDossierV1,
} from "@/lib/lens/dossier";
import { buildLocalDossier } from "@/lib/lens/local-dossier";
import {
  isVisionKind,
  loadLensExifFacts,
  loadLensVisionFrames,
  type VisionFrame,
} from "@/lib/lens/vision";

const modelDossierSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()).max(12),
  themes: z.array(z.string()).max(16),
  entities: z
    .array(
      z.object({
        name: z.string(),
        kind: z.string().optional(),
      }),
    )
    .max(24),
  contentFacts: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .max(20),
  suggestedTags: z.array(z.string()).max(12),
  suggestedCollections: z.array(z.string()).max(6),
  caveats: z.array(z.string()).max(8),
});

function modelId(): string {
  return process.env.NON_OS_MODEL?.trim() || "grok-4.3";
}

/**
 * Grok structured dossier. Falls back to local on failure / mode mismatch.
 */
export async function runXaiDossier(
  ctx: LensContext,
): Promise<{ dossier: LensDossierV1; model: string; usedXai: boolean }> {
  if (resolveAgentMode() !== "xai" || !hasXaiApiKey() || !xaiCloudAllowed()) {
    return {
      dossier: buildLocalDossier(ctx),
      model: "local",
      usedXai: false,
    };
  }

  const model = modelId();
  const localBase = buildLocalDossier(ctx);
  const exifFacts = loadLensExifFacts(ctx.item.id);
  if (exifFacts.length) {
    for (const f of exifFacts) {
      if (!localBase.contentFacts.some((c) => c.label === f.label)) {
        localBase.contentFacts.push(f);
      }
    }
  }

  let frames: VisionFrame[] = [];
  let visionCaveats: string[] = [];
  if (isVisionKind(ctx.item.kind)) {
    const loaded = await loadLensVisionFrames(ctx.item.id);
    frames = loaded.frames;
    visionCaveats = loaded.caveats;
  }

  const contextBlob = {
    itemId: ctx.item.id,
    title: ctx.title,
    kind: ctx.item.kind,
    mime: ctx.item.mime,
    ext: ctx.item.ext,
    relPath: ctx.item.relPath,
    sizeBytes: ctx.item.sizeBytes,
    width: ctx.item.width,
    height: ctx.item.height,
    durationMs: ctx.item.durationMs,
    tags: ctx.tags,
    collections: ctx.collectionNames,
    bodySample: ctx.body,
    bodyTruncated: ctx.bodyTruncated,
    contentFactsSeed: localBase.contentFacts,
    visionAttached: frames.map((f) => f.label),
  };

  const system = [
    "You are Helix Library's Deep Lens analyst for a single catalog holding.",
    "Use ONLY the provided metadata and any attached still images. Do not invent file paths or unread document body.",
    "If stills are attached, describe what is actually visible (subjects, setting, text in frame, mood, composition).",
    "For video stills: these are sampled frames, not the full clip — do not invent later plot.",
    "If no stills are attached and there is no body, stay metadata-honest.",
    "suggestedTags are proposals only (short lowercase labels).",
    "Return structured fields matching the schema.",
  ].join(" ");

  try {
    const xai = createXai({ apiKey: process.env.XAI_API_KEY!.trim() });
    const userContent: Array<
      | { type: "text"; text: string }
      | {
          type: "file";
          mediaType: string;
          data: Buffer;
          filename: string;
        }
    > = [
      {
        type: "text",
        text: `Compile an encyclopedia entry for this holding:\n${JSON.stringify(contextBlob)}`,
      },
    ];
    for (const frame of frames) {
      userContent.push({
        type: "file",
        mediaType: frame.mediaType,
        data: frame.bytes,
        filename: `${frame.label}.jpg`,
      });
    }

    const { object } = await generateObject({
      model: xai(model),
      schema: modelDossierSchema,
      temperature: 0.25,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    const usedVision = frames.length > 0;
    const merged: LensDossierV1 = {
      schemaVersion: 1,
      summary: object.summary,
      keyPoints: object.keyPoints,
      themes: object.themes,
      entities: object.entities,
      contentFacts:
        object.contentFacts.length > 0
          ? object.contentFacts
          : localBase.contentFacts,
      suggestedTags: object.suggestedTags,
      suggestedCollections: object.suggestedCollections,
      caveats: [
        ...object.caveats,
        ...visionCaveats,
        "Analyzed with xAI developer API (not SuperGrok chat).",
      ],
      sources: {
        usedItemText: Boolean(ctx.body),
        itemTextChars: ctx.body?.length ?? 0,
        truncated: ctx.bodyTruncated,
        usedVision,
        usedMetadataOnly: !ctx.body && !usedVision,
        contentHashMissing: !ctx.item.contentHash,
      },
    };

    const validated = parseLensDossier(merged);
    if (!validated) {
      const fallback = buildLocalDossier(ctx);
      fallback.caveats.push("Model schema failed; showing local extractive dossier.");
      return { dossier: fallback, model: "local", usedXai: false };
    }
    return { dossier: validated, model, usedXai: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = buildLocalDossier(ctx);
    fallback.caveats.push(`xAI analysis failed: ${message.slice(0, 160)}`);
    return { dossier: fallback, model: "local", usedXai: false };
  }
}
