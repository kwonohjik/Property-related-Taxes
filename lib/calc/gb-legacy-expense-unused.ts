/**
 * 일반건물 — 이전 입력 형식 「필요경비」(`directExpenses`)가 **계산에 쓰이지 않는** 조합 (⑤ 안내 · ⑧ 차단이 같은 술어를 읽는다).
 *
 * 계획서 `docs/00-pm/gb-legacy-direct-expense-estimated-mixed.plan.md` Q-1 a.
 *
 * 옛 칸은 `input.expenses` → 일반건물 `actualExpenses` 로만 가고, **실가 경로만** 읽는다(`general-building-route-actual.ts:95`).
 * 환산 파트가 있거나 실가·감정(매매사례)이 섞이면 환산·혼합 카드 경로로 가서(`general-building-part-cards.ts` `estimatedPayloadOf`) 읽히지 않는다 —
 * 값이 침묵 누락된다. 값의 성질(자본적지출/양도비)을 알 수 없어(분리 ON 혼합에서 같은 금액이 0~전액으로 갈린다) 어느 칸으로 옮길지 지어내지 않고
 * 입력자가 나눠 입력하게 한다(증축 `gbExtensionLegacyExpenseUnused` 와 같은 교리 — W-5).
 *
 * 거짓인 경우(막지 않는다):
 *  · 실가 일괄 · 실가+실가 — 실가 경로가 읽는다.
 *  · 모든 파트가 감정·매매사례 — 개산공제뿐이라 옛 칸이 안 쓰이는 것이 법문상 맞다(§97②2호 본문).
 *  · 자본적지출·양도비 칸에 값이 있다 — 옛 칸은 화면에서 숨고(`AssetSectionExpense` 게이트) ④도 선언 채널을 우선한다.
 *  · 증축(전용 술어가 있다) · 부담부증여(`bgExpenseInputsUnused` 가 따로 처리) · 매매 이외 취득원인(이월과세·상속·증여·신축 — 미측정, 계획서 V-6).
 *
 * ⚠️ 분리 ON 실가+실가에서 단건·함께 양도 주 자산은 자산 단위 플래그 `useEstimatedAcquisition` 이 남아 있으면 옛 칸이 누락되지만(④가 0 으로 싣는다),
 *    원인이 다른 별건이다(계획서 §13 V-1) — 이 술어는 모드만 본다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "./number-parse";
import { gbPartModes } from "./transfer-tax-split-acq-mode";

export const GB_LEGACY_EXPENSE_UNUSED_MESSAGE =
  "「직접 귀속 필요경비 — 이전 입력 형식」은 환산취득가액이 있거나 실지거래가액과 감정·매매사례가액이 섞인 일반건물에서는 계산에 쓰이지 않습니다(소득세법 §97②). 금액을 「자본적지출」과 「양도비」 칸에 나눠 입력하고 이 칸은 비우세요.";

const isPurchase = (cause: string | undefined) => !cause || cause === "purchase";

export function gbLegacyExpenseUnused(asset: AssetForm): boolean {
  if (asset.assetKind !== "general_building" || asset.gbHasExtension) return false;
  if (!parseAmount(asset.directExpenses)) return false;
  // 숨은 칸을 지목하지 않는다 — 자본적지출·양도비 칸에 값이 있으면 옛 칸은 화면에서 숨는다.
  if (parseAmount(asset.capitalExpenditure) || parseAmount(asset.transferExpense)) return false;
  if (asset.transferType === "burdened_gift" || asset.acquisitionCause === "burdened_gift") return false;
  if (!isPurchase(asset.acquisitionCause) || !isPurchase(asset.gbBuildingAcquisitionCause)) return false;
  const { land, building } = gbPartModes(asset);
  if (land === "estimated" || building === "estimated") return true;
  const deductionOnly = (m: string) => m === "appraisal" || m === "salesCase";
  return (land === "actual" || building === "actual") && (deductionOnly(land) || deductionOnly(building));
}
