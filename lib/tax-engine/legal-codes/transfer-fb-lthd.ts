/**
 * 가업상속공제 자산 §95④ 후단 장기보유특별공제 — 법령 상수
 *
 * 기존 상수가 있는 조문(`TRANSFER.CARRYOVER_FAMILY_BUSINESS` = §97조의2④)은 중복 정의하지 않는다.
 * 계획서: docs/02-design/features/transfer-fb-lthd-portion-gain.engine.plan.md · 법령 본문 실독: 소득세법 MST 280405(시행 2026.1.1.)
 */
export const TRANSFER_FB_LTHD = {
  /**
   * 소득세법 §95④ 후단 — 「같은 조 제4항제1호에 따른 가업상속공제가 적용된 비율에 해당하는 자산의 경우에는
   * 피상속인이 해당 자산을 취득한 날부터 기산한다」. 적용분의 장기보유특별공제 보유기간 기산일.
   */
  LATTER_HOLDING_START: "소득세법 §95 ④ (가업상속공제 적용 비율분 — 피상속인 취득일 기산)",
} as const;
