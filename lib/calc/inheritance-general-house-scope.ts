/**
 * §155② 괄호 「일반주택」 한정의 **폼 게이트** — 계산기·판정 메뉴 공용 술어 (A3 · OH-12).
 *
 * 「상속개시 당시 보유한 조합원입주권이나 분양권에 의하여 사업시행 완료 후 취득한 신축주택」 선택지(⑤)는
 * 엔진이 그 값을 **실제로 보는 경우**에만 연다 — 양도 주택이 2013-02-15 이후, 어느 상속주택의 상속개시일보다
 * **뒤에** 취득된 경우다. 판정은 엔진 leaf(`qualifiesAsInheritanceGeneralHouse`)를 그대로 부른다(선언 없이
 * `no`가 나오는 경우 = 선언이 결론을 바꿀 수 있는 경우). ⑤·④·⑧이 이 술어 하나를 쓴다
 * (`feedback_shared_predicate_argument_parity`).
 *
 * 두 갈래에서 열린다(같은 질문 — 「양도 주택이 상속개시 당시 보유한 권리로 완공된 신축주택인가」):
 *   · 주택 축 — 명부 ② 풀 상속주택(§155②, 결정 #6으로 최대지분 공동상속 포함)의 상속개시일 뒤에 취득한 경우
 *   · 권리 축(결정 #8) — **⑥·④ 모양**(상속받은 권리 1개 + 상속 외 권리 없음)에서 권리의 상속개시일 뒤에 취득한 경우.
 *     ⑦·⑤ 후단(상속 외 권리 동반)에는 신축주택을 포함하는 문구가 없어 엔진이 그 값을 보지 않으므로 열지 않는다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { qualifiesAsInheritanceGeneralHouse } from "@/lib/tax-engine/data/inheritance-general-house-era";
import { isSecondClausePoolHouse } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { isOneHouseExemptionAsset } from "./housing-like-asset";
import { landContributedOriginalApt } from "./redev-field-scope";

const toDate = (v: string | undefined): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function generalHouseRightAtInheritanceVisible(
  form: Pick<TransferFormData, "houses" | "assets" | "transferDate" | "presaleRights">,
): boolean {
  // 양도 대상이 §154① 비과세 판정 자산일 때만 — ⑤ 명부 섹션이 열리는 범위와 같다(막다른 길 방지).
  if (!isOneHouseExemptionAsset(form.assets?.[0]?.assetKind)) return false;
  // E-8 — 승계조합원 신축주택은 엔진이 준공일·입주권 승계일로 판정하고 이 선언을 읽지 않는다
  //       (`resolveInheritedHouseExclusionFromInput`). 준공일이 없으면 엔진도 종전 동작이라 그대로 둔다.
  //       #12 — 토지만 출자한 원조합원 신축주택도 같다(준공일 · 관리처분계획 인가일). 권리 축(§156의2⑥)도 선언 대신
  //       `newBuildRightAcquisitionDate`로 판정한다. 토지 출자 판정은 ⑤④⑧ 공용 술어(`landContributedOriginalApt`)를 쓴다.
  const primary = form.assets?.[0];
  if (
    primary &&
    ((primary.assetKind === "redevelopment_apt" && primary.redevIsSuccessorMember === "yes") ||
      landContributedOriginalApt(primary)) &&
    toDate(primary.redevCompletionDate) !== undefined
  ) {
    return false;
  }
  const acquisition = toDate(form.assets?.[0]?.acquisitionDate);
  const transfer = toDate(form.transferDate);
  if (!acquisition || !transfer) return false;
  const houseAxis = (form.houses ?? []).some(
    (h) =>
      h.isInherited &&
      // §155③ 소수지분에는 이 괄호가 없다 — ② 풀(단독상속·최대지분 공동상속) 행만 본다(엔진과 같은 술어).
      isSecondClausePoolHouse(h) &&
      qualifiesAsInheritanceGeneralHouse({
        generalHouseAcquisitionDate: acquisition,
        inheritedDate: toDate(h.inheritedDate),
        transferDate: transfer,
      }) === "no",
  );
  if (houseAxis) return true;
  // 권리 축(⑥·④ 모양) — 상속개시일은 분양권 행의 취득일 / 입주권 행의 상속개시일 칸(엔진 `qualifyInheritedRight`와 같은 원값).
  const rights = form.presaleRights ?? [];
  if (rights.length !== 1 || !rights[0].isInherited) return false;
  const r = rights[0];
  return (
    qualifiesAsInheritanceGeneralHouse({
      generalHouseAcquisitionDate: acquisition,
      inheritedDate: toDate(r.type === "presale_right" ? r.acquisitionDate : r.inheritedDate),
      transferDate: transfer,
    }) === "no"
  );
}

/**
 * ④ — 두 신규 입력(OH-12c 증여일 · OH-12 신축주택 선언)을 **게이트와 같은 조건**으로만 싣는다.
 * 단건·다건·판정 메뉴 세 빌더가 이 함수 하나를 spread한다(한쪽만 키가 빠지면 침묵 소실).
 *   · 증여일 — 증여 토글이 켜져 있을 때만(토글을 끄면 남은 날짜는 의미가 없다).
 *   · 신축주택 선언 — ⑤ 게이트가 열린 경우만(닫혔는데 남은 stale 값이 엔진에 닿지 않게).
 */
export function buildInheritanceGeneralHousePayload(
  form: Pick<
    TransferFormData,
    | "houses"
    | "assets"
    | "transferDate"
    | "presaleRights"
    | "generalHouseGiftedFromDecedentWithin2yr"
    | "generalHouseGiftDate"
    | "generalHouseRightAtInheritance"
  >,
): {
  generalHouseGiftDate?: string;
  generalHouseRightAtInheritance?: "redevelopment_right" | "presale_right" | "none";
} {
  return {
    ...(form.generalHouseGiftedFromDecedentWithin2yr && form.generalHouseGiftDate
      ? { generalHouseGiftDate: form.generalHouseGiftDate }
      : {}),
    ...(form.generalHouseRightAtInheritance && generalHouseRightAtInheritanceVisible(form)
      ? { generalHouseRightAtInheritance: form.generalHouseRightAtInheritance }
      : {}),
  };
}
