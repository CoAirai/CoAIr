# DGX belge yükleme ve çevrimdışı işleme incelemesi

## Teslim hedefi

Şirket, cihazı yerel ağına bağlar; tarayıcıdan CoAIr'ı açar; belge yükler; OCR/metadata/indeksleme durumunu görür; kaynaklı cevap ve kronoloji üretir. Kullanıcı SSH, GitHub veya bulut hesabıyla uğraşmaz. İşletimde WAN bağlantısı gerekmemeli. Tailscale şu an yalnız uzaktan hazırlık/inceleme erişimidir.

Bu hedef henüz uçtan uca kurulmuş değildir. Çalışan servis vLLM/Qwen3-8B'dir. Güncel main arayüzü, API ve veri servisleri cihazda çalışan bir uygulama olarak teslim edilmedi.

## Veri aktarımı

- Kaynak: Downloads içindeki `Edinburgh Subset Docs-20260924T165217Z-1-001.zip`.
- ZIP: 1.633.676.442 bayt; açılmış içerik: 2.152.965.833 bayt.
- İçerik: 1.210 PDF, 26 XLS, 6 XLSX; toplam 1.242 dosya.
- Kaynak SHA-256: `666b7f3757064728e517694edce000994c912b81adbfa4b9a81d893605d2421d`.
- Cihaz çalışma dizini: `/home/coair/datasets/edinburgh-subset-20260924/` (yalnız coair kullanıcısına açık).
- Tam aktarım ve açma doğrulandı. Cihazdaki arşivin SHA-256 değeri kaynakla eşleşti; 1.242 dosya, toplam 2.152.965.833 bayt açıldı. Cihazdaki `reports/archive-manifest.json` durumu `staged_and_verified`, `application_indexed: false`. Geçici aktarım parçaları temizlendi; ZIP ve açılmış orijinaller korundu.
- Cihazdaki `stage_archive.py`, aktarım manifesti geldiğinde her parçayı SHA-256 ile denetler, ZIP'i birleştirir, yolları kontrol ederek açar ve her dosyanın hash'ini kaydeder. Orijinaller `documents/` altında saklanır. Uygulama indeksine otomatik eklemez.
- Yerel çalışma/log dizini: `/Volumes/Adata/coair-dgx-work/20260924/`.

## Gerçek cihazda yapılan denemeler

| Deneme | Sonuç | Sınır |
|---|---|---|
| Mevcut OCR + regex metadata | 9 PDF, toplam 26 sayfa işlendi | Her belgenin yalnız ilk 3 sayfası; 6 belge kısmi |
| OCR ağ izolasyonu | Docker `--network none`, başarılı çıkış | Tüm cihazın WAN bağlantısı kapatılmadı |
| Zorunlu görüntü OCR | BFB00095823 ilk sayfa, 3,53 saniye | Tesseract güven değeri 0,948; bu doğruluk yüzdesi değildir |
| Yerel Qwen metadata pilotu | 9 belgede yapılandırılmış yanıt | İlk 3 sayfa ve sayfa başına en çok 8.000 karakter; uygulamanın event_memory hattının yerine geçmez |
| Literal kaynak kontrolü | İlk pilotta 47 aday alanın 41'i alıntı kontrolünden geçti | Semantik doğruluk ölçümü değildir; tarih ataması hataları gözlendi |
| Ağsız metadata pilotu | 2 belge, ağsız konteyner → Unix socket → cihazdaki vLLM; exit 0 | Mevcut vLLM sunucusunun ağı değiştirilmedi; bulut sağlayıcısı kullanılmadı |
| Excel çıkarımı | 4 dosyanın 3'ünden toplam 4 tablo | Sayısal/semantik tablo doğruluğu ayrıca denetlenmeli |
| Şifreli Excel | `CEC02085604.xls`: Workbook is encrypted | Parolasız içerik okunamaz; orijinale dokunulmadı |

Deneme bağımlılıkları kurulum sırasında indirildi. OCR/Excel denemeleri ağsız çalıştırıldı; model pilotunda on-device Qwen kullanıldı. Geçici model köprüsü denemeden sonra durduruldu; geçici anahtar dosyası ve anahtar taşıyan deneme konteynerleri kaldırıldı. Asıl vLLM servisi değiştirilmedi.

## Kanıtlı bulgular ve değişiklikler

1. **PDF başlık sırası:** BFB00095823'te içerik akışı bütün etiketleri önce, değerleri sonra saklıyordu. Gönderen `Sent:`, alıcı `Subject:`, konu `Attachments:` oluyordu. Native çıkarımda okuma sırası kullanıldı; başlık etiketi tek başına değer olarak reddedildi. Gerçek cihazda aynı belgenin göndereni, alıcısı ve konusu doğru satırlarla eşleşti. Çok sütunlu diğer belgelerde alanların birbirine karışması hâlâ ayrıca değerlendirilmelidir.
2. **Belge tarihi / olay tarihi:** Qwen pilotu ADS00040 içindeki proje olay tarihlerini belge tarihi olarak etiketledi. Exact quote eşleşmesi bu anlam hatasını yakalamadı. Pilot doğrulayıcısına ilk sayfada açık Date/Sent/Issued vb. etiketi gerektiren muhafazakâr kural eklendi. Etiketsiz kapak tarihleri otomatik kabul edilmez. Bu pilot kuralı, uygulamanın tüm tarih çıkarım yollarına henüz entegre edilmedi.
3. **Şifreli Excel:** Extractor şifreli XLS hatasını yutup boş tablo listesi döndürüyordu. Artık `EncryptedWorkbookError` üretiyor; file router anlaşılır `encrypted_workbook` hatasını koruyor. Gerçek şifreli dosyada yeniden doğrulandı.
4. **Büyük sayfalar:** CEC01115652'nin sayfa geometrisi yaklaşık 2480 × 3670 PDF point. 300 DPI denemesi yaklaşık 158 milyon piksellik raster üretti ve Pillow uyarısı verdi. Büyük taramalar için çözünürlük/piksel bütçesi veya parça parça OCR tasarlanmalı; henüz uygulanmadı.
5. **Mac yan dosyaları:** Örnek aktarımına karışan `._` yan dosyaları gerçek belge değildir. Deneme betiği bunları filtreliyor. Uygulamanın yükleme servisi zaten bunları reddediyor.

Seçili OCR, metadata, Excel, file router ve kronoloji kontrolleri: **175 test geçti**. Daha geniş eski `test_notice_graph.py` çalıştırmasında, değiştirilmeyen router'da artık bulunmayan TIMELINE_KEYWORDS / compound-intent metotlarına ait 8 test başarısızdı; bunlar bu çalışmada düzeltilmedi.

## Uygulama olarak kurulumda kalan işler

1. Main'in merkezi LLM katmanına mevcut yerel vLLM adaptörünü, buluta sessiz geçiş olmadan taşımak. 32.768 token bağlam için girdi/çıktı ve belge parçalama bütçelerini uyarlamak.
2. Güncel kök Next.js arayüzünü API/worker, yerel kimlik doğrulama, Qdrant ve yerel depolamayla paketlemek. Mevcut API Dockerfile eski API-altı arayüzü derliyor.
3. Embedding/OCR/model dosyalarını kurulumda hazır bulundurmak; çalışma sırasında indirme veya bulut OCR gerektirmemek.
4. Tarayıcıdan yükleme → kalıcı kuyruk → OCR → metadata → indeksleme → kaynaklı arama zincirini gerçek belgelerle test etmek. Dosya diskte, aranabilir ve olay indeksi hazır durumlarını ayrı göstermek.
5. Şifreli, bozuk, aşırı büyük ve kısmen işlenen dosyalarda açık durum/hata mesajları; yeniden deneme ve yeniden başlatma sonrası kurtarma.
6. Son kabul: uygulama servislerinin dış ağa çıkışı kapalıyken yeni kullanıcı girişi, yeni belge yükleme, arama, kronoloji ve dışa aktarma. Model kalitesi yalnız model boyutuna veya bu küçük pilota bakılarak kabul edilmemeli.

Kod gizleme, cihaz lisansı ve disk şifreleme, kullanıcının belirttiği önceliğe göre bu kullanılabilir yerel kurulumun ardından ele alınacak.
