// Screen-wide translation layer. Most screens are written in English; this swaps every English text it knows
// (from src/i18n/<lang>.json, keyed by the exact English text) for the chosen language, including text that React
// adds or changes later. Entries with {} are patterns: "Hold to pay {}" also matches "Hold to pay ₺490".
// Anything inside [translate="no"] or .notranslate (people's names, chat messages, references) is left alone.
// To cover a new screen: run scripts/extract-i18n.mjs on it, translate the new lines, add them to the JSON files.
import type { Lang } from './data'
import { DICTS } from './i18n'

type Dict = Record<string, string>
const LOADERS: Partial<Record<Lang, () => Promise<{ default: Dict }>>> = {
  fr: () => import('../i18n/fr.json'),
  tr: () => import('../i18n/tr.json'),
  sw: () => import('../i18n/sw.json'),
  ar: () => import('../i18n/ar.json'),
}
const ATTRS = ['placeholder', 'title', 'aria-label']
const SKIP = '[translate="no"], .notranslate, .selectable, script, style, textarea, code'

let current: Lang = 'en'
/** Texts already translated by t() (e.g. the French menu word "Change"): never translate them again. */
let native = new Set<string>()
let exact = new Map<string, string>()
let patterns: [RegExp, string][] = []
const cache: Partial<Record<Lang, [Map<string, string>, [RegExp, string][]]>> = {}
const textOrig = new WeakMap<Text, string>(), textShown = new WeakMap<Text, string>()
const attrOrig = new WeakMap<Element, Record<string, string>>(), attrShown = new WeakMap<Element, Record<string, string>>()
let observer: MutationObserver | null = null

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&')

function compile(d: Dict): [Map<string, string>, [RegExp, string][]] {
  const ex = new Map<string, string>(), pats: [RegExp, string][] = []
  for (const [k, v] of Object.entries(d)) {
    if (k.includes('{}')) pats.push([new RegExp('^' + k.split('{}').map(esc).join('([\\s\\S]+?)') + '$'), v])
    else ex.set(k, v)
  }
  pats.sort((a, b) => b[0].source.length - a[0].source.length) // most specific first
  return [ex, pats]
}

/** The text in the current language (or unchanged if unknown / English). */
export function tx(src: string): string {
  if (current === 'en' || !src) return src
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(src)!
  const key = norm(m[2])
  if (!key || !/[A-Za-z]/.test(key) || native.has(key)) return src
  let hit = exact.get(key)
  if (hit === undefined) {
    for (const [re, v] of patterns) { const r = re.exec(key); if (r) { let i = 1; hit = v.replace(/\{(\d?)\}/g, (_, n: string) => (n ? r[Number(n)] : r[i++]) ?? '') /* {1} {2}: languages that swap word order */; break } }
  }
  return hit === undefined ? src : m[1] + hit + m[3]
}

function doText(n: Text) {
  const cur = n.nodeValue ?? ''
  if (textShown.get(n) !== cur) textOrig.set(n, cur) // new text from React (or first visit)
  if (n.parentElement?.closest(SKIP)) return
  const out = tx(textOrig.get(n) ?? cur)
  textShown.set(n, out)
  if (out !== cur) n.nodeValue = out
}

function doAttr(el: Element, name: string) {
  const cur = el.getAttribute(name)
  if (cur == null) return
  const o = attrOrig.get(el) ?? {}, s = attrShown.get(el) ?? {}
  if (s[name] !== cur) o[name] = cur
  attrOrig.set(el, o)
  if (el.closest(SKIP)) return
  const out = tx(o[name])
  s[name] = out; attrShown.set(el, s)
  if (out !== cur) el.setAttribute(name, out)
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text)
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return
  const el = root as Element
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) doText(n as Text)
  const sel = ATTRS.map((a) => `[${a}]`).join(',')
  if (el.matches?.(sel)) ATTRS.forEach((a) => doAttr(el, a))
  el.querySelectorAll?.(sel).forEach((e) => ATTRS.forEach((a) => doAttr(e, a)))
}

function observe() {
  if (observer || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text)
      else if (m.type === 'attributes' && m.attributeName) doAttr(m.target as Element, m.attributeName)
      else m.addedNodes.forEach(walk)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}

/** Switch the whole screen to `lang` (English restores the original text). */
export async function setScreenLanguage(lang: Lang) {
  if (lang !== 'en' && LOADERS[lang] && !cache[lang]) {
    try { cache[lang] = compile((await LOADERS[lang]!()).default) } catch { return }
  }
  const c = cache[lang]
  current = c ? lang : 'en'
  ;[exact, patterns] = c ?? [new Map(), []]
  native = new Set(current === 'en' ? [] : Object.values(DICTS[current] ?? {}).map(norm))
  observe()
  walk(document.body)
}
