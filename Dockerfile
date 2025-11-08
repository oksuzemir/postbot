FROM node:20-bullseye-slim

# Install necessary packages for headless Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    lsb-release \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium (Debian package)
RUN set -eux; \
    CHROME_VERSION=115.0.5790.98; \
    wget -q -O /tmp/chrome.deb https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/115.0.5790.98/linux64/chrome-linux64.zip; \
    apt-get update || true; \
    mkdir -p /usr/local/chrome; \
    apt-get install -y unzip; \
    unzip /tmp/chrome.deb -d /usr/local/chrome; \
    rm /tmp/chrome.deb; \
    ln -s /usr/local/chrome/chrome-linux64/chrome /usr/bin/chrome || true

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .

ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chrome"

CMD ["node","scripts/ci_check.js"]
