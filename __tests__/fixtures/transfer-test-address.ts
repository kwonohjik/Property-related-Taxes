/**
 * 테스트 픽스처 — 양도세 폼에 **소재지**를 채운다.
 *
 * 2026-09-16부터 소재지는 ⑧ 필수 입력이다(`transfer-tax-validate-asset.ts`). 물건 식별자라
 * 비어 있으면 서로 다른 물건이 같은 이력 `businessKey`를 갖고 앞의 신고서를 덮어쓴다
 * (계획서 `docs/00-pm/business-key-property-identity.plan.md` §1-1).
 *
 * 🔑 **단언을 느슨하게 하지 않고 픽스처를 실제 입력과 맞춘다.**
 *    `createDefaultTransferFormData()`는 «새 마법사»의 빈 폼이라 주소가 없는 것이 옳다 —
 *    사용자가 채우는 값을 테스트도 채워야 한다.
 *    [[feedback_fixture_default_masks_gate_defect]]
 */

/** 픽스처 공용 지번. 실제 조회를 타지 않는 문자열이면 충분하다(⑧은 비어 있는지만 본다). */
export const TEST_JIBUN = "서울 강남구 테스트동 1-1";

/** 폼의 모든 자산에 소재지를 채워 돌려준다(이미 있으면 유지). 원본을 그대로 반환한다. */
export function withTestAddress<T extends { assets?: unknown[] }>(form: T): T {
  for (const a of (form.assets ?? []) as Array<Record<string, unknown>>) {
    if (!String(a.addressRoad ?? "").trim() && !String(a.addressJibun ?? "").trim()) {
      a.addressJibun = TEST_JIBUN;
    }
  }
  return form;
}
