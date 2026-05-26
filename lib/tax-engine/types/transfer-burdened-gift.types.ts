/**
 * 부담부증여(Burdened Gift) 양도세 전용 타입.
 *
 * 소득세법 시행령 §159 — 양도가액 = 채무액, 자산별 안분은 상증법 §60~§66 평가가액 기준.
 *
 * ⚠️ 동일 이름 `BurdenedGiftBreakdown`이 `./acquisition.types.ts`에도 정의되어 있음 (취득세 측).
 *    이름 충돌 방지를 위해 양도세 측은 `TransferBurdenedGiftBreakdown`으로 명명.
 */

/**
 * 상증법 §60~§66 증여재산 평가 모드.
 *
 * - `sangjeungbeop_standard`: 상증법 §61(기준시가) 기반 보충적 평가.
 *   사례 34. 양도가액을 기준시가로 산정 → 소령 §159①1호 A 괄호에 따라
 *   취득가액도 기준시가로 산정.
 *
 * - `sangjeungbeop_market`: 상증법 §60②~④ 시가(매매사례·감정가·보상·경매·공매가).
 *   사용자가 양도시·취득시 시가 평가액을 직접 입력.
 */
export type BurdenedGiftValuationMode = "sangjeungbeop_standard" | "sangjeungbeop_market";

/**
 * 부담부증여 sub-form 입력.
 *
 * TransferTaxInput.burdenedGiftInfo 로 부착.
 * acquisitionCause === "burdened_gift" 일 때만 의미 있음.
 *
 * 채무액(B) = lendingDepositTotal + mortgageDebtAmount (연간 임대료는 채무가 아님).
 * 증여가액(C) = Max(보충적평가, 담보평가, 임대평가) [§60~§66].
 */
export interface BurdenedGiftInfo {
  /** 양도(증여)시 평가 모드 (상증법 기준시가 vs 시가). */
  valuationMode: BurdenedGiftValuationMode;

  // === 인수 채무 (양도가액 산정: B = lendingDepositTotal + mortgageDebtAmount) ===
  /** 임대보증금 총액 (채무로 인수). 미입력 시 0. */
  lendingDepositTotal: number;
  /** 담보차입금 (채무로 인수, 실제 채무잔액). 미입력 시 0. */
  mortgageDebtAmount: number;

  // === 임대 평가 보조 (Max 비교용 — 채무 아님) ===
  /** 연간 임대료 총액. 환산가액 산식(상증령 §50⑦)에만 사용. 0 허용. */
  annualRentTotal: number;

  // === 담보평가 보조 (선택, v2 본격 분기) ===
  /**
   * (근)저당권 등 설정액. 미입력 시 mortgageDebtAmount로 fallback.
   * 실무에서 (근)저당 설정액 ≠ 실제 채무잔액인 경우 분리 입력.
   * v2 후속 PR에서 분리 anchor.
   */
  mortgageSetAmount?: number;

  // === 시가 모드 직접 입력 (valuationMode === "sangjeungbeop_market" 시 필수) ===
  /** 양도시 시가 평가액(총액). 시가 모드에서 필수. */
  marketValueAtTransfer?: number;
  /** 취득시 시가 평가액(총액). 시가 모드에서 필수. */
  marketValueAtAcquisition?: number;

  // === Phase 2 증여세 통합용 필드 ===
  /**
   * 증여자-수증자 관계 (상증법 §53). 증여재산공제 산정.
   * - "lineal_descendant": 직계비속 (성인 자녀·손자녀 등) — 사례 34 (장남). 공제 5천만.
   * - "lineal_ascendant_adult": 성인 직계존속 (조부모·부모 등). 공제 5천만.
   * - "lineal_ascendant_minor": 미성년자가 직계존속에게서 받는 경우. 공제 2천만.
   * - "spouse": 배우자. 공제 6억.
   * - "other_relative": 기타 친족 (6촌 이내 혈족·4촌 이내 인척). 공제 1천만.
   * 미입력 시 "lineal_descendant" 기본값 (가장 흔한 케이스).
   */
  donorRelation?:
    | "spouse"
    | "lineal_ascendant_adult"
    | "lineal_ascendant_minor"
    | "lineal_descendant"
    | "other_relative";

  /** 법정신고기한 내 신고 여부 (§69 신고세액공제 3%). 기본 true. */
  isFiledOnTime?: boolean;

  /** 세대생략 증여 여부 (§57). 기본 false. */
  isGenerationSkip?: boolean;

  /** 수증자 미성년 여부 (세대생략 20억 초과 40% 판정). 기본 false. */
  isMinorDonee?: boolean;

  /**
   * Phase 3 후속 (2026-05-12) — 10년 이내 사전증여 내역 (상증법 §47 ② 합산).
   * 동일 증여자가 동일 수증자에게 10년 이내 한 증여재산가액을 합산하여 누진세율 적용.
   * 각 항목: 증여일·증여가액·당시 납부세액. 미입력 시 빈 배열로 처리(합산 0).
   */
  priorGiftsWithin10Years?: Array<{
    /** 증여일 (ISO YYYY-MM-DD) */
    giftDate: string;
    /** 당시 증여재산가액 */
    giftAmount: number;
    /** 당시 납부한 증여세액 (§47② 합산 표시·totalTaxPaid용) */
    giftTaxPaid: number;
    /**
     * 당시 증여세 산출세액 (§58① "증여 당시 산출세액") — §58 기납부세액공제 대상·한도 분자.
     * 입력 시 calcGiftTax의 aggregatePriorGiftsForGift가 Phase A 안분을 적용한다.
     * 미입력(undefined) 시 priorAggregation 0 → §58 미적용 (validation에서 입력 강제).
     */
    computedTax?: number;
    /** 당시 증여세 과세표준 (§58 한도 분자 = 가산 증여재산 과세표준). Phase A 필수 */
    giftTaxBase?: number;
  }>;

  // === 자산별 기준시가 — 보충적평가·취득가액 안분 (소령 §159 ① 1호) ===
  /**
   * 양도시 토지 기준시가 (개별공시지가 × 면적). 보충적평가 산정 분자.
   * 필수 — 부담부증여 분기 진입 시 항상 입력.
   */
  landStdPriceAtTransfer: number;
  /** 양도시 건물 기준시가 합계 (층별 합계). 보충적평가 산정. */
  buildingStdPriceAtTransfer: number;
  /**
   * 취득시 토지 기준시가 (개별공시지가 × 면적).
   * 소령 §159 ① 1호 A 괄호 — 기준시가 모드일 때 취득가액도 기준시가로 산정.
   */
  landStdPriceAtAcquisition: number;
  /** 취득시 건물 기준시가 합계. */
  buildingStdPriceAtAcquisition: number;

  /**
   * 증여재산 평가용 양도시 건물 기준시가 (상증법 §61 — 층별 가감율 적용).
   * 양도세 보충적평가는 `buildingStdPriceAtTransfer` (양도세 §99 기준시가),
   * 증여세 보충적평가는 본 필드 (층별 가감율 반영) — 토지는 동일 값 사용.
   * 미입력 시 `buildingStdPriceAtTransfer`로 fallback (양도세=증여세 가정).
   *
   * 산식에서 채무비율 분모 C = `landStdPriceAtTransfer + giftBuildingStdPriceAtTransfer`.
   * Excel C37 = D37(=D31) + E37(층별 합계)에 대응.
   */
  giftBuildingStdPriceAtTransfer?: number;
}

/**
 * 부담부증여 양도세 결과 명세.
 *
 * TransferTaxResult.transferBurdenedGiftBreakdown 으로 부착.
 * Phase 2(증여세 통합) 입력 보호용 export 필드 포함.
 */
export interface TransferBurdenedGiftBreakdown {
  /**
   * 인수 채무액 B = lendingDepositTotal + mortgageDebtAmount.
   * = 양도가액 (소령 §159 ① 2호).
   * 사례 34: 4,120,000,000원.
   */
  assumedDebtAmount: number;

  /**
   * 상증법 §60~§66 평가 Max 산정 결과.
   * 사례 34: max = supplementary = 8,578,295,360원 (보충적평가 채택).
   */
  sangjeungbeopValuation: {
    /** 보충적평가 (상증법 §61): 자산별 기준시가 합계. 시가 모드일 때 marketValueAtTransfer로 대체. */
    supplementary: number;
    /** 담보평가 (상증법 §66): (근)저당 설정액 + 임대보증금. */
    mortgage: number;
    /** 임대평가 (상증법 §61⑤·시행령 §50⑦): 임대보증금 + 연간임대료/12%. */
    rental: number;
    /** Max 채택 모드. */
    selectedMode: "supplementary" | "mortgage" | "rental";
    /** Max 값 (= 증여가액 C, 소령 §159 분모). */
    max: number;
  };

  /**
   * 채무비율 = B / C = 인수채무 / 증여가액 (소령 §159).
   * 분모 C = giftValuation.max (= 증여재산 평가액, 층별 가감율 적용 건물기준시가 사용).
   * 사례 34: 4,120,000,000 / 8,578,295,360 ≈ 0.480278051...
   */
  debtRatio: number;

  /**
   * 증여재산 평가 (취득가액 안분 분모용 — 상증법 §60~§66).
   * supplementary = landStdPriceAtTransfer + giftBuildingStdPriceAtTransfer (층별 가감율 적용).
   * 양도세 분모(`sangjeungbeopValuation`)와 분리 — 건물 기준시가 산정 방식 차이 반영.
   */
  giftValuation: {
    supplementary: number;
    mortgage: number;
    rental: number;
    selectedMode: "supplementary" | "mortgage" | "rental";
    max: number;
  };

  /**
   * 무상이전분 = C − B.
   * Phase 2(증여세 통합)에서 증여세 과세대상 가액의 출발점.
   * 사례 34: 8,578,295,360 − 4,120,000,000 = 4,458,295,360원.
   */
  gratuitousPortion: number;

  /**
   * 양도세 납세의무자.
   * 부담부증여 채무인수 양도분 = 증여자 본인 (수증자 아님).
   * Phase 2에서 증여세는 `taxpayer: "donee"`로 별도 계산.
   */
  taxpayer: "donor";

  /**
   * Phase 2: 증여세 명세 (calcGiftTax 결과 요약).
   * burdenedGiftInfo.donorRelation 제공 시만 채워짐 — 미제공 시 undefined.
   */
  giftTax?: {
    /** 증여재산가액 = gratuitousPortion */
    grossGiftValue: number;
    /** 증여재산공제 (직계비속 5천만 등) */
    deduction: number;
    /** 과세표준 = gross − deduction */
    taxBase: number;
    /** 산출세액 (§56 누진세율) */
    computedTax: number;
    /** 신고세액공제 (§69 3%) */
    filingCredit: number;
    /**
     * §58 기납부세액공제 — 사전증여 산출세액 안분 공제액 (PR3).
     * = Min(직전 증여 산출세액, floor(금번 산출세액 × 직전 과세표준 / 합산 과세표준)).
     * 사전증여 미입력 시 0. (= calcGiftTaxCredits 결과의 giftTaxCredit)
     */
    priorGiftCredit?: number;
    /** 결정세액 (수증자 자진납부세액) */
    finalTax: number;
    /** 적용 관계 */
    donorRelation: string;
  };

  /**
   * 자산-수준 안분 결과 (감사·결과카드 표시용).
   * 토지·건물 각각 양도가액·취득가액·개산공제.
   */
  perAsset: {
    land: {
      /** 양도시 자산 평가가액 (분배 전 — 토지 기준시가 또는 시가). */
      sangjeungbeopValue: number;
      /** 취득시 자산 기준시가 (산식 빌더에서 §159①1호 분자로 표시용 — 부동소수 역산 회피). */
      stdPriceAtAcquisition: number;
      /** 자산별 양도가액 = sangjeungbeopValue × debtRatio (소령 §159 ① 2호). */
      transferPrice: number;
      /** 자산별 취득가액 = 취득시 자산 기준시가 × debtRatio (소령 §159 ① 1호, 기준시가 모드). */
      acquisitionPrice: number;
      /** 자산별 개산공제 = acquisitionPrice × 3% (소령 §163 ⑥). */
      estimatedDeduction: number;
    };
    building: {
      sangjeungbeopValue: number;
      stdPriceAtAcquisition: number;
      transferPrice: number;
      acquisitionPrice: number;
      estimatedDeduction: number;
    };
  };
}
