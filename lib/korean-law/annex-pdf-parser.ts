/**
 * 별표 PDF 경량 파서
 *
 * 법제처 별표 파일(HWPX/HWP5/PDF/XLSX/DOCX) 중 **PDF만** 텍스트 추출 지원.
 * HWPX/HWP5/XLSX/DOCX 는 다운로드 링크와 파일 형식 배지만 표시.
 *
 * 의존성: pdfjs-dist ^5.6
 *   - Next.js App Router 서버 환경에서 동작 (node runtime)
 *   - dynamic import 로 lazy-load 하여 번들 크기 영향 최소화
 *
 * 파싱 범위 한계:
 *   - 라인 기반 텍스트만 추출 (y 좌표 grouping → 순차 결합)
 *   - 표 구조 복원 없음 — 종부세 별표 세율표는 셀이 flatten 됨
 *   - 이미지 PDF(스캔)는 대부분 빈 결과 반환
 */

import fs from "fs/promises";
import path from "path";

// pdfjs-dist 의 반환 타입을 최소 인터페이스로 정의 (런타임 duck typing)
interface PdfTextItem {
  str: string;
  transform?: number[];
}
interface PdfPage {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
}
interface PdfDocument {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

const CACHE_DIR = path.resolve(process.cwd(), ".legal-cache");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export interface ParsedAnnexPdf {
  text: string;
  pageCount: number;
  /** 파싱 버전 (포맷 변경 시 캐시 무효화용) */
  parserVersion: string;
  parsedAt: string;
}

const PARSER_VERSION = "1.0.0";

function cacheKey(annexId: string): string {
  return `annex_pdf_text_${annexId.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}`;
}

async function readCache(annexId: string): Promise<ParsedAnnexPdf | null> {
  const file = path.join(CACHE_DIR, `${cacheKey(annexId)}.json`);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    const parsed = JSON.parse(await fs.readFile(file, "utf-8")) as ParsedAnnexPdf;
    // 파서 버전 미스매치는 캐시 무효화
    if (parsed.parserVersion !== PARSER_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(annexId: string, data: ParsedAnnexPdf): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(
    path.join(CACHE_DIR, `${cacheKey(annexId)}.json`),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

/**
 * 버퍼가 PDF인지 magic bytes 로 판정.
 * `%PDF-` 4바이트 확인.
 */
export function isPdfBuffer(buf: ArrayBuffer | Uint8Array): boolean {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (arr.length < 5) return false;
  // 0x25 0x50 0x44 0x46 0x2D = "%PDF-"
  return (
    arr[0] === 0x25 &&
    arr[1] === 0x50 &&
    arr[2] === 0x44 &&
    arr[3] === 0x46 &&
    arr[4] === 0x2d
  );
}

/**
 * URL에서 파일 확장자 추출 (대소문자 무시, 쿼리 제거).
 */
export function detectFileType(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const p = u.pathname;
    const m = p.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : "";
  } catch {
    const m = url.match(/\.([a-zA-Z0-9]+)(?:$|[?#])/);
    return m ? m[1].toLowerCase() : "";
  }
}

/**
 * 법제처 별표 PDF URL 을 다운로드 → 텍스트 추출.
 *
 * pdfjs-dist 는 번들 사이즈가 크므로 dynamic import 로 lazy load.
 *
 * @param annexId 캐시 키용 별표 고유 식별자 (중복 파싱 방지)
 * @param fileUrl 다운로드할 PDF URL
 */
export async function parseAnnexPdf(
  annexId: string,
  fileUrl: string
): Promise<ParsedAnnexPdf> {
  const cached = await readCache(annexId);
  if (cached) return cached;

  // 파일 다운로드
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`PDF 다운로드 실패 (${res.status}): ${fileUrl}`);
  }
  const buf = await res.arrayBuffer();
  if (!isPdfBuffer(buf)) {
    throw new Error("PDF 매직 바이트(%PDF-)를 찾을 수 없습니다. 다른 형식의 파일일 수 있습니다.");
  }

  // pdfjs-dist lazy import — 번들 크기 절감
  // legacy build 사용 (Node 서버 환경에서 경고 없음)
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument: (arg: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
    GlobalWorkerOptions?: { workerSrc?: string };
  };
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await loadingTask.promise;
  const pageCount = doc.numPages;
  const pagesText: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // y 좌표별 그룹핑 후 x 오름차순 정렬 → 라인 단위 결합
    const linesByY = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items) {
      const transform = item.transform ?? [];
      const x = Number(transform[4] ?? 0);
      const yRaw = Number(transform[5] ?? 0);
      // y 좌표를 2pt 단위로 버켓팅 (같은 줄로 간주)
      const yBucket = Math.round(yRaw / 2) * 2;
      const bucket = linesByY.get(yBucket);
      if (bucket) bucket.push({ x, str: item.str ?? "" });
      else linesByY.set(yBucket, [{ x, str: item.str ?? "" }]);
    }
    const orderedYs = Array.from(linesByY.keys()).sort((a, b) => b - a); // y 큰 값(위)부터
    const lines: string[] = [];
    for (const y of orderedYs) {
      const arr = linesByY.get(y)!.sort((a, b) => a.x - b.x);
      const line = arr
        .map((item) => item.str)
        .join("")
        .trim();
      if (line) lines.push(line);
    }
    pagesText.push(`[p.${i}]\n${lines.join("\n")}`);
  }

  const parsed: ParsedAnnexPdf = {
    text: pagesText.join("\n\n"),
    pageCount,
    parserVersion: PARSER_VERSION,
    parsedAt: new Date().toISOString(),
  };
  await writeCache(annexId, parsed);
  return parsed;
}
