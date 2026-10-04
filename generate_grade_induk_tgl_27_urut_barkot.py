import os
import sys
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

sys.stdout.reconfigure(encoding='utf-8')

folder = r"c:\Users\xenov\Downloads\cekbarkot\Laporan Grade Induk"
src_file = os.path.join(folder, "buku_grade_induk_27-8-2026.xlsx")

# Check source
if not os.path.exists(src_file):
    print(f"Error: {src_file} tidak ditemukan!")
    sys.exit(1)

wb_src = openpyxl.load_workbook(src_file, data_only=True)
sheet_src = wb_src.active

items = []
for r in range(5, sheet_src.max_row + 1):
    no_gud = sheet_src.cell(row=r, column=1).value
    grade1 = sheet_src.cell(row=r, column=2).value
    grade2 = sheet_src.cell(row=r, column=3).value
    barkot = sheet_src.cell(row=r, column=4).value
    kg = sheet_src.cell(row=r, column=5).value
    ket = sheet_src.cell(row=r, column=6).value
    
    if any(v is not None for v in [no_gud, grade1, grade2, barkot, kg, ket]):
        b_str = str(barkot).strip() if barkot is not None else ""
        if b_str and b_str.isdigit():
            try:
                ng_int = int(no_gud)
            except:
                ng_int = no_gud
            items.append({
                "no_gud": ng_int,
                "grade1": grade1,
                "grade2": grade2,
                "barkot": b_str,
                "kg": kg,
                "ket": ket if ket is not None else ""
            })

# Urutkan ascending berdasarkan nomor barkot (mulai dari 30379 dst)
items.sort(key=lambda x: int(x["barkot"]))

print(f"Total bal terbaca: {len(items)}")
print(f"Barkot awal : {items[0]['barkot']} (No Gud: {items[0]['no_gud']})")
print(f"Barkot akhir: {items[-1]['barkot']} (No Gud: {items[-1]['no_gud']})")

wb = openpyxl.Workbook()

# Style definitions
fill_navy = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
thin_side = Side(style="thin", color="000000")
thin_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
bottom_thin_border = Border(bottom=thin_side)

align_center = Alignment(horizontal="center", vertical="center")

# ========================================================
# SHEET 1: CETAK 1 HALAMAN (A4 PAS - MARGIN MAKSIMAL)
# ========================================================
ws1 = wb.active
ws1.title = "Cetak 1 Halaman (A4 Pas)"

# Page Setup for A4 single page
ws1.page_setup.paperSize = ws1.PAPERSIZE_A4
ws1.page_setup.orientation = ws1.ORIENTATION_PORTRAIT

# Narrow / Maximized Margins (in inches)
ws1.page_margins.left = 0.25
ws1.page_margins.right = 0.25
ws1.page_margins.top = 0.30
ws1.page_margins.bottom = 0.30
ws1.page_margins.header = 0.15
ws1.page_margins.footer = 0.15

# Centering & Fit to 1 Page
ws1.print_options.horizontalCentered = True
ws1.print_options.verticalCentered = False
ws1.sheet_properties.pageSetUpPr.fitToPage = True
ws1.page_setup.fitToWidth = 1
ws1.page_setup.fitToHeight = 1
total_row_idx = 5 + len(items)
ws1.print_area = f"A1:F{total_row_idx}"
ws1.views.sheetView[0].showGridLines = True

# Column Dimensions optimized for A4 width
ws1.column_dimensions['A'].width = 11.0   # NO GUD
ws1.column_dimensions['B'].width = 8.0    # GRADE 1
ws1.column_dimensions['C'].width = 8.0    # GRADE 2
ws1.column_dimensions['D'].width = 16.0   # BARKOT
ws1.column_dimensions['E'].width = 8.5    # KG
ws1.column_dimensions['F'].width = 16.0   # KET

# Row Heights for Sheet 1
ws1.row_dimensions[1].height = 24.0
ws1.row_dimensions[2].height = 15.0
ws1.row_dimensions[3].height = 16.0
ws1.row_dimensions[4].height = 16.0

# Row 1: Title
ws1.merge_cells("A1:F1")
cell_a1 = ws1["A1"]
cell_a1.value = "BUKU GRADE INDUK"
cell_a1.font = Font(name="Arial", size=15, bold=True, color="000000")
cell_a1.alignment = align_center

# Row 2: Subtitle
ws1.merge_cells("A2:F2")
cell_a2 = ws1["A2"]
cell_a2.value = "TANGGAL: 27-8          HARI: KAMIS          TAHUN: 2026"
cell_a2.font = Font(name="Arial", size=9, bold=True, color="000000")
cell_a2.alignment = align_center
for col in range(1, 7):
    ws1.cell(row=2, column=col).border = bottom_thin_border

# Row 3 & 4: Table Headers
for rng, val in [("A3:A4", "NO GUD"), ("B3:C4", "GRADE"), ("D3:D4", "BARKOT"), ("E3:E4", "KG"), ("F3:F4", "KET")]:
    ws1.merge_cells(rng)
    top_left = ws1[rng.split(":")[0]]
    top_left.value = val

for r in [3, 4]:
    for c in range(1, 7):
        cell = ws1.cell(row=r, column=c)
        cell.font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
        cell.fill = fill_navy
        cell.alignment = align_center
        cell.border = thin_border

# Data Rows 5 to 54
start_row = 5
font_data_s1 = Font(name="Arial", size=10.5, bold=False, color="000000")

for idx, item in enumerate(items):
    curr_row = start_row + idx
    ws1.row_dimensions[curr_row].height = 13.0
    
    c_a = ws1.cell(row=curr_row, column=1, value=item["no_gud"])
    c_b = ws1.cell(row=curr_row, column=2, value=item["grade1"])
    c_c = ws1.cell(row=curr_row, column=3, value=item["grade2"])
    c_d = ws1.cell(row=curr_row, column=4, value=str(item["barkot"]))
    c_d.number_format = '@'
    c_e = ws1.cell(row=curr_row, column=5, value=item["kg"])
    c_f = ws1.cell(row=curr_row, column=6, value=item["ket"] if item["ket"] else None)
    
    for cell in [c_a, c_b, c_c, c_d, c_e, c_f]:
        cell.font = font_data_s1
        cell.alignment = align_center
        cell.border = thin_border

# Total Row 55
last_data_row = start_row + len(items) - 1
total_row = last_data_row + 1
ws1.row_dimensions[total_row].height = 16.0

ws1.merge_cells(f"A{total_row}:D{total_row}")
cell_tot_lbl = ws1[f"A{total_row}"]
cell_tot_lbl.value = f"TOTAL ({len(items)} BAL)"

cell_tot_kg = ws1[f"E{total_row}"]
cell_tot_kg.value = f"=SUM(E{start_row}:E{last_data_row})"

cell_tot_ket = ws1[f"F{total_row}"]
cell_tot_ket.value = "KG"

for c in range(1, 7):
    cell = ws1.cell(row=total_row, column=c)
    cell.font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    cell.fill = fill_navy
    cell.alignment = align_center
    cell.border = thin_border


# ========================================================
# SHEET 2: CETAK STANDAR (FONT BESAR)
# ========================================================
ws2 = wb.create_sheet(title="Cetak Standar (Font Besar)")

ws2.page_setup.paperSize = ws2.PAPERSIZE_A4
ws2.page_setup.orientation = ws2.ORIENTATION_PORTRAIT

ws2.page_margins.left = 0.25
ws2.page_margins.right = 0.25
ws2.page_margins.top = 0.35
ws2.page_margins.bottom = 0.35
ws2.page_margins.header = 0.15
ws2.page_margins.footer = 0.15

ws2.print_options.horizontalCentered = True
ws2.sheet_properties.pageSetUpPr.fitToPage = True
ws2.page_setup.fitToWidth = 1
ws2.page_setup.fitToHeight = 0
ws2.print_title_rows = "$3:$4"
ws2.print_area = f"A1:F{total_row}"
ws2.views.sheetView[0].showGridLines = True

ws2.column_dimensions['A'].width = 13.0
ws2.column_dimensions['B'].width = 9.0
ws2.column_dimensions['C'].width = 10.0
ws2.column_dimensions['D'].width = 20.0
ws2.column_dimensions['E'].width = 9.0
ws2.column_dimensions['F'].width = 20.0

ws2.row_dimensions[1].height = 31.5
ws2.row_dimensions[2].height = 21.75
ws2.row_dimensions[3].height = 21.0
ws2.row_dimensions[4].height = 21.0

ws2.merge_cells("A1:F1")
ws2["A1"].value = "BUKU GRADE INDUK"
ws2["A1"].font = Font(name="Arial", size=20, bold=True, color="000000")
ws2["A1"].alignment = align_center

ws2.merge_cells("A2:F2")
ws2["A2"].value = "TANGGAL: 27-8          HARI: KAMIS          TAHUN: 2026"
ws2["A2"].font = Font(name="Arial", size=10, bold=True, color="000000")
ws2["A2"].alignment = align_center
for col in range(1, 7):
    ws2.cell(row=2, column=col).border = bottom_thin_border

for rng, val in [("A3:A4", "NO GUD"), ("B3:C4", "GRADE"), ("D3:D4", "BARKOT"), ("E3:E4", "KG"), ("F3:F4", "KET")]:
    ws2.merge_cells(rng)
    top_left = ws2[rng.split(":")[0]]
    top_left.value = val

for r in [3, 4]:
    for c in range(1, 7):
        cell = ws2.cell(row=r, column=c)
        cell.font = Font(name="Arial", size=13, bold=True, color="FFFFFF")
        cell.fill = fill_navy
        cell.alignment = align_center
        cell.border = thin_border

font_data_s2 = Font(name="Arial", size=14, bold=False, color="000000")

for idx, item in enumerate(items):
    curr_row = start_row + idx
    ws2.row_dimensions[curr_row].height = 20.25
    
    c_a = ws2.cell(row=curr_row, column=1, value=item["no_gud"])
    c_b = ws2.cell(row=curr_row, column=2, value=item["grade1"])
    c_c = ws2.cell(row=curr_row, column=3, value=item["grade2"])
    c_d = ws2.cell(row=curr_row, column=4, value=str(item["barkot"]))
    c_d.number_format = '@'
    c_e = ws2.cell(row=curr_row, column=5, value=item["kg"])
    c_f = ws2.cell(row=curr_row, column=6, value=item["ket"] if item["ket"] else None)
    
    for cell in [c_a, c_b, c_c, c_d, c_e, c_f]:
        cell.font = font_data_s2
        cell.alignment = align_center
        cell.border = thin_border

ws2.row_dimensions[total_row].height = 22.0

ws2.merge_cells(f"A{total_row}:D{total_row}")
cell_tot_lbl2 = ws2[f"A{total_row}"]
cell_tot_lbl2.value = f"TOTAL ({len(items)} BAL)"

cell_tot_kg2 = ws2[f"E{total_row}"]
cell_tot_kg2.value = f"=SUM(E{start_row}:E{last_data_row})"

cell_tot_ket2 = ws2[f"F{total_row}"]
cell_tot_ket2.value = "KG"

for c in range(1, 7):
    cell = ws2.cell(row=total_row, column=c)
    cell.font = Font(name="Arial", size=13, bold=True, color="FFFFFF")
    cell.fill = fill_navy
    cell.alignment = align_center
    cell.border = thin_border

# Save files
targets = [
    os.path.join(folder, "buku_grade_induk_tgl_27_urut_barkot.xlsx"),
    r"c:\Users\xenov\Downloads\cekbarkot\buku_grade_induk_tgl_27_urut_barkot.xlsx",
    os.path.join(folder, "buku_grade_induk_27-8-2026.xlsx"),
    os.path.join(folder, "grade induk tgl 27_sorted_barkot.xlsx"),
    os.path.join(folder, "grade tgl 27_sorted_barkot.xlsx"),
]

for t in targets:
    try:
        wb.save(t)
        print(f"  [✓] Sukses disimpan: {t}")
    except Exception as e:
        print(f"  [!] Gagal simpan {t}: {e}")

print(f"\nSelesai! Berhasil membuat Buku Grade Induk Tanggal 27 urut barkot dari {items[0]['barkot']} ({len(items)} bal).")
