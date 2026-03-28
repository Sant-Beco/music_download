// El frontend llama a /api/download (nuestra Netlify Function)
// que hace el proxy a cobalt.tools con la API key de forma segura
const API_ENDPOINT = '/api/download';

let currentMode = 'audio'; // 'audio' | 'video'

// --- Limpia la URL antes de enviar a cobalt ---
// Quita parámetros de tracking (?si=, ?utm_*, etc.) que confunden a la API
function cleanURL(raw) {
  try {
    const u = new URL(raw.trim());

    if (u.hostname.includes('youtu.be')) {
      // youtu.be/VIDEO_ID — el id está en el path
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

    // TikTok / Instagram: quitar query string de tracking
    if (u.hostname.includes('tiktok.com') || u.hostname.includes('instagram.com')) {
      return `${u.origin}${u.pathname}`;
    }

    return raw.trim();
  } catch {
    return raw.trim();
  }
}

function isValidURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

// --- Cambio de modo ---
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
  } catch {
    document.getElementById('urlInput').focus();
  }
}

// --- Descarga principal ---
async function startDownload() {
  const raw = document.getElementById('urlInput').value.trim();
  if (!raw)            { showError('Pega un enlace primero.'); return; }
  if (!isValidURL(raw)){ showError('El enlace no es válido. Incluye https://'); return; }

  const url = cleanURL(raw);
  const btn = document.getElementById('btnDownload');
  btn.disabled = true;
  showLoading('Procesando enlace…');

  try {
    const data = await callAPI(url);
    handleResponse(data);
  } catch (err) {
    showError(friendlyError(err.message));
  } finally {
    btn.disabled = false;
  }
}

// --- Llamada al proxy (Netlify Function) ---
async function callAPI(url) {
  const body = {
    url,
    downloadMode: currentMode === 'audio' ? 'audio' : 'auto',
  };

  if (currentMode === 'audio') {
    body.audioFormat  = 'mp3';
    body.audioBitrate = document.getElementById('audioQuality').value; // '128' | '256' | '320'
  } else {
    body.videoQuality = document.getElementById('videoQuality').value; // '720' | '1080' etc.
  }

  const response = await fetch(API_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify(body),
  });

  let data;
  try { data = await response.json(); }
  catch { throw new Error(`HTTP ${response.status}`); }

  if (!response.ok) {
    const code = data?.error?.code || data?.error?.message || `HTTP ${response.status}`;
    throw new Error(code);
  }

  return data;
}

// --- Procesar respuesta ---
function handleResponse(data) {
  if (data.status === 'error') {
    throw new Error(data.error?.code || 'Error desconocido.');
  }

  // picker = múltiples elementos (carrusel de Instagram, fotos de TikTok)
  if (data.status === 'picker' && data.picker?.length > 0) {
    const item = data.picker[0];
    showResult(item.url, item.thumb || '', `Elemento 1 de ${data.picker.length}`, '');
    return;
  }

  // tunnel | redirect | stream → data.url es el enlace de descarga
  if (data.url) {
    const ext     = currentMode === 'audio' ? 'mp3' : 'mp4';
    const quality = currentMode === 'audio'
      ? document.getElementById('audioQuality').value + ' kbps'
      : document.getElementById('videoQuality').value + 'p';

    const filename = data.filename || `descarga.${ext}`;
    const title    = filename.replace(/\.[^.]+$/, '');

    showResult(data.url, '', title, `${ext.toUpperCase()} · ${quality}`, filename);
    return;
  }

  throw new Error('Respuesta inesperada. Intenta de nuevo.');
}

// --- Mensajes de error en español ---
function friendlyError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('config.missing_api_key'))
    return 'Falta la API key en Netlify. Revisa las instrucciones de configuración.';
  if (m.includes('fetch') || m.includes('failed to fetch') || m.includes('networkerror'))
    return 'Sin conexión o el servicio no responde. Intenta en unos minutos.';
  if (m.includes('content.video.unavailable') || m.includes('404'))
    return 'El video no existe o fue eliminado.';
  if (m.includes('content.video.age') || m.includes('login'))
    return 'Este contenido requiere inicio de sesión en YouTube.';
  if (m.includes('content.video.private') || m.includes('private'))
    return 'El contenido es privado.';
  if (m.includes('service.unsupported') || m.includes('unsupported'))
    return 'Esta plataforma no está soportada.';
  if (m.includes('fetch.rate') || m.includes('rate') || m.includes('429'))
    return 'Demasiadas peticiones. Espera unos segundos e intenta de nuevo.';
  if (m.includes('400'))
    return 'Enlace inválido o no compatible. Asegúrate de que sea un enlace público.';
  if (m.includes('500') || m.includes('502') || m.includes('503'))
    return 'Error del servidor. Intenta en unos minutos.';
  return msg || 'Error desconocido. Intenta de nuevo.';
}

// --- UI helpers ---
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
  // Abrir en nueva pestaña (necesario en iOS y para URLs externas de cobalt)
  link.onclick = (e) => { e.preventDefault(); window.open(downloadURL, '_blank', 'noopener'); };
}

// --- Eventos ---
document.getElementById('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startDownload();
});
document.getElementById('urlInput').addEventListener('input', (e) => {
  if (!e.target.value.trim()) document.getElementById('statusArea').style.display = 'none';
});