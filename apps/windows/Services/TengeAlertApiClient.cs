using System;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using TengeAlert.Windows.Models;

namespace TengeAlert.Windows.Services
{
    public class TengeAlertApiClient
    {
        private readonly HttpClient _httpClient;
        private readonly ConcurrentQueue<DonationEvent> _offlineQueue = new();
        public string ServerUrl { get; set; } = "http://localhost:3000";
        public string ApiKey { get; set; } = string.Empty;
        public event Action<string>? OnStatus;

        public TengeAlertApiClient()
        {
            _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        }

        public async Task<bool> SendDonationAsync(DonationEvent donation)
        {
            string url = $"{ServerUrl.TrimEnd('/')}/api/push";
            var payload = new
            {
                source = donation.Bank,
                text = donation.RawText,
                parsed = new
                {
                    amount = donation.Amount,
                    sender = donation.Sender,
                    message = donation.Message
                }
            };

            string json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            try
            {
                var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
                if (!string.IsNullOrWhiteSpace(ApiKey))
                {
                    req.Headers.Add("X-TengeAlert-Key", ApiKey);
                }

                var resp = await _httpClient.SendAsync(req);
                if (resp.IsSuccessStatusCode)
                {
                    OnStatus?.Invoke($"[API OK] Донат {donation.Amount} ₸ успешно отправлен в OBS шлюз.");
                    // Flush any pending queue
                    _ = FlushQueueAsync();
                    return true;
                }
                else
                {
                    OnStatus?.Invoke($"[API Warn] Сервер ответил статусом: {resp.StatusCode}. Добавлен в очередь повтора.");
                    _offlineQueue.Enqueue(donation);
                    return false;
                }
            }
            catch (Exception ex)
            {
                OnStatus?.Invoke($"[API Offline] Ошибка связи ({ex.Message}). Донат сохранен в оффлайн-очередь.");
                _offlineQueue.Enqueue(donation);
                return false;
            }
        }

        private async Task FlushQueueAsync()
        {
            while (_offlineQueue.TryDequeue(out var pending))
            {
                try
                {
                    bool sent = await SendDonationAsync(pending);
                    if (!sent)
                    {
                        break;
                    }
                }
                catch
                {
                    break;
                }
            }
        }
    }
}
