/**
 * 종부령 §3①6호 미분양매입임대주택 판정 입력 — `RentalExclusionInput`이 확장한다(800줄 정책으로 분리).
 * 판정: `lib/tax-engine/comprehensive-exclusion-6ho.ts`. 없는 값은 「모름」=혜택 불성립 + 확인 필요.
 * 가목 단서 1)~3)의 등록 신청일·아파트·변경신고는 8호 나목 사실(`RentalExclusion8NaFacts`)을 그대로 쓴다.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-6ho-unsold-purchase.plan.md
 */
export interface RentalExclusion6hoFacts {
  /** 6호 본문 괄호 — 최초로 분양계약을 체결하고 계약금을 납부한 날(2008.6.11.~2009.6.30.이어야 한다) */
  unsoldContractDate?: Date;
  /** 6호 본문 괄호 — 「주택법」 §54 사업주체가 2008.6.10.까지 분양계약이 안 돼 선착순으로 공급한 미분양주택 — null/undefined=모름 */
  isUnsoldFirstComeSupply?: boolean | null;
  /** 6호 라목 — 신고와 함께 미분양주택 확인서 사본·매매계약서 사본 제출 — null/undefined=모름 */
  unsoldDocsSubmitted?: boolean | null;
  /** 6호 후단 — 같은 특별시·광역시·도(§3⑤)의 미분양매입임대주택 호수(이 주택 포함) */
  unsoldUnitCount?: number;
  /** 6호 후단 — 2호 매입임대주택 호수 */
  purchaseRental2hoCount?: number;
  /** 6호 후단 — 같은 특별시·광역시·도의 3호(2005.1.5. 이전부터 임대) 임대주택 호수 */
  existingRental3hoSameRegionCount?: number;
  /** 6호 후단 — 5호(부동산투자회사 등 2008년 취득) 임대주택 호수 */
  reitRental5hoCount?: number;
  /**
   * 가목 단서 1)~3) — 종전 「민간임대주택에 관한 특별법」상 등록 종류.
   * short_term=§2조6호 단기 · long_term_general=§2조5호 장기일반 · public_support=§2조4호 공공지원 ·
   * other=그 밖(구 임대주택법 매입임대 등 — 단서 해당 없음). undefined=모름.
   */
  rentalRegistrationKind?: "short_term" | "long_term_general" | "public_support" | "other";
}
