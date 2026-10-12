using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using TengeAlert.Windows.Models;
using TengeAlert.Windows.Services;

namespace TengeAlert.Windows
{
    public partial class MainWindow : Window
    {
        private readonly NotificationListenerBridge _listenerBridge;
        private readonly TengeAlertApiClient _apiClient;
        private readonly string _settingsFolder;
        private readonly string _tokenFile;

        public MainWindow()
        {
            InitializeComponent();

            _settingsFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TengeAlert");
            _tokenFile = Path.Combine(_settingsFolder, "streamer_token.txt");

            _listenerBridge = new NotificationListenerBridge();
            _apiClient = new TengeAlertApiClient();

            _listenerBridge.OnDonationDetected += OnDonationDetected;

            Loaded += MainWindow_Loaded;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            // Check for saved token
            string savedToken = LoadSavedToken();
            if (string.IsNullOrWhiteSpace(savedToken))
            {
                ShowActivationView();
            }
            else
            {
                _apiClient.ApiKey = savedToken;
                ShowMainDeckView();

                bool initialized = await _listenerBridge.InitializeAsync();
                if (initialized)
                {
                    _listenerBridge.Start();
                    UpdateStatusUI(true);
                }
                else
                {
                    UpdateStatusUI(false);
                }
            }
        }

        private string LoadSavedToken()
        {
            try
            {
                if (File.Exists(_tokenFile))
                {
                    return File.ReadAllText(_tokenFile).Trim();
                }
            }
            catch {}
            return string.Empty;
        }

        private void SaveToken(string token)
        {
            try
            {
                Directory.CreateDirectory(_settingsFolder);
                File.WriteAllText(_tokenFile, token.Trim());
            }
            catch {}
        }

        private void ClearSavedToken()
        {
            try
            {
                if (File.Exists(_tokenFile))
                {
                    File.Delete(_tokenFile);
                }
            }
            catch {}
        }

        private void ShowActivationView()
        {
            ActivationView.Visibility = Visibility.Visible;
            MainDeckView.Visibility = Visibility.Collapsed;
        }

        private void ShowMainDeckView()
        {
            ActivationView.Visibility = Visibility.Collapsed;
            MainDeckView.Visibility = Visibility.Visible;
        }

        private async void LoginBtn_Click(object sender, RoutedEventArgs e)
        {
            string token = LoginTokenBox.Password.Trim();
            if (string.IsNullOrWhiteSpace(token))
            {
                MessageBox.Show("Пожалуйста, введите токен стримера из личного кабинета.", "TengeAlert", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            SaveToken(token);
            _apiClient.ApiKey = token;
            ShowMainDeckView();

            bool initialized = await _listenerBridge.InitializeAsync();
            if (initialized)
            {
                _listenerBridge.Start();
                UpdateStatusUI(true);
            }
        }

        private void LogoutBtn_Click(object sender, RoutedEventArgs e)
        {
            _listenerBridge.Stop();
            ClearSavedToken();
            _apiClient.ApiKey = string.Empty;
            SettingsModal.Visibility = Visibility.Collapsed;
            ShowActivationView();
        }

        private void StartStopBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_listenerBridge.IsRunning)
            {
                _listenerBridge.Stop();
                StartStopBtn.Content = "Запустить";
                StartStopBtn.Background = new SolidColorBrush(Color.FromRgb(0x14, 0x18, 0x24));
                StartStopBtn.Foreground = new SolidColorBrush(Color.FromRgb(0xf8, 0xfa, 0xfc));
                UpdateStatusUI(false);
            }
            else
            {
                _listenerBridge.Start();
                StartStopBtn.Content = "Остановить";
                StartStopBtn.Background = new SolidColorBrush(Color.FromRgb(0x10, 0xb9, 0x81));
                StartStopBtn.Foreground = new SolidColorBrush(Color.FromRgb(0x04, 0x12, 0x0c));
                UpdateStatusUI(true);
            }
        }

        private async void OnDonationDetected(DonationEvent donation)
        {
            await _apiClient.SendDonationAsync(donation);
            AddDonationToFeed(donation.Sender, donation.Amount, donation.Message, donation.SourceLabel);
        }

        private async void TestDonation_Click(object sender, RoutedEventArgs e)
        {
            var testDonation = new DonationEvent
            {
                Amount = 5000,
                Sender = "Данияр К.",
                Message = "Красавчик, топовый стрим! (Тест из TengeAlert Desktop)",
                SourceLabel = "Kaspi Gold",
                Bank = "kaspi_gold",
                RawText = "Перевод 5 000 ₸ от Данияр К. с сообщением «Красавчик, топовый стрим!»"
            };

            await _apiClient.SendDonationAsync(testDonation);
            AddDonationToFeed(testDonation.Sender, testDonation.Amount, testDonation.Message, testDonation.SourceLabel);
        }

        private async void SkipTtsBtn_Click(object sender, RoutedEventArgs e)
        {
            await _apiClient.SkipTtsAsync();
        }

        private async void SkipAlertBtn_Click(object sender, RoutedEventArgs e)
        {
            await _apiClient.SkipAlertAsync();
        }

        private async void ClearScreenBtn_Click(object sender, RoutedEventArgs e)
        {
            await _apiClient.ClearScreenAsync();
        }

        private void AddDonationToFeed(string sender, int amount, string message, string bank)
        {
            Dispatcher.Invoke(() =>
            {
                EmptyFeedPanel.Visibility = Visibility.Collapsed;
                FeedScrollViewer.Visibility = Visibility.Visible;

                var card = new Border
                {
                    Background = new SolidColorBrush(Color.FromRgb(0x14, 0x19, 0x26)),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(0x22, 0x2b, 0x3d)),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(8),
                    Padding = new Thickness(12, 10, 12, 10),
                    Margin = new Thickness(0, 0, 0, 8)
                };

                var grid = new Grid();
                grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                var leftStack = new StackPanel();
                var time = DateTime.Now.ToString("HH:mm:ss");
                var topMeta = new TextBlock
                {
                    Text = $"{time} • {bank} • {sender}",
                    FontSize = 11,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x8a, 0x99, 0xad))
                };
                leftStack.Children.Add(topMeta);

                if (!string.IsNullOrWhiteSpace(message))
                {
                    var msgBlock = new TextBlock
                    {
                        Text = $"«{message}»",
                        FontSize = 12,
                        Foreground = new SolidColorBrush(Color.FromRgb(0xf8, 0xfa, 0xfc)),
                        Margin = new Thickness(0, 3, 0, 0)
                    };
                    leftStack.Children.Add(msgBlock);
                }

                Grid.SetColumn(leftStack, 0);
                grid.Children.Add(leftStack);

                var amountBlock = new TextBlock
                {
                    Text = $"+{amount:N0} ₸".Replace(",", " "),
                    FontSize = 14,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(0x10, 0xb9, 0x81)),
                    VerticalAlignment = VerticalAlignment.Center
                };
                Grid.SetColumn(amountBlock, 1);
                grid.Children.Add(amountBlock);

                card.Child = grid;
                FeedListPanel.Children.Insert(0, card);
            });
        }

        private void ClearFeed_Click(object sender, RoutedEventArgs e)
        {
            FeedListPanel.Children.Clear();
            FeedScrollViewer.Visibility = Visibility.Collapsed;
            EmptyFeedPanel.Visibility = Visibility.Visible;
        }

        private void PairPhoneBtn_Click(object sender, RoutedEventArgs e)
        {
            PhoneModal.Visibility = Visibility.Visible;
        }

        private void ClosePhoneModal_Click(object sender, RoutedEventArgs e)
        {
            PhoneModal.Visibility = Visibility.Collapsed;
        }

        private void OpenBluetoothSettings_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo("ms-settings:bluetooth") { UseShellExecute = true });
            }
            catch {}
        }

        private void OpenSettingsBtn_Click(object sender, RoutedEventArgs e)
        {
            SettingsModal.Visibility = Visibility.Visible;
        }

        private void CloseSettingsModal_Click(object sender, RoutedEventArgs e)
        {
            SettingsModal.Visibility = Visibility.Collapsed;
        }

        private void UpdateStatusUI(bool active)
        {
            if (active)
            {
                StatusDot.Fill = new SolidColorBrush(Color.FromRgb(0x10, 0xb9, 0x81));
                StatusText.Text = "Служба активна";
                StatusText.Foreground = new SolidColorBrush(Color.FromRgb(0x10, 0xb9, 0x81));
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
