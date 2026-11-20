/**
 * 양도 대상이 조합원입주권일 때 **주택 양도 전용 사실을 뺀** 양도 자산 (2026-11 리뷰 D-63 · D-67).
 *
 * 판정 메뉴 ②는 주택 → 입주권으로 바꿔도 취득 원인(증여·상속)·세대 사실·용도변경 입력을 지우지 않는다(되돌리면 복귀하는 관례).
 * 그 숨은 값이 입주권 화면의 「취득 당시」 기준일·라벨·거주 경고(D-67)와 ④ `wasRegulatedAtAcquisition`(D-67), 계산기 핸드오프의
 * 취득 원인 기본 선택(D-63)을 바꿨다. 입주권 양도에는 ⑤가 그 칸을 그리지 않으므로 읽는 쪽이 이 뷰를 쓴다 — 저장값은 바꾸지 않는다.
 */
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

const HOUSING_ONLY_KEY = /^(gift|donor|decedent)[A-Z]/;

export function housingOnlyFactsCleared(asset: AssetForm): AssetForm {
  const defaults = makeDefaultAsset(1) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...asset, acquisitionCause: "purchase", hasNonHousingConversion: false };
  for (const k of Object.keys(out)) if (HOUSING_ONLY_KEY.test(k)) out[k] = defaults[k];
  return out as unknown as AssetForm;
}

/** 판정 메뉴 양도 자산 — 주택 양도면 그대로, 입주권 양도면 주택 전용 사실을 뺀 사본. */
export function judgmentSaleAssetView(form: OneHouseJudgmentFormData): AssetForm {
  const primary = form.assets[0];
  return judgmentSaleIsHousing(form) ? primary : housingOnlyFactsCleared(primary);
}
