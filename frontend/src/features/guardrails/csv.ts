const BOM = "\ufeff";

/** Parse CSV text into rows, honouring quoted fields, escaped quotes, and CRLF. */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

/**
 * Read statements from CSV text.
 *
 * A single-column file is treated as a plain list. When a header row names a
 * statement-like column, that column is used; otherwise the first column wins.
 */
export function extractStatements(text: string): string[] {
  const rows = parseCsv(text);
  if (!rows.length) {
    return [];
  }

  const headerCandidates = ["statement", "prompt", "text", "input", "zin"];
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const headerIndex = header.findIndex((value) =>
    headerCandidates.includes(value),
  );
  const hasHeader = headerIndex !== -1;
  const column = hasHeader ? headerIndex : 0;

  return (hasHeader ? rows.slice(1) : rows)
    .map((entry) => (entry[column] ?? "").trim())
    .filter((value) => value !== "");
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text =
            value === null || value === undefined ? "" : String(value);
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([`${BOM}${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
