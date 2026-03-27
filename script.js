// API pública de cobalt.tools — open source, soporta YouTube, TikTok, Instagram, Twitter/X, Vimeo, SoundCloud
// Docs: https://github.com/imputnet/cobalt
const COBALT_API = 'https://api.cobalt.tools/';

// Estado actual del formulario
let currentMode = 'audio'; // 'audio' | 'video'

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
  } catch {
    // En algunos navegadores/móviles el clipboard API requiere interacción previa
    document.getElementById('urlInput').focus();
  }
}

// --- Descarga principal ---
async function startDownload() {
  const url = document.getElementById('urlInput').value.trim();

  if (!url) {
    showError('Pega un enlace primero.');
    return;
  }

  if (!isValidURL(url)) {
    showError('El enlace no parece válido. Asegúrate de pegar la URL completa.');
    return;
  }

  const btn = document.getElementById('btnDownload');
  btn.disabled = true;
  showLoading('Procesando enlace…');

  try {
    // Construir parámetros según el modo
    const body = {
      url,
      downloadMode: currentMode === 'audio' ? 'audio' : 'auto',
    };

    if (currentMode === 'audio') {
      body.audioFormat  = 'mp3';
      body.audioBitrate = document.getElementById('audioQuality').value;
    } else {
      body.videoQuality = document.getElementById('videoQuality').value;
    }

    const response = await fetch(COBALT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':        'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Error del servidor: ${response.status}`);
    }

    const data = await response.json();

    // cobalt puede responder: 'stream', 'redirect', 'tunnel', 'picker', 'error'
    if (data.status === 'error') {
      throw new Error(data.error?.code || 'La plataforma no está soportada o el enlace es inválido.');
    }

    if (data.status === 'picker') {
      // En TikTok/Instagram puede haber múltiples archivos — tomamos el primero
      if (data.picker && data.picker.length > 0) {
        showResult(data.picker[0].url, data.picker[0].thumb || '', 'Elemento seleccionado', '');
      } else {
        throw new Error('No se encontró contenido descargable.');
      }
      return;
    }

    // 'stream', 'redirect' o 'tunnel' → data.url es el link directo
    if (data.url) {
      // Intentar extraer título/thumb si cobalt los devuelve
      const title = data.filename
        ? data.filename.replace(/\.[^.]+$/, '')  // quita extensión
        : 'Archivo listo';

      const ext  = currentMode === 'audio' ? 'mp3' : 'mp4';
      const meta = `${ext.toUpperCase()} · ${currentMode === 'audio' ? document.getElementById('audioQuality').value + ' kbps' : document.getElementById('videoQuality').value + 'p'}`;

      showResult(data.url, '', title, meta, data.filename || `descarga.${ext}`);
    } else {
      throw new Error('No se recibió un enlace de descarga.');
    }

  } catch (err) {
    const msg = friendlyError(err.message);
    showError(msg);
  } finally {
    btn.disabled = false;
  }
}

// --- Mensajes de error legibles ---
function friendlyError(msg) {
  if (!msg) return 'Error desconocido. Intenta de nuevo.';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed'))
    return 'Sin conexión o el servicio no está disponible. Intenta en unos minutos.';
  if (msg.includes('404') || msg.includes('not found'))
    return 'El enlace no existe o el contenido fue eliminado.';
  if (msg.includes('private') || msg.includes('unavailable'))
    return 'El contenido es privado o no está disponible en tu región.';
  if (msg.includes('age') || msg.includes('login'))
    return 'Este contenido requiere inicio de sesión.';
  return msg;
}

// --- Validación básica de URL ---
function isValidURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

// --- Mostrar estado: loading ---
function showLoading(text) {
  const area = document.getElementById('statusArea');
  area.style.display = 'block';
  document.getElementById('statusLoading').style.display = 'flex';
  document.getElementById('statusError').style.display   = 'none';
  document.getElementById('resultCard').style.display    = 'none';
  document.getElementById('loadingText').textContent     = text;
}

// --- Mostrar estado: error ---
function showError(msg) {
  const area = document.getElementById('statusArea');
  area.style.display = 'block';
  document.getElementById('statusLoading').style.display = 'none';
  document.getElementById('statusError').style.display   = 'flex';
  document.getElementById('resultCard').style.display    = 'none';
  document.getElementById('errorText').textContent       = msg;
}

// --- Mostrar resultado listo ---
function showResult(downloadURL, thumbURL, title, meta, filename = 'descarga') {
  const area = document.getElementById('statusArea');
  area.style.display = 'block';
  document.getElementById('statusLoading').style.display = 'none';
  document.getElementById('statusError').style.display   = 'none';
  document.getElementById('resultCard').style.display    = 'flex';

  // Thumbnail
  const thumb = document.getElementById('resultThumb');
  if (thumbURL) {
    thumb.src   = thumbURL;
    thumb.style.display = 'block';
  } else {
    thumb.style.display = 'none';
  }

  document.getElementById('resultTitle').textContent = title || 'Archivo listo';
  document.getElementById('resultMeta').textContent  = meta  || '';

  // Enlace de descarga
  const link = document.getElementById('dlLink');
  link.href     = downloadURL;
  link.download = filename;

  // Para cobalt 'tunnel'/'stream': abrir en nueva pestaña si no se puede descargar directo
  link.onclick = (e) => {
    // Si el link es del mismo dominio que cobalt, dejamos que el navegador maneje la descarga
    // En móvil iOS a veces es necesario abrir en nueva pestaña
    if (!downloadURL.startsWith(window.location.origin)) {
      e.preventDefault();
      window.open(downloadURL, '_blank', 'noopener');
    }
  };
}

// --- Enter en el input dispara la descarga ---
document.getElementById('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startDownload();
});

// --- Limpiar al borrar el input ---
document.getElementById('urlInput').addEventListener('input', (e) => {
  if (!e.target.value) {
    document.getElementById('statusArea').style.display = 'none';
  }
});