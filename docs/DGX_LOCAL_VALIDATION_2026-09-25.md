# DGX yerel uygulama pilot doğrulaması — 25 Eylül 2026

Branch: `feat/dgx-local-appliance`; çalışma klasörü: `CoAIr-fixes`.
Cihaz: spark-9631, ARM64 DGX Spark / GB10. Mevcut Qwen3-8B vLLM
servisi kullanıldı; çalışan model servisi değiştirilmedi.

## Çalışan yapı

- Pilot giriş: `http://100.91.121.116:8080/auth/sign-in` (Tailscale erişimi gerekir).
- Belgeler: `/workspace/documents`; cihazdaki arşivden seçerek aktarım,
  tarayıcıdan yükleme, OCR metni ve metadata düzenleme, yeniden indeksleme.
- Yerel PostgreSQL, Qdrant, belge dosyaları, inceleme sürümleri ve önbellekler
  kalıcı Docker volume'larında. Bazı yardımcı indeksler SQLite/DuckDB kullanır;
  bunlar da cihazdadır.
- OCR: Tesseract İngilizce + Türkçe, doğal PDF metni öncelikli.
- Embedding: imaja dahil BAAI/bge-base-en-v1.5, ONNX/CPU, 768 boyut.
- Metadata ve agent: cihazdaki Qwen3-8B; bulut sağlayıcıya geri dönüş yok.
- İki belge işçisi, belge başına iki OCR işçisi, iki eşzamanlı metadata isteği.
  Kalıcı iş kuyruğu, içerik/sürüm tabanlı metadata önbelleği.
- Başlık, dosya adı, özet, belge türü, başlık satırından tarih, kişi/kurum
  adları, konular ve kaynak kanıtı saklanır. Belgedeki kişiler uygulama
  hesaplarından ayrı bir alandır. Kesinleşmeyen tarihler boş bırakılır.
- Metadata ilk 24.000 karakterden üretilir; kapsamın eksik olduğu işaretlenir.
  Tam çıkarılmış sayfa metinleri arama indeksine girer.

## Ölçümler ve doğrulama

| Kontrol | Sonuç |
| --- | --- |
| Geniş seçilmiş backend regresyon grubu | 226 test geçti |
| Son kimlik/evidence değişiklikleri | 63 test; son tarih düzeltmesiyle 18 ilgili test geçti (gruplar örtüşür) |
| Next.js üretim imajı | Derleme ve tip kontrolü başarılı; mevcut lint uyarıları var |
| 3 gerçek PDF / toplam 12 sayfa | Paralel metadata + embedding + kayıt: 71,1 saniye |
| İki sayfa görüntü PDF'si | OCR yaklaşık 4 saniye; tam ilk indeksleme 42,5 saniye |
| Çok adımlı belge karşılaştırma agent'ı | 40,1 saniye; vLLM ile 3 çağrı, iki belgeye kaynak |
| Kaynaklı seçili belge sohbeti | Başarılı; tekrarlanan sorgularda önbellek kullanılır |
| Qdrant | 768 boyutlu vektörler ve metadata doğrulandı; proje/belge filtreli yoğun arama çalışıyor |
| Düzenleme → yeniden indeksleme | Başlık değişikliği kalıcı, sürüm 0 → 1; eski sürüm yazımı HTTP 409 |
| API/web yeniden başlatma | Giriş, 5 pilot belge ve inceleme sürümü kalıcı |
| İmaj arşivi | SHA256 kontrolü başarılı |
| Orijinal belge | Düzenleme/yeniden indeksleme öncesi ve sonrası SHA256 aynı |
| Ağ izolasyonu | API'den dış IP:443 bağlantısı ENETUNREACH; yerel model çalışıyor |

OCR testi, gerçek e-postanın ilk iki sayfasının 180 DPI görüntüye çevrilmiş
kopyasıyla yapıldı. Orijinal arşiv dosyasına dokunulmadı. Küçük örnek sonuçları,
1242 dosyalık arşivin tamamı için hız veya doğruluk garantisi değildir.
Test sırasında metadata alıntısı, seçili belge vektör kimliği ve düzenlenmiş
metnin LlamaIndex'e aktarılması sorunları bulunup düzeltildi.

## Paket ve kullanım

DGX üzerindeki güncel uygulama paketi:
`/home/coair/coair-local-package-20260925-v4/`.
Yaklaşık 3,2 GB `images.tar`, SHA256 doğrulaması, kurulum betikleri ve README içerir.
Müşteri belgeleri, veritabanları, parolalar ve Qwen ağırlıkları dahil değildir.
İkinci cihaz için model imajı ve ağırlıkları ayrıca aktarılmalıdır.

Giriş bilgileri repository dışında, yalnız dosya sahibinin okuyabildiği
`/Volumes/Adata/coair-dgx-work/20260924/coair-local-access.json` dosyasındadır.
Bu dosyayı imaja veya Git'e eklemeyin.
Kurulum ve işletim: [deploy/dgx/README.md](../deploy/dgx/README.md).

## Açık sınırlar

- Arşivin 1242 dosyası cihazda doğrulanmış olarak duruyor. Uygulamada yalnız
  pilot belgeler işlendi; arşivin tamamı henüz indekslenmedi.
- BGE modeli İngilizce odaklıdır. Türkçe corpus için çok dilli embedding
  karşılaştırması ve yeniden indeksleme gerekir; Türkçe OCR dil paketi hazırdır.
- Metadata kişi listesi özellikle uzun belgelerde kapsamlı kişi envanteri sayılmaz.
- Tarayıcı otomasyonu kullanılabilir değildi; arayüz görsel kabul testi yapılmadı.
  API akışları ve üretim frontend derlemesi doğrulandı.
- İkinci, temiz DGX'te kurulum ve fiziksel ağ kesintisi testi yapılmadı.
  Bu pilot mevcut Tailscale adresli model sunucusunu kullanır. İkinci cihaz
  için dahili ağda model çalıştıran Compose seçeneği hazırlanmıştır.
- Şirket DNS/HTTPS, disk şifreleme, yedekten geri dönüş tatbikatı ve imzalı
  güncelleme süreci ticari teslim öncesi tamamlanmalıdır. İmaj tek başına
  kaynak kodunu veya disk verisini şifrelemez.
- Kronoloji yerel model bağlam sınırlarına uyarlandı ve regresyon testleri geçti;
  tüm arşiv üzerinde kronoloji kalite kabulü henüz yapılmadı.
