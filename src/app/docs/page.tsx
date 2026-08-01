import Link from "next/link";
import type { Metadata } from "next";
import {
  BookOpen,
  FolderOpen,
  HardDrive,
  Layers,
  Library,
  MessageCircle,
  RefreshCw,
  Search,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Docs",
  description: "Getting started and how to use your personal non-os library.",
};

const toc = [
  { id: "getting-started", label: "Getting started" },
  { id: "concepts", label: "Core concepts" },
  { id: "catalog", label: "Catalog & media" },
  { id: "collections", label: "Collections & tags" },
  { id: "locations", label: "Locations" },
  { id: "services", label: "Services & reindex" },
  { id: "librarian", label: "Ask the Librarian" },
  { id: "tips", label: "Tips & troubleshooting" },
];

export default function DocsPage() {
  return (
    <div className="grid gap-6 sm:gap-10 lg:grid-cols-[200px_1fr] xl:grid-cols-[220px_1fr]">
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          On this page
        </p>
        {/* Horizontal chips on mobile; vertical list on lg */}
        <nav
          className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1 lg:mt-3 lg:flex-col lg:space-y-1 lg:overflow-visible lg:pb-0"
          aria-label="Docs sections"
        >
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-teal-700/40 hover:bg-teal-50 sm:text-sm lg:rounded-md lg:border-0 lg:bg-transparent lg:px-2 lg:py-1.5 lg:font-normal lg:hover:bg-stone-100"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Link
          href="/"
          className="mt-3 hidden text-sm font-medium text-teal-800 hover:underline lg:mt-6 lg:inline-flex"
        >
          ← Back home
        </Link>
      </aside>

      <article className="min-w-0 space-y-10 sm:space-y-12">
        <header>
          <p className="text-xs font-medium uppercase tracking-wider text-teal-800 sm:text-sm">
            Documentation
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            Using non-os
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-stone-600 sm:text-base">
            non-os is your personal library for files on this machine: a catalog
            to find and preview holdings, shelves to curate them, and a
            Librarian to ask for help — all on localhost only.
          </p>
        </header>

        {/* Getting started */}
        <section id="getting-started" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="Getting started" />
          <ol className="mt-4 space-y-4">
            <Step n={1} title="Know your archive">
              Primary holdings live under{" "}
              <code className="rounded bg-stone-100 px-1 text-sm">archive/</code>{" "}
              in the project (
              <code className="rounded bg-stone-100 px-1 text-sm">documents</code>,{" "}
              <code className="rounded bg-stone-100 px-1 text-sm">images</code>,{" "}
              <code className="rounded bg-stone-100 px-1 text-sm">notes</code>,{" "}
              <code className="rounded bg-stone-100 px-1 text-sm">video</code>
              ). Drop files into the matching folder.
            </Step>
            <Step n={2} title="Index the catalog">
              Open{" "}
              <DocLink href="/services">Services</DocLink> or{" "}
              <DocLink href="/locations">Locations</DocLink> and click{" "}
              <strong>Run reindex</strong>, or in a terminal:{" "}
              <code className="rounded bg-stone-100 px-1 text-sm">
                npm run reindex
              </code>
              . Unchanged files are skipped automatically.
            </Step>
            <Step n={3} title="Browse and search">
              Use the home search bar or{" "}
              <DocLink href="/catalog">Catalog</DocLink>. Switch{" "}
              <strong>Grid</strong> / <strong>List</strong>, filter by format or
              location, and open any item to preview images, video, PDFs, and
              text. PDF holdings also show an indexed text sample when
              extractable.
            </Step>
            <Step n={4} title="Curate (optional)">
              Create a shelf on{" "}
              <DocLink href="/collections">Collections</DocLink>, then open an
              item and use <strong>Curation</strong> to add tags or put it on a
              shelf.
            </Step>
            <Step n={5} title="Ask for help">
              <DocLink href="/ask">Ask the Librarian</DocLink> answers
              find-and-locate questions using the catalog (local mode by
              default — no API key required).
            </Step>
          </ol>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <QuickLink
              href="/catalog"
              title="Open catalog"
              body="Search and preview holdings"
            />
            <QuickLink
              href="/locations"
              title="Manage locations"
              body="Add another folder to scan"
            />
            <QuickLink
              href="/services"
              title="Reindex & machine"
              body="Refresh the index; see host limits"
            />
            <QuickLink
              href="/ask"
              title="Ask the Librarian"
              body="Find files in plain language"
            />
          </div>
        </section>

        {/* Concepts */}
        <section id="concepts" className="scroll-mt-28">
          <SectionTitle icon={<BookOpen className="h-5 w-5" />} title="Core concepts" />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Term title="Holding / item">
              One indexed file: path, kind (image, video, document…), size, and
              optional preview metadata.
            </Term>
            <Term title="Location">
              A scan root — like a library branch. Only enabled locations are
              indexed. Default: <code className="text-xs">archive/</code>.
            </Term>
            <Term title="Collection">
              A manual shelf you curate (e.g. “STEM materials”). Does not move
              files on disk.
            </Term>
            <Term title="Tag">
              Lightweight labels on items. Filter the catalog by tag or browse
              tags from Collections.
            </Term>
            <Term title="Reindex">
              Walks locations, updates the SQLite catalog, builds thumbs/posters
              when possible.
            </Term>
            <Term title="Localhost only">
              The app binds to 127.0.0.1. Nothing is shared on the public
              internet in this setup.
            </Term>
          </dl>
        </section>

        {/* Catalog */}
        <section id="catalog" className="scroll-mt-28">
          <SectionTitle icon={<Search className="h-5 w-5" />} title="Catalog & media" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-stone-700">
            <li>
              <strong>Search</strong> matches names, paths, note/code samples,
              and <strong>PDF text layers</strong> (extracted on reindex).
              Image-only scanned PDFs may have no searchable body.
            </li>
            <li>
              <strong>Grid</strong> is best for images and video; click a card
              for fullscreen lightbox (← / → / Esc).
            </li>
            <li>
              <strong>Item detail</strong> streams media in-browser (image,
              video, audio, PDF, text). Download keeps the original filename.
            </li>
            <li>
              <strong>Thumbs</strong> for images use sharp; video posters use
              ffmpeg when available.
            </li>
            <li>
              <strong>EXIF</strong> appears when exiftool is installed on the
              host — otherwise the panel explains how to add it later.
            </li>
          </ul>
        </section>

        {/* Collections */}
        <section id="collections" className="scroll-mt-28">
          <SectionTitle icon={<Layers className="h-5 w-5" />} title="Collections & tags" />
          <p className="mt-3 text-sm text-stone-700">
            Collections are named shelves. Create one, open any catalog item,
            and use the Curation panel to add the item or attach tags. Filtering
            the catalog by collection or tag narrows results without changing
            files on disk.
          </p>
        </section>

        {/* Locations */}
        <section id="locations" className="scroll-mt-28">
          <SectionTitle icon={<FolderOpen className="h-5 w-5" />} title="Locations" />
          <p className="mt-3 text-sm text-stone-700">
            Add absolute or project-relative folder paths. Enable/disable
            without deleting history; remove only when you no longer want that
            root in the catalog. After adding a location, always reindex.
            Ignore patterns (node_modules, .git, …) are configured in{" "}
            <code className="rounded bg-stone-100 px-1 text-xs">
              library.config.json
            </code>
            .
          </p>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-28">
          <SectionTitle icon={<HardDrive className="h-5 w-5" />} title="Services & reindex" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-stone-700">
            <li>
              <strong>Run reindex</strong> refreshes holdings after you add or
              move files.
            </li>
            <li>
              <strong>Building</strong> shows host facts: CPU, memory, disk,
              bind address, and optional tools (ffprobe, ffmpeg, exiftool).
            </li>
            <li>
              CLI alternative:{" "}
              <code className="rounded bg-stone-100 px-1 text-xs">
                npm run reindex
              </code>
            </li>
          </ul>
        </section>

        {/* Librarian */}
        <section id="librarian" className="scroll-mt-28">
          <SectionTitle
            icon={<MessageCircle className="h-5 w-5" />}
            title="Ask the Librarian"
          />
          <p className="mt-3 text-sm text-stone-700">
            Default mode is a <strong>local catalog assistant</strong> — no API
            key. It answers questions like “Where is my resume?” by searching
            the index. A Grok chat subscription is separate from the xAI
            developer API; optional cloud phrasing needs{" "}
            <code className="rounded bg-stone-100 px-1 text-xs">XAI_API_KEY</code>{" "}
            and an opt-in mode (see README).
          </p>
          <p className="mt-2 text-sm text-stone-700">
            Try: find a file by name, list images, ask how to reindex, or check
            free disk space.
          </p>
        </section>

        {/* Tips */}
        <section id="tips" className="scroll-mt-28">
          <SectionTitle icon={<RefreshCw className="h-5 w-5" />} title="Tips & troubleshooting" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-stone-700">
            <li>
              New files not showing? Reindex. Confirm the folder is under an
              enabled location.
            </li>
            <li>
              Huge trees: keep ignore globs strong; avoid scanning all of{" "}
              <code className="rounded bg-stone-100 px-1 text-xs">node_modules</code>
              .
            </li>
            <li>
              Video posters need ffmpeg; duration needs ffprobe (usually from
              the same package).
            </li>
            <li>
              Hover controls site-wide for short hints; this page is the deeper
              guide.
            </li>
            <li>
              Privacy: only scan roots you add. Personal archive files under{" "}
              <code className="rounded bg-stone-100 px-1 text-xs">archive/</code>{" "}
              are gitignored by default.
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-semibold text-stone-900">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-800">
        {icon}
      </span>
      {title}
    </h2>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-xs font-bold text-white">
        {n}
      </span>
      <div>
        <p className="font-medium text-stone-900">{title}</p>
        <p className="mt-0.5 text-sm text-stone-600">{children}</p>
      </div>
    </li>
  );
}

function Term({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <dt className="font-semibold text-stone-900">{title}</dt>
      <dd className="mt-1 text-sm text-stone-600">{children}</dd>
    </div>
  );
}

function DocLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="font-medium text-teal-800 hover:underline">
      {children}
    </Link>
  );
}

function QuickLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-teal-700/40 hover:shadow"
    >
      <p className="font-semibold text-stone-900">{title}</p>
      <p className="mt-0.5 text-sm text-stone-600">{body}</p>
    </Link>
  );
}
