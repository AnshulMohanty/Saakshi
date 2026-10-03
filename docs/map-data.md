# Map data

Every map of India in Saakshi (landing chapters 2 and 9, "Be a witness", the library) draws one
file, `public/geo/india.json`, through one component, `src/components/map/india-map.tsx`. The Witness
Wall (`/witness`, its own WebGL stage) draws the same file's dots, so no screen shows generic land or
a neighbouring country's outline. (`data/land-dots.json`, Natural Earth land, remains only in the
design-parity fixtures.)

## Source and licence

| | |
|---|---|
| File | `india-soi.geojson` in DataMeet's `maps` repository, folder `Country` ("India - Admin 0 with Disputed Territories") |
| URL | https://raw.githubusercontent.com/datameet/maps/master/Country/india-soi.geojson |
| What it is | The Survey of India state boundaries, dissolved into one outline: the land area of India **in accordance with the official boundary of India as per the Survey of India**, so all of Jammu and Kashmir and Ladakh (Gilgit-Baltistan, Aksai Chin included), Arunachal Pradesh, the Andaman and Nicobar Islands and Lakshadweep |
| Licence | **CC BY-SA 2.5 / ODbL**, as DataMeet's `Country/README.md` states for this file (checked 3 Oct 2026). The repository's default (CC BY 4.0) applies only where a file states nothing. |
| Not used | `india-composite.geojson` (compiled from LSIB and other sources) and `india-osm.geojson` (OSM-derived): neither is the Survey of India outline. No de facto or generic world boundary data is used for India. |

Attribution is shown on every map ("Boundary: Survey of India (via DataMeet, CC BY-SA)") and in
the landing footer's photo credits. `public/geo/india.json` is a derived work of the file above
and is shared under the same terms.

## How the file is built

`pnpm map:india` (`scripts/india-map.ts`; `--offline` uses the cache only):

1. Downloads the GeoJSON once through `src/lib/providers/http.ts` and caches it in `.data/geo/`
   (git-ignored). The app never fetches it at runtime.
2. Simplifies every ring with Douglas–Peucker at 0.01° (about 1.1 km), drops specks under 2e-5 deg²
   and the slivers the dissolve leaves between states (holes under 0.02 deg²).
3. Computes the dot field: a 0.18° grid of points inside the outline (point-in-polygon), plus one dot
   per island too small to hold a grid point, so Lakshadweep and the Andamans always show.
4. Writes `public/geo/india.json`: 388 polygons, 5,827 outline points, 9,327 dots, 51 KB gzipped
   (`tests/india-map.test.ts` keeps it under 150 KB gzipped and checks known places inside and
   outside the outline: Leh, Gilgit, Muzaffarabad, Aksai Chin, Tawang inside; Lahore, Kathmandu,
   Dhaka, Colombo, Thimphu outside).

Zoomed in, the component draws a finer grid for the visible window only (the base step halved,
`gridStep` in `src/lib/map/india.ts`), so the dotted look holds at a city zoom.

## Other bundled media

`public/samples/midway-atoll-debris.jpg` and `public/samples/beach-lighters.jpg`, the sample photos
in "Try to fool it", are NOAA works (U.S. federal government, public domain) from Wikimedia
Commons, resized to 800 px with metadata stripped. They are credited in the landing footer.
