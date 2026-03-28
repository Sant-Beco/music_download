FROM python:3.11-slim

# ffmpeg es necesario para que yt-dlp convierta a MP3
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar Poetry
RUN pip install poetry --no-cache-dir

# Copiar solo los archivos de dependencias primero (cache de Docker)
COPY pyproject.toml poetry.lock* ./
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --only main

# Copiar el resto del código
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]