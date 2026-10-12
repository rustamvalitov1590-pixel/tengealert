# TengeAlert ₸ — Экосистема стриминговых оповещений

**TengeAlert** — независимая стримерская платформа для Казахстана, автоматизирующая вывод банковских переводов и донатов в OBS Studio и TikTok Live Studio с задержкой передачи менее 5 мс.

---

## 📁 Структура проекта

Проект логически разделен на три ключевых компонента и общие спецификации:

| Директория | Описание | Технологии |
| :--- | :--- | :--- |
| [`website/`](file:///c:/Users/rusta/.antigravity/donate/website) | **Сайт, веб-студия и сервер** | HTML5, Vanilla CSS, JS, Web Audio API, Node.js (SSE + WebSocket) |
| [`apps/windows/`](file:///c:/Users/rusta/.antigravity/donate/apps/windows) | **Приложение для Windows** | C# .NET 8 WPF, WinRT `UserNotificationListener`, Phone Link мост |
| [`apps/android/`](file:///c:/Users/rusta/.antigravity/donate/apps/android) | **Приложение для Android** | Kotlin, Jetpack Compose, `NotificationListenerService`, OkHttp |
| [`specs/`](file:///c:/Users/rusta/.antigravity/donate/specs) | **Банковские спецификации** | Регулярные выражения, тестовый сьют (13/13 PASS), протокол событий |

---

### 1. Веб-платформа (`website/`)
- **Лендинг (`website/landing/`)**: современная витрина в стиле Linear/Vercel с интерактивной песочницей алертов и калькулятором стримера.
- **Панель управления (`website/dashboard/`)**: студия стримера для настройки звуков, тем, генерации ссылок для Browser Source в OBS и просмотра живой ленты.
- **Виджеты OBS (`website/widgets/`)**:
  - `alert.html`: Alert Box с 4 стилями (`cyber_emerald`, `royal_gold`, `qazaq_neon`, `minimal_glass`), частицами и синтезированными Web Audio аккордами (работает без MP3 файлов).
  - `goal.html`: Goal Bar с плавной шкалой прогресса сбора средств.
- **Шлюз реального времени (`website/server/`)**: zero-dependency сервер на чистом Node.js (SSE + WebSocket, мгновенная доставка пушей).

---

### 2. Приложение для Windows (`apps/windows/`)
- Нативное настольное приложение для стримеров с iPhone и Android.
- Перехватывает банковские пуши через системное приложение **Связь с телефоном** (Microsoft Phone Link) с помощью WinRT `UserNotificationListener`.
- Потребляет менее 25 МБ ОЗУ (в отличие от Electron-аналогов на 200+ МБ).
- Включает также кроссплатформенный быстрый CLI-мост `companion-cli.js`.

---

### 3. Приложение для Android (`apps/android/`)
- Нативное мобильное приложение на **Kotlin + Jetpack Compose**.
- Системный сервис `NotificationListenerService` перехватывает пуши Kaspi, Halyk, Freedom, Jusan даже при заблокированном экране.
- Непрерывный `ForegroundService` и исключение из батарейных ограничений защищают приложение от выгрузки системой во время долгих трансляций.
- Оффлайн-буфер гарантирует, что ни один донат не потеряется при сбое связи.

---

## ⚡ Быстрый старт

1. Запустите сервер:
   ```cmd
   start.bat
   ```
2. Откройте в браузере:
   - Студия стримера: `http://localhost:3000/dashboard/`
   - Витрина: `http://localhost:3000/`
3. Скопируйте ссылку на Alert Box в источник «Браузер» в OBS Studio (ширина 650, высота 240).

---

## ⚖️ Юридическая чистота (Clean Room)

TengeAlert разработан с нуля без использования стороннего закрытого исходного кода или товарных знаков. Программа не аффилирована с банками и финансовыми организациями и обрабатывает исключительно стандартные экранные уведомления операционной системы с явного согласия пользователя.
