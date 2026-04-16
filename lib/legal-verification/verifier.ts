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

// ── 검증 규칙 타입 ─────────────────────────────────────────────────────────

export interface VerificationRule {
  /** legal-codes.ts 내 상수 경로 (가독성용) */
  id: string;
  /** 상수가 담고 있는 법령 인용 문자열 */
  citation: string;
  /**
   * 조문 본문에 반드시 포함되어야 할 키워드 목록.
   * ALL 모드(기본): 모두 포함돼야 통과.
   * ANY 모드: 하나라도 포함되면 통과.
   */
  keywords: string[];
  keywordMode?: "ALL" | "ANY";
  /** 조문 본문에 없어야 할 키워드 (삭제 확인 등) */
  forbiddenKeywords?: string[];
}

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

// ── 검증 규칙 매니페스트 ──────────────────────────────────────────────────
// legal-codes.ts의 상수값 변경 시 이 목록도 함께 업데이트한다.

export const VERIFICATION_MANIFEST: VerificationRule[] = [
  // ── 양도소득세 ────────────────────────────────────────────────────
  {
    id: "TRANSFER.ONE_HOUSE_EXEMPT",
    citation: "소득세법 §89 ①",
    keywords: ["1세대", "1주택", "비과세", "12억원"],
  },
  {
    id: "TRANSFER.LONG_TERM_DEDUCTION",
    citation: "소득세법 §95 ②",
    keywords: ["장기보유", "공제액", "보유기간", "공제율"],
  },
  {
    id: "TRANSFER.BASIC_DEDUCTION",
    citation: "소득세법 §103",
    keywords: ["기본공제", "250만원"],
  },
  {
    id: "TRANSFER.TAX_RATE",
    citation: "소득세법 §104 ①",
    keywords: ["세율", "양도소득"],
  },
  {
    id: "TRANSFER.SURCHARGE",
    citation: "소득세법 §104 ⑦",
    keywords: ["조정대상지역", "2주택", "100분의 20"],
  },
  {
    id: "TRANSFER.UNREGISTERED_SURCHARGE",
    citation: "소득세법 §104 ①10호",
    keywords: ["미등기양도자산", "100분의 70"],
  },

  // ── 비사업용 토지 ──────────────────────────────────────────────────
  {
    id: "NBL.MAIN",
    citation: "소득세법 §104조의3",
    keywords: ["비사업용 토지", "농지", "임야"],
  },

  // ── 상속세 ────────────────────────────────────────────────────────
  {
    id: "INH.BASIC_DEDUCTION",
    citation: "상증법 §18",
    keywords: ["2억원"],
  },
  {
    id: "INH.FARMING_DEDUCTION",
    citation: "상증법 §18의3",
    keywords: ["영농", "30억원"],
    forbiddenKeywords: ["가업"],
  },
  {
    id: "INH.FAMILY_BUSINESS_DEDUCTION",
    citation: "상증법 §18의2",
    keywords: ["가업", "600억"],
    forbiddenKeywords: ["영농"],
  },
  {
    id: "INH.SPOUSE_DEDUCTION",
    citation: "상증법 §19",
    keywords: ["배우자", "30억원", "5억원"],
  },
  {
    id: "INH.LUMP_SUM",
    citation: "상증법 §21",
    keywords: ["5억원"],
  },
  {
    id: "INH.FINANCIAL_DEDUCTION",
    citation: "상증법 §22",
    keywords: ["금융재산", "2억원"],
  },
  {
    id: "INH.COHABIT_DEDUCTION",
    citation: "상증법 §23의2",
    keywords: ["동거주택"],
  },
  {
    id: "INH.TAX_RATE",
    citation: "상증법 §26",
    keywords: ["상속세", "세율"],
  },
  {
    id: "INH.GENERATION_SKIP",
    citation: "상증법 §27",
    keywords: ["세대를 건너", "100분의 30"],
  },

  // ── 증여세 ────────────────────────────────────────────────────────
  {
    id: "GIFT.GIFT_DEDUCTION",
    citation: "상증법 §53",
    keywords: ["배우자", "6억원", "5천만원", "직계존속"],
  },
  {
    id: "GIFT.MARRIAGE_DEDUCTION",
    citation: "상증법 §53의2",
    keywords: ["혼인", "출산", "1억원"],
  },
  {
    id: "GIFT.GENERATION_SKIP",
    citation: "상증법 §57",
    keywords: ["직계비속", "100분의 30"],
  },

  // ── 종합부동산세 ───────────────────────────────────────────────────
  {
    id: "COMPREHENSIVE.BASIC_DEDUCTION_ONE_HOUSE",
    citation: "종합부동산세법 제8조제1항 제1호 (12억)",
    keywords: ["1세대 1주택자", "12억원"],
  },
  {
    id: "COMPREHENSIVE.BASIC_DEDUCTION_GENERAL",
    citation: "종합부동산세법 제8조제1항 제3호 (9억)",
    keywords: ["9억원"],
  },
  {
    id: "COMPREHENSIVE.TAX_RATE",
    citation: "종합부동산세법 §9①",
    keywords: ["세율", "주택", "2주택 이하"],
  },
  {
    id: "COMPREHENSIVE.ONE_HOUSE_SENIOR_CREDIT",
    citation: "종합부동산세법 §9⑥",
    keywords: ["60세", "공제율", "1세대 1주택자"],
  },
  {
    id: "COMPREHENSIVE.ONE_HOUSE_LONG_TERM_CREDIT",
    citation: "종합부동산세법 §9⑧",
    keywords: ["5년 이상", "공제율", "1세대 1주택자"],
  },
  {
    id: "COMPREHENSIVE.TAX_CAP_GENERAL",
    citation: "종합부동산세법 제10조 (150%)",
    keywords: ["100분의 150"],
    forbiddenKeywords: ["100분의 300"],
  },

  // ── 재산세 ────────────────────────────────────────────────────────
  {
    id: "PROPERTY.TAX_RATE",
    citation: "지방세법 §111",
    keywords: ["재산세", "표준세율"],
  },
  {
    id: "PROPERTY.ONE_HOUSE_SPECIAL",
    citation: "지방세법 §111의2",
    keywords: ["1세대 1주택", "9억원"],
  },
  {
    id: "PROPERTY.BUILDING_LUXURY_RATE",
    citation: "지방세법 §111①2호 가목",
    keywords: ["골프장", "고급오락장", "1천분의 40"],
  },
  {
    id: "PROPERTY.BUILDING_FACTORY_RATE",
    citation: "지방세법 §111①2호 나목",
    keywords: ["공장", "1천분의 5"],
  },
  {
    id: "PROPERTY.BUILDING_GENERAL_RATE",
    citation: "지방세법 §111①2호 다목",
    keywords: ["1천분의 2.5"],
  },
  {
    id: "PROPERTY.TAX_CAP",
    citation: "지방세법 §122",
    keywords: ["세 부담", "100분의 150"],  // 조문: "세 부담의 상한" (띄어쓰기)
  },

  // ── 취득세 ────────────────────────────────────────────────────────
  {
    id: "ACQUISITION.BASIC_RATE",
    citation: "지방세법 §11",
    keywords: ["취득세", "표준세율"],
  },
  {
    id: "ACQUISITION.SURCHARGE",
    citation: "지방세법 §13",
    keywords: ["중과기준세율"],
  },
  {
    id: "ACQUISITION.CORP_SURCHARGE",
    citation: "지방세법 §13의2",
    keywords: ["법인", "주택", "중과"],
  },
  {
    id: "ACQUISITION.FIRST_HOME_REDUCTION",
    citation: "지방세특례제한법 §36의3",
    keywords: ["생애최초", "12억원", "취득"],
  },
];

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
