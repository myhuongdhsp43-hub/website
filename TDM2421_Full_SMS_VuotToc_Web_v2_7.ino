#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <math.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// TDM2421 HW 2.1: ESP32-C3 <-> Quectel EG800K.
// Pins below are confirmed by the original V2 board-test source.
#define MODEM_RX_PIN 20
#define MODEM_TX_PIN 21
#define MODEM_EN_PIN 2
#define MODEM_BAUD 115200
#define USB_BAUD 115200

// CẤU HÌNH CHÂN CÒI BÁO ĐỘNG (BUZZER GPIO):
// Kích hoạt đồng thời GPIO 6 (chính) cùng GPIO 5 và GPIO 7 (dự phòng các chân cọc header)
#define BUZZER_PIN 6
#define BUZZER_PIN_ALT1 5
#define BUZZER_PIN_ALT2 7
#define BUZZER_ACTIVE_HIGH true

// ============================================================================
// CẤU HÌNH GHÉP ĐÔI MÃ QR, BLUETOOTH & XÁC MINH HỌC SINH (PAIRING & ACTIVATION)
// ============================================================================
// Mã xác thực phần cứng mặc định (dùng khi Flash chưa lưu):
#define DEFAULT_VERIFY_SECRET "9824"    // Mã xác minh phần cứng (từ 1 đến 1 tỷ)
#define DEFAULT_DEVICE_ID     "XE01"    // Mã thiết bị mặc định
#define DEFAULT_DEVICE_TOKEN  ""        // Để trống! KHÔNG cố định token, bo mạch tự nạp vào Flash khi ghép nối!
#define PAIR_BUTTON_PIN 9       // Nút bấm kích hoạt ghép đôi trên bo mạch ESP32-C3 (nút BOOT GPIO9)
#define PAIR_REQUEST_URL "https://website.myhuongdhsp43.workers.dev/api/device/pair-request"
#define DEVICE_TOKEN_URL "https://website.myhuongdhsp43.workers.dev/api/device/token"

// BLE Bluetooth Low Energy UUIDs cho chế độ ghép nối Bluetooth không dây:
#define BLE_SERVICE_UUID    "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_CHAR_READ_UUID  "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define BLE_CHAR_WRITE_UUID "cba1d466-344c-4be3-ab3f-189f80dd7518"

// SMS VƯỢT TỐC GỬI TRỰC TIẾP BẰNG SIM EG800K, KHÔNG PHỤ THUỘC WEB.
// Điền số theo chuẩn quốc tế: 0912345678 -> +84912345678.
// Để trống số không dùng. Có thể gửi đồng thời cho tối đa 3 số.
#define LOCAL_OVERSPEED_SMS_ENABLED true
#define LOCAL_HELMET_SMS_ENABLED true
#define PARENT_SMS_PHONE_1 "+84988529005" //đổi sdt nhận tin nhắn cảnh báo tại đây, Lưu ý không được bỏ +84
#define PARENT_SMS_PHONE_2 ""
#define PARENT_SMS_PHONE_3 ""
// Website is public, so this value can stay empty. Only use it again if the
// hosting layer is later made private.
#define SITE_ACCESS_TOKEN ""
#define CELLULAR_APN "v-internet"  // Viettel Việt Nam.
// Website Cloudflare Worker URLs chính thức:
#define TELEMETRY_URL "https://website.myhuongdhsp43.workers.dev/api/device/telemetry"
#define REMOTE_ALARM_ACK_URL "https://website.myhuongdhsp43.workers.dev/api/device/acknowledge-remote-alarm"

// Optional helmet sensor link (ESP32-C3 Super Mini -> this ESP32-C3).
// ESP-NOW uses no router/SIM data. Both boards must use the same channel/key.
#define HELMET_ESPNOW_CHANNEL 1
#define HELMET_ESPNOW_KEY 0xD9216B47u  // Pair ID: use a different matching value for each helmet/vehicle pair.
#define HELMET_PACKET_MAGIC 0x484C4D54u
#define HELMET_ACK_MAGIC 0x4841434Bu
static const uint32_t HELMET_PACKET_FRESH_MS = 8000;

// The EG800K has no CA certificate installed yet.  Use encrypted HTTPS with
// certificate verification disabled for this hardware bring-up.  Turn this on
// only after a real CA certificate has been uploaded to the modem UFS.
#define TLS_VERIFY_SERVER_CERTIFICATE false
#define TLS_CA_CERT_PATH "UFS:ca-cert.pem"

static const uint32_t GNSS_INTERVAL_MS = 1000;
// Leave the EG800K a short quiet period after HTTPS.  This avoids asking for
// a QGPSLOC response immediately after an LTE transmit burst, which makes an
// already marginal supply more likely to brown out.
static const uint32_t GNSS_QUIET_AFTER_HTTP_MS = 2000;
static const uint32_t TELEMETRY_MOVING_INTERVAL_MS = 5000;
static const uint32_t TELEMETRY_STOPPED_INTERVAL_MS = 5000;
static const uint32_t TELEMETRY_MAX_BACKOFF_MS = 5000;
static const uint32_t NETWORK_RETRY_INTERVAL_MS = 5000;
static const uint32_t SMS_NETWORK_RETRY_INTERVAL_MS = 5000;
static const uint32_t SMS_RETRY_DELAY_MS = 8000;
static const uint32_t MODEM_WATCHDOG_INTERVAL_MS = 120000;
static const uint32_t INITIAL_GNSS_PRIORITY_MS = 5000;
static const uint32_t MODEM_RECOVERY_INTERVAL_MS = 12000;
static const uint32_t OVERSPEED_CONFIRM_MS = 3000;
static const uint32_t HELMET_MISSING_CONFIRM_MS = 15000;
static const float HELMET_MIN_SPEED_KMH = 5.0f;
static const float OVERSPEED_HYSTERESIS_KMH = 2.0f;
// Còi báo động từ xa: 3.5 giây, nhịp dồn dập 250ms ON / 150ms OFF (rõ ràng, tiêu thụ điện tối ưu)
static const uint32_t REMOTE_ALARM_DURATION_MS = 3500;
static const uint32_t BUZZ_ON_MS = 250;
static const uint32_t BUZZ_OFF_MS = 150;
static const uint8_t SPEED_FILTER_WINDOW = 5;
static const float SPEED_EMA_ALPHA = 0.35f;
static const float SPEED_NEAR_ZERO_KMH = 1.2f;
static const float SPEED_MAX_STEP_KMH = 30.0f;

HardwareSerial &MODEM = Serial0;
Preferences preferences;

struct GNSSData {
  bool valid = false;
  String utc;
  String date;
  double latitude = NAN;
  double longitude = NAN;
  float hdop = NAN;
  float speedKmh = NAN;
  int satellites = 0;
  int fix = 0;
};

struct DeviceConfig {
  float speedLimit = 40.0f;
  bool speedAlertEnabled = true;
  bool buzzerEnabled = true;
  uint32_t version = 0;
};

DeviceConfig config;
GNSSData lastGnss;
bool modemReady = false;
bool simReady = false;
bool networkReady = false;
bool dataReady = false;
bool gnssReady = false;
bool overspeedActive = false;
bool remoteAlarmActive = false;
bool buzzerOn = false;
bool alarmSoundedReportPending = false;
String lastAlarmRequestId;
uint32_t lastAlarmSoundedAtMs = 0;
float speedSamples[SPEED_FILTER_WINDOW] = {0, 0, 0, 0, 0};
uint8_t speedSampleCount = 0;
uint8_t speedSampleIndex = 0;
float filteredSpeedKmh = 0.0f;
bool speedFilterInitialized = false;
uint32_t overspeedStartedAt = 0;
uint32_t remoteAlarmEndsAt = 0;
uint32_t buzzerPhaseAt = 0;
uint32_t lastGNSSRead = 0;
uint32_t lastTelemetryAttempt = 0;
uint32_t lastNetworkCheck = 0;
uint32_t lastSmsNetworkCheck = 0;
uint32_t lastModemWatchdog = 0;
uint32_t telemetryRetryBackoffMs = TELEMETRY_MOVING_INTERVAL_MS;
uint32_t gnssStartedAt = 0;
uint32_t lastGnssFixAt = 0;
uint32_t lastGnssNoFixReportAt = 0;
uint32_t lastModemRecoveryAttemptAt = 0;
uint32_t lastGnssStartAttemptAt = 0;
uint32_t lastHttpActivityAt = 0;
uint8_t consecutiveHttpFailures = 0;
bool cellularStarted = false;
bool currentGnssFix = false;
uint32_t modemResetCount = 0;
volatile bool helmetWorn = false;
volatile uint32_t helmetPacketAt = 0;
bool helmetReceiverReady = false;
String lastSmsJobId;
String lastSmsStatus;
bool smsWaiting = false;
uint32_t smsStartedAt = 0;
String smsResponse;
String activeDeviceId = DEFAULT_DEVICE_ID;
String activeVerifySecret = DEFAULT_VERIFY_SECRET;
String activeDeviceToken = "";
String activeTelemetryUrl = TELEMETRY_URL;
uint32_t lastTokenSyncAttemptAt = 0;
enum class SmsSource : uint8_t { NONE, WEB_JOB, LOCAL_OVERSPEED, LOCAL_HELMET, MANUAL_TEST };
SmsSource activeSmsSource = SmsSource::NONE;
// Simulation is local-only: never upload simulated speed to the website.
bool speedTestActive = false;
float speedTestKmh = 0.0f;
uint32_t speedTestStartedAt = 0;
static const uint32_t SPEED_TEST_DURATION_MS = 8500;
bool localOverspeedSmsPending = false;
uint8_t localOverspeedPhoneIndex = 0;
uint8_t localOverspeedRetryCount = 0;
uint32_t localOverspeedNextTryAt = 0;
String localOverspeedMessage;
bool localHelmetSmsPending = false;
uint8_t localHelmetPhoneIndex = 0;
String localHelmetMessage;
uint32_t helmetMissingStartedAt = 0;
bool localHelmetIncidentActive = false;
static const char *PARENT_SMS_PHONES[] = {
  PARENT_SMS_PHONE_1,
  PARENT_SMS_PHONE_2,
  PARENT_SMS_PHONE_3
};

struct HelmetPacket {
  uint32_t magic;
  uint32_t key;
  uint32_t sequence;
  uint8_t worn;
  uint8_t reserved[3];
};

struct HelmetAckPacket {
  uint32_t magic;
  uint32_t key;
  uint32_t sequence;
  uint8_t received;
  uint8_t reserved[3];
};

portMUX_TYPE helmetMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool helmetEventPending = false;
volatile uint8_t helmetSenderMac[6] = {0};
volatile uint32_t helmetSequence = 0;
volatile bool helmetEventWorn = false;
uint32_t lastHelmetLogAt = 0;
bool lastHelmetLogWorn = false;
bool helmetLogInitialized = false;

// Never print a full device token or verify code to Serial logs.
String maskSecret(const String &value) {
  return value.length() > 8 ? value.substring(0, 4) + "..." : String("***");
}

String readATResponse(uint32_t timeoutMs = 2000);
String sendAT(const String &command, uint32_t timeoutMs = 2000);
bool sendATOk(const String &command, uint32_t timeoutMs = 2000);
bool waitForToken(const String &token, String &response, uint32_t timeoutMs);
bool initModem();
bool checkSIM();
bool checkNetwork();
bool activateData();
bool reconnect4G();
bool startGNSS();
bool readGNSS(GNSSData &data);
bool parseQGPSLOC(const String &response, GNSSData &data);
bool validateGNSS(const GNSSData &data);
float filterSpeed(float rawSpeedKmh);
void checkOverspeed(float speedKmh, bool gpsValid);
void setBuzzer(bool on);
void updateBuzzer();
void executeRemoteAlarm();
void soundAlarmImmediate(uint8_t count = 5, uint16_t onMs = 220, uint16_t offMs = 130);
String createTelemetryJSON();
bool sendTelemetry();
bool parseServerConfig(const String &response);
void saveConfig();
void loadConfig();
bool postJson(const String &url, const String &body, String &responseBody);
bool postPublicJson(const String &url, const String &body, String &responseBody);
void checkPairButton();
void syncDeviceTokenIfMissing();
void initBLEPairing();
void markModemRestart(const char *source);
bool responseContainsRestart(const String &response);
void recoverDataSession();
float jsonNumber(const String &json, const char *key, float fallback);
bool jsonBoolean(const String &json, const char *key, bool fallback);
int readSignalQuality();
String gnssTimestamp(const GNSSData &data);
bool initHelmetReceiver();
bool helmetIsWorn();
String jsonString(const String &json, const char *key);
void processSmsJob(const String &response);
void pollSmsResult();
bool startSmsSend(const String &phone, const String &message, SmsSource source);
void finishSmsSend(const char *status);
void queueLocalOverspeedSms(float speedKmh);
void checkLocalHelmetSms(float speedKmh, bool gpsValid);
void queueLocalHelmetSms(float speedKmh);
void startNextLocalSms();
bool validSmsPhone(const String &phone);
void processHelmetEvent();

void onHelmetData(const esp_now_recv_info_t *info, const uint8_t *data, int length) {
  if (length != sizeof(HelmetPacket)) return;
  HelmetPacket packet;
  memcpy(&packet, data, sizeof(packet));
  if (packet.magic != HELMET_PACKET_MAGIC || packet.key != HELMET_ESPNOW_KEY) return;
  helmetWorn = packet.worn == 1;
  helmetPacketAt = millis();
  portENTER_CRITICAL_ISR(&helmetMux);
  memcpy((void *)helmetSenderMac, info->src_addr, 6);
  helmetSequence = packet.sequence;
  helmetEventWorn = packet.worn == 1;
  helmetEventPending = true;
  portEXIT_CRITICAL_ISR(&helmetMux);
}

void processHelmetEvent() {
  uint8_t sender[6];
  uint32_t sequence;
  bool worn;
  portENTER_CRITICAL(&helmetMux);
  if (!helmetEventPending) {
    portEXIT_CRITICAL(&helmetMux);
    return;
  }
  memcpy(sender, (const void *)helmetSenderMac, 6);
  sequence = helmetSequence;
  worn = helmetEventWorn;
  helmetEventPending = false;
  portEXIT_CRITICAL(&helmetMux);

  if (!esp_now_is_peer_exist(sender)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, sender, 6);
    peer.channel = HELMET_ESPNOW_CHANNEL;
    peer.encrypt = false;
    const esp_err_t added = esp_now_add_peer(&peer);
    if (added != ESP_OK && added != ESP_ERR_ESPNOW_EXIST) {
      Serial.printf("[MU] Khong them duoc bo mu, loi=%d\n", static_cast<int>(added));
      return;
    }
  }

  HelmetAckPacket ack = { HELMET_ACK_MAGIC, HELMET_ESPNOW_KEY, sequence, 1, {0, 0, 0} };
  esp_now_send(sender, reinterpret_cast<const uint8_t *>(&ack), sizeof(ack));
  if (!helmetLogInitialized || worn != lastHelmetLogWorn || millis() - lastHelmetLogAt >= 5000) {
    Serial.printf("[MU] Da nhan goi #%lu | %s | da gui xac nhan\n",
                  static_cast<unsigned long>(sequence), worn ? "DANG DOI MU" : "CHUA DOI MU");
    lastHelmetLogWorn = worn;
    lastHelmetLogAt = millis();
    helmetLogInitialized = true;
  }
}

bool initHelmetReceiver() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true); // Bật chế độ Modem Sleep cho WiFi khi rảnh (tiết kiệm điện)
  WiFi.disconnect(false, false);
  esp_wifi_set_channel(HELMET_ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  if (esp_now_init() != ESP_OK) {
    Serial.println("[HELMET] ESP-NOW init failed; helmet detection remains unavailable");
    return false;
  }
  esp_now_register_recv_cb(onHelmetData);
  Serial.printf("[HELMET] ESP-NOW receiver ready; MAC=%s, channel=%d\n", WiFi.macAddress().c_str(), HELMET_ESPNOW_CHANNEL);
  return true;
}

bool helmetIsWorn() {
  return helmetReceiverReady && helmetWorn && (millis() - helmetPacketAt <= HELMET_PACKET_FRESH_MS);
}

bool responseContainsRestart(const String &response) {
  return response.indexOf("RDY") >= 0 ||
         response.indexOf("POWERED DOWN") >= 0 ||
         response.indexOf("NORMAL POWER DOWN") >= 0;
}

void markModemRestart(const char *source) {
  ++modemResetCount;
  modemReady = false;
  simReady = false;
  networkReady = false;
  dataReady = false;
  gnssReady = false;
  cellularStarted = false;
  currentGnssFix = false;
  Serial.printf("[MODEM] Restart/power loss detected at %s (count=%lu)\n",
                source, static_cast<unsigned long>(modemResetCount));
}

void clearModemBuffer() {
  while (MODEM.available()) MODEM.read();
}

String readATResponse(uint32_t timeoutMs) {
  String response;
  response.reserve(1024);
  const uint32_t startedAt = millis();
  uint32_t lastByteAt = startedAt;
  while (millis() - startedAt < timeoutMs) {
    while (MODEM.available()) {
      if (response.length() < 4096) response += static_cast<char>(MODEM.read());
      else MODEM.read();
      lastByteAt = millis();
    }
    const bool terminal = response.indexOf("\r\nOK\r\n") >= 0 || response.indexOf("\r\nERROR\r\n") >= 0 || response.indexOf("+CME ERROR:") >= 0 || response.indexOf("+CMS ERROR:") >= 0;
    if (terminal && millis() - lastByteAt >= 30) break;
    delay(1);
  }
  response.trim();
  return response;
}

String sendAT(const String &command, uint32_t timeoutMs) {
  clearModemBuffer();
  MODEM.print(command);
  MODEM.print("\r\n");
  return readATResponse(timeoutMs);
}

bool sendATOk(const String &command, uint32_t timeoutMs) {
  const String response = sendAT(command, timeoutMs);
  if (response.indexOf("OK") >= 0) return true;
  Serial.printf("[AT] Failed: %s\n", command.c_str());
  if (response.length()) Serial.println(response);
  return false;
}

bool waitForToken(const String &token, String &response, uint32_t timeoutMs) {
  response = "";
  response.reserve(1024);
  const uint32_t startedAt = millis();
  while (millis() - startedAt < timeoutMs) {
    while (MODEM.available()) {
      if (response.length() < 4096) response += static_cast<char>(MODEM.read());
      else MODEM.read();
    }
    if (response.indexOf(token) >= 0) return true;
    if (response.indexOf("ERROR") >= 0 || response.indexOf("+CME ERROR:") >= 0) return false;
    delay(1);
  }
  return false;
}

// A URC may arrive in multiple UART reads; wait for the entire line.
bool waitForUrcLine(const String &prefix, String &response, uint32_t timeoutMs) {
  response = "";
  response.reserve(2048);
  const uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    while (MODEM.available()) {
      const char c = static_cast<char>(MODEM.read());
      if (response.length() >= 8192) return false;
      response += c;
    }
    const int pos = response.indexOf(prefix);
    if (pos >= 0 && response.indexOf('\n', pos) >= 0) return true;
    if (response.indexOf("+CME ERROR:") >= 0 || response.indexOf("+CMS ERROR:") >= 0 ||
        response.indexOf("\r\nERROR\r\n") >= 0) return false;
    delay(1);
  }
  return false;
}

bool readHttpBody(String &response, uint32_t timeoutMs) {
  clearModemBuffer();
  MODEM.print("AT+QHTTPREAD=20\r\n");
  if (!waitForUrcLine("+QHTTPREAD:", response, timeoutMs)) return false;
  const int pos = response.indexOf("+QHTTPREAD:");
  const int end = response.indexOf('\n', pos);
  String result = response.substring(pos + 11, end);
  result.trim();
  return result == "0" && response.indexOf("CONNECT") >= 0;
}

bool initModem() {
  pinMode(MODEM_EN_PIN, OUTPUT);
  digitalWrite(MODEM_EN_PIN, HIGH);
  MODEM.begin(MODEM_BAUD, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  for (uint8_t attempt = 0; attempt < 8; ++attempt) {
    if (sendAT("AT", 1200).indexOf("OK") >= 0) {
      Serial.println("[MODEM] EG800K ready");
      sendATOk("ATE0");
      sendATOk("AT+CMEE=2");
      return true;
    }
    delay(500);
  }
  Serial.println("[MODEM] No response; local safety continues.");
  return false;
}

bool checkSIM() {
  const String response = sendAT("AT+CPIN?", 2500);
  simReady = response.indexOf("+CPIN: READY") >= 0;
  if (simReady) {
    Serial.println("[SIM] READY");
  } else {
    Serial.println("[SIM] Not ready: " + (response.length() ? response : "no modem response"));
  }
  return simReady;
}

bool checkNetwork() {
  if (!checkSIM()) return false;
  const String registration = sendAT("AT+CEREG?", 3000);
  networkReady = registration.indexOf(",1") >= 0 || registration.indexOf(",5") >= 0;
  const String signal = sendAT("AT+CSQ", 2000);
  Serial.println("[NETWORK] " + signal);
  if (networkReady) {
    Serial.println("[NETWORK] Registered: " + registration);
  } else {
    Serial.println("[NETWORK] Not registered: " + (registration.length() ? registration : "no modem response"));
  }
  return networkReady;
}

bool activateData() {
  if (!networkReady || String(CELLULAR_APN).indexOf("REPLACE_") >= 0) {
    Serial.println("[DATA] Network/APN not ready");
    return false;
  }
  if (!sendATOk("AT+QICSGP=1,1,\"" + String(CELLULAR_APN) + "\",\"\",\"\",1", 5000)) {
    sendATOk("AT+QICSGP=1,1,\"\",\"\",\"\",1", 3000);
  }
  const String current = sendAT("AT+QIACT?", 3000);
  if (current.indexOf("+QIACT: 1,1") < 0) {
    if (!sendATOk("AT+QIACT=1", 25000)) {
      sendATOk("AT+QICSGP=1,1,\"\",\"\",\"\",1", 3000);
      if (!sendATOk("AT+QIACT=1", 20000)) return false;
    }
  }
  // The EG800K can retain an unfinished HTTP engine after a modem restart or
  // an interrupted request. Clear it before changing QHTTPCFG; otherwise the
  // modem reports "+CME ERROR: HTTP(S) busy" forever and never reaches POST.
  const String stopped = sendAT("AT+QHTTPSTOP", 5000);
  if (stopped.indexOf("OK") < 0) Serial.println("[HTTP] QHTTPSTOP response: " + stopped);
  delay(500);
  if (!sendATOk("AT+QHTTPCFG=\"contextid\",1", 2000)) return false;
  if (!sendATOk("AT+QHTTPCFG=\"contenttype\",4", 2000)) return false;
  if (!sendATOk("AT+QHTTPCFG=\"requestheader\",0", 2000)) return false;
  if (!sendATOk("AT+QHTTPCFG=\"sslctxid\",1", 2000)) return false;
  // Cloudflare needs TLS 1.2 and SNI; without SNI the EG800K may connect to
  // the wrong virtual host and report a transient HTTP/TLS failure.
  if (!sendATOk("AT+QSSLCFG=\"sslversion\",1,3", 3000)) return false;
  if (!sendATOk("AT+QSSLCFG=\"ciphersuite\",1,0xFFFF", 3000)) return false;
  if (!sendATOk("AT+QSSLCFG=\"sni\",1,1", 3000)) return false;
  if (!sendATOk("AT+QSSLCFG=\"negotiatetime\",1,60", 3000)) return false;
  if (TLS_VERIFY_SERVER_CERTIFICATE) {
    if (!sendATOk("AT+QSSLCFG=\"seclevel\",1,1", 2000)) return false;
    if (!sendATOk("AT+QSSLCFG=\"cacert\",1,\"" + String(TLS_CA_CERT_PATH) + "\"", 3000)) return false;
  } else {
    if (!sendATOk("AT+QSSLCFG=\"seclevel\",1,0", 2000)) return false;
  }
  dataReady = true;
  lastTelemetryAttempt = 0; // Kích hoạt gửi dữ liệu Telemetry đầu tiên ngay lập tức
  Serial.println("[DATA] PDP/HTTP ready - Sẵn sàng gửi dữ liệu tức thì");
  return true;
}

bool reconnect4G() {
  dataReady = false;
  if (!checkNetwork()) return false;
  return activateData();
}

bool startGNSS() {
  lastGnssStartAttemptAt = millis();
  const String response = sendAT("AT+QGPS=1", 10000);
  const bool alreadyRunning = response.indexOf("GNSS_SE_IS_ONGOING") >= 0 ||
                              response.indexOf("GNSS SE IS ONGOING") >= 0 ||
                              response.indexOf("+CME ERROR: 504") >= 0;
  gnssReady = response.indexOf("OK") >= 0 || alreadyRunning;
  if (response.indexOf("OK") >= 0) Serial.println("[GNSS] Engine started");
  else if (alreadyRunning) Serial.println("[GNSS] Engine already running");
  else Serial.println("[GNSS] Cannot start: " + response);
  return gnssReady;
}

double coordinateToDecimal(const String &coordinate) {
  if (coordinate.length() < 2) return NAN;
  const char hemisphere = coordinate.charAt(coordinate.length() - 1);
  if (hemisphere != 'N' && hemisphere != 'S' && hemisphere != 'E' && hemisphere != 'W') return NAN;
  const double raw = coordinate.substring(0, coordinate.length() - 1).toDouble();
  const int degrees = static_cast<int>(raw / 100.0);
  const double minutes = raw - degrees * 100.0;
  if (minutes < 0 || minutes >= 60) return NAN;
  double decimal = degrees + minutes / 60.0;
  return (hemisphere == 'S' || hemisphere == 'W') ? -decimal : decimal;
}

bool parseQGPSLOC(const String &response, GNSSData &data) {
  data = GNSSData{};
  const int marker = response.indexOf("+QGPSLOC:");
  if (marker < 0) return false;
  int lineEnd = response.indexOf('\r', marker);
  if (lineEnd < 0) lineEnd = response.indexOf('\n', marker);
  if (lineEnd < 0) lineEnd = response.length();
  const String payload = response.substring(marker + 9, lineEnd);
  String fields[11];
  int fieldCount = 0;
  int startedAt = 0;
  for (int i = 0; i <= payload.length() && fieldCount < 11; ++i) {
    if (i == payload.length() || payload.charAt(i) == ',') {
      fields[fieldCount] = payload.substring(startedAt, i);
      fields[fieldCount++].trim();
      startedAt = i + 1;
    }
  }
  if (fieldCount != 11) return false;
  data.utc = fields[0];
  data.latitude = coordinateToDecimal(fields[1]);
  data.longitude = coordinateToDecimal(fields[2]);
  data.hdop = fields[3].toFloat();
  data.fix = fields[5].toInt();
  data.speedKmh = fields[7].toFloat(); // EG800K QGPSLOC speed field.
  data.date = fields[9];
  data.satellites = fields[10].toInt();
  data.valid = validateGNSS(data);
  return data.valid;
}

bool validateGNSS(const GNSSData &data) {
  // Only use a position for speed decisions when the fix has enough geometry
  // quality. A one-satellite/HDOP-20 fix can produce large speed spikes.
  return !isnan(data.latitude) && !isnan(data.longitude) && !isnan(data.speedKmh) &&
         data.speedKmh >= 0 && data.speedKmh <= 160 && data.fix > 0 &&
         data.satellites >= 4 && data.hdop >= 0 && data.hdop <= 8;
}

bool readGNSS(GNSSData &data) {
  const String response = sendAT("AT+QGPSLOC=0", 1000);
  if (!parseQGPSLOC(response, data)) {
    data.valid = false;
    currentGnssFix = false;
    // Never publish or evaluate the last good speed as the current speed
    // after GNSS is lost.  This also clears the filter warm-up samples so a
    // later fix starts from fresh measurements.
    filteredSpeedKmh = 0.0f;
    speedFilterInitialized = false;
    speedSampleCount = 0;
    speedSampleIndex = 0;
    for (uint8_t i = 0; i < SPEED_FILTER_WINDOW; ++i) speedSamples[i] = 0.0f;
    if (responseContainsRestart(response)) {
      markModemRestart("GNSS query");
    } else if (response.indexOf("+CME ERROR: 505") >= 0) {
      // Seen after an EG800K reboot: the modem is alive but the GNSS engine
      // is not running yet. Its PDP context may also have been lost, so both
      // services are reinitialized without power-cycling the module.
      gnssReady = false;
      dataReady = false;
      networkReady = false;
      cellularStarted = false;
      Serial.println("[GNSS] Engine stopped; scheduling start retry");
    }
    // A GNSS error is not automatically a modem reboot. Keep the engine on
    // and retain the last valid point instead of forcing a cold start.
    if (millis() - lastGnssNoFixReportAt >= 5000) {
      lastGnssNoFixReportAt = millis();
      Serial.println("[GNSS] NO FIX: " + (response.length() ? response : "no modem response"));
      if (lastGnssFixAt > 0) {
        Serial.printf("[GNSS] Last valid fix %lu seconds ago\n",
                      static_cast<unsigned long>((millis() - lastGnssFixAt) / 1000));
      }
    }
    return false;
  }
  currentGnssFix = true;
  Serial.printf("[GNSS] %.7f, %.7f | raw %.1f km/h | SAT %d | HDOP %.1f\n", data.latitude, data.longitude, data.speedKmh, data.satellites, data.hdop);
  return true;
}

float filterSpeed(float rawSpeedKmh) {
  if (isnan(rawSpeedKmh) || rawSpeedKmh < 0 || rawSpeedKmh > 160) return filteredSpeedKmh;
  if (rawSpeedKmh < SPEED_NEAR_ZERO_KMH) rawSpeedKmh = 0.0f;
  speedSamples[speedSampleIndex] = rawSpeedKmh;
  speedSampleIndex = (speedSampleIndex + 1) % SPEED_FILTER_WINDOW;
  if (speedSampleCount < SPEED_FILTER_WINDOW) ++speedSampleCount;

  float ordered[SPEED_FILTER_WINDOW];
  for (uint8_t i = 0; i < speedSampleCount; ++i) ordered[i] = speedSamples[i];
  for (uint8_t i = 1; i < speedSampleCount; ++i) {
    const float value = ordered[i];
    int8_t j = static_cast<int8_t>(i) - 1;
    while (j >= 0 && ordered[j] > value) {
      ordered[j + 1] = ordered[j];
      --j;
    }
    ordered[j + 1] = value;
  }
  float robustSpeed = ordered[speedSampleCount / 2];
  if (!speedFilterInitialized) {
    filteredSpeedKmh = robustSpeed;
    speedFilterInitialized = true;
  } else {
    float delta = robustSpeed - filteredSpeedKmh;
    if (delta > SPEED_MAX_STEP_KMH) robustSpeed = filteredSpeedKmh + SPEED_MAX_STEP_KMH;
    if (delta < -SPEED_MAX_STEP_KMH) robustSpeed = filteredSpeedKmh - SPEED_MAX_STEP_KMH;
    filteredSpeedKmh += SPEED_EMA_ALPHA * (robustSpeed - filteredSpeedKmh);
  }
  if (filteredSpeedKmh < SPEED_NEAR_ZERO_KMH) filteredSpeedKmh = 0.0f;
  return filteredSpeedKmh;
}

void checkOverspeed(float speedKmh, bool gpsValid) {
  static uint32_t lastDiagnosticAt = 0;
  const uint32_t now = millis();
  if (now - lastDiagnosticAt >= 2000) {
    lastDiagnosticAt = now;
    Serial.printf("[SPEED] GPS=%d | raw=%.1f | filtered=%.1f | limit=%.1f | alert=%d | active=%d | confirm=%lu/3000 ms\n",
                  gpsValid ? 1 : 0, gpsValid ? lastGnss.speedKmh : -1.0f,
                  speedKmh, config.speedLimit, config.speedAlertEnabled ? 1 : 0,
                  overspeedActive ? 1 : 0,
                  static_cast<unsigned long>(overspeedStartedAt ? now - overspeedStartedAt : 0));
  }
  if (!gpsValid || !config.speedAlertEnabled) {
    if (overspeedStartedAt || overspeedActive) {
      Serial.printf("[SPEED] Cancelled: GPS=%d alert=%d\n", gpsValid ? 1 : 0, config.speedAlertEnabled ? 1 : 0);
    }
    overspeedStartedAt = 0;
    overspeedActive = false;
    return;
  }
  if (!overspeedActive) {
    if (speedKmh > config.speedLimit) {
      if (!overspeedStartedAt) {
        overspeedStartedAt = now;
        Serial.println("[SPEED] Above limit; starting 3-second confirmation");
      }
      if (now - overspeedStartedAt >= OVERSPEED_CONFIRM_MS) {
        overspeedActive = true;
        Serial.printf("[SPEED] CONFIRMED %.1f > %.1f km/h -> queue SMS\n", speedKmh, config.speedLimit);
        queueLocalOverspeedSms(speedKmh);
      }
    } else {
      if (overspeedStartedAt) Serial.println("[SPEED] Below limit again; confirmation timer reset");
      overspeedStartedAt = 0;
    }
  } else if (speedKmh < config.speedLimit - OVERSPEED_HYSTERESIS_KMH) {
    overspeedActive = false;
    overspeedStartedAt = 0;
    Serial.println("[SPEED] Back in safe speed range");
  }
}

void setBuzzer(bool on) {
#if BUZZER_PIN >= 0
  const uint8_t level = (on == BUZZER_ACTIVE_HIGH) ? HIGH : LOW;
  digitalWrite(BUZZER_PIN, level);
  digitalWrite(BUZZER_PIN_ALT1, level);
  digitalWrite(BUZZER_PIN_ALT2, level);
#endif
  if (on != buzzerOn) {
    Serial.printf("[BUZZER] %s (GPIO %d, %d, %d = %s)\n", on ? "BẬT CÒI" : "TẮT CÒI", BUZZER_PIN, BUZZER_PIN_ALT1, BUZZER_PIN_ALT2, on ? "HIGH" : "LOW");
  }
  buzzerOn = on;
}

void updateBuzzer() {
  const bool shouldWarn = remoteAlarmActive || (overspeedActive && config.speedAlertEnabled && config.buzzerEnabled);
  if (!shouldWarn) {
    if (buzzerOn) setBuzzer(false);
    return;
  }
  const uint32_t interval = buzzerOn ? BUZZ_ON_MS : BUZZ_OFF_MS;
  if (millis() - buzzerPhaseAt >= interval) {
    setBuzzer(!buzzerOn);
    buzzerPhaseAt = millis();
  }
}

void executeRemoteAlarm() {
  if (remoteAlarmActive && millis() >= remoteAlarmEndsAt) {
    remoteAlarmActive = false;
    setBuzzer(false);
    Serial.println("[REMOTE] *** PHAT COI CANH BAO KET THUC ***");
  }
}

void soundAlarmImmediate(uint8_t count, uint16_t onMs, uint16_t offMs) {
  Serial.printf("[REMOTE] >>> DANG PHAT COI %u TIENG (%u ms on / %u ms off) <<<\n", count, onMs, offMs);
  for (uint8_t i = 0; i < count; ++i) {
    setBuzzer(true);
    delay(onMs);
    setBuzzer(false);
    if (i + 1 < count) delay(offMs);
  }
  Serial.println("[REMOTE] >>> DA HOAN THANH PHAT COI <<<");
}

bool setHttpAuthorization() {
  sendAT("AT+QHTTPCFG=\"reqheader/remove\",\"Authorization\"", 1500);
  sendAT("AT+QHTTPCFG=\"reqheader/remove\",\"OAI-Sites-Authorization\"", 1500);
  sendATOk("AT+QHTTPCFG=\"reqheader/add\",\"Authorization\",\"Bearer " + activeDeviceToken + "\"", 2000);
  if (String(SITE_ACCESS_TOKEN).length() > 0) {
    sendATOk("AT+QHTTPCFG=\"reqheader/add\",\"OAI-Sites-Authorization\",\"Bearer " + String(SITE_ACCESS_TOKEN) + "\"", 2000);
  }
  return true;
}

bool postJsonOnce(const String &url, const String &body, String &responseBody) {
  responseBody = "";
  if (!dataReady || url.indexOf("REPLACE_") >= 0 ||
      activeDeviceToken.length() == 0 ||
      activeDeviceToken.indexOf("REPLACE_") >= 0) return false;
  // Tạm tắt còi trong lúc phát sóng 4G công suất cao để triệt tiêu hiện tượng sụt nguồn (brownout)
  if (buzzerOn) setBuzzer(false);
  setHttpAuthorization();
  String response;
  clearModemBuffer();
  MODEM.print("AT+QHTTPURL=" + String(url.length()) + ",20\r\n");
  if (!waitForToken("CONNECT", response, 8000)) {
    Serial.println("[HTTP] QHTTPURL did not enter CONNECT mode: " + response);
    if (responseContainsRestart(response)) markModemRestart("QHTTPURL");
    sendAT("AT+QHTTPSTOP", 1000);
    return false;
  }
  MODEM.print(url);
  response = readATResponse(4000);
  if (response.indexOf("OK") < 0) {
    Serial.println("[HTTP] URL rejected: " + response);
    if (responseContainsRestart(response)) markModemRestart("HTTP URL data");
    sendAT("AT+QHTTPSTOP", 1000);
    return false;
  }
  clearModemBuffer();
  MODEM.print("AT+QHTTPPOST=" + String(body.length()) + ",20,20\r\n");
  if (!waitForToken("CONNECT", response, 8000)) {
    Serial.println("[HTTP] QHTTPPOST did not enter CONNECT mode: " + response);
    if (responseContainsRestart(response)) markModemRestart("QHTTPPOST connect");
    if (response.indexOf("716") >= 0)
      Serial.println("[HTTP] Socket-connect error 716; keeping PDP until repeated failures");
    sendAT("AT+QHTTPSTOP", 1000);
    return false;
  }
  MODEM.print(body);
  String postResult;
  if (!waitForUrcLine("+QHTTPPOST:", postResult, 30000)) {
    Serial.println("[HTTP] POST timeout: " + postResult);
    if (responseContainsRestart(postResult)) markModemRestart("HTTP transfer");
    sendAT("AT+QHTTPSTOP", 1000);
    return false;
  }
  Serial.println("[HTTP] POST result: " + postResult);
  const int marker = postResult.indexOf("+QHTTPPOST:");
  const int firstComma = postResult.indexOf(',', marker);
  const int secondComma = firstComma < 0 ? -1 : postResult.indexOf(',', firstComma + 1);
  const int modemError = marker < 0 ? -1 : postResult.substring(marker + 11, firstComma).toInt();
  const int statusCode = firstComma < 0 ? 0 : postResult.substring(firstComma + 1, secondComma < 0 ? postResult.length() : secondComma).toInt();
  if (modemError != 0 || statusCode < 200 || statusCode >= 300) {
    Serial.printf("[HTTP] POST failed: modem=%d status=%d\n", modemError, statusCode);
    sendAT("AT+QHTTPSTOP", 1000);
    return false;
  }
  if (!readHttpBody(responseBody, 25000)) {
    Serial.println("[HTTP] POST accepted; configuration response not read");
    if (responseContainsRestart(responseBody)) markModemRestart("HTTP response read");
    responseBody = "";
    return false;
  }
  lastHttpActivityAt = millis();
  lastGNSSRead = lastHttpActivityAt;
  return true;
}

bool postJson(const String &url, const String &body, String &responseBody) {
  for (uint8_t attempt = 0; attempt < 2; ++attempt) {
    if (postJsonOnce(url, body, responseBody)) return true;
    sendAT("AT+QHTTPSTOP", 1000);
    delay(200);
  }
  return false;
}

void recoverDataSession() {
  if (!modemReady) return;
  Serial.println("[4G] Recovering HTTP/PDP after repeated failures");
  sendAT("AT+QHTTPSTOP", 2000);

  if (!checkNetwork()) {
    dataReady = false;
    return;
  }

  // Tái kích hoạt lại ngữ cảnh dữ liệu và cấu hình SSL/HTTP
  activateData();
}

String createTelemetryJSON() {
  String json = "{\"device_id\":\"" + activeDeviceId + "\",\"device_token\":\"" + activeDeviceToken + "\",\"sample_id\":\"" + activeDeviceId + "-" + String(millis()) + "\",\"speed\":" + String(filteredSpeedKmh, 1);
  json += ",\"gps_valid\":" + String(currentGnssFix ? "true" : "false");
  if (currentGnssFix && lastGnss.valid) {
    json += ",\"latitude\":" + String(lastGnss.latitude, 7);
    json += ",\"longitude\":" + String(lastGnss.longitude, 7);
    json += ",\"satellites\":" + String(lastGnss.satellites);
    json += ",\"hdop\":" + String(lastGnss.hdop, 2);
  }
  json += ",\"network_signal\":" + String(readSignalQuality());
  json += ",\"overspeed_active\":" + String(overspeedActive ? "true" : "false");
  json += ",\"helmet_worn\":" + String(helmetIsWorn() ? "true" : "false");
  if (alarmSoundedReportPending) {
    json += ",\"alarm_sounded\":true";
    json += ",\"alarm_request_id\":\"" + lastAlarmRequestId + "\"";
  }
  if (lastSmsJobId.length()) {
    json += ",\"sms_job_id\":\"" + lastSmsJobId + "\",\"sms_status\":\"" + lastSmsStatus + "\"";
  }
  const String timestamp = gnssTimestamp(lastGnss);
  if (timestamp.length()) json += ",\"timestamp\":\"" + timestamp + "\"";
  json += ",\"firmware_version\":\"2.7.0-local-overspeed-helmet-sms-alarm-ack-v1\"}";
  return json;
}

bool sendTelemetry() {
  String response;
  const bool success = postJson(activeTelemetryUrl, createTelemetryJSON(), response);
  if (!success) return false;
  if (response.indexOf("\"config\"") < 0 || response.indexOf("\"remote_alarm\"") < 0) {
    Serial.println("[TELEMETRY] Response missing config or alarm field");
    return false;
  }
  if (alarmSoundedReportPending) {
    alarmSoundedReportPending = false;
  }
  return parseServerConfig(response);
}

bool parseServerConfig(const String &response) {
  const float limit = jsonNumber(response, "speed_limit", config.speedLimit);
  if (limit >= 10 && limit <= 80) config.speedLimit = limit;
  config.speedAlertEnabled = jsonBoolean(response, "speed_alert_enabled", config.speedAlertEnabled);
  config.buzzerEnabled = jsonBoolean(response, "buzzer_enabled", config.buzzerEnabled);
  const uint32_t version = static_cast<uint32_t>(jsonNumber(response, "config_version", config.version));
  if (version != config.version) {
    config.version = version;
    saveConfig();
    Serial.printf("[CONFIG] Saved version %lu\n", static_cast<unsigned long>(config.version));
  }
  const String requestId = jsonString(response, "alarm_request_id");
  if (jsonBoolean(response, "remote_alarm", false) && requestId.length() > 0 && requestId.length() <= 48) {
    if (requestId == lastAlarmRequestId) {
      // Re-ACK a duplicate without sounding again.
      alarmSoundedReportPending = true;
      processSmsJob(response);
      return true;
    }
    lastAlarmRequestId = requestId;
    // Save before activating: a reset in the small gap can lose a beep, but
    // it must not replay the same alarm indefinitely after a power failure.
    if (!preferences.putString("alarmReqId", lastAlarmRequestId)) {
      lastAlarmRequestId = "";
      Serial.println("[REMOTE] Cannot store command ID; alarm not activated");
      return false;
    }
    Serial.println("[REMOTE] >>> NHAN DUOC LENH PHAT COI TU MAY CHU WEB! <<<");
    // Phat còi ngay lap tuc: 5 tieng coi ro rang, dut khoat (220ms bat, 130ms tat)
    soundAlarmImmediate(5, 220, 130);
    alarmSoundedReportPending = true;
    lastAlarmSoundedAtMs = millis();
    // Gui ngay phan hoi xac nhan len May chu
    if (dataReady) {
      String ackResp;
      String ackBody = "{\"device_id\":\"" + activeDeviceId + "\",\"device_token\":\"" + activeDeviceToken + "\",\"alarm_sounded\":true,\"alarm_request_id\":\"" + requestId + "\"}";
      Serial.println("[REMOTE] Gui xac nhan da phat coi len Web API...");
      if (postJson(REMOTE_ALARM_ACK_URL, ackBody, ackResp)) {
        Serial.println("[REMOTE] >>> DA GUI XAC NHAN PHAT COI THANH CONG VE WEB! <<<");
        alarmSoundedReportPending = false;
      }
    }
  }
  processSmsJob(response);
  return true;
}

// SMS IDs and result survive reset. An interrupted/ambiguous send is reported
// as unknown and is never automatically resubmitted (avoids duplicate charges).
String jsonString(const String &json, const char *key) {
  const String needle = "\"" + String(key) + "\"";
  int pos = json.indexOf(needle);
  if (pos < 0) return "";
  pos += needle.length();
  while (pos < json.length() && isspace(json.charAt(pos))) ++pos;
  if (json.charAt(pos++) != ':') return "";
  while (pos < json.length() && isspace(json.charAt(pos))) ++pos;
  if (json.charAt(pos++) != '"') return "";
  String result;
  while (pos < json.length()) {
    char c = json.charAt(pos++);
    if (c == '"') return result;
    if (c == '\\') {
      if (pos >= json.length()) return "";
      c = json.charAt(pos++);
      if (c != '"' && c != '\\' && c != '/') return "";
    }
    result += c;
    if (result.length() > 200) return "";
  }
  return "";
}

bool validSmsPhone(const String &phone) {
  bool valid = phone.length() >= 9 && phone.length() <= 16 && phone.charAt(0) == '+';
  for (unsigned int i = 1; i < phone.length(); ++i) valid = valid && isDigit(phone.charAt(i));
  return valid;
}

void finishSmsSend(const char *status) {
  const SmsSource finishedSource = activeSmsSource;
  smsWaiting = false;
  activeSmsSource = SmsSource::NONE;
  if (finishedSource == SmsSource::WEB_JOB) {
    lastSmsStatus = status;
    preferences.putString("smsStatus", lastSmsStatus);
    lastTelemetryAttempt = millis() - telemetryRetryBackoffMs;
    Serial.printf("[SMS-WEB] job=%s result=%s\n", lastSmsJobId.c_str(), status);
  } else if (finishedSource == SmsSource::LOCAL_OVERSPEED) {
    Serial.printf("[SMS-LOCAL] Ket qua=%s\n", status);
    // Only retry a definitive modem ERROR. A timeout is ambiguous: do not
    // retransmit because the network might have accepted the first message.
    if (strcmp(status, "failed") == 0 && localOverspeedRetryCount == 0) {
      localOverspeedRetryCount = 1;
      localOverspeedNextTryAt = millis() + SMS_RETRY_DELAY_MS;
      Serial.println("[SMS-LOCAL] Modem rejected SMS; retry same phone once after 8s");
    } else {
      ++localOverspeedPhoneIndex;
      localOverspeedRetryCount = 0;
      localOverspeedNextTryAt = 0;
    }
  } else if (finishedSource == SmsSource::MANUAL_TEST) {
    Serial.printf("[SMS-TEST] Result=%s\n", status);
  } else if (finishedSource == SmsSource::LOCAL_HELMET) {
    Serial.printf("[SMS-MU-LOCAL] Ket qua=%s; khong tu gui lai\n", status);
    ++localHelmetPhoneIndex;
  }
}

void saveSmsResult(const char *status) {
  lastSmsStatus = status;
  preferences.putString("smsStatus", lastSmsStatus);
  smsWaiting = false;
  activeSmsSource = SmsSource::NONE;
  lastTelemetryAttempt = millis() - telemetryRetryBackoffMs;
  Serial.printf("[SMS] job=%s result=%s\n", lastSmsJobId.c_str(), status);
}

bool startSmsSend(const String &phone, const String &message, SmsSource source) {
  if (smsWaiting || !validSmsPhone(phone) || message.isEmpty() || message.length() > 160) {
    Serial.printf("[SMS-DEBUG] Cannot start: busy=%d phoneValid=%d length=%u\n",
                  smsWaiting ? 1 : 0, validSmsPhone(phone) ? 1 : 0, (unsigned)message.length());
    return false;
  }
  activeSmsSource = source;
  Serial.printf("[SMS-DEBUG] Starting SMS, length=%u\n", (unsigned)message.length());
  if (!sendATOk("AT+CMGF=1") || !sendATOk("AT+CSCS=\"GSM\"") ||
      !sendATOk("AT+CSMP=17,167,0,0")) {
    Serial.println("[SMS-DEBUG] SMS AT configuration failed");
    finishSmsSend("failed");
    return false;
  }
  clearModemBuffer();
  MODEM.print("AT+CMGS=\"" + phone + "\"\r");
  String prompt;
  if (!waitForToken(">", prompt, 10000)) {
    Serial.println("[SMS-DEBUG] CMGS prompt failed, modem reply:");
    Serial.println(prompt);
    MODEM.write(static_cast<uint8_t>(27));
    Serial.println(readATResponse(1000));
    finishSmsSend("failed");
    return false;
  }
  Serial.println("[SMS-DEBUG] CMGS prompt received, sending message + CTRL-Z");
  MODEM.print(message);
  MODEM.write(static_cast<uint8_t>(26));
  smsResponse = "";
  smsStartedAt = millis();
  smsWaiting = true;
  Serial.println("[SMS-DEBUG] Waiting for +CMGS and OK (up to 120 s)");
  return true;
}

void queueLocalOverspeedSms(float speedKmh) {
  if (!LOCAL_OVERSPEED_SMS_ENABLED) {
    Serial.println("[SMS-LOCAL] Disabled by LOCAL_OVERSPEED_SMS_ENABLED");
    return;
  }
  if (localOverspeedSmsPending || (smsWaiting && activeSmsSource == SmsSource::LOCAL_OVERSPEED)) {
    Serial.println("[SMS-LOCAL] An overspeed SMS incident is already being processed");
    return;
  }
  bool hasPhone = false;
  for (const char *phone : PARENT_SMS_PHONES) {
    if (validSmsPhone(String(phone))) hasPhone = true;
  }
  if (!hasPhone) {
    Serial.println("[SMS-LOCAL] Chua dien so phu huynh; khong the gui canh bao vuot toc");
    return;
  }
  localOverspeedMessage = "CANH BAO VUOT TOC: xe " + activeDeviceId + " dang chay " +
                          String(speedKmh, 1) + " km/h, gioi han " + String(config.speedLimit, 0) + " km/h.";
  if (currentGnssFix && !isnan(lastGnss.latitude) && !isnan(lastGnss.longitude)) {
    const String map = " https://maps.google.com/?q=" + String(lastGnss.latitude, 6) + "," + String(lastGnss.longitude, 6);
    if (localOverspeedMessage.length() + map.length() <= 160) localOverspeedMessage += map;
  }
  localOverspeedPhoneIndex = 0;
  localOverspeedRetryCount = 0;
  localOverspeedNextTryAt = 0;
  localOverspeedSmsPending = true;
  Serial.println("[SMS-LOCAL] Da xep hang canh bao vuot toc; se gui truc tiep bang SIM");
}

void queueLocalHelmetSms(float speedKmh) {
  if (!LOCAL_HELMET_SMS_ENABLED) return;
  bool hasPhone = false;
  for (const char *phone : PARENT_SMS_PHONES) {
    if (validSmsPhone(String(phone))) hasPhone = true;
  }
  if (!hasPhone) {
    Serial.println("[SMS-MU-LOCAL] Chua dien so phu huynh; khong the gui canh bao mu");
    return;
  }
  localHelmetMessage = "CANH BAO MU: xe " + activeDeviceId + " dang chay " +
                       String(speedKmh, 1) + " km/h nhung chua nhan tin hieu doi mu.";
  if (currentGnssFix && !isnan(lastGnss.latitude) && !isnan(lastGnss.longitude)) {
    const String map = " https://maps.google.com/?q=" + String(lastGnss.latitude, 6) + "," + String(lastGnss.longitude, 6);
    if (localHelmetMessage.length() + map.length() <= 160) localHelmetMessage += map;
  }
  localHelmetPhoneIndex = 0;
  localHelmetSmsPending = true;
  Serial.println("[SMS-MU-LOCAL] Da xep hang canh bao quen mu; se gui truc tiep bang SIM");
}

void checkLocalHelmetSms(float speedKmh, bool gpsValid) {
  if (!LOCAL_HELMET_SMS_ENABLED || !gpsValid || helmetIsWorn() || speedKmh < HELMET_MIN_SPEED_KMH) {
    helmetMissingStartedAt = 0;
    localHelmetIncidentActive = false;
    return;
  }
  if (localHelmetIncidentActive) return;
  if (!helmetMissingStartedAt) helmetMissingStartedAt = millis();
  if (millis() - helmetMissingStartedAt >= HELMET_MISSING_CONFIRM_MS) {
    localHelmetIncidentActive = true;
    queueLocalHelmetSms(speedKmh);
  }
}

void startNextLocalSms() {
  if (localOverspeedSmsPending || localHelmetSmsPending) {
    static uint32_t lastPendingLogAt = 0;
    if (millis() - lastPendingLogAt >= 3000) {
      lastPendingLogAt = millis();
      Serial.printf("[SMS-QUEUE] pending; modem=%d sim=%d network=%d smsBusy=%d retry=%u nextTry=%lu\n",
                    modemReady, simReady, networkReady, smsWaiting,
                    localOverspeedRetryCount,
                    (unsigned long)localOverspeedNextTryAt);
    }
  }
  if (smsWaiting || !modemReady || !simReady || !networkReady) return;
  if (localOverspeedSmsPending && localOverspeedNextTryAt &&
      static_cast<int32_t>(millis() - localOverspeedNextTryAt) < 0) return;
  const bool sendingOverspeed = localOverspeedSmsPending;
  const bool sendingHelmet = !sendingOverspeed && localHelmetSmsPending;
  if (!sendingOverspeed && !sendingHelmet) return;
  const uint8_t phoneCount = sizeof(PARENT_SMS_PHONES) / sizeof(PARENT_SMS_PHONES[0]);
  uint8_t &phoneIndex = sendingOverspeed ? localOverspeedPhoneIndex : localHelmetPhoneIndex;
  String &message = sendingOverspeed ? localOverspeedMessage : localHelmetMessage;
  while (phoneIndex < phoneCount) {
    const String phone = String(PARENT_SMS_PHONES[phoneIndex]);
    if (!validSmsPhone(phone)) {
      ++phoneIndex;
      continue;
    }
    Serial.printf("[%s] Dang gui canh bao toi so thu %u\n", sendingOverspeed ? "SMS-LOCAL" : "SMS-MU-LOCAL", phoneIndex + 1);
    bool started = startSmsSend(phone, message,
                                sendingOverspeed ? SmsSource::LOCAL_OVERSPEED : SmsSource::LOCAL_HELMET);
    if (!started) {
      // startSmsSend reports a definitive failure and calls finishSmsSend
      // after an AT error. Never discard a pending alert on a busy modem.
      Serial.println("[SMS-QUEUE] Send could not start; checking next iteration");
    }
    return;
  }
  if (sendingOverspeed) {
    localOverspeedSmsPending = false;
    localOverspeedMessage = "";
    Serial.println("[SMS-LOCAL] Da xu ly xong danh sach so phu huynh");
  } else {
    localHelmetSmsPending = false;
    localHelmetMessage = "";
    Serial.println("[SMS-MU-LOCAL] Da xu ly xong danh sach so phu huynh");
  }
}

void processSmsJob(const String &response) {
  const String jobId = jsonString(response, "sms_job_id");
  // V2.5 handles both alert types locally. Defer any stale web job until the
  // local queue is empty; the web route does not issue jobs for V2.5, but this
  // guard also protects against a job queued before a firmware upgrade.
  if (smsWaiting || localOverspeedSmsPending || localHelmetSmsPending ||
      jobId.length() != 36 || jobId == lastSmsJobId) return;
  const String phone = jsonString(response, "sms_phone");
  const String message = jsonString(response, "sms_message");
  bool valid = validSmsPhone(phone) && message.length() > 0 && message.length() <= 160;
  for (unsigned int i = 0; i < message.length(); ++i) valid = valid && message.charAt(i) >= 32 && message.charAt(i) <= 126;
  if (!valid) return;
  lastSmsJobId = jobId;
  lastSmsStatus = "unknown";
  preferences.putString("smsStatus", lastSmsStatus);
  preferences.putString("smsJob", lastSmsJobId);
  startSmsSend(phone, message, SmsSource::WEB_JOB);
}

void pollSmsResult() {
  while (MODEM.available()) {
    const char c = static_cast<char>(MODEM.read());
    Serial.write(c); // Full modem reply, including +CMS ERROR
    if (smsResponse.length() < 2048) smsResponse += c;
  }
  if (smsResponse.indexOf("+CMGS:") >= 0 && smsResponse.indexOf("\r\nOK\r\n") >= 0) {
    Serial.println("\n[SMS-DEBUG] Network accepted SMS (not a delivery receipt)");
    finishSmsSend("accepted");
  } else if (smsResponse.indexOf("ERROR") >= 0) {
    Serial.println("\n[SMS-DEBUG] SMS modem error:");
    Serial.println(smsResponse);
    finishSmsSend("failed");
  } else if (millis() - smsStartedAt >= 120000 || responseContainsRestart(smsResponse)) {
    Serial.println("\n[SMS-DEBUG] Timeout or modem restart; delivery unknown, no automatic retry");
    Serial.println(smsResponse);
    const bool reboot = responseContainsRestart(smsResponse);
    finishSmsSend("unknown");
    if (reboot) markModemRestart("SMS");
  }
}

float jsonNumber(const String &json, const char *key, float fallback) {
  const String needle = "\"" + String(key) + "\"";
  const int start = json.indexOf(needle);
  if (start < 0) return fallback;
  int valueStart = start + needle.length();
  while (valueStart < json.length() && isspace(json.charAt(valueStart))) ++valueStart;
  if (json.charAt(valueStart++) != ':') return fallback;
  while (valueStart < json.length() && isspace(json.charAt(valueStart))) ++valueStart;
  int end = valueStart;
  while (end < json.length() && (isDigit(json.charAt(end)) || json.charAt(end) == '.' || json.charAt(end) == '-')) ++end;
  if (end == valueStart) return fallback;
  return json.substring(valueStart, end).toFloat();
}

bool jsonBoolean(const String &json, const char *key, bool fallback) {
  const String needle = "\"" + String(key) + "\"";
  const int start = json.indexOf(needle);
  if (start < 0) return fallback;
  int valueStart = start + needle.length();
  while (valueStart < json.length() && isspace(json.charAt(valueStart))) ++valueStart;
  if (json.charAt(valueStart++) != ':') return fallback;
  while (valueStart < json.length() && isspace(json.charAt(valueStart))) ++valueStart;
  const String value = json.substring(valueStart, valueStart + 5);
  if (value.startsWith("true")) return true;
  if (value.startsWith("false")) return false;
  return fallback;
}

void saveConfig() {
  preferences.putFloat("speedLimit", config.speedLimit);
  preferences.putBool("alertEnabled", config.speedAlertEnabled);
  preferences.putBool("buzzerEnabled", config.buzzerEnabled);
  preferences.putULong("configVer", config.version);
}

void loadConfig() {
  preferences.begin("safety", false);
  lastAlarmRequestId = preferences.getString("alarmReqId", "");
  config.speedLimit = preferences.getFloat("speedLimit", 40.0f);
  config.speedAlertEnabled = preferences.getBool("alertEnabled", true);
  config.buzzerEnabled = preferences.getBool("buzzerEnabled", true);
  config.version = preferences.getULong("configVer", 0);
  lastSmsJobId = preferences.getString("smsJob", "");
  lastSmsStatus = preferences.getString("smsStatus", "unknown");

  activeDeviceId = preferences.getString("deviceId", DEFAULT_DEVICE_ID);
  if (activeDeviceId.length() == 0) activeDeviceId = DEFAULT_DEVICE_ID;

  activeVerifySecret = preferences.getString("verifySecret", DEFAULT_VERIFY_SECRET);
  if (activeVerifySecret.length() == 0) activeVerifySecret = DEFAULT_VERIFY_SECRET;

  activeDeviceToken = preferences.getString("deviceToken", "");
  if (activeDeviceToken.length() == 0 && String(DEFAULT_DEVICE_TOKEN).length() > 0) {
    activeDeviceToken = String(DEFAULT_DEVICE_TOKEN);
    preferences.putString("deviceToken", activeDeviceToken);
  }

  Serial.println("\n-------------------------------------------------------");
  Serial.printf("[FLASH] Device ID: %s | Ma Verify: %s\n", activeDeviceId.c_str(), activeVerifySecret.c_str());
  if (activeDeviceToken.length() > 0) {
    Serial.printf("[FLASH] Da nap DEVICE_TOKEN tu bo nho Flash (NVS): %s\n", maskSecret(activeDeviceToken).c_str());
  } else {
    Serial.println("[FLASH] Bo nho Flash chua co DEVICE_TOKEN. Thiet bi se tu dong lay token tu Web/BLE khi ket noi!");
  }

  activeTelemetryUrl = preferences.getString("telemetryUrl", TELEMETRY_URL);
  if (activeTelemetryUrl.length() == 0) {
    activeTelemetryUrl = TELEMETRY_URL;
  }
  Serial.printf("[FLASH] Telemetry URL: %s\n", activeTelemetryUrl.c_str());
  Serial.println("-------------------------------------------------------\n");
}

int readSignalQuality() {
  const String response = sendAT("AT+CSQ", 2000);
  const int marker = response.indexOf("+CSQ:");
  if (marker < 0) return 0;
  return response.substring(marker + 5).toInt();
}

String gnssTimestamp(const GNSSData &data) {
  if (data.date.length() < 6 || data.utc.length() < 6) return "";
  return "20" + data.date.substring(4, 6) + "-" + data.date.substring(2, 4) + "-" + data.date.substring(0, 2) + "T" + data.utc.substring(0, 2) + ":" + data.utc.substring(2, 4) + ":" + data.utc.substring(4, 6) + "Z";
}

bool postPublicJson(const String &url, const String &body, String &responseBody) {
  responseBody = "";
  if (!dataReady || url.indexOf("REPLACE_") >= 0) return false;
  sendAT("AT+QHTTPCFG=\"reqheader/remove\",\"Authorization\"", 2000);
  if (String(SITE_ACCESS_TOKEN).length() > 0) {
    sendATOk("AT+QHTTPCFG=\"reqheader/add\",\"OAI-Sites-Authorization\",\"Bearer " + String(SITE_ACCESS_TOKEN) + "\"", 2500);
  }
  String response;
  clearModemBuffer();
  MODEM.print("AT+QHTTPURL=" + String(url.length()) + ",20\r\n");
  if (!waitForToken("CONNECT", response, 10000)) {
    Serial.println("[HTTP] QHTTPURL did not enter CONNECT mode: " + response);
    if (responseContainsRestart(response)) markModemRestart("QHTTPURL");
    return false;
  }
  MODEM.print(url);
  response = readATResponse(5000);
  if (response.indexOf("OK") < 0) {
    Serial.println("[HTTP] QHTTPURL error: " + response);
    if (responseContainsRestart(response)) markModemRestart("HTTP URL data");
    return false;
  }
  clearModemBuffer();
  MODEM.print("AT+QHTTPPOST=" + String(body.length()) + ",30,30\r\n");
  if (!waitForToken("CONNECT", response, 10000)) {
    Serial.println("[HTTP] QHTTPPOST did not enter CONNECT mode: " + response);
    if (responseContainsRestart(response)) markModemRestart("QHTTPPOST connect");
    return false;
  }
  MODEM.print(body);
  String postResult;
  if (!waitForUrcLine("+QHTTPPOST:", postResult, 45000)) {
    Serial.println("[HTTP] POST timeout: " + postResult);
    if (responseContainsRestart(postResult)) markModemRestart("HTTP transfer");
    return false;
  }
  Serial.println("[HTTP] POST result: " + postResult);
  const int marker = postResult.indexOf("+QHTTPPOST:");
  const int firstComma = postResult.indexOf(',', marker);
  const int secondComma = firstComma < 0 ? -1 : postResult.indexOf(',', firstComma + 1);
  const int modemError = marker < 0 ? -1 : postResult.substring(marker + 11, firstComma).toInt();
  const int statusCode = firstComma < 0 ? 0 : postResult.substring(firstComma + 1, secondComma < 0 ? postResult.length() : secondComma).toInt();
  if (modemError != 0 || statusCode < 200 || statusCode >= 300) {
    Serial.printf("[HTTP] POST failed: modem=%d status=%d\n", modemError, statusCode);
    return false;
  }
  if (!readHttpBody(responseBody, 25000)) {
    Serial.println("[HTTP] POST accepted; pair response not read");
    if (responseContainsRestart(responseBody)) markModemRestart("HTTP response read");
    responseBody = "";
    return false;
  }
  lastHttpActivityAt = millis();
  lastGNSSRead = lastHttpActivityAt;
  Serial.println("[RADIO] GNSS query paused for 5 seconds after HTTPS");
  return true;
}

uint32_t lastAutoPairRequestAt = 0;

void triggerPairRequest() {
  Serial.println("\n=======================================================");
  Serial.println("[GHÉP ĐÔI TỰ ĐỘNG] KÍCH HOẠT CHẾ ĐỘ GHÉP ĐÔI XE (TỰ ĐỘNG 4G - KHÔNG CẦN BẤM NÚT)!");
  Serial.println("[GHÉP ĐÔI TỰ ĐỘNG] Mã thiết bị: " + activeDeviceId);
  Serial.println("[GHÉP ĐÔI TỰ ĐỘNG] Mã xác minh (Verify Code): " + activeVerifySecret);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] Da bat quang ba Bluetooth BLE de san sang ket noi!");

  if (!dataReady && modemReady) {
    cellularStarted = true;
    reconnect4G();
  }

  if (dataReady) {
    Serial.println("[GHÉP ĐÔI TỰ ĐỘNG] Đang gửi tín hiệu kích hoạt lên server qua 4G...");
    String body = "{\"device_id\":\"" + activeDeviceId + "\",\"verify_secret\":\"" + activeVerifySecret + "\"}";
    String resp;
    bool ok = postPublicJson(PAIR_REQUEST_URL, body, resp);
    if (ok) {
      Serial.println("[GHÉP ĐÔI TỰ ĐỘNG] >> THÀNH CÔNG! Đã báo server xe sẵn sàng ghép đôi.");
      String newToken = jsonString(resp, "device_token");
      if (newToken.length() > 0) {
        activeDeviceToken = newToken;
        preferences.putString("deviceToken", activeDeviceToken);
        preferences.putString("deviceId", activeDeviceId);
        preferences.putString("verifySecret", activeVerifySecret);
        Serial.printf("[FLASH] >>> DA NHAN & LUU DEVICE_TOKEN VAO FLASH (NVS): %s\n", maskSecret(activeDeviceToken).c_str());
      } else {
        Serial.println("[GHÉP ĐÔI TỰ ĐỘNG] >> Hãy vào trang web hoặc quét mã QR để ghép nối!");
      }
      String newUrl = jsonString(resp, "telemetry_url");
      if (newUrl.length() > 0 && newUrl != activeTelemetryUrl) {
        activeTelemetryUrl = newUrl;
        preferences.putString("telemetryUrl", activeTelemetryUrl);
        Serial.printf("[FLASH] >>> DA LUU TELEMETRY_URL VAO FLASH (NVS): %s\n", activeTelemetryUrl.c_str());
      }
    } else {
      Serial.println("[GHÉP ĐÔI TỰ ĐỘNG] >> Chưa gửi được tín hiệu 4G, xe sẽ tự thử lại...");
    }
  }
  Serial.println("=======================================================\n");
}

static bool lastPairBtnState = HIGH;
static uint32_t lastPairBtnCheckAt = 0;

void checkPairButton() {
  const uint32_t now = millis();
  if (now - lastPairBtnCheckAt < 100) return;
  lastPairBtnCheckAt = now;
  const bool currentState = digitalRead(PAIR_BUTTON_PIN);
  if (lastPairBtnState == HIGH && currentState == LOW) {
    Serial.println("[PAIR-BUTTON] Nut BOOT duoc kich hoat");
    triggerPairRequest();
  }
  lastPairBtnState = currentState;
}

void syncDeviceTokenIfMissing() {
  if (activeDeviceToken.length() > 0 || !dataReady) return;
  const uint32_t now = millis();
  if (now - lastTokenSyncAttemptAt < 10000) return;
  lastTokenSyncAttemptAt = now;

  Serial.println("[TOKEN SYNC] Dang dong bo DEVICE_TOKEN tu he thong website...");
  String body = "{\"device_id\":\"" + activeDeviceId + "\",\"verify_secret\":\"" + activeVerifySecret + "\"}";
  String resp;
  if (postPublicJson(DEVICE_TOKEN_URL, body, resp)) {
    String token = jsonString(resp, "device_token");
    if (token.length() > 0) {
      activeDeviceToken = token;
      preferences.putString("deviceToken", activeDeviceToken);
      preferences.putString("deviceId", activeDeviceId);
      preferences.putString("verifySecret", activeVerifySecret);
      Serial.printf("[FLASH] >>> DA DONG BO VA LUU DEVICE_TOKEN VAO FLASH (NVS) THANH CONG: %s\n", maskSecret(activeDeviceToken).c_str());
    } else {
      Serial.println("[TOKEN SYNC] Thiet bi hop le nhung chua duoc kich hoat tren web. Hay quet ma QR hoac bam nut tren web!");
    }
    String newUrl = jsonString(resp, "telemetry_url");
    if (newUrl.length() > 0 && newUrl != activeTelemetryUrl) {
      activeTelemetryUrl = newUrl;
      preferences.putString("telemetryUrl", activeTelemetryUrl);
      Serial.printf("[FLASH] >>> DA LUU TELEMETRY_URL VAO FLASH (NVS): %s\n", activeTelemetryUrl.c_str());
    }
  }
}

class BlePairingCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue().c_str();
    if (value.length() > 0) {
      Serial.printf("[BLE] Nhan du lieu tu Bluetooth: %s\n", value.c_str());
      String token = jsonString(value, "device_token");
      String devId = jsonString(value, "device_id");
      String secret = jsonString(value, "verify_secret");
      String url = jsonString(value, "telemetry_url");
      if (token.length() > 0) {
        activeDeviceToken = token;
        preferences.putString("deviceToken", activeDeviceToken);
        Serial.printf("[FLASH] >>> DA LUU DEVICE_TOKEN TU BLUETOOTH VAO FLASH: %s\n", maskSecret(activeDeviceToken).c_str());
      }
      if (devId.length() > 0) {
        activeDeviceId = devId;
        preferences.putString("deviceId", activeDeviceId);
        Serial.printf("[FLASH] >>> DA LUU DEVICE_ID TU BLUETOOTH VAO FLASH: %s\n", activeDeviceId.c_str());
      }
      if (secret.length() > 0) {
        activeVerifySecret = secret;
        preferences.putString("verifySecret", activeVerifySecret);
        Serial.printf("[FLASH] >>> DA LUU VERIFY_SECRET TU BLUETOOTH VAO FLASH: %s\n", activeVerifySecret.c_str());
      }
      if (url.length() > 0) {
        activeTelemetryUrl = url;
        preferences.putString("telemetryUrl", activeTelemetryUrl);
        Serial.printf("[FLASH] >>> DA LUU TELEMETRY_URL TU BLUETOOTH VAO FLASH: %s\n", activeTelemetryUrl.c_str());
      }
    }
  }
};

void initBLEPairing() {
  BLEDevice::init(("TDM2421-" + activeDeviceId).c_str());
  BLEServer *pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(BLE_SERVICE_UUID);

  // Characteristic 1: Gửi Device ID và Verify Secret cho Web đọc
  BLECharacteristic *pReadChar = pService->createCharacteristic(
    BLE_CHAR_READ_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  String infoJson = "{\"device_id\":\"" + activeDeviceId + "\",\"verify_code\":\"" + activeVerifySecret + "\"}";
  pReadChar->setValue(infoJson.c_str());

  // Characteristic 2: Nhận Token và API URL từ Web sau khi ghép đôi
  BLECharacteristic *pWriteChar = pService->createCharacteristic(
    BLE_CHAR_WRITE_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  pWriteChar->setCallbacks(new BlePairingCallbacks());

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLE_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("[BLE] Khoi dong thanh cong Bluetooth BLE: TDM2421-%s (Che do ghep doi khong day)\n", activeDeviceId.c_str());
}

void setup() {
  setCpuFrequencyMhz(160); // Xung nhịp 80MHz: tiết kiệm 40% điện CPU ESP32-C3, bo mạch mát lạnh
  Serial.begin(USB_BAUD);
  Serial.setTxTimeoutMs(0); // Không chờ máy tính: đảm bảo cắm sạc ngoài/chạy pin độc lập vẫn chạy mượt, không bị treo cổng USB!
  delay(1200);
  Serial.println("\nTDM2421 Safety Monitor 2.7 - reliable overspeed SMS + web + Bluetooth BLE");
  Serial.println("[HELP] status | sms-test | speed-test 35 | test-stop | help");
  pinMode(PAIR_BUTTON_PIN, INPUT_PULLUP);
  loadConfig();
  initBLEPairing();
  uint8_t configuredPhones = 0;
  for (const char *phone : PARENT_SMS_PHONES) {
    if (validSmsPhone(String(phone))) ++configuredPhones;
  }
  Serial.printf("[SMS-LOCAL] Vuot toc=%s, quen mu=%s; da cau hinh %u so phu huynh\n",
                LOCAL_OVERSPEED_SMS_ENABLED ? "BAT" : "TAT",
                LOCAL_HELMET_SMS_ENABLED ? "BAT" : "TAT", configuredPhones);
#if BUZZER_PIN >= 0
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUZZER_PIN_ALT1, OUTPUT);
  pinMode(BUZZER_PIN_ALT2, OUTPUT);
  setBuzzer(false);
  // Bíp test 1 tiếng 120ms dứt khoát khi vừa cấp nguồn để báo hiệu phần cứng & còi hoạt động hoàn hảo
  setBuzzer(true);
  delay(120);
  setBuzzer(false);
#else
  Serial.println("[BUZZER] Disabled: buzzer is not installed.");
#endif
  if (activeDeviceToken.length() == 0) {
    Serial.println("[WEB] Thong bao: DEVICE_TOKEN chua co san. Thiet bi se tu dong nhan va luu vao Flash khi hoc sinh quet ma QR hoac ket noi BLE!");
  } else {
    Serial.println("[WEB] Telemetry san sang gui du lieu len he thong Cloudflare Workers voi token da luu!");
  }
  modemReady = initModem();
  helmetReceiverReady = initHelmetReceiver();
  if (modemReady) {
    gnssReady = startGNSS();
    gnssStartedAt = millis();
    Serial.println("[BOOT] GNSS va 4G khoi dong (Telemetry dinh ky 5s/lan)");
  }
}

void loop() {
  // ACK cho bo mu duoc xu ly truoc de lien ket van on dinh khi modem dang gui SMS.
  processHelmetEvent();
  // The modem UART must not be used by pairing, HTTP or GNSS during SMS.
  if (smsWaiting) {
    updateBuzzer();
    pollSmsResult();
    delay(1);
    return;
  }
  checkPairButton();
  syncDeviceTokenIfMissing();

  // TỰ ĐỘNG GỬI TÍN HIỆU GHÉP ĐÔI QUA 4G KHI CHƯA CÓ TOKEN (KHÔNG CẦN BẤM NÚT BOOT!)
  if (activeDeviceToken.length() == 0 && dataReady) {
    const uint32_t now = millis();
    if (now - lastAutoPairRequestAt >= 15000) {
      lastAutoPairRequestAt = now;
      triggerPairRequest();
    }
  }

  // Open Serial Monitor at 115200, Newline. Commands: status, pair, sms-test.
  if (!smsWaiting && Serial.available()) {
    String userCmd = Serial.readStringUntil('\n');
    userCmd.trim();
    userCmd.toLowerCase();
    if (userCmd == "status") {
      Serial.printf("[STATUS] modem=%d sim=%d network=%d data=%d gps=%d speed=%.1f limit=%.1f alert=%d overspeed=%d pending=%d waiting=%d\n",
                    modemReady, simReady, networkReady, dataReady, currentGnssFix,
                    filteredSpeedKmh, config.speedLimit, config.speedAlertEnabled,
                    overspeedActive, localOverspeedSmsPending, smsWaiting);
      Serial.printf("[STATUS] simulate=%d testSpeed=%.1f helmetWorn=%d\n", speedTestActive, speedTestKmh, helmetIsWorn());
      Serial.printf("[STATUS] deviceId=%s verifySecret=%s activeToken=%s activeUrl=%s\n",
                    activeDeviceId.c_str(), activeVerifySecret.c_str(),
                    activeDeviceToken.length() > 0 ? (activeDeviceToken.substring(0, 10) + "...").c_str() : "EMPTY",
                    activeTelemetryUrl.c_str());
      Serial.println("[STATUS] AT+CPIN?: " + sendAT("AT+CPIN?"));
      Serial.println("[STATUS] AT+CEREG?: " + sendAT("AT+CEREG?"));
      Serial.println("[STATUS] AT+CSQ: " + sendAT("AT+CSQ"));
    } else if (userCmd.startsWith("speed-test ")) {
      String value = userCmd.substring(11);
      value.trim();
      float testValue = value.toFloat();
      if (testValue <= config.speedLimit || testValue > 120.0f || testValue <= 0) {
        Serial.printf("[TEST] Enter speed greater than current limit %.1f and <= 120. Example: speed-test 35\n", config.speedLimit);
      } else if (speedTestActive || localOverspeedSmsPending || smsWaiting) {
        Serial.println("[TEST] Previous test or SMS in progress; not starting another");
      } else {
        speedTestKmh = testValue;
        speedTestStartedAt = millis();
        speedTestActive = true;
        overspeedActive = false;
        overspeedStartedAt = 0;
        Serial.printf("[TEST] LOCAL SIMULATED SPEED %.1f km/h / LIMIT %.1f for %lu ms. NOT sent as GPS speed to web.\n",
                      speedTestKmh, config.speedLimit, (unsigned long)SPEED_TEST_DURATION_MS);
      }
    } else if (userCmd == "test-stop") {
      speedTestActive = false;
      speedTestStartedAt = 0;
      overspeedStartedAt = 0;
      overspeedActive = false;
      Serial.println("[TEST] Simulation stopped (already queued SMS is retained)");
    } else if (userCmd == "clear-flash" || userCmd == "reset-flash") {
      preferences.clear();
      activeDeviceToken = "";
      activeDeviceId = DEFAULT_DEVICE_ID;
      activeVerifySecret = DEFAULT_VERIFY_SECRET;
      Serial.println("[FLASH] Da xoa trang Flash NVS. Bo mach tro ve trang thai ban dau de ghep doi moi!");
    } else if (userCmd == "sync-token") {
      Serial.println("[MANUAL] Dang cuong che dong bo token tu website...");
      lastTokenSyncAttemptAt = 0;
      syncDeviceTokenIfMissing();
    } else if (userCmd == "pair" || userCmd == "boot") {
      Serial.println("[MANUAL] Cuong che gui tin hieu ghep doi qua 4G (khong can nut bam)...");
      triggerPairRequest();
    } else if (userCmd == "help") {
      Serial.println("Commands: status, pair, sync-token, clear-flash, sms-test, speed-test 35, test-stop, help");
    } else if (userCmd == "sms-test") {
      if (!modemReady) Serial.println("[SMS-TEST] Modem not ready");
      else if (!checkNetwork()) Serial.println("[SMS-TEST] SIM/network not registered");
      else {
        String phone = String(PARENT_SMS_PHONE_1);
        if (!validSmsPhone(phone)) Serial.println("[SMS-TEST] Invalid target phone");
        else if (!startSmsSend(phone, "TEST SMS TDM2421: thu gui tu chuong trinh chinh", SmsSource::MANUAL_TEST))
          Serial.println("[SMS-TEST] Could not start");
      }
    }
  }
  // The UART has one owner. Keep the buzzer responsive while SMS is pending;
  // do not interleave GNSS/HTTP commands with the modem's SMS transaction.
  if (smsWaiting) {
    updateBuzzer();
    pollSmsResult();
    delay(1);
    return;
  }
  const uint32_t now = millis();
  if (!modemReady && now - lastModemRecoveryAttemptAt >= MODEM_RECOVERY_INTERVAL_MS) {
    lastModemRecoveryAttemptAt = now;
    Serial.println("[MODEM] Recovering after restart...");
    modemReady = initModem();
    if (modemReady) {
      gnssReady = startGNSS();
      gnssStartedAt = millis();
      lastGnssFixAt = 0;
      cellularStarted = false;
      dataReady = false;
      // 'now' was captured before the recovery.  Return so the next loop
      // calculates elapsed time from the new GNSS start point; otherwise
      // unsigned subtraction can start 4G immediately after a modem reboot.
      return;
    }
  }
  if (modemReady && !gnssReady &&
      now - lastGnssStartAttemptAt >= NETWORK_RETRY_INTERVAL_MS) {
    Serial.println("[GNSS] Retrying engine start without modem reset");
    startGNSS();
  }
  const uint32_t gnssInterval = currentGnssFix ? GNSS_INTERVAL_MS : 3500;
  if (modemReady && gnssReady && now - lastGNSSRead >= gnssInterval &&
      (!lastHttpActivityAt || now - lastHttpActivityAt >= GNSS_QUIET_AFTER_HTTP_MS)) {
    lastGNSSRead = now;
    GNSSData received;
    if (readGNSS(received)) {
      lastGnss = received;
      lastGnssFixAt = now;
    }
    const float speed = filterSpeed(currentGnssFix ? lastGnss.speedKmh : NAN);
    if (!speedTestActive) checkOverspeed(speed, currentGnssFix);
    checkLocalHelmetSms(speed, currentGnssFix);
  }
  // Local-only overspeed simulation exercises real confirmation and SMS queue.
  // It does not override lastGnss or filteredSpeedKmh and is never reported to web.
  if (speedTestActive) {
    if (millis() - speedTestStartedAt < SPEED_TEST_DURATION_MS) {
      checkOverspeed(speedTestKmh, true);
    } else {
      speedTestActive = false;
      overspeedActive = false;
      overspeedStartedAt = 0;
      Serial.println("[TEST] Simulation ended; real GNSS monitoring resumed");
    }
  }
  updateBuzzer();
  executeRemoteAlarm();

  // Nếu cảnh báo xuất hiện trong 45 giây ưu tiên GNSS ban đầu, vẫn kiểm tra
  // đăng ký mạng riêng cho SMS. Không cần chờ PDP/HTTP hay web sẵn sàng.
  if (modemReady && (localOverspeedSmsPending || localHelmetSmsPending) && (!simReady || !networkReady) &&
      now - lastSmsNetworkCheck >= SMS_NETWORK_RETRY_INTERVAL_MS) {
    lastSmsNetworkCheck = now;
    Serial.println("[SMS-LOCAL] Kiem tra mang de gui canh bao ngay");
    checkNetwork();
  }
  startNextLocalSms();
  if (smsWaiting) return;

  // A GNSS fix can take several minutes after a cold start.  Keep the radio
  // quiet initially; cellular HTTP traffic must never turn GNSS off.
  if (modemReady && !cellularStarted &&
      (lastGnssFixAt > 0 || now - gnssStartedAt >= INITIAL_GNSS_PRIORITY_MS)) {
    cellularStarted = true;
    lastNetworkCheck = now - NETWORK_RETRY_INTERVAL_MS;
    Serial.println("[4G] Starting cellular data");
  }
  if (modemReady && cellularStarted && !dataReady && now - lastNetworkCheck >= NETWORK_RETRY_INTERVAL_MS) {
    lastNetworkCheck = now;
    if (!dataReady) reconnect4G();
  }
  if (!speedTestActive && modemReady && dataReady && activeDeviceToken.length() > 0 &&
      now - lastTelemetryAttempt >= telemetryRetryBackoffMs) {
    lastTelemetryAttempt = now;
    if (sendTelemetry()) {
      telemetryRetryBackoffMs = (currentGnssFix && filteredSpeedKmh >= 2.0f)
                                  ? TELEMETRY_MOVING_INTERVAL_MS
                                  : TELEMETRY_STOPPED_INTERVAL_MS;
      consecutiveHttpFailures = 0;
      Serial.printf("[TELEMETRY] SUCCESS; next in %lu seconds\n",
                    static_cast<unsigned long>(telemetryRetryBackoffMs / 1000));
    }
    else {
      // Khi gửi trượt, thử lại nhanh sau 2.5s để giữ thiết bị luôn Online trên web
      telemetryRetryBackoffMs = 2500;
      ++consecutiveHttpFailures;
      if (consecutiveHttpFailures >= 2 && modemReady) {
        recoverDataSession();
        consecutiveHttpFailures = 0;
      }
      Serial.printf("[HTTP] Telemetry failed; quick retry in %lu ms\n", static_cast<unsigned long>(telemetryRetryBackoffMs));
    }
  }
  if (smsWaiting) return;
  if (now - lastModemWatchdog >= MODEM_WATCHDOG_INTERVAL_MS) {
    lastModemWatchdog = now;
    if (sendAT("AT", 1500).indexOf("OK") < 0) {
      modemReady = initModem();
      if (modemReady) {
        gnssReady = startGNSS();
        gnssStartedAt = millis();
        lastGnssFixAt = 0;
        cellularStarted = false;
        dataReady = false;
      }
    }
  }
}
