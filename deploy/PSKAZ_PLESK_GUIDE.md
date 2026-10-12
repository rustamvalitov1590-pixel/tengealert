# Руководство по развертыванию TengeAlert на хостинге PS.kz (Панель Plesk)

Данная инструкция описывает пошаговое развертывание платформы **TengeAlert** на виртуальном хостинге или VPS провайдера **PS.kz** под управлением панели **Plesk Obsidian**.

---

## Преимущества хостинга PS.kz для TengeAlert
- **100% соблюдение Закона РК № 94-V «О персональных данных»:** Серверы физически находятся в дата-центрах Алматы и Астаны.
- **Встроенная поддержка Node.js:** Запуск Node.js приложений через встроенный менеджер Phusion Passenger без необходимости настраивать сложные конфигурации вручную.
- **База данных MySQL / MariaDB в 1 клик:** Бесплатное управление через phpMyAdmin прямо из панели Plesk.
- **Бесплатный SSL-сертификат Let's Encrypt:** Подключение HTTPS в 1 клик.

---

## Шаг 1. Создание базы данных MySQL в панели Plesk

1. Войдите в панель управления **Plesk** на PS.kz.
2. Перейдите в раздел **Базы данных (Databases)** -> нажмите **Добавить базу данных (Add Database)**.
3. Заполните поля:
   - **Имя базы данных:** `tengealert_db`
   - **Имя пользователя:** `tenge_user`
   - **Пароль:** сгенерируйте надежный пароль и сохраните его.
4. Нажмите **ОК**.
5. Нажмите кнопку **phpMyAdmin** напротив созданной базы.
6. Перейдите на вкладку **SQL** и вставьте схему таблиц из файла [`website/server/db.js`](file:///c:/Users/rusta/.antigravity/donate/website/server/db.js):

```sql
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NULL,
  display_name VARCHAR(100) NOT NULL,
  streamer_token VARCHAR(64) UNIQUE NOT NULL,
  auth_provider VARCHAR(20) DEFAULT 'email',
  provider_id VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  settings JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_token (streamer_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  amount INT NOT NULL,
  currency VARCHAR(10) DEFAULT 'KZT',
  sender VARCHAR(100) NOT NULL,
  message TEXT NULL,
  raw_text TEXT NULL,
  source_label VARCHAR(100) DEFAULT 'Перевод ₸',
  sound VARCHAR(50) DEFAULT 'coin',
  theme VARCHAR(50) DEFAULT 'cyber_emerald',
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_received (user_id, received_at),
  CONSTRAINT fk_donation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goals (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  target INT NOT NULL DEFAULT 500000,
  current INT NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_goal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
7. Нажмите **Вперёд (Go)**. Таблицы созданы.

---

## Шаг 2. Загрузка файлов проекта

1. Перейдите в раздел **Файлы (Files)** вашего домена (например, `httpdocs`).
2. Загрузите файлы проекта (папки `website/`, `specs/`, `legal/`).
3. Структура в `httpdocs`:
   ```
   httpdocs/
   ├── website/
   │   ├── landing/
   │   ├── dashboard/
   │   ├── widgets/
   │   ├── auth/
   │   └── server/
   ├── specs/
   └── legal/
   ```

---

## Шаг 3. Настройка Node.js в Plesk

1. В меню домена нажмите на иконку **Node.js**.
2. Включите Node.js (**Включить / Enable**).
3. Установите параметры:
   - **Node.js Version:** выберите `20.x` или `22.x`.
   - **Режим работы (Application Mode):** `production`.
   - **Корень приложения (Application Root):** `/httpdocs`.
   - **Файл запуска (Application Startup File):** `website/server/server.js`.
4. В блоке **Переменные среды (Custom environment variables)** добавьте:
   - `PORT`: `3000` (или оставить системный)
   - `NODE_ENV`: `production`
   - `DB_HOST`: `localhost`
   - `DB_NAME`: `tengealert_db`
   - `DB_USER`: `tenge_user`
   - `DB_PASS`: ваш пароль от базы данных
   - `APP_SECRET`: сгенерируйте случайную строку из 32 символов
5. Нажмите **Перезапустить приложение (Restart App)**.

---

## Шаг 4. Подключение бесплатного SSL (HTTPS)

1. Перейдите в **SSL/TLS Сертификаты (SSL/TLS Certificates)**.
2. Выберите **Установить бесплатный сертификат от Let's Encrypt**.
3. Отметьте домен и поддомен `www.` и нажмите **Получить бесплатно**.
4. Включите опцию **Постоянное перенаправление с HTTP на HTTPS (301 redirect)**.

---

## Шаг 5. Настройка Nginx для WebSocket и SSE в Plesk

Для того чтобы оповещения в OBS доходили мгновенно (< 5 мс), Nginx должен поддерживать WebSocket и отключить буферизацию Server-Sent Events (SSE):

1. Перейдите в раздел **Настройки Apache и Nginx (Apache & nginx Settings)**.
2. В поле **Дополнительные директивы nginx (Additional nginx directives)** вставьте:

```nginx
location /api/events {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
}

location /ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```
3. Нажмите **ОК**.

---

## Проверка работы
После выполнения шагов откройте ваш домен:
- Промо-сайт: `https://вашдомен.kz/`
- Вход в личный кабинет: `https://вашдомен.kz/auth/login.html`
- Студия стримера: `https://вашдомен.kz/dashboard/`
- Виджеты OBS: `https://вашдомен.kz/widgets/alert.html`
