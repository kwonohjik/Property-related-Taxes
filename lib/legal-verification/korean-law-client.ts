/**
 * 법제처 Open API 클라이언트
 *
 * - 법령 검색 (법령명 → MST 획득)
 * - 조문 전문 조회 (법령 전체 다운로드 후 해당 조문 추출)
 * - 파일 캐시: .legal-cache/ (7일 TTL)
 *
 * API 응답 구조 (JSON):
 *   lawSearch.do → LawSearch.law[].법령명한글 (밑줄 없음)
 *   lawService.do → 법령.조문.조문단위[] (각 항목에 조문번호, 조문키, 항[] 포함)
 *
 * API 문서: https://www.law.go.kr/LSW/openApiInfo.do
 */

import fs from "fs/promises";
import path from "path";

const API_BASE = "https://www.law.go.kr/DRF";
const CACHE_DIR = path.resolve(process.cwd(), ".legal-cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

/**
 * 조문 파싱 산출물(article_*) 캐시 버전.
 *
 * fetchArticle은 raw 응답이 아니라 extractUnitText/normalizeContent를 거친 **파싱 결과**를
 * 캐시한다 → 파서를 고쳐도 TTL(7일) 동안 구버전 산출물이 그대로 서빙되는 함정.
 * (실사례: 표 콤마 뭉갬·<img> 잔존 수정 후에도 11:55에 기록된 stale 캐시가 깨진 본문 노출)
 * extractUnitText·normalizeContent·title 추출 로직을 바꿀 때마다 이 값을 올릴 것.
 * raw 캐시(law_units_*)는 파서 무관이라 버전 없이 유지 — 재파싱은 오프라인에서도 동작.
 */
const ARTICLE_CACHE_VERSION = 2;

/**
 * 법제처 Open API 인증키 (OC)
 *
 * 발급 방법:
 *   1. https://open.law.go.kr 접속 → 회원가입
 *   2. 마이페이지 → Open API 신청 → 승인 후 OC(계정ID) 발급
 *   3. .env.local에  KOREAN_LAW_OC=발급받은ID  추가
 *
 * 미설정 시 검증 스크립트가 실행되지 않는다.
 */
function getApiKey(): string {
  const key = process.env.KOREAN_LAW_OC ?? "";
  if (!key) {
    throw new Error(
      [
        "",
        "법제처 Open API 키(OC)가 설정되지 않았습니다.",
        "",
        "발급 방법:",
        "  1. https://open.law.go.kr 접속 → 회원가입",
        "  2. 마이페이지 → Open API 신청 → 승인 후 OC 발급",
        "  3. 프로젝트 루트 .env.local에 추가:",
        "       KOREAN_LAW_OC=발급받은계정ID",
        "",
      ].join("\n")
    );
  }
  return key;
}

export interface LawSearchResult {
  lawName: string;
  lawId: string;
  mst: string;
  promulgationDate: string;
}

export interface LawArticle {
  /** 조문 제목 */
  title: string;
  /** 조문 본문 전체 */
  fullText: string;
  /** 조회한 법령명 */
  lawName: string;
  /** 조회한 조문 번호 */
  articleNo: string;
}

// ── 법제처 API 실제 응답 타입 ───────────────────────────────────────────────

interface HoItem {
  호번호: string;
  /** 문자열·배열·중첩배열 가변 (표가 포함된 호는 중첩배열로 옴) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  호내용: any;
  목?: MokItem | MokItem[];
}

interface MokItem {
  목번호: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  목내용: any;
}

interface HangItem {
  항번호?: string;
  /** 배열로 올 수도 있음 (XML→JSON 변환) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  항내용?: any;
  호?: HoItem | HoItem[];
}

interface LawServiceUnit {
  조문번호: string;
  조문키: string;
  /** 문자열 또는 배열 또는 중첩배열 (XML→JSON 변환에 따라 구조 가변) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  조문내용?: any;
  /** 괄호 안 제목만 (예: "세율"). 헤더 "제N조(세율)" 와 별개로 API가 제공. */
  조문제목?: string;
  조문여부?: string;
  조문참고자료?: string;
  /** XML→JSON 변환 시 단일=객체, 복수=배열로 올 수 있음 */
  항?: HangItem | HangItem[];
}

/** 조문내용 필드를 문자열로 정규화
 * - string → 그대로
 * - string[] → 이미지·HTML 제거 후 합침
 * - (string|string[])[] → 재귀적으로 평탄화
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeContent(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return stripImgTags(raw).trim();
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeContent(item))
      .filter((s) => s && !s.startsWith("<img"))
      .join("\n")
      .trim();
  }
  return String(raw).trim();
}

/**
 * 조문 본문에 인라인으로 섞인 `<img ...>` / `</img>` 태그 제거.
 * 법제처는 세율표 등 표를 이미지(flDownload)로 내려주는데, 다운로드 불가 링크라
 * 화면에 raw 태그가 노출된다. 표의 텍스트 표현(박스 문자)은 보존한다.
 */
export function stripImgTags(s: string): string {
  return s.replace(/<\/?img[^>]*>/gi, "");
}

/**
 * XML→JSON 변환 시 단일 요소는 객체, 복수 요소는 배열로 변환되는 문제를 처리.
 * 항상 배열로 반환한다.
 */
function normalizeArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

interface LawServiceResponse {
  법령?: {
    조문?: {
      // 결과 1건이면 단일 객체, 복수면 배열로 옴
      조문단위?: LawServiceUnit | LawServiceUnit[];
    };
  };
}

// ── 캐시 유틸 ─────────────────────────────────────────────────────────────

async function readCache<T>(key: string): Promise<T | null> {
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    const text = await fs.readFile(file, "utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${key}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

function safeCacheKey(str: string): string {
  return str.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
}

// ── API 호출 유틸 ──────────────────────────────────────────────────────────

/** 법제처 API fetch (JSON 응답) */
async function fetchLawApi(
  endpoint: string,
  params: Record<string, string>
): Promise<unknown> {
  const oc = getApiKey();
  const qs = new URLSearchParams({ OC: oc, ...params, type: "JSON" }).toString();
  const url = `${API_BASE}/${endpoint}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`법제처 API 오류: ${res.status} ${url}`);
  const json = await res.json() as Record<string, unknown>;
  // 사용자 검증 실패 응답 처리
  if (typeof json["result"] === "string" && json["result"].includes("실패")) {
    throw new Error(`법제처 API 인증 오류: ${json["result"]}\n등록된 IP/도메인이 맞는지 확인하세요.`);
  }
  return json;
}

// ── 조문 텍스트 재구성 ─────────────────────────────────────────────────────

/**
 * 조문단위 하나에서 전체 텍스트를 재구성한다.
 * 조문내용(제목 줄) + 각 항 + 각 호 + 각 목을 합쳐서 반환.
 */
function extractUnitText(unit: LawServiceUnit): string {
  const parts: string[] = [];

  const content = normalizeContent(unit.조문내용);
  if (content) parts.push(content);

  for (const hang of normalizeArray(unit.항)) {
    const hangText = normalizeContent(hang.항내용);
    if (hangText) parts.push(hangText);
    for (const ho of normalizeArray(hang.호)) {
      // 호내용은 표 포함 시 중첩배열 → normalizeContent로 평탄화(콤마 뭉갬·img 방지).
      const hoText = normalizeContent(ho.호내용);
      if (hoText) parts.push(hoText);
      for (const mok of normalizeArray(ho.목)) {
        const mokText = normalizeContent(mok.목내용);
        if (mokText) parts.push(mokText);
      }
    }
  }

  return parts.join("\n");
}

/**
 * "제55조(세율) ..." → "세율". 헤더 괄호 안 제목만 추출.
 * 매칭 실패(괄호 없는 조문 등) 시 빈 문자열.
 */
export function parseTitleFromHeader(headerLine: string): string {
  const m = headerLine.match(/^제\d+조(?:의\d+)?\s*\(([^)]+)\)/);
  return m ? m[1].trim() : "";
}

/**
 * "제18조의3" → 조문단위에서 해당 조문 찾기
 *
 * 법제처 API는 모든 조문을 조문단위[] 배열로 내려준다.
 * 각 단위의 조문내용이 "제N조(제목)" 또는 "제N조의M(제목)" 형태이므로
 * needle이 정확히 그 앞부분과 일치하는지 확인한다.
 *
 * 주의: "제18조"가 "제18조의2" 를 잘못 매칭하지 않도록
 *        needle 뒤에 한자·숫자·의가 오지 않는 경우만 매칭한다.
 */
function findArticleUnit(
  units: LawServiceUnit[],
  articleNo: string
): LawServiceUnit | null {
  // articleNo 예: "제89조", "제18조의3", "제111조의2"
  const needle = articleNo.replace(/\s/g, ""); // 공백 제거
  // needle 뒤에 "의" 나 숫자가 이어지면 다른 조문이므로 매칭 제외
  const exactPattern = new RegExp(`^${needle}(?!의|\\d)`);

  for (const unit of units) {
    const content = normalizeContent(unit.조문내용);
    if (exactPattern.test(content)) {
      return unit;
    }
    // 일부 법령은 조문내용이 없고 항①에 "제N조(제목)" 형태가 포함된 경우
    for (const hang of normalizeArray(unit.항)) {
      const hangText = normalizeContent(hang.항내용);
      if (hangText && exactPattern.test(hangText)) {
        return unit;
      }
    }
  }
  return null;
}

// ── 공개 API ──────────────────────────────────────────────────────────────

/**
 * 법령명으로 검색하여 MST(법령일련번호) 획득
 * 가장 최신 법률을 반환한다.
 */
export async function searchLaw(lawName: string): Promise<LawSearchResult | null> {
  const cacheKey = `search_${safeCacheKey(lawName)}`;
  const cached = await readCache<LawSearchResult>(cacheKey);
  if (cached) return cached;

  type LawEntry = {
    법령명한글: string;   // API 실제 응답: 밑줄 없음
    법령ID: string;
    법령일련번호: string;
    공포일자: string;
  };
  const data = await fetchLawApi("lawSearch.do", {
    target: "law",
    query: lawName,
    display: "5",
  }) as { LawSearch?: { law?: LawEntry | LawEntry[] } };

  // 법제처 API는 결과 1건 시 배열 대신 단일 객체를 반환 (XML→JSON 변환 특성)
  const laws = normalizeArray<LawEntry>(data?.LawSearch?.law);
  // 정확한 법령명 우선, 없으면 첫 번째
  const match =
    laws.find((l) => l["법령명한글"] === lawName) ?? laws[0];

  if (!match) return null;

  const result: LawSearchResult = {
    lawName: match["법령명한글"],
    lawId: match["법령ID"],
    mst: match["법령일련번호"],
    promulgationDate: match["공포일자"],
  };
  await writeCache(cacheKey, result);
  return result;
}

/**
 * MST + 조문 번호로 조문 전문 조회
 *
 * 법제처 API는 법령 전체를 내려주므로 전체를 한 번만 받아 캐시하고
 * 이후에는 캐시된 조문 단위 배열에서 원하는 조문을 추출한다.
 *
 * articleNo 예: "제18조의3", "제111조", "제89조"
 */
export async function fetchArticle(
  mst: string,
  lawName: string,
  articleNo: string
): Promise<LawArticle | null> {
  const cacheKey = `article_${mst}_${safeCacheKey(articleNo)}_v${ARTICLE_CACHE_VERSION}`;
  const cached = await readCache<LawArticle>(cacheKey);
  if (cached) return cached;

  // 법령 전체 조문단위 캐시
  const lawCacheKey = `law_units_${mst}`;
  let units = await readCache<LawServiceUnit[]>(lawCacheKey);

  if (!units) {
    const data = await fetchLawApi("lawService.do", {
      target: "law",
      MST: mst,
    }) as LawServiceResponse;

    // 단일 객체·배열·undefined 를 모두 배열로 정규화
    units = normalizeArray(data?.법령?.조문?.조문단위);
    if (units.length === 0) return null;
    await writeCache(lawCacheKey, units);
  }

  const unit = findArticleUnit(units, articleNo);
  if (!unit) return null;

  const fullText = extractUnitText(unit);
  if (!fullText) return null;

  // 제목: API의 조문제목(괄호 안 "세율"만) 우선. 없으면 헤더 "제N조(제목)"에서 괄호 추출,
  // 그것도 없으면 첫 줄 → articleNo. (헤더 전체를 title로 쓰면 본문 첫 줄과 중복 표시됨)
  const cleanTitle = typeof unit.조문제목 === "string" ? unit.조문제목.trim() : "";
  const titleLine = normalizeContent(unit.조문내용).split("\n")[0] ?? "";
  const title = cleanTitle || parseTitleFromHeader(titleLine) || titleLine || articleNo;

  const result: LawArticle = {
    title,
    fullText,
    lawName,
    articleNo,
  };
  await writeCache(cacheKey, result);
  return result;
}

/** MST 캐시 무효화 (법령 개정 후 강제 재조회 시) */
export async function clearCache(lawName?: string): Promise<void> {
  if (!lawName) {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    return;
  }
  const entries = await fs.readdir(CACHE_DIR).catch(() => []);
  for (const f of entries) {
    if (f.includes(safeCacheKey(lawName))) {
      await fs.rm(path.join(CACHE_DIR, f), { force: true });
    }
  }
}
