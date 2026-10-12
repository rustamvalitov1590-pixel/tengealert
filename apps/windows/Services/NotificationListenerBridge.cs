using System;
using System.Threading.Tasks;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;
using TengeAlert.Windows.Models;

namespace TengeAlert.Windows.Services
{
    public class NotificationListenerBridge
    {
        private UserNotificationListener? _listener;
        public event Action<DonationEvent>? OnDonationDetected;
        public event Action<string>? OnLog;
        public bool IsRunning { get; private set; }

        public async Task<bool> InitializeAsync()
        {
            try
            {
                if (!Windows.Foundation.Metadata.ApiInformation.IsTypePresent("Windows.UI.Notifications.Management.UserNotificationListener"))
                {
                    OnLog?.Invoke("[WinRT] UserNotificationListener API не поддерживается этой версией Windows (требуется Windows 10 1809+).");
                    return false;
                }

                _listener = UserNotificationListener.Current;
                UserNotificationListenerAccessStatus accessStatus = await _listener.RequestAccessAsync();

                if (accessStatus != UserNotificationListenerAccessStatus.Allowed)
                {
                    OnLog?.Invoke($"[WinRT] Доступ к уведомлениям отклонен пользователем: {accessStatus}");
                    return false;
                }

                OnLog?.Invoke("[WinRT] Доступ к системным уведомлениям успешно получен.");
                return true;
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[WinRT Error] Ошибка инициализации: {ex.Message}");
                return false;
            }
        }

        public void Start()
        {
            if (_listener == null || IsRunning) return;

            _listener.NotificationChanged += Listener_NotificationChanged;
            IsRunning = true;
            OnLog?.Invoke("[WinRT] Служба перехвата уведомлений запущена (фон/трей).");
        }

        public void Stop()
        {
            if (_listener == null || !IsRunning) return;

            _listener.NotificationChanged -= Listener_NotificationChanged;
            IsRunning = false;
            OnLog?.Invoke("[WinRT] Служба перехвата уведомлений остановлена.");
        }

        private async void Listener_NotificationChanged(UserNotificationListener sender, UserNotificationChangedEventArgs args)
        {
            if (args.ChangeKind != UserNotificationChangedKind.Added) return;

            try
            {
                UserNotification notif = sender.GetNotification(args.UserNotificationId);
                if (notif?.Notification?.Visual == null) return;

                NotificationBinding toastBinding = notif.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
                if (toastBinding == null) return;

                var textElements = toastBinding.GetTextElements();
                string title = string.Empty;
                string body = string.Empty;

                int index = 0;
                foreach (var el in textElements)
                {
                    if (index == 0) title = el.Text;
                    else body += (body.Length > 0 ? " " : "") + el.Text;
                    index++;
                }

                string fullText = $"{title} {body}".Trim();
                string appPackage = notif.AppInfo?.PackageFamilyName ?? "unknown";

                // Local Security Shield: Immediately drop 2FA, OTP, passwords
                if (IsSecurityOrAuthAlert(fullText))
                {
                    OnLog?.Invoke("[Security Shield] Обнаружено и сброшено служебное уведомление 2FA/входа. Не передается.");
                    return;
                }

                OnLog?.Invoke($"[Raw Push] App: {appPackage} | Text: {fullText}");

                // Parse against banking rules
                DonationEvent? donation = BankRegexParser.Parse(fullText, appPackage);
                if (donation != null)
                {
                    OnLog?.Invoke($"[SUCCESS] Перехвачен донат: {donation.Amount} ₸ от {donation.Sender} ({donation.SourceLabel})");
                    OnDonationDetected?.Invoke(donation);
                }
            }
            catch (Exception ex)
            {
                OnLog?.Invoke($"[Parse Error] Не удалось обработать уведомление: {ex.Message}");
            }
        }

        private bool IsSecurityOrAuthAlert(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            string[] triggers = new[] { "код подтверждения", "смс-код", "одноразовый код", "пароль", "никому не сообщайте", "3d secure", "вход в", "восстановление доступа", "пин-код", "pin-code", "заблокирована" };
            foreach (var t in triggers)
            {
                if (text.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            }
            return false;
        }
    }
}
