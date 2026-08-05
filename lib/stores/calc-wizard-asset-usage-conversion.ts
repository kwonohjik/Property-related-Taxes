/**
 * UsageConversionFormSlice — 비주택 → 주택 용도변경 폼 필드
 * (「소득세법」 §95⑤·⑥ · 「소득세법 시행령」 §154⑤ 단서).
 *
 * calc-wizard-asset.ts 800줄 정책 준수를 위해 분리 (Phase D, 2026-08-05).
 * AssetForm이 이 slice를 extend한다.
 *
 * ⚠️ 겸용주택(`isMixedUseHouse`)과는 **배타**다 — 건물 전부가 주택이 된 경우가 이 슬라이스이고,
 *    일부만 주택인 경우는 겸용주택 축이다. 조합은 validation이 차단한다(계획 C-14).
 */

export interface UsageConversionFormSlice {
  /**
   * 비주택으로 취득한 건물을 주택으로 용도변경했는지.
   * ON일 때만 `residentialUseStartDate`가 의미를 갖는다.
   */
  hasNonHousingConversion: boolean;
  /**
   * 사실상 주거용으로 사용한 날 (`yyyy-MM-dd`).
   * 불분명하면 공부상 용도변경일 — §95⑥ 단서.
   *
   * 이 날짜가 세 곳의 기준일이 된다:
   *   §95⑤ 장기보유특별공제 기간 분해 (비주택 기간 ↔ 주택 기간)
   *   §154⑤ 단서 비과세 보유기간 기산
   *   §154① 거주요건의 조정대상지역 판정 시점
   */
  residentialUseStartDate: string;
}

/**
 * 「용도변경 활성」 술어 — **단일 소스**.
 *
 * UI 위젯·validation·API 변환·Step4 안내가 전부 이 함수를 쓴다. 각자 조건을 다시 쓰면
 * "화면은 통과인데 validate는 차단" 같은 모순이 생긴다
 * (memory `feedback_shared_predicate_argument_parity`).
 *
 * 토글만 켜고 날짜를 비워 둔 상태는 **비활성**이다 — 날짜 없이는 기간을 나눌 수 없다.
 * 그 상태를 오류로 막는 것은 validation의 몫이고(C-16), 계산 계층은 조용히 종전 방식으로 간다.
 */
export function isUsageConversionActive(
  asset: Partial<UsageConversionFormSlice> | undefined,
): boolean {
  return asset?.hasNonHousingConversion === true && !!asset.residentialUseStartDate;
}
