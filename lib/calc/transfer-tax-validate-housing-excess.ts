/**
 * ⑧ — 같은 날 취득 주택의 배율 초과 부수토지 분리 입력(취득시 3칸 + 양도시 2칸) 필수 (#17 · S08-1).
 *
 * 토지 면적이 정착면적 × 법정 배율을 넘으면 초과분(비사업용 토지 — 소득세법 §104의3①5호)을 떼어 과세해야 하고, 떼려면 토지·건물 가액 구분이
 * 필요하다. 법정 구분 방식은 영 §166⑥ · 부가가치세법 시행령 §64①1호의 **기준시가 안분**이다(자동 안분 fallback이 아니다).
 *
 * 요구는 ⑤ 입력 카드(`HousingExcessSplitCard`)가 열리는 조건과 **같은 술어**(`housingExcessNeedsLandSplit`)에서만 걸린다 —
 * 노출 ⇔ 요구 ⇔ ④ 전송 ⇔ 엔진 게이트가 한 값이라 칸 없는 요구(막다른 길)가 없다. 입력 순서는 계산 순서(취득시 → 양도시)다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { housingExcessAreaOfAsset, housingExcessNeedsLandSplit, housingExcessZonePending } from "./housing-excess-split";
import { housingExcessCapexParts, housingExcessNeedsCapexSplit } from "./housing-excess-split";
import { resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";
import { fieldError } from "./transfer-tax-validate-field";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const positive = (v: string | undefined): boolean => parseAmount(v ?? "") > 0;

export function validateHousingExcessSplitInputs(
  a: AssetForm,
  label: string,
  transferDate: string | undefined,
  isPrimary: boolean,
): string | null {
  if (housingExcessZonePending(a, isPrimary)) {
    return fieldError(
      "appurtenantLandZone",
      `${label}: 토지 면적이 건물 정착면적의 3배를 넘습니다 — 부수토지 인정 한도 배율을 정하려면 「부수토지 소재지 구분」을 선택하세요. 한도 초과분은 1세대1주택 비과세에서 제외되고 비사업용 토지로 과세됩니다 (소득세법 §104의3①5호·시행령 §154⑦·§168의12).`,
    );
  }
  if (!housingExcessNeedsLandSplit(a, transferDate, isPrimary)) return null;
  const excess = housingExcessAreaOfAsset(a, transferDate);
  const head =
    `${label}: 토지 면적이 건물 정착면적의 지역별 배율 한도를 ${excess.toFixed(2)}㎡ 넘습니다 — 한도 초과분은 1세대1주택 비과세에서 제외되고 비사업용 토지로 분리 과세하므로 ` +
    "토지·건물 가액을 나눌 기준시가가 필요합니다 (소득세법 §89①3호·§104의3①5호·시행령 §166⑥).";
  if (!positive(a.standardPriceAtAcq)) {
    return fieldError("standardPriceAtAcq", `${head} 취득 당시 개별주택가격(부수토지 포함 총액)을 입력하세요.`);
  }
  if (!positive(a.standardPricePerSqmAtAcq)) {
    return fieldError("standardPricePerSqmAtAcq", `${head} 취득 당시 ㎡당 개별공시지가를 입력하세요.`);
  }
  if (!positive(a.buildingStandardPriceAtAcq)) {
    return fieldError("buildingStandardPriceAtAcq", `${head} 취득 당시 건물 기준시가를 입력하세요 (개별주택가격을 토지 : 건물 기준시가 비율로 나눕니다).`);
  }
  if (!(resolveLandStdAtTransfer(a) != null && (resolveLandStdAtTransfer(a) ?? 0) > 0)) {
    return fieldError("standardPricePerSqmAtTransfer", `${head} 양도 당시 ㎡당 개별공시지가를 입력하세요 (양도 당시 토지 기준시가 = 단가 × 양도 면적).`);
  }
  if (!positive(a.buildingStandardPriceAtTransfer)) {
    return fieldError("buildingStandardPriceAtTransfer", `${head} 양도 당시 건물 기준시가를 입력하세요.`);
  }
  // #17 후속 — 자산 전체 자본적지출의 토지분(건물분 = 전체 − 토지분). 분리 계산은 파트 값만 읽고, 자본적지출은 §100② 후문의 안분 대상이 아니다.
  if (housingExcessNeedsCapexSplit(a, transferDate, isPrimary)) {
    const { total, land, building } = housingExcessCapexParts(a);
    const capexHead =
      `${label}: 배율 초과분을 나눠 계산하므로 자본적지출 ${total.toLocaleString()}의 토지분·건물분 귀속이 필요합니다 — 자본적지출은 공통 비용 안분 대상이 아닙니다 (소득세법 §100② 후문 · §97②2호).`;
    if (land === null) return fieldError("housingExcessLandCapex", `${capexHead} 그중 토지분 자본적지출을 입력하세요 (전부 건물분이면 0).`);
    if (building === null) return fieldError("housingExcessLandCapex", `${capexHead} 토지분은 0 이상 ${total.toLocaleString()} 이하여야 합니다.`);
  }
  return null;
}
