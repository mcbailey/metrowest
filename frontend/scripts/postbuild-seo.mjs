// Post-build: pre-render a static HTML page for every route so search engines (and link previews) see real
// titles, descriptions, canonical URLs and content. React replaces the static markup when the app loads.
// Also writes sitemap.xml, robots.txt, 404.html (SPA fallback) and redirect stubs for old /team/<id> URLs.
//
// URL helpers here mirror src/paths.ts; keep the two in sync.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultCardSvg, loadCardAssets, renderPng, teamCardSvg } from "./season-cards.mjs";

const SITE_URL = process.env.SITE_URL || "https://mwstats.com";
const SITE_NAME = "MWStats | Metrowest Youth Basketball Rankings";
const DIST_DIR = path.resolve("dist");
const DATA_DIR = path.join(DIST_DIR, "data");

// ---- URL helpers (mirror src/paths.ts) ----
const slugify = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const seasonSlug = (yr) => `${Number(yr) - 1}-${String(yr).slice(-2)}`;
const genderSlug = (g) => (g === "F" ? "girls" : "boys");
const ordinal = (n) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
const genderLabel = (g) => (g === "F" ? "Girls" : "Boys");
const rankingsPath = (yr, g, grade, seg) =>
  `/${seasonSlug(yr)}/${genderSlug(g)}/${ordinal(grade)}${seg ? `/${seg}` : ""}`;
const teamPath = (yr, teamno, name) => {
  const nameSlug = slugify(String(name ?? "").replace(/^[A-Za-z0-9/]+-/, ""));
  return `/${seasonSlug(yr)}/team/${teamno}${nameSlug ? `-${nameSlug}` : ""}`;
};
const playoffsPath = (yr, g, grade) => `/${seasonSlug(yr)}/playoffs/${genderSlug(g)}/${ordinal(grade)}`;

// ---- HTML helpers ----
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const record = (t) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
const canonicalUrl = (p) => `${SITE_URL}${p === "/" ? "/" : `${p}/`}`;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf-8"));
}

async function readJsonIfExists(file) {
  try {
    return await readJson(file);
  } catch {
    return null;
  }
}

let template = "";

const DEFAULT_IMAGE = "/cards/default.png";

function renderPage({ urlPath, title, description, body, image }) {
  const imageUrl = `${SITE_URL}${image ?? DEFAULT_IMAGE}`;
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonicalUrl(urlPath))}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(canonicalUrl(urlPath))}" />`,
    `<meta property="og:image" content="${esc(imageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${esc(imageUrl)}" />`,
  ].join("\n    ");
  return template
    .replace(/<title>[\s\S]*?<\/title>/, head)
    .replace('<div id="root"></div>', `<div id="root"><div class="prerender">${body}</div></div>`);
}

const pages = [];
function addPage(page) {
  pages.push(page);
}

async function writePage(page) {
  const dir = page.urlPath === "/" ? DIST_DIR : path.join(DIST_DIR, ...page.urlPath.split("/").filter(Boolean));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), renderPage(page), "utf-8");
}

function rankingsTable(teams, yr) {
  const rows = teams
    .map(
      (t) =>
        `<tr><td>${t.rank}</td><td>${link(teamPath(yr, t.teamno, t.name), t.name)}</td><td>${record(t)}</td><td>${Number(
          t.power
        ).toFixed(1)}</td></tr>`
    )
    .join("");
  return `<table><thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Power</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const cards = [];

async function buildSeasonPages(index, season) {
  const yr = season.yrseason;
  const divisionSizes = new Map();
  const label = season.label;
  const status = season.status === "final" ? "final standings" : "current rankings";

  for (const gender of season.genders) {
    for (const grade of season.grades) {
      const groupDir = path.join(DATA_DIR, yr, gender, String(grade));
      const divisionsPayload = await readJsonIfExists(path.join(groupDir, "divisions.json"));
      if (!divisionsPayload) continue;
      const group = `${ordinal(grade)} ${genderLabel(gender)}`;

      const datasets = [];
      for (const d of divisionsPayload.divisions) {
        const ds = await readJsonIfExists(path.join(groupDir, `division-${d.divisionno}.json`));
        if (ds) {
          datasets.push(ds);
          divisionSizes.set(ds.divisionno, ds.rankings.length);
        }
      }

      const aggregate = (list) =>
        list
          .flatMap((ds) => ds.rankings)
          .sort((a, b) => b.power - a.power)
          .map((t, i) => ({ ...t, rank: i + 1 }));

      const divisionLinks = datasets
        .map((ds) => link(rankingsPath(yr, gender, grade, ds.tag ? slugify(ds.tag) : ds.divisionno), ds.tag ?? ds.division_name))
        .join(" · ");

      // All divisions
      const all = aggregate(datasets);
      addPage({
        urlPath: rankingsPath(yr, gender, grade),
        title: `${group} - All Divisions, ${label} | MWStats`,
        description: `${group} youth basketball ${status} for ${label}: ${all.length} teams ranked by power rating and strength of schedule.`,
        body: `<h1>${esc(group)} power rankings, ${esc(label)}</h1><p>Divisions: ${divisionLinks}</p>${
          season.groups?.find((g) => g.gender === gender && g.grade === grade)?.playoffs
            ? `<p>${link(playoffsPath(yr, gender, grade), "Playoff brackets")}</p>`
            : ""
        }${rankingsTable(all, yr)}`,
      });

      // Division tiers
      const tiers = [...new Set(datasets.map((ds) => ds.divisiontier).filter(Boolean))];
      for (const tier of tiers) {
        const teams = aggregate(datasets.filter((ds) => ds.divisiontier === tier));
        addPage({
          urlPath: rankingsPath(yr, gender, grade, `division-${tier}`),
          title: `${group} - Division ${tier}, ${label} | MWStats`,
          description: `${group} Division ${tier} youth basketball ${status} for ${label}: ${teams.length} teams.`,
          body: `<h1>${esc(group)} Division ${esc(tier)}, ${esc(label)}</h1>${rankingsTable(teams, yr)}`,
        });
      }

      // Single divisions
      for (const ds of datasets) {
        const name = `${ds.division_name}${ds.tag ? ` (${ds.tag})` : ""}`;
        addPage({
          urlPath: rankingsPath(yr, gender, grade, ds.tag ? slugify(ds.tag) : ds.divisionno),
          title: `${name}, ${label} | MWStats`,
          description: `${name} ${status} for ${label}: ${ds.rankings.length} teams with records, power rating and strength of schedule.`,
          body: `<h1>${esc(name)}, ${esc(label)}</h1>${rankingsTable(ds.rankings, yr)}`,
        });
      }

      // Playoffs
      const playoffs = await readJsonIfExists(path.join(DATA_DIR, yr, "playoffs", gender, `${grade}.json`));
      if (playoffs) {
        const sections = playoffs.groups
          .map((g) => {
            const games = g.games
              .map((x) => {
                const [a, b] = x.teams;
                const side = (t) =>
                  `${t.seed ? `(${t.seed}) ` : ""}${t.teamno ? link(teamPath(yr, t.teamno, t.name), t.name) : esc(t.name ?? "TBD")}${
                    t.score !== null && t.score !== undefined ? ` ${t.score}` : ""
                  }`;
                return `<li>Round ${x.round}: ${side(a)} vs ${side(b)}</li>`;
              })
              .join("");
            return `<h2>${esc(g.name)}</h2><ul>${games}</ul>`;
          })
          .join("");
        addPage({
          urlPath: playoffsPath(yr, gender, grade),
          title: `${group} playoffs, ${label} | MWStats`,
          description: `${group} playoff brackets for ${label}: seeds, scores and results for ${playoffs.groups.length} groups.`,
          body: `<h1>${esc(group)} playoffs, ${esc(label)}</h1>${sections}`,
        });
      }
    }
  }

  // Teams
  const files = await readdir(path.join(DATA_DIR, yr));
  for (const file of files) {
    if (!file.startsWith("team-") || !file.endsWith(".json")) continue;
    const team = await readJson(path.join(DATA_DIR, yr, file));
    const s = team.summary;
    const group = s.grade ? `${ordinal(s.grade)} ${genderLabel(s.gender)}` : "";
    const games = team.past_games
      .map(
        (g) =>
          `<tr><td>${esc(g.date ?? "TBD")}</td><td>${
            g.opponent_teamno ? link(teamPath(yr, g.opponent_teamno, g.opponent_name), g.opponent_name) : esc(g.opponent_name)
          }</td><td>${g.team_score ?? ""}-${g.opponent_score ?? ""}</td></tr>`
      )
      .join("");
    const playoffs = (team.playoffs ?? []).map((p) => `<li>${esc(p.result)}, ${esc(p.group_name)}</li>`).join("");
    const urlPath = teamPath(yr, team.teamno, team.team_name);
    let image;
    if (season.is_current) {
      image = `/cards/${yr}/${team.teamno}.png`;
      const top = (team.playoffs ?? []).find((p) => p.result === "Champion") ?? (team.playoffs ?? [])[0];
      const svg = teamCardSvg({
        name: team.team_name.replace(/\s+/g, " "),
        group,
        division: s.division_tag ? `Division ${s.division_tag.replace(/^D(\d+).*/, "$1")} (${s.division_tag})` : s.division_name,
        town: team.town,
        season: label,
        record: record(s),
        rank: s.rank,
        divisionSize: divisionSizes.get(s.divisionno),
        playoff: top ? `${top.result.toUpperCase()}  ·  ${top.group_name}` : null,
      });
      cards.push([path.join(DIST_DIR, "cards", yr, `${team.teamno}.png`), svg]);
    }
    addPage({
      image,
      urlPath,
      title: `${team.team_name} (${group}, ${label}) | MWStats`,
      description: `${team.team_name}: ${record(s)} in ${s.division_name ?? "their division"}, ranked #${s.rank ?? "-"}, ${label}. Results, schedule, power rating and program history.`,
      body: `<h1>${esc(team.team_name)}</h1><p>${esc(group)} · ${esc(s.division_name ?? "")} · ${esc(label)}${
        team.town_slug ? ` · ${link(`/towns/${team.town_slug}`, team.town)}` : ""
      }</p><p>Rank ${esc(s.rank ?? "-")} · Record ${record(s)} · Power ${Number(s.power).toFixed(1)}</p>${
        playoffs ? `<h2>Playoffs</h2><ul>${playoffs}</ul>` : ""
      }<h2>Results</h2><table><tbody>${games}</tbody></table>`,
    });
    legacyTeams.set(team.teamno, urlPath);
  }
}

const legacyTeams = new Map();

async function buildGymPages() {
  const gyms = await readJsonIfExists(path.join(DATA_DIR, "gyms.json"));
  if (!gyms) return;
  addPage({
    urlPath: "/gyms",
    title: `Gyms | ${SITE_NAME}`,
    description: "Every gym used for Metrowest youth basketball games, with addresses and game schedules.",
    body: `<h1>Gyms</h1><ul>${gyms.gyms
      .map((g) => `<li>${link(`/gyms/${g.slug}`, g.name)}${g.address ? `, ${esc(g.address)}` : ""}</li>`)
      .join("")}</ul>`,
  });
  for (const g of gyms.gyms) {
    const seasons = Object.entries(g.seasons)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([yr, n]) => `<li>${esc(seasonSlug(yr))}: ${n} games</li>`)
      .join("");
    addPage({
      urlPath: `/gyms/${g.slug}`,
      title: `${g.name} | MWStats`,
      description: `${g.name}${g.address ? `, ${g.address}` : ""}: Metrowest youth basketball games and schedule.`,
      body: `<h1>${esc(g.name)}</h1>${g.address ? `<p>${esc(g.address)}</p>` : ""}<ul>${seasons}</ul>`,
    });
  }
}

async function buildTownPages() {
  const towns = await readJsonIfExists(path.join(DATA_DIR, "towns.json"));
  if (!towns) return;
  addPage({
    urlPath: "/towns",
    title: `Towns | ${SITE_NAME}`,
    description: "Every town in Metrowest youth basketball, with each town's teams, rankings, and history by season.",
    body: `<h1>Towns</h1><ul>${towns.towns.map((t) => `<li>${link(`/towns/${t.slug}`, t.name)}</li>`).join("")}</ul>`,
  });
  for (const t of towns.towns) {
    const town = await readJson(path.join(DATA_DIR, "towns", `${t.slug}.json`));
    const latest = town.teams.filter((x) => x.yrseason === town.seasons[0]);
    const rows = latest
      .map(
        (x) =>
          `<tr><td>${ordinal(x.grade)} ${genderLabel(x.gender)}</td><td>${link(teamPath(x.yrseason, x.teamno, x.name), x.name)}</td><td>${esc(
            x.division_tag ?? ""
          )}</td><td>${x.rank}</td><td>${record(x)}</td></tr>`
      )
      .join("");
    addPage({
      urlPath: `/towns/${town.slug}`,
      title: `${town.name} youth basketball teams | MWStats`,
      description: `${town.name} teams in Metrowest youth basketball: power rankings, records, and playoff results for every grade and season.`,
      body: `<h1>${esc(town.name)}</h1><p>${town.teams.length} teams across ${town.seasons.length} seasons.</p><h2>${esc(
        seasonSlug(town.seasons[0])
      )}</h2><table><tbody>${rows}</tbody></table>`,
    });
  }
}

function redirectStub(target) {
  const url = canonicalUrl(target);
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>Moved</title><link rel="canonical" href="${esc(
    url
  )}" /><meta http-equiv="refresh" content="0; url=${esc(target)}/" /></head><body><a href="${esc(target)}/">This page has moved.</a></body></html>`;
}

async function main() {
  template = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
  await writeFile(path.join(DIST_DIR, "404.html"), template, "utf-8");

  const index = await readJson(path.join(DATA_DIR, "index.json"));
  const current = index.seasons.find((s) => s.yrseason === index.current) ?? index.seasons[0];

  addPage({
    urlPath: "/",
    title: SITE_NAME,
    description: "Metrowest youth basketball power rankings, division standings, playoff brackets, town pages, and team history.",
    body: `<h1>Metrowest Youth Basketball Rankings</h1>${(current?.groups ?? [])
      .map((g) => `<p>${link(rankingsPath(current.yrseason, g.gender, g.grade), `${ordinal(g.grade)} ${genderLabel(g.gender)}`)}</p>`)
      .join("")}<p>${link("/towns", "Towns")} · ${link("/glossary", "Glossary")}</p>`,
  });
  addPage({
    urlPath: "/glossary",
    title: `Glossary | ${SITE_NAME}`,
    description: "How MWStats ranks teams: power rating, Elo, strength of schedule, and the other terms used on the site.",
    body: "<h1>Glossary of ranking terms</h1>",
  });

  for (const season of index.seasons) {
    await buildSeasonPages(index, season);
  }
  await buildTownPages();
  await buildGymPages();
  addPage({
    urlPath: "/week",
    title: `This week's games | ${SITE_NAME}`,
    description: "Every Metrowest youth basketball game this week, by grade, with gyms and close matchups to watch.",
    body: "<h1>This week's games</h1>",
  });

  // Old /team/<id> URLs (team numbers are unique across seasons) -> their new URL.
  for (const [teamno, target] of legacyTeams) {
    const dir = path.join(DIST_DIR, "team", teamno);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), redirectStub(target), "utf-8");
  }

  // Season cards (link previews): one per current-season team, plus the site-wide default.
  await loadCardAssets(path.join(DIST_DIR, "mwstatslogo.png"));
  await mkdir(path.join(DIST_DIR, "cards"), { recursive: true });
  await writeFile(path.join(DIST_DIR, DEFAULT_IMAGE), renderPng(defaultCardSvg()));
  for (const [file, svg] of cards) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, renderPng(svg));
  }

  // Write pages in parallel batches.
  for (let i = 0; i < pages.length; i += 200) {
    await Promise.all(pages.slice(i, i + 200).map(writePage));
  }

  const today = index.generated_at || new Date().toISOString().slice(0, 10);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((p) => `  <url><loc>${esc(canonicalUrl(p.urlPath))}</loc><lastmod>${today}</lastmod></url>`),
    "</urlset>",
    "",
  ].join("\n");
  await writeFile(path.join(DIST_DIR, "sitemap.xml"), sitemap, "utf-8");
  await writeFile(path.join(DIST_DIR, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf-8");

  console.log(
    `Pre-rendered ${pages.length} pages, ${cards.length} season cards, ${legacyTeams.size} legacy team redirects; wrote sitemap.xml, robots.txt, 404.html`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
