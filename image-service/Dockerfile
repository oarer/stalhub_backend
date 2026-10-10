FROM oven/bun:1.4.0
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY . .
# Шрифты для растра OG-обложек: DejaVu (кириллица-фолбэк) + MTS Extended
# (бренд-шрифт сайта, алиас CoverExtended -> реальное имя ниже).
RUN apt-get update \
	&& apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core fonts-noto-color-emoji \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p /usr/share/fonts/truetype/mts \
	&& cp ./fonts/*.woff2 ./fonts/*.ttf /usr/share/fonts/truetype/mts/ \
	&& cp ./fonts/*.conf /etc/fonts/conf.d/ \
	&& fc-cache -f
# Кэш шрифтов обновляем и на старте — дешевле, чем отлаживать его протухание
CMD ["sh", "-c", "fc-cache -f >/dev/null 2>&1; bun run src/index.ts"]
