# TengeAlert — Мобильное приложение для Android

Нативное Android-приложение (Kotlin + Jetpack Compose) для автоматического перехвата входящих банковских push-уведомлений (Kaspi Gold, Kaspi Pay, Halyk, Freedom, Jusan) и мгновенной передачи донатов в OBS Studio с задержкой менее 5 мс.

---

## Архитектура и надежность

1. **NotificationListenerService (`service/TengeNotificationListenerService.kt`)**:
   - Системный сервис Android с официальным разрешением на чтение пуш-уведомлений.
   - Работает независимо от состояния экрана (включая заблокированный телефон).
2. **Защита от выгрузки из памяти (`service/TengeForegroundService.kt`)**:
   - Непрерывный Foreground Service с закрепленным уведомлением.
   - Запрос исключения из оптимизации батареи (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) предотвращает агрессивное закрытие процесса прошивками Xiaomi (MIUI/HyperOS), Samsung (OneUI) и Huawei (EMUI) во время 8-часовых стримов.
3. **Оффлайн-очередь (`queue/OfflineQueueManager.kt`)**:
   - Если во время стрима пропадает Wi-Fi или мобильный интернет, донаты сохраняются в локальное хранилище и автоматически отправляются в OBS сразу при восстановлении связи.
4. **Универсальный парсер (`parser/BankPushParser.kt`)**:
   - Чистая реализация (Clean Room) для разбора сумм, отправителей и комментариев в тенге без привязки к проприетарным библиотекам.

---

## Структура проекта

```
apps/android/
├── build.gradle.kts
├── settings.gradle.kts
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/kz/tengealert/app/
│       │   ├── MainActivity.kt
│       │   ├── network/TengeApiClient.kt
│       │   ├── parser/BankPushParser.kt
│       │   ├── queue/OfflineQueueManager.kt
│       │   ├── service/TengeForegroundService.kt
│       │   ├── service/TengeNotificationListenerService.kt
│       │   └── ui/
│       │       ├── MainScreen.kt
│       │       └── TengeTheme.kt
│       └── res/
│           ├── values/
│           │   ├── colors.xml
│           │   ├── strings.xml
│           │   └── themes.xml
│           └── xml/
│               └── network_security_config.xml
└── reference/
    └── legacy_sample.apk            # Референсный образец (переименован)
```

---

## Сборка APK

1. Откройте папку `apps/android` в **Android Studio**.
2. Дождитесь синхронизации Gradle.
3. Соберите отладочный или релизный APK:
   - В меню: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
   - Или через терминал:
     ```bash
     ./gradlew assembleRelease
     ```
4. Установите APK на смартфон стримера, выдайте доступ к уведомлениям и укажите IP-адрес компьютера со стримом (например, `http://192.168.1.50:3000`).
