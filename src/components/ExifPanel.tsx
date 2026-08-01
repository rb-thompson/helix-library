import { HelpTip } from "@/components/Tooltip";
import type { ExifResult } from "@/lib/media/exif";

export function ExifPanel({ result }: { result: ExifResult }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
        EXIF / metadata
        <HelpTip content="Camera and file tags via exiftool when installed. Optional — image size already comes from sharp." />
      </h2>
      {!result.available ? (
        <p className="mt-2 text-sm text-stone-600">{result.reason}</p>
      ) : result.fields.length === 0 ? (
        <p className="mt-2 text-sm text-stone-600">
          No EXIF fields found ({result.rawKeys} raw tags scanned).
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {result.fields.map((f) => (
              <div
                key={f.label}
                className="rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {f.label}
                </dt>
                <dd className="mt-0.5 break-all text-sm text-stone-900">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-stone-400">
            {result.rawKeys} tags from exiftool · showing highlights
          </p>
        </>
      )}
    </section>
  );
}
