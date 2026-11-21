// Lists the English UI texts in the given source files (JSX text, UI string literals, template literals as patterns).
// Usage: node scripts/extract-i18n.mjs src/screens/Home.tsx ... > out.json
import { createRequire } from 'node:module'
// Needs the TypeScript JS API (TS 7 has none): set TS_JS=/path/to/typescript (v5/6) if the app's own is v7.
const ts = createRequire(import.meta.url)(process.env.TS_JS || 'typescript')
import { readFileSync } from 'node:fs'
const SKIP_ATTR = new Set(['className', 'key', 'to', 'href', 'src', 'type', 'id', 'name', 'inputMode', 'accept', 'capture', 'autoComplete', 'role', 'rel', 'target', 'layoutId', 'value', 'lang', 'dir', 'method', 'mode', 'variant', 'kind'])
const isClassy = (s) => { const t = s.trim().split(/\s+/); return t.every((x) => /^[a-z0-9:\[\]\/.%#!()_,=&>+-]+$/.test(x)) && t.some((x) => /[-:]/.test(x)) }
const texty = (s) => /[A-Za-z]{2,}/.test(s) && !/^[a-z0-9_.:/?=&-]+$/.test(s.trim()) && !isClassy(s) && !/^(GET|POST)$/.test(s) && !/^https?:/.test(s.trim()) && !/^[A-Z_]+$/.test(s.trim())
const out = new Set()
for (const f of process.argv.slice(2)) {
  const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return
    if (ts.isJsxText(n)) { const t = n.text.replace(/\s+/g, ' ').trim(); if (texty(t)) out.add(t) }
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent
      const attr = ts.isJsxAttribute(p) ? p.name.getText() : ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) ? p.parent.name.getText() : null
      const call = ts.isCallExpression(p) ? p.expression.getText() : ''
      const inCmp = ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText())
      const isKey = ts.isPropertyAssignment(p) && p.name === n
      const isIndex = ts.isElementAccessExpression(p)
      if (!(attr && SKIP_ATTR.has(attr)) && !/^(api|t|localStorage\.\w+|sessionStorage\.\w+|nav|navigate|setItem|getItem|querySelector|addEventListener|fetch|require|import|includes|startsWith|endsWith|split|replace|toLocaleString|toLocaleDateString|Intl\.\w+|new Date|JSON\.\w+|console\.\w+|setTab|setStage|setMode|setDir)$/.test(call) && !inCmp && !isKey && !isIndex && !ts.isCaseClause(p) && !ts.isTypeLiteralNode(p) && !ts.isLiteralTypeNode(p)) {
        const t = n.text.replace(/\s+/g, ' ').trim(); if (texty(t) && (t.includes(' ') || /^[A-Z]/.test(t))) out.add(t)
      }
    } else if (ts.isTemplateExpression(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)]
      const pat = parts.join('{}').replace(/\s+/g, ' ').trim()
      const words = parts.join(' ')
      const p = n.parent, attr = ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) ? p.parent.name.getText() : null
      if (!(attr && SKIP_ATTR.has(attr)) && /[A-Za-z]{3,}/.test(words) && !isClassy(words) && !/^[\/?]|^https?:|^\{\}$/.test(pat) && /\s/.test(words.trim())) out.add(pat)
    }
    ts.forEachChild(n, visit)
  }
  visit(src)
}
console.log(JSON.stringify([...out].sort(), null, 0))
