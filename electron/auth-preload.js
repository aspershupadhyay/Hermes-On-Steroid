/**
 * auth-preload.js — injected into the auth BrowserWindow BEFORE any page JS.
 *
 * NOTE: sandbox:true is NOT set on the auth window because Electron silently
 * skips preload scripts when sandbox is enabled. We omit sandbox and instead
 * patch every fingerprint Google/Microsoft check for here.
 *
 * Fixes:
 *  1. Google "This browser is not secure" → window.process, webdriver, chrome, plugins, permissions
 *  2. Microsoft passkey/WebAuthn screen  → navigator.credentials stubbed to reject FIDO2,
 *     then auto-clicks "Use password" / "Sign in another way" link after page loads
 */
;(function () {
  'use strict'

  const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  // ─── 1. Kill Node.js / Electron globals immediately ───────────────────────
  // These are the first things Google's DisallowedBrowsersCheck tests.
  const killGlobals = ['process', 'require', 'module', '__dirname', '__filename', 'global']
  for (const g of killGlobals) {
    try {
      Object.defineProperty(window, g, { get: () => undefined, configurable: true, enumerable: false })
    } catch (_) {}
  }

  // ─── 2. navigator overrides ───────────────────────────────────────────────
  const navProps = {
    userAgent:           () => CHROME_UA,
    appVersion:          () => CHROME_UA.replace('Mozilla/', ''),
    vendor:              () => 'Google Inc.',
    platform:            () => 'MacIntel',
    webdriver:           () => false,
    language:            () => 'en-US',
    languages:           () => Object.freeze(['en-US', 'en']),
    hardwareConcurrency: () => 8,
    deviceMemory:        () => 8,
    maxTouchPoints:      () => 0,
    appName:             () => 'Netscape',
    appCodeName:         () => 'Mozilla',
    product:             () => 'Gecko',
    productSub:          () => '20030107',
    oscpu:               () => undefined,
    buildID:             () => undefined,
    doNotTrack:          () => null,
  }
  for (const [key, get] of Object.entries(navProps)) {
    try { Object.defineProperty(navigator, key, { get, configurable: true, enumerable: true }) } catch (_) {}
  }

  // ─── 3. navigator.plugins — Chrome has 3 built-in plugins ────────────────
  try {
    const makePlugin = (name, filename, desc, types) => {
      const plugin = { name, filename, description: desc, length: types.length }
      types.forEach((t, i) => { plugin[i] = t })
      return plugin
    }
    const p0 = makePlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    ])
    const p1 = makePlugin('Chrome PDF Viewer', 'internal-pdf-viewer', '', [
      { type: 'application/pdf', suffixes: 'pdf', description: '' },
    ])
    const p2 = makePlugin('Chromium PDF Viewer', 'internal-pdf-viewer', '', [
      { type: 'application/pdf', suffixes: 'pdf', description: '' },
    ])
    const p3 = makePlugin('Microsoft Edge PDF Viewer', 'internal-pdf-viewer', '', [
      { type: 'application/pdf', suffixes: 'pdf', description: '' },
    ])
    const p4 = makePlugin('WebKit built-in PDF', 'internal-pdf-viewer', '', [
      { type: 'application/pdf', suffixes: 'pdf', description: '' },
    ])
    const arr = [p0, p1, p2, p3, p4]
    arr.item = (i) => arr[i] ?? null
    arr.namedItem = (n) => arr.find(p => p.name === n) ?? null
    arr.refresh = () => {}
    Object.defineProperty(navigator, 'plugins', { get: () => arr, configurable: true })
  } catch (_) {}

  // ─── 4. navigator.mimeTypes ───────────────────────────────────────────────
  try {
    const mimes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null },
      { type: 'text/pdf',        suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null },
    ]
    mimes.item = (i) => mimes[i] ?? null
    mimes.namedItem = (n) => mimes.find(m => m.type === n) ?? null
    Object.defineProperty(navigator, 'mimeTypes', { get: () => mimes, configurable: true })
  } catch (_) {}

  // ─── 5. window.chrome ─────────────────────────────────────────────────────
  try {
    if (!window.chrome || !window.chrome.runtime) {
      const chrome = {
        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
        runtime: {
          id: undefined,
          connect: () => ({ disconnect: () => {}, onDisconnect: { addListener: () => {} }, onMessage: { addListener: () => {} }, postMessage: () => {} }),
          sendMessage: () => {},
          onMessage: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
          onConnect: { addListener: () => {}, removeListener: () => {} },
          getManifest: () => ({}),
          getURL: (p) => p,
          reload: () => {},
          requestUpdateCheck: () => {},
          ContextType: {},
          MessageSender: {},
          PlatformArch: {},
          PlatformOs: {},
          RequestUpdateCheckStatus: {},
        },
        loadTimes: () => ({ requestTime: Date.now() / 1000, startLoadTime: Date.now() / 1000, commitLoadTime: Date.now() / 1000, finishDocumentLoadTime: 0, finishLoadTime: 0, firstPaintTime: 0, firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: false, wasNpnNegotiated: false, npnNegotiatedProtocol: 'unknown', wasAlternateProtocolAvailable: false, connectionInfo: 'http/1.1' }),
        csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: 0, tran: 15 }),
      }
      Object.defineProperty(window, 'chrome', { value: chrome, configurable: true, writable: true, enumerable: true })
    }
  } catch (_) {}

  // ─── 6. Permissions API — notifications must return "prompt" not "denied" ─
  try {
    const origQuery = navigator.permissions?.query
    if (origQuery) {
      const patchedQuery = function (descriptor) {
        if (descriptor?.name === 'notifications') {
          return Promise.resolve({ state: 'prompt', onchange: null, addEventListener: () => {}, removeEventListener: () => {} })
        }
        return origQuery.call(navigator.permissions, descriptor)
      }
      Object.defineProperty(navigator.permissions, 'query', { value: patchedQuery, configurable: true, writable: true })
    }
  } catch (_) {}

  // ─── 7. WebAuthn / FIDO2 stub — forces Microsoft to show password flow ────
  // Electron's BrowserWindow supports WebAuthn but can't complete it (no OS
  // integration for CTAP2). Stub navigator.credentials to immediately reject
  // so Microsoft falls back to password authentication.
  try {
    const credentialsStub = {
      get:                 (opts) => Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')),
      create:              (opts) => Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')),
      store:               (cred) => Promise.resolve(cred),
      preventSilentAccess: ()     => Promise.resolve(),
    }
    Object.defineProperty(navigator, 'credentials', { value: credentialsStub, configurable: true, writable: true })
  } catch (_) {}

  // ─── 8. PublicKeyCredential stub — Microsoft checks if FIDO2 is supported ─
  // If window.PublicKeyCredential exists, MS shows the passkey screen.
  // Remove it so MS thinks this device has no passkey support and skips to password.
  try {
    Object.defineProperty(window, 'PublicKeyCredential', { get: () => undefined, configurable: true })
  } catch (_) {}

  // ─── 9. Auto-click "Sign in another way" / "Use password" on MS login ─────
  // After stubbing credentials, Microsoft may still land on the passkey screen.
  // We inject a MutationObserver that watches for the "Use password" link and
  // clicks it automatically.
  function clickPasswordFallback () {
    const selectors = [
      'a[id*="otherOptions"]',
      'a[id*="signInAnotherWay"]',
      '[data-bind*="signInAnotherWay"]',
      'a[href*="loginOptions"]',
    ]
    const keywords = /sign.?in.another.way|use.a.password|use.your.password|sign.in.with.a.password|other.ways.to.sign.in|forgot.my.pin|use.different/i
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el && el.offsetParent !== null) { el.click(); return true }
    }
    // Fallback: scan all links/buttons for matching text
    for (const el of document.querySelectorAll('a, button')) {
      if (keywords.test(el.textContent || '') && el.offsetParent !== null) {
        el.click(); return true
      }
    }
    return false
  }

  const host = location.hostname
  const isMicrosoftLogin = host.includes('login.microsoftonline.com') || host.includes('login.microsoft.com') || host.includes('login.live.com')

  if (isMicrosoftLogin) {
    // Try immediately + after short delays for dynamic rendering
    const tryClick = () => clickPasswordFallback()
    setTimeout(tryClick, 600)
    setTimeout(tryClick, 1200)
    setTimeout(tryClick, 2500)

    // Also watch for DOM changes (Microsoft login is a SPA)
    const obs = new MutationObserver(() => { if (clickPasswordFallback()) obs.disconnect() })
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true })
      tryClick()
    }, { once: true })
  }

  // ─── 10. outerWidth / outerHeight fix ─────────────────────────────────────
  try {
    if (window.outerWidth  === 0) Object.defineProperty(window, 'outerWidth',  { get: () => window.innerWidth,  configurable: true })
    if (window.outerHeight === 0) Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight, configurable: true })
  } catch (_) {}

})()
