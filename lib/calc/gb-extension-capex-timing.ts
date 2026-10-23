/**
 * 일반건물 증축 × 자본적지출 — 「그중 증축 전에 지출한 금액」 칸이 **필요한 자리** (④ 전송 · ⑤ 표시 · ⑧ 필수 검증 공용).
 *
 * 계획서 `docs/00-pm/gb-extension-capex-timing.plan.md` Q-1 a (2026-10-23). 증축 전 지출은 원건물에만, 증축 후 지출은
 * 원건물·증축분에 양도가액 비율로 나눈다 — 지출 시점을 알아야 하므로 금액 칸 옆에서 증축 전 몫을 받는다.
 *
 * 자리는 계산에 쓰이는 자본적지출 칸과 같다:
 * - `asset` — 자산 단위 「자본적지출」(`capitalExpenditure`). 분리 OFF이거나 두 파트가 모두 환산일 때만 쓰인다
 *   (그 밖에는 ⑧ V-8이 파트 칸으로 안내한다). 부담부증여로 필요경비 칸이 숨으면(`bgExpenseUnusedBasis`) 없다.
 * - `building` — 분리 ON 건물 파트 칸(`buildingDirectExpenses`). 두 파트가 모두 환산이 아니면 화면에 있다
 *   (`GeneralBuildingAcquisitionCards` `showPartCapex`) · 부담부증여면 파트 카드가 통째로 숨는다(`PartAcqModeField`).
 * 금액 칸이 비었거나 0이면 나눌 것이 없어 칸을 띄우지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "./number-parse";
import { gbPartModes } from "./transfer-tax-split-acq-mode";
import { bgExpenseUnusedBasis } from "./burdened-gift-expense-scope";

export function gbCapexBeforeExtensionSlots(asset: AssetForm): { asset: boolean; building: boolean } {
  if (asset.assetKind !== "general_building" || !asset.gbHasExtension) return { asset: false, building: false };
  const { land, building } = gbPartModes(asset);
  const bothEstimated = land === "estimated" && building === "estimated";
  const separate = !!asset.hasSeperateLandAcquisitionDate;
  return {
    asset: parseAmount(asset.capitalExpenditure) > 0 && (!separate || bothEstimated) && bgExpenseUnusedBasis(asset) === null,
    building:
      separate && !bothEstimated && asset.transferType !== "burdened_gift" && parseAmount(asset.buildingDirectExpenses) > 0,
  };
}

/**
 * ⑧ — 칸이 필요한 자리에서 비었거나 총액을 넘으면 막는다. 비움을 「전부 증축 후」로 읽지 않는다(자동 배분 fallback 금지 —
 * 기존 이력도 이 칸을 채워야 계산된다 · Q-1 a). 범위 검사는 ⑫(`transfer-tax-building-schemas.ts`)와 같은 규칙이다.
 */
export function gbCapexBeforeExtensionIssue(
  asset: AssetForm,
): { field: "gbCapexBeforeExtension" | "gbBuildingCapexBeforeExtension"; message: string } | null {
  const slots = gbCapexBeforeExtensionSlots(asset);
  const check = (
    on: boolean,
    field: "gbCapexBeforeExtension" | "gbBuildingCapexBeforeExtension",
    raw: string | undefined,
    total: string | undefined,
    totalLabel: string,
  ) => {
    if (!on) return null;
    if ((raw ?? "").trim() === "")
      return {
        field,
        message: `${totalLabel} 중 증축 전에 지출한 금액을 입력하세요(없으면 0). 증축 전 지출은 원건물에만, 증축 후 지출은 원건물과 증축분에 양도가액 비율로 나눕니다(「소득세법 시행령」 제163조 제3항 — 지출이 가해진 자산의 필요경비).`,
      };
    if (parseAmount(raw) > parseAmount(total))
      return { field, message: `증축 전에 지출한 금액이 ${totalLabel}보다 큽니다.` };
    return null;
  };
  return (
    check(slots.asset, "gbCapexBeforeExtension", asset.gbCapexBeforeExtension, asset.capitalExpenditure, "자본적지출") ??
    check(slots.building, "gbBuildingCapexBeforeExtension", asset.gbBuildingCapexBeforeExtension, asset.buildingDirectExpenses, "건물 자본적지출")
  );
}
