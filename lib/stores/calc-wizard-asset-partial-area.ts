/**
 * 일부양도(`areaScenario === "partial"`) 취득가액 안분 계산기 폼 슬라이스 — B4-2b.
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-1~C-7 · §4
 *
 * ## 왜 필요한가
 *
 * 실거래가 모드는 엔진이 취득가액을 안분하지 않는다. 사용자가 **양도분에 대응하는**
 * 취득가액을 넣어야 정답이 되는데, 종전에는 라벨이 "취득가액 (원)"이고 안내가 없어
 * 전체 취득가액을 넣기 쉬웠다(취득 300㎡·양도 100㎡에서 양도차익 **2억 차이**).
 *
 * ## 법령 — 안분 기준은 면적비가 아니다
 *
 * | 재결 | 채택된 안분 기준 |
 * |---|---|
 * | 조심 2018부0572 (2018.05.03) | **취득 당시 기준시가** 비율 — "각 필지별 실지취득가액이 **불분명한 경우**" |
 * | 국심2005구1458 (2005.08.31) | **취득 당시 감정가액**(법원 매각허가 감정, 신빙성 有) |
 * | 국심1992서2655 (1992.09.09) | 면적비 — 단 이유가 "**기준시가가 동일하므로**" |
 *
 * → 안분 기준은 고정 서열이 아니라 **취득 당시 각 부분의 상대가치를 가장 신빙성 있게
 *   반영하는 값**이다. **양도 당시** 가액 기준 안분은 배척된다(조심 2018부0572).
 *
 * → 실지취득가액이 **구분되면 그 값이 우선**하고(2018부0572 "불분명한 경우"), 안분은
 *   보충 방법이다. 그래서 **무조건 자동 안분을 하지 않고** "구분되는가"를 묻는다.
 *
 * ## 엔진 미전송 (UI 전용)
 *
 * 이 슬라이스 필드는 계산기 입력이고, 결과는 사용자가 「적용」을 눌러
 * `fixedAcquisitionPrice`(기존 필드)에 기록된다 → ④⑫⑬⑭ 배선 불필요.
 * `useEffect → store` 미러링 금지 정책상 자동 반영도 하지 않는다.
 */

/** 안분 기준 — **취득 당시** 값만 허용한다(양도 당시 가액 기준은 배척). */
export type PartialApportionBasis = "" | "std_price" | "appraisal";

export interface PartialAreaApportionFormSlice {
  /**
   * 양도분 취득가액이 계약서 등으로 **구분되는가** (3-state).
   * ""=미선택 · "yes"=구분됨(직접 입력 우선) · "no"=불분명(안분 필요).
   * 미선택을 허용하는 이유: `partial`이어도 환산 모드면 이 축이 계산에 쓰이지 않는다.
   */
  partialAcqDistinct: "" | "yes" | "no";
  /** 안분 기준 (`partialAcqDistinct === "no"` 시). */
  partialApportionBasis: PartialApportionBasis;
  /** 분할 전 **전체** 취득가액 (원) — 안분의 분자. */
  partialTotalAcqPrice: string;
  /** 양도분의 취득 당시 기준시가 또는 감정가액 (원). */
  partialSoldValue: string;
  /** 잔여분(양도하지 않은 부분)의 취득 당시 기준시가 또는 감정가액 (원). */
  partialRemainValue: string;
}

export const PARTIAL_AREA_APPORTION_DEFAULTS: PartialAreaApportionFormSlice = {
  partialAcqDistinct: "",
  partialApportionBasis: "",
  partialTotalAcqPrice: "",
  partialSoldValue: "",
  partialRemainValue: "",
};

/** ③ normalize — 구 세션 복원 방어. */
export function migratePartialAreaApportionFields(a: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(PARTIAL_AREA_APPORTION_DEFAULTS)) {
    if (a[k] === undefined) a[k] = v;
  }
}

/**
 * 양도분 취득가액 = 전체 취득가액 × (양도분 가치 / (양도분 + 잔여분 가치)).
 *
 * 금액이므로 `Math.floor` 절사(세법 규약 — `Math.round` 금지).
 * 세 값이 모두 양수가 아니면 `null`(계산 불가) — 호출부가 「적용」을 비활성한다.
 *
 * 부분별 가치가 **같으면** 결과가 면적비 안분과 일치한다(국심1992서2655의 사안).
 * 다르면 그 차이가 곧 이 계산기를 쓰는 이유다.
 */
export function calcPartialAcqPrice(
  totalAcqPrice: number,
  soldValue: number,
  remainValue: number,
): number | null {
  if (!(totalAcqPrice > 0) || !(soldValue > 0) || !(remainValue > 0)) return null;
  const denom = soldValue + remainValue;
  return Math.floor((totalAcqPrice * soldValue) / denom);
}
