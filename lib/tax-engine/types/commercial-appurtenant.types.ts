/**
 * 상업용건물·오피스텔(구분소유) 부수토지 기준면적 판정 입력.
 *
 * 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 → 「지방세법 시행령」 §101①2호·§101②.
 *
 * ## 왜 "전체" 면적을 받는가 — 구분소유 판정 모델 ㉮
 *
 * §101①2호는 "**건축물의** 바닥면적 × 적용배율"이라 하고 구분소유 안분 규정을 두지 않는다.
 * 집합건물에서 "건축물"은 전체 1동이므로 **건물 전체를 기준으로 판정한 뒤 지분 안분**한다
 * (설계 근거: `docs/02-design/features/commercial-building-appurtenant-land-nbl.plan.md` §2.3).
 *
 * 그런데 지분율은 판정식의 분자·분모에 함께 걸려 **약분된다**:
 *
 * ```
 * 해당 호 지분면적           >  전체 바닥면적 × 배율 × 지분율
 * (전체 대지 × 지분율)       >  전체 바닥면적 × 배율 × 지분율
 * ⟺ 전체 대지면적            >  전체 바닥면적 × 배율
 * ```
 *
 * 초과 비율도 마찬가지로 지분율과 무관하다:
 *
 * ```
 * 초과비율 = 1 − (전체 바닥면적 × 배율) ÷ 전체 대지면적
 * ```
 *
 * ⇒ **지분면적·지분율을 입력받을 필요가 없다.** 전체 대지면적과 전체 바닥면적 2개면
 * 초과 비율이 확정되고, 그 비율을 `nonBusinessLandAreaRatio`로 주입하면 중과분이 안분된다.
 *
 * ⚠️ 여기서 받는 두 면적은 **집합건물 전체 값**이다 — 해당 호의 대지권 지분면적
 * (`commercialBuildingValuation.landArea`, §164⑥ 3축 중 대지)과 혼동하지 말 것.
 * 전체 값은 건축물대장 총괄표제부에서 확인한다.
 */
export interface CommercialAppurtenantLandInput {
  /** 집합건물 **전체**의 대지면적 (㎡) — 해당 호 지분면적이 아니다. */
  totalLandArea: number;
  /**
   * 집합건물 **전체**의 건축물 바닥면적 (㎡, 건축물 외 시설은 수평투영면적).
   * 각 층 중 최대 바닥면적 기준(조심 2025지0451 — 건축면적 아님).
   */
  totalBuildingFootprintArea: number;
  /**
   * 용도지역 — 「지방세법 시행령」 §101② 적용배율 결정.
   * 미입력·표 미등재(세분 전 `residential` 등)는 계산이 차단된다(추정 배율 금지).
   */
  zoneType?: string;
  /**
   * 「지방세법 시행령」 §101① **단서** 해당 여부 — true 시 배율과 무관하게 부속토지 전량 비사업용.
   *
   * 범위는 무허가 신축에 한정되지 않는다. 「건축법」 §19②1호 용도변경 허가 미이행,
   * §19⑤·§22 사용승인 미이행도 포함된다(법제처 법령해석례 25-0823, 2026.02.03).
   */
  unapprovedBuilding?: boolean;
  /**
   * 해당 호의 토지·건물 **기준시가**(원, 호 단위 총액) — 양도차익을 토지분·건물분으로 나누는 기준.
   *
   * 「소득세법」 §104의3①은 «토지»만 비사업용으로 정하므로(건물은 비사업용 토지가 될 수 없다) 초과 비율을
   * 건물분 소득에 곱할 수 없다. 법 §100② 후문·영 §166⑥이 토지와 건물의 가액 구분이 불분명하면
   * 취득가액은 취득 **당시**, 양도가액은 양도 **당시** 기준시가 비율로 나누라고 한다 — 시점별로 네 값이다.
   *
   * 초과분(또는 §101① 단서)이 있으면 필수다. **자동 안분 fallback은 없다** — 없으면 엔진이 거부한다(NBL2611-V5-BX01).
   */
  partBasis?: CommercialAppurtenantPartBasis;
}

/** 토지·건물 기준시가 4값 — 취득 당시 · 양도 당시 각각의 토지분·건물분(원, 호 단위 총액) */
export interface CommercialAppurtenantPartBasis {
  acquisitionLandStd: number;
  acquisitionBuildingStd: number;
  transferLandStd: number;
  transferBuildingStd: number;
}

/** 분수 — 엔진이 정수 원 단위로 비율을 보존하는 방식(4자리 반올림 없음) */
export interface IntegerFraction {
  numerator: number;
  denominator: number;
}

/**
 * 상가 비사업용 파트 산출 echo (NBL2611-V5-BX01) — 표시 전용 + 다건 재계산의 단일 소스.
 *
 * 자산 한 개를 **토지분 / 건물분**으로 나누고, 초과 면적 비율은 **토지분 양도차익에만** 곱한다.
 * 비사업용 파트(= 토지분 양도차익 × 초과 비율)의 양도소득 몫만 §104①8호 +10%p가 걸린다.
 */
export interface CommercialNblPartEcho {
  /** 집합건물 전체 대지면적 × 100 (㎡ → 정수, 면적 비교 정밀도) */
  totalLandArea100: number;
  /** 초과 면적 × 100 — 기준면적(바닥면적 × 배율)을 넘는 부분, §101① 단서면 전체 */
  excessArea100: number;
  /** 적용 배율(§101②). 단서 해당 시 0 */
  multiplier: number;
  transferPrice: { land: number; building: number };
  /** 취득가액(환산취득가액 포함, §97③ 감가상각 공제 전) */
  acquisitionCost: { land: number; building: number };
  /** 필요경비(개산공제 또는 자본적지출·양도비) */
  expenses: { land: number; building: number };
  landGain: number;
  /** 건물분 = 자산 양도차익 − 토지분(§97③ 감가상각비 공제 반영) */
  buildingGain: number;
  totalGain: number;
  /** 토지분 중 초과 면적 몫 = 비사업용 파트 양도차익 */
  nonBusinessGain: number;
  /** 토지분 중 기준면적 이내 몫(사업용) */
  businessLandGain: number;
  /** 비사업용 파트가 소득을 가지는가 — 토지분 양도차손·자산 양도차손익 0 이하면 false */
  applied: boolean;
  /** 엔진이 입력에 주입한 값 — 다건 재계산이 단건과 같은 값을 쓰도록 싣는다 */
  injected: {
    isNonBusinessLand: boolean;
    nonBusinessLandAreaRatio?: number;
    nonBusinessLandPartShare?: IntegerFraction;
  };
}
