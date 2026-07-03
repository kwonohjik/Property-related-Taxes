/**
 * 비사업용 토지 정밀판정 필수 입력 검증 (⑧)
 *
 * transfer-tax-validate-asset.ts에서 분리(800줄 정책).
 *
 * 무조건 사업용 의제(§168의14③) 성립 시 지목·용도지역·기간기준 상세 입력은 UI(NblSectionContainer)에서
 * 비활성 + 엔진이 Step 2에서 무시 → 검증도 동일 스킵(UI 통과↔validate 차단 모순 방지,
 * memory feedback_validation_sync_8th_point). 판정 기준은 UI와 동일 어댑터(단일 진실).
 * 면적은 UI 비활성 대상이 아니고 평가에 필요할 수 있으므로 의제 시에도 유지.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { GRACE_REASON_SPECS } from "@/lib/tax-engine/non-business-land/grace-reason-period";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { isUrbanResidentialCommercialIndustrial } from "@/lib/tax-engine/non-business-land/urban-area";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { validateNblOtherLand } from "./transfer-tax-validate-nbl-other";

/** 비사업용 토지 정밀판정(nblUseDetailedJudgment) 필수 입력 검증. 첫 오류 메시지 또는 null. */
export function validateNblDetailedJudgment(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  if (asset.assetKind !== "land" || !asset.nblUseDetailedJudgment) return null;

  const nblExempt = evaluateUnconditionalExemption(asset, formTransferDate ?? "").isExempt;
  if (!nblExempt && !asset.nblLandType)
    return `${label}: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요.`;
  if (!nblExempt && !asset.nblZoneType)
    return `${label}: 비사업용 토지 정밀판정 — 용도지역을 선택하세요.`;
  if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
    return `${label}: 비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.`;

  // 무조건 의제 성립 시 아래 기간기준 상세 입력은 엔진이 무시 + UI 비활성 → 검증 스킵
  if (nblExempt) return null;

  // 주택부수토지(§168-12) 도시지역 주·상·공 배율은 수도권 여부에 따라 3배/5배로 갈린다.
  // 미선택 시 엔진(housing-land.ts)이 수도권(불리)로 default 적용 → 유리-default 정책상 계산 전 차단.
  // 배율이 실제로 달라지는 urban 주·상·공 zoneType에서만 요구(녹지·도시 外는 수도권 무관 → 차단 금지).
  if (
    asset.nblLandType === "housing_site" &&
    isUrbanResidentialCommercialIndustrial(asset.nblZoneType as ZoneType) &&
    !asset.nblIsMetropolitanArea
  ) {
    return `${label}: 주택부수토지 도시지역 주·상·공은 수도권 여부에 따라 배율이 달라집니다(수도권 3배 / 수도권 밖 5배). 수도권 여부를 선택하세요.`;
  }

  // §168의14② 양도일 의제 — 사유 선택 시 의제일 필수 (자동 fallback 금지)
  if (asset.nblDeemedTransferReason && asset.nblDeemedTransferReason !== "none" && !asset.nblDeemedTransferDate)
    return `${label}: 양도일 의제 사유를 선택했습니다. 의제일(최초 경매기일·공매일·공고일 등)을 입력하세요.`;
  // §168의11①·⑤·⑥ 기타토지 정밀판정 입력 검증 (별도 파일 분리 — 800줄 정책)
  if (asset.nblLandType === "other_land") {
    const nblOtherErr = validateNblOtherLand(asset, label);
    if (nblOtherErr) return nblOtherErr;
  }
  // §168의11② 수입금액비율 — 업종 선택 시 당해 수입금액·토지가액 필수
  if (asset.nblLandType === "other_land" && asset.nblRevenueBusinessType) {
    if (!asset.nblRevenueCurrentRevenue || parseAmount(asset.nblRevenueCurrentRevenue) <= 0)
      return `${label}: 수입금액비율 업종 선택 시 당해 과세기간 수입금액을 입력하세요.`;
    if (!asset.nblRevenueCurrentLandValue || parseAmount(asset.nblRevenueCurrentLandValue) <= 0)
      return `${label}: 수입금액비율 업종 선택 시 당해 토지가액을 입력하세요.`;
    // §168의11③2호 공통수입 안분 토글 ON → 당해 공통수입·그 밖의 토지가액 필수쌍
    if (asset.nblRevenueCommonApportion) {
      if (!asset.nblRevenueCommonRevenue || parseAmount(asset.nblRevenueCommonRevenue) <= 0)
        return `${label}: 공통수입 안분 시 당해 공통수입금액을 입력하세요.`;
      if (!asset.nblRevenueOtherLandValue || parseAmount(asset.nblRevenueOtherLandValue) <= 0)
        return `${label}: 공통수입 안분 시 당해 '그 밖의 토지가액'을 입력하세요.`;
      // 직전 공통쌍은 선택이나 한쪽만 입력 시 나머지도 필수
      const pc = parseAmount(asset.nblRevenuePriorCommonRevenue || "0");
      const po = parseAmount(asset.nblRevenuePriorOtherLandValue || "0");
      if ((pc > 0) !== (po > 0))
        return `${label}: 직전 공통수입 안분은 공통수입금액과 '그 밖의 토지가액'을 함께 입력하세요.`;
    }
  }
  // §168의14①·§83의5① 유예기간 — 사유별 필수 기산일/종료일 (자동 안분 fallback 금지)
  for (const g of asset.nblGracePeriods ?? []) {
    const spec = GRACE_REASON_SPECS[g.reasonCode];
    if (!spec) continue;
    if (spec.lengthKind === "compound_5") {
      if (!g.secondaryDate) return `${label}: 건설 착공(5호) 유예기간 — 착공일을 입력하세요.`;
    } else if (spec.lengthKind === "fixed_from_anchor") {
      if (!spec.anchorFromAcquisition && !g.anchorDate)
        return `${label}: ${spec.label} 유예기간 — 기산일을 입력하세요.`;
    } else {
      // event_window · anchor_to_input_end
      if (!g.anchorDate) return `${label}: ${spec.label} 유예기간 — 개시일을 입력하세요.`;
      if (!g.endDate) return `${label}: ${spec.label} 유예기간 — 종료일을 입력하세요.`;
    }
  }
  return null;
}
