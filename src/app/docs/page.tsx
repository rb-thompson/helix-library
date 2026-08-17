import Link from "next/link";
import type { Metadata } from "next";
import {
  BookOpen,
  Keyboard,
  Library,
  Shield,
} from "lucide-react";
import { HelixGlyph } from "@/components/icons/HelixGlyph";
import { NightMoth } from "@/components/NightMoth";
import { LibraryMap } from "@/components/docs/LibraryMap";
import { Workflow } from "@/components/docs/Workflow";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Helix Library works — find what you put here, read it, and keep the catalog honest.",
};

const toc = [
  { id: "welcome", label: "Welcome" },
  { id: "map", label: "The floor plan" },
  { id: "first-hour", label: "First hour" },
  { id: "find", label: "Find & read" },
  { id: "bring-in", label: "Bring something in" },
  { id: "ask", label: "Ask the clerk" },
  { id: "arcade", label: "After hours" },
  { id: "keep", label: "Keep the catalog" },
  { id: "privacy", label: "What never leaves" },
  { id: "keys", label: "Keys" },
];

export default function DocsPage() {
  return (
    <div className="grid gap-6 sm:gap-10 lg:grid-cols-[180px_1fr] xl:grid-cols-[200px_1fr]">
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

      <article className="min-w-0 max-w-3xl space-y-12 sm:space-y-14 2xl:max-w-4xl">
        <header id="welcome" className="docs-hero scroll-mt-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/moth-reading.jpg"
            alt=""
            className="docs-hero__art"
            aria-hidden
          />
          <div className="docs-hero__scrim" aria-hidden />
          <div className="relative">
            <p className="eyebrow">The handbook</p>
            <h1 className="page-title mt-1 text-2xl sm:text-3xl">
              Find what you put here.
            </h1>
            <p className="page-sub mt-3 max-w-xl text-sm sm:text-base">
              Helix is a small public library mapped onto your own files. One
              machine, folders you choose, a catalog that remembers, and a
              night moth on the cart.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/catalog" className="btn btn-helix">
                <HelixGlyph />
                Open catalog
              </Link>
              <Link href="/ask" className="btn btn-secondary">
                Ask the clerk
              </Link>
            </div>
          </div>
        </header>

        <section className="docs-moth-intro">
          <NightMoth pose="portrait" className="docs-moth-intro__face" />
          <div>
            <p className="eyebrow">Circulation</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">
              The night moth
            </h2>
            <p className="prose-body mt-2">
              Not the logo — the H+helix mark still is. The moth is the night
              clerk: drawn to the lamp, leaving one holding on the cart at
              Hours, startled when a reindex sends cards flying. You will see
              him on empty desks and in this handbook. He does not move files.
            </p>
          </div>
        </section>

        <section id="map" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="The floor plan" />
          <p className="prose-body mt-3">
            Each desk is a room in the same building. Nothing here moves a
            file on disk — it only changes the card catalog.
          </p>
          <LibraryMap />
        </section>

        <section id="first-hour" className="scroll-mt-28">
          <SectionTitle icon={<BookOpen className="h-5 w-5" />} title="First hour" />
          <p className="prose-body mt-3">
            Four steps. After that the building is yours.
          </p>
          <Workflow
            label="Getting started"
            steps={[
              {
                title: "Put files in a folder you own",
                body: "The archive under this project is the default branch. Documents, images, notes, video, audio, code. Helix never scans your home directory unless you add it on purpose.",
              },
              {
                title: "Index the catalog",
                body: "Services or Locations → Run reindex. Unchanged files are skipped. New ones get a card, a thumb when the host can make one, and searchable text when there is any.",
                href: "/services",
              },
              {
                title: "Browse",
                body: "Search from home or open Catalog. Grid for pictures, list for papers. Open a document and the reading room remembers the page.",
                href: "/catalog",
              },
              {
                title: "Leave a mark (optional)",
                body: "A tag, a shelf, a question for the clerk. Writes wait for a click. Snapshots live on Services if you want a way back.",
                href: "/collections",
              },
            ]}
          />
        </section>

        <section id="find" className="scroll-mt-28">
          <SectionTitle icon={<BookOpen className="h-5 w-5" />} title="Find & read" />
          <p className="prose-body mt-3">
            Search looks at names, paths, notes, and the text inside PDFs.
            Facets narrow by format, branch, shelf, or tag. Missing files
            (an unplugged drive) stay as cards until you weed them — weeding
            removes the card, never the file.
          </p>
          <Workflow
            label="A holding’s day"
            steps={[
              {
                title: "It sits in a location",
                body: "A branch you enabled. Extra volumes (a Vault) work the same way, at the same path, when they are mounted.",
                href: "/locations",
              },
              {
                title: "Reindex writes the card",
                body: "Kind, size, title, thumb, a sample of the text. Custom titles and thumbs survive the next walk.",
              },
              {
                title: "You find it",
                body: "Type, filter, or walk the graph. j / k moves the browse ring in Catalog; Enter opens.",
                href: "/catalog",
              },
              {
                title: "You sit with it",
                body: "Reading room for text and PDF. Select a passage to tag it, copy it, or take it to Ask. Deep Lens compiles one holding into a dossier you can discard.",
                href: "/lens",
              },
            ]}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Note title="Smart shelves">
              A saved search that stays live. Edit the query — you cannot drop
              a single item on or off by hand.
            </Note>
            <Note title="Related holdings">
              Same folder, shared tags, or co-shelved. Neighbors, not
              recommendations.
            </Note>
          </div>
        </section>

        <section id="bring-in" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="Bring something in" />
          <p className="prose-body mt-3">
            Acquire is interlibrary loan. You pick the source; Helix writes
            into the archive and reindexes. You are responsible for the
            rights. Nothing is fetched from your own machine or the LAN.
          </p>
          <Workflow
            label="Acquire"
            steps={[
              {
                title: "Choose a desk",
                body: "A paper (arXiv or OpenAlex), a page to clip, a Grokipedia article, a YouTube or podcast tape, an image URL, or a Grok picture.",
                href: "/acquire",
              },
              {
                title: "Helix checks the door",
                body: "Outbound addresses are gated. OpenAlex only fetches a PDF when a real open URL exists. No paywall bypass.",
              },
              {
                title: "It lands in the stacks",
                body: "The file is yours. A job runs, a card appears, tags may come along for the ride.",
              },
            ]}
          />
        </section>

        <section id="arcade" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="After hours" />
          <p className="prose-body mt-3">
            Arcade is not a desk that moves files. After Circulation the
            grounds keep a second catalog of lamps.{" "}
            <Link href="/arcade" className="link-accent">
              Arcade
            </Link>{" "}
            is the cabinet;{" "}
            <Link href="/arcade/night-moth" className="link-accent">
              Night Moth
            </Link>{" "}
            is the game. Scores stay in this machine&apos;s catalog. Nothing
            leaves the building.
          </p>
          <Workflow
            label="A night"
            steps={[
              {
                title: "Take the wing",
                body: "Mouse looks. W flies where the visor points. A/D slip, S brakes, Shift dashes. Optional beginner night names the first three lamps.",
                href: "/arcade/night-moth",
              },
              {
                title: "Judge the light",
                body: "Amber and steady is Circulation. Green that flickers is a cage. Violet that hunts you is not furniture. Lamps wander — follow the pip, not last night's map.",
              },
              {
                title: "Drink or dust",
                body: "E drinks a near lamp. Click fires the equipped art. Wheel or Tab cycles arts. Number keys select. Statuses sit as banners on the visor.",
              },
              {
                title: "Leave a score",
                body: "Dying or leaving with a score stamps the cabinet. Initials default to MTH. The home page and Arcade desk show the same high-score card. H is the jacket.",
              },
            ]}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Note title="The grounds">
              Eight regions, two canals with fish, fireflies, and three noir
              towers. Caches in the mazes are nectar and a little wing.
            </Note>
            <Note title="The clerk is not the game">
              The night moth on Hours and this handbook is Circulation staff.
              Night Moth the game is a separate flight on the same grounds.
            </Note>
          </div>
        </section>

        <section id="ask" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="Ask the clerk" />
          <p className="prose-body mt-3">
            The librarian reads the catalog, not your disk. Paths come from
            tools. If a developer API key is present, Grok reasons; otherwise
            a local clerk still finds files. A SuperGrok chat subscription is
            not that key.
          </p>
          <Workflow
            label="Ask, then approve"
            steps={[
              {
                title: "You ask",
                body: "“Where is my resume?” · “Summarize the Science PDF” · “Clip this URL.” From the reading room, select text → Ask and the holding is already in context.",
                href: "/ask",
              },
              {
                title: "The clerk proposes",
                body: "A reindex, a tag, a shelf, an acquire. The proposal sits on the thread. Nothing has happened yet.",
              },
              {
                title: "You approve",
                body: "The button, or a plain “yes.” Cancel is “no.” The clerk will not restore a backup, run a shell, or delete files on disk.",
              },
            ]}
          />
        </section>

        <section id="keep" className="scroll-mt-28">
          <SectionTitle icon={<Library className="h-5 w-5" />} title="Keep the catalog" />
          <p className="prose-body mt-3">
            Services is the workroom. Backup makes a snapshot. Restore puts
            the <em>cards</em> back — not the files on disk.
          </p>
          <Workflow
            label="Snapshot and return"
            steps={[
              {
                title: "Export",
                body: "A catalog snapshot is the card file (and optional thumbs). A full snapshot also packs the trees, for your own archives.",
                href: "/services",
              },
              {
                title: "Inspect",
                body: "Pick a tarball already in the exports drawer. Nothing is overwritten yet.",
              },
              {
                title: "Type RESTORE",
                body: "Helix writes an undo snapshot, then copies catalog rows into the live database. Holdings on disk stay where they are.",
              },
              {
                title: "Undo if you must",
                body: "The prerestore tarball is the way back. The clerk will not do this from chat.",
              },
            ]}
          />
        </section>

        <section id="privacy" className="scroll-mt-28">
          <SectionTitle icon={<Shield className="h-5 w-5" />} title="What never leaves" />
          <ul className="mt-4 prose-body list-disc space-y-2 pl-5">
            <li>
              The app binds to this machine. A home-network preview needs a
              password, and it is still not the public internet.
            </li>
            <li>Only folders you add are scanned.</li>
            <li>
              Media is served only for indexed files under those folders.
              HTML and SVG download instead of rendering in the page.
            </li>
            <li>
              The clerk has no shell. Mutations wait for approve. Restore
              waits for the typed word.
            </li>
            <li>
              Snapshots never pack API keys. Secrets stay in your environment,
              not in the tarball.
            </li>
          </ul>
        </section>

        <section id="keys" className="scroll-mt-28">
          <SectionTitle icon={<Keyboard className="h-5 w-5" />} title="Keys" />
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
                <KbdRow keys="/" where="Most pages" does="Focus search" />
                <KbdRow keys="Esc" where="Search box" does="Blur the field" />
                <KbdRow
                  keys="["
                  where="Desktop"
                  does="Collapse the left rail"
                />
                <KbdRow
                  keys="j k"
                  where="Catalog"
                  does="Move the browse ring (Enter opens)"
                />
                <KbdRow
                  keys="x"
                  where="Catalog Select"
                  does="Toggle the browsed holding"
                />
                <KbdRow
                  keys="← → Esc"
                  where="Lightbox"
                  does="Previous / next / close"
                />
                <KbdRow
                  keys="1–4"
                  where="Deep Lens"
                  does="Article / Source / Neighbors / Notes"
                />
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-xs text-[var(--muted-faint)]">
            Internal{" "}
            <Link href="/design" className="link-accent">
              design lab
            </Link>{" "}
            — tokens and stills, not a public desk.
          </p>
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

function Note({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface p-4">
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{children}</p>
    </div>
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
