/**
 * 행위시법 판단 (applicable_law) — 기준일에 시행 중이던 법령 버전 + 부칙 경과규정 발췌
 *
 * upstream: chrisryugj/korean-law-mcp v4.3 src/tools/applicable-law.ts 의 알고리즘을
 * 이식하되, 연혁 목록은 업스트림의 lsHistory HTML 파싱 대신
 * `lawSearch.do?target=eflaw` JSON 직접 조회로 단순화 (2026-06-12 probe 실측).
 *
 * 법제처 API 3종 (probe로 스키마 동결):
 *   ① lawSearch.do?target=eflaw&query=&display=&page=   → LawSearch.law[] 버전 목록
 *      필드: 법령명한글·법령일련번호(MST)·시행일자·공포일자·공포번호·제개정구분명·현행연혁코드
 *   ② lawService.do?target=eflaw&MST=&efYd=&JO=         → 법령.조문.조문단위[]
 *      ⚠ eflaw 본문은 MST 단독 조회 불가 — 해당 버전의 efYd 동반 필수
 *      조문단위는 조문여부 "전문"(더미) 행이 선행할 수 있음 → "조문"만 취한다
 *   ③ lawService.do?target=law&MST=                     → 법령.부칙.부칙단위[]
 *      필드: 부칙공포일자·부칙공포번호·부칙내용 (현행 전문에 역대 부칙 누적)
 *
 * 알고리즘 (업스트림 동일):
 *   applicable    = versions(efYd 내림차순).find(efYd <= 기준일)
 *   current       = versions.find(efYd <= 오늘)
 *   laterVersions = versions.filter(기준일 < efYd <= 오늘)
 *   부칙 발췌      = {applicable, laterVersions}의 공포번호와 일치하는 부칙에서
 *                   조문 언급 라인 우선 + 경과규정 신호(TRANSITION_RE) 라인
 */

import { buildJoCode, flattenContent, formatArticleUnit } from "./article-parser";
import { resolveLawAlias } from "./aliases";
import {
  LawApiError,
  fetchJson,
  readCache,
  safeCacheKey,
  toArray,
  writeCache,
} from "./client-core";
import { buildLawSourceUrl, normalizeArticleNo } from "./client-law";
import type { ApplicableLawResult, LawVersionEntry, TransitionExcerpt } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 1. 순수 함수 — 날짜·버전 선택·부칙 발췌 (fixture 단위 테스트 대상)
// ────────────────────────────────────────────────────────────────────────────

/** 경과규정 신호 (upstream TRANSITION_RE 동일) */
export const TRANSITION_RE =
  /적용례|경과조치|종전의\s*규정|시행\s*전에|행위에\s*대하여|예에\s*따른다|불구하고[^\n]*적용/;

/**
 * "2021-06-01" | "2021.6.1" | "20210601" → "20210601".
 * 형식 불일치 시 null.
 */
export function normalizeYmd(input: string): string | null {
  const m = input.trim().match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}${String(mo).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** 오늘 YYYYMMDD (UTC 일자 — date-parser.ts 와 동일 기준) */
export function todayYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 시행일 내림차순(같으면 공포일 내림차순) 정렬 — 선택 함수들의 전제 */
export function sortVersionsDesc(versions: LawVersionEntry[]): LawVersionEntry[] {
  return [...versions].sort((a, b) => {
    if (a.efYd !== b.efYd) return b.efYd.localeCompare(a.efYd);
    return b.ancYd.localeCompare(a.ancYd);
  });
}

/** 기준일에 시행 중이던 버전 (efYd <= baseDate 중 최신). 정렬된 배열 전제. */
export function selectApplicableVersion(
  sortedVersions: LawVersionEntry[],
  baseDate: string
): LawVersionEntry | null {
  return sortedVersions.find((v) => v.efYd && v.efYd <= baseDate) ?? null;
}

/** 기준일 이후 ~ 오늘 사이 시행된 버전들 (경과규정 추적 대상). 공포번호 중복 제거. */
export function selectLaterVersions(
  sortedVersions: LawVersionEntry[],
  baseDate: string,
  today: string
): LawVersionEntry[] {
  const seen = new Set<string>();
  return sortedVersions.filter((v) => {
    if (!(v.efYd > baseDate && v.efYd <= today)) return false;
    const key = normalizeAncNo(v.ancNo);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 공포번호 정규화 — "09897" / "9897" 표기 차를 흡수 */
export function normalizeAncNo(raw: string): string {
  const n = parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? String(n) : String(raw ?? "").trim();
}

/** 부칙 1건 (fetch 결과 정규화 형태) */
export interface AddendumUnit {
  ancNo: string;
  ancYd: string;
  /** 평탄화된 부칙 전문 */
  content: string;
}

/**
 * 부칙들에서 적용례·경과조치 라인 발췌.
 *
 * @param addenda        부칙 단위 배열 (순서 무관 — 내부에서 공포일 내림차순 정렬)
 * @param relevantAncNos 적용 버전 + 이후 개정의 공포번호 집합 (normalizeAncNo 적용 값).
 *                       빈 집합이면 전체 부칙 대상.
 * @param joDisplay      조문 표시명 ("제89조"). 해당 조문 언급 라인을 최우선 발췌.
 */
export function extractTransitionExcerpts(
  addenda: AddendumUnit[],
  relevantAncNos: Set<string>,
  joDisplay: string,
  opts: { maxAddenda?: number; maxLinesPer?: number } = {}
): TransitionExcerpt[] {
  const maxAddenda = opts.maxAddenda ?? 6;
  const maxLinesPer = opts.maxLinesPer ?? 3;

  // "제89조" 매칭 시 "제89조의2"(가지번호) 오탐 방지 — 단 "제89조의 개정규정"(의=소유격)은 허용.
  // 구분: 가지번호는 "의" 뒤에 숫자, 소유격은 "의" 뒤에 비숫자. → (?!의\d)
  const joRe = joDisplay
    ? new RegExp(joDisplay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (joDisplay.includes("조의") ? "" : "(?!의\\d)"))
    : null;

  const sorted = [...addenda].sort((a, b) => b.ancYd.localeCompare(a.ancYd));
  const out: TransitionExcerpt[] = [];

  for (const unit of sorted) {
    const ancNo = normalizeAncNo(unit.ancNo);
    if (relevantAncNos.size > 0 && !relevantAncNos.has(ancNo)) continue;

    const lines = unit.content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const joHits = joRe ? lines.filter((l) => joRe.test(l)) : [];
    // 조문 직접 언급 라인이 있으면 그 라인만(조문 전용). 없으면 일반 경과조치 라인(참고용).
    const articleSpecific = joHits.length > 0;
    const transitionHits = lines.filter((l) => TRANSITION_RE.test(l) && !joHits.includes(l));
    const picked = (articleSpecific ? joHits : transitionHits).slice(0, maxLinesPer);
    if (picked.length === 0) continue;

    out.push({ ancNo: unit.ancNo, ancYd: unit.ancYd, lines: picked, articleSpecific });
  }

  // 조문 전용 발췌를 앞에, 그다음 공포일 내림차순. maxAddenda로 제한.
  out.sort((a, b) => {
    if (a.articleSpecific !== b.articleSpecific) return a.articleSpecific ? -1 : 1;
    return b.ancYd.localeCompare(a.ancYd);
  });
  return out.slice(0, maxAddenda);
}

/** 본문 텍스트 동일성 비교 — 공백 정규화 후 비교 */
export function isSameArticleText(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

// ────────────────────────────────────────────────────────────────────────────
// 2. fetch — 법제처 API (캐시 7일, client-core 공용 인프라)
// ────────────────────────────────────────────────────────────────────────────

const VERSIONS_PAGE_SIZE = 100;
const VERSIONS_MAX_PAGES = 8;

interface EflawSearchEntry {
  법령명한글?: string;
  법령일련번호?: string;
  시행일자?: string;
  공포일자?: string;
  공포번호?: string;
  제개정구분명?: string;
  현행연혁코드?: string;
}

/**
 * 법령의 전체 버전 목록 (시행일 내림차순, (MST, efYd) 중복 제거).
 * eflaw 검색은 시행령·시행규칙도 함께 반환하므로 법령명 정확 일치로 필터.
 */
export async function fetchLawVersions(lawNameInput: string): Promise<{
  lawName: string;
  versions: LawVersionEntry[];
}> {
  const lawName = resolveLawAlias(lawNameInput.trim());
  const cacheKey = `eflaw_versions_${safeCacheKey(lawName)}`;
  const cached = await readCache<{ lawName: string; versions: LawVersionEntry[] }>(cacheKey);
  if (cached) return cached;

  const versions: LawVersionEntry[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= VERSIONS_MAX_PAGES; page++) {
    const data = await fetchJson<{
      LawSearch?: { law?: EflawSearchEntry | EflawSearchEntry[]; totalCnt?: string | number };
    }>("lawSearch.do", {
      target: "eflaw",
      query: lawName,
      display: String(VERSIONS_PAGE_SIZE),
      page: String(page),
    });
    const arr = toArray(data.LawSearch?.law);
    for (const e of arr) {
      if (e.법령명한글 !== lawName) continue;
      const mst = e.법령일련번호 ?? "";
      const efYd = e.시행일자 ?? "";
      if (!mst || !efYd) continue;
      const key = `${mst}_${efYd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      versions.push({
        mst,
        efYd,
        ancYd: e.공포일자 ?? "",
        ancNo: e.공포번호 ?? "",
        rrCls: e.제개정구분명 ?? "",
        statusLabel: e.현행연혁코드 ?? "",
      });
    }
    if (arr.length < VERSIONS_PAGE_SIZE) break;
  }

  const result = { lawName, versions: sortVersionsDesc(versions) };
  if (result.versions.length > 0) await writeCache(cacheKey, result);
  return result;
}

/**
 * 특정 버전(MST + efYd)의 조문 본문.
 * 조문단위 중 조문여부 "조문" 만 취하고 "전문" 더미는 건너뜀.
 */
export async function fetchEflawArticle(
  mst: string,
  efYd: string,
  articleNo: string
): Promise<{ title: string; fullText: string } | null> {
  const jo = buildJoCode(articleNo);
  if (!jo) {
    throw new LawApiError(`조문번호를 해석할 수 없습니다: ${articleNo}`, "BAD_REQUEST");
  }
  const cacheKey = `eflaw_article_${mst}_${efYd}_${jo}`;
  const cached = await readCache<{ title: string; fullText: string } | { notFound: true }>(
    cacheKey
  );
  if (cached) return "notFound" in cached ? null : cached;

  const data = await fetchJson<{
    법령?: { 조문?: { 조문단위?: unknown } };
  }>("lawService.do", { target: "eflaw", MST: mst, efYd, JO: jo });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const units = toArray<any>(data.법령?.조문?.조문단위 as any);
  const real = units.find((u) => u?.조문여부 === "조문");
  if (!real) {
    await writeCache(cacheKey, { notFound: true });
    return null;
  }
  const unit = formatArticleUnit(real, normalizeArticleNo(articleNo));
  const result = { title: unit.title, fullText: unit.fullText };
  await writeCache(cacheKey, result);
  return result;
}

/**
 * 현행 법령 전문에서 부칙 단위들만 추출.
 * 전체 응답이 크므로 부칙만 정규화해 캐시.
 */
export async function fetchAddendaUnits(mst: string): Promise<AddendumUnit[]> {
  const cacheKey = `law_addenda_${mst}`;
  const cached = await readCache<AddendumUnit[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<{
    법령?: { 부칙?: { 부칙단위?: unknown } };
  }>("lawService.do", { target: "law", MST: mst });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const units = toArray<any>(data.법령?.부칙?.부칙단위 as any);
  const result: AddendumUnit[] = units.map((u) => ({
    ancNo: String(u?.부칙공포번호 ?? ""),
    ancYd: String(u?.부칙공포일자 ?? ""),
    content: flattenContent(u?.부칙내용),
  }));
  await writeCache(cacheKey, result);
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 오케스트레이션
// ────────────────────────────────────────────────────────────────────────────

/**
 * 행위시법 판단 — 기준일에 시행 중이던 조문 + 현행 대비 + 부칙 경과규정.
 *
 * @throws LawApiError BAD_REQUEST (기준일 형식 오류) / NOT_FOUND (법령·버전 없음)
 */
export async function getApplicableLaw(
  lawNameInput: string,
  articleNoInput: string,
  baseDateInput: string
): Promise<ApplicableLawResult> {
  const baseDate = normalizeYmd(baseDateInput);
  if (!baseDate) {
    throw new LawApiError(
      `기준일 형식이 올바르지 않습니다: ${baseDateInput} (YYYYMMDD 또는 YYYY-MM-DD)`,
      "BAD_REQUEST"
    );
  }
  const articleNo = normalizeArticleNo(articleNoInput);

  const { lawName, versions } = await fetchLawVersions(lawNameInput);
  if (versions.length === 0) {
    throw new LawApiError(`법령 연혁을 찾을 수 없습니다: ${lawNameInput}`, "NOT_FOUND");
  }

  const applicable = selectApplicableVersion(versions, baseDate);
  if (!applicable) {
    const oldest = versions[versions.length - 1];
    throw new LawApiError(
      `기준일 ${baseDate}에 시행 중인 ${lawName} 버전이 없습니다 (최초 시행일 ${oldest?.efYd ?? "불명"} — 제정 전).`,
      "NOT_FOUND"
    );
  }

  const today = todayYmd();
  const current = selectApplicableVersion(versions, today);
  const isCurrentVersion =
    current != null && applicable.mst === current.mst && applicable.efYd === current.efYd;
  const laterVersions = selectLaterVersions(versions, baseDate, today);

  // 기준일 시점 조문 본문
  const article = await fetchEflawArticle(applicable.mst, applicable.efYd, articleNo);

  // 현행 본문 비교 (적용 버전 ≠ 현행일 때만 1회 추가 조회. 실패해도 전체는 진행)
  let sameAsCurrentText: boolean | null = isCurrentVersion ? true : null;
  if (!isCurrentVersion && current && article) {
    try {
      const currentArticle = await fetchEflawArticle(current.mst, current.efYd, articleNo);
      sameAsCurrentText = currentArticle
        ? isSameArticleText(article.fullText, currentArticle.fullText)
        : null;
    } catch {
      sameAsCurrentText = null;
    }
  }

  // 부칙 발췌 — 적용 버전 + 이후 개정의 공포번호만. 실패해도 graceful.
  let transitionExcerpts: TransitionExcerpt[] = [];
  if (current) {
    try {
      const addenda = await fetchAddendaUnits(current.mst);
      const relevant = new Set<string>([
        normalizeAncNo(applicable.ancNo),
        ...laterVersions.map((v) => normalizeAncNo(v.ancNo)),
      ]);
      transitionExcerpts = extractTransitionExcerpts(addenda, relevant, articleNo);
    } catch {
      transitionExcerpts = [];
    }
  }

  return {
    lawName,
    articleNo,
    baseDate,
    version: applicable,
    article,
    currentVersion: current,
    isCurrentVersion,
    sameAsCurrentText,
    laterVersions,
    transitionExcerpts,
    sourceUrl: buildLawSourceUrl(lawName, articleNo),
  };
}
