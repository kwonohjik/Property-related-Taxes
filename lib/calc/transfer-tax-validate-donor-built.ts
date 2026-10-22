/**
 * ⑧ 이월과세 × 증여자 신축·증축(소득세법 §114조의2) 검증 — `validateCarryoverAsset`의 (e) 환산 검증 뒤에서 부른다.
 *
 * 규칙은 ⑫(`transfer-tax-schema-donor-built.ts`)·엔진(`assertDonorBuiltInput`)과 **같은 조건**이다 — UI 통과 ↔ 400 모순 0.
 * 게이트는 ⑤·④와 같은 술어(`donorBuiltActive`) — 범위 밖에서 켜 둔 stale 토글은 요구하지 않는다(화면에 없는 칸을 요구하지 않는다).
 * 신축·증축일을 증여자 취득일로 **대신 채우지 않는다**(자동 fallback 금지) — 비면 차단한다.
 */
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { donorBuiltActive, donorBuiltNeedsHousingSplit } from "./donor-built-scope";
import { validateSaleStdAndAppraisal } from "./transfer-tax-validate-split-sale-std";
import { fieldError } from "./transfer-tax-validate-field";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function validateDonorBuilt(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  ctx: { isNonPrimaryAsset: boolean },
): string | null {
  if (!donorBuiltActive(asset, { transferDate: formTransferDate, isNonPrimary: ctx.isNonPrimaryAsset })) return null;
  const c = asset.carryover!;

  if (c.donorBuiltType === "")
    return fieldError("carryover.donorBuiltType", `${label}: 증여자가 신축한 건물인지 증축한 건물인지 구분을 선택하세요 (소득세법 §114조의2).`);
  if (!c.donorBuiltDate)
    return fieldError(
      "carryover.donorBuiltDate",
      `${label}: 증여자의 ${c.donorBuiltType === "extension" ? "증축 완공일" : "신축 취득일(사용승인서 교부일 등)"}을 입력하세요 — 증여자 취득일로 대신 채우지 않습니다 (5년 기산점).`,
    );
  if (c.donorBuiltDate < c.donorAcquisitionDate)
    return fieldError("carryover.donorBuiltDate", `${label}: 신축·증축일은 증여자 취득일(${c.donorAcquisitionDate}) 이후여야 합니다.`);
  if (c.donorBuiltDate > c.giftRegistryDate)
    return fieldError("carryover.donorBuiltDate", `${label}: 신축·증축일은 증여 등기접수일(${c.giftRegistryDate}) 이전이어야 합니다 — 증여자가 신축·증축한 건물이어야 합니다.`);

  if (c.donorBuiltType === "extension") {
    if (!(parseDecimal(c.donorBuiltExtensionArea) > 0))
      return fieldError("carryover.donorBuiltExtensionArea", `${label}: 증축 바닥면적 합계를 입력하세요 (85㎡ 초과만 대상입니다).`);
    if (!(parseAmount(c.donorBuiltExtensionStdPrice) > 0))
      return fieldError(
        "carryover.donorBuiltExtensionStdPrice",
        `${label}: 증축 부분의 증여자 취득(완공) 당시 기준시가 총액을 입력하세요 — 가산세 기준은 증축한 부분에 한정한 환산취득가액입니다.`,
      );
  }

  if (donorBuiltNeedsHousingSplit(asset)) {
    if (!(parseAmount(c.donorBuiltLandPricePerSqm) > 0))
      return fieldError("carryover.donorBuiltLandPricePerSqm", `${label}: 증여자 취득 당시 토지의 ㎡당 개별공시지가를 입력하세요 — 개별주택가격을 토지분·건물분으로 나누는 데 필요합니다.`);
    if (!(parseDecimal(c.donorBuiltLandArea) > 0))
      return fieldError("carryover.donorBuiltLandArea", `${label}: 토지 면적(㎡)을 입력하세요 — 토지 기준시가 = ㎡당 개별공시지가 × 면적.`);
    if (!(parseAmount(c.donorBuiltBuildingStdAtAcq) > 0))
      return fieldError(
        "carryover.donorBuiltBuildingStdAtAcq",
        `${label}: 증여자 취득 당시 건물 기준시가를 입력하세요 — 합계에서 토지분을 빼 대신 구하지 않습니다 (소득세법 §99①1호 나목).`,
      );
    // 양도 당시 토지·건물 기준시가 + 양도가액 구분(Q-6 b) — 기존 split 규칙을 그대로 쓴다(양쪽 기준시가는 건물분 안분과 양도가액 안분에 둘 다 필요)
    const sale = validateSaleStdAndAppraisal(asset, label, formTransferDate, true, "estimated", "estimated", { isNonPrimary: ctx.isNonPrimaryAsset });
    if (sale) return sale;
  }
  return null;
}
