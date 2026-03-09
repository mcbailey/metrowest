import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_URL = process.env.SITE_URL || "https://mwstats.com";
const DIST_DIR = path.resolve("dist");
const DATA_DIR = path.join(DIST_DIR, "data");

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function generateUrls() {
  const urls = new Set(["/", "/glossary"]);
  const indexPath = path.join(DATA_DIR, "index.json");
  const index = await readJson(indexPath);

  for (const season of index.seasons ?? []) {
    for (const gender of season.genders ?? []) {
      for (const grade of season.grades ?? []) {
        const params = new URLSearchParams({
          season: season.yrseason,
          gender,
          grade: String(grade),
          division: "ALL",
        });
        urls.add(`/?${params.toString()}`);

        const divisionsPath = path.join(
          DATA_DIR,
          String(season.yrseason),
          String(gender),
          String(grade),
          "divisions.json"
        );

        let divisionsPayload;
        try {
          divisionsPayload = await readJson(divisionsPath);
        } catch {
          continue;
        }

        const tiers = new Set(
          (divisionsPayload.divisions ?? [])
            .map((d) => d.divisiontier)
            .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
            .map((v) => String(v))
        );
        for (const tier of tiers) {
          const tierParams = new URLSearchParams({
            season: season.yrseason,
            gender,
            grade: String(grade),
            division: `TIER-${tier}`,
          });
          urls.add(`/?${tierParams.toString()}`);
        }

        for (const division of divisionsPayload.divisions ?? []) {
          const divisionNo = String(division.divisionno ?? "").trim();
          if (!divisionNo) continue;
          const divisionParams = new URLSearchParams({
            season: season.yrseason,
            gender,
            grade: String(grade),
            division: divisionNo,
          });
          urls.add(`/?${divisionParams.toString()}`);
        }
      }
    }
  }

  const seasons = await readdir(DATA_DIR, { withFileTypes: true });
  for (const seasonDir of seasons) {
    if (!seasonDir.isDirectory() || !/^\d+$/.test(seasonDir.name)) continue;
    const seasonPath = path.join(DATA_DIR, seasonDir.name);
    const files = await readdir(seasonPath, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!file.name.startsWith("team-") || !file.name.endsWith(".json")) continue;
      const teamNo = file.name.slice("team-".length, -".json".length).trim();
      if (!teamNo) continue;
      urls.add(`/team/${teamNo}`);
    }
  }

  return [...urls].sort((a, b) => a.localeCompare(b));
}

async function generateSitemap(urls) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = urls
    .map((u) => {
      const loc = `${SITE_URL}${u}`;
      return `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${today}</lastmod></url>`;
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    rows,
    "</urlset>",
    "",
  ].join("\n");

  await writeFile(path.join(DIST_DIR, "sitemap.xml"), xml, "utf-8");
}

async function generateRobots() {
  const txt = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
  await writeFile(path.join(DIST_DIR, "robots.txt"), txt, "utf-8");
}

async function main() {
  await copyFile(path.join(DIST_DIR, "index.html"), path.join(DIST_DIR, "404.html"));
  const urls = await generateUrls();
  await generateSitemap(urls);
  await generateRobots();
  console.log(`Generated SEO files: sitemap.xml (${urls.length} urls), robots.txt, 404.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
