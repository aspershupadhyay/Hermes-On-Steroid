/**
 * webview-preload.js — runs before ANY page JS in persist:ai-browser
 * 1. Masks all Electron/webview fingerprints (Google/Microsoft detection)
 * 2. Stubs WebAuthn on Microsoft login
 * 3. Intercepts OAuth navigations and routes them to a real BrowserWindow
 */
;(function () {
  const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  // ── Mask navigator ─────────────────────────────────────────────────────────
  const navOverrides = {
    userAgent:           () => CHROME_UA,
    appVersion:          () => '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    vendor:              () => 'Google Inc.',
    platform:            () => 'MacIntel',
    webdriver:           () => false,
    language:            () => 'en-US',
    languages:           () => ['en-US', 'en'],
    hardwareConcurrency: () => 8,
    maxTouchPoints:      () => 0,
  }
  for (const [k, get] of Object.entries(navOverrides)) {
    try { Object.defineProperty(navigator, k, { get, configurable: true }) } catch (_) {}
  }

  // Fake plugins (Google checks plugins.length > 0)
  try {
    const fakePlugin = { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 0 }
    Object.defineProperty(navigator, 'plugins', {
      get: () => Object.assign([fakePlugin], { item: () => fakePlugin, namedItem: () => fakePlugin, refresh: () => {} }),
      configurable: true,
    })
  } catch (_) {}

  // Fix outerWidth/Height (webviews report 0)
  try {
    if (window.outerWidth  === 0) Object.defineProperty(window, 'outerWidth',  { get: () => window.innerWidth,  configurable: true })
    if (window.outerHeight === 0) Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight, configurable: true })
  } catch (_) {}

  // Add window.chrome (Google checks chrome.runtime exists)
  try {
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        value: { runtime: { connect: ()=>{}, sendMessage: ()=>{}, onMessage: { addListener:()=>{}, removeListener:()=>{} } }, loadTimes: ()=>({}), csi: ()=>({}) },
        configurable: true, writable: true,
      })
    }
  } catch (_) {}

  // Hide window.process (Electron exposes Node.js process)
  try { Object.defineProperty(window, 'process', { get: () => undefined, configurable: true }) } catch (_) {}

  // ── WebAuthn stub (Microsoft login) ────────────────────────────────────────
  const host = location.hostname
  if (host === 'login.microsoft.com' || host === 'login.microsoftonline.com' || host === 'login.live.com') {
    try {
      Object.defineProperty(navigator, 'credentials', {
        value: {
          get:                 () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
          create:              () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
          preventSilentAccess: () => Promise.resolve(),
          store:               () => Promise.resolve(),
        },
        configurable: true,
      })
    } catch (_) {}
  }

  // ── OAuth navigation interceptor ───────────────────────────────────────────
  // We can't do IPC from a webview preload — instead we use a custom event
  // that the renderer's executeJavaScript polling will pick up, OR we
  // override window.location assignment and link clicks to post a message.

  const AUTH_HOSTNAMES = new Set([
    'accounts.google.com',
    'login.microsoftonline.com',
    'login.microsoft.com',
    'login.live.com',
    'appleid.apple.com',
  ])

  function isAuthHref(href) {
    try { return AUTH_HOSTNAMES.has(new URL(href).hostname) } catch { return false }
  }

  // Store intercepted auth URL so renderer can poll for it
  window.__eliteAuthUrl = null

  // Only intercept clicks on actual <a> tags pointing to auth domains.
  // Never touch buttons, form submits, or SPA navigation — that breaks
  // ChatGPT, Claude, and every other SPA that uses JS-driven routing.
  document.addEventListener('click', function (e) {
    const anchor = e.target && e.target.closest('a[href]')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (href && isAuthHref(href)) {
      e.preventDefault()
      e.stopImmediatePropagation()
      window.__eliteAuthUrl = href
    }
  }, true)

  // Override location.assign only — catch explicit JS redirects to auth domains.
  // Do NOT touch location.href, history, pushState, or any other navigation.
  try {
    const origAssign = location.assign.bind(location)
    window.location.assign = function(url) {
      if (isAuthHref(url)) { window.__eliteAuthUrl = url; return }
      origAssign(url)
    }
  } catch (_) {}
})()
