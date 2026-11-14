'use strict';
/* Data for the News and Markets widgets in the bottom bar.
   News: Google News RSS (or any RSS/Atom feed). Markets: Yahoo Finance's chart endpoint (unofficial, no key). */
const Widgets = (() => {
  const NEWS_TOPICS = {
    top: 'Top stories', WORLD: 'World', NATION: 'U.S.', BUSINESS: 'Business', TECHNOLOGY: 'Technology',
    SCIENCE: 'Science', HEALTH: 'Health', SPORTS: 'Sports', ENTERTAINMENT: 'Entertainment', custom: 'Your feed',
  };
  const INDEX_NAMES = { '^GSPC': 'S&P 500', '^DJI': 'Dow', '^IXIC': 'Nasdaq', '^RUT': 'Russell 2000', '^VIX': 'VIX' };
  const STOCK_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

  const textOf = (el, name) => {
    const n = el.getElementsByTagNameNS('*', name)[0];
    return n ? n.textContent.trim() : '';
  };
  const plain = s => (/[<&]/.test(s) ? (new DOMParser().parseFromString(s, 'text/html').body.textContent || '') : s).replace(/\s+/g, ' ').trim();

  function newsUrl(settings) {
    if (settings.newsTopic === 'custom') return settings.newsFeed || '';
    const q = 'hl=en-US&gl=US&ceid=US:en';
    return settings.newsTopic === 'top' || !NEWS_TOPICS[settings.newsTopic]
      ? `https://news.google.com/rss?${q}`
      : `https://news.google.com/rss/headlines/section/topic/${settings.newsTopic}?${q}`;
  }

  async function fetchNews(url) {
    let r;
    try {
      r = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
    } catch {
      throw new Error('Can’t reach the news feed.');
    }
    if (!r.ok) throw new Error(`The news feed answered with error ${r.status}.`);
    const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('That address isn’t a news feed.');
    const nodes = [...doc.getElementsByTagNameNS('*', 'item'), ...doc.getElementsByTagNameNS('*', 'entry')];
    const items = nodes.slice(0, 6).map(el => {
      let title = plain(textOf(el, 'title'));
      let source = plain(textOf(el, 'source'));
      // Google News titles end in " - Source"
      const dash = title.lastIndexOf(' - ');
      if (dash > 20) { source = source || title.slice(dash + 3); title = title.slice(0, dash); }
      let link = '';
      for (const l of el.getElementsByTagNameNS('*', 'link')) {
        link = l.getAttribute('href') || l.textContent.trim();
        if (link) break;
      }
      return { title, source, link };
    }).filter(i => i.title && /^https?:/i.test(i.link));
    if (!items.length) throw new Error('No headlines right now.');
    return items;
  }

  async function quote(symbol) {
    let lastErr = null;
    for (const host of STOCK_HOSTS) {
      try {
        const r = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { credentials: 'omit', cache: 'no-cache' });
        const j = await r.json().catch(() => null);
        const res = j && j.chart && j.chart.result && j.chart.result[0];
        if (!res || !res.meta || typeof res.meta.regularMarketPrice !== 'number') {
          lastErr = new Error((j && j.chart && j.chart.error && j.chart.error.description) || `error ${r.status}`);
          continue;
        }
        const m = res.meta;
        const prev = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice;
        return {
          symbol,
          name: INDEX_NAMES[symbol] || m.symbol || symbol,
          price: m.regularMarketPrice,
          change: m.regularMarketPrice - prev,
          pct: prev ? ((m.regularMarketPrice - prev) / prev) * 100 : 0,
          currency: m.currency || 'USD',
        };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('No price');
  }

  async function fetchQuotes(symbols) {
    const results = await Promise.all(symbols.map(s => quote(s).catch(() => ({ symbol: s, name: INDEX_NAMES[s] || s, failed: true }))));
    if (results.every(q => q.failed)) throw new Error('Can’t get prices from Yahoo Finance right now.');
    return results;
  }

  function parseSymbols(text) {
    return [...new Set(String(text).split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(s => /^[\^A-Z0-9.\-=]{1,15}$/.test(s)))].slice(0, 6);
  }

  // Site access each widget needs; Chrome asks for it the first time
  function origins(kind, settings) {
    if (kind === 'stocks') return STOCK_HOSTS.map(h => h + '/*');
    try {
      const u = new URL(newsUrl(settings));
      return /^https?:$/.test(u.protocol) ? [`${u.protocol}//${u.hostname}/*`] : [];
    } catch { return []; }
  }

  return { NEWS_TOPICS, INDEX_NAMES, newsUrl, fetchNews, fetchQuotes, parseSymbols, origins };
})();
