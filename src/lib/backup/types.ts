export type BackupMode = "catalog" | "full";

export type BackupManifest = {
  format: "helix-backup-v1";
  createdAt: string;
  mode: BackupMode;
  includeThumbs: boolean;
  app: "helix-library";
  hostname: string | null;
  /** Project-relative or absolute paths that were packed */
  includes: string[];
  locations: Array<{
    name: string;
    root: string;
    enabled: boolean;
    included: boolean;
  }>;
  notes: string[];
};

export type BackupFileInfo = {
  name: string;
  path: string;
  bytes: number;
  mtimeMs: number;
  mode: BackupMode | "unknown";
};

export type BackupCreateResult = {
  name: string;
  path: string;
  bytes: number;
  mode: BackupMode;
  manifest: BackupManifest;
};

/** User-picked actions include use-archived / remap; inspect defaults never do. */
export type RestoreLocationAction =
  | "keep-live"
  | "use-archived"
  | "disable"
  | "remap";

export type RestorePreview = {
  name: string;
  bytes: number;
  mode: BackupMode;
  format: "helix-backup-v1";
  createdAt: string;
  hostname: string | null;
  thisHostname: string;
  hostnameMismatch: boolean;
  includeThumbs: boolean;
  hasDb: boolean;
  hasConfig: boolean;
  hasThumbs: boolean;
  hasHoldings: boolean;
  memberCount: number;
  memberListTruncated: boolean;
  locations: Array<{
    name: string;
    archivedRoot: string;
    archivedEnabled: boolean;
    includedInArchive: boolean;
    liveRoot: string | null;
    liveExists: boolean;
    archivedRootExists: boolean;
    /** Cannot be newly enabled (system / $HOME child / repo source). */
    forbidden: boolean;
    /** keep-live when a live name match exists, else disable. */
    defaultAction: RestoreLocationAction;
  }>;
  notes: string[];
  warnings: string[];
  previewHash: string;
};

export type RestoreLiveStats = {
  itemCount: number;
  dbPath: string;
  dbBytes: number;
};
