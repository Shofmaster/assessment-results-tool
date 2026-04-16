import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(process.cwd());
const DIST_INDEX_PATH = resolve(ROOT, 'dist/index.html');
const SEO_CONTENT_PATH = resolve(ROOT, 'src/seo/seoContent.ts');
const SITE_URL = 'https://aerogap.com';
const BUILD_DATE = new Date().toISOString().slice(0, 10);

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertTitle(html, title) {
  const titleTag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/, titleTag);
  }
  return html.replace('</head>', `  ${titleTag}\n</head>`);
}

function upsertMetaByName(html, name, content) {
  const tag = `  <meta name="${name}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta[^>]*name=["']${escapeRegExp(name)}["'][^>]*>`);
  if (pattern.test(html)) return html.replace(pattern, tag.trim());
  return html.replace('</head>', `${tag}\n</head>`);
}

function upsertMetaByProperty(html, property, content) {
  const tag = `  <meta property="${property}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta[^>]*property=["']${escapeRegExp(property)}["'][^>]*>`);
  if (pattern.test(html)) return html.replace(pattern, tag.trim());
  return html.replace('</head>', `${tag}\n</head>`);
}

function upsertCanonical(html, canonicalUrl) {
  const tag = `  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`;
  const pattern = /<link[^>]*rel=["']canonical["'][^>]*>/;
  if (pattern.test(html)) return html.replace(pattern, tag.trim());
  return html.replace('</head>', `${tag}\n</head>`);
}

function upsertJsonLd(html, graph) {
  const existingPattern = /<script id="aerogap-json-ld-prerender" type="application\/ld\+json">[\s\S]*?<\/script>/;
  const json = JSON.stringify(graph).replaceAll('</script', '<\\/script');
  const scriptTag = `  <script id="aerogap-json-ld-prerender" type="application/ld+json">${json}</script>`;
  if (existingPattern.test(html)) return html.replace(existingPattern, scriptTag.trim());
  return html.replace('</head>', `${scriptTag}\n</head>`);
}

function setRootMarkup(html, markup) {
  const rootPattern = /<div id="root">[\s\S]*?<\/div>/;
  if (rootPattern.test(html)) {
    return html.replace(rootPattern, `<div id="root">${markup}</div>`);
  }
  return html;
}

function routeToOutputFile(path) {
  if (path === '/') return resolve(ROOT, 'dist/index.html');
  const clean = path.replace(/^\//, '').replace(/\/$/, '');
  return resolve(ROOT, `dist/${clean}/index.html`);
}

function extractSeoPages() {
  const fileText = readFileSync(SEO_CONTENT_PATH, 'utf8');
  const marker = 'export const SEO_PAGES';
  const markerIndex = fileText.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error('Unable to parse SEO_PAGES from src/seo/seoContent.ts');
  }

  const equalsIndex = fileText.indexOf('=', markerIndex);
  const arrayStart = equalsIndex === -1 ? -1 : fileText.indexOf('[', equalsIndex);
  if (arrayStart === -1) {
    throw new Error('Unable to locate SEO_PAGES array start');
  }

  let depth = 0;
  let arrayEnd = -1;
  for (let i = arrayStart; i < fileText.length; i += 1) {
    const ch = fileText[i];
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        arrayEnd = i;
        break;
      }
    }
  }
  if (arrayEnd === -1) {
    throw new Error('Unable to locate SEO_PAGES array end');
  }

  const arrayLiteral = fileText.slice(arrayStart, arrayEnd + 1);
  const script = new vm.Script(arrayLiteral);
  const pages = script.runInNewContext({});
  if (!Array.isArray(pages)) {
    throw new Error('Parsed SEO_PAGES is not an array');
  }
  return pages;
}

function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Aviation Quality Company',
    url: SITE_URL,
    brand: 'AeroGap',
    sameAs: [SITE_URL],
  };
}

function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AeroGap',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function breadcrumbSchema(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: page.h1, item: `${SITE_URL}${page.path}` },
    ],
  };
}

function pageSchema(page) {
  if (page.type === 'service') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: page.h1,
      description: page.description,
      serviceType: page.primaryKeyword,
      provider: {
        '@type': 'Organization',
        name: 'Aviation Quality Company',
        url: SITE_URL,
      },
      areaServed: 'United States',
      url: `${SITE_URL}${page.path}`,
    };
  }

  if (page.type === 'product') {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: page.h1,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: page.description,
      url: `${SITE_URL}${page.path}`,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      provider: {
        '@type': 'Organization',
        name: 'Aviation Quality Company',
        url: SITE_URL,
      },
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.h1,
    description: page.description,
    mainEntityOfPage: `${SITE_URL}${page.path}`,
    keywords: [page.primaryKeyword, ...(page.secondaryKeywords ?? [])].join(', '),
    author: {
      '@type': 'Organization',
      name: 'Aviation Quality Company',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Aviation Quality Company',
      url: SITE_URL,
    },
    datePublished: BUILD_DATE,
    dateModified: BUILD_DATE,
  };
}

function faqSchema(page) {
  if (!Array.isArray(page.faq) || page.faq.length === 0) return undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

function homeSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationSchema(), websiteSchema()],
  };
}

function pageGraph(page) {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationSchema(), websiteSchema(), breadcrumbSchema(page), pageSchema(page), faqSchema(page)].filter(Boolean),
  };
}

function renderHomeMarkup() {
  const sections = [
    { href: '/aviation-quality', label: 'Aviation quality guide' },
    { href: '/aviation-quality-software', label: 'Aviation quality software' },
    { href: '/aviation-compliance-audit-services', label: 'Aviation compliance audit services' },
    { href: '/faa-repair-station-audit-checklist', label: 'FAA Part 145 checklist' },
  ];

  const links = sections
    .map((item) => `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`)
    .join('');

  return [
    '<main style="max-width:960px;margin:40px auto;padding:0 20px;font-family:Inter,Arial,sans-serif;">',
    '<header>',
    '<p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Aviation quality platform</p>',
    '<h1 style="font-size:34px;line-height:1.2;color:#0f172a;">Aviation quality software built for FAA and AS9100 teams</h1>',
    '<p style="font-size:18px;line-height:1.6;color:#334155;max-width:760px;">AeroGap helps aviation teams run compliance audits, organize evidence, close findings, and keep ongoing readiness with human-controlled workflows.</p>',
    '</header>',
    '<section style="margin-top:24px;">',
    '<h2 style="font-size:22px;color:#0f172a;">Explore resources</h2>',
    `<ul style="line-height:1.8;color:#1e293b;">${links}</ul>`,
    '</section>',
    '</main>',
  ].join('');
}

function renderSeoPageMarkup(page) {
  const sections = (page.sections ?? [])
    .map(
      (section) => `
        <article style="padding:20px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:14px;">
          <h2 style="font-size:22px;color:#0f172a;margin:0 0 10px 0;">${escapeHtml(section.heading)}</h2>
          <p style="font-size:16px;line-height:1.7;color:#334155;margin:0;">${escapeHtml(section.body)}</p>
        </article>`,
    )
    .join('');

  const faqItems = (page.faq ?? [])
    .map(
      (item) => `
        <article style="margin-bottom:14px;">
          <h3 style="font-size:18px;color:#0f172a;margin:0 0 6px 0;">${escapeHtml(item.question)}</h3>
          <p style="font-size:15px;line-height:1.7;color:#334155;margin:0;">${escapeHtml(item.answer)}</p>
        </article>`,
    )
    .join('');

  const relatedLinks = (page.internalLinks ?? [])
    .map((item) => `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`)
    .join('');

  return [
    '<main style="max-width:960px;margin:40px auto;padding:0 20px;font-family:Inter,Arial,sans-serif;">',
    '<header>',
    '<p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">US Aviation Compliance</p>',
    `<h1 style="font-size:34px;line-height:1.2;color:#0f172a;">${escapeHtml(page.h1)}</h1>`,
    `<p style="font-size:18px;line-height:1.6;color:#334155;max-width:760px;">${escapeHtml(page.intro)}</p>`,
    '</header>',
    `<section style="margin-top:24px;">${sections}</section>`,
    page.faq?.length
      ? `<section style="margin-top:24px;"><h2 style="font-size:22px;color:#0f172a;">Frequently asked questions</h2>${faqItems}</section>`
      : '',
    `<section style="margin-top:24px;"><h2 style="font-size:22px;color:#0f172a;">Related resources</h2><ul style="line-height:1.8;color:#1e293b;">${relatedLinks}</ul></section>`,
    '</main>',
  ].join('');
}

function baseHtmlTemplate() {
  return readFileSync(DIST_INDEX_PATH, 'utf8');
}

function renderAndWritePage({ path, title, description, ogType, canonicalUrl, jsonLd, markup }) {
  let html = baseHtmlTemplate();
  html = upsertTitle(html, title);
  html = upsertMetaByName(html, 'description', description);
  html = upsertMetaByProperty(html, 'og:type', ogType);
  html = upsertMetaByProperty(html, 'og:title', title);
  html = upsertMetaByProperty(html, 'og:description', description);
  html = upsertMetaByProperty(html, 'og:url', canonicalUrl);
  html = upsertMetaByName(html, 'twitter:title', title);
  html = upsertMetaByName(html, 'twitter:description', description);
  html = upsertMetaByName(html, 'twitter:url', canonicalUrl);
  html = upsertCanonical(html, canonicalUrl);
  html = upsertJsonLd(html, jsonLd);
  html = setRootMarkup(html, markup);

  const outputFile = routeToOutputFile(path);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, html, 'utf8');
}

function main() {
  const pages = extractSeoPages();

  renderAndWritePage({
    path: '/',
    title: 'Aviation Quality Software & Audit Platform | AeroGap',
    description:
      'AeroGap is aviation quality software for FAA and AS9100 teams to run audits, manage evidence, close findings, and stay audit-ready with human-controlled workflows.',
    ogType: 'website',
    canonicalUrl: `${SITE_URL}/`,
    jsonLd: homeSchema(),
    markup: renderHomeMarkup(),
  });

  for (const page of pages) {
    renderAndWritePage({
      path: page.path,
      title: page.title,
      description: page.description,
      ogType: page.type === 'article' || page.type === 'guide' ? 'article' : 'website',
      canonicalUrl: `${SITE_URL}${page.path}`,
      jsonLd: pageGraph(page),
      markup: renderSeoPageMarkup(page),
    });
  }

  process.stdout.write(`Prerendered ${pages.length + 1} SEO pages.\n`);
}

main();
