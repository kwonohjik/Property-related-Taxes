/**
 * 일반건물 ⑧ — **피상속인 취득일(토지·건물)** 과 **분리 OFF 일괄 취득가액** (2026-09-30 Zod↔엔진 필수 점검 2차).
 *
 * `transfer-tax-validate-gb.ts`(700줄 근접)에서 분리한 신규 규칙이다. ⑫ 거울은
 * `lib/api/transfer-tax-schema-required-refines-gb.ts`(D1·D3·I3) — 조건이 어긋나면 「⑧ 통과 ↔ ⑫ 400」이 된다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { PartAcqMode } from "./transfer-tax-split-acq-mode";
import { gbPartAllowedModes } from "./transfer-tax-gb-toggle-patches";
// ⑫ refine(Q-A3)과 **같은 문구**를 쓴다 — UI 통과 ↔ 서버 400 문구 불일치 방지.
import { GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE } from "@/lib/api/transfer-tax-schema-required-refines-gb";
import { fieldError } from "./transfer-tax-validate-field";
import { isBeforeBuildingStdPriceNotice } from "./commercial-164-6-proviso";

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
    return fieldError("decedentAcquisitionDate", `${label}: 피상속인 취득일을 입력하세요. 상속받은 토지의 단기보유 통산 기산일입니다 (소득세법 §95④·§104②1호).`);
  if (
    asset.gbBuildingAcquisitionCause === "inheritance" &&
    !gbBuildingOwnDecedentDate(asset) &&
    !(landInherited && asset.decedentAcquisitionDate)
  )
    return fieldError("gbBuildingDecedentAcquisitionDate", `${label}: 건물 피상속인 취득일을 입력하세요. 상속받은 건물의 단기보유 통산 기산일입니다 (소득세법 §95④·§104②1호).`);
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
  /**
   * 분리 OFF 자산 단위 **매매사례가액**은 `similarSalesValue`가 총액 칸이다(④ F-2 — 감정·실가는 `fixedAcquisitionPrice`).
   * ④가 실제로 싣는 칸과 **같은 칸**을 요구해야 「⑧ 통과 ↔ ⑫ 400」이 없다.
   */
  const salesCase = landMode === "salesCase" && buildingMode === "salesCase";
  if (parseAmount(salesCase ? asset.similarSalesValue : asset.fixedAcquisitionPrice) > 0) return null;
  if (salesCase)
    return fieldError("similarSalesValue", `${label}: 매매사례가액을 입력하세요. 토지·건물 일괄 매매사례가액입니다 (소득세법 시행령 §176의2③1호).`);
  return fieldError("fixedAcquisitionPrice", `${label}: ${asset.isAppraisalAcquisition ? "감정가액" : "취득가액"}을 입력하세요. 토지·건물 일괄 실지거래가액입니다 (소득세법 §97①1호).`);
}

/**
 * §163⑨ **단서 2호 비교값**(취득시 건물기준시가)이 필요한 일반건물인가 — ⑤ 노출·⑧ 요구 공용 (2026-09-30 G2).
 *
 * 건물 기준시가 고시 전 상속·증여 건물은 평가액(신고가액)과 §164⑤ 가액 중 **많은 금액**이 취득가액이다
 * (「소득세법 시행령」 §163⑨ 단서 2호). 비교값이 없으면 평가액이 그대로 쓰여, 더 작을 때 조용히 과대과세다.
 *
 * 종전 ⑤는 이 칸을 환산·증축·부담부증여·§100② 안분 필요(`needsGbActualAcqStdPrice`)일 때만 열었다.
 * 상속·증여 파트는 실가가 강제되고(§97①1호 단서) 파트별 평가액이 있으면 안분도 필요 없어,
 * **⑧이 요구하는데 칸이 없는** 조합이 생겼다.
 *
 * 증여는 **분리 ON**일 때만 — 분리 OFF에서는 ⑧이 먼저 「토지·건물 취득일 다름을 켜세요」로 안내한다
 * (자산 단위 총액으로는 파트별 비교가 안 된다).
 */
export function needsGbSec1639BuildingStdPrice(
  asset: Pick<AssetForm, "gbBuildingAcquisitionCause" | "acquisitionDate" | "hasSeperateLandAcquisitionDate">,
): boolean {
  if (!isBeforeBuildingStdPriceNotice(asset.acquisitionDate)) return false;
  if (asset.gbBuildingAcquisitionCause === "inheritance") return true;
  return asset.gbBuildingAcquisitionCause === "gift" && !!asset.hasSeperateLandAcquisitionDate;
}

/**
 * R2 — 분리 ON · **매매사례 파트**의 매매사례가액 필수 (A2 · 설계서 §4.1).
 *
 * 매매사례 파트의 값은 `*AcquisitionPrice`가 아니라 `*SalesCaseValue`다(④ F-1이 그 칸을 싣고 ⑫ I2가 같은 칸을 요구한다).
 * 주택 split(`transfer-tax-validate-split.ts`)의 같은 규칙과 문구·필드가 같다. 상속·증여 파트는 V2가 먼저 막으므로 이 분기에 오지 않는다.
 */
export function validateGbPartSalesCaseValues(
  asset: AssetForm,
  label: string,
  landMode: PartAcqMode,
  buildingMode: PartAcqMode,
): string | null {
  if (landMode === "salesCase" && !parseAmount(asset.landSalesCaseValue ?? ""))
    return fieldError("landSalesCaseValue", `${label}: 토지 매매사례가액을 입력하세요 — 매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다 (소득령 §176의2③1호).`);
  if (buildingMode === "salesCase" && !parseAmount(asset.buildingSalesCaseValue ?? ""))
    return fieldError("buildingSalesCaseValue", `${label}: 건물 매매사례가액을 입력하세요 — 매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다 (소득령 §176의2③1호).`);
  return null;
}

/**
 * R8 — **이월과세 파트 × 감정가액·매매사례가액** 차단 (stale 방어 · A-통합 Q-A).
 *
 * 이월과세 카드가 취득가액을 증여자 취득가액 승계(시나리오 A/B)로 교체하므로 감정·매매사례는 의미가 없다(「소득세법」 §97의2①).
 * 선택지는 UI 필터(`gbPartAllowedModes`)와 **같은 leaf**로 판정한다 — 이월과세 파트 라디오는 {실거래가, 환산취득가}만 보인다.
 * 현행 {실거래가, 환산취득가} 경로는 건드리지 않는다.
 *
 * 분리 ON은 파트 라디오(`FieldCard field=landAcqMode`)로 점프한다. 분리 OFF는 고칠 칸이 없다 — 화면 전환이 같은 조합의
 * 감정·매매사례 플래그를 비우므로(`gbUnifiedCarryoverClearPatch`) 여기 도달하는 것은 복원 stale뿐이며, field를 달지 않아 카드로 후퇴한다.
 */
export function validateGbCarryoverPartModes(
  asset: AssetForm,
  label: string,
  landMode: PartAcqMode,
  buildingMode: PartAcqMode,
): string | null {
  const isSeparate = !!asset.hasSeperateLandAcquisitionDate;
  const block = (part: "토지" | "건물") => {
    const subject = part === "토지" ? "토지는" : "건물은";
    const msg = `${label}: 이월과세로 취득한 ${subject} 취득가액을 감정가액·매매사례가액으로 산정할 수 없습니다. 이월과세는 증여자의 취득가액을 승계합니다 (소득세법 §97의2①). 「실거래가」를 선택하세요.`;
    return isSeparate ? fieldError(part === "토지" ? "landAcqMode" : "buildingAcqMode", msg) : msg;
  };
  if (asset.acquisitionCause === "carryover_gift" && !gbPartAllowedModes("carryover_gift").includes(landMode)) return block("토지");
  if (asset.gbBuildingAcquisitionCause === "carryover_gift" && !gbPartAllowedModes("carryover_gift").includes(buildingMode))
    return block("건물");
  return null;
}

/**
 * R9 — **증축 × 자산 단위(분리 OFF) 감정가액·매매사례가액** 차단 (Q-A3 · 사용자 확정 2026-10-06).
 *
 * 3파트 안분(토지·원건물·증축분)은 자산 단위 추계 총액을 모른다 — 파트 값이 없는 파트를 「원건물 일괄 실가」로 계산하고 개산공제를 0으로 둔다
 * (G-2의 3-way판). 문구는 ⑫ refine(`GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE`)과 같다. 앵커는 자산 단위 라디오(`data-field=useEstimatedAcquisition`).
 * 분리 ON 파트 감정·매매사례는 파트 값이 있어 3파트 경로가 처리하므로 막지 않는다(`applyPartAcqModes`).
 */
export function validateGbExtensionUnifiedEstimate(
  asset: AssetForm,
  label: string,
  landMode: PartAcqMode,
): string | null {
  if (asset.hasSeperateLandAcquisitionDate || !asset.gbHasExtension) return null;
  if (landMode !== "appraisal" && landMode !== "salesCase") return null;
  return fieldError("useEstimatedAcquisition", `${label}: ${GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE}`);
}
