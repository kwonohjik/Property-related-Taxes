/**
 * 법령 조문 자동 검증 엔진
 *
 * legal-codes.ts의 각 상수에 대해:
 * 1. 조문 문자열을 파싱 (citation-parser.ts)
 * 2. 법제처 API로 실제 조문 취득 (korean-law-client.ts)
 * 3. 예상 키워드가 조문 본문에 포함되는지 검사
 *
 * 검증 규칙은 VERIFICATION_MANIFEST 배열에 선언적으로 정의한다.
 */

import { parseCitation } from "./citation-parser";
import { searchLaw, fetchArticle } from "./korean-law-client";
import { VERIFICATION_MANIFEST, type VerificationRule } from "./verifier-manifest";

// 규칙 타입·매니페스트는 client-safe한 verifier-manifest.ts에 정의되어 있다.
// 기존 import 사이트(route.ts 등) 호환을 위해 re-export 한다.
export { VERIFICATION_MANIFEST, type VerificationRule };

// ── 검증 규칙 타입 ─────────────────────────────────────────────────────────

export interface VerificationResult {
  rule: VerificationRule;
  status: "PASS" | "FAIL" | "ERROR";
  /** 실패한 키워드 목록 */
  failedKeywords?: string[];
  /** 의도치 않게 발견된 금지 키워드 */
  foundForbiddenKeywords?: string[];
  /** 조회된 조문 제목 */
  articleTitle?: string;
  /** 오류 메시지 */
  error?: string;
}

// ── 메인 검증 함수 ─────────────────────────────────────────────────────────

export async function verifyRule(rule: VerificationRule): Promise<VerificationResult> {
  const parsed = parseCitation(rule.citation);
  if (!parsed) {
    return {
      rule,
      status: "ERROR",
      error: `조문 파싱 실패: "${rule.citation}"`,
    };
  }

  // 법령 MST 검색
  const lawInfo = await searchLaw(parsed.lawFullName).catch(() => null);
  if (!lawInfo) {
    return {
      rule,
      status: "ERROR",
      error: `법령 검색 실패: "${parsed.lawFullName}"`,
    };
  }

  // 조문 전문 조회
  const article = await fetchArticle(lawInfo.mst, lawInfo.lawName, parsed.articleNo).catch(() => null);
  if (!article || !article.fullText) {
    return {
      rule,
      status: "ERROR",
      error: `조문 조회 실패: ${parsed.lawFullName} ${parsed.articleNo}`,
    };
  }

  const text = article.fullText;
  const mode = rule.keywordMode ?? "ALL";

  // 필수 키워드 확인
  const failedKeywords = mode === "ALL"
    ? rule.keywords.filter((kw) => !text.includes(kw))
    : rule.keywords.every((kw) => !text.includes(kw))
      ? [...rule.keywords]
      : [];

  // 금지 키워드 확인
  const foundForbiddenKeywords = (rule.forbiddenKeywords ?? []).filter(
    (kw) => text.includes(kw)
  );

  const passed = failedKeywords.length === 0 && foundForbiddenKeywords.length === 0;

  return {
    rule,
    status: passed ? "PASS" : "FAIL",
    failedKeywords: failedKeywords.length > 0 ? failedKeywords : undefined,
    foundForbiddenKeywords: foundForbiddenKeywords.length > 0 ? foundForbiddenKeywords : undefined,
    articleTitle: article.title,
  };
}

/** 모든 규칙 일괄 검증 (concurrency 제한 포함) */
export async function verifyAll(
  rules: VerificationRule[] = VERIFICATION_MANIFEST,
  { concurrency = 3, onProgress }: { concurrency?: number; onProgress?: (r: VerificationResult) => void } = {}
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (let i = 0; i < rules.length; i += concurrency) {
    const batch = rules.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((r) => verifyRule(r)));
    batchResults.forEach((r) => {
      results.push(r);
      onProgress?.(r);
    });
  }
  return results;
}
