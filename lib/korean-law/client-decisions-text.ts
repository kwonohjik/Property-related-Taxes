/**
 * 판례·결정례 본문 조회 (getDecisionText)
 */

import {
  fetchJson,
  readCache,
  writeCache,
} from "./client-core";
import { buildDecisionSourceUrl } from "./client-law";
import { DOMAIN_RESPONSE_KEY } from "./client-decisions-search";
import {
  compactBody,
  densifyLawRefs,
  densifyPrecedentRefs,
  stripRepeatedSummary,
  cleanHtml,
} from "./compact";
import { parseLawRefs, parsePrecedentRefs } from "./parsers/ref-parser";
import type { DecisionDomain, DecisionText } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 법제처 상세 응답 내부 타입
// ────────────────────────────────────────────────────────────────────────────

interface GenericDecisionDetail {
  판시사항?: string;
  판결요지?: string;
  주문?: string;
  이유?: string;
  판례내용?: string;
  판결본문?: string;
  결정문?: string;
  전문?: string;
  본문?: string;
  내용?: string;
  사건명?: string;
  제목?: string;
  안건명?: string;
  행정규칙명?: string;
  자치법규명?: string;
  사건번호?: string;
  결정번호?: string;
  안건번호?: string;
  법원명?: string;
  기관명?: string;
  결정기관?: string;
  회신기관명?: string;
  질의기관명?: string;
  소관부처명?: string;
  선고일자?: string;
  결정일?: string;
  판결일?: string;
  회신일자?: string;
  시행일자?: string;
  참조조문?: string;
  참조판례?: string;
  사건종류명?: string;
  판결유형?: string;
  데이터출처명?: string;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// 판례·결정례 본문 조회
// ────────────────────────────────────────────────────────────────────────────

export async function getDecisionText(
  id: string,
  domain: DecisionDomain = "prec",
  options: { full?: boolean } = {}
): Promise<DecisionText | null> {
  const full = options.full ?? false;
  // v2: 구조화 필드 추가로 캐시 포맷 변경
  const cacheKey = `decision_text_${domain}_${id}_${full ? "full" : "comp"}_v2`;
  const cached = await readCache<DecisionText>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<Record<string, unknown>>("lawService.do", {
    target: domain,
    ID: id,
  });

  // 법제처 업스트림 에러 감지
  const lawMsg = typeof data.Law === "string" ? data.Law : null;
  if (lawMsg && /일치하는.*없|확인하여 주십시오/.test(lawMsg)) {
    return {
      id,
      domain,
      caseNo: "",
      title: "(본문 제공 불가)",
      holdings: "",
      reasoning:
        "법제처 Open API가 이 결정의 본문을 JSON으로 제공하지 않습니다. " +
        "대부분 '국세법령정보시스템'·하급심 출처 판례가 해당되며, 아래 법제처 원문 링크에서 직접 확인할 수 있습니다.",
      court: "",
      date: "",
      sourceUrl: buildDecisionSourceUrl(domain, id),
    };
  }

  // 루트 컨테이너 탐색: Service → Search → 최상위 → 도메인 리스트 첫 원소
  const rootSearch = DOMAIN_RESPONSE_KEY[domain].root;
  const rootService = rootSearch.replace("Search", "Service");
  const list = DOMAIN_RESPONSE_KEY[domain].list;
  const candidates = [
    data[rootService],
    data[rootService.toLowerCase()],
    data[rootSearch],
    data[rootSearch.toLowerCase()],
    Array.isArray(data[list]) ? (data[list] as unknown[])[0] : data[list],
    data,
  ];
  const container = candidates.find(
    (c) => c && typeof c === "object" && !Array.isArray(c)
  ) as GenericDecisionDetail | undefined;

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[korean-law] getDecisionText(${domain}, ${id}) — 응답 최상위 키:`,
      Object.keys(data),
      container ? `container 키: ${Object.keys(container).slice(0, 15).join(", ")}` : "container 없음"
    );
  }

  if (!container) return null;

  const holdingsRaw = container.판시사항 ?? "";
  const summaryRaw = container.판결요지 ?? "";
  const holdRulingRaw = container.주문 ?? "";
  const reasoningRaw =
    container.이유 ??
    container.판례내용 ??
    container.판결본문 ??
    container.결정문 ??
    container.전문 ??
    container.본문 ??
    container.내용 ??
    "";

  const holdings = cleanHtml(holdingsRaw);
  const summary = cleanHtml(summaryRaw);
  const ruling = cleanHtml(holdRulingRaw);

  let reasoning = stripRepeatedSummary(cleanHtml(reasoningRaw), [holdings, summary, ruling]);
  const beforeCompact = reasoning.length;
  reasoning = compactBody(reasoning, { full });
  const compacted = beforeCompact > 0 && reasoning.length < beforeCompact;

  if (!holdings && !summary && !reasoning) {
    const longest = findLongestString(container);
    if (longest) {
      reasoning = cleanHtml(longest);
    }
  }

  const refLawsRaw = container.참조조문 ?? "";
  const refPrecRaw = container.참조판례 ?? "";

  const refLawsCleaned = refLawsRaw ? cleanHtml(refLawsRaw) : "";
  const refPrecCleaned = refPrecRaw ? cleanHtml(refPrecRaw) : "";
  const refLawsStructured = refLawsCleaned ? parseLawRefs(refLawsCleaned) : undefined;
  const refPrecedentsStructured = refPrecCleaned ? parsePrecedentRefs(refPrecCleaned) : undefined;
  const hasStructuredLaws = !!refLawsStructured && refLawsStructured.length > 0;
  const hasStructuredPrec = !!refPrecedentsStructured && refPrecedentsStructured.length > 0;

  const result: DecisionText = {
    id,
    domain,
    caseNo: container.사건번호 ?? container.결정번호 ?? container.안건번호 ?? "",
    title: cleanHtml(
      container.사건명 ??
        container.제목 ??
        container.안건명 ??
        container.행정규칙명 ??
        container.자치법규명 ??
        "(제목 없음)"
    ),
    holdings,
    summary: summary || undefined,
    ruling: ruling || undefined,
    reasoning,
    refLaws:
      hasStructuredLaws
        ? undefined
        : refLawsCleaned
          ? densifyLawRefs(refLawsCleaned)
          : undefined,
    refPrecedents:
      hasStructuredPrec
        ? undefined
        : refPrecCleaned
          ? densifyPrecedentRefs(refPrecCleaned)
          : undefined,
    refLawsStructured: hasStructuredLaws ? refLawsStructured : undefined,
    refPrecedentsStructured: hasStructuredPrec ? refPrecedentsStructured : undefined,
    caseType: container.사건종류명 || undefined,
    judgmentType: container.판결유형 || undefined,
    court:
      container.법원명 ??
      container.기관명 ??
      container.결정기관 ??
      container.회신기관명 ??
      container.질의기관명 ??
      container.소관부처명 ??
      "",
    date:
      container.선고일자 ??
      container.결정일 ??
      container.판결일 ??
      container.회신일자 ??
      container.시행일자 ??
      "",
    sourceUrl: buildDecisionSourceUrl(domain, id),
    compacted,
  };

  const hasAnyContent =
    result.holdings || result.summary || result.reasoning || result.caseNo || result.title !== "(제목 없음)";
  if (!hasAnyContent) return null;

  if (!result.holdings && !result.summary && !result.reasoning) {
    result.reasoning = "본문이 제공되지 않는 결정입니다. 아래 법제처 원문 링크에서 확인하세요.";
  }

  await writeCache(cacheKey, result);
  return result;
}

/** 객체의 모든 문자열 필드 중 가장 긴 값을 찾는다. */
function findLongestString(obj: Record<string, unknown>): string | null {
  let longest = "";
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.length > longest.length) {
      longest = value;
    }
  }
  return longest.length >= 20 ? longest : null;
}
