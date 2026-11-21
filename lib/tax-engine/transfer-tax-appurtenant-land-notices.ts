/**
 * 주택 부수토지·고가주택 배율 초과분 계산에 붙는 **결과 고지문**(세액 불변) — #17 · #17-2 · #17-5 · D2 · D2-4 · D1-H.
 * `transfer-tax-appurtenant-land.ts` 800줄 정책으로 분리했다(이동만 — 문구·게이트 종전 그대로). 그 파일이 재export한다.
 * 이 파일은 `transfer-tax-appurtenant-land.ts`를 import하지 않는다(단방향 — 순환 없음).
 */
import { calculateHoldingPeriod } from "./tax-utils";
import { formatHighValueThresholdLabel, resolveHighValueHouseThreshold } from "./one-house/threshold";
import { appurtenantLandFactsOfInput } from "./housing-excess-split";
import { housingExcessAreaOfInput } from "./housing-excess-split";
import { housingExcessNeedsStdInputsOfInput } from "./housing-excess-split";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import { disclosureDateLabel, houseDisclosureBoundary, isSec163_9HouseLandProviso } from "./transfer-split-part-cause";
import type { TransferTaxInput } from "./types/transfer.types";

/**
 * 고지(#17, 세액 불변) — 토지 면적이 정착면적 × 배율 한도를 넘는데 초과분(비사업용 토지 — 소득세법 §104의3①5호)을 **분리하지 못한**
 * 주택 양도에 «초과분 미분리 — 과소 가능, 확인 필요»를 알린다. 분리 경로(별개취득 · 같은 날 취득 + 기준시가 안분 입력 · §164⑦ 환산 · 개별주택가격 보충적 평가 상속·증여)에 든 입력은
 * `splitDetail.nonBusinessLandPart`가 있으므로 말하지 않는다. 입력 경로가 없는 조합(부담부증여 · 지분 · 보충적 평가가 아닌 상속·증여 평가 ·
 * 재개발 · 소유자 분리 · 1990-08-30 전 취득[취득 당시 ㎡당 개별공시지가 부존재 — §164⑦ 환산(PHD)을 쓰면 분리 경로다, #17-5])은 막지 않고 비과세·종전 계산을 유지하며 이 고지로 남긴다.
 * 함께 양도 주택 카드(컴패니언)도 같다 — 면적·정착면적·소재지 구분은 `appurtenantLandFactsOfInput`이 주 자산과 같은 판정으로 읽는다(#17-1).
 * 비과세·부분비과세로 계산됐을 때만이다(과세 계산에서 말할 «놓친 비과세»가 없다).
 */
export function housingExcessUnseparatedNotice(
  input: TransferTaxInput,
  splitDetail: SplitGainResult | undefined,
  exemptApplies: boolean,
): string | null {
  if (!exemptApplies || splitDetail?.nonBusinessLandPart) return null;
  const facts = appurtenantLandFactsOfInput(input);
  // 소재지 구분이 비어 배율을 정하지 못했지만 가장 작은 배율(3배)로도 한도를 넘을 수 있다 — 초과 여부를 판정하지 않았다는 사실을 알린다(모름 = 확인 필요).
  if (
    input.propertyType === "housing" &&
    facts.zone === undefined &&
    facts.footprintM2 > 0 &&
    facts.landAreaM2 > facts.footprintM2 * 3
  ) {
    return (
      "토지 면적이 건물 정착면적의 3배를 넘지만 부수토지 소재지 구분이 없어 배율 한도(초과 여부)를 판정하지 않았습니다 — 초과분이 있으면 비과세에서 제외되는 비사업용 토지입니다" +
      "(소득세법 §89①3호·§104의3①5호, 시행령 §154⑦) — 확인이 필요합니다."
    );
  }
  const excess = housingExcessAreaOfInput(input);
  if (excess <= 0) return null;
  // NBL2611-C8 — 신축(토지 취득원인 미입력)은 카드가 건물 신축비용만 받아 토지 가액·취득일이 없다 — 분리되는 화면 경로를 함께 알린다(세액 불변).
  const newCons = input.acquisitionCause === "newConstruction" && input.landAcquisitionCause === undefined;
  return (
    `토지 면적이 건물 정착면적의 지역별 배율 한도를 ${excess.toFixed(2)}㎡ 넘지만, ` +
    (newCons
      ? "신축 취득은 건물 신축비용만 입력받아 토지 취득가액·취득일이 없으므로 초과분을 분리하지 못했습니다 — 초과분 미분리(과소 가능). 토지를 매매로 취득한 뒤 건물을 신축했다면 취득원인 「매매」에서 「토지·건물 취득일 다름」을 켜고 토지·건물의 취득일·취득가액을 각각 입력하면 초과분을 분리합니다. "
      : "이 입력 조합(부담부증여·지분·개별주택가격 보충적 평가가 아닌 상속·증여 평가·소유자 분리·재개발·개별공시지가 최초 고시(1990-08-30) 전 취득[개별주택가격 미공시 환산 제외]·수용·공매·경락 환산 등)은 토지·건물 가액 구분 입력 경로가 없어 초과분을 분리하지 못했습니다 — 초과분 미분리(과소 가능). ") +
    "초과분은 1세대1주택 비과세 대상이 아닌 비사업용 토지입니다(소득세법 §89①3호·§104의3①5호) — 확인이 필요합니다."
  );
}

/**
 * 고지(#17 후속, 세액 불변) — 같은 날 취득 주택의 배율 초과분 분리 경로가 자산 단위 자본적지출을 쓰지 않았다는 사실.
 *
 * 분리 경로(`calcSplitGain`)는 파트 칸(`landDirectExpenses`·`buildingDirectExpenses`)만 읽는다 — 「소득세법」 §100② 후문은 공통 취득가액·양도비용만
 * 안분 대상으로 열거하므로 자본적지출은 귀속 파트를 알아야 한다. 화면은 배율 초과분 카드의 「그중 토지분 자본적지출」 칸을 ⑧이 요구하고 ④가 파트 값으로
 * 싣으므로(#17 후속) 이 고지는 파트 값 없이 자산 전체 자본적지출만 실은 입력(API 직접 호출 등)에서만 뜬다.
 * 실지거래가액이면 필요경비에서, 환산취득가액이면 §97②2호 단서 비교에서 빠진다 — 금액을 밝히고 확인을 요구한다.
 */
export function housingExcessCapexNotice(input: TransferTaxInput, splitDetail: SplitGainResult | undefined): string | null {
  const capex = input.capitalExpenditure ?? 0;
  if (!(capex > 0) || !splitDetail?.nonBusinessLandPart) return null;
  if (input.landDirectExpenses !== undefined || input.buildingDirectExpenses !== undefined) return null;
  // PHD(§164⑦) 분리 경로는 자산 전체 자본적지출을 토지분 비율로 나눠 쓴다(`calcSplitGainPreDisclosure`) — 반영하지 않았다는 고지는 5칸 경로만이다.
  if (!housingExcessNeedsStdInputsOfInput(input)) return null;
  return (
    `자산 전체 자본적지출 ${capex.toLocaleString()}은 배율 초과분을 나눈 토지·건물 계산에 넣지 않았습니다 — 자본적지출은 공통 비용 안분 대상이 아니어서` +
    "(소득세법 §100② 후문) 토지분·건물분 귀속을 알아야 하는데 토지분·건물분 자본적지출이 입력되지 않았습니다. 실지거래가액 취득이면 필요경비에, 환산취득가액이면 " +
    "자본적지출 + 양도비와 환산취득가액 + 개산공제의 비교(소득세법 §97②2호 단서)에 들어가지 않았습니다 — 확인이 필요합니다."
  );
}

/**
 * 고지(#17-5 ②, 세액 불변) — 상속·증여로 취득한 주택의 배율 초과분을 분리한 계산에 대한 근거 수준 안내.
 *
 * 상증 평가액(개별주택가격)은 하나의 합계라 토지·건물로 나누려면 안분이 필요하다. 상증 해석은 개별주택가격으로 평가한 주택과 부수토지의 가액을 구분할 때
 * 「건물 기준시가와 토지 개별공시지가로 안분」하라고 한다(상속세및증여세법 §61①4호 · 서면인터넷방문상담4팀-688, 2006.3.23.). 그 안분을 **양도소득세** 취득가액의
 * 토지·건물 구분(소득세법 시행령 §166⑥)에 그대로 준용한다는 직접 근거는 확인하지 못했다 — 모름이므로 확인 필요를 알린다. 매매 취득의 같은 날 분리에는 이 고지가 없다.
 */
export function housingExcessInheritedNotice(input: TransferTaxInput, splitDetail: SplitGainResult | undefined): string | null {
  if (!splitDetail?.nonBusinessLandPart) return null;
  if (input.acquisitionCause !== "inheritance" && input.acquisitionCause !== "gift") return null;
  return (
    "상속·증여로 취득한 주택의 배율 초과분은 취득가액(상속·증여 평가액인 개별주택가격)을 건물 기준시가와 토지 개별공시지가 비율로 나눠 분리했습니다 — " +
    "상속세 및 증여세법 §61①4호 해석(서면인터넷방문상담4팀-688)에 따른 안분입니다. 이 안분을 양도소득세 취득가액의 토지·건물 구분(소득세법 시행령 §166⑥)에 " +
    "그대로 적용한다는 직접 근거는 확인하지 못했습니다 — 확인이 필요합니다."
  );
}

/**
 * 고지(#17-2, 세액 불변) — 고가주택(12억 초과 부분과세)에 배율 초과 부수토지가 함께 있을 때 적용한 과세 양도차익 산식의 근거.
 * 초과분의 양도차익은 12억 안분 전 전액 과세하고, 기준면적 이내 토지분은 «전체 부수토지 양도차익의 12억 안분값 − 초과분 양도차익(음수면 0)»,
 * 건물분은 12억 안분값이다. 근거는 기획재정부 재산세제과-915(2011.10.27.) 회신이며 법령이 아닌 해석례다(소득세법 기본통칙 95-1 병기).
 * 게이트(`isPartialExempt && nonBusinessLandPart`)는 세액 산식이 갈리는 조건과 같다. 나중 취득 토지 보유요건 미달(G-3)이 겹치면 토지분 전체가
 * 안분 대상이 아니라 이 회신 방식을 쓰지 않는다 — 문구도 그 사실을 따로 밝힌다.
 */
export function highValueExcessFormulaNotice(
  splitDetail: SplitGainResult | undefined,
  isPartialExempt: boolean,
  transferDate: Date,
  laterLandExcluded = false,
): string | null {
  if (!isPartialExempt || !splitDetail?.nonBusinessLandPart) return null;
  return highValueExcessRulingNoticeText(transferDate, laterLandExcluded);
}

/**
 * `highValueExcessFormulaNotice`의 문구 — 단일 주택 · 겸용주택 · 함께 양도 카드가 같은 사실 서술을 쓴다(게이트는 호출부가 정한다).
 * `laterLandExcluded`이면 회신 방식을 적용하지 않았다고 밝힌다.
 */
export function highValueExcessRulingNoticeText(transferDate: Date, laterLandExcluded = false): string {
  // 「12억」 리터럴 금지 — 고가주택 기준금액은 양도일 연혁(6억·9억·12억)이다.
  const label = formatHighValueThresholdLabel(resolveHighValueHouseThreshold(transferDate));
  if (laterLandExcluded) {
    return (
      "고가주택에 배율 초과 부수토지가 함께 있으나, 주택보다 나중에 취득한 부수토지가 보유요건에 못 미쳐 토지분 전체를 비과세에서 제외했습니다 — " +
      `초과분과 나머지 토지분의 양도차익은 안분 없이 전액 과세하고 건물분만 ${label} 초과 비율로 안분했습니다. 기획재정부 재산세제과-915(2011.10.27.) 회신 방식은 이 경우 적용하지 않았습니다.`
    );
  }
  return (
    "고가주택에 배율 초과 부수토지가 함께 있어 기획재정부 재산세제과-915(2011.10.27.) 회신 방식으로 계산했습니다 — " +
    `배율 초과분의 양도차익은 ${label} 안분 없이 전액 과세하고, 기준면적 이내 토지분은 전체 부수토지 양도차익의 ${label} 안분값에서 초과분 양도차익을 뺀 금액(음수면 0), ` +
    `건물분은 ${label} 안분값입니다. ` +
    "이 방식의 근거는 법령이 아니라 기획재정부의 법령해석 회신이며, 같은 회신이 인용한 소득세법 기본통칙 95-1(고가주택의 양도차익 계산)에 따라 " +
    "주택과 전체 부수토지의 양도차익을 각각 산정해 안분했습니다."
  );
}

/**
 * 고지(D2, 세액 불변) — 건물을 상속·증여받기 **전에** 토지를 매수했고, 토지 적용 기산을 **건물 취득일(상속개시일·증여일)**로 잡은 결과
 * 세율 보유 구간(1년 미만 / 1~2년 / 2년 이상)이 토지 자기 취득일 기산과 달라질 때.
 *
 * 계획서 §12 D2-Q1(A안): 토지 세율 기산 앵커 = 건물 취득일. 근거는 소유자 기준 해석(서면-2024-부동산-0428 ·
 * 상속증여세과-271 · 재산46014-610)이나 「건물 취득 전 토지 보유분의 통산」을 정면으로 다룬 해석례는 없다 → 선택을 결과에서 숨기지 않는다.
 * 증여 건물도 앵커가 같다(단순 증여는 §104②2호 통산이 없어 건물 기산도 증여일) — 문구만 증여일로 낸다(Q-D2-2).
 * 파트 세율을 실제로 판정한 경우(`partRateBasisApplied`)에만 낸다 — 자산 단위 세율로 합쳐졌으면 토지 기산은 쓰이지 않았다.
 * 구간 비교는 엔진 echo의 두 날짜만 쓴다(재계산 없음).
 */
export function landBeforeBuildingAcquisitionRateNotice(
  input: Pick<TransferTaxInput, "acquisitionCause" | "landAcquisitionCause" | "transferDate">,
  splitDetail: SplitGainResult | undefined,
): string | null {
  if (!splitDetail || splitDetail.partRateBasisApplied !== true) return null;
  if (input.landAcquisitionCause !== "purchase") return null;
  if (input.acquisitionCause !== "inheritance" && input.acquisitionCause !== "gift") return null;
  const own = splitDetail.land.rateBasisAcquisitionDate;
  const applied = splitDetail.land.appliedRateBasisDate;
  if (!own || !applied || own >= applied) return null;
  const band = (iso: string): number => {
    const h = calculateHoldingPeriod(new Date(`${iso}T00:00:00.000Z`), input.transferDate);
    const months = h.years * 12 + h.months;
    return months < 12 ? 0 : months < 24 ? 1 : 2;
  };
  if (band(own) === band(applied)) return null;
  const [verb, day] = input.acquisitionCause === "gift" ? ["증여받기", "증여일"] : ["상속받기", "상속개시일"];
  return (
    `건물을 ${verb} 전(${own})에 취득한 토지는 ${day}(${applied})부터 주택부수토지로서의 보유기간을 계산해 세율을 정했습니다 ` +
    "(「소득세법」 §104②·§94①1호, 주택과 그 부수토지의 소유자가 다른 기간은 부수토지 보유로 보지 않는 국세청 해석). " +
    "건물 취득 전 토지 보유기간의 통산 여부에 대한 정면 해석례가 없어 확인이 필요합니다"
  );
}

/**
 * 고지(D2-4, 세액 불변) — 건물 취득가액에 영 §163⑨ 단서 2호 비교(평가액 vs 영 §164⑦ 가액의 건물 몫)가 **실제로 돈** 경우.
 * 건물 echo `acquisitionBasis.rule === "sec163_9_2"`가 게이트다(비교가 안 돌았으면 말할 거리가 없다).
 *
 * 계획서 §13 Q-D24-1: ②는 영 §164⑦ 환산주택가격을 재산세과-1702(2009.8.17.)가 자산별 취득당시 기준시가로 안분하라는 방법을 건물 몫에
 * 적용한 값이다(토지 취득 시점은 분자·분모에서 약분). 그 해석례와 집행기준 99-164-9는 환산 맥락이고, 「상속·증여받은 건물 + 따로 매수한
 * 토지」를 단서 2호에서 정면으로 다룬 해석례는 확인하지 못했다 → 방법과 한계를 결과에서 숨기지 않는다. 어느 쪽이 채택됐는지는 말하지 않는다
 * (echo가 표시한다 — 이 문구는 납세자 유리·불리를 말하지 않는다).
 */
export function buildingSec164ApportionNotice(splitDetail: SplitGainResult | undefined): string | null {
  if (splitDetail?.building.acquisitionBasis?.rule !== "sec163_9_2") return null;
  return (
    "건물 취득가액은 상속개시일(증여일) 평가액과 제164조 제7항 가액의 건물 몫 중 많은 금액으로 정했습니다(「소득세법 시행령」 제163조 제9항 단서 제2호). " +
    "건물 몫은 같은 영 제164조 제7항으로 환산한 취득당시 주택가격을 토지·건물의 취득당시 기준시가 비율로 안분한 값입니다(재산세과-1702, 2009.8.17.의 " +
    "자산별 안분 방법). 상속·증여받은 건물과 따로 매수한 토지에 이 안분을 적용한 정면 해석례는 확인하지 못했습니다 — 확인 필요"
  );
}

/**
 * 고지(D1-H) — 토지 상속·증여 + 건물 매매·신축에서 토지를 1990.8.30.~2005.4.29.에 받은 주택(영 §163⑨ 단서 2호 — 주택 부수토지).
 * 계획서 docs/00-pm/transfer-house-land-163-9-2.plan.md · 근거 부동산거래관리과-364(2010.3.10.).
 *  · 비교가 돌았으면(토지 echo `rule === "sec163_9_2_land"`) 방법과 한계(토지 몫 산식의 정면 해석례 없음 — U-1).
 *  · 매매 호스트에서 「받을 당시 주택이 있었는가」가 모름·미입력이면 비교하지 않은 사실(Q-1 — 모름 = 불성립 + 확인 필요).
 *  · 신축 호스트는 받을 당시 지금 건물이 없었으므로 비교하지 않는다(Q-2) — 종전 주택이 있었던 경우는 그 가액을 받지 않는다는 한계.
 * 어느 쪽이 채택됐는지·방향은 말하지 않는다(echo가 표시한다).
 */
export function houseLandSec164Notice(
  input: Pick<
    TransferTaxInput,
    "propertyType" | "acquisitionCause" | "landAcquisitionCause" | "landAcquisitionDate" | "landHouseExisted" | "houseFirstDisclosureDate" | "buildingHouseKind"
  >,
  splitDetail: SplitGainResult | undefined,
): string | null {
  if (!splitDetail) return null;
  if (splitDetail.land.acquisitionBasis?.rule === "sec163_9_2_land") {
    return (
      "토지 취득가액은 상속개시일(증여일) 평가액과 「소득세법 시행령」 제164조 제7항 가액의 토지 몫 중 많은 금액으로 정했습니다(같은 영 제163조 제9항 단서 제2호 — " +
      "건물 기준시가가 고시되기 전에 상속·증여받은 주택 부수토지, 부동산거래관리과-364, 2010.3.10.). 토지 몫은 같은 영 제164조 제7항으로 환산한 취득당시 주택가격을 " +
      "토지·건물의 취득당시 기준시가 비율로 안분한 값입니다(재산세과-371, 2009.10.5.의 자산별 안분 방법). 이 안분을 토지 몫에 쓴 정면 해석례는 확인하지 못했습니다 — 확인 필요"
    );
  }
  if (input.propertyType !== "housing") return null;
  const d = input.landAcquisitionDate as Date | string | undefined;
  const dayKey = d instanceof Date ? d.toISOString().slice(0, 10) : d?.slice(0, 10);
  // 구간 끝은 엔진·leaf와 같은 `houseDisclosureBoundary`(단독·다가구로 확인된 주택의 최초공시일, 아니면 2005-04-30).
  const boundary = houseDisclosureBoundary(input.houseFirstDisclosureDate, input.buildingHouseKind);
  if (!isSec163_9HouseLandProviso(input.landAcquisitionCause, dayKey, boundary)) return null;
  const before = `${disclosureDateLabel(boundary)} 전`;
  if (input.acquisitionCause === "purchase" && input.landHouseExisted !== "yes" && input.landHouseExisted !== "no") {
    return (
      `토지를 받을 당시 지금의 주택이 그 위에 있었다면, 개별주택가격 공시 전(${before})에 상속·증여받은 주택 부수토지의 취득가액은 평가액과 ` +
      "「소득세법 시행령」 제164조 제7항 가액의 토지 몫 중 많은 금액입니다(같은 영 제163조 제9항 단서 제2호, 부동산거래관리과-364). 그 사실이 확인되지 않아 " +
      "평가액만으로 계산했습니다 — 확인 필요"
    );
  }
  if (input.acquisitionCause === "newConstruction") {
    return (
      `토지를 받을 당시 다른 주택이 그 위에 있었다면 개별주택가격 공시 전(${before})에 상속·증여받은 주택 부수토지로서 평가액과 ` +
      "「소득세법 시행령」 제164조 제7항 가액의 토지 몫을 비교해야 할 수 있습니다(같은 영 제163조 제9항 단서 제2호). 이 계산기는 종전 주택의 가액을 받지 않아 " +
      "평가액만으로 계산했습니다 — 확인 필요"
    );
  }
  return null;
}
