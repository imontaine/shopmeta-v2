// src/components/dev/StyleTesterPage.tsx
// Stylesheet Conformity Tester
//
// Tests that config pages (settings, mcp-servers, agents, skills) conform to
// the canonical ShopMeta design system. Runs checks in the browser DOM against
// the live rendered pages (via iframes) or against known CSS class inventories.
//
// Three testing modes:
//   1. CSS Variable Coverage — all mcp-* / conn-* / settings-* classes use
//      var(--token) instead of hardcoded colour/size values.
//   2. Structural Conformance — config pages use the canonical settings-page
//      → settings-header → settings-layout → settings-tabs + settings-content
//      hierarchy.
//   3. Visual Iframe Snapshot — renders each page in an iframe and overlays a
//      comparison checklist the user can sign off on.

import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckResult {
  id: string
  label: string
  status: 'pass' | 'fail' | 'warn' | 'pending' | 'skip'
  detail?: string
}

interface PageSpec {
  id: string
  name: string
  path: string
  /** CSS classes that MUST exist in the page's DOM */
  requiredClasses: string[]
  /** CSS classes that are FORBIDDEN (old non-conformant prefixes) */
  forbiddenClasses: string[]
}

// ─── Config — define each config page and its conformance requirements ─────────

const CONFIG_PAGES: PageSpec[] = [
  {
    id: 'data-sources',
    name: 'Data Sources',
    path: '/data-sources',
    requiredClasses: [
      'settings-page',
      'settings-header',
      'settings-title',
      'settings-subtitle',
      'settings-layout',
      'settings-tabs',
      'settings-content',
      'conn-settings',
      'conn-section-header',
      'conn-section-title',
      'conn-btn',
      'conn-btn--primary',
    ],
    forbiddenClasses: [],
  },
  {
    id: 'settings',
    name: 'Settings',
    path: '/settings',
    requiredClasses: [
      'settings-page',
      'settings-header',
      'settings-title',
      'settings-subtitle',
      'settings-layout',
      'settings-tabs',
      'settings-content',
    ],
    forbiddenClasses: [],
  },
  {
    id: 'mcp-servers',
    name: 'MCP Servers',
    path: '/mcp-servers',
    requiredClasses: [
      'settings-page',
      'settings-header',
      'settings-title',
      'settings-subtitle',
      'settings-layout',
      'settings-tabs',
      'settings-content',
      'conn-settings',
      'conn-section-header',
      'conn-section-title',
      'conn-btn',
      'conn-btn--primary',
    ],
    forbiddenClasses: [
      // Old bespoke classes that should no longer appear
      'mcp-page',
      'mcp-page-header',
      'mcp-page-title',
      'mcp-btn',
      'mcp-btn--primary',
      'mcp-form-wrapper',
      'mcp-grid',
      'mcp-card',
    ],
  },
  {
    id: 'agents',
    name: 'Agents',
    path: '/agents',
    requiredClasses: [],
    forbiddenClasses: [],
  },
  {
    id: 'skills',
    name: 'Skills',
    path: '/skills',
    requiredClasses: [],
    forbiddenClasses: [],
  },
]

// ─── CSS Variable Rules — defines which properties must use var() in which selectors

interface CssVarRule {
  id: string
  description: string
  // Pattern to match rule selector prefixes
  selectorPattern: RegExp
  // CSS property names that must use var() rather than hardcoded values
  properties: string[]
  // Properties that are EXEMPT from var() requirement (e.g., rgba alphas used inline)
  exempt?: string[]
}

const CSS_VAR_RULES: CssVarRule[] = [
  {
    id: 'settings-tokens',
    description: 'settings-* classes must use design tokens for color/typography',
    selectorPattern: /^\.settings-/,
    properties: ['color', 'background', 'background-color', 'border-color', 'font-size'],
    exempt: ['border-radius'],
  },
  {
    id: 'conn-tokens',
    description: 'conn-* classes must use design tokens for color/typography',
    selectorPattern: /^\.conn-/,
    properties: ['color', 'background', 'background-color', 'font-size'],
    exempt: [],
  },
  {
    id: 'mcp-supplement-tokens',
    description: 'mcp-* supplement classes must use design tokens (not hardcoded hex)',
    selectorPattern: /^\.mcp-(?!card-url|card-prefix)/,
    properties: ['color', 'font-size'],
    exempt: [],
  },
]

// ─── Stylesheet CSS Extractor ─────────────────────────────────────────────────

interface CssRule {
  selector: string
  property: string
  value: string
}

function extractCssRules(): CssRule[] {
  const rules: CssRule[] = []
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules ?? [])) {
          if (rule instanceof CSSStyleRule) {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style.item(i)
              const val = rule.style.getPropertyValue(prop).trim()
              rules.push({ selector: rule.selectorText, property: prop, value: val })
            }
          }
        }
      } catch {
        // Cross-origin sheet — skip
      }
    }
  } catch {
    // Ignore
  }
  return rules
}

// Hardcoded hex/rgb value patterns that should NOT appear in design-system classes
const HARDCODED_COLOR_RE = /^(#[0-9a-f]{3,8}|rgb\(|rgba\((?!0,\s*0,\s*0)|hsl\()/i

function runCssVarChecks(rules: CssRule[]): CheckResult[] {
  const results: CheckResult[] = []

  for (const varRule of CSS_VAR_RULES) {
    const violations: string[] = []
    const matching = rules.filter((r) =>
      r.selector.split(',').some((s) => varRule.selectorPattern.test(s.trim())),
    )

    for (const cssRule of matching) {
      if (!varRule.properties.includes(cssRule.property)) continue
      if (varRule.exempt?.includes(cssRule.property)) continue
      if (cssRule.value.startsWith('var(')) continue
      if (cssRule.value === 'transparent' || cssRule.value === 'inherit' || cssRule.value === 'currentColor') continue
      // Allow known semantic exception: rgba with pure black/white for subtle tints
      if (/^rgba\(\s*(0|255)\s*,\s*(0|255)\s*,\s*(0|255)\s*,/.test(cssRule.value)) continue
      // Allow known accent rgba tints (they're derived from var values)
      if (/^rgba\((16|239|251|167|96|52|248)\s*,/.test(cssRule.value)) continue
      if (HARDCODED_COLOR_RE.test(cssRule.value)) {
        violations.push(`${cssRule.selector} { ${cssRule.property}: ${cssRule.value} }`)
      }
    }

    results.push({
      id: `css-var-${varRule.id}`,
      label: varRule.description,
      status: violations.length === 0 ? 'pass' : 'warn',
      detail: violations.length > 0
        ? `${violations.length} rule(s) use hardcoded values:\n${violations.slice(0, 5).join('\n')}${violations.length > 5 ? `\n… and ${violations.length - 5} more` : ''}`
        : `All ${matching.length} matched rules use CSS variables`,
    })
  }

  return results
}

// ─── Iframe DOM Conformance Check ──────────────────────────────────────────────

function IframeChecker({
  page,
  onResult,
}: {
  page: PageSpec
  onResult: (results: CheckResult[]) => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  const runChecks = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return

    const doc = iframe.contentDocument
    const results: CheckResult[] = []

    // Required class checks
    for (const cls of page.requiredClasses) {
      const found = doc.querySelector(`.${cls}`) !== null
      results.push({
        id: `required-${page.id}-${cls}`,
        label: `.${cls}`,
        status: found ? 'pass' : 'fail',
        detail: found ? `Found in DOM` : `Element with class "${cls}" not found`,
      })
    }

    // Forbidden class checks
    for (const cls of page.forbiddenClasses) {
      const found = doc.querySelector(`.${cls}`) !== null
      results.push({
        id: `forbidden-${page.id}-${cls}`,
        label: `.${cls} (must NOT exist)`,
        status: found ? 'fail' : 'pass',
        detail: found
          ? `Non-conformant class "${cls}" still present in DOM`
          : `Correctly absent`,
      })
    }

    onResult(results)
    setStatus('loaded')
  }

  return (
    <div className="st-iframe-wrap">
      <iframe
        ref={iframeRef}
        src={page.path}
        title={`${page.name} preview`}
        className="st-iframe"
        onLoad={runChecks}
        onError={() => setStatus('error')}
        sandbox="allow-same-origin allow-scripts allow-forms"
        data-testid={`st-iframe-${page.id}`}
      />
      {status === 'loading' && (
        <div className="st-iframe-overlay">
          <span className="conn-spinner conn-spinner--sm" />
          Loading {page.name}…
        </div>
      )}
      {status === 'error' && (
        <div className="st-iframe-overlay st-iframe-overlay--error">
          Failed to load {page.name}
        </div>
      )}
    </div>
  )
}

// ─── Result Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CheckResult['status'] }) {
  const labels: Record<CheckResult['status'], string> = {
    pass: 'Pass',
    fail: 'Fail',
    warn: 'Warn',
    pending: 'Pending',
    skip: 'Skip',
  }
  return (
    <span className={`st-badge st-badge--${status}`} aria-label={labels[status]}>
      {labels[status]}
    </span>
  )
}

// ─── Check Results Table ───────────────────────────────────────────────────────

function ResultsTable({ results, title }: { results: CheckResult[]; title: string }) {
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const warned = results.filter((r) => r.status === 'warn').length
  const total = results.length

  return (
    <div className="st-results-block">
      <div className="st-results-header">
        <h3 className="st-results-title">{title}</h3>
        <div className="st-results-summary">
          <span className="st-summary-item st-summary-item--pass">{passed} passed</span>
          {warned > 0 && <span className="st-summary-item st-summary-item--warn">{warned} warned</span>}
          {failed > 0 && <span className="st-summary-item st-summary-item--fail">{failed} failed</span>}
          <span className="st-summary-item">{total} total</span>
        </div>
      </div>
      <div className="st-results-list">
        {results.map((r) => (
          <details key={r.id} className={`st-result st-result--${r.status}`} open={r.status === 'fail'}>
            <summary className="st-result-summary">
              <StatusBadge status={r.status} />
              <span className="st-result-label">{r.label}</span>
            </summary>
            {r.detail && (
              <pre className="st-result-detail">{r.detail}</pre>
            )}
          </details>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

type TestTab = 'css-vars' | 'dom' | 'visual'

export function StyleTesterPage() {
  const [activeTab, setActiveTab] = useState<TestTab>('css-vars')
  const [selectedPage, setSelectedPage] = useState<string>('mcp-servers')
  const [cssVarResults, setCssVarResults] = useState<CheckResult[]>([])
  const [domResults, setDomResults] = useState<Record<string, CheckResult[]>>({})
  const [cssRunAt, setCssRunAt] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  const selectedPageSpec = CONFIG_PAGES.find((p) => p.id === selectedPage)!

  const runCssVarTests = () => {
    setIsRunning(true)
    try {
      const rules = extractCssRules()
      const results = runCssVarChecks(rules)
      setCssVarResults(results)
      setCssRunAt(new Date().toLocaleTimeString())
    } finally {
      setIsRunning(false)
    }
  }

  // Auto-run CSS var tests on mount
  useEffect(() => {
    runCssVarTests()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDomResults = (pageId: string, results: CheckResult[]) => {
    setDomResults((prev) => ({ ...prev, [pageId]: results }))
  }

  const allDomResults = Object.values(domResults).flat()
  const overallStatus = (() => {
    const all = [...cssVarResults, ...allDomResults]
    if (all.some((r) => r.status === 'fail')) return 'fail'
    if (all.some((r) => r.status === 'warn')) return 'warn'
    if (all.length === 0) return 'pending'
    return 'pass'
  })()

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Stylesheet Conformity Tester</h1>
        <p className="settings-subtitle">
          Verifies that config pages (Settings, MCP Servers, Agents, Skills) follow the canonical ShopMeta design system.
          Catches CSS drift, hardcoded values, and structural non-conformance.
        </p>
      </div>

      <div className="settings-layout">
        {/* Tabs sidebar */}
        <nav className="settings-tabs" aria-label="Tester sections">
          <button
            className={`settings-tab ${activeTab === 'css-vars' ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab('css-vars')}
            id="st-tab-css"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
            CSS Variables
          </button>
          <button
            className={`settings-tab ${activeTab === 'dom' ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab('dom')}
            id="st-tab-dom"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            DOM Structure
          </button>
          <button
            className={`settings-tab ${activeTab === 'visual' ? 'settings-tab--active' : ''}`}
            onClick={() => setActiveTab('visual')}
            id="st-tab-visual"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            Visual Preview
          </button>

          {/* Overall status pill */}
          <div className="st-overall" data-testid="st-overall-status">
            <span>Overall</span>
            <StatusBadge status={overallStatus} />
          </div>
        </nav>

        {/* Content */}
        <div className="settings-content">
          <div className="conn-settings">

            {/* ── CSS Variables Tab ─────────────────────────────────────────── */}
            {activeTab === 'css-vars' && (
              <div>
                <div className="conn-section-header">
                  <div>
                    <h2 className="conn-section-title">CSS Variable Coverage</h2>
                    <p className="conn-section-desc">
                      Checks that design-system class selectors use <code>var(--token)</code> for color and typography
                      properties instead of hardcoded hex/rgb values.
                      {cssRunAt && <span className="st-run-at"> Last run: {cssRunAt}</span>}
                    </p>
                  </div>
                  <button
                    className="conn-btn conn-btn--primary"
                    onClick={runCssVarTests}
                    disabled={isRunning}
                    id="st-run-css-btn"
                    data-testid="st-run-css"
                  >
                    {isRunning ? <span className="conn-spinner" /> : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    )}
                    Run Checks
                  </button>
                </div>

                {cssVarResults.length === 0 ? (
                  <div className="conn-loading">
                    <div className="conn-loading-dots"><span /><span /><span /></div>
                    <span>Running CSS checks…</span>
                  </div>
                ) : (
                  <ResultsTable results={cssVarResults} title="CSS Variable Rules" />
                )}

                <div className="st-info-box">
                  <h3 className="st-info-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Allowed Exceptions
                  </h3>
                  <ul className="st-info-list">
                    <li><code>transparent</code>, <code>inherit</code>, <code>currentColor</code></li>
                    <li>Pure black/white rgba tints: <code>rgba(0,0,0,α)</code> / <code>rgba(255,255,255,α)</code></li>
                    <li>Semantic accent tints for success/error/warning states (rgba with known RGB triples)</li>
                    <li>Monospace font-family strings</li>
                  </ul>
                </div>
              </div>
            )}

            {/* ── DOM Structure Tab ─────────────────────────────────────────── */}
            {activeTab === 'dom' && (
              <div>
                <div className="conn-section-header">
                  <div>
                    <h2 className="conn-section-title">DOM Structure Conformance</h2>
                    <p className="conn-section-desc">
                      Renders each config page in a sandboxed iframe and checks for required/forbidden CSS classes.
                      Pages must use the canonical <code>settings-page</code> → <code>settings-layout</code> hierarchy.
                    </p>
                  </div>
                  <button
                    className="conn-btn conn-btn--primary"
                    onClick={() => setIframeKey((k) => k + 1)}
                    id="st-refresh-iframes-btn"
                    data-testid="st-refresh-iframes"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Reload
                  </button>
                </div>

                {/* Page selector */}
                <div className="st-page-selector">
                  {CONFIG_PAGES.map((p) => {
                    const res = domResults[p.id] ?? []
                    const failed = res.filter((r) => r.status === 'fail').length
                    return (
                      <button
                        key={p.id}
                        className={`st-page-tab${selectedPage === p.id ? ' st-page-tab--active' : ''}`}
                        onClick={() => setSelectedPage(p.id)}
                        data-testid={`st-page-tab-${p.id}`}
                      >
                        {p.name}
                        {res.length > 0 && (
                          <span className={`st-page-pill ${failed > 0 ? 'st-page-pill--fail' : 'st-page-pill--pass'}`}>
                            {failed > 0 ? `${failed} fail` : 'ok'}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Hidden iframes for all pages — run in background */}
                <div style={{ display: 'none' }}>
                  {CONFIG_PAGES.map((p) => (
                    <IframeChecker
                      key={`${p.id}-${iframeKey}`}
                      page={p}
                      onResult={(results) => handleDomResults(p.id, results)}
                    />
                  ))}
                </div>

                {/* Results for selected page */}
                {domResults[selectedPage] ? (
                  <ResultsTable
                    results={domResults[selectedPage]}
                    title={`${selectedPageSpec.name} — DOM Classes`}
                  />
                ) : (
                  <div className="conn-loading">
                    <div className="conn-loading-dots"><span /><span /><span /></div>
                    <span>Loading {selectedPageSpec.name} in iframe…</span>
                  </div>
                )}

                {selectedPageSpec.requiredClasses.length === 0 &&
                  selectedPageSpec.forbiddenClasses.length === 0 && (
                  <div className="conn-error-banner" style={{ marginTop: 16 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    No conformance rules defined for this page yet. Add <code>requiredClasses</code> and <code>forbiddenClasses</code> to its <code>PageSpec</code> in <code>StyleTesterPage.tsx</code>.
                  </div>
                )}
              </div>
            )}

            {/* ── Visual Preview Tab ────────────────────────────────────────── */}
            {activeTab === 'visual' && (
              <div>
                <div className="conn-section-header">
                  <div>
                    <h2 className="conn-section-title">Visual Preview</h2>
                    <p className="conn-section-desc">
                      Side-by-side comparison of the canonical reference (<strong>/data-sources</strong>) and each config page.
                      Use this to spot visual drift that automated checks cannot catch.
                    </p>
                  </div>
                </div>

                <div className="st-visual-grid">
                  {CONFIG_PAGES.map((p) => (
                    <div key={p.id} className="st-visual-col">
                      <div className="st-visual-label">
                        <a href={p.path} target="_blank" rel="noreferrer" className="agent-link">
                          {p.name} ↗
                        </a>
                      </div>
                      <IframeChecker
                        key={`visual-${p.id}-${iframeKey}`}
                        page={p}
                        onResult={(results) => handleDomResults(p.id, results)}
                      />
                    </div>
                  ))}
                </div>

                {/* Visual checklist — manual sign-off */}
                <div className="st-checklist">
                  <h3 className="conn-section-title" style={{ marginBottom: 12 }}>Visual Conformance Checklist</h3>
                  <p className="conn-section-desc" style={{ marginBottom: 16 }}>
                    Manually verify these visual attributes match between /data-sources and all config pages:
                  </p>
                  {[
                    'Page title font-size, weight, and letter-spacing match',
                    'Subtitle text colour is identical (--text-secondary)',
                    'Settings layout uses left sidebar with tab buttons',
                    'Section title (h2) is conn-section-title style',
                    'Primary button uses conn-btn--primary (accent bg, white text)',
                    'Form wrapper uses conn-form-wrapper (subtle bg, border, 12px radius)',
                    'Inputs use conn-input (surface bg, border, focus ring with var(--accent))',
                    'Labels use conn-label (xs font-size, text-secondary)',
                    'Cards use conn-card (subtle bg, border, 12px radius, hover border lift)',
                    'Card action buttons use conn-card-btn (28px, transparent border, icon only)',
                    'Empty state uses conn-empty (centered, icon box, title, desc)',
                    'Toast uses conn-toast (fixed bottom-right, backdrop blur)',
                    'No hardcoded #hex colours visible (use DevTools to verify)',
                    'All spacing follows 4/8/12/16/24/32px rhythm',
                  ].map((item) => (
                    <label key={item} className="st-check-item">
                      <input type="checkbox" className="conn-checkbox" data-testid={`st-check-${item.slice(0, 20)}`} />
                      <span className="conn-checkbox-label" style={{ display: 'inline' }}>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
