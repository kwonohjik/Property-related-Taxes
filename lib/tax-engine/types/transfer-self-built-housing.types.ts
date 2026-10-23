/**
 * 일체 주택 **본인 신축** × 「소득세법」 §114조의2 가산세 base 건물분 — 입력·echo 타입 (타입 전용).
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§3.1 · §7.9)
 */

/**
 * `TransferTaxInput.selfBuiltHousing` — 일체 주택(개별주택가격·공동주택가격이 토지·건물 합계로 공시되는 주택)을 본인이 신축하고
 * 환산 또는 감정으로 계산할 때, 가산세 base 를 **「해당 건물」분**으로 구하기 위한 입력.
 *
 * 최상위 평문 칸으로 두지 않고 중첩 객체로 둔 이유: `landStdPriceAtTransfer` 같은 최상위 칸은 토지·건물 분리 계산(`calcSplitGain`)이
 * 읽는다 — 섞이면 양도차익이 바뀐다. 이 객체는 **가산세 base 만** 바꾼다(양도차익·결정세액 불변).
 */
export interface SelfBuiltHousingInput {
  /** 취득(신축) 당시 토지 ㎡당 개별공시지가 — L = 이 값 × `landArea` */
  landPricePerSqmAtAcquisition?: number;
  /** 토지 면적(㎡) */
  landArea?: number;
  /** 취득 당시 건물 기준시가 N */
  buildingStdPriceAtAcquisition?: number;
  /** 양도 당시 토지 기준시가 L_T */
  landStdPriceAtTransfer?: number;
  /** 양도 당시 건물 기준시가 N_T */
  buildingStdPriceAtTransfer?: number;
  /** 양도가액 토지·건물 구분(소득세법 §100②③ · 영 §166⑥⑧) — `resolveTransferPriceSplit` 법정 서열 입력. 비면 양도 당시 기준시가 비례 */
  sale?: {
    landTransferPrice?: number;
    buildingTransferPrice?: number;
    landAppraisalAtTransfer?: number;
    buildingAppraisalAtTransfer?: number;
    saleSplitExemption?: "other_law" | "demolished_land_only";
  };
  /** 감정 — 감정평가서에 구분 표시된 **건물 감정가액**. 있으면 안분하지 않고 그 값을 쓴다. 없으면 취득 당시 토지·건물 기준시가 비례 */
  buildingAppraisalValue?: number;
}

/** 결과 echo — `selfBuiltHousingPenalty`. 이 축이 가산세 base 를 정했을 때만 실린다(표시부는 값을 재계산하지 않고 읽는다). */
export interface SelfBuiltHousingPenaltyEcho {
  buildingType: "new";
  /** 신축일(YYYY-MM-DD) */
  constructionDate: string;
  /** 신축일부터 5년 되는 날(YYYY-MM-DD, 당일 포함) */
  fifthAnniversary: string;
  method: "estimated" | "appraisal";
  /** 가산세 base = 건물분 환산취득가액 또는 건물 감정가액 */
  base: number;
  /** 가산세 = base × 5% (원 미만 절사) */
  penalty: number;
  /**
   * 환산 — 건물분 산정 내역. `*Housing` = 주택공시가격(토지+건물), `*Land`·`*Building` = 그 가격을 토지·건물 기준시가 비율로 나눈 몫,
   * `saleBuilding` = 건물 양도가액(`resolveTransferPriceSplit` 법정 서열).
   */
  housingSplit?: {
    acquisitionHousing: number;
    acquisitionLand: number;
    acquisitionBuilding: number;
    /** 양도 당시 주택공시가격 — 영 §164⑨ 특례가 걸리면 차감 후(H_T′), 아니면 개별주택가격·공동주택가격 */
    transferHousing: number;
    transferLand: number;
    transferBuilding: number;
    saleBuilding: number;
    /** 영 §164⑨ 공익수용(1호)·공매·경락(2호) 특례 산출근거 — 특례 detail 이 있을 때만(불발 포함). 값은 detail 복사 */
    sec164_9?: {
      kind: "expropriation" | "auction";
      /** 특례 전 양도 당시 주택공시가격 H_T */
      standardHousing: number;
      /** 1호 compensation·basis / 2호 auction — 비교한 후보 */
      candidates: { compensation?: number; basis?: number; auction?: number };
    };
  };
  /** 환산 — base = multiplicand × numerator ÷ denominator */
  formula?: { multiplicand: number; numerator: number; denominator: number };
  /** 감정 — 건물 감정가액 산정 내역 */
  appraisal?: {
    mode: "direct" | "apportioned";
    /** apportioned — 감정가액 총액 */
    totalAppraisal?: number;
    /** apportioned — 안분에 쓴 취득 당시 토지·건물 기준시가(L·N) */
    landStdPriceAtAcquisition?: number;
    buildingStdPriceAtAcquisition?: number;
  };
}

/** 집계(함께 양도·다건) 결과에서 카드(자산)별로 모은 echo — 어댑터(`aggregateToFilingResult`)가 실어 결과 4뷰가 같은 목록을 읽는다. */
export interface SelfBuiltEchoEntry {
  /** 어느 카드(자산)의 echo 인가 */
  label: string;
  echo: SelfBuiltHousingPenaltyEcho;
}
