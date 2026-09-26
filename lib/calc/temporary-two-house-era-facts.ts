/**
 * §155①2호 조정대상지역 일시적 2주택 — 폼 flat 필드 → `temporaryTwoHouse` 하위 사실 (OH-01 A2b)
 *
 * ④ 변환(`buildHouseholdSpecialPayload`)과 ⑤ 판정 카드(`judgeTempTwoHouseFromForm`)가 **같은 함수**로
 * 편다 — 선언 3-상태·임차인 토글 게이트가 두 벌이면 화면과 판정이 조용히 갈린다(3중 패턴).
 * ⑧ 검증도 같은 게이트(임차인 토글이 켜졌을 때만 종료일)를 따른다(`one-house-exemption-validate.ts`).
 *
 * 🔑 날짜는 **문자열 그대로** 돌려준다 — ④는 JSON 본문에 싣고 ⑤는 `new Date()`로 바꾼다.
 * 🔑 빈 값은 키를 만들지 않는다(Zod optional 계약) — 미입력은 엔진이 판정 보류로 고지한다
 *    (`one-house/era-undetermined.ts`). 신규 필드라 옛 record에는 값이 없으므로 `?? ""` 가드를 둔다.
 */
export interface TemporaryTwoHouseEraFormFields {
  newHouseRegulatedAtAcquisition?: string;
  prevHouseRegulatedAtNewAcquisition?: string;
  newHouseContractDate?: string;
  newHouseMoveInDate?: string;
  newHouseExistingTenant?: boolean;
  newHouseTenantLeaseEndDate?: string;
}

export interface TemporaryTwoHouseEraFacts {
  newHouseRegionCode?: string;
  newHouseRegulatedAtAcquisition?: boolean;
  previousHouseRegulatedAtNewAcquisition?: boolean;
  newHouseContractDate?: string;
  wholeHouseholdMoveInDate?: string;
  existingTenantLeaseEndDate?: string;
}

const yesNo = (v: string | undefined): boolean | undefined =>
  v === "yes" ? true : v === "no" ? false : undefined;

export function toTemporaryTwoHouseEraFacts(
  form: TemporaryTwoHouseEraFormFields,
  newHouseRegionCode: string | undefined,
): TemporaryTwoHouseEraFacts {
  const newReg = yesNo(form.newHouseRegulatedAtAcquisition);
  const prevReg = yesNo(form.prevHouseRegulatedAtNewAcquisition);
  return {
    ...(newHouseRegionCode ? { newHouseRegionCode } : {}),
    ...(newReg !== undefined ? { newHouseRegulatedAtAcquisition: newReg } : {}),
    ...(prevReg !== undefined ? { previousHouseRegulatedAtNewAcquisition: prevReg } : {}),
    ...(form.newHouseContractDate ? { newHouseContractDate: form.newHouseContractDate } : {}),
    ...(form.newHouseMoveInDate ? { wholeHouseholdMoveInDate: form.newHouseMoveInDate } : {}),
    // 단서는 「취득일 현재 기존 임차인」이 전제다 — 토글을 끄면 남은 종료일은 싣지 않는다.
    ...(form.newHouseExistingTenant === true && form.newHouseTenantLeaseEndDate
      ? { existingTenantLeaseEndDate: form.newHouseTenantLeaseEndDate }
      : {}),
  };
}
