const DEFAULT_CLUB_URL = 'https://www.northhybridclub.com';

const cache = {
  fetchedAtMs: 0,
  text: ''
};

function stripHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|br|li|h\d|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchWithRetry(url, { timeoutMs = 15000, retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} al fetchear ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function buildClubText(clubUrl) {
  const base = clubUrl.replace(/\/$/, '');
  const pages = [base, `${base}/qr`];
  const chunks = [];

  for (const url of pages) {
    try {
      const html = await fetchWithRetry(url);
      const text = stripHtmlToText(html);
      if (text) chunks.push(`FUENTE: ${url}\n${text}`);
    } catch {
      // ignorar fallos puntuales
    }
  }

  return chunks.join('\n\n').slice(0, 12000);
}

async function getClubInfoText({ ttlMs = 6 * 60 * 60 * 1000 } = {}) {
  const clubUrl = process.env.CLUB_WEBSITE_URL || DEFAULT_CLUB_URL;
  const now = Date.now();
  if (cache.text && now - cache.fetchedAtMs < ttlMs) return cache.text;

  const text = await buildClubText(clubUrl);
  cache.text = text;
  cache.fetchedAtMs = now;
  return text;
}

function needsClubInfo(message) {
  const m = (message || '').toLowerCase();
  const keywords = [
    'horario',
    'horarios',
    'abrís',
    'abris',
    'clases',
    'disciplina',
    'disciplinas',
    'hyrox',
    'deka',
    'donde',
    'dónde',
    'ubicación',
    'ubicacion',
    'dirección',
    'direccion',
    'leioa',
    'bizkaia',
    'contacto',
    'whatsapp',
    'email',
    'precio',
    'precios',
    'tarifa',
    'tarifas',
    'membresía',
    'membresia',
    'sauna',
    'icebath',
    'presoterapia',
    'bañera',
    'hielo'
  ];
  return keywords.some((k) => m.includes(k));
}

async function getClubContextIfNeeded(message) {
  if (!needsClubInfo(message)) return '';
  const text = await getClubInfoText();
  if (!text) return '';
  return `INFO_CLUB (extraído de la web oficial; úsalo como fuente de verdad):\n${text}\nFIN_INFO_CLUB`;
}

module.exports = { getClubContextIfNeeded, getClubInfoText, needsClubInfo };

