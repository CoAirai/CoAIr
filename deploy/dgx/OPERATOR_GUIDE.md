# DGX operatörü: demo ve temiz ofis kurulumu

## Canlı demo

Ayrı Compose projesi `coair-demo`; yalnızca `127.0.0.1:18081` üzerinden HTTP.
Kendi PostgreSQL/Qdrant/belge/sohbet/cache/log birimleri vardır; `/import` bağlanmaz.
Kullanıcı/şirket test hesapları özel `/home/coair/coair-demo-acceptance/access.json` dosyasındadır.
Bu dosyayı müşteri teslimine kopyalamayın. Gerçek kullanıcıyı yönetim ekranında şirketi içinde oluşturun;
kişisel proje, 5 GB, bir milyon token, ilk şifre değişimi ve yedi günlük bitiş otomatik uygulanır.

Tailscale Serve aktivasyonu yöneticinin hesabında tamamlanmalı. Sonra root olarak:

```sh
tailscale serve --bg --https=443 http://127.0.0.1:18081
tailscale serve status
```

Funnel açmayın. `tailscale-policy.hujson` bir **birleştirme taslağıdır**; mevcut yönetim
politikasını tamamen değiştirmeyin. Kimlikleri gerçek Tailscale girişleriyle doldurun.
Mevcut geniş/wildcard kurallar aynı kullanıcıya daha fazla izin veriyorsa kaldırın;
kuralların toplamı erişimi belirler. Kullanıcıya yalnız HTTPS, gerekirse SSH 2222.
Tag uygulanınca mevcut yönetim erişimini kaybetmemek için politika testlerini önce çalıştırın.
Farklı bir müşteri kimliğinden 22/8000/8080 ve veritabanı portlarının kapalı olduğunu doğrulamadan paylaşmayın.
[Serve belgesi](https://tailscale.com/docs/features/tailscale-serve),
[OpenSSH belgesi](https://man.openbsd.org/sshd_config).

## SSH hesabı

Yalnız müşterinin `.pub` anahtarını alın. Root olarak, uygulama hesabıyla ilişkilendirerek:

```sh
python3 /usr/local/lib/coair/tunnel_accounts.py add \
  --name tunnel-ayse --app-user GERCEK_COAIR_KULLANICISI \
  --public-key /guvenli/yol/ayse.pub --expires-at GERCEK_UTC_BITIS_TARIHI
```

Örneği gerçek kullanıcı/tarihle doldurun. Bitiş uygulama hesabını geçemez.
Hesaplar `coair-tunnel` grubunda, nologin kabuğuyla, ev klasörü/sudo/docker yetkisi olmadan oluşturulur.
Anahtar dosyası herkesçe okunabilir bir **public key** içerir; yazma yetkisi root'tadır.
Kayıt dosyası root 0600'dür. `MaxSessions 0`, `PermitOpen` sadece uygulama hedefi,
local forwarding, TTY/SFTP/agent/X11/remote forwarding kapalıdır.

```sh
python3 /usr/local/lib/coair/tunnel_accounts.py revoke --name tunnel-ayse
systemctl status coair-tunnel.service coair-tunnel-expire.timer
```

İptal mevcut kullanıcı süreçlerini kapatır. Süre veya uygulama hesabının pasife alınması,
şirket üyeliğinin kaldırılması/şirketin arşivlenmesi en geç yaklaşık 30 saniyede tüneli iptal eder.
Uygulama DB'si doğrulanamıyorsa erişim kapalı kabul edilir; tekrar açmak için operatör `add` çalıştırır.
Yönetim SSH daemonu/hesabı kullanıcıya verilmez. Temiz ofiste `--database-container coair-office-db-1` kullanın.

## Kota ve hata toparlama

Profil sınırları platformda sabittir; şirket yöneticisi artırmaz. Normal çıktı 8192→16384,
uzun rapor 16384→32768; çıktı kesilince yalnız bir tekrar. Bağlam 131072, girdi sayımı servis tokenizer'ıyla.
Normal deneme 360s, rapor denemesi 600s. Retry gerçek kullanımı kotaya eklenir.
Boş/kesilen cevap önbelleğe girmez. Denklem: kullanılmış + rezerve + yeni isteğin üst bütçesi ≤ kota.

Kullanımı belirsiz zaman aşımı rezervini **ölçmeden sıfırlamayın**. Model loglarından gerçek kullanımı
ve işin sona erdiğini doğruladıktan sonra root olarak `token_reservations.py --database-container ... list`
ve `settle --reservation-id ... --confirmed-tokens ... --note ...` kullanın.
İşlem idempotenttir, root `/etc/coair/token-reconciliation.jsonl` denetim kaydı tutar.

## Şifreli yedek ve geri yükleme

`backup_restore.py` root çalışır, yalnız demo/ofis projelerini kabul eder. API ve Qdrant kısa süre durur,
PostgreSQL custom dump ve belge/depolama/vector birimleri AES-256-GCM ile şifrelenir.
İşlem sonunda servisler tekrar başlar. Büyük işlem öncesi diski kontrol edin.

```sh
python3 backup_restore.py --key /guvenli/coair-backup.key backup \
  --project coair-demo --output /yedek/coair-demo.enc \
  --configuration /kurulum/demo.env /kurulum/protection-secrets/device.key /kurulum/protection-secrets/license.json
python3 backup_restore.py --key /guvenli/coair-backup.key restore-check --input /yedek/coair-demo.enc
```

Anahtar yedeğin dışında 0600 saklanır; şifreli yedeği ayrı diske/konuma taşıyın.
Restore-check önce GCM kimlik doğrulamasını tamamlar; ardından yalnız yeni geçici DB/birimlere geri yükler.
DB kayıt sayıları ve dosya SHA-256 değerleri karşılaştırılır; geçici kopyalar kaldırılır.
Bu araç **üretim verisinin üzerine otomatik yazmaz**. Felaket kurtarmada doğrulanmış kopyaları yeni
boş kuruluma bağlayıp uygulama giriş/belge/sorgu kabulünü tamamlayın; sonra kontrollü adres geçişi yapın.
İmzalama anahtarı müşteri kurulumu veya yedeğe dahil edilmez. Fiziksel erişime karşı mutlak koruma vaat edilmez.

## Temiz ofis paketi

DGX'te `export_office.py` sadece doğrulanmış protected API, yeni frontend, embedding, PostgreSQL,
Qdrant, nginx ve mevcut vLLM imajı ile **tek** pinned Qwen3.6 NVFP4 modelini paketler.
Model revizyonu manifestte, imajlar SHA kimliğiyle sabitlenir; bütün katmanlar uygulama kaynağı/anahtar için denetlenir.
Mevcut müşteri belgeleri, geliştirme kaynakları, eski imajlar, sırlar ve sohbetler pakete girmez.
Operasyon scriptleri ve kullanım kılavuzları teslim edilir.

Yeni müşteride ARM64 Docker Compose/NVIDIA runtime, LAN DNS ve istemcilerce güvenilen TLS sertifikası gerekir.
Operatör ayrıca cihaz machine-id'sine özel koruma key/license üretir; geliştirici signing.key aktarılmaz.
`office_install.py --help` ile parametreleri görün. Önce `--validate-only`, ardından boş hedef klasöre kurulum.
Kurulum eski klasör/veri üzerine yazmaz; tek şirket sahibi + bize ait platform operatörü oluşturur.
Şirket sahibi Coair yönetimini alır, Linux ve platform operatör şifresi bizde kalır.
İlk model açılışında sağlık kontrollerini izleyin, sonra 5–10 hesabı şirket ekranından oluşturun.

Kurulum sonrasında `install_tunnel.py --tailscale-ip GERCEK_IP --app-port 8080` opsiyoneldir.
Host guard için yalnız operatör Tailscale IP'lerini `/etc/coair/network-operators` listesine yazın,
`network_guard.sh` ve systemd unitini kurun. Tailscale yönetim politikasını doğrulayın.
Host guard yönetim erişimini etkilediği için mevcut erişimi yeni SSH oturumuyla sınayın;
başarısızlıkta zamanlı geri alma uygulayın. HTTPS/2222 dışındaki kullanıcı TCP portları kapanır.
Ofis LAN HTTPS 443, localhost HTTP 8080; model ve DB yalnız private Docker ağında.

Kabul sırası: ilk şifre → iki şirket/proje izolasyonu → dosya sorgu/indirme/rapor → HTTPS/SSH yasak hedefler →
anahtar iptal/süre sonu → uzun cevap ve rapor → üç kullanıcı + yükleme 30 dakika → yedek/restore.
DNS/sertifika ve gerçek müşteri kimliği olmadan müşteriye hazır ofis bağlantısı teslim edilmiş sayılmaz.
