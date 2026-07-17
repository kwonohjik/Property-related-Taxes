/**
 * 상속세·증여세 비과세 타입 (상증법 §11·§12·§46·§52의2)
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-21).
 * barrel: inheritance-gift.types.ts에서 re-export.
 */

import type { CalculationStep, HeirAllocation } from "./inheritance-gift.types";

/**
 * 체크리스트 기반 비과세 항목 (ExemptionChecklist 컴포넌트 출력)
 * exemption-evaluator.ts에도 동일 인터페이스 export됨 (하위 호환)
 */
export interface ExemptionCheckedItem {
  ruleId: string;
  /** 해당 항목의 자산 가액 또는 금액 */
  claimedAmount: number;
  /** 장애인 신탁(§52의2③): 생존 중 평생 합산 기사용 불산입액 (5억 한도에서 차감) */
  priorDisabledTrustUsed?: number;
  /**
   * 공익법인 특수관계법인 주식 초과분 금액 (§16 ②) — **수동 입력 fallback**.
   * 5%(성실공익법인 10%) 초과 보유 주식의 시가 — 이 금액은 과세됨.
   * publicInterestType + 주식수 필드 입력 시 자동계산(computeRelatedStockExcess)이 우선하며 본 필드는 무시됨.
   */
  excessStockAmount?: number;
  /** 공익법인 특수관계법인 주식 5% 초과 보유 여부 (§16 ②) — 수동 fallback */
  relatedStockExceeded?: boolean;

  // ===== §16② 특수관계법인 주식 한도 자동계산 입력 (갭5a — 자동계산 우선) =====
  /**
   * 공익법인 유형 — §16②2호 한도 비율 결정.
   *   general(본문 10%) · charity_no_voting(가목 20%, 의결권 미행사+자선·장학·사회복지)
   *   · mutual_investment_restricted(나목 5%, 상호출자제한 특수관계) · art48_11_unmet(다목 5%, §48⑪ 미충족)
   * 입력 시 아래 주식수 필드로 초과분 자동계산(computeRelatedStockExcess).
   */
  publicInterestType?:
    | "general"
    | "charity_no_voting"
    | "mutual_investment_restricted"
    | "art48_11_unmet";
  /** 출연 주식수 (§16② 한도 자동계산) */
  relatedStockDonatedShares?: number;
  /** 발행주식총수등 — 자기주식·자기출자지분 제외 (§16② 한도 분모) */
  relatedStockTotalShares?: number;
  /** §16②1호 합산 기보유분 주식수 (출연 당시 공익법인 보유분 등) */
  relatedStockPriorHeld?: number;
  /** 1주당 평가액 (원) — 초과 주식수 × 단가 = 과세 산입액 */
  relatedStockValuePerShare?: number;
  /** 혼인공제 기사용 여부 (§53의2 — 평생 1회) */
  marriageExemptionAlreadyUsed?: boolean;
  /** 면적 한도 항목의 실제 면적 (㎡) — 금양임야·묘토 */
  claimedAreaM2?: number;
  /** @deprecated claimedAreaM2 사용 권장 */
  areaM2?: number;
  /**
   * 협의분할 — 비과세 재산의 상속인별 귀속 (합 = claimedAmount). 미입력=법정상속분 (작업4).
   * 상속세 전용 (증여세는 수증자 1인). per-heir 과세가액에서 인정 비과세액을 이 비율로 안분 차감.
   */
  heirAllocations?: HeirAllocation[];
}

/**
 * 비과세 입력 (상증법 §11·§12·§46·§52의2)
 * @deprecated ExemptionCheckedItem[] 방식으로 대체됨.
 */
export interface ExemptionInput {
  /** 전사자 해당 여부 (§11) */
  isWarHero?: boolean;
  /** 국가·지자체·공공단체 유증 재산 금액 (§12 1호) */
  donatedToState?: number;
  /** 제사용 재산 — 족보·제구 (§12 3호, 민법 §1008의3) */
  ceremonialProperty?: number;
  /** 비과세 증여 — 사회통념상 금품·학자금·치료비 등 (§46) */
  socialNormGifts?: number;
  /** 공익법인 출연재산 (§46의2) */
  publicInterestContribution?: number;
}

/** 비과세 계산 결과 */
export interface ExemptionResult {
  totalExemptAmount: number;
  /** 비과세(§12·§46) 합계 — 결과 화면 그룹 구분용 (작업1) */
  nonTaxableTotal?: number;
  /** 과세가액 불산입(§16·§17) 합계 — 결과 화면 그룹 구분용 (작업1) */
  notIncludedTotal?: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 비과세 평가 상세 결과 (항목별).
 * D-8: 순환 의존 회피를 위해 exemption-evaluator.ts에서 이곳으로 이동(evaluator는 re-export로 하위호환).
 */
export interface ExemptionItemResult {
  ruleId: string;
  ruleName: string;
  claimedAmount: number;
  /** 과세상 취급 — "non_taxable"(§12·§46 비과세) / "not_included"(§16·§17 과세가액 불산입). 결과 화면 그룹 구분용 (작업1) */
  treatment?: "non_taxable" | "not_included";
  /** 실제 인정된 비과세 금액 */
  exemptAmount: number;
  /** 한도 초과로 일반 과세되는 금액 */
  taxableOverflow: number;
  breakdown: CalculationStep[];
  warnings: string[];
}
