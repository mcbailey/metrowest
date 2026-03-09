import { useEffect } from "react";

export const SEO_SITE_URL = "https://mwstats.com";
export const SEO_SITE_NAME = "MWStats | Metrowest Youth Basketball Rankings";

type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>;

type PageSeoInput = {
  title: string;
  description: string;
  canonicalPath: string;
  jsonLd?: JsonLdValue;
};

function absoluteUrl(path: string): string {
  if (!path) return SEO_SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SEO_SITE_URL}${normalizedPath}`;
}

function upsertMetaByName(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string): void {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let el = document.querySelector(`link[rel="canonical"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertJsonLd(id: string, value: JsonLdValue): void {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(value);
}

export function useSiteSchema(): void {
  useEffect(() => {
    upsertJsonLd("mwstats-site-schema", [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SEO_SITE_NAME,
        url: SEO_SITE_URL,
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "MWStats",
        url: SEO_SITE_URL,
      },
    ]);
  }, []);
}

export function usePageSeo(input: PageSeoInput): void {
  useEffect(() => {
    const canonical = absoluteUrl(input.canonicalPath);
    document.title = input.title;
    upsertMetaByName("description", input.description);
    upsertMetaByProperty("og:title", input.title);
    upsertMetaByProperty("og:description", input.description);
    upsertMetaByProperty("og:type", "website");
    upsertMetaByProperty("og:url", canonical);
    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", input.title);
    upsertMetaByName("twitter:description", input.description);
    upsertCanonical(canonical);

    if (input.jsonLd) {
      upsertJsonLd("mwstats-page-schema", input.jsonLd);
    }
  }, [input.canonicalPath, input.description, input.jsonLd, input.title]);
}
