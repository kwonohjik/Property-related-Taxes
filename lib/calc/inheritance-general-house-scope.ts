/**
 * §155② 괄호 「일반주택」 한정의 **폼 게이트** — 계산기·판정 메뉴 공용 술어 (A3 · OH-12).
 *
 * 「상속개시 당시 보유한 조합원입주권이나 분양권에 의하여 사업시행 완료 후 취득한 신축주택」 선택지(⑤)는
 * 엔진이 그 값을 **실제로 보는 경우**에만 연다 — 양도 주택이 2013-02-15 이후, 어느 상속주택의 상속개시일보다
 * **뒤에** 취득된 경우다. 판정은 엔진 leaf(`qualifiesAsInheritanceGeneralHouse`)를 그대로 부른다(선언 없이
 * `no`가 나오는 경우 = 선언이 결론을 바꿀 수 있는 경우). ⑤·④·⑧이 이 술어 하나를 쓴다
 * (`feedback_shared_predicate_argument_parity`).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { qualifiesAsInheritanceGeneralHouse } from "@/lib/tax-engine/data/inheritance-general-house-era";
import { isOneHouseExemptionAsset } from "./housing-like-asset";

const toDate = (v: string | undefined): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function generalHouseRightAtInheritanceVisible(
  form: Pick<TransferFormData, "houses" | "assets" | "transferDate">,
): boolean {
  // 양도 대상이 §154① 비과세 판정 자산일 때만 — ⑤ 명부 섹션이 열리는 범위와 같다(막다른 길 방지).
  if (!isOneHouseExemptionAsset(form.assets?.[0]?.assetKind)) return false;
  const acquisition = toDate(form.assets?.[0]?.acquisitionDate);
  const transfer = toDate(form.transferDate);
  if (!acquisition || !transfer) return false;
  return (form.houses ?? []).some(
    (h) =>
      h.isInherited &&
      // §155③ 공동상속주택에는 이 괄호가 없다 — 단독상속 행만 본다(엔진과 같은 범위).
      !h.isCoInherited &&
      qualifiesAsInheritanceGeneralHouse({
        generalHouseAcquisitionDate: acquisition,
        inheritedDate: toDate(h.inheritedDate),
        transferDate: transfer,
      }) === "no",
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
