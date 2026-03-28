import os
import re
import tempfile
from pathlib import Path

import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="YTDrop API", version="0.1.0")

# CORS — permite llamadas desde tu frontend en Netlify
# En producción reemplaza "*" por tu URL de Netlify
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# --- Schemas ---

class DownloadRequest(BaseModel):
    url:           str
    mode:          str = "audio"   # "audio" | "video"
    audio_quality: str = "192"     # "128" | "192" | "256" | "320"
    video_quality: str = "720"     # "360" | "480" | "720" | "1080"


class InfoResponse(BaseModel):
    title:     str
    thumbnail: str | None
    duration:  int | None          # segundos
    uploader:  str | None


# --- Utilidades ---

def clean_filename(name: str) -> str:
    """Quita caracteres no válidos del nombre de archivo."""
    return re.sub(r'[\\/*?:"<>|]', "_", name)


def get_ydl_opts_audio(quality: str, output_path: str) -> dict:
    """Opciones de yt-dlp para extraer audio en MP3."""
    return {
        "format":            "bestaudio/best",
        "outtmpl":           output_path,
        "quiet":             True,
        "no_warnings":       True,
        "postprocessors": [
            {
                "key":            "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": quality,
            }
        ],
    }


def get_ydl_opts_video(quality: str, output_path: str) -> dict:
    """Opciones de yt-dlp para descargar video en MP4."""
    # Selecciona el mejor video hasta la calidad pedida + mejor audio
    fmt = f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<={quality}][ext=mp4]/best"
    return {
        "format":      fmt,
        "outtmpl":     output_path,
        "quiet":       True,
        "no_warnings": True,
        "merge_output_format": "mp4",
    }


# --- Endpoints ---

@app.get("/")
def root():
    return {"status": "ok", "service": "YTDrop API"}


@app.post("/info", response_model=InfoResponse)
def get_info(req: DownloadRequest):
    """Obtiene título, miniatura y duración sin descargar."""
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
        return InfoResponse(
            title     = info.get("title", "Sin título"),
            thumbnail = info.get("thumbnail"),
            duration  = info.get("duration"),
            uploader  = info.get("uploader"),
        )
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/download")
def download(req: DownloadRequest):
    """
    Descarga el audio o video y devuelve el archivo directamente.
    El archivo se elimina del servidor después de enviarse.
    """
    # Directorio temporal — se limpia automáticamente
    tmp_dir = tempfile.mkdtemp()

    ext         = "mp3" if req.mode == "audio" else "mp4"
    output_path = os.path.join(tmp_dir, f"descarga.%(ext)s")

    if req.mode == "audio":
        opts = get_ydl_opts_audio(req.audio_quality, output_path)
    else:
        opts = get_ydl_opts_video(req.video_quality, output_path)

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info     = ydl.extract_info(req.url, download=True)
            title    = clean_filename(info.get("title", "descarga"))
            filename = f"{title}.{ext}"

        # Buscar el archivo generado (yt-dlp puede cambiar la extensión)
        files = list(Path(tmp_dir).glob(f"*.{ext}"))
        if not files:
            # Intentar cualquier archivo generado
            files = list(Path(tmp_dir).iterdir())

        if not files:
            raise HTTPException(status_code=500, detail="No se generó ningún archivo.")

        file_path = files[0]

        return FileResponse(
            path              = str(file_path),
            filename          = filename,
            media_type        = "audio/mpeg" if ext == "mp3" else "video/mp4",
            background        = None,   # el archivo se servirá y luego se puede limpiar
        )

    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        if "Private video" in msg:
            raise HTTPException(status_code=403, detail="El video es privado.")
        if "age" in msg.lower() or "sign in" in msg.lower():
            raise HTTPException(status_code=403, detail="El video requiere inicio de sesión.")
        if "unavailable" in msg.lower():
            raise HTTPException(status_code=404, detail="El video no está disponible.")
        raise HTTPException(status_code=400, detail=msg)

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))