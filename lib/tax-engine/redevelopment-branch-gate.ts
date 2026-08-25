/**
 * 「단독주택 출자 §164⑤ 2-point 환산」 분기인가 — ⑤ UI · ⑧ validate · ⑫ Zod · 엔진 dispatch
 * **공용 단일 소스**.
 *
 * ## 왜 뽑았나 (2026-08-25 · E1-04)
 *
 * 같은 4축 술어가 **세 곳에 복제**돼 있었고 그중 ⑫만 축이 하나 적었다:
 *
 * | 지점 | 술어 |
 * |---|---|
 * | 엔진 dispatch (`redevelopment.ts`) | housing + right + **receive** + estimated + PHD 2필드>0 |
 * | ⑤ UI (`isHousingContribEstimatedBranch`) | housing + right + **receive** + estimated |
 * | ⑧ validate (`isHousingRightReceiveEstimated`) | housing + right + **receive** + estimated |
 * | ⑫ Zod refine | housing + right + estimated ← **receive 없음** |
 *
 * 그래서 청산금 **납부** 조합에서 ⑤는 일반 환산 카드를 렌더하고 ⑧은 통과시키는데 ⑫가
 * §164⑤ 2필드를 요구하며 400을 냈다. 그 두 필드의 입력 UI는 `receive`에서만 렌더되므로
 * 사용자는 요구받은 값을 넣을 화면 자체가 없었다 — **완전한 dead-end**
 * (memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * ## 원시값을 받는다
 *
 * 호출부의 자료형이 서로 다르다 — ⑤는 폼(`AssetForm`, 문자열), ⑫는 Zod 페이로드,
 * 엔진은 `TransferTaxInput`. 그래서 **원시값 4개만** 받아 세 자료형이 같은 함수를 보게 한다.
 *
 * ⚠️ 엔진 dispatch는 여기에 **PHD 2필드 > 0**을 AND로 더 얹는다 — 값이 실제로 있어야
 *    §164⑤ 산식을 돌릴 수 있기 때문이다. 그 조건까지 이 leaf에 넣으면 ⑤·⑧·⑫가
 *    「값이 없으면 분기가 아니다」로 읽혀 **요구 자체를 못 하게** 된다(요구가 사라지면
 *    자동 안분 fallback 금지 정책이 무너진다).
 */

/** 이 분기를 가르는 네 축 (자료형 무관 원시값). */
export interface HousingContribEstimatedAxes {
  /** 종전자산 종류 — 「주택」일 것 */
  originalAssetType?: string | null;
  /** 양도 대상 — 「조합원입주권」일 것 */
  subject?: string | null;
  /** 청산금 방향 — 「수령」일 것 */
  settlementDirection?: string | null;
  /** 취득가액 산정 방식 — 환산일 것 */
  useEstimatedAcquisition?: boolean | null;
}

/**
 * 단독주택 출자 §164⑤ PHD 2-point 환산 분기인가.
 *
 * 조문: 소득세법 시행령 §164⑤ (개별주택가격 2-point 환산) · §166③ (재개발 환산취득가).
 * 이 조합에서만 §166③ 분모가 「인가당시 개별주택가격」으로 바뀌어 일반 환산(D)과 산식이 다르다.
 */
export function isHousingContribEstimatedAxes(axes: HousingContribEstimatedAxes): boolean {
  return (
    axes.originalAssetType === "housing" &&
    axes.subject === "right" &&
    axes.settlementDirection === "receive" &&
    axes.useEstimatedAcquisition === true
  );
}
