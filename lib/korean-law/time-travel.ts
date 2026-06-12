/**
 * 두 시점 신구대조 (time_travel) — 조문을 두 시점 시행본 기준으로 라인 diff.
 *
 * upstream: chrisryugj/korean-law-mcp v4.0 시점 비교 기능.
 * Phase A(applicable-law.ts)의 fetchLawVersions·selectApplicableVersion·
 * fetchEflawArticle 을 그대로 재사용 — 버전 식별·본문 조회 로직 단일 진실.
 *
 * 라인 diff는 표준 LCS(최장공통부분수열) 기반 — 짧은 조문 본문에 충분히 빠름.
 */

import {
  fetchEflawArticle,
  fetchLawVersions,
  normalizeYmd,
  selectApplicableVersion,
} from "./applicable-law";
import { LawApiError } from "./client-core";
import { normalizeArticleNo } from "./client-law";
import type { ArticleDiff, ArticleSnapshot, DiffLine, LawVersionEntry } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 1. 순수 함수 — LCS 라인 diff
// ────────────────────────────────────────────────────────────────────────────

/**
 * 두 라인 배열의 LCS 기반 diff.
 * before에만 있으면 remove, after에만 있으면 add, 공통은 keep.
 * 표준 동적계획법 — 조문 본문(수십 줄)에 충분.
 */
export function diffLines(beforeText: string, afterText: string): DiffLine[] {
  const a = splitLines(beforeText);
  const b = splitLines(afterText);
  const n = a.length;
  const m = b.length;

  // LCS 길이 테이블
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "keep", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "remove", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "remove", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** diff에 변경(add/remove)이 하나라도 있는지 */
export function hasChanges(diff: DiffLine[]): boolean {
  return diff.some((d) => d.kind !== "keep");
}

// ────────────────────────────────────────────────────────────────────────────
// 2. 오케스트레이션
// ────────────────────────────────────────────────────────────────────────────

async function snapshotAt(
  versions: LawVersionEntry[],
  ymd: string,
  articleNo: string
): Promise<ArticleSnapshot | null> {
  const version = selectApplicableVersion(versions, ymd);
  if (!version) return null;
  const article = await fetchEflawArticle(version.mst, version.efYd, articleNo);
  if (!article) return null;
  return { version, title: article.title, fullText: article.fullText };
}

/**
 * 조문을 두 시점(dateA=과거, dateB=최신) 시행본으로 비교.
 * dateA > dateB 면 자동 교환(항상 과거 → 최신).
 */
export async function compareArticleVersions(
  lawNameInput: string,
  articleNoInput: string,
  dateAInput: string,
  dateBInput: string
): Promise<ArticleDiff> {
  const ymdA = normalizeYmd(dateAInput);
  const ymdB = normalizeYmd(dateBInput);
  if (!ymdA || !ymdB) {
    throw new LawApiError("비교 시점 형식이 올바르지 않습니다 (YYYYMMDD).", "BAD_REQUEST");
  }
  const [past, recent] = ymdA <= ymdB ? [ymdA, ymdB] : [ymdB, ymdA];
  const articleNo = normalizeArticleNo(articleNoInput);

  const { lawName, versions } = await fetchLawVersions(lawNameInput);
  if (versions.length === 0) {
    throw new LawApiError(`법령 연혁을 찾을 수 없습니다: ${lawNameInput}`, "NOT_FOUND");
  }

  const [before, after] = await Promise.all([
    snapshotAt(versions, past, articleNo),
    snapshotAt(versions, recent, articleNo),
  ]);

  const diff =
    before && after ? diffLines(before.fullText, after.fullText) : [];
  const identical = Boolean(before && after && !hasChanges(diff));

  return { lawName, articleNo, before, after, diff, identical };
}

/** 최근 개정 신구대조에서 거슬러 올라갈 최대 버전 수 (API 호출 상한) */
const MAX_AMENDMENT_LOOKBACK = 8;

/**
 * 최근 개정 신구대조 — 현행과, **이 조문이 실제로 달랐던 가장 최근 시행본**을 비교.
 *
 * 최신 개정이 해당 조문을 건드리지 않은 경우가 많아(예: 소득세법 §89), 단순히
 * "현행 vs 직전"을 보면 "동일"만 나온다. 인접 버전쌍을 거슬러 올라가며 본문이
 * 바뀐 첫 지점(=이 조문의 최근 실질 개정)을 찾는다. 지연 fetch + 상한으로 호출 제어.
 *
 * 버전이 1개뿐(개정 이력 없음)이면 null.
 */
export async function compareLatestAmendment(
  lawNameInput: string,
  articleNoInput: string
): Promise<ArticleDiff | null> {
  const articleNo = normalizeArticleNo(articleNoInput);
  const { lawName, versions } = await fetchLawVersions(lawNameInput);

  // 오늘 이하 시행 버전만 (시행예정 제외), 시행일 내림차순.
  // 단계시행으로 같은 MST가 여러 efYd로 중복 → 조문 본문은 MST당 고정이므로
  // distinct MST로 축약(첫 출현=최신 efYd)해 실제 개정 단위로 거슬러 올라간다.
  const today = todayYmdLocal();
  const seenMst = new Set<string>();
  const enacted = versions
    .filter((v) => v.efYd <= today)
    .filter((v) => {
      if (seenMst.has(v.mst)) return false;
      seenMst.add(v.mst);
      return true;
    });
  if (enacted.length < 2) return null;

  const limit = Math.min(enacted.length, MAX_AMENDMENT_LOOKBACK);
  const snaps: (ArticleSnapshot | null)[] = [];
  snaps[0] = await snapAt(enacted[0], articleNo);

  for (let i = 1; i < limit; i++) {
    snaps[i] = await snapAt(enacted[i], articleNo);
    // 인접쌍 (newer=snaps[i-1], older=snaps[i]) 본문이 다르면 그 지점이 최근 실질 개정.
    if (textOf(snaps[i]) !== textOf(snaps[i - 1])) {
      return buildDiff(lawName, articleNo, snaps[i], snaps[i - 1]);
    }
  }

  // 상한 내 변경 없음 → 현행과 가장 오래된 조회분 비교(대개 동일).
  return buildDiff(lawName, articleNo, snaps[limit - 1] ?? null, snaps[0]);
}

async function snapAt(version: LawVersionEntry, articleNo: string): Promise<ArticleSnapshot | null> {
  const a = await fetchEflawArticle(version.mst, version.efYd, articleNo);
  return a ? { version, title: a.title, fullText: a.fullText } : null;
}

function textOf(snap: ArticleSnapshot | null): string {
  return snap ? snap.fullText.replace(/\s+/g, " ").trim() : "";
}

function buildDiff(
  lawName: string,
  articleNo: string,
  before: ArticleSnapshot | null,
  after: ArticleSnapshot | null
): ArticleDiff {
  const diff = before && after ? diffLines(before.fullText, after.fullText) : [];
  return {
    lawName,
    articleNo,
    before,
    after,
    diff,
    identical: Boolean(before && after && !hasChanges(diff)),
  };
}

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 자연어/혼합 쿼리에서 "법령명 + 조문번호" 추출 (amendment_track 체인용).
 * "소득세법 89조 개정" / "소득세법 제89조 신구대조" → { lawName, articleNo }.
 * 조문번호가 없으면 null (diff 불가 → 체인은 타임라인만).
 */
export function extractLawAndArticle(
  query: string
): { lawName: string; articleNo: string } | null {
  const m = query.match(/([가-힣·\s]{1,28}?(?:법률|법|시행령|시행규칙|령|규칙|조례|규정))\s*제?\s*(\d{1,4})\s*조(?:\s*의\s*(\d+))?/);
  if (!m) return null;
  const lawName = m[1].trim();
  const articleNo = m[3] ? `제${m[2]}조의${m[3]}` : `제${m[2]}조`;
  return { lawName, articleNo };
}
