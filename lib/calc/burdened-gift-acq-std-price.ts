/**
 * 부담부증여 기준시가 모드 — 「취득시 기준시가」 입력 술어·해석 (단일 출처).
 *
 * ## 왜 함수로 뽑는가
 *
 * 이 값은 §159①1호 A괄호의 취득가액(= 취득시 기준시가 × 채무비율)을 가른다. 종전에는
 * **입력 화면이 없고 validate도 검사하지 않아** 0이 그대로 엔진에 실렸다(실측: 취득가액 0 ·
 * 개산공제 0 → 양도차익 257,500,000원 과대). 그 결함을 고치면서 UI 게이트(⑤)와 validate(⑧)가
 * 생겼는데, 두 술어가 갈리면 **「칸은 뜨는데 계산은 막힌다」** 또는 그 반대가 된다.
 *
 * ⇒ 노출 조건과 값 해석을 여기 한 곳에 둔다. 호출부는 판단하지 않는다.
 *
 * 설계: docs/02-design/features/burdened-gift-acq-std-price-input-path.plan.md
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";

type AcqStdAsset = Pick<
  AssetForm,
  | "assetKind"
  | "transferType"
  | "bgValuationMode"
  | "standardPriceAtAcq"
  | "standardPricePerSqmAtAcq"
  | "acquisitionArea"
>;

/**
 * 「취득시 기준시가」를 **직접 입력받아야 하는** 상태인가 — UI 노출·validate 공용 게이트.
 *
 * 제외 이유:
 *  · 시가 모드    — 취득가액이 K-4(실지)·K-5(환산) 축으로 간다(§100①). 이 값을 쓰지 않는다.
 *  · `general_building` — `gbAcqLandPricePerSqm`·`gbAcqBuildingValue` 전용 입력이 있고 API가
 *    그것을 쓴다(`transfer-tax-api-burdened-gift.ts:169-180`). 여기 칸을 만들면 **엔진이
 *    쓰지 않는 값**을 입력하게 되고, validate가 그걸 요구하면 gb*를 채운 사용자가 막힌다.
 */
export function needsBgAcqStdPriceInput(asset: AcqStdAsset): boolean {
  return (
    asset.transferType === "burdened_gift" &&
    asset.bgValuationMode !== "sangjeungbeop_market" &&
    asset.assetKind !== "general_building"
  );
}

/**
 * 엔진에 실릴 취득시 기준시가(원) — **API 변환과 같은 fallback**을 쓴다.
 *
 * ⚠️ `land`는 총액이 없으면 `㎡당 공시지가 × 취득면적`으로 도출된다
 * (`transfer-tax-api-burdened-gift.ts:192-194`). validate가 총액만 보면 단가·면적을 채운
 * 토지 사용자가 부당하게 막힌다(UI 통과 ↔ validate 차단 모순 — components/calc/CLAUDE.md ⑧).
 */
export function resolveBgAcqStdPrice(asset: AcqStdAsset): number {
  const total = parseAmount(asset.standardPriceAtAcq) || 0;
  if (total > 0) return total;
  if (asset.assetKind !== "land") return 0;
  const perSqm = parseAmount(asset.standardPricePerSqmAtAcq) || 0;
  const area = parseFloat((asset.acquisitionArea || "").replace(/,/g, "")) || 0;
  return Math.floor(perSqm * area);
}
