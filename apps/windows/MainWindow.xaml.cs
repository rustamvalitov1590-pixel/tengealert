using System;
using System.Windows;
using System.Windows.Media;
using TengeAlert.Windows.Models;
using TengeAlert.Windows.Services;

namespace TengeAlert.Windows
{
    public partial class MainWindow : Window
    {
        private readonly NotificationListenerBridge _listenerBridge;
        private readonly TengeAlertApiClient _apiClient;

        public MainWindow()
        {
            InitializeComponent();

            _listenerBridge = new NotificationListenerBridge();
            _apiClient = new TengeAlertApiClient();

            _listenerBridge.OnLog += AppendLog;
            _listenerBridge.OnDonationDetected += OnDonationDetected;
            _apiClient.OnStatus += AppendLog;

            Loaded += MainWindow_Loaded;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            AppendLog("[System] Запуск TengeAlert Desktop Companion...");
            AppendLog("[System] Проверка прав доступа WinRT UserNotificationListener...");

            bool initialized = await _listenerBridge.InitializeAsync();
            if (initialized)
            {
                _listenerBridge.Start();
                UpdateStatusUI(true);
            }
            else
            {
                AppendLog("[Warning] Автоматический перехват недоступен без разрешений системы.");
                UpdateStatusUI(false);
            }
        }

        private async void OnDonationDetected(DonationEvent donation)
        {
            _apiClient.ServerUrl = ServerUrlBox.Text.Trim();
            _apiClient.ApiKey = TokenBox.Password.Trim();

            await _apiClient.SendDonationAsync(donation);
        }

        private void ToggleService_Click(object sender, RoutedEventArgs e)
        {
            if (_listenerBridge.IsRunning)
            {
                _listenerBridge.Stop();
                ToggleServiceBtn.Content = "Запустить";
                UpdateStatusUI(false);
            }
            else
            {
                _listenerBridge.Start();
                ToggleServiceBtn.Content = "Остановить";
                UpdateStatusUI(true);
            }
        }

        private async void TestDonation_Click(object sender, RoutedEventArgs e)
        {
            _apiClient.ServerUrl = ServerUrlBox.Text.Trim();
            _apiClient.ApiKey = TokenBox.Password.Trim();

            var testDonation = new DonationEvent
            {
                Amount = 5000,
                Sender = "Данияр К.",
                Message = "Красавчик, топовый стрим! (Тест из Windows Desktop)",
                SourceLabel = "Kaspi Gold",
                Bank = "kaspi_gold",
                RawText = "Перевод 5 000 ₸ от Данияр К. с сообщением «Красавчик, топовый стрим!»"
            };

            AppendLog($"[Manual Test] Отправка тестового доната 5 000 ₸...");
            await _apiClient.SendDonationAsync(testDonation);
        }

        private void ClearLog_Click(object sender, RoutedEventArgs e)
        {
            LogTextBox.Text = string.Empty;
        }

        private void AppendLog(string message)
        {
            Dispatcher.Invoke(() =>
            {
                string timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
                LogTextBox.AppendText($"[{timestamp}] {message}\n");
                LogTextBox.ScrollToEnd();
            });
        }

        private void UpdateStatusUI(bool active)
        {
            if (active)
            {
                StatusDot.Fill = new SolidColorBrush(Color.FromRgb(0x00, 0xf5, 0xa0));
                StatusText.Text = "Служба активна";
                StatusText.Foreground = new SolidColorBrush(Color.FromRgb(0x00, 0xf5, 0xa0));
            }
            else
            {
                StatusDot.Fill = new SolidColorBrush(Color.FromRgb(0xef, 0x44, 0x44));
                StatusText.Text = "Остановлена";
                StatusText.Foreground = new SolidColorBrush(Color.FromRgb(0xef, 0x44, 0x44));
            }
        }
    }
}
