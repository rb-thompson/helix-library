import Link from "next/link";
import type { Metadata } from "next";
import {
  Aperture,
  BookOpen,
  Download,
  FolderOpen,
  HardDrive,
  Keyboard,
  Layers,
  Library,
  Map,
  MessageCircle,
  Network,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { MAIN_NAV } from "@/lib/nav";
import { HelixGlyph } from "@/components/icons/HelixGlyph";
import { NavIcon } from "@/components/icons/nav";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "A comprehensive overview of Helix Library — the personal OPAC for files on this machine.",
};

const toc = [
  { id: "the-library", label: "The library" },
  { id: "getting-started", label: "Getting started" },
  { id: "building", label: "The building" },
  { id: "concepts", label: "Core concepts" },
  { id: "catalog", label: "Catalog & media" },
  { id: "reading-room", label: "Reading room" },
  { id: "deep-lens", label: "Deep Lens" },
  { id: "collections", label: "Collections & tags" },
  { id: "graph", label: "Knowledge graph" },
  { id: "locations", label: "Locations" },
  { id: "acquire", label: "Acquire (ILL desk)" },
  { id: "librarian", label: "Ask the Librarian" },
  { id: "agent-tasks", label: "Agent tasks & approve" },
  { id: "services", label: "Services, backup & restore" },
  { id: "privacy", label: "Privacy & limits" },
  { id: "reference", label: "Keyboard & tips" },
];

export default function DocsPage() {
  return (
    <div className="grid gap-6 sm:gap-10 lg:grid-cols-[200px_1fr] xl:grid-cols-[220px_1fr]">
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <p className="eyebrow">On this page</p>
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
        <header className="docs-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/docs-folio.jpg"
            alt=""
            className="docs-hero__art"
            aria-hidden
          />
          <div className="docs-hero__scrim" aria-hidden />
          <div className="relative">
            <p className="eyebrow">Documentation</p>
            <h1 className="page-title mt-1 text-2xl sm:text-3xl">
              Helix Library
            </h1>
            <p className="page-sub mt-3 max-w-2xl text-sm sm:text-base">
              A personal library for files on this machine. Helix is an OPAC —
              the same idea as a public-library catalog — rebuilt for one
              person, one host, and the folders you choose to scan. Nothing
              leaves localhost unless you turn on a password-gated LAN preview.
            </p>
            <p className="prose-body mt-3 max-w-2xl">
              This page is the in-app handbook: what every desk does, how the
              pieces fit, and how to stay safe. For a hands-on walkthrough with
              exercises, open the field guide in the archive after you reindex
              —{" "}
              <code className="code-inline">
                archive/documents/Helix-Library-Field-Guide.md
              </code>
              .
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/catalog" className="btn btn-helix">
                <HelixGlyph />
                Open catalog
              </Link>
              <Link href="/ask" className="btn btn-secondary">
                Ask the Librarian
              </Link>
            </div>
          </div>
        </header>

        {/* The library */}
        <section id="the-library" className="scroll-mt-28">
          <SectionTitle icon={<Map className="h-5 w-5" />} title="The library" />
          <p className="prose-body mt-3">
            Think of Helix as a small public library mapped onto your disk.
            Holdings are files. Locations are branches. The catalog is the
            card file. Collections are shelves. The reading room is where you
            sit with a document. Acquire is interlibrary loan. Ask is the
            reference desk. Services is the workroom behind the counter.
          </p>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {MAIN_NAV.map((desk) => (
              <Link
                key={desk.href}
                href={desk.href}
                className="surface flex items-start gap-3 p-3.5 transition hover:border-[var(--accent-ring)] hover:shadow-[var(--shadow-lift)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <NavIcon name={desk.icon} className="!opacity-100" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--ink)]">
                    {desk.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--muted)]">
                    {desk.tip}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="prose-body mt-4 text-[var(--muted)]">
            Home (<DocLink href="/">/</DocLink>) is the front steps: search,
            holdings counts, Hours (a due-slip the night clerk left out),
            recent opens (this browser plus server{" "}
            <code className="code-inline">item_events</code>), and a tile for
            every desk.
          </p>
        </section>

        {/* Getting started */}
        <section id="getting-started" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="Getting started" />
          <ol className="mt-4 space-y-4">
            <Step n={1} title="Know your archive">
              Primary holdings live under{" "}
              <code className="code-inline">archive/</code> in the project —
              <code className="code-inline">documents</code>,{" "}
              <code className="code-inline">images</code>,{" "}
              <code className="code-inline">notes</code>,{" "}
              <code className="code-inline">video</code>,{" "}
              <code className="code-inline">audio</code>,{" "}
              <code className="code-inline">code</code>. Drop files into the
              matching folder (subfolders are fine). Helix never default-scans
              your home directory.
            </Step>
            <Step n={2} title="Index the catalog">
              Open <DocLink href="/services">Services</DocLink> or{" "}
              <DocLink href="/locations">Locations</DocLink> and click{" "}
              <strong>Run reindex</strong>, or in a terminal:{" "}
              <code className="code-inline">npm run reindex</code>. Unchanged
              files are skipped. Optional:{" "}
              <code className="code-inline">npm run watch</code> reindexes when
              files change under enabled roots.
            </Step>
            <Step n={3} title="Browse and search">
              Use the home search bar or{" "}
              <DocLink href="/catalog">Catalog</DocLink>. Switch{" "}
              <strong>Grid</strong> / <strong>List</strong>, filter by format,
              location, tag, or shelf, and open any item to preview. Documents
              open in the <strong>reading room</strong> with position memory.
              Press <kbd className="kbd">/</kbd> on pages with search to focus
              the box.
            </Step>
            <Step n={4} title="Curate (optional)">
              Create a manual or <strong>smart</strong> shelf on{" "}
              <DocLink href="/collections">Collections</DocLink>, then open an
              item and use <strong>Curation</strong> to add tags or put it on a
              shelf. Use catalog <strong>Select</strong> for bulk work. Explore
              neighbors on the item page and on the{" "}
              <DocLink href="/graph">knowledge graph</DocLink>.
            </Step>
            <Step n={5} title="Read, ask, acquire">
              Read in place. From a selection, <strong>Tag</strong>,{" "}
              <strong>Ask</strong>, or <strong>Copy</strong>.{" "}
              <DocLink href="/ask">Ask the Librarian</DocLink> finds holdings
              and can propose library tasks — mutations always need your{" "}
              <strong>approve</strong>. Pull new material at{" "}
              <DocLink href="/acquire">Acquire</DocLink>. Snapshot the catalog
              from <DocLink href="/services">Services</DocLink> before big
              weeding or restore experiments.
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
              title="Services"
              body="Reindex, backup, and restore a snapshot"
            />
            <QuickLink
              href="/ask"
              title="Ask the Librarian"
              body="Find files in plain language"
            />
          </div>
        </section>

        {/* The building */}
        <section id="building" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="The building" />
          <p className="prose-body mt-3">
            Helix is a localhost web app on port{" "}
            <code className="code-inline">4747</code>. The chrome is the
            building: left rail, header jobs, theme, and a quiet Hours desk on
            the front steps.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Left sidebar</strong> — Stacks (Catalog, Graph,
              Collections, Ask, Deep Lens) and Library ops (Locations, Acquire,
              Services, Docs, Design). Collapse to icons, or press{" "}
              <kbd className="kbd">[</kbd> on desktop. Phones use the header
              hamburger — same list, as a drawer.
            </li>
            <li>
              <strong>Header</strong> — jobs strip (reindex, acquire, backup,
              restore) and the dark / light toggle. Light theme is a day
              reading room (warm paper, lamp). The H+helix mark swaps to a
              light-field asset automatically.
            </li>
            <li>
              <strong>Hours</strong> — on the home hero, a due-slip for one
              holding “left on the cart,” plus a time-of-day line. Dawn warms
              the hero with lamp light. Circulation warmth is intentional; the
              rest of the chrome stays starlight-cool.
            </li>
            <li>
              <strong>Mini player</strong> — start audio or video on an item,
              then navigate away. Playback continues in a bar at the bottom of
              the building.
            </li>
            <li>
              <strong>Toasts</strong> — short confirmations (tags, shelves,
              dismiss). At most three at once. Restore never uses a toast —
              you type <code className="code-inline">RESTORE</code>.
            </li>
          </ul>
        </section>

        {/* Concepts */}
        <section id="concepts" className="scroll-mt-28">
          <SectionTitle icon={<BookOpen className="h-5 w-5" />} title="Core concepts" />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Term title="Holding / item">
              One indexed file: path, kind (image, video, document, audio,
              code…), size, and optional preview metadata. The file on disk
              is the holding; the catalog row is the card.
            </Term>
            <Term title="Location">
              A scan root — like a library branch. Only enabled locations are
              indexed. Default: <code className="code-inline">archive/</code>.
              Extra roots (a Vault volume, a project folder) are added on
              Locations.
            </Term>
            <Term title="Collection">
              A shelf you curate — either a <strong>manual</strong> list of
              holdings or a <strong>smart</strong> shelf driven by a saved
              catalog query. Does not move files on disk.
            </Term>
            <Term title="Tag">
              Lightweight labels on items. Filter the catalog by tag, browse
              tags from Collections, or merge duplicates in the hygiene panel.
            </Term>
            <Term title="Reading room">
              Continuous text/code reader and PDF page viewer on item detail,
              with local position memory so you can resume where you left off.
            </Term>
            <Term title="Deep Lens">
              One-surface workspace for a holding: encyclopedia entry, the
              source itself, structural neighbors, and durable insights you
              write.
            </Term>
            <Term title="Reindex">
              Walks enabled locations, updates the SQLite catalog, extracts
              text, and builds thumbs/posters when host tools allow.
            </Term>
            <Term title="Snapshot">
              A backup tarball in{" "}
              <code className="code-inline">data/exports/</code>. Catalog
              snapshots hold the card catalog (and optional thumbs). Full
              snapshots also pack holdings trees, but in-app restore does
              not write those files back onto disk.
            </Term>
            <Term title="Job">
              Long work Helix runs in the background: reindex, acquire,
              backup, restore, Deep Lens analysis. Watch progress in the
              header strip or on Services.
            </Term>
            <Term title="Localhost only">
              The app binds to 127.0.0.1 by default. Nothing is shared on the
              public internet in this setup.
            </Term>
          </dl>
        </section>

        {/* Catalog */}
        <section id="catalog" className="scroll-mt-28">
          <SectionTitle icon={<Search className="h-5 w-5" />} title="Catalog & media" />
          <p className="prose-body mt-3">
            The catalog is the heart of the OPAC. Search is hybrid: SQLite
            FTS5 plus LIKE fallback, with snippets and highlighted matches.
            It looks at names, paths, note/code samples, and PDF text layers
            extracted on reindex.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Search</strong> — type to replace the current results
              (no extra history entries). Submit, facet, or sort to push a
              real history step. Image-only scanned PDFs may have no
              searchable body until you OCR them elsewhere and reindex.
            </li>
            <li>
              <strong>Grid / List</strong> — grid is best for images and
              video; click a card for fullscreen lightbox (← / → / Esc). List
              is denser for documents and notes.
            </li>
            <li>
              <strong>Facets</strong> — kind, location, tag, collection
              (including smart shelves), path prefix (<code className="code-inline">under</code>),
              untagged, and missing. Kind-tinted cards keep format identity
              quiet.
            </li>
            <li>
              <strong>Item detail</strong> — streams media in-browser (image,
              video, audio, PDF, text). Documents use the{" "}
              <a href="#reading-room" className="link-accent">
                reading room
              </a>
              . Download keeps the original filename, including unicode.
            </li>
            <li>
              <strong>Related holdings</strong> — neighbors in the same
              folder, sharing tags, or co-shelved with this item. Missing
              files are excluded.
            </li>
            <li>
              <strong>Thumbs</strong> — images via sharp; video posters via
              ffmpeg when available. On a video item, the{" "}
              <strong>thumb editor</strong> lets you seek a frame, upload a
              still, or clear. Reindex does not overwrite a custom thumb.
            </li>
            <li>
              <strong>EXIF</strong> — appears when{" "}
              <code className="code-inline">exiftool</code> is installed;
              otherwise the panel explains how to add it.
            </li>
            <li>
              <strong>Weeding</strong> —{" "}
              <DocLink href="/catalog?missing=1">/catalog?missing=1</DocLink>{" "}
              lists holdings whose files are gone (unplugged Vault, moved
              folder). Bulk <strong>Remove from catalog</strong> deletes the
              card only — never the file on disk. Untagged rescue lives at{" "}
              <DocLink href="/catalog?untagged=1">?untagged=1</DocLink>.
            </li>
            <li>
              <strong>Bulk Select</strong> — tag, shelf, or weed many cards
              at once from the catalog toolstrip.
            </li>
            <li>
              <strong>Title</strong> — rename the display title on item
              detail without renaming the file. The path stays the source of
              truth on disk.
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
            <code className="code-inline">?room=1</code> on an item URL to
            force the room layout (also used from Hours and some Ask links).
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Text / code</strong> — continuous scroll with restore
              on reload.
            </li>
            <li>
              <strong>PDF</strong> — page-mode viewer (PDF.js) with a
              selectable text layer when the file has extractable text. If
              the viewer fails, an iframe fallback still works; download
              always remains available.
            </li>
            <li>
              <strong>Selection toolbar</strong> — select text, then{" "}
              <strong>Tag</strong>, <strong>Ask</strong> (opens{" "}
              <DocLink href="/ask">Ask</DocLink> with this holding in
              context), or <strong>Copy</strong>.
            </li>
            <li>
              Binary or unsupported types stay on the normal media preview;
              they are not forced into the room.
            </li>
          </ul>
        </section>

        {/* Deep Lens */}
        <section id="deep-lens" className="scroll-mt-28">
          <SectionTitle
            icon={<Aperture className="h-5 w-5" />}
            title="Deep Lens"
          />
          <p className="prose-body mt-3">
            <DocLink href="/lens">Deep Lens</DocLink> is an encyclopedia
            terminal for one holding — a compiled article, the source itself,
            structural neighbors, and your notes. Open{" "}
            <code className="code-inline">/lens/{"{id}"}</code> or the{" "}
            <strong>Deep Lens</strong> button on any catalog item. Keys{" "}
            <strong>1–4</strong> switch panes.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Article</strong> — <strong>Compile entry</strong> /
              <strong>Run analysis</strong> builds a cached encyclopedia-style
              overview from indexed text + metadata. Local is extractive; with
              an xAI key it can use Grok. <strong>Images</strong> send the
              picture; <strong>videos</strong> send a few still frames (not
              the whole clip). Cache refreshes when the file fingerprint
              changes.
            </li>
            <li>
              <strong>Source / Neighbors / Notes</strong> — media or reading
              room, structural neighbors, and quotes you save yourself
              (“Your insights”).
            </li>
            <li>
              <strong>Kind-object</strong> — a 3D metaphor for the holding’s
              kind (folio, reel, still…). Tap the object three times for a
              “Date due / never” stamp.
            </li>
            <li>
              <strong>Infobox</strong> — call number, size, branch, and jumps
              to Ask or the reading room.
            </li>
          </ul>
        </section>

        {/* Collections */}
        <section id="collections" className="scroll-mt-28">
          <SectionTitle icon={<Layers className="h-5 w-5" />} title="Collections & tags" />
          <p className="prose-body mt-3">
            Collections are named shelves. Create a <strong>manual</strong>{" "}
            shelf, open any catalog item, and use the Curation panel to add
            the item or attach tags. Filtering the catalog by collection or
            tag narrows results without changing files on disk.
          </p>
          <p className="prose-body mt-3">
            <strong>Smart shelves</strong> save a catalog query (kind, tags,
            path, etc.) and stay live as the index changes. Use them from
            Collections, catalog filters, and the knowledge graph. You cannot
            manually add or remove items on a smart shelf — edit the query
            instead. Shelf detail pages paginate when a query matches many
            holdings.
          </p>
          <p className="prose-body mt-3">
            <strong>Tag hygiene</strong> lives on Collections: merge
            near-duplicate labels, see unused tags, and keep facets readable.{" "}
            <code className="code-inline">vision-tagged</code> is hidden from
            facets and the graph so machine labels do not drown the shelves
            you meant.
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
            tags, and shelves. Prefer <strong>2D</strong> on phones or when
            you reduce motion; switch to <strong>3D</strong> when you want
            depth. The choice is remembered as{" "}
            <code className="code-inline">helix-graph-mode</code>. Caps keep
            large libraries responsive — the UI shows how many items are
            drawn versus the full catalog (200 / 400 / 600). Filter by
            collection (including smart shelves) or kind from the controls.
            Fullscreen still covers the left rail so the map can breathe.
          </p>
        </section>

        {/* Locations */}
        <section id="locations" className="scroll-mt-28">
          <SectionTitle icon={<FolderOpen className="h-5 w-5" />} title="Locations" />
          <p className="prose-body mt-3">
            Add absolute or project-relative folder paths. Enable/disable
            without deleting history; remove only when you no longer want
            that root in the catalog. After adding a location, always
            reindex. Ignore patterns (<code className="code-inline">node_modules</code>,{" "}
            <code className="code-inline">.git</code>, …) are configured in{" "}
            <code className="code-inline">library.config.json</code>.
          </p>
          <p className="prose-body mt-3">
            Removable drives work as locations: if the path is missing at
            reindex time, that branch is skipped and holdings can show as
            missing until the volume remounts at the <em>same</em> path. A
            typical extra branch is a Vault volume under{" "}
            <code className="code-inline">/media/…/helix</code> with the same
            folder layout as <code className="code-inline">archive/</code>.
          </p>
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
            arriving at your stacks. You can also ask the Librarian to
            propose an acquire; it still needs your approve.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>arXiv PDF</strong> — search by topic or paste an
              id/URL; saves under{" "}
              <code className="code-inline">archive/documents/</code>.
            </li>
            <li>
              <strong>Papers (OpenAlex)</strong> — wider open-access net by
              search or DOI. <strong>Fetch</strong> only enables when
              OpenAlex lists a direct PDF URL (accuracy gate). Optional free
              API key:{" "}
              <code className="code-inline">NON_OS_OPENALEX_API_KEY</code>.
            </li>
            <li>
              <strong>Web clip</strong> — paste a page URL; extracts readable
              Markdown into <code className="code-inline">archive/notes/</code>{" "}
              with source URL frontmatter.
            </li>
            <li>
              <strong>Grokipedia</strong> — search or fetch reference
              articles from grokipedia.com into{" "}
              <code className="code-inline">archive/notes/</code> (preferred
              over Wikipedia).
            </li>
            <li>
              <strong>Image URL</strong> — save a remote https image
              (png/jpeg/webp) into{" "}
              <code className="code-inline">archive/images/</code>.
            </li>
            <li>
              <strong>YouTube / podcast</strong> — needs host{" "}
              <code className="code-inline">yt-dlp</code> on{" "}
              <code className="code-inline">PATH</code> (and often{" "}
              <code className="code-inline">ffmpeg</code>). Video or
              audio-only. Prefer H.264+AAC; AV1 often fails in HTML5 video.
            </li>
            <li>
              <strong>Grok image</strong> — needs{" "}
              <code className="code-inline">XAI_API_KEY</code> (developer
              API, not SuperGrok alone) and cloud allowed (
              <code className="code-inline">NON_OS_USE_XAI</code> not{" "}
              <code className="code-inline">0</code>). Default model{" "}
              <code className="code-inline">grok-imagine-image-quality</code>{" "}
              (override with{" "}
              <code className="code-inline">NON_OS_IMAGE_MODEL</code>). Saves
              under <code className="code-inline">archive/images/</code>.
            </li>
          </ul>
          <p className="prose-body mt-3">
            Pick a destination location when you have more than Archive.
            Each successful acquire reindexes automatically. Personal use
            only; you are responsible for rights to downloaded media and
            clipped pages. No paywall bypass — OpenAlex only fetches listed
            OA PDFs. Outbound URLs are SSRF-gated (no localhost/LAN targets).
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
            over your catalog. The librarian can locate holdings, read
            extracted document text, summarize or evaluate content (e.g. a
            resume), and propose in-app tasks. Paths and file contents come
            only from the catalog tools — not invented.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">
            Grok vs local
          </h3>
          <ul className="mt-2 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Grok (preferred when configured)</strong> — needs an
              xAI <em>developer</em> API key in{" "}
              <code className="code-inline">.env.local</code> as{" "}
              <code className="code-inline">XAI_API_KEY</code> from{" "}
              <a
                href="https://console.x.ai"
                className="link-accent"
                target="_blank"
                rel="noreferrer"
              >
                console.x.ai
              </a>
              . Model defaults to{" "}
              <code className="code-inline">grok-4.3</code> (
              <code className="code-inline">NON_OS_MODEL</code>
              ).
            </li>
            <li>
              <strong>Local</strong> — no key; finds files and proposes tasks
              with template answers. Always available as fallback.
            </li>
            <li>
              A <strong>SuperGrok / X Premium chat subscription is not an
              API key</strong>. It does not power in-app Grok. (Partner apps
              like OpenClaw can use subscription OAuth separately.)
            </li>
          </ul>

          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">
            What to ask
          </h3>
          <ul className="mt-2 prose-body list-disc space-y-1.5 pl-5">
            <li>
              <em>Find:</em> “Where is my resume?” · “Images of Finn or
              Phoebe?”
            </li>
            <li>
              <em>Read / review:</em> “Is my resume good?” · “Summarize the
              Science PDF”
            </li>
            <li>
              <em>This holding:</em> from the reading room, select text →{" "}
              <strong>Ask</strong>, or open{" "}
              <code className="code-inline">/ask?item=…</code> — the
              librarian already has catalog context for that item.
            </li>
            <li>
              <em>Machine:</em> “How much disk free?” · “Is ffmpeg
              available?”
            </li>
            <li>
              <em>How-to:</em> “How do I reindex?” · “What are locations?”
            </li>
            <li>
              <em>Acquire:</em> “Clip this URL into notes” · “Fetch this
              arXiv pdf” — still approval-gated.
            </li>
          </ul>
          <p className="prose-body mt-2">
            Hits should include a clickable{" "}
            <code className="code-inline">/catalog/…</code> link. Search
            matches names, paths, and body text — including fragments inside
            compound filenames (e.g.{" "}
            <code className="code-inline">finnandphoebe</code>).
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
            <code className="code-inline">do it</code>. Cancel with{" "}
            <code className="code-inline">cancel</code> /{" "}
            <code className="code-inline">no</code>.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">
            Example task prompts
          </h3>
          <ul className="mt-2 prose-body list-disc space-y-1.5 pl-5">
            <li>
              <code className="code-inline">reindex now</code>
            </li>
            <li>
              <code className="code-inline">tag resume as career</code>
            </li>
            <li>
              <code className="code-inline">create collection STEM</code>
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
            <li>Restore a backup — use Services, not chat</li>
            <li>Apply tags/shelves/reindex/acquires without your approval</li>
          </ul>
          <p className="prose-body mt-3 text-[var(--muted)]">
            You can also curate without the agent: catalog{" "}
            <strong>Select</strong> for bulk shelf/tag, or item detail →
            Curation. Edit a collection’s name/description on its shelf page.
          </p>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-28">
          <SectionTitle
            icon={<HardDrive className="h-5 w-5" />}
            title="Services, backup & restore"
          />
          <p className="prose-body mt-3">
            Open <DocLink href="/services">Services</DocLink> for stack
            maintenance: reindex after you add files, export a snapshot, or
            return one over the live catalog. Same desk, two different jobs —
            backup makes a tarball; restore puts the <em>catalog</em> back.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Run reindex</strong> walks enabled locations and
              refreshes the catalog. Unchanged files are skipped. CLI:{" "}
              <code className="code-inline">npm run reindex</code>.
            </li>
            <li>
              <strong>Export / backup</strong> writes a{" "}
              <code className="code-inline">.tar.gz</code> under{" "}
              <code className="code-inline">data/exports/</code>. A{" "}
              <strong>catalog</strong> snapshot is the card catalog (config +
              SQLite + optional thumbs). A <strong>full</strong> snapshot
              also packs enabled location trees. API keys,{" "}
              <code className="code-inline">.env</code>, and SuperGrok
              credentials are never included. CLI:{" "}
              <code className="code-inline">npm run backup</code> or{" "}
              <code className="code-inline">npm run backup -- --full</code>.
            </li>
            <li>
              <strong>Restore from snapshot</strong> is how you put a backup
              back — no stopping Helix, no hand-copying files. Pick an
              archive already in{" "}
              <code className="code-inline">data/exports/</code>, inspect it
              (nothing is overwritten yet), type{" "}
              <code className="code-inline">RESTORE</code>, check the
              “replaces the live catalog” box, and confirm. Helix first
              writes an undo snapshot, then copies catalog rows into the live{" "}
              <code className="code-inline">library.db</code> (the file stays
              in place).
            </li>
            <li>
              Restore replaces the <strong>card catalog</strong> — titles,
              tags, shelves, Ask threads, Deep Lens notes, job history, and
              optional thumbs. It does <strong>not</strong> dump backup files
              onto <code className="code-inline">archive/</code> or Vault,
              and it does not restore secrets. Folder roots stay as they are
              unless you turn on “Apply location roots.”
            </li>
            <li>
              Every apply leaves a{" "}
              <code className="code-inline">-prerestore-</code> undo tarball
              (kept about 7 days). If the restore is wrong, restore that undo
              the same way. This browser’s recent-opens and reading positions
              may not match the restored catalog — they are not wiped.
            </li>
            <li>
              Restore is localhost only. On LAN preview it stays off unless
              you set <code className="code-inline">NON_OS_RESTORE_OK=1</code>{" "}
              on the host. The librarian will not restore from chat. CLI:{" "}
              <code className="code-inline">npm run restore</code> lists
              archives;{" "}
              <code className="code-inline">
                npm run restore -- --inspect &lt;name&gt;
              </code>{" "}
              looks;{" "}
              <code className="code-inline">
                npm run restore -- --name &lt;name&gt; --phrase RESTORE
              </code>{" "}
              applies. Manual stop-Helix steps remain in each archive’s{" "}
              <code className="code-inline">RESTORE.md</code>.
            </li>
            <li>
              <strong>Building</strong> shows host facts: CPU, memory, disk,
              bind address, and optional tools (ffprobe, ffmpeg, exiftool,
              yt-dlp).
            </li>
          </ul>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-28">
          <SectionTitle
            icon={<Shield className="h-5 w-5" />}
            title="Privacy & limits"
          />
          <p className="prose-body mt-3">
            Helix is built to stay on this machine. The product metaphor is a
            public library; the threat model is a personal archive.
          </p>
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              <strong>Bind</strong> — loopback by default. LAN preview
              requires <code className="code-inline">NON_OS_LAN=1</code>,{" "}
              <code className="code-inline">NON_OS_ACCESS_PASSWORD</code>,
              and <code className="code-inline">npm run dev:lan</code>.
            </li>
            <li>
              <strong>Scan roots</strong> — only folders you add. Never{" "}
              <code className="code-inline">$HOME</code> by default.
            </li>
            <li>
              <strong>Media serve</strong> —{" "}
              <code className="code-inline">/api/media/[id]</code> only
              serves indexed files under enabled location roots.
            </li>
            <li>
              <strong>Librarian</strong> — no shell, no invented paths, no
              unsolicited writes. Acquires and catalog mutations are
              approval-gated.
            </li>
            <li>
              <strong>Secrets</strong> — never commit{" "}
              <code className="code-inline">.env.local</code>,{" "}
              <code className="code-inline">library.config.json</code>,{" "}
              <code className="code-inline">data/</code>, or personal{" "}
              <code className="code-inline">archive/**</code> files.
              Backups never pack API keys.
            </li>
            <li>
              <strong>Not in v1</strong> — multi-user tenancy, public
              internet exposure without auth, replacing the OS file manager,
              embeddings / semantic search, overwriting live holdings on
              restore, agent-driven filesystem mutation.
            </li>
          </ul>
        </section>

        {/* Tips */}
        <section id="reference" className="scroll-mt-28">
          <SectionTitle
            icon={<Keyboard className="h-5 w-5" />}
            title="Keyboard & tips"
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm text-[var(--ink-soft)]">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                  <th className="py-2 pr-4 font-medium">Key</th>
                  <th className="py-2 font-medium">Where</th>
                  <th className="py-2 pl-4 font-medium">Does</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <KbdRow keys="/" where="Most pages" does="Focus catalog search" />
                <KbdRow keys="Esc" where="Search box" does="Blur the field" />
                <KbdRow
                  keys="["
                  where="Desktop"
                  does="Collapse / expand the left rail"
                />
                <KbdRow
                  keys="← → Esc"
                  where="Lightbox"
                  does="Previous / next / close"
                />
                <KbdRow
                  keys="1–4"
                  where="Deep Lens"
                  does="Switch Article / Source / Neighbors / Notes"
                />
              </tbody>
            </table>
          </div>

          <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <RefreshCw className="h-4 w-4 text-[var(--accent)]" aria-hidden />
            Troubleshooting
          </h3>
          <ul className="mt-3 prose-body list-disc space-y-2 pl-5">
            <li>
              New files not showing? Reindex. Confirm the folder is under an
              enabled location.
            </li>
            <li>
              Restored the wrong snapshot? Restore the automatic{" "}
              <code className="code-inline">-prerestore-</code> undo from
              Services the same way. Inspect first — apply only after you
              type <code className="code-inline">RESTORE</code>.
            </li>
            <li>
              Agent says it can’t evaluate a PDF? Reindex so text is
              extracted; scanned image-only PDFs may have no text layer.
            </li>
            <li>
              PDF reading room broken after a dependency change? Run{" "}
              <code className="code-inline">npm run sync:pdfjs</code> and
              hard refresh. Do not webpack-import{" "}
              <code className="code-inline">pdfjs-dist</code> — the app loads
              from <code className="code-inline">public/</code>.
            </li>
            <li>
              Grok errors about a model “not on your team”? Set{" "}
              <code className="code-inline">NON_OS_MODEL=grok-4.3</code> (or
              another id listed for your console key) and restart{" "}
              <code className="code-inline">npm run dev</code>.
            </li>
            <li>
              Huge trees: keep ignore globs strong; avoid scanning all of{" "}
              <code className="code-inline">node_modules</code>.
            </li>
            <li>
              Video posters need ffmpeg; duration needs ffprobe. EXIF needs{" "}
              <code className="code-inline">exiftool</code> on{" "}
              <code className="code-inline">PATH</code>. YouTube/podcast
              acquire needs <code className="code-inline">yt-dlp</code>.
            </li>
            <li>
              UI looks broken after hot reload?{" "}
              <code className="code-inline">rm -rf .next && npm run dev</code>
              . Don’t run <code className="code-inline">npm run build</code>{" "}
              while dev shares <code className="code-inline">.next</code>.
            </li>
            <li>
              Restore + watch: stop{" "}
              <code className="code-inline">npm run watch</code> if apply
              reports another process has the catalog open.
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

function KbdRow({
  keys,
  where,
  does,
}: {
  keys: string;
  where: string;
  does: string;
}) {
  return (
    <tr className="border-b border-[var(--line)] last:border-0">
      <td className="py-2 pr-4">
        <kbd className="kbd">{keys}</kbd>
      </td>
      <td className="py-2 text-[var(--muted)]">{where}</td>
      <td className="py-2 pl-4">{does}</td>
    </tr>
  );
}
