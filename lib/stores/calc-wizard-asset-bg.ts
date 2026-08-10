/**
 * 부담부증여(burdened gift) 폼 슬라이스.
 *
 * calc-wizard-asset.ts 800줄 정책으로 분리 (2026-05-12 Phase 3 후속).
 * AssetForm은 이 slice를 extends하여 합성. 다른 도메인(general_building·mixed-use 등)도
 * 향후 동일 패턴으로 점진 분리 가능.
 *
 * 법령 근거: 소득세법 시행령 §159 (부담부증여 양도차익), 상증법 §53·§56·§57·§69 (증여세 통합).
 */

/** 부담부증여 평가·채무·증여세 통합·사전증여 입력 묶음 — AssetForm에 mix-in. */
export interface BurdenedGiftFormSlice {
  // ── 평가·채무 (Phase 1·2) ──
  /**
   * 부담부증여 평가 모드.
   * "sangjeungbeop_standard": 상증법 기준시가 (사례 34, 가장 일반적)
   * "sangjeungbeop_market": 상증법 시가 (매매사례·감정·보상·경매·공매가)
   * "": 미선택 (transferType !== "burdened_gift" 시 무시)
   */
  bgValuationMode: "" | "sangjeungbeop_standard" | "sangjeungbeop_market";
  /** 임대보증금 총액 (채무로 인수). 원, string. */
  bgLendingDepositTotal: string;
  /** 담보차입금 (채무로 인수, 실제 채무잔액). 원, string. */
  bgMortgageDebtAmount: string;
  /** 연간 임대료 (환산평가용 — 채무 아님). 원, string. */
  bgAnnualRentTotal: string;
  /** (근)저당 설정액 (선택). 미입력 시 bgMortgageDebtAmount fallback. */
  bgMortgageSetAmount: string;
  /** 시가 모드 양도시 평가액 (총액). sangjeungbeop_market 시 필수. */
  bgMarketValueAtTransfer: string;
  /** 시가 모드 취득시 평가액 (총액). sangjeungbeop_market 시 필수. */
  bgMarketValueAtAcquisition: string;
  /**
   * 증여재산 평가용 양도시 건물 기준시가 (상증법 §61 — 층별 가감율 적용).
   * 양도세용 양도시 건물기준시가와 분리. 미입력 시 양도세용 값 fallback (양도세=증여세 가정).
   * 산식: 채무비율 분모 C = 토지 양도시 기준시가 + 본 필드.
   */
  bgGiftBuildingStdPriceAtTransfer: string;

  // ── 취득가액 산정방식 (K-4/K-5, 시가 모드 전용) ──
  /**
   * [신설] 취득가액 산정방식 (시가 모드 `sangjeungbeop_market` 선택 시 필수).
   * "": 미선택, "actual": 실지취득가액 안분(§159①1호 본문), "converted": 환산취득가액(§176의2②2호).
   * 기준시가 모드에서는 무시 — §159①1호 A괄호가 취득가 기준시가를 강제(K-1~K-3).
   */
  bgAcquisitionMethod: "" | "actual" | "converted";
  /** [신설] K-4 실지취득가액 — 토지 (general_building·land). 원, string. */
  bgActualAcquisitionLand: string;
  /** [신설] K-4 실지취득가액 — 건물 (general_building). 원, string. */
  bgActualAcquisitionBuilding: string;
  /** [신설] K-4 실지취득가액 — 단일자산 (housing·building·commercial_building). 원, string. */
  bgActualAcquisitionTotal: string;

  // ── 이월과세(§97의2) — 「당초 증여자」 취득 당시 값 **두 번째 벌** (2026-08-10 D-7b) ──
  /**
   * ## ⚠️ 「증여자」가 두 사람을 가리킨다 — 용어를 먼저 고정한다
   *
   * · **양도인**      = 부담부증여를 하는 사람. 위 `bgActualAcquisition*` 등이 이 사람 기준이다.
   * · **당초 증여자** = 그 양도인에게 자산을 증여한 사람. 아래 `bgCoDonor*`가 이 사람 기준이다.
   *
   * ## 왜 「덮어쓰기」가 아니라 「한 벌 더」인가
   *
   * 「소득세법」 §97의2②3호 비교는 **두 시나리오를 동시에** 요구한다:
   * 시나리오 B(미적용)는 **양도인** 기준 값을, 시나리오 A(적용)는 **당초 증여자** 기준 값을 쓴다.
   * 한 칸의 의미를 토글로 바꾸면 비교 자체가 성립하지 않는다.
   * (계획서 `burdened-gift-carryover-159-97-2.plan.md` §5.6.2)
   *
   * ## 언제 필수인가
   *
   * `transferType === "burdened_gift"` **그리고** `acquisitionCause === "carryover_gift"`일 때만.
   * 그 밖에는 빈 문자열로 두며 API 변환에서 `undefined`가 된다.
   * ❌ 미입력 시 양도인 값으로 fallback 금지 — 시나리오 A = B가 되어 §97의2가 조용히 무력화된다.
   */
  /** 당초 증여자 취득 당시 **토지** 기준시가(총액). K-1~K-3·K-5에서 필수. 원, string. */
  bgCoDonorLandStdPriceAtAcq: string;
  /** 당초 증여자 취득 당시 **건물** 기준시가(총액). K-1~K-3·K-5에서 필수(건물 없으면 0). 원, string. */
  bgCoDonorBuildingStdPriceAtAcq: string;
  /** K-4: 당초 증여자의 실지취득가액 — 토지. 원, string. */
  bgCoDonorActualAcquisitionLand: string;
  /** K-4: 당초 증여자의 실지취득가액 — 건물. 원, string. */
  bgCoDonorActualAcquisitionBuilding: string;
  /** K-4: 당초 증여자의 실지취득가액 — 단일자산 총액. 원, string. */
  bgCoDonorActualAcquisitionTotal: string;
  /** legacy(시가·산정방식 미선택): 당초 증여자 취득 당시 시가 평가액. 원, string. */
  bgCoDonorMarketValueAtAcquisition: string;

  // ── 증여세 통합 입력 (Phase 3) ──
  /** 증여자-수증자 관계 (상증법 §53 증여재산공제). "" = 미선택 (엔진 default: lineal_descendant). */
  bgDonorRelation:
    | ""
    | "spouse"
    | "lineal_ascendant_adult"
    | "lineal_ascendant_minor"
    | "lineal_descendant"
    | "other_relative";
  /** 수증자 미성년 여부 (세대생략 20억 초과 40% 판정). 기본 false. */
  bgIsMinorDonee: boolean;
  /** 세대생략 증여 여부 (§57 30%/40% 할증). 기본 false. */
  bgIsGenerationSkip: boolean;
  /** 법정신고기한 내 신고 여부 (§69 신고세액공제 3%). 기본 true. */
  bgIsFiledOnTime: boolean;

  // ── 사전증여 합산 (Phase 3 후속, 상증법 §47②·§58) ──
  /**
   * 10년 이내 사전증여 내역. 동일 증여자→동일 수증자 한정.
   * 각 항목은 string 폼 보관 (사용자 입력 그대로). 빈 배열은 사전증여 없음.
   */
  bgPriorGifts: Array<{
    /** 증여일 (YYYY-MM-DD) */
    giftDate: string;
    /** 당시 증여재산가액 (원, string) */
    giftAmount: string;
    /** 당시 납부 증여세액 (원, string) */
    giftTaxPaid: string;
    /** 당시 증여세 산출세액 (원, string) — §58① 기납부세액공제 대상·한도 분자 (PR3) */
    computedTax?: string;
    /** 당시 증여세 과세표준 (원, string) — §58 한도 분자 (PR3) */
    giftTaxBase?: string;
  }>;
}
