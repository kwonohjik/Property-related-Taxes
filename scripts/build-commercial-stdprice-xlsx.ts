/**
 * XLSX 행 스트리밍 리더 (2024·2025·2026 배포본 전용).
 *
 * ⚠️ 설치본 `xlsx@0.18.5`는 streaming **read** 를 지원하지 않는다 — `XLSX.stream`은
 *    `{to_json,to_html,to_csv,set_readable}`로 **출력 전용**이다(실측). `XLSX.readFile`로
 *    161MB(시트 XML 합 ≈1.6GB)를 통째 파싱하면 OOM 위험이 크다.
 *    → zip을 직접 열어 `sharedStrings.xml` 선적재 + `sheetN.xml` SAX 스캔한다.
 *
 * 실측 구조(2024): 5시트 × 50만행, 전 셀이 `t="s"`(숫자도 공유문자열), 고시일자 `20240101`.
 * 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §S2b
 */

import { readZipEntries, openZipEntry, readZipEntryBuffer, type ZipEntry } from "./build-commercial-stdprice-zip";

/** 시트를 워크북 선언 순서대로 이어 붙여 행을 방출한다. 헤더 행 포함(호출부가 판단). */
export async function* readXlsxRows(xlsxPath: string): AsyncGenerator<string[]> {
  const entries = await readZipEntries(xlsxPath);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const sharedStrings = await loadSharedStrings(xlsxPath, byName.get("xl/sharedStrings.xml"));
  const sheetPaths = await resolveSheetOrder(xlsxPath, byName);

  for (const sheetPath of sheetPaths) {
    const entry = byName.get(sheetPath);
    if (!entry) continue;
    yield* readSheetRows(xlsxPath, entry, sharedStrings);
  }
}

/** 워크북 선언 순서 → 시트 XML 경로. 파일명 숫자 순서와 다를 수 있어 rels를 따른다. */
async function resolveSheetOrder(
  xlsxPath: string,
  byName: Map<string, ZipEntry>,
): Promise<string[]> {
  const wbEntry = byName.get("xl/workbook.xml");
  const relEntry = byName.get("xl/_rels/workbook.xml.rels");
  if (!wbEntry || !relEntry) return [];

  const wb = (await readZipEntryBuffer(xlsxPath, wbEntry)).toString("utf8");
  const rels = (await readZipEntryBuffer(xlsxPath, relEntry)).toString("utf8");

  const targetById = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = /Id="([^"]+)"/.exec(m[1])?.[1];
    const target = /Target="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targetById.set(id, target.replace(/^\/?/, ""));
  }

  const paths: string[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1];
    const target = rid ? targetById.get(rid) : undefined;
    if (target) paths.push(target.startsWith("xl/") ? target : `xl/${target}`);
  }
  return paths;
}

/** 공유문자열 전량 적재. 2024 실측 uniqueCount 425,745 · XML 10MB — 메모리 부담 없음. */
async function loadSharedStrings(xlsxPath: string, entry?: ZipEntry): Promise<string[]> {
  if (!entry) return [];
  const xml = (await readZipEntryBuffer(xlsxPath, entry)).toString("utf8");
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // rich text(<r><t>…</t></r> 반복)는 조각을 이어 붙인다
    let text = "";
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
    out.push(decodeXmlText(text));
  }
  return out;
}

async function* readSheetRows(
  xlsxPath: string,
  entry: ZipEntry,
  sharedStrings: readonly string[],
): AsyncGenerator<string[]> {
  const stream = await openZipEntry(xlsxPath, entry);
  let buf = "";
  for await (const chunk of stream) {
    buf += (chunk as Buffer).toString("utf8");
    let end = buf.indexOf("</row>");
    while (end !== -1) {
      const start = buf.lastIndexOf("<row", end);
      if (start !== -1) yield parseRowXml(buf.slice(start, end), sharedStrings);
      buf = buf.slice(end + 6);
      end = buf.indexOf("</row>");
    }
    // 행 경계를 못 만난 채 버퍼가 비대해지는 일은 없다(행 1개 ≈ 700B)
  }
}

/**
 * `<row …>` 내부 셀 파싱.
 * 빈 셀은 Excel이 아예 생략하므로 **셀 참조(A1 표기)의 열 문자로 위치를 정한다** —
 * 등장 순서로 채우면 빈 셀 뒤 컬럼이 통째로 밀린다.
 */
function parseRowXml(rowXml: string, sharedStrings: readonly string[]): string[] {
  const fields: string[] = [];
  for (const m of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const inner = m[2] ?? "";
    const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
    const col = ref ? columnLetterToIndex(ref) : fields.length;
    const type = /t="([^"]+)"/.exec(attrs)?.[1];

    let value = "";
    if (type === "inlineStr") {
      for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) value += t[1];
      value = decodeXmlText(value);
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
      value = type === "s" ? (sharedStrings[Number(v)] ?? "") : decodeXmlText(v);
    }
    while (fields.length < col) fields.push("");
    fields[col] = value;
  }
  return fields;
}

function columnLetterToIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function decodeXmlText(s: string): string {
  if (!s.includes("&")) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}
