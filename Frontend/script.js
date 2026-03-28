// URL de tu backend FastAPI desplegado en Render o Railway
// Cámbiala por la URL real cuando lo despliegues
const API_BASE = 'https://TU-BACKEND.onrender.com';

let currentMode = 'audio';

// --- Limpia parámetros de tracking de la URL ---
function cleanURL(raw) {
  try {
    const u = new URL(raw.trim());
    if (u.hostname.includes('youtu.be')) {
      const clean = new URL(u.pathname, 'https://youtu.be');
      const list  = u.searchParams.get('list');
      if (list) clean.searchParams.set('list', list);
      return clean.toString();
    }
    if (u.hostname.includes('youtube.com')) {
      const v    = u.searchParams.get('v');
      const list = u.searchParams.get('list');
      const clean = new URL('https://www.youtube.com/watch');
      if (v)    clean.searchParams.set('v', v);
      if (list) clean.searchParams.set('list', list);
      return clean.toString();
    }
    if (u.hostname.includes('tiktok.com') || u.hostname.includes('instagram.com')) {
      return `${u.origin}${u.pathname}`;
    }
    return raw.trim();
  } catch { return raw.trim(); }
}

function isValidURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

// --- Cambio de modo audio/video ---
function setMode(mode, btn) {
  currentMode = mode;
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('audioOpts').classList.toggle('hidden', mode !== 'audio');
  document.getElementById('videoOpts').classList.toggle('hidden', mode !== 'video');
}

// --- Pegar desde portapapeles ---
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('urlInput').value = text;
    document.getElementById('statusArea').style.display = 'none';
  } catch { document.getElementById('urlInput').focus(); }
}

// --- Descarga principal ---
async function startDownload() {
  const raw = document.getElementById('urlInput').value.trim();
  if (!raw)             { showError('Pega un enlace primero.'); return; }
  if (!isValidURL(raw)) { showError('El enlace no es válido. Incluye https://'); return; }

  const url = cleanURL(raw);
  const btn = document.getElementById('btnDownload');
  btn.disabled = true;

  // Paso 1: obtener info (título, miniatura)
  showLoading('Obteniendo información…');
  let info = null;
  try {
    const r = await fetch(`${API_BASE}/info`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url, mode: currentMode }),
    });
    if (r.ok) info = await r.json();
  } catch { /* continuar aunque /info falle */ }

  // Paso 2: descarga real
  showLoading('Descargando… puede tardar unos segundos ⏳');

  try {
    const body = {
      url,
      mode:          currentMode,
      audio_quality: document.getElementById('audioQuality').value,
      video_quality: document.getElementById('videoQuality').value,
    };

    const response = await fetch(`${API_BASE}/download`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = `Error ${response.status}`;
      try { const err = await response.json(); detail = err.detail || detail; } catch {}
      throw new Error(detail);
    }

    // La respuesta es el archivo binario — crear un Blob URL para descarga local
    const blob      = await response.blob();
    const ext       = currentMode === 'audio' ? 'mp3' : 'mp4';
    const title     = info?.title || 'descarga';
    const filename  = `${title}.${ext}`;
    const objectURL = URL.createObjectURL(blob);
    const quality   = currentMode === 'audio'
      ? document.getElementById('audioQuality').value + ' kbps'
      : document.getElementById('videoQuality').value + 'p';

    showResult(objectURL, info?.thumbnail || '', title, `${ext.toUpperCase()} · ${quality}`, filename);

  } catch (err) {
    showError(friendlyError(err.message));
  } finally {
    btn.disabled = false;
  }
}

// --- Mensajes de error legibles ---
function friendlyError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'No se pudo conectar con el servidor. ¿Está desplegado el backend?';
  if (m.includes('privado') || m.includes('private'))
    return 'El video es privado.';
  if (m.includes('sesión') || m.includes('sign in') || m.includes('age'))
    return 'Este video requiere inicio de sesión en YouTube.';
  if (m.includes('disponible') || m.includes('unavailable'))
    return 'El video no está disponible o fue eliminado.';
  if (m.includes('429') || m.includes('rate'))
    return 'Demasiadas peticiones. Espera unos segundos.';
  return msg || 'Error desconocido. Intenta de nuevo.';
}

// --- UI ---
function showLoading(text) {
  document.getElementById('statusArea').style.display    = 'block';
  document.getElementById('statusLoading').style.display = 'flex';
  document.getElementById('statusError').style.display   = 'none';
  document.getElementById('resultCard').style.display    = 'none';
  document.getElementById('loadingText').textContent     = text;
}

function showError(msg) {
  document.getElementById('statusArea').style.display    = 'block';
  document.getElementById('statusLoading').style.display = 'none';
  document.getElementById('statusError').style.display   = 'flex';
  document.getElementById('resultCard').style.display    = 'none';
  document.getElementById('errorText').textContent       = msg;
}

function showResult(downloadURL, thumbURL, title, meta, filename = 'descarga') {
  document.getElementById('statusArea').style.display    = 'block';
  document.getElementById('statusLoading').style.display = 'none';
  document.getElementById('statusError').style.display   = 'none';
  document.getElementById('resultCard').style.display    = 'flex';

  const thumb = document.getElementById('resultThumb');
  thumb.style.display = thumbURL ? 'block' : 'none';
  if (thumbURL) thumb.src = thumbURL;

  document.getElementById('resultTitle').textContent = title || 'Archivo listo';
  document.getElementById('resultMeta').textContent  = meta  || '';

  const link    = document.getElementById('dlLink');
  link.href     = downloadURL;
  link.download = filename;
  link.onclick  = null;
  link.click(); // iniciar descarga automáticamente
}

// --- Eventos del input ---
document.getElementById('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startDownload();
});
document.getElementById('urlInput').addEventListener('input', (e) => {
  if (!e.target.value.trim()) document.getElementById('statusArea').style.display = 'none';
});