/**
 * ④ 겸용주택 — 양도가액 안분 기준(계약서 구분·감정가액) · 상가건물 감가상각비 · 건물 귀속 양도비 페이로드.
 *
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.4
 *
 * - 범위는 ⑤·⑧과 **같은 술어**(`mixedSaleSplitScope`)다. 범위 밖이면 아무 키도 싣지 않는다 — 화면에서 숨겨진 stale 값이 새지 않는다.
 * - 엔진 스위치는 **값의 유무**다(모드 문자열은 보내지 않는다). 모드 전환 시 쓰지 않는 값은 ⑤가 `saleSplitModePatch`로 비운다.
 * - 값은 `mixedUse` 서브객체로만 간다. 최상위 split 페이로드(`buildSplitPayload`)는 겸용을 제외한다(계획서 R-4).
 *
 * ## 공유지분
 * 겸용 엔진 계약(`buildMixedUsePayload` 표)대로 **절대금액만** 지분분으로 만든다. 감정가액은 비율로만 쓰여 축척하지 않는다.
 * 구분가액은 합이 엔진에 가는 양도가액(`applyRatio(계약 총액, ratio)` — `transfer-tax-api.ts`)과 **1원까지** 같아야 하므로
 * 건물분을 「축척한 합계 − 축척한 토지분」 잔액으로 만든다(각각 절사하면 1원 어긋나 엔진이 막는다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseSaleSplitFields } from "@/lib/tax-engine/types/transfer-mixed-use-sale-split.types";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { parseAmount } from "./number-parse";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { mixedSaleSplitScope } from "./mixed-use-sale-split-scope";
import { depreciationSupport } from "./depreciation-scope";
import { saleSplitProvisoApplies } from "./sale-split-100-3-era";

/** 빈 칸은 「미입력」이다 — 0원과 구분한다(건물 철거 예외에서 건물 양도가액 0은 적법한 값이다). */
function entered(v: string | undefined): boolean {
  return (v ?? "").trim() !== "";
}

export function buildMixedSaleSplitFields(
  primary: AssetForm,
  form: Pick<TransferFormData, "assets" | "transferDate">,
): MixedUseSaleSplitFields {
  // 미리보기 경로(`burdened-gift-mixed-use-preview.ts`)는 자산 목록 없는 부분 폼으로 부른다 — 모르면 단건이 아닌 것으로 본다(안전측).
  const ctx = { isSingleAsset: (form.assets?.length ?? 0) === 1 };
  if (mixedSaleSplitScope(primary, ctx).status !== "ok") return {};

  const ratio = getOwnershipRatio(primary);
  const fractional = ratio < 1;
  const scale = (v: number): number => (fractional ? applyRatio(v, ratio) : v);
  const mode = primary.saleSplitMode ?? "apportioned";
  const out: MixedUseSaleSplitFields = {};

  if (mode === "actual" && entered(primary.landTransferPrice) && entered(primary.buildingTransferPrice)) {
    const land = parseAmount(primary.landTransferPrice);
    const building = parseAmount(primary.buildingTransferPrice);
    const landSent = scale(land);
    out.landTransferPrice = landSent;
    out.buildingTransferPrice = scale(land + building) - landSent;
    // 단서(영 §166⑧)는 2025.1.1. 이후 양도분만 — ⑤가 칸을 여는 조건과 같다.
    if (primary.saleSplitExemption && saleSplitProvisoApplies(form.transferDate)) {
      out.saleSplitExemption = primary.saleSplitExemption as NonNullable<MixedUseSaleSplitFields["saleSplitExemption"]>;
    }
  }
  // 감정평가가액 — `appraisal` 모드의 안분 basis이자 `actual` 모드의 30% 판정 비교 기준. 비율로만 쓰여 축척하지 않는다.
  if (mode === "actual" || mode === "appraisal") {
    const land = parseAmount(primary.landAppraisalAtTransfer);
    const building = parseAmount(primary.buildingAppraisalAtTransfer);
    if (land > 0) out.landAppraisalAtTransfer = land;
    if (building > 0) out.buildingAppraisalAtTransfer = building;
  }

  const dep = parseAmount(primary.depreciationAmount ?? "");
  if (dep > 0 && depreciationSupport(primary, ctx).status === "ok") out.commercialBuildingDepreciation = scale(dep);
  const bd = parseAmount(primary.mixedBuildingDirectTransferExpense ?? "");
  if (bd > 0) out.buildingDirectTransferExpense = scale(bd);
  return out;
}
