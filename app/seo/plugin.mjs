// Vite plugin: after the build, write robots.txt, sitemap.xml and one HTML file per public page (real hosting only).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME, JSON_LD, NOINDEX, OG_IMAGE, PAGES, SITE } from './pages.mjs'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function head(p) {
  const url = SITE + (p.canonical ?? p.path).replace(/\/$/, '') || SITE
  const canon = p.path === '/' ? `${SITE}/` : url
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${canon}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Luda" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${canon}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ].join('\n    ')
}

/** Readable text inside #root for crawlers; React replaces it as soon as the app starts. */
function body(p) {
  const links = [HOME, ...PAGES.filter((x) => !x.canonical)].map((x) => `<a href="${x.path}">${esc(x === HOME ? 'Home' : x.h1)}</a>`).join(' · ')
  const paras = (p.body ?? [p.description]).map((t) => `<p>${esc(t)}</p>`).join('')
  return `<main style="max-width:640px;margin:0 auto;padding:24px;font-family:sans-serif;color:#e2e8f0"><h1>${esc(p.h1)}</h1>${paras}<nav>${links}</nav><p>© Luda Digital Systems Limited · support@useluda.com</p></main>`
}

export function render(template, p) {
  const ld = `<script type="application/ld+json">${JSON.stringify(JSON_LD)}</script>`
  return template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', `    ${head(p)}\n    ${ld}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body(p)}</div>`)
}

export default function seo() {
  let outDir = 'dist'
  let skip = false
  return {
    name: 'luda-seo',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; skip = c.mode === 'embed' },
    closeBundle() {
      if (skip) return
      const file = join(outDir, 'index.html')
      const template = readFileSync(file, 'utf8')
      writeFileSync(file, render(template, HOME))
      for (const p of PAGES) {
        // Cloudflare Pages serves /about from about.html (no trailing-slash redirect, so app routes still match).
        writeFileSync(join(outDir, `${p.path.slice(1)}.html`), render(template, p))
      }
      const today = new Date().toISOString().slice(0, 10)
      const urls = [HOME, ...PAGES.filter((x) => !x.canonical)]
      writeFileSync(join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u.path === '/' ? '/' : u.path}</loc><lastmod>${today}</lastmod><changefreq>${u.path === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${u.path === '/' ? '1.0' : '0.6'}</priority></url>`).join('\n')}\n</urlset>\n`)
      writeFileSync(join(outDir, 'robots.txt'), `# Luda – useluda.com\nUser-agent: *\nAllow: /\n${NOINDEX.map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${SITE}/sitemap.xml\n`)
    },
  }
}
