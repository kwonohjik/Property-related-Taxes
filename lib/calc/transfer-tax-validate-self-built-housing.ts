/**
 * ⑧ 일체 주택 **본인 신축** × §114조의2 가산세 base 건물분 입력 검증 — `validateAssetAcquisition` 의 신축·증축 블록 뒤에서 부른다.
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.7 · §9 PR-2 · 사용자 확정 Q-2)
 *
 * · 요구 범위는 ⑤ 카드가 열리는 조건·④ 전송 조건과 **같은 술어**(`selfBuiltHousingScope`)다 — 숨은 입력은 요구하지 않는다(5년 경과·방식 변경·PHD·분리 등은 null).
 * · 규칙은 ⑫(`selfBuiltHousingShape`)·엔진(`assertSelfBuiltHousingInput`)과 **같은 집합**이다 — ⑧ 통과 ⇒ 200, ⑧ 차단 ⇒ 입력 경로 있는 칸으로 이동.
 * · 자동 채움·합계 뺄셈 없음 — 토지·건물 기준시가는 사용자가 입력한 값으로만 법정 비례(영 §166⑥)한다. 미입력은 칸을 지목해 차단한다.
 * · 주택공시가격 H·H_T 는 기존 환산·감정 검증이 이미 요구하므로 여기서 다시 요구하지 않는다(중복 요구 금지).
 * · 순서는 화면 순서: (감정) 건물 감정가액 → (가) 취득 당시 토지 단가 → 면적 → 건물 기준시가 → (나) 양도 당시.
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { selfBuiltHousingScope } from "./self-built-housing-scope";
import { validateSaleStdAndAppraisal } from "./transfer-tax-validate-split-sale-std";
import { fieldError } from "./transfer-tax-validate-field";

const HEAD = "본인 신축 일체 주택은 건물분만 가산세 대상입니다(소득세법 §114조의2①)";

export function validateSelfBuiltHousing(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  ctx: { isNonPrimaryAsset: boolean },
): string | null {
  const scope = selfBuiltHousingScope(asset, { transferDate: formTransferDate, isNonPrimary: ctx.isNonPrimaryAsset });
  if (!scope) return null;

  if (scope.directAppraisal) {
    const direct = parseAmount(asset.selfBuiltBuildingAppraisal);
    if (!(direct > 0))
      return fieldError(
        "selfBuiltBuildingAppraisal",
        `${label}: ${HEAD} — 감정평가서에 구분 표시된 건물 감정가액을 입력하세요. 건물 가액이 구분 표시되어 있지 않으면 「건물 가액이 구분 표시되어 있지 않다」를 켜세요.`,
      );
    const total = parseAmount(asset.fixedAcquisitionPrice);
    if (total > 0 && direct > total)
      return fieldError("selfBuiltBuildingAppraisal", `${label}: 건물 감정가액(${direct.toLocaleString()}원)이 감정가액 총액(${total.toLocaleString()}원)보다 클 수 없습니다.`);
    return null;
  }

  if (scope.acq) {
    if (!(parseAmount(asset.standardPricePerSqmAtAcq) > 0))
      return fieldError(
        "standardPricePerSqmAtAcq",
        `${label}: ${HEAD} — 취득 당시 토지의 ㎡당 개별공시지가를 입력하세요 (주택공시가격을 토지분·건물분으로 나누는 데 필요합니다).`,
      );
    if (!(parseDecimal(asset.acquisitionArea) > 0))
      return fieldError("acquisitionArea", `${label}: 토지 면적(㎡)을 입력하세요 — 취득 당시 토지 기준시가 = ㎡당 개별공시지가 × 면적.`);
    if (!(parseAmount(asset.buildingStandardPriceAtAcq) > 0))
      return fieldError(
        "buildingStandardPriceAtAcq",
        `${label}: 취득 당시 건물 기준시가를 입력하세요 — 합계에서 토지분을 빼 대신 구하지 않습니다 (소득세법 §99①1호 나목).`,
      );
  }

  if (scope.sale) {
    // 양도 당시 토지·건물 기준시가 + 양도가액 구분 — 기존 split 규칙 그대로(두 기준시가는 건물분 안분과 양도가액 안분에 둘 다 필요하다)
    const sale = validateSaleStdAndAppraisal(asset, label, formTransferDate, true, "estimated", "estimated", { isNonPrimary: ctx.isNonPrimaryAsset });
    if (sale) return sale;
  }
  return null;
}
