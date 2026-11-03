const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the real authorization helper and route SQL against SQLite (D1-compatible),
// replacing only Cloudflare's environment and R2 with local test bindings.
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE vault_members (email TEXT, display_name TEXT, is_admin INTEGER, is_active INTEGER);
    CREATE TABLE vault_access (member_email TEXT, vault_person TEXT);
    CREATE TABLE audio_tracks (id TEXT, vault_person TEXT, trashed_at TEXT, is_split_master INTEGER);
    CREATE TABLE story_photos (id TEXT, audio_track_id TEXT, storage_path TEXT, caption TEXT,
      sort_order INTEGER, created_at TEXT, updated_at TEXT);
    INSERT INTO vault_members VALUES ('family@example.com', 'Family', 0, 1),
      ('inactive@example.com', 'Inactive', 0, 0), ('admin@example.com', 'Admin', 1, 1);
    INSERT INTO vault_access VALUES ('family@example.com', 'Dad');
    INSERT INTO audio_tracks VALUES ('dad', 'Dad', NULL, 0), ('mom', 'Mom', NULL, 0),
      ('trash', 'Dad', '2026-01-01', 0), ('split', 'Dad', NULL, 1);
    INSERT INTO story_photos VALUES
      ('later', 'dad', 'r2/later', 'Later caption', 2, '2026-01-01', ''),
      ('first', 'dad', 'r2/first', 'First caption', 1, '2026-01-02', ''),
      ('mom-photo', 'mom', 'r2/mom', 'Private', 0, '', ''),
      ('trash-photo', 'trash', 'r2/trash', '', 0, '', ''),
      ('split-photo', 'split', 'r2/split', '', 0, '', ''),
      ('orphan', 'missing', 'r2/orphan', '', 0, '', '');
  `);
  const reads = [];
  const db = { prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    };
  } };
  const env = { DB: db, VAULT_FILES: { async get(key) {
    reads.push(key);
    return { body: "photo bytes", writeHttpMetadata(headers) { headers.set("Content-Type", "image/jpeg"); } };
  } } };
  function load(file, imports) {
    const exports = {};
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports, require: () => imports, Response, Headers, URL, console });
    return exports;
  }
  const auth = load("lib/cloudflare.ts", { getCloudflareContext: async () => ({ env }) });
  const list = load("app/api/cloudflare/photos/route.ts", auth);
  const image = load("app/api/cloudflare/photos/[id]/route.ts", auth);
  const request = (path, email, method = "GET") => new Request(`https://vault.test/api/cloudflare/photos${path}`, {
    method, headers: email ? { "cf-access-authenticated-user-email": email } : {},
  });
  return { sqlite, reads, list, image, request };
}

test("photo reads enforce active membership and owning Vault grants; mutations stay admin-only", async () => {
  const f = fixture();
  try {
    for (const [email, status] of [[undefined, 401], ["inactive@example.com", 403],
      ["unknown@example.com", 403], ["family@example.com", 200], ["admin@example.com", 200]]) {
      assert.equal((await f.list.GET(f.request("?recordingId=dad", email))).status, status);
      assert.equal((await f.image.GET(f.request("/first", email), { params: Promise.resolve({ id: "first" }) })).status, status);
    }
    for (const [track, photo, status] of [["mom", "mom-photo", 403], ["trash", "trash-photo", 404],
      ["split", "split-photo", 404], ["missing", "orphan", 404]]) {
      f.reads.length = 0;
      assert.equal((await f.list.GET(f.request(`?recordingId=${track}`, "family@example.com"))).status, status);
      assert.equal((await f.image.GET(f.request(`/${photo}`, "family@example.com"), { params: Promise.resolve({ id: photo }) })).status, status);
      assert.deepEqual(f.reads, [], "Denied reads must not touch R2");
    }
    const response = await f.list.GET(f.request("?recordingId=dad", "family@example.com"));
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const data = await response.json();
    assert.deepEqual(data.photos.map(p => [p.id, p.caption]), [["first", "First caption"], ["later", "Later caption"]]);
    const image = await f.image.GET(f.request("/first", "family@example.com"), { params: Promise.resolve({ id: "first" }) });
    assert.equal(image.headers.get("Cache-Control"), "private, no-store");
    assert.equal(f.reads.at(-1), "r2/first");
    for (const method of ["POST", "PATCH", "DELETE"]) {
      assert.equal((await f.list[method](f.request("", "family@example.com", method))).status, 403);
    }
  } finally { f.sqlite.close(); }
});
