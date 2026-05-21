/**
 * 가업상속공제 받은 자산 양도 시 양도소득세 상당액 공제
 *
 * 법령: 상증법 §18의2⑩ + 상증령 §15㉑
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §18의2⑩ — "양도소득세 상당액을 상속세 산출세액에서 공제한다. 다만 음수인 경우 영으로 본다."
 *   - §15㉑ 산식 — `소법 §97의2④ 양도세액 − 소법 §97 양도세액`
 *
 * 본 함수는 산식만 제공. 양도세액 자체 계산은 transfer-tax 도메인 책임.
 *
 * 사용 시점 — 가업상속공제 받은 자산을 양도하는 경우, 양도 측 transfer-tax 엔진에서:
 *   - 일반 산식 (소법 §97): 양도가액 − 취득가액(피상속인) − 필요경비 → 양도소득세
 *   - 의제 산식 (소법 §97의2④): 가업상속공제 의제 취득가액 적용 → 양도소득세
 *   두 값의 차이를 상속세에서 공제 가능 (음수 → 0).
 *
 * 본 PR scope: 산식 헬퍼만. 실 호출 통합은 추후 transfer-tax 도메인 PR.
 */

export interface FamilyBusinessCgtCreditInput {
  /** 소법 §97의2④ 의제 산식 적용 양도세액 (원) */
  cgtUnderSection97_2_4: number;
  /** 소법 §97 일반 산식 양도세액 (원) */
  cgtUnderSection97: number;
}

export interface FamilyBusinessCgtCreditResult {
  /** 공제 가능 금액 (음수 0 가드 적용) */
  creditAmount: number;
  /** 산식 raw diff (음수일 수 있음) */
  rawDiff: number;
  /** breakdown 라벨 */
  breakdown: Array<{ label: string; amount: number; lawRef?: string }>;
}

/**
 * 가업상속공제 양도소득세 상당액 공제 계산.
 *
 * 산식: max(0, cgtUnderSection97_2_4 − cgtUnderSection97).
 *
 * @param input 의제/일반 양도세액
 * @param lawRef 법령 라벨 (호출자 주입)
 */
export function calcFamilyBusinessCgtCredit(
  input: FamilyBusinessCgtCreditInput,
  lawRef: string,
): FamilyBusinessCgtCreditResult {
  const rawDiff = input.cgtUnderSection97_2_4 - input.cgtUnderSection97;
  const creditAmount = Math.max(0, rawDiff);
  return {
    creditAmount,
    rawDiff,
    breakdown: [
      { label: "소법 §97의2④ 의제 양도세액", amount: input.cgtUnderSection97_2_4 },
      { label: "소법 §97 일반 양도세액", amount: input.cgtUnderSection97 },
      {
        label: rawDiff < 0
          ? "양도세 상당액 공제 (음수 → 0 가드)"
          : "양도세 상당액 공제",
        amount: creditAmount,
        lawRef,
      },
    ],
  };
}
