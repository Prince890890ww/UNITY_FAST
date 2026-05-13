# node:20-slim (Debian-based) — more reliable pull than alpine on Railway
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    python3 \
    python3-pip \
    python3-venv \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp via pip (system pip with break flag)
RUN pip3 install --upgrade yt-dlp --break-system-packages 2>/dev/null || \
    pip3 install --upgrade yt-dlp || true

WORKDIR /app

COPY package*.json ./
RUN npm install --production --legacy-peer-deps

COPY . .

RUN mkdir -p temp logs database/sessions src/media

EXPOSE 3000

CMD ["node", "connect.js"]
