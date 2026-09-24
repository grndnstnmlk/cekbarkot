# 🌿 Aturan Otomasi Pembaruan Harian (Prompt "update")

Aturan ini berlaku untuk repository **Cek Barkot Tembakau**.

## Pemicu (Trigger)
Kapan pun pengguna memberikan prompt:
- `"update"`
- `"update <tanggal> lalu update web push git"`
- atau perintah terkait pembaruan data bal tembakau harian

## Prosedur Eksekusi Otomatis
Agent **TIDAK PERLU** menanyakan konfirmasi panjang atau meminta persetujuan berulang kali untuk pembaruan rutin harian. Langsung eksekusi alur berikut:

1. **Jalankan Pipeline Pembaruan Harian**:
   Jalankan script `daily_update.py` di root direktori workspace:
   ```powershell
   python daily_update.py
   ```
   *Atau jika file spesifik disebutkan, contoh:*
   ```powershell
   python daily_update.py "Laporan Grade Induk/grade 24 sep.xlsx"
   ```

2. **Tanggung Jawab Otomasi Script**:
   Script `daily_update.py` secara otomatis mengeksekusi seluruh rantai operasional:
   - Mendeteksi dan membaca file Excel terbaru dari folder `Laporan Grade Induk/`.
   - Mengekstrak data bal, validasi barcode, dan sorting berdasarkan No Gud.
   - Mendaftarkan file ke `generate_laporan_grade_induk.py` dan meregenerasi seluruh rekap buku grade induk Excel.
   - Memperbarui `seed_data.json` dan `seed_data.js`.
   - Memperbarui total dan klausa INSERT pada `supabase_schema.sql`.
   - Melakukan bulk upsert langsung ke REST API Supabase Cloud (`barkot_data`).
   - Memperbarui `currentDate` di `app.js` dan tanggal tampilan serta versi cache (`v=X.Y`) di `index.html`.
   - Melakukan `git add .`, `git commit` dengan pesan standar, dan `git push origin main`.

3. **Laporan Akhir ke Pengguna**:
   Setelah eksekusi selesai, tampilkan rangkuman bersih berisi:
   - File Excel yang diproses & tanggal operasional.
   - Jumlah bal berbarkot, rentang No Gudang, dan total kilogram.
   - Status sinkronisasi Supabase Cloud (jumlah record aktif).
   - Versi cache terbaru yang diterapkan di `index.html`.
   - Tautan hasil live di GitHub Pages: `https://grndnstnmlk.github.io/cekbarkot/`.
