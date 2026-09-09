/**
 * Content item loaded from a collection
 */
export interface ContentItem {
  /** Unique slug identifier */
  slug: string;
  /** Original markdown/mdx content */
  content: string;
  /** Frontmatter data */
  frontmatter: Record<string, unknown>;
  /** Relative file path */
  filePath: string;
}

/**
 * Processed speech document ready for synthesis + alignment.
 *
 * `speechtext` is POSTed to /synthesis (expanded spoken form, punctuation
 * preserved). `normalisedSpeechtext` is POSTed as the alignment transcript
 * (stripped form) and is the exact token stream the rehype plugin indexes.
 */
export interface SpeechDocument {
  /** Unique slug identifier */
  slug: string;
  /** Expanded spoken text for TTS synthesis */
  speechtext: string;
  /** Normalised transcript for alignment (token-for-token with data-i) */
  normalisedSpeechtext: string;
  /**
   * Spoken form of each math expression, keyed by `${'d'|'i'}:${latex}`
   * (d = display/block, i = inline). The rehype plugin reuses these so the
   * math tokens it counts match what was synthesized — math-to-speech runs
   * only here (Node/CLI), never in the Astro/Vite build.
   */
  mathSpeech: Record<string, string>;
  /** Source file path */
  source: string;
}

/**
 * Word alignment data from VocaSync API
 */
export interface AlignedWord {
  /** The word text */
  word: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
}

/**
 * Audio artifact entry in audio-map.json (v3).
 *
 * The two-POST flow produces TWO projects: a synthesis project (whose
 * stream serves the audio) and an alignment project (used at build time
 * to fetch the word timings, which are embedded here as `words`). Each
 * project has its own publishable key.
 */
export interface AudioArtifact {
  /** Hash of normalisedSpeechtext + resolved voice/language/format */
  contentHash: string;
  /** Resolved synthesis params (also part of change detection) */
  voice: string;
  language: string;
  format: string;
  /** Synthesis project (serves the audio stream) */
  synthesisProjectUuid: string;
  synthesisPublishableKey: string;
  /** Stable audio stream URL (without the publishable key) */
  audioUrl: string;
  /**
   * Whether this artifact was force-aligned.
   *
   * Recorded explicitly because absence cannot express intent: without it, an entry
   * synthesised deliberately without alignment is indistinguishable from one whose
   * alignment failed halfway, and `isUpToDate` would re-synthesise it on every sync --
   * paying for the audio again, silently, forever.
   *
   * Absent on artifacts written before v2.1.0, which were always aligned.
   */
  aligned?: boolean;
  /** Alignment project (source of the embedded timings). Absent when not aligned. */
  alignmentProjectUuid?: string;
  alignmentPublishableKey?: string;
  /**
   * Word timings, indexed positionally by the rehype plugin's data-i.
   * Absent when the artifact was synthesised without alignment.
   */
  words?: AlignedWord[];
  /** Total audio duration in seconds */
  duration: number;
  /** Spoken form of each math expression, keyed by `${'d'|'i'}:${latex}`. */
  mathSpeech?: Record<string, string>;
  /** When this artifact was created */
  createdAt: string;
  /** When this artifact was last updated */
  updatedAt: string;
}

/**
 * The audio-map.json file structure
 */
export interface AudioMap {
  /** Version of the audio-map schema */
  version: 1 | 2 | 3;
  /** When the map was last updated */
  updatedAt: string;
  /** Map of slug -> audio artifact */
  entries: Record<string, AudioArtifact>;
}

/**
 * VocaSync API synthesis request (FormData fields).
 */
export interface SynthesisRequest {
  name: string;
  text: string;
  voice: string;
  quality: "sd" | "hd";
  /** ISO 639-1 language code */
  language: string;
  /** Output container: mp3 | aac | opus | flac | wav */
  outputFormat: string;
}

/**
 * VocaSync API synthesis response (POST /v1/synthesis).
 */
export interface SynthesisResponse {
  projectUuid: string;
  projectId?: string;
  characterCount?: number;
  status?: JobStatus;
}

/**
 * Presigned upload target for one file.
 */
export interface PresignTarget {
  key: string;
  uploadUrl: string;
}

/**
 * Response from POST /v1/alignment/presign.
 */
export interface AlignmentPresignResponse {
  /** UUID minted for the alignment project; reused in the /alignment POST */
  projectUuid: string;
  audio: PresignTarget;
  transcript: PresignTarget;
}

/**
 * Response from POST /v1/alignment (JSON mode).
 */
export interface AlignmentSubmitResponse {
  projectUuid: string;
  projectId?: string;
  jobId?: string;
  status?: JobStatus;
}

/**
 * VocaSync API publishable key response
 */
export interface PublishableKeyResponse {
  publishableKey: string;
  projectUuid: string;
  prefix: string;
  createdAt: string;
}

/**
 * Job status from VocaSync API
 */
export type JobStatus = "pending" | "processing" | "completed" | "failed";

/**
 * API Artifact response
 */
export interface ArtifactResponse {
  id: string;
  artifactType: "alignment" | "synthesis";
  createdAt: number;
  alignmentFileKey?: string;
  alignmentFileSizeBytes?: number;
  srtFileKey?: string;
  srtFileSizeBytes?: number;
  vttFileKey?: string;
  vttFileSizeBytes?: number;
  synthesisFileKey?: string;
  synthesisFileSizeBytes?: number;
  synthesisFileName?: string;
}

/**
 * API Job response
 */
export interface JobResponse {
  id: string;
  status: JobStatus;
  createdAt: number;
  completedAt: number | null;
  error: string | null;
}

/**
 * Project response from GET /v1/projects/{uuid}.
 */
export interface ProjectResponse {
  id: string;
  projectUuid: string;
  name: string | null;
  description: string | null;
  projectType: "alignment" | "synthesis" | "transcription" | "translation";
  source: "web" | "api";
  language: string | null;
  status: JobStatus;
  characterCount: number | null;
  audioFileDurationSeconds: number | null;
  createdAt: number;
  completedAt: number | null;
  error: string | null;
  artifacts: ArtifactResponse[];
  latestJob?: JobResponse | null;
}

/**
 * Project status (internal, single-project representation used by the
 * poller and the `status` CLI command).
 */
export interface ProjectStatus {
  uuid: string;
  name: string;
  projectType: ProjectResponse["projectType"];
  status: JobStatus;
  durationSeconds?: number;
  error?: string;
}

/**
 * Alignment data fetched from VocaSync
 */
export interface AlignmentData {
  words: AlignedWord[];
  duration: number;
}

/**
 * Sync status for a content item
 */
export type SyncStatus = "unchanged" | "new" | "updated" | "error";

/**
 * Result of syncing a single content item
 */
export interface SyncResult {
  slug: string;
  status: SyncStatus;
  projectUuid?: string;
  error?: string;
}

/**
 * Overall sync summary
 */
export interface SyncSummary {
  total: number;
  unchanged: number;
  synced: number;
  errors: number;
  results: SyncResult[];
}
