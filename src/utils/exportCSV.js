export function exportCSV(filename, rows) {
    if (!rows?.length)
        return;
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(","), // dòng tiêu đề
        ...rows.map(r => headers
            .map((h) => {
            const v = r[h] ?? "";
            // escape dấu phẩy, xuống dòng, dấu ngoặc kép
            const s = String(v).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
        })
            .join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
