/**
 * 법령 인용 환각 감지 (verify_citations)
 *
 * chrisryugj/korean-law-mcp src/tools/verify-citations.ts 의 핵심 로직을 이식.
 * LLM이 생성한 "소득세법 제104조 제7항 제2호" 류의 인용을 법제처 API에 실제로
 * 병렬 조회해 3분류(✓ 실존 / ✗ NOT_FOUND(환각) / ⚠ API 실패) 하고, 환각 탐지
 * 시 [HALLUCINATION_DETECTED] 헤더와 isError 플래그를 반환한다.
 *
 * 사용처:
 *  - app/api/law/verify-citations  — 독립 API
 *  - chains.ts:documentReview       — 기존 체인 위임
 *
 * 핵심 차별점:
 *  - 인용 앞 30자 역추적 + 20+ stopword 접두사 제거로 법령명 회복
 *  - dedup key = `${lawName}::${articleNo}::${hang}::${ho}`
 *  - hang 지정 시 parseHangNumber 원숫자 매칭으로 실제 해당 항 존재 여부 검증
 *  - Promise.all 병렬 + rate limit 의식 (max 20건)
 */

import { getLawText, searchLaw } from "./client";
import { resolveLawAlias } from "./aliases";
import { parseHangNumber } from "./article-parser";
import { parseCitation } from "@/lib/legal-verification/citation-parser";

// ────────────────────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────────────────────

export type CitationStatus = "verified" | "not_found" | "failed";

export interface VerifiedCitation {
  raw: string;
  status: CitationStatus;
  lawName?: string;
  articleNo?: string;
  hang?: number;
  ho?: number;
  /** ✗/⚠ 인 경우 사유 */
  reason?: string;
  /** 조문 출처 URL (✓ 일 때만) */
  sourceUrl?: string;
  /** 조문 제목 (✓ 일 때만) */
  title?: string;
}

export type VerifyHeader = "[VERIFIED]" | "[PARTIAL_VERIFIED]" | "[HALLUCINATION_DETECTED]";

export interface VerifyCitationsResult {
  header: VerifyHeader;
  /** 환각 1건 이상이면 true — UI는 경고 배너 */
  isError: boolean;
  totalCount: number;
  verifiedCount: number;
  hallucinationCount: number;
  failedCount: number;
  citations: VerifiedCitation[];
  /** 축약된 원문 (인용 부분만 하이라이트 가능하도록 위치 정보 포함) */
  summary: string;
}

export interface VerifyCitationsOptions {
  /** 한 요청에서 검증할 최대 인용 수 (기본 20) */
  maxCitations?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. 인용 추출
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법령명 회복 시 제거할 접두사 (stopword).
 * "또한 소득세법 제89조" → "소득세법 제89조"가 되도록.
 */
const STOPWORD_PREFIXES = [
  "또한", "따라서", "그러므로", "그리고", "해당", "이", "그", "위", "아래",
  "본", "동", "앞", "뒤", "같은", "한편", "다만", "즉", "예컨대", "즉시",
  "특히", "이때", "경우", "법률", "규정",
];

/**
 * 텍스트에서 법령 조문 인용 패턴 추출.
 *
 * 매칭 패턴: `법령명 제N조[의M][ 제P항][ 제Q호]`
 * 법령명은 인용 앞 30자를 역추적해서 `[가-힣]+(법|시행령|시행규칙|규칙|규정|조례)` 형태로 회복.
 */
export function extractCitations(text: string): Array<{
  raw: string;
  lawName: string;
  articleNo: string;
  hang?: number;
  ho?: number;
  /** dedup 키 */
  key: string;
}> {
  if (!text) return [];

  // 1차: 조문 패턴 전역 매칭
  const ARTICLE_RE = /제(\d+)조(?:의(\d+))?(?:\s*제(\d+)항)?(?:\s*제(\d+)호)?/g;
  const results: Array<{
    raw: string;
    lawName: string;
    articleNo: string;
    hang?: number;
    ho?: number;
    key: string;
  }> = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = ARTICLE_RE.exec(text)) !== null) {
    const [articleFull, main, sub, hang, ho] = match;
    const articleNo = sub ? `제${main}조의${sub}` : `제${main}조`;

    // 2차: 앞 30자에서 법령명 역추적
    const lookbackStart = Math.max(0, match.index - 30);
    const lookback = text.slice(lookbackStart, match.index);
    const lawName = recoverLawName(lookback);
    if (!lawName) continue; // 법령명 회복 실패는 skip (후속 LLM-safe)

    const hangNum = hang ? parseInt(hang, 10) : undefined;
    const hoNum = ho ? parseInt(ho, 10) : undefined;

    // raw: 법령명 + 조문 전체 (원문 위치 보존용)
    const raw = `${lawName} ${articleFull}`.trim();

    const key = `${lawName}::${articleNo}::${hangNum ?? ""}::${hoNum ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ raw, lawName, articleNo, hang: hangNum, ho: hoNum, key });
  }

  // 3차: parseCitation (기존 파서) — "§" 표기·"상증법 §18의2" 등 변형 커버
  //       위 ARTICLE_RE 는 "제N조" 만 잡으므로 §·약칭형은 보완 필요
  const SHORTHAND_RE = /[\uAC00-\uD7A3]+(?:법|령|규칙)\s*§\d+(?:의\d+)?[^\s,.)]*/g;
  const shorthandMatches = Array.from(text.match(SHORTHAND_RE) ?? []);
  for (const raw of shorthandMatches) {
    const parsed = parseCitation(raw);
    if (!parsed) continue;
    const hangNum = parsed.paragraph
      ? parseHangNumber(parsed.paragraph)
      : undefined;
    const hoNum = parsed.item ? parseInt(parsed.item, 10) : undefined;
    const key = `${parsed.lawFullName}::${parsed.articleNo}::${
      hangNum ?? ""
    }::${hoNum ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      raw,
      lawName: parsed.lawFullName,
      articleNo: parsed.articleNo,
      hang: Number.isFinite(hangNum) ? hangNum : undefined,
      ho: Number.isFinite(hoNum) ? hoNum : undefined,
      key,
    });
  }

  return results;
}

/**
 * 인용 조문 앞 30자에서 법령명을 역추적.
 * 패턴: `[한글]+(법|시행령|시행규칙|규칙|규정|조례)$` 매칭 후 stopword 접두사 제거.
 */
function recoverLawName(lookback: string): string | null {
  // "또한 소득세법" → "소득세법"
  // "민법"(2자) 포함 — 전체 2~30자 허용 (접두사 1자 이상 + 접미사)
  const LAW_NAME_RE = /([\uAC00-\uD7A3]{1,29}?(?:법률|법|시행령|시행규칙|규칙|규정|조례))\s*$/;
  const m = lookback.match(LAW_NAME_RE);
  if (!m) return null;
  let name = m[1];

  // stopword 제거 — 접두사 반복
  let changed = true;
  while (changed) {
    changed = false;
    for (const sw of STOPWORD_PREFIXES) {
      if (name.startsWith(sw) && name.length > sw.length + 1) {
        name = name.slice(sw.length).trim();
        changed = true;
        break;
      }
    }
  }

  // 너무 짧은 법령명은 오탐(예: "법", "령" 단독)
  if (name.length < 2) return null;
  return name;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. 단일 인용 검증
// ────────────────────────────────────────────────────────────────────────────

async function verifyOne(citation: {
  raw: string;
  lawName: string;
  articleNo: string;
  hang?: number;
  ho?: number;
}): Promise<VerifiedCitation> {
  const resolved = resolveLawAlias(citation.lawName);

  // 1) 법령 존재 확인
  let article;
  try {
    article = await getLawText(resolved, citation.articleNo);
  } catch (err) {
    return {
      raw: citation.raw,
      status: "failed",
      lawName: resolved,
      articleNo: citation.articleNo,
      reason: err instanceof Error ? err.message : "API 호출 실패",
    };
  }

  // 2) 조문이 없으면 환각
  if (!article) {
    // 법령 자체가 존재하는지 확인해 "법령 없음 vs 조문 없음" 구분
    let lawMeta = null;
    try {
      lawMeta = await searchLaw(resolved);
    } catch {
      // swallow
    }
    return {
      raw: citation.raw,
      status: "not_found",
      lawName: resolved,
      articleNo: citation.articleNo,
      hang: citation.hang,
      ho: citation.ho,
      reason: lawMeta
        ? `'${resolved}' 에는 ${citation.articleNo} 이(가) 존재하지 않습니다.`
        : `법령 '${resolved}' 을(를) 찾지 못했습니다.`,
    };
  }

  // 3) 항·호 검증 (지정된 경우만)
  if (citation.hang !== undefined) {
    const hangExists = verifyHangInBody(article.fullText, citation.hang);
    if (!hangExists) {
      return {
        raw: citation.raw,
        status: "not_found",
        lawName: resolved,
        articleNo: citation.articleNo,
        hang: citation.hang,
        ho: citation.ho,
        reason: `${citation.articleNo} 에 제${citation.hang}항이 존재하지 않습니다.`,
        sourceUrl: article.sourceUrl,
        title: article.title,
      };
    }

    if (citation.ho !== undefined) {
      const hoExists = verifyHoInBody(article.fullText, citation.hang, citation.ho);
      if (!hoExists) {
        return {
          raw: citation.raw,
          status: "not_found",
          lawName: resolved,
          articleNo: citation.articleNo,
          hang: citation.hang,
          ho: citation.ho,
          reason: `제${citation.hang}항에 제${citation.ho}호가 존재하지 않습니다.`,
          sourceUrl: article.sourceUrl,
          title: article.title,
        };
      }
    }
  }

  return {
    raw: citation.raw,
    status: "verified",
    lawName: resolved,
    articleNo: citation.articleNo,
    hang: citation.hang,
    ho: citation.ho,
    sourceUrl: article.sourceUrl,
    title: article.title,
  };
}

/**
 * 조문 본문에서 해당 항 번호 존재 여부 확인.
 * 원숫자(①②③) 또는 "제N항" 모두 수용.
 */
function verifyHangInBody(body: string, hang: number): boolean {
  if (!body || !Number.isFinite(hang)) return false;
  // 원숫자 매칭
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"[hang - 1];
  if (circled && body.includes(circled)) return true;
  // "제N항" 매칭
  if (new RegExp(`제${hang}항`).test(body)) return true;
  // 본문에 항 번호 없이 단일 문단인 경우(1개 항) — hang === 1 허용
  if (hang === 1 && !/[①-⑳]/.test(body)) return true;
  return false;
}

function verifyHoInBody(body: string, hang: number, ho: number): boolean {
  if (!body) return false;
  // 단순 체크: "N." 또는 "제N호" 패턴 존재
  // 정확한 항 내 호 범위 파싱은 복잡 — 현재는 본문 전체에서 호 존재 확인
  return new RegExp(`(?:^|[\\s\\n])${ho}\\.\\s|제${ho}호`).test(body);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 메인 API
// ────────────────────────────────────────────────────────────────────────────

/**
 * 텍스트 내 모든 법령 조문 인용을 병렬 검증.
 * - 최대 20건(기본) — rate limit 30/min 준수
 * - 결과 3분류 집계 → 헤더 마커 + isError
 */
export async function verifyCitations(
  text: string,
  options: VerifyCitationsOptions = {}
): Promise<VerifyCitationsResult> {
  const maxCitations = options.maxCitations ?? 20;
  const extracted = extractCitations(text);
  const truncated = extracted.slice(0, maxCitations);

  if (truncated.length === 0) {
    return {
      header: "[VERIFIED]",
      isError: false,
      totalCount: 0,
      verifiedCount: 0,
      hallucinationCount: 0,
      failedCount: 0,
      citations: [],
      summary: "텍스트에서 법령 조문 인용을 찾지 못했습니다. (예: '소득세법 제89조', '지방세법 제111조 제1항 제2호')",
    };
  }

  const citations = await Promise.all(truncated.map(verifyOne));

  const verifiedCount = citations.filter((c) => c.status === "verified").length;
  const hallucinationCount = citations.filter((c) => c.status === "not_found").length;
  const failedCount = citations.filter((c) => c.status === "failed").length;

  const header: VerifyHeader =
    hallucinationCount > 0
      ? "[HALLUCINATION_DETECTED]"
      : failedCount > 0
        ? "[PARTIAL_VERIFIED]"
        : "[VERIFIED]";

  const isError = hallucinationCount > 0;

  const truncatedNote =
    extracted.length > truncated.length
      ? ` (최대 ${maxCitations}건만 검증 — 전체 ${extracted.length}건 중 ${truncated.length}건 완료)`
      : "";

  const summary =
    `${header} ${verifiedCount}건 실존, ${hallucinationCount}건 환각, ${failedCount}건 확인 실패${truncatedNote}`;

  return {
    header,
    isError,
    totalCount: extracted.length,
    verifiedCount,
    hallucinationCount,
    failedCount,
    citations,
    summary,
  };
}
