/**
 * 일반건물 증축 × 파트 가격 대체 — 이전 입력 형식 「필요경비」(`directExpenses`)가 계산에 쓰이지 않는 조합 (⑧ 차단 술어).
 *
 * 계획서 `docs/00-pm/gb-extension-actual-expenses.plan.md` Q-5 a (2026-10-22). 증축 ④는 이전 형식 값을 「일괄 취득 시 필요경비」
 * 슬롯(성질 `mixed`)으로 보내는데, 3-way 엔진은 파트 가격(분리 ON 실가·§163⑨ 상속·증여 평가액)으로 대체한 파트의 필요경비를
 * 덮어쓴다(`general-building-extension.ts` Step 2.5) — 그 값이 사라진다(⑧ 통과 · 실측 1,200만 → 0).
 * 두 성질(자본적지출·양도비)이 섞인 덩어리라 어느 축으로 나눌지 근거가 없으므로(W-5 교리) 계산하지 않고 칸을 나눠 입력하게 한다.
 *
 * ④ 사슬(`transfer-tax-api-gb.ts` `bundledExpenses`)과 같은 채택 조건 · 같은 파트 가격 leaf(`gbSec1639Acquisition`)를 읽는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "./number-parse";
import { gbPartModes } from "./transfer-tax-split-acq-mode";
import { gbSec1639Acquisition } from "./transfer-tax-api-gb-sec163-9";

export function gbExtensionLegacyExpenseUnused(asset: AssetForm, transferDate?: string): boolean {
  if (asset.assetKind !== "general_building" || !asset.gbHasExtension) return false;
  // ④ 사슬이 이전 형식 값을 채택하는 조건 — 일괄 취득 필요경비가 없고 양도비도 없을 때만.
  if (!parseAmount(asset.directExpenses)) return false;
  if (parseAmount(asset.gbBundledAcquisitionExpenses) || parseAmount(asset.transferExpense)) return false;
  // 자본적지출이 있으면 그 칸은 화면에서 숨는다(`AssetSectionExpense` 이전 형식 칸 게이트) — 숨은 칸을 지목하면 막다른 길이다.
  if (parseAmount(asset.capitalExpenditure)) return false;
  const isBurdenedGift = asset.transferType === "burdened_gift" || asset.acquisitionCause === "burdened_gift";
  const { landPartPrice, buildingPartPrice } = gbSec1639Acquisition(asset, transferDate, isBurdenedGift);
  const { land: landMode, building: buildingMode } = gbPartModes(asset);
  return (!!landPartPrice && landMode !== "estimated") || (!!buildingPartPrice && buildingMode !== "estimated");
}
