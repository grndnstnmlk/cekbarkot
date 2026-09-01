# 🌿 Stock Djarum (Cloud & Realtime)

Aplikasi berbasis web untuk mandor / petugas lapangan gudang tembakau guna mencentang dan mengecek **No Gud** yang sudah ditempeli barcode secara cepat langsung dari HP/Tablet/Laptop dengan sinkronisasi database **Supabase**.

---

## 🚀 Panduan Setup Singkat

### 1. Setup Supabase (Gratis & 2 Menit)
1. Buka [https://supabase.com](https://supabase.com) dan buat project baru (gratis).
2. Masuk ke menu **SQL Editor** di bilah kiri dashboard Supabase.
3. Buka file [`supabase_schema.sql`](file:///c:/Users/USER/Downloads/Cek%20Barkot/supabase_schema.sql), lalu **Copy** dan **Paste** seluruh isinya ke SQL Editor Supabase, lalu klik **RUN**.
4. Masuk ke menu **Project Settings -> API**:
   - Salin **Project URL** (misal: `https://xyz.supabase.co`)
   - Salin **anon / public key** (kunci panjang `eyJ...`)
5. Buka aplikasi web di browser, klik tombol **⚙️ Setup** di kanan atas, lalu tempelkan URL dan Anon Key tersebut. Selesai!

---

### 2. Hosting ke GitHub Pages
Repository: `https://github.com/grndnstnmlk/cekbarkot.git`

Langkah publish web:
1. Push file ke branch `main`.
2. Buka repository Anda di GitHub: `https://github.com/grndnstnmlk/cekbarkot`
3. Masuk ke tab **Settings** -> **Pages**.
4. Pada bagian **Build and deployment -> Branch**, pilih **main** dan folder **/(root)**, lalu klik **Save**.
5. Tunggu 1 menit, web Anda sudah live di URL:
   👉 **`https://grndnstnmlk.github.io/cekbarkot/`**

---

## 📱 Cara Pemakaian di Lapangan

1. **Pilih Tanggal**: Pilih tanggal hari ini atau tanggal sebelumnya lewat kalender di atas.
2. **Pencet Kotak No Gud**: Ketuk kotak No Gud saat stiker barcode selesai ditempel. Kotak otomatis berubah hijau `✓ SUDAH DIBARKOT`, berbunyi bip, dan tersinkron ke semua HP tim secara realtime.
3. **Upload File Excel Baru**: Jika ada Excel buku grade induk baru, cukup klik **"📥 Upload Excel (.xlsx)"**. Sistem otomatis membaca tanggal dan mengunggah seluruh nomor ke database.
4. **Filter Sisa**: Gunakan tab **⏳ Belum** agar layar hanya menampilkan sisa nomor yang belum selesai dibarkot.
5. **Salin ke WhatsApp**: Klik tombol **"📋 Salin Laporan WA"** untuk langsung mengirimkan rekapitulasi ke grup WhatsApp.
