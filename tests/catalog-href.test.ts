import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogHref,
  catalogHrefFromFormData,
} from "@/lib/catalog/href";
import { smartQueryToCatalogHref } from "@/lib/collections/manage";

describe("catalogHref", () => {
  it("omits empty and default mtime/desc", () => {
    assert.equal(catalogHref({}), "/catalog");
    assert.equal(catalogHref({ sort: "mtime", dir: "desc" }), "/catalog");
    assert.equal(catalogHref({ page: 1 }), "/catalog");
    assert.equal(catalogHref({ view: "grid" }), "/catalog");
  });

  it("omits default dir for the effective sort", () => {
    assert.equal(catalogHref({ sort: "name" }), "/catalog?sort=name");
    assert.equal(catalogHref({ sort: "name", dir: "asc" }), "/catalog?sort=name");
    assert.equal(
      catalogHref({ sort: "name", dir: "desc" }),
      "/catalog?sort=name&dir=desc",
    );
    assert.equal(catalogHref({ sort: "mtime", dir: "asc" }), "/catalog?dir=asc");
  });

  it("keeps filters, missing, and explicit view", () => {
    assert.equal(
      catalogHref({ q: "mars", kind: "image" }),
      "/catalog?q=mars&kind=image",
    );
    assert.equal(catalogHref({ missing: "1" }), "/catalog?missing=1");
    assert.equal(
      catalogHref({ view: "grid", viewExplicit: true }),
      "/catalog?view=grid",
    );
    assert.equal(catalogHref({ view: "list" }), "/catalog?view=list");
  });

  it("FormData default mtime/desc is /catalog", () => {
    const fd = new FormData();
    fd.set("sort", "mtime");
    fd.set("dir", "desc");
    assert.equal(catalogHrefFromFormData(fd), "/catalog");
  });

  it("FormData sort=name without dir omits default asc", () => {
    const fd = new FormData();
    fd.set("sort", "name");
    assert.equal(catalogHrefFromFormData(fd), "/catalog?sort=name");
  });
});

describe("smartQueryToCatalogHref", () => {
  it("wraps catalogHref so default mtime/desc stays /catalog", () => {
    assert.equal(
      smartQueryToCatalogHref({ sort: "mtime", sortDir: "desc" }),
      "/catalog",
    );
    assert.equal(
      smartQueryToCatalogHref({ q: "mars", sort: "name", sortDir: "asc" }),
      "/catalog?q=mars&sort=name",
    );
  });
});
