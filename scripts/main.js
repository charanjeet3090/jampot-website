/**
 * Jampot Technologies — Main JavaScript
 * Version: 1.0.0
 *
 * Sections:
 *  1. Navigation (dropdowns, hamburger, routing)
 *  2. Modal (consultation booking)
 *  3. Visitor Tracking (analytics, time-on-site, email capture)
 *  4. Cookie Consent
 *  5. Scroll & UI Enhancements
 */

'use strict';

/* ════════════════════════════════════════════════════════════════════════════
   1. NAVIGATION
   ════════════════════════════════════════════════════════════════════════════ */

const openDrops = new Set();

function toggleDrop(id) {
  const was = openDrops.has(id);
  closeAllDrops();
  if (!was) {
    openDrops.add(id);
    document.getElementById('ni-' + id)?.classList.add('open');
  }
}

function closeAllDrops() {
  openDrops.forEach(id => {
    document.getElementById('ni-' + id)?.classList.remove('open');
  });
  openDrops.clear();
}

document.addEventListener('click', e => {
  if (!e.target.closest('.ni')) closeAllDrops();
});

/**
 * Navigate to a named page section
 * @param {string} id - page section id (without "page-" prefix)
 */
function go(id) {
  closeAllDrops();
  document.getElementById('navLinks')?.classList.remove('mob-open');
  document.getElementById('ham')?.classList.remove('x');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (target) {
    target.classList.add('active');
  } else {
    document.getElementById('page-home')?.classList.add('active');
  }
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Track page view
  Tracker.trackPageView(id);

  // Update browser URL hash for bookmarking
  history.replaceState(null, '', '#' + id);
  document.title = getPageTitle(id);
}

function getPageTitle(id) {
  const titles = {
    'home': 'Jampot Technologies — Niche Technology Solutions',
    'about': 'About Us — Jampot Technologies',
    'cybersecurity': 'Cybersecurity Services — Jampot Technologies',
    'flex-pro-cloud': 'Flex Pro Cloud (BT Trade) — Jampot Technologies',
    'treasury': 'Treasury IT Infrastructure — Jampot Technologies',
    'unified-comm': 'Unified Communication — Jampot Technologies',
    'critical-comm': 'Critical Communication — Jampot Technologies',
    'cloud': 'Cloud Computing — Jampot Technologies',
    'erp': 'Enterprise Resource Planning — Jampot Technologies',
    'customers': 'Our Customers — Jampot Technologies',
    'partners': 'Our Partners — Jampot Technologies',
    'certifications': 'ISO Certifications — Jampot Technologies',
    'contact': 'Contact Us — Jampot Technologies',
    'careers': 'Careers — Jampot Technologies',
    'diagrams': 'Architecture Diagrams — Jampot Technologies',
    'support247': '24×7 Global Support — Jampot Technologies',
    'nuso': 'NUSO eFramework — Jampot Technologies',
    'nice': 'NICE Trading Recording — Jampot Technologies',
    'verint': 'Verint VFC — Jampot Technologies',
    'iptouchpro': 'IP Touch Pro — Jampot Technologies',
    'btcommand': 'BT Command — Jampot Technologies',
    'instantconnect': 'Instant Connect — Jampot Technologies',
    'synerglass': 'Synerglass ERP — Jampot Technologies',
  };
  return titles[id] || 'Jampot Technologies — Niche Technology Solutions';
}

function toggleMob() {
  document.getElementById('navLinks').classList.toggle('mob-open');
  document.getElementById('ham').classList.toggle('x');
}

// Handle hash-based navigation on load
function handleHashNavigation() {
  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById('page-' + hash)) {
    go(hash);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   2. MODAL (Consultation Booking)
   ════════════════════════════════════════════════════════════════════════════ */

function openM() {
  document.getElementById('modal').classList.add('on');
  document.body.style.overflow = 'hidden';
  Tracker.trackEvent('modal_opened', { source: 'cta' });
}

function closeM() {
  document.getElementById('modal').classList.remove('on');
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeM();
    });
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeM();
    dismissEmailCapture();
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   3. VISITOR TRACKING & EMAIL CAPTURE
   ════════════════════════════════════════════════════════════════════════════ */

const Tracker = (() => {
  const SESSION_KEY = 'jpt_session';
  const EMAIL_SHOWN_KEY = 'jpt_email_shown';
  const CONSENT_KEY = 'jpt_consent';

  let sessionId = null;
  let sessionStart = null;
  let currentPage = 'home';
  let pageViewCount = 0;
  let emailCaptureShown = false;
  let emailCaptureTimer = null;

  // Generate or retrieve session ID
  function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  // Collect basic visitor metadata (privacy-safe)
  function getVisitorMeta() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      referrer: document.referrer || 'direct',
      landingPage: window.location.href,
    };
  }

  // Send data to API
  async function send(endpoint, data) {
    // Only send if user has given consent (or if it's the initial session ping)
    if (endpoint !== '/api/session' && !hasConsent()) return;
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
      });
    } catch (e) {
      // Silent fail — never break the main site
    }
  }

  function hasConsent() {
    return localStorage.getItem(CONSENT_KEY) === 'yes';
  }

  // Initialise a new session
  async function init() {
    sessionId = getSessionId();
    sessionStart = Date.now();

    await send('/api/session', {
      sessionId,
      timestamp: new Date().toISOString(),
      ...getVisitorMeta(),
    });

    // Schedule email capture prompt after 2 minutes of active time
    scheduleEmailCapture();
  }

  // Track a page view
  function trackPageView(pageId) {
    currentPage = pageId;
    pageViewCount++;

    send('/api/pageview', {
      sessionId,
      page: pageId,
      timestamp: new Date().toISOString(),
      pageViewNumber: pageViewCount,
    });
  }

  // Track arbitrary events
  function trackEvent(eventName, properties = {}) {
    send('/api/event', {
      sessionId,
      event: eventName,
      page: currentPage,
      timestamp: new Date().toISOString(),
      ...properties,
    });
  }

  // Track time on site with visibility API
  function trackTimeOnSite() {
    let totalTime = 0;
    let startTime = Date.now();
    let hidden = document.hidden;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        totalTime += Date.now() - startTime;
      } else {
        startTime = Date.now();
        hidden = false;
      }
    });

    // Ping every 30s while visible
    setInterval(() => {
      if (!document.hidden) {
        const activeTime = totalTime + (Date.now() - startTime);
        send('/api/heartbeat', {
          sessionId,
          activeTimeMs: activeTime,
          currentPage,
        });
      }
    }, 30000);

    // Send final time on page unload
    window.addEventListener('beforeunload', () => {
      const finalTime = totalTime + (Date.now() - startTime);
      send('/api/session/end', {
        sessionId,
        totalTimeMs: finalTime,
        pageViews: pageViewCount,
      });
    });
  }

  // Schedule email capture after 2 minutes of active browsing
  function scheduleEmailCapture() {
    if (sessionStorage.getItem(EMAIL_SHOWN_KEY)) return; // Already shown this session

    // Use Page Visibility API to track only active time
    let activeMs = 0;
    let lastVisible = Date.now();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        activeMs += Date.now() - lastVisible;
      } else {
        lastVisible = Date.now();
      }
    });

    // Check every 10 seconds if 2 minutes of active time has elapsed
    emailCaptureTimer = setInterval(() => {
      if (document.hidden) return;
      const currentActive = activeMs + (Date.now() - lastVisible);
      if (currentActive >= 120000) { // 2 minutes = 120,000ms
        clearInterval(emailCaptureTimer);
        showEmailCapture();
      }
    }, 10000);
  }

  return { init, trackPageView, trackEvent, trackTimeOnSite, scheduleEmailCapture, hasConsent };
})();

/* ── Email Capture Notification ────────────────────────────────────────────── */
function showEmailCapture() {
  if (sessionStorage.getItem('jpt_email_shown')) return;
  sessionStorage.setItem('jpt_email_shown', '1');

  const notif = document.getElementById('emailCapture');
  if (notif) {
    notif.classList.add('on');
    Tracker.trackEvent('email_capture_shown');
  }
}

function dismissEmailCapture() {
  const notif = document.getElementById('emailCapture');
  if (notif) notif.classList.remove('on');
}

async function submitEmailCapture() {
  const input = document.getElementById('captureEmail');
  const email = input?.value?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    input?.classList.add('error');
    setTimeout(() => input?.classList.remove('error'), 1200);
    return;
  }

  try {
    await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        sessionId: sessionStorage.getItem('jpt_session'),
        page: document.querySelector('.page.active')?.id?.replace('page-','') || 'unknown',
        source: 'time_on_site_capture',
        timestamp: new Date().toISOString(),
      }),
    });
    // Show success state
    document.getElementById('captureForm').style.display = 'none';
    document.getElementById('captureSuccess').style.display = 'block';
    Tracker.trackEvent('email_captured', { email_domain: email.split('@')[1] });
    setTimeout(dismissEmailCapture, 3000);
  } catch (e) {
    // Fail gracefully
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   4. COOKIE CONSENT
   ════════════════════════════════════════════════════════════════════════════ */

function initCookieConsent() {
  if (localStorage.getItem('jpt_consent')) return; // Already decided
  const bar = document.getElementById('cookieBar');
  if (bar) {
    setTimeout(() => bar.classList.add('on'), 1500);
  }
}

function acceptCookies() {
  localStorage.setItem('jpt_consent', 'yes');
  document.getElementById('cookieBar')?.classList.remove('on');
}

function declineCookies() {
  localStorage.setItem('jpt_consent', 'no');
  document.getElementById('cookieBar')?.classList.remove('on');
}

/* ════════════════════════════════════════════════════════════════════════════
   5. SCROLL & UI ENHANCEMENTS
   ════════════════════════════════════════════════════════════════════════════ */

window.addEventListener('scroll', () => {
  document.getElementById('nav')?.classList.toggle('shadow', window.scrollY > 20);
});

/* ════════════════════════════════════════════════════════════════════════════
   INIT — Run when DOM is ready
   ════════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Handle deep-link navigation via URL hash
  handleHashNavigation();

  // Start visitor tracking
  Tracker.init();
  Tracker.trackTimeOnSite();
  Tracker.trackPageView(
    window.location.hash.replace('#','') || 'home'
  );

  // Show cookie consent if needed
  initCookieConsent();
});
