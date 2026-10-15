using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Windows.Forms;

namespace TengeAlert.Windows
{
    public class Program
    {
        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainWindowForm());
        }
    }

    public class MainWindowForm : Form
    {
        // Colors from TengeAlert Fintech Theme
        private readonly Color ColorBg = Color.FromArgb(9, 10, 15);
        private readonly Color ColorCard = Color.FromArgb(16, 20, 32);
        private readonly Color ColorCardBorder = Color.FromArgb(28, 36, 54);
        private readonly Color ColorEmerald = Color.FromArgb(16, 185, 129);
        private readonly Color ColorTextLight = Color.FromArgb(248, 250, 252);
        private readonly Color ColorTextMuted = Color.FromArgb(138, 153, 173);
        private readonly Color ColorButtonDark = Color.FromArgb(20, 24, 36);
        private readonly Color ColorButtonBorder = Color.FromArgb(34, 43, 61);

        private readonly string settingsFolder;
        private readonly string tokenFile;
        private string streamerToken = "";
        private string serverUrl = "https://tengealert.kz";
        private bool isServiceRunning = true;

        // UI Panels
        private Panel panelActivation;
        private Panel panelMainDeck;

        // Activation Controls
        private TextBox txtToken;

        // Deck Controls
        private Button btnStartStop;
        private Label lblStatusDot;
        private Label lblStatusText;
        private ListView listFeed;
        private Label lblEmptyFeed;

        public MainWindowForm()
        {
            this.Text = "TengeAlert Desktop";
            this.Size = new Size(880, 620);
            this.MinimumSize = new Size(780, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = ColorBg;
            this.ForeColor = ColorTextLight;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            settingsFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TengeAlert");
            tokenFile = Path.Combine(settingsFolder, "streamer_token.txt");

            // Check if local dev server is active
            CheckLocalServer();

            InitializeViews();
            LoadTokenAndSwitchView();
        }

        private void CheckLocalServer()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/health");
                req.Timeout = 500;
                req.Method = "GET";
                using (var res = (HttpWebResponse)req.GetResponse())
                {
                    if (res.StatusCode == HttpStatusCode.OK)
                    {
                        serverUrl = "http://localhost:3000";
                    }
                }
            }
            catch
            {
                serverUrl = "https://tengealert.kz";
            }
        }

        private void InitializeViews()
        {
            // 1. ACTIVATION VIEW
            panelActivation = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = ColorBg,
                Visible = false
            };
            this.Controls.Add(panelActivation);

            Panel cardActivation = new Panel
            {
                Size = new Size(440, 320),
                BackColor = ColorCard,
                Location = new Point((this.ClientSize.Width - 440) / 2, (this.ClientSize.Height - 320) / 2)
            };
            cardActivation.Paint += (s, e) =>
            {
                using (Pen pen = new Pen(ColorCardBorder, 1))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, cardActivation.Width - 1, cardActivation.Height - 1);
                }
            };
            panelActivation.Controls.Add(cardActivation);
            panelActivation.Resize += (s, e) =>
            {
                cardActivation.Location = new Point((panelActivation.Width - cardActivation.Width) / 2, (panelActivation.Height - cardActivation.Height) / 2);
            };

            Label logoBadge = new Label
            {
                Text = "₸",
                Size = new Size(46, 46),
                BackColor = ColorEmerald,
                ForeColor = Color.FromArgb(4, 18, 12),
                Font = new Font("Segoe UI", 22, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point((cardActivation.Width - 46) / 2, 24)
            };
            cardActivation.Controls.Add(logoBadge);

            Label lblActTitle = new Label
            {
                Text = "TengeAlert — Вход",
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                ForeColor = ColorTextLight,
                TextAlign = ContentAlignment.MiddleCenter,
                Size = new Size(cardActivation.Width, 30),
                Location = new Point(0, 80)
            };
            cardActivation.Controls.Add(lblActTitle);

            Label lblActSub = new Label
            {
                Text = "Введите персональный токен стримера из личного кабинета",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                ForeColor = ColorTextMuted,
                TextAlign = ContentAlignment.MiddleCenter,
                Size = new Size(cardActivation.Width, 20),
                Location = new Point(0, 114)
            };
            cardActivation.Controls.Add(lblActSub);

            txtToken = new TextBox
            {
                Size = new Size(340, 32),
                Location = new Point(50, 150),
                BackColor = Color.FromArgb(7, 10, 15),
                ForeColor = ColorTextLight,
                Font = new Font("Segoe UI", 11),
                PasswordChar = '•'
            };
            cardActivation.Controls.Add(txtToken);

            Button btnLogin = CreateStyledButton("Войти в аккаунт", ColorEmerald, Color.FromArgb(4, 18, 12), new Size(340, 42), new Point(50, 200));
            btnLogin.Font = new Font("Segoe UI", 11, FontStyle.Bold);
            btnLogin.Click += (s, e) =>
            {
                string token = txtToken.Text.Trim();
                if (string.IsNullOrEmpty(token))
                {
                    MessageBox.Show("Введите токен стримера из личного кабинета.", "TengeAlert", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                SaveToken(token);
                streamerToken = token;
                ShowMainDeck();
            };
            cardActivation.Controls.Add(btnLogin);

            Label lblHelp = new Label
            {
                Text = "Токен находится в кабинете: tengealert.kz/dashboard/",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(100, 116, 139),
                TextAlign = ContentAlignment.MiddleCenter,
                Size = new Size(cardActivation.Width, 20),
                Location = new Point(0, 260)
            };
            cardActivation.Controls.Add(lblHelp);

            // 2. MAIN DECK VIEW
            panelMainDeck = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = ColorBg,
                Padding = new Padding(20),
                Visible = false
            };
            this.Controls.Add(panelMainDeck);

            // Header Panel
            Panel pnlHeader = new Panel { Dock = DockStyle.Top, Height = 56, BackColor = ColorBg };
            panelMainDeck.Controls.Add(pnlHeader);

            Label headerBadge = new Label
            {
                Text = "₸",
                Size = new Size(34, 34),
                BackColor = ColorEmerald,
                ForeColor = Color.FromArgb(4, 18, 12),
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(0, 4)
            };
            pnlHeader.Controls.Add(headerBadge);

            Label headerTitle = new Label
            {
                Text = "TengeAlert Desktop",
                Font = new Font("Segoe UI", 13, FontStyle.Bold),
                ForeColor = ColorTextLight,
                Location = new Point(44, 4),
                AutoSize = true
            };
            pnlHeader.Controls.Add(headerTitle);

            Label headerSub = new Label
            {
                Text = "Шлюз мгновенного перехвата Kaspi и Halyk (< 5 мс)",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = ColorTextMuted,
                Location = new Point(44, 26),
                AutoSize = true
            };
            pnlHeader.Controls.Add(headerSub);

            // Status Indicator (Right aligned)
            Panel pnlStatus = new Panel
            {
                Size = new Size(130, 30),
                BackColor = Color.FromArgb(16, 30, 25),
                Location = new Point(this.ClientSize.Width - 250, 6),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            pnlStatus.Paint += (s, e) =>
            {
                using (Pen p = new Pen(ColorEmerald, 1)) { e.Graphics.DrawRectangle(p, 0, 0, pnlStatus.Width - 1, pnlStatus.Height - 1); }
            };
            pnlHeader.Controls.Add(pnlStatus);

            lblStatusDot = new Label
            {
                Text = "●",
                ForeColor = ColorEmerald,
                Font = new Font("Segoe UI", 10),
                Location = new Point(8, 5),
                AutoSize = true
            };
            pnlStatus.Controls.Add(lblStatusDot);

            lblStatusText = new Label
            {
                Text = "Служба активна",
                ForeColor = ColorEmerald,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                Location = new Point(26, 7),
                AutoSize = true
            };
            pnlStatus.Controls.Add(lblStatusText);

            Button btnSettings = CreateStyledButton("Настройки", ColorButtonDark, ColorTextLight, new Size(88, 30), new Point(this.ClientSize.Width - 110, 6));
            btnSettings.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnSettings.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            btnSettings.Click += (s, e) => OpenSettingsDialog();
            pnlHeader.Controls.Add(btnSettings);

            // Bottom Footer Panel
            Panel pnlFooter = new Panel { Dock = DockStyle.Bottom, Height = 30, BackColor = ColorBg };
            panelMainDeck.Controls.Add(pnlFooter);

            Label lblFooterLeft = new Label
            {
                Text = "Задержка передачи в OBS: < 5 мс • WinRT & Phone Link • Прямой P2P без комиссии",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(71, 85, 105),
                Dock = DockStyle.Left,
                AutoSize = true
            };
            pnlFooter.Controls.Add(lblFooterLeft);

            Label lblFooterRight = new Label
            {
                Text = "tengealert.kz • v1.0.0",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(71, 85, 105),
                Dock = DockStyle.Right,
                AutoSize = true
            };
            pnlFooter.Controls.Add(lblFooterRight);

            // Work Area Panel
            Panel pnlWorkArea = new Panel { Dock = DockStyle.Fill, BackColor = ColorBg };
            panelMainDeck.Controls.Add(pnlWorkArea);

            // LEFT SIDEBAR (Streamer Controls Deck)
            Panel pnlSidebar = new Panel
            {
                Dock = DockStyle.Left,
                Width = 230,
                BackColor = ColorBg,
                Padding = new Padding(0, 8, 16, 0)
            };
            pnlWorkArea.Controls.Add(pnlSidebar);

            btnStartStop = CreateStyledButton("■ Остановить", ColorEmerald, Color.FromArgb(4, 18, 12), new Size(214, 46), new Point(0, 8));
            btnStartStop.Font = new Font("Segoe UI", 11, FontStyle.Bold);
            btnStartStop.Click += (s, e) =>
            {
                isServiceRunning = !isServiceRunning;
                if (isServiceRunning)
                {
                    btnStartStop.Text = "■ Остановить";
                    btnStartStop.BackColor = ColorEmerald;
                    btnStartStop.ForeColor = Color.FromArgb(4, 18, 12);
                    lblStatusDot.ForeColor = ColorEmerald;
                    lblStatusText.Text = "Служба активна";
                    lblStatusText.ForeColor = ColorEmerald;
                }
                else
                {
                    btnStartStop.Text = "▶ Запустить";
                    btnStartStop.BackColor = ColorButtonDark;
                    btnStartStop.ForeColor = ColorTextLight;
                    lblStatusDot.ForeColor = Color.FromArgb(239, 68, 68);
                    lblStatusText.Text = "Остановлена";
                    lblStatusText.ForeColor = Color.FromArgb(239, 68, 68);
                }
            };
            pnlSidebar.Controls.Add(btnStartStop);

            // Phone Source Box
            Panel pnlPhoneBox = new Panel { Size = new Size(214, 84), Location = new Point(0, 64), BackColor = ColorCard };
            pnlPhoneBox.Paint += (s, e) => { using (Pen p = new Pen(ColorCardBorder, 1)) { e.Graphics.DrawRectangle(p, 0, 0, pnlPhoneBox.Width - 1, pnlPhoneBox.Height - 1); } };
            pnlSidebar.Controls.Add(pnlPhoneBox);

            Label lblPhoneTitle = new Label { Text = "ИСТОЧНИК ПУШЕЙ", Font = new Font("Segoe UI", 7.5f, FontStyle.Bold), ForeColor = Color.FromArgb(100, 116, 139), Location = new Point(10, 8), AutoSize = true };
            pnlPhoneBox.Controls.Add(lblPhoneTitle);

            Label lblPhoneStatus = new Label { Text = "● Связь с телефоном (ПК)", Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), ForeColor = ColorTextLight, Location = new Point(10, 26), AutoSize = true };
            pnlPhoneBox.Controls.Add(lblPhoneStatus);

            Button btnPhonePair = CreateStyledButton("Подключить телефон", ColorButtonDark, ColorTextLight, new Size(194, 26), new Point(10, 48));
            btnPhonePair.Font = new Font("Segoe UI", 8f);
            btnPhonePair.Click += (s, e) => OpenPhoneDialog();
            pnlPhoneBox.Controls.Add(btnPhonePair);

            // Controls Title
            Label lblDeckTitle = new Label { Text = "УПРАВЛЕНИЕ ЭФИРОМ", Font = new Font("Segoe UI", 7.5f, FontStyle.Bold), ForeColor = Color.FromArgb(100, 116, 139), Location = new Point(0, 160), AutoSize = true };
            pnlSidebar.Controls.Add(lblDeckTitle);

            Button btnTestDonation = CreateStyledButton("🎁 Тестовый донат (5 000 ₸)", ColorButtonDark, ColorTextLight, new Size(214, 38), new Point(0, 180));
            btnTestDonation.Click += (s, e) => SendTestDonation();
            pnlSidebar.Controls.Add(btnTestDonation);

            Button btnSkipTts = CreateStyledButton("🎙 Скип озвучки (Mute TTS)", ColorButtonDark, ColorTextLight, new Size(214, 38), new Point(0, 226));
            btnSkipTts.Click += (s, e) => SendControlCommand("/api/streamer/skip-tts", "Озвучка TTS заглушена");
            pnlSidebar.Controls.Add(btnSkipTts);

            Button btnSkipAlert = CreateStyledButton("⏭ Скип алерта (Next)", ColorButtonDark, ColorTextLight, new Size(214, 38), new Point(0, 272));
            btnSkipAlert.Click += (s, e) => SendControlCommand("/api/streamer/skip-alert", "Текущий алерт пропущен");
            pnlSidebar.Controls.Add(btnSkipAlert);

            Button btnClearScreen = CreateStyledButton("🧹 Очистить экран OBS", ColorButtonDark, ColorTextLight, new Size(214, 38), new Point(0, 318));
            btnClearScreen.Click += (s, e) => SendControlCommand("/api/streamer/clear-screen", "Экран OBS очищен");
            pnlSidebar.Controls.Add(btnClearScreen);

            // RIGHT CONTENT (Top Stats & Feed)
            Panel pnlRight = new Panel { Dock = DockStyle.Fill, BackColor = ColorBg, Padding = new Padding(0, 8, 0, 0) };
            pnlWorkArea.Controls.Add(pnlRight);

            // Top Stats (Top Stream / Month)
            TableLayoutPanel pnlStats = new TableLayoutPanel { Dock = DockStyle.Top, Height = 64, ColumnCount = 2, BackColor = ColorBg };
            pnlStats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            pnlStats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            pnlRight.Controls.Add(pnlStats);

            Panel cardTopStream = CreateStatsCard("ТОП СТРИМА", "Ожидание донатов в эфире...", Color.FromArgb(229, 169, 60));
            pnlStats.Controls.Add(cardTopStream, 0, 0);

            Panel cardTopMonth = CreateStatsCard("ТОП МЕСЯЦА", "Синхронизация с сервером...", ColorEmerald);
            pnlStats.Controls.Add(cardTopMonth, 1, 0);

            // Feed Container
            Panel pnlFeedContainer = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard, Margin = new Padding(0, 10, 0, 0) };
            pnlFeedContainer.Paint += (s, e) => { using (Pen p = new Pen(ColorCardBorder, 1)) { e.Graphics.DrawRectangle(p, 0, 0, pnlFeedContainer.Width - 1, pnlFeedContainer.Height - 1); } };
            pnlRight.Controls.Add(pnlFeedContainer);

            Panel pnlFeedHeader = new Panel { Dock = DockStyle.Top, Height = 34, BackColor = ColorCard, Padding = new Padding(12, 8, 12, 0) };
            pnlFeedContainer.Controls.Add(pnlFeedHeader);

            Label lblFeedTitle = new Label { Text = "ЛЕНТА ДОНАТОВ В РЕАЛЬНОМ ВРЕМЕНИ", Font = new Font("Segoe UI", 8f, FontStyle.Bold), ForeColor = ColorTextMuted, Dock = DockStyle.Left, AutoSize = true };
            pnlFeedHeader.Controls.Add(lblFeedTitle);

            Button btnClearFeed = new Button { Text = "Очистить", FlatStyle = FlatStyle.Flat, ForeColor = Color.FromArgb(100, 116, 139), BackColor = Color.Transparent, Dock = DockStyle.Right, AutoSize = true, Cursor = Cursors.Hand };
            btnClearFeed.FlatAppearance.BorderSize = 0;
            btnClearFeed.Click += (s, e) => { listFeed.Items.Clear(); lblEmptyFeed.Visible = true; };
            pnlFeedHeader.Controls.Add(btnClearFeed);

            listFeed = new ListView
            {
                Dock = DockStyle.Fill,
                BackColor = ColorCard,
                ForeColor = ColorTextLight,
                BorderStyle = BorderStyle.None,
                View = View.Details,
                FullRowSelect = true,
                Font = new Font("Segoe UI", 9.5f)
            };
            listFeed.Columns.Add("Время", 70);
            listFeed.Columns.Add("Банк", 90);
            listFeed.Columns.Add("Отправитель", 130);
            listFeed.Columns.Add("Сообщение", 230);
            listFeed.Columns.Add("Сумма", 90);
            pnlFeedContainer.Controls.Add(listFeed);

            lblEmptyFeed = new Label
            {
                Text = "Лента пустая, ожидание входящих донатов...\nНажмите «Тестовый донат» для проверки алерта в OBS.",
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = Color.FromArgb(100, 116, 139),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill
            };
            pnlFeedContainer.Controls.Add(lblEmptyFeed);
            lblEmptyFeed.BringToFront();
        }

        private Panel CreateStatsCard(string title, string defaultVal, Color accent)
        {
            Panel p = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard, Margin = new Padding(0, 0, 6, 0) };
            p.Paint += (s, e) => { using (Pen pen = new Pen(ColorCardBorder, 1)) { e.Graphics.DrawRectangle(pen, 0, 0, p.Width - 1, p.Height - 1); } };

            Label lblT = new Label { Text = title, Font = new Font("Segoe UI", 7.5f, FontStyle.Bold), ForeColor = accent, Location = new Point(10, 8), AutoSize = true };
            p.Controls.Add(lblT);

            Label lblV = new Label { Text = defaultVal, Font = new Font("Segoe UI", 9f), ForeColor = ColorTextMuted, Location = new Point(10, 26), AutoSize = true };
            p.Controls.Add(lblV);

            return p;
        }

        private Button CreateStyledButton(string text, Color bg, Color fg, Size size, Point loc)
        {
            Button btn = new Button
            {
                Text = text,
                Size = size,
                Location = loc,
                BackColor = bg,
                ForeColor = fg,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderColor = ColorButtonBorder;
            btn.FlatAppearance.BorderSize = (bg == ColorEmerald) ? 0 : 1;
            return btn;
        }

        private void LoadTokenAndSwitchView()
        {
            try
            {
                if (File.Exists(tokenFile))
                {
                    streamerToken = File.ReadAllText(tokenFile).Trim();
                }
            }
            catch { }

            if (string.IsNullOrEmpty(streamerToken))
            {
                panelActivation.Visible = true;
                panelMainDeck.Visible = false;
            }
            else
            {
                ShowMainDeck();
            }
        }

        private void ShowMainDeck()
        {
            panelActivation.Visible = false;
            panelMainDeck.Visible = true;
        }

        private void SaveToken(string token)
        {
            try
            {
                Directory.CreateDirectory(settingsFolder);
                File.WriteAllText(tokenFile, token.Trim());
            }
            catch { }
        }

        private void SendTestDonation()
        {
            try
            {
                string url = serverUrl + "/api/push";
                string json = "{\"source\":\"kaspi_gold\",\"text\":\"Перевод 5 000 ₸ от Данияр К. с сообщением «Красавчик, топовый стрим!»\",\"parsed\":{\"amount\":5000,\"sender\":\"Данияр К.\",\"message\":\"Красавчик, топовый стрим!\"}}";
                
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "POST";
                req.ContentType = "application/json";
                req.Timeout = 3000;
                if (!string.IsNullOrEmpty(streamerToken))
                {
                    req.Headers["X-TengeAlert-Key"] = streamerToken;
                }

                byte[] bytes = Encoding.UTF8.GetBytes(json);
                req.ContentLength = bytes.Length;
                using (var stream = req.GetRequestStream())
                {
                    stream.Write(bytes, 0, bytes.Length);
                }

                using (var res = req.GetResponse()) { }

                AddFeedItem(DateTime.Now.ToString("HH:mm:ss"), "Kaspi Gold", "Данияр К.", "Красавчик, топовый стрим!", "+5 000 ₸");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Ошибка отправки тестового доната: " + ex.Message, "TengeAlert", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void SendControlCommand(string endpoint, string successMessage)
        {
            try
            {
                string url = serverUrl + endpoint;
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "POST";
                req.Timeout = 2500;
                if (!string.IsNullOrEmpty(streamerToken))
                {
                    req.Headers["X-TengeAlert-Key"] = streamerToken;
                }
                req.ContentLength = 0;
                using (var res = req.GetResponse()) { }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Команда не выполнена: " + ex.Message, "TengeAlert", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void AddFeedItem(string time, string bank, string sender, string msg, string amount)
        {
            lblEmptyFeed.Visible = false;
            var item = new ListViewItem(time);
            item.SubItems.Add(bank);
            item.SubItems.Add(sender);
            item.SubItems.Add(msg);
            item.SubItems.Add(amount);
            item.ForeColor = ColorEmerald;
            listFeed.Items.Insert(0, item);
        }

        private void OpenPhoneDialog()
        {
            Form dlg = new Form
            {
                Text = "Подключение смартфона (Kaspi / Halyk)",
                Size = new Size(520, 360),
                BackColor = ColorBg,
                ForeColor = ColorTextLight,
                StartPosition = FormStartPosition.CenterParent,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false
            };

            Label title = new Label { Text = "Инструкция по подключению пушей", Font = new Font("Segoe UI", 12, FontStyle.Bold), Location = new Point(20, 16), AutoSize = true };
            dlg.Controls.Add(title);

            TextBox txt = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                BackColor = ColorCard,
                ForeColor = ColorTextMuted,
                Font = new Font("Segoe UI", 9.5f),
                Size = new Size(460, 220),
                Location = new Point(20, 50),
                BorderStyle = BorderStyle.FixedSingle,
                Text = "СПОСОБ 1: Windows «Связь с телефоном» (Рекомендуется для Android)\r\n" +
                       "1. Откройте штатное приложение «Связь с телефоном» в Windows 10/11.\r\n" +
                       "2. Сопрягите смартфон и включите доступ к уведомлениям Kaspi и Halyk.\r\n" +
                       "TengeAlert перехватывает пуши мгновенно через WinRT API.\r\n\r\n" +
                       "СПОСОБ 2: Прямой Bluetooth (Для iPhone по Apple ANCS)\r\n" +
                       "1. Подключите iPhone к ПК в Параметрах Bluetooth Windows.\r\n" +
                       "2. На iPhone: Настройки -> Bluetooth -> этот ПК -> включить «Показывать уведомления».\r\n" +
                       "3. Пуши Kaspi поступают даже с заблокированным экраном."
            };
            dlg.Controls.Add(txt);

            Button btnBt = CreateStyledButton("Параметры Bluetooth", ColorButtonDark, ColorTextLight, new Size(160, 32), new Point(20, 280));
            btnBt.Click += (s, e) => { try { Process.Start("ms-settings:bluetooth"); } catch { } };
            dlg.Controls.Add(btnBt);

            Button btnClose = CreateStyledButton("Закрыть", ColorEmerald, Color.FromArgb(4, 18, 12), new Size(100, 32), new Point(380, 280));
            btnClose.Click += (s, e) => dlg.Close();
            dlg.Controls.Add(btnClose);

            dlg.ShowDialog(this);
        }

        private void OpenSettingsDialog()
        {
            Form dlg = new Form
            {
                Text = "Настройки TengeAlert",
                Size = new Size(460, 340),
                BackColor = ColorBg,
                ForeColor = ColorTextLight,
                StartPosition = FormStartPosition.CenterParent,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false
            };

            Label title = new Label { Text = "Парсеры банков Казахстана", Font = new Font("Segoe UI", 11, FontStyle.Bold), Location = new Point(20, 16), AutoSize = true };
            dlg.Controls.Add(title);

            CheckBox cbKaspi = new CheckBox { Text = "Kaspi Gold", Checked = true, Location = new Point(24, 46), AutoSize = true, ForeColor = ColorTextLight };
            CheckBox cbKaspiPay = new CheckBox { Text = "Kaspi Pay", Checked = true, Location = new Point(160, 46), AutoSize = true, ForeColor = ColorTextLight };
            CheckBox cbHalyk = new CheckBox { Text = "Halyk Bank", Checked = true, Location = new Point(280, 46), AutoSize = true, ForeColor = ColorTextLight };
            dlg.Controls.Add(cbKaspi);
            dlg.Controls.Add(cbKaspiPay);
            dlg.Controls.Add(cbHalyk);

            Label hotkeysTitle = new Label { Text = "Горячие клавиши (Hotkeys)", Font = new Font("Segoe UI", 11, FontStyle.Bold), Location = new Point(20, 90), AutoSize = true };
            dlg.Controls.Add(hotkeysTitle);

            Label lblHk1 = new Label { Text = "Скип озвучки (Mute TTS): Ctrl + Shift + F10", Font = new Font("Segoe UI", 9f), ForeColor = ColorTextMuted, Location = new Point(24, 120), AutoSize = true };
            Label lblHk2 = new Label { Text = "Скип алерта (Next):       Ctrl + Shift + F9", Font = new Font("Segoe UI", 9f), ForeColor = ColorTextMuted, Location = new Point(24, 144), AutoSize = true };
            dlg.Controls.Add(lblHk1);
            dlg.Controls.Add(lblHk2);

            Button btnLogout = CreateStyledButton("Выйти из аккаунта", Color.FromArgb(127, 29, 29), ColorTextLight, new Size(160, 34), new Point(20, 240));
            btnLogout.Click += (s, e) =>
            {
                try { if (File.Exists(tokenFile)) File.Delete(tokenFile); } catch { }
                streamerToken = "";
                dlg.Close();
                panelMainDeck.Visible = false;
                panelActivation.Visible = true;
            };
            dlg.Controls.Add(btnLogout);

            Button btnSave = CreateStyledButton("Сохранить", ColorEmerald, Color.FromArgb(4, 18, 12), new Size(110, 34), new Point(310, 240));
            btnSave.Click += (s, e) => dlg.Close();
            dlg.Controls.Add(btnSave);

            dlg.ShowDialog(this);
        }
    }
}
