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
import { housingExcessAreaOfAsset, housingExcessNeedsLandSplit, housingExcessUsesInheritedTotal, housingExcessZonePending } from "./housing-excess-split";
import { housingExcessCapexParts, housingExcessNeedsCapexSplit } from "./housing-excess-split";
import { housingExcessPartModeMismatch } from "./housing-excess-split";
import { housingExcessAcqContractParts, housingExcessNeedsAcqContract } from "./housing-excess-acq-contract";
import { resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";
import { fieldError } from "./transfer-tax-validate-field";
import { isBeforeHousePriceFirstDisclosure } from "@/lib/tax-engine/housing-excess-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const positive = (v: string | undefined): boolean => parseAmount(v ?? "") > 0;

export function validateHousingExcessSplitInputs(
  a: AssetForm,
  label: string,
  transferDate: string | undefined,
  /** 첫 자산이 아님(함께 양도 카드) — ④⑤와 같은 술어(`index > 0`). §164⑦ PHD 경로는 첫 자산에만 닿는다. */
  isNonPrimary = false,
): string | null {
  if (housingExcessZonePending(a, isNonPrimary)) {
    return fieldError(
      "appurtenantLandZone",
      `${label}: 토지 면적이 건물 정착면적의 3배를 넘습니다 — 부수토지 인정 한도 배율을 정하려면 「부수토지 소재지 구분」을 선택하세요. 한도 초과분은 1세대1주택 비과세에서 제외되고 비사업용 토지로 과세됩니다 (소득세법 §104의3①5호·시행령 §154⑦·§168의12).`,
    );
  }
  // #17 후속(F1·G2) — 별개취득 토글 ON + 같은 날짜면 파트 방식 라디오가 자산 단위 라디오와 함께 화면에 있다 → 어긋나면 그 라디오로.
  //   배율 한도 이내·함께 양도 주택 카드도 같다(두 라디오 중 하나가 계산에 반영되지 않는다) — 그래서 분리 경로 판정·주 자산 판정보다 앞이다.
  const modeMismatch = housingExcessPartModeMismatch(a);
  // 토글 ON + 빈 토지 취득일은 일반 게이트(`validateSeparateLandDateRequired` — 이 검사보다 앞)가 라디오와 무관하게 막는다. 여기에 닿는 것은 그 게이트가
  // 범위 밖으로 두는 «토지를 다른 원인으로 취득(D1)» 호스트뿐이다 — 건물 라디오가 어긋나면 토지 취득일 칸으로 먼저 보낸다(같은 칸·같은 안내).
  if (modeMismatch === "landAcquisitionDate") {
    return fieldError(
      "landAcquisitionDate",
      `${label}: 「토지·건물 취득일 다름」을 켰으므로 토지 취득일을 입력하세요 — 토지·건물 취득가액 방식이 위 「취득가액 산정 방식」과 다릅니다. ` +
        "토지를 다른 날 취득했으면 토지·건물 방식을 각각 쓰고, 같은 날 취득했으면 위 방식 하나로 계산합니다.",
    );
  }
  if (modeMismatch) {
    const part = modeMismatch === "landAcqMode" ? "토지" : "건물";
    return fieldError(
      modeMismatch,
      `${label}: 토지·건물을 같은 날 취득한 주택은 위 「취득가액 산정 방식」 하나로 취득가액을 계산합니다 — ` +
        `「${part} 취득가액 방식」을 그 방식과 같게 선택하세요. 토지를 다른 날 취득했다면 토지 취득일을 고치세요.`,
    );
  }
  if (!housingExcessNeedsLandSplit(a, transferDate, isNonPrimary)) return null;
  const excess = housingExcessAreaOfAsset(a, transferDate);
  const head =
    `${label}: 토지 면적이 건물 정착면적의 지역별 배율 한도를 ${excess.toFixed(2)}㎡ 넘습니다 — 한도 초과분은 1세대1주택 비과세에서 제외되고 비사업용 토지로 분리 과세하므로 ` +
    "토지·건물 가액을 나눌 기준시가가 필요합니다 (소득세법 §89①3호·§104의3①5호·시행령 §166⑥).";
  // #17-5 ② — 보충적 평가 상속·증여 주택은 취득시 개별주택가격 총액을 상속·증여 평가액으로 쓴다(평가액 칸이 정본 — ⑧이 따로 요구하지 않는다).
  if (!housingExcessUsesInheritedTotal(a, transferDate, isNonPrimary) && !positive(a.standardPriceAtAcq)) {
    return fieldError(
      "standardPriceAtAcq",
      isBeforeHousePriceFirstDisclosure(a.acquisitionDate)
        ? `${head} 취득일이 개별주택가격 최초 공시일(2005-04-30) 전이라 영 §164⑦ 산식으로 추정한 취득 당시 기준시가(부수토지 포함 총액)를 입력하세요.`
        : `${head} 취득 당시 개별주택가격(부수토지 포함 총액)을 입력하세요.`,
    );
  }
  if (!positive(a.standardPricePerSqmAtAcq)) {
    return fieldError("standardPricePerSqmAtAcq", `${head} 취득 당시 ㎡당 개별공시지가를 입력하세요.`);
  }
  if (!positive(a.buildingStandardPriceAtAcq)) {
    return fieldError("buildingStandardPriceAtAcq", `${head} 취득 당시 건물 기준시가를 입력하세요 (개별주택가격을 토지 : 건물 기준시가 비율로 나눕니다).`);
  }
  // #17-6 — 취득 당시 계약서 토지·건물 구분금액(선택). 하나라도 채우면 둘 다 필수이고 합이 취득가액과 같아야 한다(자동 보정·자동 안분 금지).
  //   칸이 열리는 조건(`housingExcessNeedsAcqContract`)은 ⑤·④와 같은 술어다 — 칸이 안 열리면 잔재가 있어도 요구하지 않는다.
  if (housingExcessNeedsAcqContract(a, transferDate)) {
    const c = housingExcessAcqContractParts(a);
    if (c.entered) {
      const contractHead =
        `${label}: 취득 당시 계약서 토지·건물 구분금액을 입력하면 토지 금액과 건물 금액을 모두 입력해야 하고 합이 취득가액과 같아야 합니다 ` +
        "(소득세법 §100②·③ — 자동으로 나머지를 채우지 않습니다).";
      if (c.land === null) return fieldError("acqContractLandPrice", `${contractHead} 토지 금액을 입력하세요.`);
      if (c.building === null) return fieldError("acqContractBuildingPrice", `${contractHead} 건물 금액을 입력하세요.`);
      if (c.land + c.building !== c.total) {
        return fieldError(
          "acqContractLandPrice",
          `${contractHead} 토지 금액 ${c.land.toLocaleString()} + 건물 금액 ${c.building.toLocaleString()} = ${(c.land + c.building).toLocaleString()}이 취득가액 ${c.total.toLocaleString()}과 다릅니다.`,
        );
      }
    }
  }
  if (!(resolveLandStdAtTransfer(a) != null && (resolveLandStdAtTransfer(a) ?? 0) > 0)) {
    return fieldError("standardPricePerSqmAtTransfer", `${head} 양도 당시 ㎡당 개별공시지가를 입력하세요 (양도 당시 토지 기준시가 = 단가 × 양도 면적).`);
  }
  if (!positive(a.buildingStandardPriceAtTransfer)) {
    return fieldError("buildingStandardPriceAtTransfer", `${head} 양도 당시 건물 기준시가를 입력하세요.`);
  }
  // #17 후속 — 자산 전체 자본적지출의 토지분(건물분 = 전체 − 토지분). 분리 계산은 파트 값만 읽고, 자본적지출은 §100② 후문의 안분 대상이 아니다.
  if (housingExcessNeedsCapexSplit(a, transferDate, isNonPrimary)) {
    const { total, land, building } = housingExcessCapexParts(a);
    const capexHead =
      `${label}: 배율 초과분을 나눠 계산하므로 자본적지출 ${total.toLocaleString()}의 토지분·건물분 귀속이 필요합니다 — 자본적지출은 공통 비용 안분 대상이 아닙니다 (소득세법 §100② 후문 · §97②2호).`;
    if (land === null) return fieldError("housingExcessLandCapex", `${capexHead} 그중 토지분 자본적지출을 입력하세요 (전부 건물분이면 0).`);
    if (building === null) return fieldError("housingExcessLandCapex", `${capexHead} 토지분은 0 이상 ${total.toLocaleString()} 이하여야 합니다.`);
  }
  return null;
}
