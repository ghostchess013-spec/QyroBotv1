# Panduan Lengkap Instalasi QyroBot di VPS (24/7)

Panduan siap pakai untuk memasang **QyroBot v1.7.0** dari awal hingga berjalan 24/7 di VPS Linux baru (**Ubuntu 22.04/24.04** atau **Debian 12**, baik arsitektur **AMD64 / x86_64** maupun **Oracle Cloud Ampere ARM64 / aarch64**).

---

## Prasyarat Minimum VPS

- **OS:** Ubuntu 22.04 / 24.04 LTS atau Debian 12
- **Arsitektur:** `linux/amd64` (x86_64) atau `linux/arm64` (Ampere / ARM64)
- **RAM:** Minimal 1 GB (disarankan 2 GB+; `systemd` membatasi cgroups v2 di `MemoryMax=2048M`)
- **Disk:** Minimal 10 GB kosong
- **Runtime:** Node.js **>= 22 LTS** (wajib untuk `node:sqlite` bawaan, tanpa kompilasi native addon)
- **Akses:** SSH root atau user dengan `sudo`

> **Catatan Arsitektur:** QyroBot 100% Cloud-API dan memiliki Anti-Local-Model Guard sehingga tidak membutuhkan GPU atau model LLM lokal.

---

## Metode 1 (Direkomendasikan): Instalasi Native + `systemd` 24/7

### Langkah 1 — Login SSH & Update Paket Dasar

```bash
ssh root@IP_VPS_KAMU

sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates openssl
```

### Langkah 2 — Install Node.js 22 LTS (Global, bukan `nvm`)

Pasang Node.js 22 secara sistem agar bisa dijalankan oleh `systemd` tanpa masalah PATH:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi versi (harus v22.x atau lebih tinggi)
node -v
which node npx
```

### Langkah 3 — Buat User `qyrobot` & Clone Repository GitHub

Service `packaging/qyrobot.service` berjalan sebagai user non-root `qyrobot` dengan hardening `ProtectSystem=strict`.

```bash
sudo useradd -r -s /usr/sbin/nologin -m -d /var/lib/qyrobot qyrobot || true
sudo mkdir -p /opt/qyrobot /var/lib/qyrobot /etc/qyrobot

# Ganti URL dengan repository GitHub milikmu
sudo git clone https://github.com/USERNAME/REPO_QYROBOT.git /opt/qyrobot
```

*(Jika repository bersifat **Private**, buat SSH key di VPS dengan `ssh-keygen -t ed25519`, tambahkan public key-nya sebagai Deploy Key di GitHub repo, lalu clone memakai `git@github.com:USERNAME/REPO_QYROBOT.git`.)*

### Langkah 4 — Install Dependency, Build Production & Test

```bash
cd /opt/qyrobot
# Gunakan npm ci jika package-lock.json ada; jika belum ada, pakai npm install
if [ -f package-lock.json ]; then sudo npm ci; else sudo npm install; fi
sudo npm run build

# Buat direktori data & configs lalu serahkan kepemilikan ke user qyrobot
sudo mkdir -p /opt/qyrobot/data /opt/qyrobot/configs
sudo chown -R qyrobot:qyrobot /opt/qyrobot /var/lib/qyrobot

# Opsional tapi direkomendasikan: jalankan 22 unit test Fase 1-5
sudo -u qyrobot npm test
```

Pastikan semua **22/22 test lulus** sebelum lanjut.

### Langkah 5 — Buat `QYRO_VAULT_MASTER_KEY` di `/etc/qyrobot/qyrobot.env`

Modul Write-Only Vault (`src/core/vault.ts`) mengenkripsi semua API key menggunakan `ChaCha20-Poly1305` dengan master key dari variabel lingkungan `QYRO_VAULT_MASTER_KEY`.

```bash
MASTER_KEY="$(openssl rand -hex 32)"

sudo tee /etc/qyrobot/qyrobot.env > /dev/null <<EOF
NODE_ENV=production
PORT=3000
TZ=Asia/Jakarta
QYRO_VAULT_MASTER_KEY=${MASTER_KEY}
EOF

sudo chown root:qyrobot /etc/qyrobot/qyrobot.env
sudo chmod 640 /etc/qyrobot/qyrobot.env

# Tampilkan sekali untuk dicatat ke password manager pribadimu:
echo "SIMPAN MASTER KEY INI DI TEMPAT AMAN: ${MASTER_KEY}"
```

> **Penting:** Jika suatu saat pindah VPS, simpan nilai `QYRO_VAULT_MASTER_KEY` ini atau gunakan backup terenkripsi `.qyrobak` agar rahasia Vault bisa dipulihkan.

### Langkah 6 — Pasang & Aktifkan Service `systemd` (24/7 + Auto-Restart)

```bash
sudo cp /opt/qyrobot/packaging/qyrobot.service /etc/systemd/system/qyrobot.service

# Sinkronkan path npx agar tidak kena error 203/EXEC
NPX_PATH="$(which npx)"
sudo sed -i "s|/usr/bin/npx|${NPX_PATH}|g" /etc/systemd/system/qyrobot.service

# Reload systemd, aktifkan saat boot, dan start sekarang
sudo systemctl daemon-reload
sudo systemctl enable --now qyrobot.service

# Cek status & log
sudo systemctl status qyrobot.service --no-pager
sudo journalctl -u qyrobot.service -n 30 --no-pager
```

### Langkah 7 — Verifikasi Server Berjalan

```bash
curl -fsS http://127.0.0.1:3000/api/bootstrap | head -c 300
echo ""
```

Jika muncul respons JSON berawalan `{"preferences":...}`, QyroBot sudah aktif 24/7.

---

## Langkah 8 — Pilih Cara Akses Aman (HTTPS Domain atau Tailscale)

Jangan ekspos port `3000` mentah (HTTP) ke internet publik. Pilih salah satu dari dua opsi berikut:

### Opsi A: Domain + HTTPS Otomatis dengan Caddy (Direkomendasikan)

1. Di panel DNS domain kamu (Cloudflare/Namecheap/dll), buat **A Record**:
   - Name: `qyro` (untuk `qyro.domainkamu.com`)
   - Value: `IP_PUBLIK_VPS_KAMU`
   - *(Jika pakai Cloudflare, set Proxy ke DNS Only dulu saat penerbitan sertifikat pertama, atau gunakan Full Strict setelahnya.)*

2. Install Caddy dan arahkan ke `127.0.0.1:3000`:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
qyro.domainkamu.com {
    reverse_proxy 127.0.0.1:3000
}
EOF

sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

3. Aktifkan Firewall UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

> **Khusus Oracle Cloud (Ampere ARM64):** Selain UFW, buka juga **Ingress Rule** TCP port `80` dan `443` (source `0.0.0.0/0`) di **VCN -> Security Lists -> Default Security List**. Jika masih terblokir `iptables` bawaan image Ubuntu Oracle:
> ```bash
> sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
> sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
> sudo netfilter-persistent save || true
> ```

Sekarang buka `https://qyro.domainkamu.com` di browser.

---

### Opsi B: Tanpa Domain — Akses Privat Penuh via Tailscale

Cocok jika kamu ingin QyroBot benar-benar privat (0 port publik terbuka selain SSH):

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4
```

Pasang aplikasi **Tailscale** di laptop/Android dengan akun yang sama, lalu buka:
`http://IP_TAILSCALE_VPS:3000` (atau gunakan `sudo tailscale serve --bg 3000` untuk HTTPS otomatis `*.ts.net`).

---

## Metode 2 (Alternatif): Jalankan via Docker Multi-Arch

File `packaging/Dockerfile` sudah mendukung build `linux/amd64` dan `linux/arm64`.

```bash
# 1. Pastikan /etc/qyrobot/qyrobot.env sudah dibuat (lihat Langkah 5)
# 2. Buat folder persistent di host
sudo mkdir -p /var/lib/qyrobot/data /var/lib/qyrobot/configs
sudo chown -R 1000:1000 /var/lib/qyrobot

# 3. Build image dan jalankan 24/7
cd /opt/qyrobot
docker build -f packaging/Dockerfile -t qyrobot:1.7.0 .

docker run -d \
  --name qyrobot \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file /etc/qyrobot/qyrobot.env \
  -v /var/lib/qyrobot/data:/app/data \
  -v /var/lib/qyrobot/configs:/app/configs \
  qyrobot:1.7.0

# Cek status healthcheck & log
docker ps
docker logs -f qyrobot
```

---

## Checklist Awal Setelah Web UI Terbuka

1. Selesaikan **Onboarding Wizard** (atau akses `/?autostart=1` untuk langsung masuk).
2. Buka **Router, Vault & Backup -> Vault** lalu simpan API key provider cloud free-tier yang kamu pakai (write-only, tidak pernah dicetak ulang).
3. Pastikan **Free-Tier-Only Mode** aktif di tab **Router** bila ingin biaya `$0`.
4. Buka **Ekosistem & RBAC -> RBAC, R2 & Updater** untuk mengatur target backup **Cloudflare R2 / S3** dan jadwal Storage GC mingguan.
5. Buat satu arsip backup terenkripsi **`.qyrobak`** di tab **Backup** sebagai titik pemulihan awal.
6. *(Opsional)* Jika memakai companion Android, buka **Perangkat & QR** untuk pairing Ed25519 sekali pakai (TTL 120 detik).

---

## Operasi Harian & Pemeliharaan

### Update QyroBot dari GitHub (Zero Data Loss)

Database `data/qyrobot.db` dan `configs/` tetap aman saat update:

```bash
cd /opt/qyrobot
sudo git pull --ff-only
if [ -f package-lock.json ]; then sudo npm ci; else sudo npm install; fi
sudo npm run build
sudo chown -R qyrobot:qyrobot /opt/qyrobot
sudo systemctl restart qyrobot.service
sudo systemctl status qyrobot.service --no-pager
```

### Pantau Log & Penggunaan RAM

```bash
# Live log
sudo journalctl -u qyrobot.service -f

# Cek RAM & CPU cgroups v2
systemctl status qyrobot.service --no-pager
```

### Pindah / Migrasi VPS Baru (AMD64 <-> Ampere ARM64)

1. Di VPS lama: ekspor backup terenkripsi **`.qyrobak`** dari menu **Backup** (atau ambil salinan terbaru dari bucket Cloudflare R2/S3).
2. Di VPS baru: ikuti **Langkah 1–8** di dokumen ini.
3. Unggah & restore file **`.qyrobak`** memakai passphrase yang sama — seluruh bot, Vault, memori FTS5, routines, channels, dan pinned library akan pulih lintas arsitektur.

---

## Troubleshooting Cepat

| Gejala | Penyebab Umum | Solusi |
|---|---|---|
| `status=203/EXEC` di `systemctl status` | Path `npx` berbeda dari `/usr/bin/npx` | Cek `which npx`, edit `ExecStart=` di `/etc/systemd/system/qyrobot.service`, lalu `sudo systemctl daemon-reload && sudo systemctl restart qyrobot.service` |
| `SQLITE_READONLY` atau gagal tulis `skills-lock.json` | Folder `data/` atau `configs/` masih milik `root` | Jalankan `sudo chown -R qyrobot:qyrobot /opt/qyrobot/data /opt/qyrobot/configs && sudo systemctl restart qyrobot.service` |
| `node:sqlite` tidak ditemukan | Versi Node di VPS < 22 | Pastikan `node -v` menampilkan `v22.x+` (ulang Langkah 2) |
| Website timeout saat dibuka lewat domain | Firewall UFW atau Oracle Cloud Security List menutup port 80/443 | Cek `sudo ufw status`, cek Ingress Rule VCN (Oracle), dan cek `sudo journalctl -u caddy -n 30` |
| Service mati sendiri karena OOM | VPS RAM terlalu kecil (< 1 GB tanpa swap) | Tambah swap 2 GB: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab` |
