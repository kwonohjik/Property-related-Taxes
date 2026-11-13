/**
 * 종부령 §3①4호(미임대 민간건설임대)·5호(부동산투자회사 2008 취득 매입임대)·9호(분양전환공공임대 임대의무기간 만료 후) 판정 입력.
 * `RentalExclusionInput`이 확장한다(800줄 정책으로 분리). 판정: `comprehensive-exclusion-{4,5,9}ho.ts`.
 * 없는 값은 「모름」=혜택 불성립 + 확인 필요. 4호 사용승인일은 공통 `usageApprovalDate`, 5호 호수는 6호와 같은 `reitRental5hoCount`.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-4-5-9ho-types.plan.md
 */
export interface RentalExclusion459hoFacts {
  /** 4호 다목 — 사용승인(사용검사필증)일부터 과세기준일까지 임대된 사실이 없음. null/undefined=모름 */
  neverRentedSinceApproval?: boolean | null;
  /** 5호 본문 — 부동산투자회사(부동산간접투자기구)가 취득한 날(2008.1.1.~12.31.이어야 한다) */
  reitAcquisitionDate?: Date;
  /** 5호 가목 — 2008년도 과세기준일 공시가격이 6억원 이하. null/undefined=모름 */
  reitPrice2008Under6eok?: boolean | null;
  /** 9호 — 「제1호에 해당하는 공공건설임대주택」(construction) 또는 「제2호에 해당하는 공공매입임대주택」(purchase). undefined=모름 */
  conversionBase?: "construction" | "purchase";
  /** 9호 — 공공주택 특별법 시행령 §2①5호 분양전환공공임대주택. null/undefined=모름 */
  isConversionPublicRental?: boolean | null;
  /** 9호 — 공공주택 특별법 시행령 §54 임대의무기간 만료일 */
  mandatoryPeriodEndDate?: Date;
  /** 9호 — 분양전환이 이루어졌음. null/undefined=모름 */
  conversionCompleted?: boolean | null;
}
