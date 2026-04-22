/**
 * 한국 법령·판례 리서치 클라이언트 — 단일 진입점 배럴
 *
 * 외부 import는 모두 "@/lib/korean-law/client" 로 유지.
 * 구현은 client-core / client-law / client-decisions-* / client-annexes 로 분리.
 */

export type { LawApiErrorCode } from "./client-core";
export { LawApiError } from "./client-core";

export type { LawSearchSort } from "./client-law";
export {
  searchLaw,
  searchLawMany,
  getLawText,
  buildLawSourceUrl,
  buildDecisionSourceUrl,
  normalizeArticleNo,
} from "./client-law";

export type { DomainSearchOptions } from "./client-decisions-search";
export { searchDecisions } from "./client-decisions-search";

export { getDecisionText } from "./client-decisions-text";

export { getAnnexes } from "./client-annexes";

export { resolveLawAlias, isAlias } from "./aliases";
export type {
  LawSearchItem,
  LawArticleResult,
  DecisionSearchItem,
  DecisionText,
  DecisionDomain,
  AnnexItem,
} from "./types";
