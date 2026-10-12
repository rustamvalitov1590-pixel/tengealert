# TengeAlert — Веб-платформа и Сервер (Website & OBS Overlays)

Веб-часть платформы **TengeAlert**: флагманский промо-сайт (Landing Page), панель управления стримера (Dashboard), интерактивные виджеты для OBS Studio / TikTok Live Studio (Alert Box & Goal Bar) и ультрабыстрый шлюз реального времени.

---

## Структура папок

```
website/
├── landing/
│   └── index.html         # Презентационный лендинг с интерактивной песочницей и калькулятором
├── dashboard/
│   └── index.html         # Студия управления: настройка звуков, тем, генератор ссылок для OBS
├── widgets/
│   ├── alert.html         # OBS Alert Box: 4 дизайн-темы, Web Audio синтезатор звуков, частицы
│   └── goal.html          # OBS Goal Bar: шкала сбора с анимацией прогресса
├── server/
│   ├── server.js          # Ядро: HTTP API, Server-Sent Events (SSE), WebSocket, парсинг
│   └── donations_store.json # Локальное хранилище истории донатов
└── README.md
```

---

## Запуск

Сервер не требует установки сторонних пакетов через `npm install` — он написан на чистых системных модулях Node.js (`http`, `crypto`, `fs`, `path`).

Запуск из корневой папки:
```cmd
start.bat
```
Или напрямую:
```bash
node website/server/server.js
```

После старта доступны адреса:
- **Лендинг:** `http://localhost:3000/`
- **Панель управления стримера:** `http://localhost:3000/dashboard/`
- **Виджет оповещений для OBS:** `http://localhost:3000/widgets/alert.html?theme=cyber_emerald&sound=coin`
- **Виджет цели сбора для OBS:** `http://localhost:3000/widgets/goal.html`
- **Health Check API:** `http://localhost:3000/api/health`
