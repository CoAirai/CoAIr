const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const MAX_CHARS = 92;

function pdfEscape(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string): string[] {
    if (!line) return [""];
    const chunks: string[] = [];
    for (let index = 0; index < line.length; index += MAX_CHARS) {
        chunks.push(line.slice(index, index + MAX_CHARS));
    }
    return chunks;
}

export function tableToLines(
    title: string,
    rows: Record<string, string>[]
): string[] {
    const headers = Object.keys(rows[0] ?? { Note: "empty" });
    return [
        title,
        "",
        headers.join(" | "),
        "-".repeat(Math.min(MAX_CHARS, Math.max(headers.join(" | ").length, 12))),
        ...rows.map((row) =>
            headers.map((header) => String(row[header] ?? "")).join(" | ")
        ),
    ];
}

export function linesToPdf(lines: string[]): Uint8Array {
    const wrapped = lines.flatMap(wrapLine);
    const linesPerPage = Math.max(
        1,
        Math.floor((PAGE_HEIGHT - MARGIN * 2) / LINE_HEIGHT)
    );
    const pages: string[][] = [];
    for (let index = 0; index < wrapped.length; index += linesPerPage) {
        pages.push(wrapped.slice(index, index + linesPerPage));
    }
    if (pages.length === 0) pages.push([""]);

    const objects: string[] = [];
    const add = (body: string) => {
        objects.push(body);
        return objects.length;
    };

    const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const contentIds = pages.map((pageLines) => {
        const commands = ["BT", `/F1 ${FONT_SIZE} Tf`];
        pageLines.forEach((line, lineIndex) => {
            const y = PAGE_HEIGHT - MARGIN - lineIndex * LINE_HEIGHT;
            commands.push(
                `1 0 0 1 ${MARGIN} ${y} Tm (${pdfEscape(line)}) Tj`
            );
        });
        commands.push("ET");
        const stream = commands.join("\n");
        return add(
            `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
        );
    });
    const pageIds = contentIds.map((contentId) =>
        add(
            `<< /Type /Page /Parent PAGES_ID /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
                `/Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
        )
    );
    const pagesId = add(
        `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds
            .map((id) => `${id} 0 R`)
            .join(" ")}] >>`
    );
    for (const pageId of pageIds) {
        objects[pageId - 1] = objects[pageId - 1].replace(
            "PAGES_ID",
            `${pagesId} 0 R`
        );
    }
    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    const header = "%PDF-1.4\n";
    const objectBodies = objects.map(
        (body, index) => `${index + 1} 0 obj\n${body}\nendobj\n`
    );
    const offsets = [0];
    let cursor = header.length;
    for (const object of objectBodies) {
        offsets.push(cursor);
        cursor += object.length;
    }
    const xrefTable = [
        "xref",
        `0 ${objectBodies.length + 1}`,
        "0000000000 65535 f ",
        ...offsets.slice(1).map(
            (value) => `${String(value).padStart(10, "0")} 00000 n `
        ),
    ].join("\n");
    const trailer = [
        "trailer",
        `<< /Size ${objectBodies.length + 1} /Root ${catalogId} 0 R >>`,
        "startxref",
        String(cursor),
        "%%EOF",
    ].join("\n");
    const pdf = `${header}${objectBodies.join("")}${xrefTable}\n${trailer}\n`;
    return new TextEncoder().encode(pdf);
}

export function tableToPdf(
    title: string,
    rows: Record<string, string>[]
): Uint8Array {
    return linesToPdf(tableToLines(title, rows));
}

export function downloadPdf(
    filename: string,
    title: string,
    rows: Record<string, string>[]
) {
    const bytes = tableToPdf(title, rows);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const blob = new Blob([copy], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
