import { toAlignmentLocale, type VocaSyncClient, withPublishableKey } from "../api/client.js";
import { FormatSchema, LanguageSchema, type VocaSyncConfig, VoiceSchema } from "../config/index.js";
import { getAudioEntry, loadAudioMap, saveAudioMap, setAudioEntry } from "../core/audio-map.js";
import { loadContent } from "../core/content-loader.js";
import { computeHash } from "../core/hash-manager.js";
import { buildSpeechDocument } from "../core/speech-builder.js";
import type {
  AudioArtifact,
  AudioMap,
  ContentItem,
  SyncResult,
  SyncSummary,
} from "../types/index.js";

export interface SyncOptions {
  only?: string;
  force?: boolean;
  dryRun?: boolean;
  onProgress?: (message: string, type?: "info" | "success" | "warn" | "error") => void;
}

type Progress = NonNullable<SyncOptions["onProgress"]>;

/** Resolve effective synthesis params from per-post frontmatter, falling back to config. */
function resolveParams(
  item: ContentItem,
  config: VocaSyncConfig
): { voice: string; language: string; format: string } | { error: string } {
  const fm = item.frontmatter;

  let voice = config.synthesis.voice as string;
  if (fm.voice !== undefined && fm.voice !== null) {
    const parsed = VoiceSchema.safeParse(fm.voice);
    if (!parsed.success) return { error: `invalid frontmatter voice "${String(fm.voice)}"` };
    voice = parsed.data;
  }

  let language = config.language as string;
  if (fm.language !== undefined && fm.language !== null) {
    const parsed = LanguageSchema.safeParse(fm.language);
    if (!parsed.success) return { error: `invalid frontmatter language "${String(fm.language)}"` };
    language = parsed.data;
  }

  let format = config.synthesis.format as string;
  if (fm.format !== undefined && fm.format !== null) {
    const parsed = FormatSchema.safeParse(fm.format);
    if (!parsed.success) return { error: `invalid frontmatter format "${String(fm.format)}"` };
    format = parsed.data;
  }

  return { voice, language, format };
}

/** True when an existing entry is a complete v3 artifact matching the hash. */
function isUpToDate(entry: AudioArtifact | undefined, contentHash: string): boolean {
  return Boolean(
    entry &&
      entry.contentHash === contentHash &&
      entry.synthesisProjectUuid &&
      entry.alignmentProjectUuid &&
      Array.isArray(entry.words)
  );
}

/** Orchestrate the full sync: load -> build -> two-POST synthesis+alignment -> persist. */
export async function sync(
  config: VocaSyncConfig,
  client: VocaSyncClient,
  options: SyncOptions = {}
): Promise<SyncSummary> {
  const { only, force = false, dryRun = false, onProgress = () => {} } = options;

  const results: SyncResult[] = [];
  let unchanged = 0;
  let synced = 0;
  let errors = 0;

  onProgress("Loading audio map...", "info");
  const audioMap = await loadAudioMap(config.output.audioMapPath);

  onProgress(`Loading content from ${config.collection.name}...`, "info");
  let items = await loadContent(config.collection, config.frontmatterField);

  if (only) {
    items = items.filter((item) => item.slug === only);
    if (items.length === 0) throw new Error(`No content found with slug: ${only}`);
  }

  onProgress(`Found ${items.length} content items`, "info");

  for (const item of items) {
    const result = await processItem(item, config, client, audioMap, { force, dryRun, onProgress });
    results.push(result);
    if (result.status === "unchanged") unchanged++;
    else if (result.status === "error") errors++;
    else synced++;
  }

  if (!dryRun && synced > 0) {
    onProgress("Saving audio map...", "info");
    audioMap.version = 3;
    await saveAudioMap(config.output.audioMapPath, audioMap);
  }

  return { total: items.length, unchanged, synced, errors, results };
}

async function processItem(
  item: ContentItem,
  config: VocaSyncConfig,
  client: VocaSyncClient,
  audioMap: AudioMap,
  options: { force: boolean; dryRun: boolean; onProgress: Progress }
): Promise<SyncResult> {
  const { force, dryRun, onProgress } = options;

  try {
    const resolved = resolveParams(item, config);
    if ("error" in resolved) {
      onProgress(`⚠ ${item.slug} - skipped: ${resolved.error}`, "warn");
      return { slug: item.slug, status: "error", error: resolved.error };
    }
    const { voice, language, format } = resolved;

    const speechDoc = await buildSpeechDocument(item, { math: config.math });
    const contentHash = computeHash(
      JSON.stringify([speechDoc.normalisedSpeechtext, voice, language, format])
    );

    const existingEntry = getAudioEntry(audioMap, item.slug);
    if (!force && isUpToDate(existingEntry, contentHash)) {
      onProgress(`⏭ ${item.slug} - unchanged`, "info");
      return { slug: item.slug, status: "unchanged" };
    }

    const status = existingEntry ? "updated" : "new";

    if (dryRun) {
      onProgress(
        `🔍 ${item.slug} - would ${status} (voice=${voice}, lang=${language}) [dry run]`,
        "info"
      );
      return { slug: item.slug, status };
    }

    // 1. Synthesis ------------------------------------------------------------
    onProgress(`📤 ${item.slug} - synthesizing (voice=${voice}, lang=${language})...`, "info");
    const synthesis = await client.synthesize({
      name: `astro-${item.slug}`,
      text: speechDoc.speechtext,
      voice,
      quality: config.synthesis.quality,
      language,
      outputFormat: format,
    });
    const synthUuid = synthesis.projectUuid;
    await client.pollUntilComplete(synthUuid, {
      onProgress: (s) => onProgress(`   synthesis: ${s.status}`, "info"),
    });
    const synthesisPublishableKey = await client.createPublishableKey(synthUuid);

    // 2. Alignment (explicit, client-supplied transcript) ---------------------
    onProgress(`🔗 ${item.slug} - aligning...`, "info");
    const audioStreamUrl = client.streamUrl(synthUuid, "synthesis");
    const { bytes: audioBytes, contentType } = await client.downloadBytes(
      withPublishableKey(audioStreamUrl, synthesisPublishableKey)
    );
    const transcriptBytes = new TextEncoder().encode(speechDoc.normalisedSpeechtext);
    const alignmentLocale = toAlignmentLocale(language);

    const presign = await client.presignAlignment({
      audioName: `synthesis.${format}`,
      audioType: contentType,
      audioSize: audioBytes.byteLength,
      transcriptSize: transcriptBytes.byteLength,
      language: alignmentLocale,
    });

    await client.uploadToPresigned(presign.audio.uploadUrl, audioBytes, contentType);
    await client.uploadToPresigned(presign.transcript.uploadUrl, transcriptBytes, "text/plain");

    await client.submitAlignment({
      projectUuid: presign.projectUuid,
      audioFileKey: presign.audio.key,
      transcriptFileKey: presign.transcript.key,
      audioFileSizeBytes: audioBytes.byteLength,
      transcriptFileSizeBytes: transcriptBytes.byteLength,
      language: alignmentLocale,
      projectName: `astro-${item.slug}`,
    });
    const alignUuid = presign.projectUuid;
    await client.pollUntilComplete(alignUuid, {
      onProgress: (s) => onProgress(`   alignment: ${s.status}`, "info"),
    });
    const alignmentPublishableKey = await client.createPublishableKey(alignUuid);

    // 3. Fetch timings + persist ---------------------------------------------
    const { words, duration } = await client.fetchAlignmentWords(
      withPublishableKey(client.streamUrl(alignUuid, "alignment"), alignmentPublishableKey)
    );
    // The alignment stream may omit total duration; fall back to the last word's end.
    const effectiveDuration = duration || (words.length ? words[words.length - 1].end : 0);

    const now = new Date().toISOString();
    const artifact: AudioArtifact = {
      contentHash,
      voice,
      language,
      format,
      synthesisProjectUuid: synthUuid,
      synthesisPublishableKey,
      audioUrl: audioStreamUrl,
      alignmentProjectUuid: alignUuid,
      alignmentPublishableKey,
      words,
      duration: effectiveDuration,
      mathSpeech: speechDoc.mathSpeech,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now,
    };
    setAudioEntry(audioMap, item.slug, artifact);

    onProgress(`✅ ${item.slug} - ${status} complete (${words.length} words)`, "success");
    return { slug: item.slug, status, projectUuid: synthUuid };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onProgress(`❌ ${item.slug} - error: ${message}`, "error");
    // Do not persist a partial entry; leave any prior entry intact.
    return { slug: item.slug, status: "error", error: message };
  }
}

/** Validate config + API key. Balance is returned by /me in cents. */
export async function checkConfig(
  config: VocaSyncConfig,
  client: VocaSyncClient
): Promise<{ valid: boolean; message: string; balanceCents?: number }> {
  try {
    const validation = await client.validateApiKey();
    if (!validation.valid) {
      return {
        valid: false,
        message: "Invalid API key. Check your VOCASYNC_API_KEY environment variable.",
      };
    }

    const items = await loadContent(config.collection, config.frontmatterField);
    const balance =
      validation.balanceCents !== undefined
        ? `$${(validation.balanceCents / 100).toFixed(2)}`
        : "unknown";

    return {
      valid: true,
      message: `Configuration valid. Found ${items.length} content items. Balance: ${balance}.`,
      balanceCents: validation.balanceCents,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, message: `Configuration error: ${message}` };
  }
}
