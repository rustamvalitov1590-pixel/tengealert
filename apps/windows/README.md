# TengeAlert — Приложение для Windows (Desktop Companion)

Нативное настольное приложение для Windows 10/11, позволяющее перехватывать банковские push-уведомления (Kaspi, Halyk, Freedom, Jusan), поступающие на ПК через **Связь с телефоном** (Microsoft Phone Link) с устройств на iOS и Android.

---

## Архитектура и принцип работы

1. **WinRT UserNotificationListener**:
   - Приложение запрашивает разрешение на доступ к Action Center (Центру уведомлений) Windows.
   - Подписывается на события появления новых push-уведомлений в фоновом режиме.
2. **Парсинг без задержек**:
   - Текст уведомления мгновенно пропускается через регулярные выражения банка (`Services/BankRegexParser.cs`).
3. **Локальный шлюз (< 5 мс)**:
   - Обнаруженное событие доната отправляется через HTTP/WebSocket на локальный сервер TengeAlert (`http://localhost:3000/api/push`) или в облако стримера.
4. **Оффлайн-очередь**:
   - При кратковременной потере связи донаты буферизируются в памяти и отправляются при восстановлении подключения.

---

## Структура файлов проекта

```
apps/windows/
├── TengeAlert.Windows.csproj       # Проект .NET 8 WPF с поддержкой WinRT
├── App.xaml / App.xaml.cs          # Инициализация приложения
├── MainWindow.xaml / .cs           # Современный интерфейс со стримерским логом
├── Models/
│   └── DonationEvent.cs            # Модель события по универсальной спецификации
├── Services/
│   ├── BankRegexParser.cs          # Быстрый парсер банковских пушей
│   ├── NotificationListenerBridge.cs # Мост к Windows WinRT UserNotificationListener
│   └── TengeAlertApiClient.cs      # Клиент API с очередью повторов
├── companion-cli.js                # Быстрый консольный мост на Node.js
└── reference/
    └── legacy_sample.exe           # Референсный бинарный файл (переименован)
```

---

## Сборка нативного .NET 8 приложения

Требуется установлен .NET 8 SDK:

```powershell
# Сборка одного компактного EXE (self-contained, x64):
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

Полученный бинарник `TengeAlert.exe` будет весить всего ~15–20 МБ (в отличие от Electron-аналогов на 210 МБ) и потреблять менее 25 МБ ОЗУ.
