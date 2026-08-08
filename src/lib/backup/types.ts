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
