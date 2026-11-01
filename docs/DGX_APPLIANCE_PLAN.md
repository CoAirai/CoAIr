# CoAIr cihaz ürünü — uygulama planı

Durum: 24 Eylül 2026. Bu belge bir tasarımdır; cihaz kurulumu, şifreleme veya çevrimdışı çalışma henüz uygulanmış ve doğrulanmış değildir.

## Hedef

CoAIr'ı müşteri belgelerini yerelde işleyen, açılışta çalışan, yerel ağdan erişilen ve sürümlü güncellenen bir cihaz uygulaması olarak teslim etmek. ASUS cihazının tam modelini ve disk/firmware özelliklerini kurulum öncesinde doğrulamak gerekir. ASUS Ascent GX10, NVIDIA GB10 ve 128 GB birleşik bellek kullanır; bunlar tek başına belirli bir modelin kabul edilebilir hızda çalışacağını garanti etmez.

Kaynak: https://www.asus.com/us/networking-iot-servers/desktop-ai-supercomputer/ultra-small-ai-supercomputers/asus-ascent-gx10/techspec/

## Ürün kararları

Kullanıcı tercihi (24 Eylül): işletimde internet bağlantısı olmayacak; şirketler cihazın yerel ağına bağlanıp belge yükleyecek ve kaliteli çıkarımı cihaz üzerinde kullanacak. Kod/lisans koruması önemli, ancak kullanılabilir çevrimdışı ürünün ardından ele alınacak. Kurulum ve uzaktan inceleme sırasında kullanılan Tailscale, müşteri kullanımının internet bağımlılığı olarak tasarlanmamalı.

24 Eylül canlı incelemesinde SSH erişimi doğrulandı; cihaz DMI kimliği NVIDIA DGX Spark (ASUS değil), GB10 ve 121 GiB bellek. Ayrıntılar: [cihaz incelemesi](DGX_DEVICE_INSPECTION_2026-09-24.md). Henüz bilinmeyenler: eşzamanlı kullanıcı sayısı, belge hacmi ve kabul edilen rapor süresi. Model seçimi gerçek cihazda kalite ve gecikme ölçümünden sonra yapılmalı.

## Mevcut koddan bulgular

- ReAct, belge agentı ve hafif graph çekirdeği ML_project_V2 ile aynı.
- Main metin sağlayıcısı Gemini veya Z.AI; ML_project_V2'deki vLLM adaptörü burada yok. Adaptör ve testleri incelenerek taşınmalı; tüm eski config dosyasını kopyalamak main'deki şirket izolasyonunu kaybettirebilir.
- OCR/görsel işleme ve bazı LlamaIndex başlangıç yollarında Gemini bağımlılığı var. Yalnız metin sağlayıcısını değiştirmek çevrimdışı çalışma sağlamaz.
- API'de yerel kimlik doğrulama yolu var; kökteki güncel arayüzün kayıt, giriş, oturum yenileme ve yönetim akışlarının bununla uçtan uca doğrulanması gerekiyor.
- api/docker-compose.yml API altındaki eski arayüzü paketliyor. Ürün imajı kökteki güncel Next.js arayüzünü içermeli.
- Qdrant, belgeler, SQL verisi, konuşmalar, raporlar, önbellekler ve yedekler aynı veri koruma kapsamına alınmalı.

## Uygulama sırası ve kabul koşulları

1. Kronoloji: bağımsız kaynaklı cümleleri koru; tarih, alıntı, sayı, karşı kanıt ve kaynak doğrulamasını sürdür. Bir olayın onarımında bölünen cümleleri sessizce kesme. Gerçek anonimleştirilmiş belgelerde kaynak doğruluğu, olay kapsamı, tekrar, süre ve tepe bellek ölç.
2. Yerel çıkarım: OpenAI uyumlu yerel endpoint adaptörü, görev bazlı bağlam bütçeleri ve yapılandırılmış çıktı doğrulaması. Endpoint kesildiğinde anlaşılır hata; buluta sessiz geçiş olmamalı. Model adı rapor metaverisinde gerçeği yansıtmalı.
3. Çevrimdışı bağımlılıklar: embedding, OCR, tokenizer ve model dosyalarını kurulum sırasında hazırla. Dış ağ kapalıyken yeni belge yükleme, arama, kronoloji, Word dışa aktarma ve yeniden başlatma testlerini geçir.
4. Kurulum: ARM64 uyumlu, sürümü sabitlenmiş imajlar; güncel web arayüzü, API/worker, çıkarım sunucusu, Qdrant ve yerel veri servisleri. Açılışta başlatma, sağlık kontrolü, disk doluluk kontrolü ve başarısız güncellemeden geri dönüş.
5. Veri koruma: standart disk/veri alanı şifreleme; cihaz başına anahtar; kurtarma anahtarı teslim ve saklama politikası; şifreli yedek ve geri yükleme testi. Anahtarları uygulama imajına veya Git'e koyma. Donanım anahtar saklama ve otomatik kilit açma ancak gerçek cihaz yetenekleri doğrulanınca seçilmeli.
6. Uygulama/lisans: üretici özel anahtarı cihaz dışında tutulan imzalı lisans ve imzalı güncelleme. Cihaz kimliğine bağlama, disk değişimi, cihaz değişimi, saat geri alma ve çevrimdışı süre politikalarını tanımla. Paketleme/derleme kodu inceleme maliyetini artırabilir; müşteri yönetici yetkisine karşı mutlak gizlilik sağlamaz.
7. Teslim: fabrika kurulum imajı, ilk açılış sihirbazı, yönetici hesabı oluşturma, yedekleme/kurtarma rehberi ve cihaz bazında kabul raporu.

NVIDIA DGX Spark Secure Boot belgeleri referans olabilir; ASUS firmware menüleri ve özellikleri ayrıca doğrulanmalı: https://docs.nvidia.com/dgx/dgx-spark-uefi/security-tab.html

## Bu değişiklikte tamamlanan kronoloji işleri

- V2/V3 üretim şemalarında olay başına dört, özette beş kaynaklı iddia.
- V3 anlatım sınırları: özet 60–260, olay 12–260 kelime; normal uzunluğu prompt yönlendirir. Bu sınırlar kalite ölçümü değildir.
- V3 onarımının doğrulanmış cümleleri eski 2/3 sınırında kesmesi kaldırıldı.
- Promptlar örnek kronolojileri taklit etmek yerine sağlanan proje kanıtına dayalı anlatımı yönlendiriyor; yetersiz kanıtı kelime hedefine ulaşmak için doldurma yasak.
- Prompt/işlem revizyonları eski sonuçlarla önbellek karışmasını önlemek için değiştirildi.
- Kaynak, tarih ve karşı kanıt denetimleri korunuyor. Gerçek modelle kalite veya DGX performans testi henüz yapılmadı.
