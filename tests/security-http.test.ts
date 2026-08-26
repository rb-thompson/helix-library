import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLoopbackIp,
  originMatchesHost,
  shouldRequireLanOrigin,
  shouldSkipLanAuth,
  timingSafeStringEqual,
  unsafeInlineContentType,
} from "@/lib/http/security";

describe("HTTP hardening helpers", () => {
  it("treats only connection IPs as loopback", () => {
    assert.equal(isLoopbackIp("127.0.0.1"), true);
    assert.equal(isLoopbackIp("::1"), true);
    assert.equal(isLoopbackIp("::ffff:127.0.0.1"), true);
    assert.equal(isLoopbackIp("192.168.1.20"), false);
    assert.equal(isLoopbackIp(null), false);
    assert.equal(isLoopbackIp(""), false);
  });

  it("does not skip LAN auth based on a spoofable host-like string", () => {
    assert.equal(shouldSkipLanAuth("127.0.0.1"), true);
    assert.equal(shouldSkipLanAuth(undefined), false);
    assert.equal(shouldSkipLanAuth("10.0.0.4"), false);
  });

  it("requires Origin on LAN mutations from non-loopback clients", () => {
    assert.equal(shouldRequireLanOrigin("POST", true, "10.0.0.4"), true);
    assert.equal(shouldRequireLanOrigin("GET", true, "10.0.0.4"), false);
    assert.equal(shouldRequireLanOrigin("POST", true, "127.0.0.1"), false);
    assert.equal(shouldRequireLanOrigin("DELETE", false, "10.0.0.4"), false);
  });

  it("matches Origin to Host, not to a guessed loopback", () => {
    assert.equal(
      originMatchesHost("http://192.168.1.20:4747", "192.168.1.20:4747"),
      true,
    );
    assert.equal(
      originMatchesHost("http://evil.example", "192.168.1.20:4747"),
      false,
    );
    assert.equal(originMatchesHost(null, "192.168.1.20:4747"), false);
    assert.equal(
      originMatchesHost("http://127.0.0.1:4747", "192.168.1.20:4747"),
      false,
    );
  });

  it("compares secrets in constant time", () => {
    assert.equal(timingSafeStringEqual("library", "library"), true);
    assert.equal(timingSafeStringEqual("secret", "secret!"), false);
    assert.equal(timingSafeStringEqual("", ""), true);
  });

  it("flags HTML and SVG as unsafe to inline", () => {
    assert.equal(unsafeInlineContentType("text/html"), true);
    assert.equal(unsafeInlineContentType("image/svg+xml; charset=utf-8"), true);
    assert.equal(unsafeInlineContentType("image/jpeg"), false);
    assert.equal(unsafeInlineContentType("application/pdf"), false);
  });
});
