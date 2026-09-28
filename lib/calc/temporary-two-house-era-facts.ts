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

/**
 * ⑧ §155①2호 새 입력 검증 — 판정 메뉴(`one-house-exemption-validate.ts`)와 증여세 부담부증여
 * (`components/calc/gift-tax-form-validate.ts` — E-1)가 **같은 규칙**을 쓴다.
 *
 * 🔑 게이트(`regulated.relevant`)는 호출부가 ⑤와 **같은 판정 결과**로 건다 — 칸이 없는 화면에서 막지 않는다.
 * 🔑 차단(`error`)은 모순뿐이다(계약일 > 취득일 · 임차인 토글 ON인데 종료일 없음 · 종료일 ≤ 취득일).
 *    ④는 임차인 토글이 켜졌을 때만 종료일을 싣는다(`toTemporaryTwoHouseEraFacts`) — 같은 조건이다.
 * 🔑 미입력은 `warning`이다 — 엔진이 판정 보류로 고지하고(종전 대리 지표로 계산) 결론을 지어내지 않는다.
 */
export interface TemporaryTwoHouseEraIssue {
  field: keyof TemporaryTwoHouseEraFormFields;
  message: string;
  severity: "error" | "warning";
}

export function temporaryTwoHouseEraIssues(
  form: TemporaryTwoHouseEraFormFields,
  p: { newAcquisitionDate: string | undefined; determined: boolean; moveInRelevant: boolean },
): TemporaryTwoHouseEraIssue[] {
  const out: TemporaryTwoHouseEraIssue[] = [];
  const err = (field: TemporaryTwoHouseEraIssue["field"], message: string) =>
    out.push({ field, message, severity: "error" });
  const warn = (field: TemporaryTwoHouseEraIssue["field"], message: string) =>
    out.push({ field, message, severity: "warning" });
  const newAcq = p.newAcquisitionDate;
  if (form.newHouseContractDate && newAcq && form.newHouseContractDate > newAcq) {
    err("newHouseContractDate", "신규 주택 매매계약 체결·계약금 지급일은 신규 주택 취득일보다 늦을 수 없습니다.");
  }
  if (!p.determined) {
    warn(
      "newHouseRegulatedAtAcquisition",
      "신규 주택 취득일 현재 두 주택이 조정대상지역이었는지 선택하세요 — 선택하지 않으면 양도일 기준 양도 주택의 조정대상지역 여부로 대신 판정합니다.",
    );
  }
  if (!p.moveInRelevant) return out;
  if (form.newHouseExistingTenant === true) {
    if (!form.newHouseTenantLeaseEndDate) {
      err("newHouseTenantLeaseEndDate", "기존 임차인 특례: 전 소유자와 임차인 간 임대차계약 종료일을 입력하세요.");
    } else if (newAcq && form.newHouseTenantLeaseEndDate <= newAcq) {
      err(
        "newHouseTenantLeaseEndDate",
        "기존 임차인 특례: 임대차계약 종료일은 신규 주택 취득일 뒤여야 합니다(취득일 현재 거주 중인 임차인).",
      );
    }
  }
  if (!form.newHouseMoveInDate) {
    warn(
      "newHouseMoveInDate",
      "신규 주택으로 세대전원이 이사·전입신고한 날을 입력하세요 — 입력하지 않으면 1년 내 전입 요건(§155①2호 가목)은 판정하지 않습니다.",
    );
  }
  return out;
}
