import Link from "next/link";
import type { Metadata } from "next";
import {
  BookOpen,
  Download,
  FolderOpen,
  HardDrive,
  Layers,
  Library,
  MessageCircle,
  Network,
  RefreshCw,
  Search,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Docs",
  description: "Getting started and how to use your personal Helix Library.",
};

const toc = [
  { id: "getting-started", label: "Getting started" },
  { id: "concepts", label: "Core concepts" },
  { id: "catalog", label: "Catalog & media" },
  { id: "reading-room", label: "Reading room" },
  { id: "collections", label: "Collections & tags" },
  { id: "graph", label: "Knowledge graph" },
  { id: "locations", label: "Locations" },
  { id: "acquire", label: "Acquire (ILL desk)" },
  { id: "services", label: "Services & reindex" },
  { id: "librarian", label: "Ask the Librarian" },
  { id: "agent-tasks", label: "Agent tasks & approve" },
  { id: "tips", label: "Tips & troubleshooting" },
];

export default function DocsPage() {
  return (
    <div className="grid gap-6 sm:gap-10 lg:grid-cols-[200px_1fr] xl:grid-cols-[220px_1fr]">
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <p className="eyebrow">On this page</p>
        {/* Horizontal chips on mobile; vertical list on lg */}
        <nav
          className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1 lg:mt-3 lg:flex-col lg:space-y-1 lg:overflow-visible lg:pb-0"
          aria-label="Docs sections"
        >
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:border-[var(--accent-ring)] hover:bg-[var(--accent-soft)] sm:text-sm lg:rounded-md lg:border-0 lg:bg-transparent lg:px-2 lg:py-1.5 lg:font-normal lg:hover:bg-[var(--surface-hover)]"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Link
          href="/"
          className="link-accent mt-3 hidden text-sm lg:mt-6 lg:inline-flex"
        >
          ← Back home
        </Link>
      </aside>

      <article className="min-w-0 max-w-3xl space-y-10 sm:space-y-12 2xl:max-w-4xl">
        <header>
          <p className="eyebrow">Documentation</p>
          <h1 className="page-title mt-1 text-2xl sm:text-3xl">
            Using Helix Library
          </h1>
          <p className="page-sub mt-3 max-w-2xl text-sm sm:text-base">
            Helix Library is your personal library for files on this machine: a catalog
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
              <code className="code-inline">archive/</code>{" "}
              in the project (
              <code className="code-inline">documents</code>,{" "}
              <code className="code-inline">images</code>,{" "}
              <code className="code-inline">notes</code>,{" "}
              <code className="code-inline">video</code>
              ). Drop files into the matching folder.
            </Step>
            <Step n={2} title="Index the catalog">
              Open{" "}
              <DocLink href="/services">Services</DocLink> or{" "}
              <DocLink href="/locations">Locations</DocLink> and click{" "}
              <strong>Run reindex</strong>, or in a terminal:{" "}
              <code className="code-inline">
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
              extractable. Documents open in the{" "}
              <strong>reading room</strong> with position memory.
            </Step>
            <Step n={4} title="Curate (optional)">
              Create a manual or <strong>smart</strong> shelf on{" "}
              <DocLink href="/collections">Collections</DocLink>, then open an
              item and use <strong>Curation</strong> to add tags or put it on a
              shelf. Explore neighbors on the item page and on the{" "}
              <DocLink href="/graph">knowledge graph</DocLink>.
            </Step>
            <Step n={5} title="Ask the Librarian">
              <DocLink href="/ask">Ask</DocLink> finds holdings, reads extracted
              PDF/note text, and can propose library tasks. From a reading room
              selection, use <strong>Ask</strong> to open chat about that
              holding. With an xAI <strong>developer</strong> API key it uses
              Grok; otherwise a local assistant. Mutations always need your{" "}
              <strong>approve</strong>.
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
              indexed. Default: <code className="code-inline">archive/</code>.
            </Term>
            <Term title="Collection">
              A shelf you curate — either a <strong>manual</strong> list of
              holdings or a <strong>smart</strong> shelf driven by a saved
              catalog query. Does not move files on disk.
            </Term>
            <Term title="Tag">
              Lightweight labels on items. Filter the catalog by tag or browse
              tags from Collections.
            </Term>
            <Term title="Reading room">
              Continuous text/code reader and PDF page viewer on item detail,
              with local position memory so you can resume where you left off.
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
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
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
              video, audio, PDF, text). Documents use the{" "}
              <a href="#reading-room" className="link-accent">
                reading room
              </a>
              . Download keeps the original filename.
            </li>
            <li>
              <strong>Related holdings</strong> on the item page list neighbors
              in the same folder, sharing tags, or co-shelved with this item.
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

        {/* Reading room */}
        <section id="reading-room" className="scroll-mt-28">
          <SectionTitle
            icon={<BookOpen className="h-5 w-5" />}
            title="Reading room"
          />
          <p className="prose-body mt-3">
            Open a text, code, or PDF holding to read in place. The room
            remembers scroll (text) or page (PDF) in this browser via{" "}
            <code className="code-inline">helix-read-position</code> — no
            server-side history. Use{" "}
            <code className="code-inline">?room=1</code> on an item URL to force
            the room layout.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Text / code</strong> — continuous scroll with restore on
              reload.
            </li>
            <li>
              <strong>PDF</strong> — page-mode viewer with a selectable text
              layer when the file has extractable text. If the viewer fails, an
              iframe fallback still works; download always remains available.
            </li>
            <li>
              <strong>Selection toolbar</strong> — select text, then{" "}
              <strong>Tag</strong>, <strong>Ask</strong> (opens{" "}
              <DocLink href="/ask">Ask</DocLink> with this holding in context),
              or <strong>Copy</strong>.
            </li>
            <li>
              Binary or unsupported types stay on the normal media preview;
              they are not forced into the room.
            </li>
          </ul>
        </section>

        {/* Collections */}
        <section id="collections" className="scroll-mt-28">
          <SectionTitle icon={<Layers className="h-5 w-5" />} title="Collections & tags" />
          <p className="prose-body mt-3">
            Collections are named shelves. Create a <strong>manual</strong>{" "}
            shelf, open any catalog item, and use the Curation panel to add the
            item or attach tags. Filtering the catalog by collection or tag
            narrows results without changing files on disk.
          </p>
          <p className="prose-body mt-3">
            <strong>Smart shelves</strong> save a catalog query (kind, tags,
            path, etc.) and stay live as the index changes. Use them from
            Collections, catalog filters, and the knowledge graph. You cannot
            manually add or remove items on a smart shelf — edit the query
            instead. Shelf detail pages paginate when a query matches many
            holdings.
          </p>
        </section>

        {/* Graph */}
        <section id="graph" className="scroll-mt-28">
          <SectionTitle
            icon={<Network className="h-5 w-5" />}
            title="Knowledge graph"
          />
          <p className="prose-body mt-3">
            Open <DocLink href="/graph">Graph</DocLink> for a map of holdings,
            tags, and shelves. Prefer <strong>2D</strong> on phones or when you
            reduce motion; switch to <strong>3D</strong> when you want depth.
            Caps keep large libraries responsive — the UI shows how many items
            are drawn versus the full catalog. Filter by collection (including
            smart shelves) or kind from the controls.
          </p>
        </section>

        {/* Locations */}
        <section id="locations" className="scroll-mt-28">
          <SectionTitle icon={<FolderOpen className="h-5 w-5" />} title="Locations" />
          <p className="prose-body mt-3">
            Add absolute or project-relative folder paths. Enable/disable
            without deleting history; remove only when you no longer want that
            root in the catalog. After adding a location, always reindex.
            Ignore patterns (node_modules, .git, …) are configured in{" "}
            <code className="code-inline">
              library.config.json
            </code>
            .
          </p>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-28">
          <SectionTitle icon={<HardDrive className="h-5 w-5" />} title="Services & reindex" />
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
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
              <code className="code-inline">
                npm run reindex
              </code>
            </li>
          </ul>
        </section>

        {/* Acquire */}
        <section id="acquire" className="scroll-mt-28">
          <SectionTitle
            icon={<Download className="h-5 w-5" />}
            title="Acquire (interlibrary desk)"
          />
          <p className="prose-body mt-3">
            Open <DocLink href="/acquire">Acquire</DocLink> to pull remote
            resources into your Archive holdings — like an interlibrary loan
            arriving at your stacks.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>arXiv PDF</strong> — search by topic or paste an id/URL;
              saves under{" "}
              <code className="code-inline">archive/documents/</code>.
            </li>
            <li>
              <strong>Papers (OpenAlex)</strong> — wider open-access net by
              search or DOI. <strong>Fetch</strong> only enables when OpenAlex
              lists a direct PDF URL (accuracy gate). Optional free API key:{" "}
              <code className="code-inline">NON_OS_OPENALEX_API_KEY</code>.
            </li>
            <li>
              <strong>Web clip</strong> — paste a page URL; extracts readable
              Markdown into{" "}
              <code className="code-inline">archive/notes/</code> with source
              URL frontmatter.
            </li>
            <li>
              <strong>YouTube / podcast</strong> — needs host{" "}
              <code className="code-inline">yt-dlp</code> on{" "}
              <code className="code-inline">PATH</code> (and often{" "}
              <code className="code-inline">ffmpeg</code>). Video or audio-only.
            </li>
            <li>
              <strong>Grok image</strong> — needs{" "}
              <code className="code-inline">XAI_API_KEY</code> (developer API,
              not SuperGrok alone) and cloud allowed (
              <code className="code-inline">NON_OS_USE_XAI</code> not{" "}
              <code className="code-inline">0</code>). Default model{" "}
              <code className="code-inline">grok-imagine-image-quality</code>{" "}
              (override with{" "}
              <code className="code-inline">NON_OS_IMAGE_MODEL</code>). Saves
              under <code className="code-inline">archive/images/</code>.
            </li>
          </ul>
          <p className="prose-body mt-3">
            Each successful acquire reindexes automatically. Personal use only;
            you are responsible for rights to downloaded media and clipped
            pages. No paywall bypass — OpenAlex only fetches listed OA PDFs.
          </p>
        </section>

        {/* Librarian */}
        <section id="librarian" className="scroll-mt-28">
          <SectionTitle
            icon={<MessageCircle className="h-5 w-5" />}
            title="Ask the Librarian"
          />
          <p className="prose-body mt-3">
            Open <DocLink href="/ask">Ask</DocLink> for natural-language help
            over your catalog. The librarian can locate holdings, read extracted
            document text, summarize or evaluate content (e.g. a resume), and
            propose in-app tasks. Paths and file contents come only from the
            catalog tools — not invented.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">
            Grok vs local
          </h3>
          <ul className="mt-2 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Grok (preferred when configured)</strong> — needs an xAI{" "}
              <em>developer</em> API key in{" "}
              <code className="code-inline">
                .env.local
              </code>{" "}
              as{" "}
              <code className="code-inline">
                XAI_API_KEY
              </code>{" "}
              from{" "}
              <a
                href="https://console.x.ai"
                className="link-accent"
                target="_blank"
                rel="noreferrer"
              >
                console.x.ai
              </a>
              . Model defaults to{" "}
              <code className="code-inline">
                grok-4.3
              </code>{" "}
              (
              <code className="code-inline">
                NON_OS_MODEL
              </code>
              ).
            </li>
            <li>
              <strong>Local</strong> — no key; finds files and proposes tasks
              with template answers. Always available as fallback.
            </li>
            <li>
              A <strong>SuperGrok / X Premium chat subscription is not an API
              key</strong>. It does not power in-app Grok. (Partner apps like
              OpenClaw can use subscription OAuth separately.)
            </li>
          </ul>

          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">
            What to ask
          </h3>
          <ul className="mt-2 prose-body list-disc space-y-1.5 pl-5">
            <li>
              <em>Find:</em> “Where is my resume?” · “Images of Finn or Phoebe?”
            </li>
            <li>
              <em>Read / review:</em> “Is my resume good?” · “Summarize the
              Science PDF”
            </li>
            <li>
              <em>This holding:</em> from the reading room, select text →{" "}
              <strong>Ask</strong>, or open{" "}
              <code className="code-inline">/ask?item=…</code> — the librarian
              already has catalog context for that item.
            </li>
            <li>
              <em>Machine:</em> “How much disk free?” · “Is ffmpeg available?”
            </li>
            <li>
              <em>How-to:</em> “How do I reindex?” · “What are locations?”
            </li>
          </ul>
          <p className="prose-body mt-2">
            Hits should include a clickable{" "}
            <code className="code-inline">
              /catalog/…
            </code>{" "}
            link. Search matches names, paths, and body text — including
            fragments inside compound filenames (e.g.{" "}
            <code className="code-inline">
              finnandphoebe
            </code>
            ).
          </p>
          <p className="prose-body mt-2 text-[var(--muted)]">
            Press <kbd className="kbd">/</kbd>{" "}
            anywhere (outside a field) to focus catalog search on pages that
            have it.
          </p>
        </section>

        {/* Agent tasks */}
        <section id="agent-tasks" className="scroll-mt-28">
          <SectionTitle
            icon={<Layers className="h-5 w-5" />}
            title="Agent tasks & approval"
          />
          <p className="prose-body mt-3">
            The librarian can <strong>propose</strong> catalog and config
            changes. Nothing mutates until you confirm — click{" "}
            <strong>Approve</strong> on the message, or reply{" "}
            <code className="code-inline">approve</code>,{" "}
            <code className="code-inline">yes</code>, or{" "}
            <code className="code-inline">do it</code>.
            Cancel with{" "}
            <code className="code-inline">cancel</code> /{" "}
            <code className="code-inline">no</code>.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">
            Example task prompts
          </h3>
          <ul className="mt-2 prose-body list-disc space-y-1.5 pl-5">
            <li>
              <code className="code-inline">
                reindex now
              </code>
            </li>
            <li>
              <code className="code-inline">
                tag resume as career
              </code>
            </li>
            <li>
              <code className="code-inline">
                create collection STEM
              </code>
            </li>
            <li>
              <code className="code-inline">
                add resume to collection Career
              </code>
            </li>
            <li>
              <code className="code-inline">
                rename collection career to Career
              </code>
            </li>
            <li>
              <code className="code-inline">
                describe collection Career as Job search materials
              </code>
            </li>
          </ul>

          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">
            What it will not do
          </h3>
          <ul className="mt-2 prose-body list-disc space-y-1.5 pl-5">
            <li>Run shell commands or install packages</li>
            <li>Delete your personal files on disk</li>
            <li>Wipe the app or database</li>
            <li>Apply tags/shelves/reindex without your approval</li>
          </ul>
          <p className="prose-body mt-3 text-[var(--muted)]">
            You can also curate without the agent: catalog{" "}
            <strong>Select</strong> for bulk shelf/tag, or item detail →
            Curation. Edit a collection’s name/description on its shelf page.
          </p>
        </section>

        {/* Tips */}
        <section id="tips" className="scroll-mt-28">
          <SectionTitle icon={<RefreshCw className="h-5 w-5" />} title="Tips & troubleshooting" />
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              New files not showing? Reindex. Confirm the folder is under an
              enabled location.
            </li>
            <li>
              Agent says it can’t evaluate a PDF? Reindex so text is extracted;
              scanned image-only PDFs may have no text layer.
            </li>
            <li>
              PDF reading room broken after a dependency change? Run{" "}
              <code className="code-inline">npm run sync:pdfjs</code> and hard
              refresh. Do not webpack-import{" "}
              <code className="code-inline">pdfjs-dist</code> — the app loads
              from <code className="code-inline">public/</code>.
            </li>
            <li>
              Theme: toggle dark/light in the header; the Helix mark swaps to a
              light-field asset on light theme.
            </li>
            <li>
              Grok errors about a model “not on your team”? Set{" "}
              <code className="code-inline">
                NON_OS_MODEL=grok-4.3
              </code>{" "}
              (or another id listed for your console key) and restart{" "}
              <code className="code-inline">
                npm run dev
              </code>
              .
            </li>
            <li>
              Huge trees: keep ignore globs strong; avoid scanning all of{" "}
              <code className="code-inline">node_modules</code>
              .
            </li>
            <li>
              Video posters need ffmpeg; duration needs ffprobe. EXIF needs{" "}
              <code className="code-inline">exiftool</code>{" "}
              on <code className="code-inline">PATH</code>.
            </li>
            <li>
              UI looks broken after hot reload?{" "}
              <code className="code-inline">
                rm -rf .next && npm run dev
              </code>
              .
            </li>
            <li>
              Privacy: only scan roots you add. Personal files under{" "}
              <code className="code-inline">archive/</code>{" "}
              are gitignored. Never commit{" "}
              <code className="code-inline">.env.local</code>
              .
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
    <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--ink)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-fg)]">
        {n}
      </span>
      <div>
        <p className="font-medium text-[var(--ink)]">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--muted)]">{children}</p>
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
    <div className="surface p-4">
      <dt className="font-semibold text-[var(--ink)]">{title}</dt>
      <dd className="mt-1 text-sm text-[var(--muted)]">{children}</dd>
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
    <Link href={href} className="link-accent">
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
      className="surface p-4 transition hover:border-[var(--accent-ring)] hover:shadow-[var(--shadow-lift)]"
    >
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-0.5 text-sm text-[var(--muted)]">{body}</p>
    </Link>
  );
}
