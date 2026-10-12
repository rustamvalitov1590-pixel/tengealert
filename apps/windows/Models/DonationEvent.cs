using System;
using System.Text.Json.Serialization;

namespace TengeAlert.Windows.Models
{
    public class DonationEvent
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString("N");

        [JsonPropertyName("source_type")]
        public string SourceType { get; set; } = "transfer";

        [JsonPropertyName("source_label")]
        public string SourceLabel { get; set; } = "Мгновенный перевод";

        [JsonPropertyName("amount")]
        public int Amount { get; set; }

        [JsonPropertyName("currency")]
        public string Currency { get; set; } = "KZT";

        [JsonPropertyName("sender")]
        public string Sender { get; set; } = "Аноним";

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("bank")]
        public string Bank { get; set; } = "kaspi";

        [JsonPropertyName("received_at")]
        public string ReceivedAt { get; set; } = DateTime.UtcNow.ToString("o");

        [JsonPropertyName("raw_text")]
        public string RawText { get; set; } = string.Empty;
    }
}
