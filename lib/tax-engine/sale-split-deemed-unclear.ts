/**
 * §100③ — 토지·건물 **구분 기장 가액**이 안분 가액과 30% 이상 차이나면 「불분명」으로 의제.
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §11 · §12.2
 *
 * ## 조문
 *
 * 「소득세법」 제100조 **제3항**:
 * > 제2항을 적용할 때 토지와 건물 등을 함께 취득하거나 양도한 경우로서 그 토지와 건물 등을 **구분
 * > 기장한 가액**이 같은 항에 따라 **안분계산한 가액과 100분의 30 이상 차이가 있는 경우**에는 토지와
 * > 건물 등의 가액 구분이 **불분명한 때로 본다**. 다만, 다른 법령에서 정하는 바에 따라 가액을 구분한
 * > 경우 등 대통령령으로 정하는 사유에 해당하는 경우는 제외한다.
 *
 * 같은 항 **본문**(§100②)이 「각각 구분하여 기장하되 … 구분이 **불분명할 때에는** … 안분계산한다」
 * 이므로, 이 조항은 「구분 기장을 했더라도 안분값에서 크게 벗어나면 없는 것으로 본다」는 **의제**다.
 *
 * 단서의 예외 = 「소득세법 시행령」 제166조 **제8항**:
 *   1호 다른 법령에서 정하는 바에 따라 토지와 건물 등의 가액을 구분한 경우
 *   2호 토지와 건물 등을 함께 취득한 후 건물 등을 철거하고 토지만 사용하는 경우
 * (「부가가치세법 시행령」 제64조 제2항이 같은 2사유를 문언까지 동일하게 규정한다.)
 *
 * ## 확정된 해석 (계획서 §11 — 실무 자료 사례 4건으로 재현 검증)
 *
 * | 논점 | 확정 |
 * |---|---|
 * | 비교 대상 | **토지·건물 양쪽 모두**. 한쪽이라도 벗어나면 발동 |
 * | 분모 | **안분값**. 적정범위 = 안분값 × 0.7 초과 ~ × 1.3 미만(**개구간**) |
 * | 경계 | 「30% **이상** 차이」가 부적합 ⇒ **정확히 30%도 발동** |
 *
 * **왜 양쪽을 다 봐야 하는가**: 구분값 합은 안분값 합과 같으므로(둘 다 총액을 나눈 것), 한쪽을 X만큼
 * 크게 적으면 다른 쪽이 반드시 X만큼 작아진다. 차이 **금액**은 같은데 **비율**은 분모가 작은 쪽이
 * 항상 크다 ⇒ **작은 파트가 실질 제약**이고, 큰 쪽만 검증하면 반드시 놓친다.
 *
 * ## 🔴 정수 연산 — 부동소수 bound 금지
 *
 * `구분값 < 안분값 × 0.7` 형태로 하한을 만들면 **판정이 뒤집히는 실입력**이 있다.
 * 실측: 안분 167,800,000 → `× 0.7 = 117459999.99999999`이라 정확히 −30%인 117,460,000이
 * 「범위 안」으로 오판된다. 원 단위 1천만~20억 구간에서 `× 1.3`은 전부 정확했고 `× 0.7`만
 * 3,821건 부정확했다 — **하한이 위험하다**.
 *
 * 그래서 곱셈만 쓰는 정수식으로 판정한다:
 *
 *     발동 ⟺ |구분값 − 안분값| × 100 ≥ 안분값 × 30
 *
 * anchor: `__tests__/tax-engine/sale-split-deemed-unclear.anchor.test.ts` U-3
 */

/** §166⑧ 예외 사유 — 자동 판정이 불가해 사용자 신고로 받는다(계획서 §12.6). */
export type SaleSplitExemption = "other_law" | "demolished_land_only";

export interface SaleSplitPair {
  land: number;
  building: number;
}

export interface DeemedUnclearInput {
  /** 구분 기장 가액 (계약서 등에 각각 기재된 값) */
  declared: SaleSplitPair;
  /** 안분 가액 — 부가령 §64① basis로 산출한 값(감정평가가액 우선 · 없으면 기준시가) */
  apportioned: SaleSplitPair;
  /** §166⑧ 예외. 있으면 30% 판정을 건너뛴다(이탈 사실은 `detail`에 기록한다). */
  exemption?: SaleSplitExemption;
}

export interface DeemedUnclearDetail {
  /** 이탈률 (basis point — 1% = 100). 표시 계층이 이 값을 **그대로 읽는다**(재계산 금지). */
  landDeviationBp: number;
  buildingDeviationBp: number;
  /** 그 파트가 30% 이상 벗어났는가. 예외가 있어도 **사실 자체는 기록**한다. */
  landOver: boolean;
  buildingOver: boolean;
  /** 예외가 적용돼 발동을 면한 경우의 사유. */
  exemptionApplied?: SaleSplitExemption;
}

export interface DeemedUnclearResult {
  /** 「불분명한 때로 본다」 발동 여부. */
  deemedUnclear: boolean;
  /** 실제 적용할 가액 — 발동 시 **안분값**, 아니면 구분값. */
  applied: SaleSplitPair;
  detail: DeemedUnclearDetail;
}

/** 「30% 이상 차이」 — 곱셈만 쓴다(위 「정수 연산」 절). 안분값 0인 파트는 판정 대상이 아니다. */
function isOver30(declared: number, apportioned: number): boolean {
  if (apportioned <= 0) return false;
  return Math.abs(declared - apportioned) * 100 >= apportioned * 30;
}

/** 이탈률(bp) — 표시 전용. 안분값 0이면 0. */
function deviationBp(declared: number, apportioned: number): number {
  if (apportioned <= 0) return 0;
  return Math.floor((Math.abs(declared - apportioned) * 10_000) / apportioned);
}

/**
 * §100③ 판정 + 적용 가액 결정.
 *
 * 차단이 아니라 **의제**다 — 조문이 「불분명한 때로 **본다**」이므로 계산을 진행하고, 발동 시
 * 안분값으로 되돌린다. 화면·신고서는 `detail`을 읽어 그 사실을 표시한다(계획서 §12.5 D).
 */
export function judgeDeemedUnclearSplit(input: DeemedUnclearInput): DeemedUnclearResult {
  const { declared, apportioned, exemption } = input;

  const landOver = isOver30(declared.land, apportioned.land);
  const buildingOver = isOver30(declared.building, apportioned.building);

  // 예외가 있으면 발동하지 않는다. 다만 이탈 사실(`landOver`·`buildingOver`)은 지우지 않는다 —
  // 「예외로 인정받은 이탈」과 「애초에 이탈이 없었음」은 신고서에서 다른 사실이다.
  const deemedUnclear = !exemption && (landOver || buildingOver);

  return {
    deemedUnclear,
    applied: deemedUnclear ? { ...apportioned } : { ...declared },
    detail: {
      landDeviationBp: deviationBp(declared.land, apportioned.land),
      buildingDeviationBp: deviationBp(declared.building, apportioned.building),
      landOver,
      buildingOver,
      ...(exemption && (landOver || buildingOver) ? { exemptionApplied: exemption } : {}),
    },
  };
}
