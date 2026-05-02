# signalk-wfs-provider

A [Signal K](https://signalk.org/) server plugin that fetches geographic features from OGC Web Feature Service (WFS) endpoints and exposes them through the Signal K v2 Resources API. Clients such as [Freeboard-SK](https://github.com/SignalK/freeboard-sk) can overlay the features on a chart.

## Features

- WFS 2.0.0 — `GetCapabilities` and `GetFeature` with GeoJSON output
- Two fetch strategies: **static bounding box** or **vessel-following** (updates automatically as the vessel moves)
- HTTP conditional requests (ETag / `If-Modified-Since`) to minimise bandwidth
- Persistent SQLite cache — features survive plugin or server restarts and are served offline
- Validates configured layers against capabilities at startup; skips unsupported layers with a clear log message
- Custom HTTP headers for authenticated or rate-limited endpoints
- Multiple simultaneous WFS providers

## Requirements

- Signal K server ≥ 2.x
- Node.js ≥ 22.13.0

## Installation

Install via the Signal K server plugin manager, or manually:

```bash
cd ~/.signalk
npm install signalk-wfs-provider
```

Restart the Signal K server and enable the plugin under **Server → Plugin Config**.

---

## Configuration

All settings are available in the Signal K plugin UI. The underlying JSON structure is described below.

### Top-level fields

| Field | Type | Default | Description |
|---|---|---|---|
| `providers` | array | — | One or more WFS provider definitions (required) |
| `cacheDir` | string | `<dataDir>/wfs-cache` | Directory for the SQLite cache database |
| `resourceType` | string | `wfs-features` | Signal K resource type name exposed by this plugin |

### Provider fields

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | — | Unique provider identifier, no colons (required) |
| `label` | string | — | Human-readable name (optional) |
| `url` | string | — | WFS endpoint base URL, `http`/`https` only (required) |
| `version` | string | `2.0.0` | WFS protocol version |
| `srs` | string | `EPSG:4326` | Coordinate reference system for requests and output |
| `layers` | array | — | Layer definitions (required) |
| `bboxStrategy` | string | — | `static` or `follow-vessel` (required) |
| `staticBbox` | array | — | `[minLon, minLat, maxLon, maxLat]` — required for `static`; used as fallback for `follow-vessel` before first GPS fix |
| `vesselBboxRadiusNm` | number | `30` | Radius in nautical miles around the vessel (`follow-vessel` only) |
| `refreshIntervalSec` | integer | `3600` | Refresh interval in seconds (minimum 60) |
| `minMoveDistanceNm` | number | `5` | Minimum vessel movement (nm) before triggering a new fetch (`follow-vessel` only) |
| `headers` | object | — | Extra HTTP headers sent with every request (e.g. `User-Agent`, `Authorization`) |

### Layer fields

| Field | Type | Description |
|---|---|---|
| `typeName` | string | WFS `typeNames` value, including namespace prefix if required (e.g. `avoin:rajoitusalue_a`) |
| `label` | string | Human-readable layer name (optional) |
| `enabled` | boolean | Whether to fetch this layer |
| `maxFeatures` | integer | Maximum features per request (1–100 000) |

---

## Example — Finnish maritime data (Traficom)

[Traficom](https://www.traficom.fi/en) publishes Finnish nautical chart data as a free open WFS service. All layer names require the `avoin:` namespace prefix.

**WFS endpoint:** `https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs`

### Static bounding box — whole Finnish territorial waters

Fetches a fixed area covering all Finnish coastal waters once per hour. Good for a chart planner or a server not connected to live instruments.

```json
{
  "providers": [
    {
      "id": "traficom",
      "label": "Traficom Finnish nautical data",
      "url": "https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs",
      "version": "2.0.0",
      "srs": "EPSG:4326",
      "bboxStrategy": "static",
      "staticBbox": [19.0, 59.0, 32.0, 70.0],
      "refreshIntervalSec": 3600,
      "headers": {
        "User-Agent": "signalk-wfs-provider/1.0"
      },
      "layers": [
        {
          "typeName": "avoin:TerritorialSeaArea_A",
          "label": "Territorial sea areas",
          "enabled": true,
          "maxFeatures": 500
        },
        {
          "typeName": "avoin:navigational_warnings_a",
          "label": "Navigational warnings (area)",
          "enabled": true,
          "maxFeatures": 200
        },
        {
          "typeName": "avoin:navigational_warnings_l",
          "label": "Navigational warnings (line)",
          "enabled": true,
          "maxFeatures": 200
        },
        {
          "typeName": "avoin:rajoitusalue_a",
          "label": "Restricted areas",
          "enabled": true,
          "maxFeatures": 500
        },
        {
          "typeName": "avoin:Anchorage_A",
          "label": "Anchorage areas",
          "enabled": true,
          "maxFeatures": 500
        },
        {
          "typeName": "avoin:Berths_A",
          "label": "Berths (area)",
          "enabled": true,
          "maxFeatures": 1000
        }
      ]
    }
  ]
}
```

### Vessel-following bounding box

Fetches a 40 nm radius around the vessel and re-fetches automatically when the vessel moves far enough to leave the cached area. Falls back to the Gulf of Finland bbox before the first GPS fix arrives.

```json
{
  "providers": [
    {
      "id": "traficom",
      "label": "Traficom Finnish nautical data",
      "url": "https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs",
      "version": "2.0.0",
      "srs": "EPSG:4326",
      "bboxStrategy": "follow-vessel",
      "staticBbox": [22.0, 59.5, 30.0, 61.5],
      "vesselBboxRadiusNm": 40,
      "minMoveDistanceNm": 10,
      "refreshIntervalSec": 1800,
      "headers": {
        "User-Agent": "signalk-wfs-provider/1.0"
      },
      "layers": [
        {
          "typeName": "avoin:TerritorialSeaArea_A",
          "label": "Territorial sea areas",
          "enabled": true,
          "maxFeatures": 200
        },
        {
          "typeName": "avoin:navigational_warnings_a",
          "label": "Navigational warnings (area)",
          "enabled": true,
          "maxFeatures": 100
        },
        {
          "typeName": "avoin:rajoitusalue_a",
          "label": "Restricted areas",
          "enabled": true,
          "maxFeatures": 200
        }
      ]
    }
  ]
}
```

### Available Traficom layers (selection)

The full list (36 layers) is returned by `GetCapabilities`. Commonly useful layers for navigation are listed below. All require the `avoin:` prefix.

| `typeName` | Description |
|---|---|
| `avoin:TerritorialSeaArea_A` | Territorial sea boundary polygons |
| `avoin:ExclusiveEconomicZone_A` | Exclusive economic zone |
| `avoin:rajoitusalue_a` | Restricted and prohibited areas |
| `avoin:navigational_warnings_a` | Active navigational warnings (polygon) |
| `avoin:navigational_warnings_l` | Active navigational warnings (line) |
| `avoin:Anchorage_A` | Anchorage areas |
| `avoin:Fairway_A` | Fairway areas |
| `avoin:Berths_A` | Berth polygons |
| `avoin:Berths_L` | Berth lines |
| `avoin:DepthContour_L` | Depth contour lines |
| `avoin:syvyyspiste` | Depth soundings |
| `avoin:d_alueet` | Dredged areas |
| `avoin:Dam_A` | Dams and barrages |
| `avoin:Gate_L` | Lock gates |

To see the full capabilities document:

```
https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs?service=WFS&version=2.0.0&request=GetCapabilities
```

---

## How it works

1. **Startup** — previously cached data is loaded from SQLite so features are available immediately, even without a network connection.
2. **Capabilities check** — for each provider, `GetCapabilities` is called and configured layers are validated against the advertised layer list. Layers not found or lacking GeoJSON support are skipped with a log message.
3. **Initial fetch** — `GetFeature` is called for each enabled layer. For `follow-vessel` providers with no `staticBbox` and no GPS fix yet, this step is deferred until a position arrives.
4. **Refresh** — a timer fires every `refreshIntervalSec`. For `follow-vessel` providers, the bbox manager also triggers a fetch whenever the vessel moves far enough to exit the cached area (with a 30 s debounce).
5. **Conditional requests** — ETag and `Last-Modified` headers from previous responses are sent as `If-None-Match` / `If-Modified-Since`. A `304 Not Modified` response refreshes the cache timestamp without re-downloading data.
6. **Resources API** — cached GeoJSON FeatureCollections are served via the Signal K Resources API. Each resource ID is `<providerId>:<typeName>` (e.g. `traficom:avoin:TerritorialSeaArea_A`).

---

## Signal K Resources API

Resources are served under the configured `resourceType` (default: `wfs-features`).

### List all cached layers

```
GET /signalk/v2/api/resources/wfs-features
```

Response:

```json
{
  "traficom:avoin:TerritorialSeaArea_A": {
    "$source": "wfs-provider:traficom",
    "timestamp": "2024-06-01T12:00:00.000Z",
    "bbox": [19.0, 59.0, 32.0, 70.0],
    "featureCount": 42
  },
  "traficom:avoin:navigational_warnings_a": {
    "$source": "wfs-provider:traficom",
    "timestamp": "2024-06-01T12:00:00.000Z",
    "bbox": [19.0, 59.0, 32.0, 70.0],
    "featureCount": 3
  }
}
```

### Get a single layer

```
GET /signalk/v2/api/resources/wfs-features/traficom:avoin:TerritorialSeaArea_A
```

Returns a GeoJSON `FeatureCollection` with Signal K metadata extensions:

```json
{
  "type": "FeatureCollection",
  "$source": "wfs-provider:traficom",
  "timestamp": "2024-06-01T12:00:00.000Z",
  "bbox": [19.0, 59.0, 32.0, 70.0],
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[[ ... ]]] },
      "properties": { "OBJECTID": 1, "name": "Finnish Territorial Sea" }
    }
  ]
}
```

---

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run unit tests
npm test

# Run unit tests with coverage report
npm run test:coverage

# Live integration tests against real Traficom WFS (requires network)
WFS_LIVE=true npx vitest run test/live --reporter=verbose

# Lint
npm run lint
```

## License

MIT
