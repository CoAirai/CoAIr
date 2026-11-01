# DGX demo ve ofis pilotu: uygulama ve kabul durumu

2 Ekim 2026 tarihinde mevcut DGX'te ayrı `coair-demo` ortamı devreye alındı.
Mevcut uygulama da aynı korumalı API/frontend sürümüne yükseltildi; belgeleri,
sohbetleri ve yönetim hesabı korunuyor. Fiziksel kullanıcının adresi
`http://localhost:8080/auth/sign-in`; kök yönlendirme 8080 portunu koruyor.
Bu adres ve giriş API'si yeni sürümde doğrulandı.

## Uygulanan davranışlar

- Demo: kullanıcı başına 5.000.000.000 byte, 7 gün boyunca 1.000.000 token;
  ofis: aynı depolama ve UTC günü başına 100.000 token. Dosya sınırı 100.000.000 byte.
- Atomik depolama/token rezervasyonları, gerçek kullanımın tüm denemeler için
  hesaba katılması ve yönetim ekranında kullanılan/rezerve kota görünümü.
  Şirket yöneticisinin platform sınırını artırması engelleniyor.
- Tek kişisel proje, zorunlu ilk şifre değişimi, eski oturum iptali, hesap bitişi
  ve her yetkili istekte hesap/şirket/proje kontrolü. Süre sonunda veri silinmez.
- Kişisel projeler açık üyelik olmadan çalışanlara kapalı; şirket sahibi kendi
  şirketinin projelerine ulaşır. Mevcut kullanıcıya özel sohbet gizliliği korunur.
- Seçili belge sınırı; şirket/proje kapsamlı dosya adları, konu kümeleri,
  ilişki grafiği, SQL tabloları, önbellek, indirme ve arka plan işleri.
- Normal çıktı 8.192 → 16.384; uzun rapor 16.384 → 32.768, kesilince tek tekrar.
  Bağlam 131.072, tokenizer ile girdi sayımı, çıktı rezervi ve güvenlik payı.
  Boş/kesilen sonuç başarı veya önbellek girdisi sayılmaz. Yerel model hatası,
  kota ve zaman aşımı eski genel başarı mesajlarıyla örtülmez.
- Normal deneme 360 saniye, rapor denemesi 600 saniye; ilerlemeli arka plan raporu.
  Kullanıcı başına bir, cihazdaki iki ortamın toplamında üç aktif sohbet üretimi;
  ayrı ve sınırlı OCR/metadata işçileri. Düşünme varsayılanı kapalı.
- Ayrı demo veritabanı/vector/belge/sohbet birimleri; ortak `/import` ve geliştirme
  klasörleri bağlı değil. Kullanıcı ağına HTTPS ve isteğe bağlı tünel SSH dışında
  model/veritabanı/yönetim erişimi verilmez. IPv4, IPv6 ve Docker DNAT korunur.
- Ayrı SSH 2222 daemonu, anahtarlı kişisel nologin hesaplar, `MaxSessions 0`,
  yalnız uygulama portuna yerel tünel. Terminal, SFTP, sudo, Docker, başka hedef,
  ters tünel, agent/X11 kapalı. Süre/iptal/pasif hesap kontrolü aktif tüneli kapatır.
- AES-256-GCM yedek, ayrı anahtar, doğrulanmış geçici ortama geri yükleme kontrolü;
  bilinmeyen token kullanımını denetimli uzlaştırma aracı.
- Tek temiz ofis teslim klasörü: `/home/coair/coair-office-delivery` (DGX).
  Toplam 49,17 GB güncel 7 imaj ve sabit model revizyonu ve SHA-256 manifesti; müşteri belgesi,
  geliştirme uygulama kaynağı, eski imaj, imzalama anahtarı veya hesap sırrı içermez.

## Doğrulanmış kabul kanıtı

- 220 backend testi geçti. Gerçek HTTP model taşımasıyla kesilme, boş çıktı,
  401, bağlam aşımı, timeout, tek yeniden üretim, kota ve önbellek davranışı sınandı.
- Korumalı imaj kontrolü ve dört olumsuz test geçti: anahtar yok/yanlış,
  yanlış cihaz, değiştirilmiş şifreli içerik. Teslimde 77 imaj katmanı denetlendi;
  düz uygulama kaynağı/anahtar bulunmadı.
- İki şirketle ilk şifre, kişisel proje, şirket sahibi, paylaşma/iptal,
  dosya ve sohbet erişimi, seçili belge atıfları, başka belge kimliği reddi ve
  ortak import yasağı gerçek API üzerinden geçti.
- Gerçek 100.000.001 byte yükleme HTTP 413 aldı; dosya kayıtları değişmedi.
- Sınırlı SSH üzerinden 105,483 saniyede 5.407 kelime / 7.927 çıktı tokenı,
  seçili belgeye doğru atıf ve tamamlanmış cevap alındı.
- Düşünme açık test: 70,055 saniye, 111 girdi + düşünme dahil 5.409 çıktı tokenı;
  kotaya tam 5.520 yazıldı. Görünür cevap vinç hesabında doğru 124 ton sonucunu verdi.
  Gizli düşünce metni teslim kaydına alınmadı.
- Asenkron kronoloji raporu 15,079 saniyede `ready` oldu; ilerleme aşamaları ve
  gerçek Word dosyası doğrulandı. Başka şirketin iş/indirme erişimi HTTP 404 aldı.
  İçerik `partial`/`thin_record` olarak işaretlendi: iki tarihli olaydan biri
  tarihsiz özetlenmiş. Bu kabul iş/erişim/indirmenin çalışmasını doğrular;
  raporun eksiksiz olay ve tarih kapsamına sahip olduğu anlamına gelmez.
- SSH komut/SFTP/ters tünel/başka hedef engellendi. Anahtar iptali, süre bitişi
  ve uygulama hesabı pasife alınması açık bağlantıyla sınandı.
- Güvenilmeyen test ağından Docker HTTPS 443 geçti; 22/8000/8080 reddedildi.
  Bu test gerçek dış Tailscale kimliğiyle politika kabulü yerine geçmez.
- Kurucu, test TLS ve ayrı ağ namespace'inde gerçek paket checksum/ARM64/
  sertifika kimliği/anahtar/boş alan/port kontrolünden geçti; yanlış hostname
  ve mevcut kurulum klasörü reddedildi. Test sertifikası müşteri teslimine konmadı.
- Temiz, geçici PostgreSQL üzerinde tek operatör + şirket sahibi + kişisel proje,
  ofis kotaları ve ilk şifre şartı geçti; dolu DB'ye kurulum reddedildi.
- Son yük sonrası AES-256-GCM yedek ve geçici ortama geri yükleme geçti:
  11 kullanıcı, 10 proje, 2 şirket, 64 depolama kaydı ve 9 kullanım satırı
  eşleşti. Belge/depolama/Qdrant dosya hashleri eşleşti; üretim verisi üzerine
  yazılmadı. Açık token rezervasyonu kalmadı. Kanıt: `backup-restore.json`.
- İlk 30 dakikalık yük: 681/681 başarılı sohbet, 60 başarılı arka plan yüklemesi,
  p95 9,354 saniye. Son izolasyon sürümüyle ikinci test 1.801,83 saniye sürdü: 702/702
  sohbet ve 60/60 arka plan yüklemesi başarılı, p95 9,005 saniye. Ortanca
  girdi 2.497, çıktı 319 token; benzersiz sorularla uygulama önbelleği aşılmıştır.
  Ölçüm: `diagnostics/dgx/load.json`.

Aktif API imajı: `sha256:b6f7abdcfbd1007616b35a901b1689ffc931984a57412c85e3ce72fd4fd48494`.

Kanıtlar: `diagnostics/dgx/deployment.json`, `diagnostics/dgx/acceptance.json`, `report-acceptance.json`,
`long-response.json`, `thinking-budget.json`, `tunnel-lifecycle.json` ve ilgili
tekrar çalıştırılabilir kabul scriptleri. Bunlar yalnız kurmaca test belgelerini içerir.

## Dış girdiler nedeniyle kalan teslim adımları

**HTTPS hazır değil:** tailnet yönetiminde Serve aktivasyonu bekliyor.
Hedef `https://spark-9631.tail761c2d.ts.net/auth/sign-in` henüz müşteri bağlantısı
olarak paylaşılmamalı. Yönetici aktivasyonu:
https://login.tailscale.com/f/serve?node=nKeu3PzCtR11CNTRL

Gerçek kullanıcı Tailscale kimliği ve isteğe bağlı SSH `.pub` anahtarı verilmedi.
Bu nedenle gerçek müşteri hesabı/anahtarı ve tailnet grant'i dağıtılmadı;
politika taslağı hazırlanmış olsa da farklı müşteri kimliğiyle kabulü yapılmadı.
HTTPS üzerinden uzun cevap kabulü aktivasyon sonrasında tamamlanacak.

Müşteri ofis DNS adı, güvenilen TLS sertifikası ve yeni müşteri cihazı bilgileri
verilmedi. Temiz paket/kurucu hazır; gerçek ofise kurulduğu ve kullanıcıya
çalışan yerel HTTPS adresi teslim edildiği iddia edilmiyor. Tam geri yükleme
adres geçişi öncesinde boş kurulumda uygulama kabulü de yapılmalı.

Adım adım kullanıcı bağlantısı: [USER_GUIDE.md](USER_GUIDE.md).
Operatör kurulum, ağ politikası, SSH hesabı ve kurtarma: [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md).
