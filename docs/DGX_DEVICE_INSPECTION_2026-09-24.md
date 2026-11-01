# DGX cihaz incelemesi — 24 Eylül 2026

SSH üzerinden canlı, salt okunur inceleme. Servis veya disk ayarı değiştirilmedi. Bağlantı için Mac üzerindeki mevcut Tailscale bağlantısı `tailscale up` ile açıldı ve açık bırakıldı. Model üretimi veya yük testi yapılmadı.

## Canlı bulgular

| Alan | Sonuç |
|---|---|
| SSH | `coair@100.91.121.116`, mevcut `~/.ssh/dgx_spark` anahtarı; kayıtlı host anahtarı doğrulandı |
| Host | `spark-9631` |
| Üretici / model | DMI: `NVIDIA` / `NVIDIA_DGX_Spark`, revision `A.7` |
| İşletim sistemi | Ubuntu 24.04.5 LTS, aarch64 |
| GPU | NVIDIA GB10, sürücü 580.178.04; nvidia-smi CUDA uyumluluğu 13.0 |
| Bellek | 121 GiB toplam, 91 GiB kullanılan, 30 GiB available; birleşik CPU/GPU bellek |
| Disk | 3.7 TiB kök bölüm, 73 GiB kullanılan, yaklaşık 3.5 TiB boş |
| Çalışma süresi | Yaklaşık 8 gün |
| Aktif konteyner | `coair-llm-vllm-1`, yaklaşık 7 gündür healthy |
| Model | `Qwen/Qwen3-8B`, sunulan ad `qwen3-8b` |
| Model bağlamı | 32.768 token |
| vLLM ayarları | max_num_seqs=4; gpu_memory_utilization=0.70 |
| Anlık yük | 0 çalışan, 0 bekleyen model isteği; KV cache kullanım metriği 0 |
| Servis adresi | Yalnız Tailscale adresi `100.91.121.116:8000` üzerinde dinliyor |
| Sağlık kontrolü | `/health`: HTTP 200 |
| API kimlik doğrulama | Anahtarsız `/v1/models`: 401; mevcut anahtarla model listesi başarılı |
| Yeniden başlatma | Docker `unless-stopped` |
| Kurulum dizini | `/home/coair/llm` |
| Kaynak kopyası | `/home/coair/coair-validation-20260918` altında Git deposu var |
| Uygulama servisleri | Docker'da yalnız model servisi var; süreç adlarında node, uvicorn, gunicorn, qdrant, postgres, redis veya nginx bulunmadı |

## Koruma durumu ve sınırlar

- Secure Boot açık (`mokutil --sb-state`).
- Kök dosya sistemi doğrudan `/dev/nvme0n1p2` üzerinde ext4. `lsblk` çıktısında LUKS/crypt katmanı yok; `/etc/crypttab` etkin giriş sayısı sıfır. İşletim sistemi düzeyinde tam disk LUKS şifrelemesi görünmüyor. Donanım disk şifrelemesi ayrıca doğrulanmadı.
- `/dev/tpm*` yok ve `/sys/class/tpm` aygıt sayısı sıfır. Bu oturumda TPM kullanımı doğrulanamadı; fiziksel donanımın kesinlikle desteklemediği sonucu çıkarılmamalı.
- SSH tüm IPv4/IPv6 arayüzlerinde dinliyor. Bu, tek başına internetten erişilebilir olduğu anlamına gelmez.
- `sudo -n ufw status` parola istedi; firewall durumu doğrulanamadı. SSH parola politikası da doğrulanmadı.
- API anahtarları ve ortam sırları rapora veya araç çıktısına yazılmadı.

## CoAIr cihaz ürünü açısından sonuç

Yerel model altyapısı mevcut ve erişilebilir. Ancak CoAIr'ın güncel arayüzü, API/worker ve veri servislerinin bu cihazda çalışan bütünleşik kurulumu tespit edilmedi. Üretim kutusu hazır değil.

Mevcut Qwen3-8B için gerçek kronoloji kalitesi veya performans iddiasında bulunulamaz; bu inceleme yalnız sağlık ve yapılandırma kontrolüdür. 32.768 token model bağlamında rapor girdileri, çıktı payı ve görev bazlı parçalama birlikte bütçelenmeli. Belleğin önemli bölümü vLLM tarafından kullanılıyor; 8B model ağırlıklarının tek başına 91 GiB tükettiği varsayılmamalı.

Sonraki teknik çalışma: mevcut model servisini bozmadan main'e yerel sağlayıcı adaptörünü eklemek; güncel web/API/veri servislerini ayrı bir deneme kurulumu olarak hazırlamak; gerçek belgeyle kronoloji kalitesini ölçmek. Disk şifreleme, kurtarma ve lisans tasarımı; cihazın donanım yetenekleri ve kullanıcının çevrimdışı çalışma tercihine göre kesinleştirilmeli.
