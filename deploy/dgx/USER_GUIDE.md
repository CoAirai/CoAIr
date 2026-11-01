# Coair kullanıcısı için bağlantı

Uygulama hesabı ile Tailscale/SSH bağlantı hesabı ayrıdır. Dosyalar uygulamanın
belge yükleme ekranından yüklenir. Linux yönetim hesabı verilmez.

## Tailscale ve tarayıcı

1. Kendi bilgisayarınıza Tailscale kurun; size erişim verilen kendi kimliğinizle giriş yapın.
2. Operatörün **aktivasyon ve kullanıcı erişim testi tamamlandı** diye teslim ettiği HTTPS bağlantısını açın.
3. Coair kullanıcı adı ve geçici şifrenizle giriş yapın. İlk girişte yeni, en az 12 karakterli bir şifre belirleyin.
4. Kişisel projenizi seçip belgelerinizi yükleyin. İşleme durumu hazır olduğunda sorularınızı sorun.

Bu DGX için hedef HTTPS adresi `https://spark-9631.tail761c2d.ts.net/auth/sign-in`.
**Şu an Tailscale yönetiminde HTTPS/Serve aktivasyonu bekliyor; hazır bağlantı olarak paylaşılmamalı.**
Aktivasyon: https://login.tailscale.com/f/serve?node=nKeu3PzCtR11CNTRL
Bu işlem tailnet yöneticisinin hesabında yapılır.

Ofis içinde operatörün teslim ettiği yerel HTTPS adresini açın; Tailscale gerekmez.
Mevcut DGX'e fiziksel olarak bağlı kullanıcının mevcut uygulama adresi
`http://localhost:8080/auth/sign-in`. Ayrı demo bu cihazda localhost `18081` portundadır.

## İsteğe bağlı SSH tüneli

1. Terminal (macOS/Linux) veya PowerShell (Windows OpenSSH) açın.
2. Kendi anahtarınızı üretin; şifre sorulduğunda anahtarınıza bir parola koyun:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/coair_demo
```

3. Operatöre yalnızca `coair_demo.pub` içeriğini verin. `coair_demo` özel anahtarını göndermeyin.
4. Operatör size kişisel SSH kullanıcı adı, cihaz adresi, bitiş tarihi ve doğrulanmış sunucu parmak izi verir.
5. Tailscale veya yetkili kurum ağı bağlantınız açıkken size verilen komutu çalıştırın.

Bu DGX'teki **ayrı demo** için komut biçimi aşağıdadır. `tunnel-KULLANICI` gerçek,
size özel hesapla değiştirilir; örnek ad bir hesap değildir:

```sh
ssh -N -o ExitOnForwardFailure=yes -p 2222 -i ~/.ssh/coair_demo \
  -L 127.0.0.1:18080:127.0.0.1:18081 tunnel-KULLANICI@100.91.121.116
```

İlk bağlantıda ED25519 parmak izini aynen doğrulayın:
`SHA256:YT7DxbMuiqEtnnYJ05MFaGwvjfTml3ffhsiOfVM+9RY`.
Farklıysa bağlanmayın; operatöre bildirin. Başka cihaz için o cihazın ayrı parmak izi gerekir.

6. Terminal açık kalırken `http://127.0.0.1:18080/auth/sign-in` adresini açıp **Coair** hesabınızla giriş yapın.
7. Bağlantıyı kapatmak için terminalde Ctrl+C kullanın.

Terminalde komut çalıştırma ve SFTP kapalıdır. Sadece uygulamaya tünel açılır.
Demo süresi dolunca yeni bağlantılar reddedilir; aktif tünel en geç yaklaşık 30 saniyede kapatılır.
Bağlantı hesabı kapatıldığında belge ve sohbetler silinmez.
Temiz ofis kurulumunda tünelin uzak hedefi `127.0.0.1:8080` olur; size verilen gerçek komutu kullanın.

## Kullanım sınırları

| Hesap | Depolama | Token kotası | Süre |
|---|---:|---:|---|
| Demo | 5 GB | Toplam 1.000.000 | 7 gün |
| Ofis | 5 GB | Günlük 100.000 | Operatör belirler |

Dosya başına 100 MB. Depolama GB/MB değerleri ondalık hesaplanır.
Ofis günlük token dönemi UTC 00:00'da yenilenir (Türkiye'de 03:00).
Girdi ve çıktı tokenları, başarısız denemelerin doğrulanmış kullanımı dahil, kotaya sayılır.
Servisten kullanım alınamayan zaman aşımında kota geçici olarak rezerve kalabilir; operatör kontrol eder.

Kişisel projelerinizi diğer çalışanlar göremez; şirket yöneticisi kendi şirketinin projelerini görür.
Projeyi paylaşmak için açık üyelik gerekir. Mevcut kullanıcıya özel sohbet gizliliği korunur;
şirket yöneticisi başkasının sohbetini okuyamaz. Üç aktif sohbet kapasitesi dolduğunda sıraya girersiniz.
Uzun raporların ilerlemesini iş ekranından takip edin. Hata açıklamasını okuyup yeniden deneme düğmesini kullanın.
