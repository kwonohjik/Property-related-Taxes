/**
 * 일반건물 ⑧ — **피상속인 취득일(토지·건물)** 과 **분리 OFF 일괄 취득가액** (2026-09-30 Zod↔엔진 필수 점검 2차).
 *
 * `transfer-tax-validate-gb.ts`(700줄 근접)에서 분리한 신규 규칙이다. ⑫ 거울은
 * `lib/api/transfer-tax-schema-required-refines-gb.ts`(D1·D3·I3) — 조건이 어긋나면 「⑧ 통과 ↔ ⑫ 400」이 된다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { PartAcqMode } from "./transfer-tax-split-acq-mode";

/**
 * 건물 파트의 **자기** 피상속인 취득일 — 분리 ON + 건물 상속일 때만 의미가 있다(그때만 건물 카드에 칸이 있다).
 *
 * 🔑 ④(`transfer-tax-api-gb.ts`)·⑧(아래)·⑤(`GeneralBuildingAcquisitionCards.tsx`)가 이 술어 하나를 쓴다 —
 *    분리 OFF로 되돌린 뒤 남은 값이 payload로 새면 엔진이 토지의 피상속인 취득일 대신 그 값을 쓴다.
 * ⚠️ 구 세션에는 필드가 없을 수 있다(`?? ""` — memory `feedback_new_asset_field_stale_sessionstorage_guard`).
 */
export function gbBuildingOwnDecedentDate(asset: AssetForm): string {
  if (!asset.hasSeperateLandAcquisitionDate) return "";
  if (asset.gbBuildingAcquisitionCause !== "inheritance") return "";
  return asset.gbBuildingDecedentAcquisitionDate ?? "";
}

/**
 * D1·D3 — 상속 파트의 피상속인 취득일(「소득세법」 §95④·§104②1호 단기보유 통산 기산일).
 *
 * 🔴 D1: 종전에는 일반건물 ⑧이 토지 상속의 피상속인 취득일을 요구하지 않았다 — 일반 자산 규칙
 *    (`transfer-tax-validate-acquisition.ts` 상속 분기)은 일반건물이 그보다 앞에서 위임되어 닿지 않는다.
 *    그런데 ⑫(`transfer-tax-schema-refines.ts`)는 최상위 `decedentAcquisitionDate`를 요구하므로
 *    **⑧ 통과 → 400** 막다른 길이었다.
 * 🔴 D3: 건물만 상속(분리 ON)이면 건물의 피상속인 취득일을 받을 칸이 없었다 — 상속개시일부터 기산해
 *    단기세율이 됐다. 토지도 상속이면 토지 값을 함께 쓴다(엔진 `buildingDecedent ?? decedent`와 같다).
 *
 * 부담부증여에서도 요구한다 — 날짜 축은 §159와 무관하게 보유기간에 소비된다(`CompanionAcqInheritanceBlock`).
 */
export function validateGbDecedentDates(asset: AssetForm, label: string): string | null {
  const landInherited = asset.acquisitionCause === "inheritance";
  if (landInherited && !asset.decedentAcquisitionDate)
    return `${label}: 피상속인 취득일을 입력하세요. 상속받은 토지의 단기보유 통산 기산일입니다 (소득세법 §95④·§104②1호).`;
  if (
    asset.gbBuildingAcquisitionCause === "inheritance" &&
    !gbBuildingOwnDecedentDate(asset) &&
    !(landInherited && asset.decedentAcquisitionDate)
  )
    return `${label}: 건물 피상속인 취득일을 입력하세요. 상속받은 건물의 단기보유 통산 기산일입니다 (소득세법 §95④·§104②1호).`;
  return null;
}

/**
 * I3′ — 분리 OFF · 매매 · 실거래가(두 파트 모두 비-환산) · 증축 없음: **일괄 취득가액** 필수.
 *
 * 🔴 종전에는 이 칸을 비워도 ⑧이 통과시켰다 — 일반 매매 규칙(`transfer-tax-validate-acquisition.ts`
 *    「취득가액을 입력하세요」)은 일반건물이 그보다 앞에서 위임되어 닿지 않는다. 실가 경로는
 *    취득가액 **0**으로 계산했다(실측 160,446,000 vs 67,309,000).
 * 분리 ON은 V-7(파트 칸)이, 증여는 「증여 신고가액」이, 증축은 「일괄 취득가액」 규칙이 따로 받는다.
 */
export function validateGbBundledAcquisitionPrice(
  asset: AssetForm,
  label: string,
  landMode: PartAcqMode,
  buildingMode: PartAcqMode,
): string | null {
  if (asset.hasSeperateLandAcquisitionDate) return null;
  if (asset.acquisitionCause !== "purchase") return null;
  if (asset.gbHasExtension) return null;
  if (landMode === "estimated" || buildingMode === "estimated") return null;
  if (parseAmount(asset.fixedAcquisitionPrice) > 0) return null;
  return `${label}: ${asset.isAppraisalAcquisition ? "감정가액" : "취득가액"}을 입력하세요. 토지·건물 일괄 실지거래가액입니다 (소득세법 §97①1호).`;
}
