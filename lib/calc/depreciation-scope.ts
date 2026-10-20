/**
 * 감가상각비(§97③) 입력 가능 범위 — **단일 술어**.
 *
 * 계획서: `docs/00-pm/transfer-depreciation-and-capex-display.plan.md` §4
 *
 * 「소득세법」 §97③은 양도자산 보유기간에 그 자산의 감가상각비로서 사업소득금액 계산 시 필요경비에
 * 산입했거나 산입할 금액을 취득가액에서 공제하도록 한다. 엔진은 **일반 경로**(단건 취득가액 하나가
 * `calcTransferGain`으로 수렴)만 처리한다. 취득가액이 파트별로 갈리는 경로는 건물 파트에만 귀속시키는
 * 입력이 따로 필요하다(Phase C) — 그런 경로에서 이 칸을 열면 **조용히 계산에 반영되지 않는다**.
 *
 * ⚠️ ⑤ 입력 게이트(`DepreciationField`)와 ⑧ validate(`transfer-tax-validate-depreciation.ts`)가
 *   **이 함수 하나**를 쓴다 — 술어가 갈리면 「칸은 보이는데 계산이 막히는」(또는 반대) 모순이 생긴다
 *   (memory `feedback_ui_gate_two_conditions_downstream_one`).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isSplitPayloadActive } from "./transfer-tax-api-split";
import { mixedSaleSplitScope, type MixedSaleSplitScopeCtx } from "./mixed-use-sale-split-scope";

export type DepreciationSupport =
  /** 칸을 열고 계산에 반영한다. */
  | { status: "ok" }
  /** 건물이 없는 자산 — 감가상각 대상이 아니다. 칸도 고지도 없다. */
  | { status: "not_applicable" }
  /** 감가상각 대상일 수 있으나 이 구조는 아직 받지 못한다 — 칸을 숨기고 이유를 알린다. */
  | { status: "unsupported"; reason: string };

/** 건물이 있는 자산 종류. 일반건물(토지+건물 일괄)은 입력은 같은 칸이지만 **건물분**으로 귀속된다(아래 분기). */
const BUILDING_KINDS: ReadonlySet<AssetForm["assetKind"]> = new Set([
  "housing",
  "building",
  "commercial_building",
  "general_building",
]);

/**
 * @param ctx 겸용주택 전용 — 신고서 자산 수. 겸용은 **단건일 때만** 상가건물분으로 받는다(`mixedSaleSplitScope`).
 *   생략하면 단건이 아닌 것으로 본다(안전측) — 컴패니언·다건 빌더는 문맥 없이 부르므로 겸용 값을 보내지 않는다.
 */
export function depreciationSupport(a: AssetForm, ctx?: Partial<MixedSaleSplitScopeCtx>): DepreciationSupport {
  if (!BUILDING_KINDS.has(a.assetKind)) return { status: "not_applicable" };

  const unsupported = (reason: string): DepreciationSupport => ({ status: "unsupported", reason });
  const isBurdenedGift = a.transferType === "burdened_gift" || a.acquisitionCause === "burdened_gift";

  /**
   * 일반건물(토지+건물 일괄) — 감가상각비는 **건물분**에 귀속된다. 엔진은 원건물 카드에만 싣는다
   * (`general-building-depreciation.ts`). 토지·건물을 따로 취득했는지(분리 ON)와 무관하게 같은 칸이다 —
   * 일반건물의 「분리」는 파트별 **취득가액·모드**이지 단건 엔진의 split 축(`isSplitPayloadActive`)이 아니다.
   * 이월과세(건물 파트 §97의2)·부담부증여는 위와 같은 이유로 막는다.
   */
  if (a.assetKind === "general_building") {
    if (isBurdenedGift) {
      return unsupported("부담부증여는 채무 인수분과 증여분을 나눠 취득가액을 안분하므로 감가상각비를 아직 입력받지 않습니다.");
    }
    if (a.acquisitionCause === "carryover_gift" || a.gbBuildingAcquisitionCause === "carryover_gift") {
      return unsupported("배우자·직계존비속 이월과세는 증여자의 취득가액을 승계하므로 증여자의 감가상각 이력이 필요해 아직 입력받지 않습니다.");
    }
    return { status: "ok" };
  }

  if (isBurdenedGift) {
    return unsupported("부담부증여는 채무 인수분과 증여분을 나눠 취득가액을 안분하므로 감가상각비를 아직 입력받지 않습니다.");
  }
  if (a.acquisitionCause === "carryover_gift") {
    return unsupported("배우자·직계존비속 이월과세는 증여자의 취득가액을 승계하므로 증여자의 감가상각 이력이 필요해 아직 입력받지 않습니다.");
  }
  /**
   * 겸용주택 — **상가건물분**으로 받는다(엔진 `commercialBuildingDepreciation`, 계획서 `mixed-use-sale-split-basis.plan.md` §4.3).
   * 값은 최상위 `depreciationAmount`가 아니라 겸용 페이로드로만 실린다(④ `buildMixedUsePayload`) — 최상위 ④는 문맥 없이
   * 이 함수를 부르므로 겸용에서 항상 unsupported가 되어 이중 전송이 없다.
   */
  if (a.assetKind === "housing" && a.isMixedUseHouse) {
    const scope = mixedSaleSplitScope(a, { isSingleAsset: ctx?.isSingleAsset === true });
    if (scope.status === "ok") return { status: "ok" };
    return unsupported(
      scope.status === "blocked"
        ? `겸용주택 상가건물 감가상각비: ${scope.reason}`
        : "겸용주택은 주택분·상가분으로 나눠 계산하므로 건물 파트별 감가상각비를 아직 입력받지 않습니다.",
    );
  }
  if (a.parcelMode) {
    return unsupported("여러 필지 모드는 필지별로 계산하므로 감가상각비를 아직 입력받지 않습니다.");
  }
  if (a.usePreHousingDisclosure) {
    return unsupported("주택 공시 이전 취득(PHD) 환산은 토지·건물을 나눠 계산하므로 감가상각비를 아직 입력받지 않습니다.");
  }
  if (isSplitPayloadActive(a, false)) {
    return unsupported("토지·건물을 따로 취득했거나 한쪽만 소유한 자산은 취득가액이 파트별이라 건물 파트 감가상각비를 아직 입력받지 않습니다.");
  }
  if ((a.areaScenario ?? "same") !== "same") {
    return unsupported("일부 양도·환지 등으로 면적이 달라지는 경우 취득가액이 면적에 따라 안분되므로 감가상각비를 아직 입력받지 않습니다.");
  }
  return { status: "ok" };
}
