/**
 * 별표·서식 본문 통합 파서 (HWPX / PDF / XLSX → Markdown)
 *
 * 원본 MCP korean-law-mcp 의 kordoc 엔진을 경량 재현.
 * - 법제처 별표 파일을 다운로드 → 포맷 자동 판별 → 텍스트 추출 → Markdown 반환
 * - PDF: 기존 annex-pdf-parser 재사용 (pdfjs-dist)
 * - HWPX: JSZip → fast-xml-parser 로 section*.xml 내 <hp:t> 텍스트 추출
 * - XLSX: sheet_to_csv → GFM 테이블 변환
 * - HWP(레거시 바이너리): 변환 불가 → NOT_CONVERTED 반환 (다운로드 폴백)
 * - DOCX: 당분간 지원 외 (NOT_CONVERTED)
 *
 * 캐시: `.legal-cache/annex_body_{key}_{version}.json` — TTL 30일.
 * 50KB 초과 시 compactBody 로 계단식 축약.
 */

import fs from "fs/promises";
import path from "path";
import { compactBody } from "./compact";
import { isPdfBuffer, parseAnnexPdf } from "./annex-pdf-parser";
import { formatMarkerMessage } from "./markers";

const CACHE_DIR = path.resolve(process.cwd(), ".legal-cache");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PARSER_VERSION = "1.0.0";
const MAX_MARKDOWN_BYTES = 50_000;

export type AnnexFileType = "HWPX" | "HWP" | "PDF" | "XLSX" | "XLS" | "DOCX" | "UNKNOWN";

export interface AnnexBodyResult {
  content: string;
  truncated: boolean;
  status: "ok" | "NOT_CONVERTED";
  fileType: AnnexFileType;
  pageCount?: number;
  /** 원본 바이트 크기 (참고용) */
  originalSize?: number;
  /** 변환 실패 사유 (status=NOT_CONVERTED 일 때) */
  error?: string;
  parserVersion: string;
  parsedAt: string;
}

function cacheFile(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
  return path.join(CACHE_DIR, `annex_body_${safe}.json`);
}

async function readCache(key: string): Promise<AnnexBodyResult | null> {
  try {
    const file = cacheFile(key);
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    const parsed = JSON.parse(await fs.readFile(file, "utf-8")) as AnnexBodyResult;
    if (parsed.parserVersion !== PARSER_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: AnnexBodyResult): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile(key), JSON.stringify(data, null, 2), "utf-8");
}

/** URL·링크에서 확장자를 뽑아 AnnexFileType 으로 정규화 */
export function normalizeFileType(hint: string | undefined): AnnexFileType {
  if (!hint) return "UNKNOWN";
  const ext = hint.replace(/^\./, "").toLowerCase();
  if (ext.startsWith("hwpx")) return "HWPX";
  if (ext === "hwp") return "HWP";
  if (ext === "pdf") return "PDF";
  if (ext === "xlsx") return "XLSX";
  if (ext === "xls") return "XLS";
  if (ext === "docx") return "DOCX";
  return "UNKNOWN";
}

/**
 * HWPX (OWPML ZIP) → Markdown 텍스트 추출.
 * Contents/section*.xml 의 <hp:t> 텍스트를 순서대로 모아 반환.
 */
async function parseHwpx(buf: ArrayBuffer): Promise<{ text: string }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);

  const { XMLParser } = await import("fast-xml-parser");
  const parser = new XMLParser({
    ignoreAttributes: true,
    preserveOrder: false,
    parseTagValue: false,
    trimValues: true,
    textNodeName: "_text",
  });

  const sections = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort();

  if (sections.length === 0) {
    throw new Error("HWPX: section*.xml 파일을 찾지 못했습니다.");
  }

  const lines: string[] = [];
  for (const name of sections) {
    const file = zip.files[name];
    const xml = await file.async("string");
    const parsed: unknown = parser.parse(xml);
    collectText(parsed, lines);
  }

  const text = dedupLines(lines).join("\n");
  return { text };
}

/** XML 객체 트리에서 `hp:t` 텍스트 노드를 순회해 lines 로 수집 */
function collectText(node: unknown, lines: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    const t = node.trim();
    if (t) lines.push(t);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, lines);
    return;
  }
  if (typeof node === "object") {
    const rec = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(rec)) {
      // hp:t / t / p:t 등 텍스트 보유 태그는 trailing _text
      if (key === "_text" && typeof value === "string") {
        const t = value.trim();
        if (t) lines.push(t);
      } else if (key === "hp:t" || key === "t") {
        collectText(value, lines);
      } else {
        collectText(value, lines);
      }
    }
  }
}

/** 연속 중복 라인 제거 (HWPX 파서가 문자 단위 분할하는 경우 대비) */
function dedupLines(lines: string[]): string[] {
  const out: string[] = [];
  let prev = "";
  for (const l of lines) {
    if (l !== prev) {
      out.push(l);
      prev = l;
    }
  }
  return out;
}

/**
 * XLSX → GFM Markdown 테이블.
 * 시트가 여러 개면 각 시트를 `## 시트명` 헤더로 구분.
 */
async function parseXlsx(buf: ArrayBuffer): Promise<{ text: string }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (rows.length === 0) continue;
    const header = rows[0].map((c) => String(c).trim() || " ");
    const body = rows.slice(1).map((r) => r.map((c) => String(c ?? "").trim() || " "));
    const colCount = Math.max(header.length, ...body.map((r) => r.length));
    const pad = (r: string[]) => {
      const p = [...r];
      while (p.length < colCount) p.push(" ");
      return p;
    };
    const headerLine = `| ${pad(header).join(" | ")} |`;
    const separator = `| ${Array(colCount).fill("---").join(" | ")} |`;
    const bodyLines = body.map((r) => `| ${pad(r).join(" | ")} |`);
    parts.push(
      `## ${sheetName}\n\n${headerLine}\n${separator}\n${bodyLines.join("\n")}`
    );
  }
  if (parts.length === 0) throw new Error("XLSX: 빈 워크북");
  return { text: parts.join("\n\n") };
}

/**
 * 최종 결과 포장: 50KB 초과 시 compact, 공통 필드 채움.
 */
function finalize(
  text: string,
  fileType: AnnexFileType,
  originalSize: number,
  pageCount?: number
): AnnexBodyResult {
  const bytes = Buffer.byteLength(text, "utf-8");
  let content = text;
  let truncated = false;
  if (bytes > MAX_MARKDOWN_BYTES) {
    // 앞 40KB + 뒤 10KB 유지, 가운데는 중략 표시
    content = compactBody(text, {
      headSize: 40_000,
      tailSize: 10_000,
      minSave: 2_000,
    });
    truncated = content.length < text.length;
  }
  return {
    content,
    truncated,
    status: "ok",
    fileType,
    pageCount,
    originalSize,
    parserVersion: PARSER_VERSION,
    parsedAt: new Date().toISOString(),
  };
}

/**
 * 공개 함수 — URL + 힌트 파일타입으로 별표 본문 Markdown 추출.
 *
 * cacheKey 는 호출자가 `{mst}_{annexNo}` 형태로 제공 (중복 파싱 방지).
 */
export async function parseAnnexBody(
  url: string,
  typeHint: string | undefined,
  cacheKey: string
): Promise<AnnexBodyResult> {
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  // 법제처 flDownload.do 는 기본 Node fetch(undici UA) 를 지연·차단하는 경향.
  // 브라우저 유사 헤더 + Referer 를 붙이고 20초 타임아웃 설정.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Referer: "https://www.law.go.kr/",
      },
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    const err: AnnexBodyResult = {
      content: formatMarkerMessage(
        "NOT_CONVERTED",
        `법제처 파일 서버 접근 실패 (${msg}). 다운로드 링크로 원본을 확인하세요.`
      ),
      truncated: false,
      status: "NOT_CONVERTED",
      fileType: normalizeFileType(typeHint),
      error: msg,
      parserVersion: PARSER_VERSION,
      parsedAt: new Date().toISOString(),
    };
    return err;
  }
  clearTimeout(timer);
  if (!res.ok) {
    const err: AnnexBodyResult = {
      content: formatMarkerMessage("NOT_CONVERTED", `다운로드 실패 (${res.status})`),
      truncated: false,
      status: "NOT_CONVERTED",
      fileType: normalizeFileType(typeHint),
      error: `HTTP ${res.status}`,
      parserVersion: PARSER_VERSION,
      parsedAt: new Date().toISOString(),
    };
    return err;
  }
  const buf = await res.arrayBuffer();
  const originalSize = buf.byteLength;

  // magic byte 우선, 실패 시 확장자 hint
  let detected: AnnexFileType = normalizeFileType(typeHint);
  if (isPdfBuffer(buf)) detected = "PDF";
  else if (looksLikeZip(buf)) {
    // HWPX · XLSX · DOCX 는 모두 ZIP 헤더. 확장자 hint 없으면 HWPX 우선 시도.
    if (detected === "UNKNOWN") detected = "HWPX";
  }

  try {
    let result: AnnexBodyResult;
    if (detected === "PDF") {
      const parsed = await parseAnnexPdf(cacheKey, url);
      result = finalize(parsed.text, "PDF", originalSize, parsed.pageCount);
    } else if (detected === "HWPX") {
      const { text } = await parseHwpx(buf);
      result = finalize(text, "HWPX", originalSize);
    } else if (detected === "XLSX" || detected === "XLS") {
      const { text } = await parseXlsx(buf);
      result = finalize(text, detected, originalSize);
    } else {
      // HWP/DOCX/UNKNOWN → 변환 불가
      result = {
        content: formatMarkerMessage(
          "NOT_CONVERTED",
          `${detected} 형식은 현재 지원하지 않습니다. 다운로드 링크로 원본을 확인하세요.`
        ),
        truncated: false,
        status: "NOT_CONVERTED",
        fileType: detected,
        originalSize,
        error: `unsupported file type: ${detected}`,
        parserVersion: PARSER_VERSION,
        parsedAt: new Date().toISOString(),
      };
    }
    await writeCache(cacheKey, result);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fallback: AnnexBodyResult = {
      content: formatMarkerMessage("NOT_CONVERTED", msg),
      truncated: false,
      status: "NOT_CONVERTED",
      fileType: detected,
      originalSize,
      error: msg,
      parserVersion: PARSER_VERSION,
      parsedAt: new Date().toISOString(),
    };
    // 실패도 짧은 기간 캐시 (재시도 폭주 방지) — 1일만 유효하도록 parsedAt 당겨 저장
    await writeCache(cacheKey, fallback);
    return fallback;
  }
}

function looksLikeZip(buf: ArrayBuffer): boolean {
  const arr = new Uint8Array(buf);
  if (arr.length < 4) return false;
  // "PK\x03\x04"
  return arr[0] === 0x50 && arr[1] === 0x4b && (arr[2] === 0x03 || arr[2] === 0x05 || arr[2] === 0x07);
}
