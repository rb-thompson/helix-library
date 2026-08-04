import { HelpTip } from "@/components/Tooltip";
import type { ExifResult } from "@/lib/media/exif";

export function ExifPanel({ result }: { result: ExifResult }) {
  return (
    <section className="surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        EXIF / metadata
        <HelpTip content="Camera and file tags via exiftool when installed. Optional — image size already comes from sharp." />
      </h2>
      {!result.available ? (
        <p className="mt-2 text-sm text-[var(--muted)]">{result.reason}</p>
      ) : result.fields.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No EXIF fields found ({result.rawKeys} raw tags scanned).
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {result.fields.map((f) => (
              <div
                key={f.label}
                className="surface-inset px-3 py-2"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {f.label}
                </dt>
                <dd className="mt-0.5 break-all text-sm text-[var(--ink)]">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-[var(--muted-faint)]">
            {result.rawKeys} tags from exiftool · showing highlights
          </p>
        </>
      )}
    </section>
  );
}
