# `signalk-wfs-provider` — Implementation Plan

A Signal K server plugin that consumes OGC WFS (Web Feature Service) endpoints and exposes the returned vector features through the Signal K v2 Resources API as GeoJSON `FeatureCollection`s — making them automatically discoverable as map layers in Freeboard-SK and any other Signal K-aware client.

Initial reference target: Finnish Traficom open-data WFS at `https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs`. Design goal is provider-agnostic: any standards-compliant WFS 2.0.0 endpoint should work.

---

## 1. Goals & non-goals

### Goals

- Consume **WFS 2.0.0** endpoints that emit `application/json` (GeoJSON).
- Auto-discover layers via `GetCapabilities`; let the user select a subset to expose.
- Publish each selected layer as a Signal K resource under a custom resource type, served as GeoJSON `FeatureCollection`.
- Refresh on schedule **and** opportunistically based on vessel position (bbox-follows-vessel).
- Persistent on-disk cache so previously-fetched features remain available when offline.
- Configurable via the standard Signal K plugin config UI (JSON Schema).
- Read-only. No WFS-T (transactions).
- Strict TypeScript, Node 22+, no native deps.

### Non-goals (initial release)

- Rendering / styling — that lives in Freeboard-SK and other clients.
- WFS 1.0.0 / 1.1.0 fallback — defer until a real-world endpoint requires it.
- GML parsing — require GeoJSON output. Endpoints not supporting GeoJSON are out of scope.
- WFS-T (insert/update/delete).
- Vector-tile generation. Out of scope here; users wanting MVT can pipe the cached GeoJSON through `tippecanoe` separately.

---

## 2. Architecture

```
                   ┌────────────────────────────────────┐
                   │          Signal K Server           │
                   │                                    │
  WFS endpoint ◀───┼── WfsClient ── BboxManager ── Cache ──▶ ResourceProvider
  (online)         │       ▲             ▲           │              │
                   │       │             │           ▼              ▼
                   │   refresh         vessel    /var/lib/   /resources/wfs-features/{layer}
                   │   timer        position     signalk/    GeoJSON FeatureCollection
                   │                  stream       wfs/
                   └────────────────────────────────────┘
                                                                    ▲
                                                                    │
                                                              Freeboard-SK
                                                              auto-displays
                                                              as map layer
```

Core components (each is a separately-testable unit):

| Component | Responsibility |
|---|---|
| `WfsClient` | Speak WFS: parse capabilities, build `GetFeature` URLs, fetch GeoJSON, handle ETag/Last-Modified. Stateless. |
| `BboxManager` | Decide *what* bbox to fetch given vessel position, view, and configured static bbox. Throttle. |
| `Cache` | Hold current `FeatureCollection` per layer in memory; mirror to disk for offline restart. |
| `ResourceProvider` | Implement Signal K v2 `ResourceProvider` interface; serve cached features. |
| `Plugin` | Orchestrator. Owns lifecycle, config, scheduling, position subscription. |

---

## 3. Tech stack

- **Language**: TypeScript 5.x, strict mode.
- **Runtime**: Node.js ≥ 22.5 (for native `node:sqlite`, matching `signalk-charts-provider-simple` baseline).
- **Test runner**: `vitest` (fast, ESM-native, mirrors your Edge Link toolchain).
- **HTTP**: `undici` (built-in fetch is fine; `undici` directly gives better keep-alive control).
- **XML parsing**: `fast-xml-parser` for `GetCapabilities` only.
- **Storage**: `node:sqlite` for the on-disk cache (single file, no native build).
- **Schema validation**: `ajv` for runtime validation of incoming config + WFS responses.
- **Lint/format**: `eslint` + `prettier`, matching Signal K plugin conventions.

---

## 4. Repo structure

```
signalk-wfs-provider/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + test on PR
│       ├── release.yml         # tag → npm publish
│       └── trivy.yml           # security scan
├── src/
│   ├── index.ts                # plugin entry, registers with Signal K
│   ├── plugin.ts               # Plugin class, lifecycle
│   ├── wfs/
│   │   ├── client.ts           # WfsClient
│   │   ├── capabilities.ts     # XML parser
│   │   └── types.ts            # WFS response types
│   ├── resources/
│   │   ├── provider.ts         # ResourceProvider impl
│   │   └── types.ts            # Resource shape
│   ├── bbox/
│   │   ├── manager.ts          # BboxManager
│   │   └── geometry.ts         # bbox math (intersect, expand, distance)
│   ├── cache/
│   │   ├── memory.ts           # In-memory layer
│   │   ├── sqlite.ts           # On-disk backing
│   │   └── index.ts            # Cache facade
│   └── schema/
│       ├── config.ts           # JSON Schema for plugin config
│       └── geojson.ts          # GeoJSON validation
├── test/
│   ├── unit/                   # mirror src/
│   ├── integration/            # plugin against mocked WFS server
│   └── fixtures/               # captured Traficom responses
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
└── README.md
```

---

## 5. Configuration schema

```jsonc
{
  "providers": [
    {
      "id": "traficom",
      "label": "Traficom Open Data",
      "url": "https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs",
      "version": "2.0.0",
      "srs": "EPSG:4326",
      "layers": [
        {
          "typeName": "rajoitusalue_a",
          "label": "Restricted areas",
          "enabled": true,
          "maxFeatures": 5000
        },
        {
          "typeName": "syvyyskayra_v",
          "label": "Depth contours",
          "enabled": true,
          "maxFeatures": 20000
        }
      ],
      "bboxStrategy": "follow-vessel",   // "static" | "follow-vessel"
      "staticBbox": null,                // [minLon, minLat, maxLon, maxLat]
      "vesselBboxRadiusNm": 30,
      "refreshIntervalSec": 3600,
      "minMoveDistanceNm": 5,
      "headers": {                        // optional, e.g. User-Agent
        "User-Agent": "signalk-wfs-provider/1.0"
      }
    }
  ],
  "cacheDir": "~/.signalk/wfs-cache",
  "resourceType": "wfs-features"
}
```

Validated with `ajv` at plugin start. Hot-reloadable on Save (no full SK restart).

---

## 6. Signal K Resources API contract

Plugin registers one resource provider via `app.registerResourceProvider({ type: 'wfs-features', methods })`.

Resource paths (Signal K v2):

```
GET  /signalk/v2/api/resources/wfs-features
       → { "<providerId>:<typeName>": { ...metadata } }

GET  /signalk/v2/api/resources/wfs-features/<providerId>:<typeName>
       → GeoJSON FeatureCollection (the actual layer data)
```

Resource value shape:

```typescript
interface WfsResource {
  type: 'FeatureCollection'
  features: GeoJSON.Feature[]
  // Signal K resource metadata
  $source: string           // "wfs-provider:traficom"
  timestamp: string         // ISO 8601, time of last successful fetch
  bbox: [number, number, number, number]
  attribution?: string
}
```

Methods implemented:

| Method | Behavior |
|---|---|
| `listResources(query)` | Return all available `(providerId, typeName)` pairs with metadata |
| `getResource(id, query)` | Return cached `FeatureCollection` for that layer |
| `setResource(id, value)` | Reject with 405 Method Not Allowed (read-only) |
| `deleteResource(id)` | Reject with 405 Method Not Allowed |

Freeboard-SK detects resources under `/resources/<type>` and offers them as toggleable layers automatically. No client-side changes needed.

---

## 7. WFS client design

```typescript
class WfsClient {
  constructor(private readonly cfg: ProviderConfig) {}

  async getCapabilities(): Promise<Capabilities>
  async getFeature(opts: GetFeatureOptions): Promise<GeoJSON.FeatureCollection>
}

interface GetFeatureOptions {
  typeName: string
  bbox?: [number, number, number, number]
  bboxSrs?: string
  outputSrs?: string
  count?: number
  startIndex?: number
  filter?: string  // OGC Filter / CQL — pass-through, not parsed
  ifModifiedSince?: string  // for conditional GET
}
```

**`GetCapabilities` parsing**

Parse only what's needed:
- `FeatureTypeList/FeatureType` → `{ name, title, defaultCRS, otherCRS[], wgs84BoundingBox }`
- `OperationsMetadata/Operation[name=GetFeature]/Parameter[name=outputFormat]/AllowedValues` → verify GeoJSON support before enabling layer

Capabilities cached for `cacheCapabilitiesSec` (default 24 h); refetched on plugin restart.

**`GetFeature` URL construction**

```
{url}?service=WFS&version=2.0.0&request=GetFeature
  &typeNames={typeName}
  &outputFormat=application/json
  &srsName={outputSrs}
  &bbox={minLon},{minLat},{maxLon},{maxLat},{bboxSrs}
  &count={maxFeatures}
```

Note: in some servers the bbox CRS in the `bbox` parameter must match `srsName`. Detect with capabilities and route accordingly.

**Conditional fetching**

Honor `Last-Modified` and `ETag`. Send `If-None-Match` / `If-Modified-Since` on subsequent fetches. If 304, retain previous cached value, just bump the resource timestamp.

**Error handling**

WFS error responses are XML even when JSON is requested. If response `Content-Type` isn't JSON, parse as XML, extract `ows:ExceptionReport/Exception/ExceptionText`, throw `WfsServerError` with code+text.

---

## 8. Bbox-follows-vessel logic

`BboxManager` listens to `navigation.position` updates from Signal K's stream and decides when to trigger a refetch.

Algorithm:

1. On position update, compute distance from `lastFetchPosition`.
2. If `distance < minMoveDistanceNm`, ignore.
3. Otherwise compute new bbox: square centered on position, half-side = `vesselBboxRadiusNm`.
4. If new bbox is fully contained in previous bbox + 20% padding, ignore (same data still valid).
5. Otherwise schedule fetch. Debounce 30 s to coalesce bursts.

Position handling:

```typescript
app.streambundle
  .getSelfBus('navigation.position')
  .debounceImmediate(30_000)
  .onValue(pos => bboxManager.onPosition(pos.value))
```

Add a "stale on connection loss" grace period: if WFS request fails, keep serving cached data and surface a notification on `notifications.system.wfsProvider.{providerId}` so Freeboard-SK can warn the operator.

---

## 9. Caching strategy

**Layer state**:

```typescript
interface CachedLayer {
  providerId: string
  typeName: string
  featureCollection: GeoJSON.FeatureCollection
  fetchedAt: Date
  bbox: [number, number, number, number]
  etag?: string
  lastModified?: string
}
```

**Two-tier**:

- **In-memory map** for hot reads (every Freeboard-SK chart pan triggers a `GET`).
- **SQLite mirror** at `<cacheDir>/wfs-cache.db` — single table `layers (provider_id, type_name, fetched_at, bbox_json, etag, last_modified, geojson_blob)`. Hydrated on plugin start, written on every successful fetch.

**Eviction**: layers not refreshed in `7 * refreshIntervalSec` are kept on disk indefinitely (offline value > freshness here) but flagged stale in resource metadata.

---

## 10. Phased implementation (TDD, eight phases)

Each phase ends with a green test suite, a tagged commit, and a working slice. Mirrors your Edge Link v2.0 cadence.

### Phase 1 — Scaffolding (½ day)
**Deliverables**: repo init, TypeScript config, vitest, eslint/prettier, GitHub Actions CI skeleton, MIT license, README stub, empty plugin entry that registers with Signal K and logs "started".
**Tests**: `it('plugin registers without error')`. Spin up `@signalk/server-api` test harness.
**Done when**: `npm test` green; plugin installable from local tarball into a dev Signal K instance.

### Phase 2 — WFS client: capabilities (1 day)
**Deliverables**: `WfsClient.getCapabilities()` parsing WFS 2.0.0 XML into typed `Capabilities`. Reject if not 2.0.0.
**Tests**:
- Parse Traficom-captured fixture in `test/fixtures/traficom-capabilities.xml`.
- Error path: missing `OperationsMetadata`.
- Error path: server returns HTTP 500.
**Done when**: returns layer list with names, titles, CRS, supported output formats; rejects endpoints without GeoJSON.

### Phase 3 — WFS client: GetFeature (1 day)
**Deliverables**: `WfsClient.getFeature()` building correct URLs, handling ETag/Last-Modified, parsing GeoJSON, throwing `WfsServerError` on `ExceptionReport`.
**Tests**:
- URL construction snapshot tests for several option combinations.
- 200 with GeoJSON → returns `FeatureCollection`.
- 304 Not Modified → returns sentinel value (caller reuses cache).
- 200 with `application/xml` exception body → throws typed error.
- bbox CRS axis order regression (EPSG:4326 lat/lon vs lon/lat — pick lon/lat, document).
**Done when**: live integration test against `julkinen.traficom.fi` (gated by env var, runs nightly only) returns ≥ 1 feature.

### Phase 4 — Cache (½ day)
**Deliverables**: in-memory `Cache`, SQLite-backed persistence, hydration on startup, write-through.
**Tests**:
- Round-trip: write `FeatureCollection` → read back identical.
- Hydration: pre-populate DB → `Cache.load()` → all layers present.
- Concurrent writes don't corrupt (use `BEGIN IMMEDIATE`).
**Done when**: cache survives plugin restart with no network.

### Phase 5 — Resource provider (1 day)
**Deliverables**: `ResourceProvider` implementing Signal K v2 `ResourceProviderRegistry` interface, wiring cache reads to API responses, 405 on writes.
**Tests**:
- `listResources()` returns expected ids.
- `getResource()` returns cached `FeatureCollection` with correct metadata.
- `setResource()` / `deleteResource()` reject.
- HTTP integration: `curl localhost:3000/signalk/v2/api/resources/wfs-features/traficom:rajoitusalue_a` → 200 + GeoJSON.
**Done when**: Freeboard-SK auto-detects the resource type and offers it as a toggleable layer (manual UI verification).

### Phase 6 — Static bbox + scheduled refresh (½ day)
**Deliverables**: plugin orchestration loop. On start, load capabilities, kick off initial fetch for each enabled layer using `staticBbox`. Set up `setInterval` for `refreshIntervalSec`.
**Tests**:
- On start, `WfsClient.getFeature` called once per enabled layer.
- After `refreshIntervalSec`, called again with `If-None-Match`.
- 304 doesn't replace cached value but updates `fetchedAt`.
**Done when**: configured static bbox produces visible features in Freeboard-SK and they refresh on schedule.

### Phase 7 — Position-driven bbox + debounce (1 day)
**Deliverables**: `BboxManager` subscribed to `navigation.position`. Implements distance threshold + containment check + 30 s debounce.
**Tests**:
- Move 1 nm → no refetch.
- Move 10 nm → refetch triggered.
- Move 10 nm twice within 30 s → exactly one refetch.
- New bbox contained in cached bbox → no refetch.
- Refetch when GPS lost then restored at distant position.
**Done when**: take Arabella out of the harbor with the plugin running, return to dock — features around the route were fetched, features outside were not.

### Phase 8 — Hardening + release (½ day)
**Deliverables**:
- Notifications on fetch failure (`notifications.system.wfsProvider.{id}`).
- Stale flag in resource metadata after 7×refresh interval missed.
- README with screenshots, Traficom example config, Finnish/English text.
- `npm pack`, smoke install on a fresh Signal K instance, then `npm publish`.
- Submit to Signal K appstore via PR to `SignalK/appstore-server`.
- GitHub release with changelog.

---

## 11. Test strategy

**Pyramid**:
- **Unit tests**: each component in isolation. Mock external deps. Target ~150 tests, full coverage of `wfs/`, `bbox/`, `cache/`.
- **Integration tests**: plugin in-process, WFS mocked with `msw`. ~30 tests covering full lifecycle (start → fetch → serve → restart → serve from cache → stop).
- **Live e2e**: 1 nightly GitHub Actions job hitting Traficom. Gated by `WFS_LIVE=true`. Fails the build if Traficom returns garbage; useful early-warning if their API changes.

**Fixtures**:
- `test/fixtures/traficom-capabilities.xml` (real captured response, ~50 KB)
- `test/fixtures/traficom-rajoitusalue_a.geojson` (real feature collection, trimmed to ~20 features)
- `test/fixtures/exception-report.xml` (real WFS error)
- `test/fixtures/304-no-body.txt`

**Coverage target**: 90 % lines, 85 % branches. Enforced in CI via `vitest --coverage --threshold-100`.

---

## 12. CI / CD

`.github/workflows/ci.yml`:

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ['22.5', '22.x', '24.x']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v4
```

`.github/workflows/release.yml`: triggered on tag `v*`, runs full test suite, publishes to npm with `--provenance`.

`.github/workflows/trivy.yml`: weekly + on PR, fails on HIGH/CRITICAL vulnerabilities. Mirrors your existing `signalk-release-tests` pattern.

`.github/workflows/wfs-live.yml`: nightly cron, hits real Traficom WFS, opens an issue on failure.

---

## 13. Release plan

1. **v0.1.0** — phases 1–5. Static bbox only. Tag, internal use only on Arabella.
2. **v0.2.0** — phase 6–7. Position-driven bbox. First public alpha. Tag and announce on Signal K Slack.
3. **v0.9.0** — phase 8. Documentation, screenshots, Finnish translation of README, signalk appstore submission.
4. **v1.0.0** — appstore approval, semver lock-in. Document the v2 Resources API contract in README so other client devs (e.g. Tuktuk) can opt in.

---

## 14. Open questions / risks

- **Traficom CRS axis order**: WFS 2.0.0 + EPSG:4326 is technically lat/lon, but most servers (and OpenLayers) treat it as lon/lat. Verify experimentally and document the chosen convention.
- **Rate limits**: no documented limit on `julkinen.traficom.fi`. Be a good citizen — `User-Agent` identifying the plugin, exponential backoff on 429/5xx, default refresh interval ≥ 1 hour.
- **Large layers**: some Traficom layers (e.g. all rocks for the entire country) can return tens of MB of GeoJSON. Mitigation: enforce `maxFeatures` ceiling, surface warnings in plugin config UI when an enabled layer exceeds it.
- **Coordinate precision**: GeoJSON serialized with full float64 precision is wasteful for chart data. Consider truncating to 6 decimals (~10 cm) before caching — saves ~30 % on disk.
- **Stream subscription API**: `app.streambundle.getSelfBus` is stable but undocumented in the v2 API. If it changes, fall back to the v1 delta subscription.
- **Multiple providers**: the design supports N providers but Phase 7 assumes one BboxManager. If multiple providers register, they should share the bbox subscription, not duplicate it. Refactor in Phase 7 if needed.

---

## 15. Estimated effort

| Phase | Time |
|---|---|
| 1. Scaffolding | 0.5 d |
| 2. Capabilities | 1 d |
| 3. GetFeature | 1 d |
| 4. Cache | 0.5 d |
| 5. Resource provider | 1 d |
| 6. Static bbox + refresh | 0.5 d |
| 7. Position-driven bbox | 1 d |
| 8. Hardening + release | 0.5 d |
| **Total** | **6 days** |

Concentrated TDD pace. Add ~30 % for inevitable WFS edge cases discovered against real-world endpoints.

---

## 16. References

- Signal K Resources API v2 spec: https://signalk.org/specification/1.7.0/doc/resources_api.html
- `@signalk/charts-plugin` source (architectural reference): https://github.com/SignalK/charts-plugin
- `@signalk/sk-resources-fs` (filesystem-backed reference impl): https://github.com/SignalK/sk-resources-fs
- OGC WFS 2.0.0 spec: https://www.ogc.org/standards/wfs
- Traficom WFS GetCapabilities: https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs?service=WFS&request=GetCapabilities
- Freeboard-SK ResourceSets docs: https://github.com/SignalK/freeboard-sk/wiki

---

*Document version: 1.0 — initial plan*
