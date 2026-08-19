# Otomatik Deploy (CI/CD)

İki uzun ömürlü dal, aynı Lightsail kutusunda iki bağımsız ortam:

| Dal | Ortam | Sunucu klasörü | Container'lar | API portu | Adres | Hareketli etiket |
|---|---|---|---|---|---|---|
| `dev` | development | `/opt/mvp-api-dev` | `coair-dev-*` | 8100 | `http://<ip>:8090` (basic auth) | `:dev` |
| `main` | production | `/opt/mvp-api` | `mvp-*` | 8000 | `http://<ip>/` | `:latest` |

Geliştirme `dev` üzerinde yürür; `dev`'e merge dev ortamına deploy eder. Prod'a
çıkış `dev → main` PR'ı ile olur, merge edildiğinde canlıya deploy başlar.
Pipeline: [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)

## Akış

```
dev'e veya main'e merge / push
   │
   ├─ 0) resolve              (dal → ortam eşlemesi: klasör, portlar, container adları)
   ├─ 1) Fast tests           (kırmızıysa DURUR — deploy olmaz)
   ├─ 2) Docker image build   → GHCR (ghcr.io/kadir-sen/rag:<sha> + :latest ya da :dev)
   └─ 3) SSH ile Lightsail'e  → pull + docker compose up -d + health check
```

- **Pull request** açıldığında sadece **testler** koşar (build/deploy yok) — her iki hedef dal için de geçerli.
- **Manuel** çalıştırma: GitHub → **Actions** → bu workflow → **Run workflow** (hangi dalda çalıştırırsan o ortama gider).
- Sunucudaki `.env.production`, `storage/`, `data/`, `qdrant_storage/` **hiç dokunulmaz**. Secret'lar CI loglarına girmez.

### İki ortam nasıl ayrışıyor

Ayrımın tamamı `APP_DIR` + `STACK_*` değişkenlerinden geliyor:

- Tüm bind mount'lar `$APP_DIR`'e göreli, `src/config.py` yolları da imaj içindeki
  `/app`'e sabit. Yani **ayrı klasör = ayrı veritabanı, ayrı belge, ayrı log**.
- `docker-compose.prod.yml` içindeki her ortam değişkeninin varsayılanı bugünkü
  prod değeridir (`${STACK_PREFIX:-mvp}`, `${API_HOST_PORT:-8000}` …). Değişken
  set edilmezse elle çalıştırılan bir `docker compose up` bile prod stack'ini
  üretir; dev'in farklı olması için açıkça opt-in gerekir.
- Dev'in kendi `JWT_SECRET`'ı ve `QDRANT_API_KEY`'i vardır: bir ortamdaki oturum
  jetonu diğerinde geçersizdir, yanlış porta bakan bir istemci yazamaz.
- Deploy, container'ların mount kaynağının `$APP_DIR/` ile başladığını doğrular;
  başlamıyorsa "wrong stack" deyip durur. Bir ortamın deploy'u diğerinin
  container'larına dokunamaz.

### Dev'de bilerek olmayan şeyler

- **Pre-deploy yedek ve Qdrant snapshot yok.** Dev verisi tek kullanımlıktır ve
  arşivler, prod'un zaten %86 dolu diskini tüketir. Prod'da yedek aynen sürüyor.
- **Toolkit yok** (`/toolkit/` sadece prod'da).
- **Production UI smoke yok**; dev'in kapısı deploy içindeki health check'tir.

## Bir kereye mahsus kurulum

### 1. GitHub Secrets (Settings → Secrets and variables → Actions → New repository secret)

| Secret | Zorunlu | Açıklama |
|---|---|---|
| `LIGHTSAIL_HOST` | ✅ | Sunucu IP veya hostname (ör. `18.184.x.x`) |
| `LIGHTSAIL_USER` | ✅ | SSH kullanıcısı (ör. `ubuntu` / `admin` / `bitnami`) |
| `LIGHTSAIL_SSH_KEY` | ✅ | SSH **private key**'in tamamı (PEM içeriği, `-----BEGIN ... END-----` dahil) |
| `LIGHTSAIL_SSH_PORT` | ➖ | SSH portu — verilmezse `22` |
| `LIGHTSAIL_APP_DIR` | ➖ | Uygulama klasörü — verilmezse `/opt/mvp-api` |

`LIGHTSAIL_HOST/USER/SSH_KEY` repo seviyesinde durur (tek kutu, tek anahtar).
Ortama özel olanlar **GitHub Environment secret'ı** olarak tanımlanır:

| Environment | Secret | Değer |
|---|---|---|
| `production` | `LIGHTSAIL_APP_DIR` | (boş bırakılabilir → `/opt/mvp-api`) |
| `production` | `DEMO_GOOGLE_API_KEY`, `DEMO_ACCOUNT_PASSWORD`, `PROD_*` | mevcut değerler |
| `development` | `LIGHTSAIL_APP_DIR` | `/opt/mvp-api-dev` |
| `development` | `DEMO_GOOGLE_API_KEY` | **ayrı, düşük kotalı** anahtar |
| `development` | `DEMO_ACCOUNT_PASSWORD` | prod'dan farklı bir parola |

`development` ortamına ayrıca **Deployment branches → selected → `dev`**,
`production` ortamına **→ `main`** kısıtı koy: workflow yanlış düzenlense bile
bir dal diğerinin ortamına deploy edemez.

> `GITHUB_TOKEN` otomatik gelir — eklemene gerek yok. Sunucu, GHCR'daki (private) image'ı her deploy'da bu geçici token ile çeker; sunucuda elle `docker login` yapmana gerek yok.

### 2. Sunucu ön koşulları (zaten mevcut kurulumda büyük ölçüde var)

- `LIGHTSAIL_APP_DIR` (varsayılan `/opt/mvp-api`) mevcut ve içinde `.env.production` + `storage/` + `data/` + `qdrant_storage/` var.
- SSH kullanıcısı **docker çalıştırabiliyor** — ya `docker` grubunda, ya da **şifresiz sudo** yetkisi var. (Workflow otomatik algılar: daemon'a doğrudan erişemezse `sudo` kullanır.)
- Host nginx zaten `127.0.0.1:8000` (api) önünde proxy yapıyor — bu değişmez.
- `qdrant` servisi aynı compose içinde ayakta (değişmedi).

### 2b. Delay Analysis Toolkit için tek seferlik nginx adımı

Toolkit ayrı bir container'da (`127.0.0.1:8501`) çalışıyor ve `/toolkit/` altından
servis ediliyor. Bu location bloğu nginx'e **bir kez elle** eklenmeli — pipeline
nginx'e dokunmuyor:

Gerekli iki dosya her deploy'da sunucudaki `~/coair-deploy/` altına kopyalanıyor,
yani sunucuda repo kopyası gerekmiyor:

```bash
# sunucuda, ilk deploy'dan sonra bir kez
sudo bash ~/coair-deploy/deploy/install_toolkit_nginx.sh ~/coair-deploy/deploy/nginx
```

Yapılmazsa `/toolkit/` isteği FastAPI'nin SPA catch-all'ına düşer ve COAir 404
gösterir. Betik idempotent; `nginx -t` başarısız olursa eski yapılandırmayı geri
yükler. Ayrıntı: [delay-toolkit.md](delay-toolkit.md).

### 3. GHCR image erişimi

Image, repo altında **private** bir GHCR paketi olarak yayınlanır. Sunucu her deploy'da workflow'un `GITHUB_TOKEN`'ıyla giriş yapıp çeker.
Eğer organizasyon/paket ayarları `GITHUB_TOKEN` ile pull'u engellerse iki seçenek:
- Paketi **public** yap (Package → Package settings → Change visibility), **veya**
- `read:packages` yetkili bir PAT oluşturup sunucuya bir kez `docker login ghcr.io` yap.

### 4. Dev ortamı için tek seferlik kurulum

```bash
# sunucuda — klasör iskeleti (idempotent)
sudo bash ~/coair-deploy/scripts/bootstrap_env_dir.sh /opt/mvp-api-dev --owner ubuntu

# dev'in KENDİ .env.production'ı (mode 600). JWT_SECRET ve QDRANT_API_KEY
# prod'unkinden farklı olmalı; QDRANT_COLLECTION=coair_dev.
sudo install -m 600 /dev/null /opt/mvp-api-dev/.env.production
sudo nano /opt/mvp-api-dev/.env.production

# dev'i 8090 portundan yayınla (basic auth zorunlu)
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-coair-dev devuser
sudo bash ~/coair-deploy/deploy/install_dev_nginx.sh ~/coair-deploy/deploy/nginx
```

Ardından Lightsail konsolundan **TCP 8090** portunu aç (mümkünse kendi IP'nle
sınırla); `sudo ufw status` aktifse orada da `sudo ufw allow 8090/tcp`.

> Kutuda TLS yok. Dev'e girerken kullandığın parola açık metin gider — prod
> parolasını asla kullanma.

### 5. Disk bakımı (yedek budama)

`create_deploy_backup.sh` bilerek hiçbir şey silmez, bu yüzden her prod deploy'u
arşiv biriktirir. Budama ayrı ve elle:

```bash
sudo bash ~/coair-deploy/scripts/prune_deploy_backups.sh --keep 3            # ne silineceğini yazar
sudo bash ~/coair-deploy/scripts/prune_deploy_backups.sh --keep 3 --apply    # siler
```

Betik en yeni N doğrulanmış yedeği ve bunlardan birinin dayandığı tam yedeği
korur; yarım kalmış yedekleri temizler, son bir saat içinde dokunulmuş dizine
dokunmaz.

## Deploy'u tetikleme

```bash
# Günlük akış: feature dalı → dev
git checkout dev && git merge feature/... && git push origin dev   # → dev ortamı

# Prod'a çıkış: dev → main PR'ı (main korumalı, doğrudan push kapalı)
gh pr create --base main --head dev
```

## Rollback (bir önceki sürüme dönme)

```bash
# Sunucuda, ilgili ortamın APP_DIR'i içinde. .env dosyasındaki DİĞER satırları
# (COMPOSE_PROJECT_NAME, STACK_PREFIX, *_HOST_PORT) koru — silersen manuel
# `up -d` prod'un adlarına/portlarına düşer ve diğer stack'le çakışır.
sudo sed -i 's|^API_IMAGE=.*|API_IMAGE=ghcr.io/kadir-sen/rag:<onceki_sha>|' .env
sudo docker compose -f docker-compose.prod.yml pull api
sudo docker compose -f docker-compose.prod.yml up -d api
```
veya GitHub → Actions → eski başarılı çalıştırma → **Re-run jobs**.

> `scripts/deploy_lightsail.sh` eski, elle deploy yoludur: yedek almaz, geri
> dönemez. Prod'u hedeflemesi artık `I_KNOW_THIS_IS_PRODUCTION=1` istiyor,
> `--with-data` ise `ALLOW_DATA_PUSH=1`. Normal akışta kullanma.

## Dal koruması

`main`: doğrudan push kapalı, PR zorunlu, zorunlu check'ler `Fast tests` ve
`Frontend build & Projects/Forensic E2E`, force-push kapalı. Prod'a giden tek
yol budur. `dev`: force-push/silme kapalı, aynı check'ler zorunlu, doğrudan
push serbest.

## (Opsiyonel) Manuel onay kapısı

Workflow `production` environment'ını kullanır. GitHub → Settings → Environments → `production` altında
**Required reviewers** eklersen, her deploy senin onayınla başlar (build biter, deploy onay bekler).
