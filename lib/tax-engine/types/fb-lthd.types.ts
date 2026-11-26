/** 가업상속공제 자산 §95④ 후단 장기보유특별공제 — 결과 echo 타입 (계획서 transfer-fb-lthd-portion-gain §5.3) */

/** 가업상속공제 자산 §95④ 후단 LTHD — 한 부분(적용분 · 비적용분)의 산출 echo */
export interface FbLthdSlice {
  /** 이 부분의 양도가액 − 필요경비 몫 `X × n/d`(`slice_gain`일 때만) */
  netTransferShare?: number;
  /** §97의2④ 1호(적용분) / 2호(비적용분) 취득가액 항(`slice_gain`일 때만) */
  acquisitionTerm?: number;
  /** 부분 양도차익 — 12억 초과 안분 전 (차손이면 음수) */
  gain: number;
  /** 장기보유특별공제 기준액 — 12억 초과 안분 후 · 차손 부분은 0 */
  taxableGain: number;
  /** 이 부분의 보유기간(적용분 = 피상속인 취득일부터 · 비적용분 = 상속개시일부터) */
  holdingYears: number;
  holdingMonths: number;
  /** 보유분 공제율(소수 — 표시용) */
  holdingRate: number;
  /** 보유분 공제액 */
  deduction: number;
}

/** 가업상속공제 자산 §95④ 후단 LTHD echo — `TransferTaxResult.fbLthdDetail` */
export interface FbLthdSliceDetail {
  /** `slice_gain` = 의제 §97의2④ 재귀(부분별 양도차익) · `proportional` = 두 부분 base가 같아 전체 차익을 비례 안분(일반 §97·슬라이스 불가 시) */
  basis: "slice_gain" | "proportional";
  appliedRateFraction: { numerator: number; denominator: number };
  /** 적용분 — 가업상속공제가 적용된 비율에 해당하는 자산(피상속인 취득일 기산) */
  decedentSlice: FbLthdSlice;
  /** 비적용분 — 상속개시일 기산 */
  heirSlice: FbLthdSlice;
  /** 표2 거주분 공제액(전체 과세 양도차익 기준 — 거주기간 승계 명문 없음). 표1이면 0 */
  residenceDeduction: number;
  /**
   * 양도차손인 부분 — 그 부분은 공제하지 않고 양수 부분에 전액 공제율을 곱했다(사용자 결정 Q-2 (a) — **해석례 미확보, 확인 필요**).
   * 있으면 `warnings`에 고지(`FB_LTHD_LOSS_SLICE_NOTICE`)가 함께 실린다.
   */
  lossSlice?: "decedent" | "heir";
  /**
   * 부분별 공제액 합(거주분 포함)이 과세 양도차익을 넘어 **양도차익 범위로 제한**했다(사용자 결정 2026-11-26 — 해석례 미확보, 확인 필요).
   * 있으면 `result.longTermHoldingDeduction`은 부분별 공제액의 합보다 작고 과세 양도차익과 같다. `warnings`에 고지가 함께 실린다.
   */
  cappedToGain?: true;
  /** 공제액 ÷ 과세 양도차익 — 표시 전용(세액 미사용 · 정수 분수로 되돌려 쓰지 않는다) */
  effectiveRate: number;
}
