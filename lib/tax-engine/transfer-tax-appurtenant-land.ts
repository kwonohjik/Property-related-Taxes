/**
 * 주택 **부수토지**의 §104② 세율 기산일 · 배율 초과분 · 비과세 제외 판정.
 *
 * `transfer-tax-split-rate.ts` 800줄 정책으로 분리했다(2026-08-02 · P12 1단계).
 * 분기 순서·산식 문자열·export 이름은 **종전 그대로**다
 * (memory `feedback_800line_split_export_preservation`).
 *
 * 이 파일은 「토지 파트가 **언제부터** 보유한 것으로 보는가 / **어디까지** 부수토지인가 /
 * 그 중 비과세에서 빠지는 부분은 어디인가」만 다룬다. 그 판정을 받아 실제 세율·§104⑤
 * 비교과세를 수행하는 쪽이 `transfer-tax-split-rate.ts`다 — **단방향**(이 파일 → split-rate)이라
 * 순환이 없다.
 */
import { calculateHoldingPeriod } from "./tax-utils";
import { round2 } from "./area-utils";
import { appurtenantLandMultiplier, expropriationZoneBaseDateNotice } from "./appurtenant-land-rate";
import { resolveOneHouseMinHoldingYears } from "./data/one-house-holding-residence-era";
import { expropriationNoticeDateRequirementApplies } from "./data/one-house-154-1-proviso-era";
import { resolveExemptionProviso, type ResidenceReqInput } from "./transfer-tax-exemption-holding";
import { resolveRateBasis, type RateBasisRule } from "./transfer-rate-holding-basis";
import { TRANSFER } from "./legal-codes";
import { formatHighValueThresholdLabel, resolveHighValueHouseThreshold } from "./one-house/threshold";
import { appurtenantLandFactsOfInput, housingExcessAreaOfInput, housingExcessNeedsStdInputsOfInput, housingExcessSplitAppliesToInput } from "./housing-excess-split";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import { highValueExcessLandTaxableGain } from "./high-value-excess-land";
export { highValueExcessLandTaxableGain, allocateUnitExcessShares } from "./high-value-excess-land";
export { housingExcessAcqContractNotice } from "./housing-excess-acq-contract";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

/**
 * 「소득세법」 시행령 제154조 제1항 1세대1주택 보유요건의 **현행 연수**(2년) — 양도일 연혁은 `resolveOneHouseMinHoldingYears`가 정한다
 * (2012-06-29 전 양도분은 3년 — 대통령령 제23887호 부칙 제2조). 이 값은 그 함수의 `ruleYears` 인자다.
 */
const ONE_HOUSE_HOLDING_YEARS = 2;

/**
 * 토지 파트의 §104② 세율 보유기간 기산일.
 *
 * - **비주택**: 토지 취득일 그대로.
 * - **주택**(계획서 §5.4 G-3): **`max(토지 취득일, 주택 취득일)`**.
 *   §104①2호 괄호의 "주택… 이에 딸린 토지"는 **주택부수토지로서의** 보유기간을 뜻하므로,
 *   토지를 먼저 샀으면 주택 취득일(= 현행 동작 · 조심 2024인3140 정합), 토지를 나중에 샀으면
 *   토지 취득일이 기산일이 된다. `max` 하나가 양방향을 모두 설명한다.
 *   근거 수준은 **간접**이다 — 국세청 상속증여세과-466(2013.8.12.)·부동산거래관리과-435(2010.3.22.)가
 *   부수토지의 **취득시기를 개별 판정**하도록 한 데서 논리적으로 이어진 것이고, "세율 보유기간을
 *   `max`로" 라는 명시 판단은 없다(계획서 §10-1). ⇒ 되돌릴 수 있도록 이 함수 하나에 격리한다.
 */
export function resolveAppurtenantLandRateBasisDate(input: TransferTaxInput): Date | undefined {
  const effective = resolveLandStatutoryAcquisitionDate(input);
  if (!effective) return undefined;
  // ② 주택은 "주택부수토지로서의" 보유기간 → `max`
  if (input.propertyType !== "housing") return effective;
  return effective.getTime() >= input.acquisitionDate.getTime() ? effective : input.acquisitionDate;
}

/**
 * 토지 파트의 §104② 보유기간 기산일 — **주택 `max` 적용 전**의 법정 취득일.
 *
 * 「소득세법」 제104조 제2항 단서를 **토지 파트 고유의 취득원인**으로 적용한다(G-4).
 *   1호 상속 → 피상속인이 그 자산을 취득한 날
 *   2호 §97의2① 이월과세 → 증여자가 그 자산을 취득한 날
 * 토지 취득원인(`landAcquisitionCause`)이 명시되면 그 원인·날짜만 쓰고, 없으면 자산 단위
 * 값을 그대로 상속한다(회귀 0 — 종전에는 `calcTax`가 자산 단위 값으로 덮어썼다).
 */
export function resolveLandStatutoryAcquisitionDate(input: TransferTaxInput): Date | undefined {
  return resolveLandRateBasis(input)?.date;
}

/** `resolveLandStatutoryAcquisitionDate`의 날짜 + 그 날짜를 정한 규칙(결과 echo 전용 — D1-3). */
export function resolveLandRateBasis(
  input: TransferTaxInput,
): { date: Date; rule: RateBasisRule } | undefined {
  const land = input.landAcquisitionDate;
  if (!land) return undefined;
  const useLandCause = input.landAcquisitionCause !== undefined;
  // 판정은 `transfer-rate-holding-basis.ts` 단일 소스 — **단순 증여(`gift`)는 통산하지 않는다**.
  // 종전에는 `gift`도 증여자 취득일로 소급해 주택 단기 70%를 회피시켰다(계획서 D-3④).
  return resolveRateBasis({
    acquisitionCause: useLandCause ? input.landAcquisitionCause : input.acquisitionCause,
    acquisitionDate: land,
    decedentAcquisitionDate: useLandCause
      ? input.landDecedentAcquisitionDate
      : input.decedentAcquisitionDate,
    donorAcquisitionDate: useLandCause
      ? input.landDonorAcquisitionDate
      : input.donorAcquisitionDate,
  });
}

/**
 * 토지 파트 세율 판정용 입력 — 기산일을 확정한 뒤 **자산 단위 §104② 재적용을 무력화**한다.
 * `calcTax`의 `rateBasisAcquisitionDate`는 `acquisitionCause`가 상속·증여면 `acquisitionDate`를
 * 무시하고 피상속인·증여자 취득일로 덮어쓰므로, 여기서 이미 통산을 마친 날짜가 무시된다.
 */
export function buildLandRateInput(input: TransferTaxInput, basisDate: Date): TransferTaxInput {
  return {
    ...input,
    acquisitionDate: basisDate,
    acquisitionCause: "purchase",
    decedentAcquisitionDate: undefined,
    donorAcquisitionDate: undefined,
  };
}

/**
 * 배율 초과 부수토지 파트(「소득세법」 제104조의3 제1항 제5호 비사업용 토지)의 세율 판정 입력.
 *
 * `propertyType`을 토지로 두어 `calcTax`의 주택 단기세율(70%/60%) 분기에 걸리지 않게 하고, §104② 기산일은 주택 부수토지의 `max` 규칙이 아니라
 * 토지 본래 취득일(`basisDate`)이다. 자산 단위 면적안분 비율은 이미 초과분만 떼어낸 파트에 의미가 없다.
 * **단일 소스** — 일반 split(`computeSplitPartTax`)·§155⑳ 단건(`splitAppurtenantExcess`)·다건 §155⑳ 재계산이 같은 객체 형태를 써야 한다.
 */
export function buildNblPartRateInput(input: TransferTaxInput, basisDate: Date): TransferTaxInput {
  return {
    ...buildLandRateInput(input, basisDate),
    propertyType: "land",
    isNonBusinessLand: true,
    nonBusinessLandAreaRatio: undefined,
  };
}

/**
 * G-3 비과세 축 — 주택 부수토지를 **나중에** 취득해 보유 2년(2012-06-29 전 양도분은 3년) 미만이면 그 토지분은
 * 1세대1주택 비과세를 적용하지 않는다(「소득세법」 시행령 제154조 제1항 보유요건 미충족).
 * 건물분과 요건 연수 이상 보유한 토지분만 비과세 대상이다(계획서 §5.4).
 *
 * `splitDetail` 없이 **입력만으로** 판정한다 — 전액 비과세 조기 반환(STEP 1a)을 막을지
 * 결정하는 시점에는 아직 양도차익이 계산되지 않았기 때문이다.
 */
export function isLaterAcquiredLandExemptExcluded(input: TransferTaxInput): boolean {
  return laterLandFailsHoldingRequirement(input) && !laterLandCoveredByExpropriationProviso(input);
}

/** G-3 입력 게이트 + 보유요건 미달 — 단서(5A) 반영 전. 비과세 제외와 5A 고지가 같은 게이트를 쓴다. */
function laterLandFailsHoldingRequirement(input: TransferTaxInput): boolean {
  if (input.propertyType !== "housing") return false;
  if ((input.selfOwns ?? "both") !== "both") return false;
  // 별개취득 입력이어야 `calcSplitGain`이 반드시 파트를 낸다(총액 경로로 흘러 null이 되지 않음).
  if (input.isSeparateAcquisition !== true) return false;
  const land = input.landAcquisitionDate;
  if (!land) return false;
  if (!isLaterAcquiredLandHeldTooShort(land, input.acquisitionDate, input.transferDate)) return false;
  // 부담부증여(§159)는 12억 안분 분모가 자산 단위와 달라 파트별 안분 기준이 확정돼 있지 않다 — 대상에서 제외한다(계획서 §5.4 선결 과제).
  //
  // 지분 양도는 **제외하지 않는다**(S08-8). 종전에는 `totalPropertyTransferPrice !== undefined`(= 물건 전체 양도가액을 12억 분모로 싣는
  // 값 — 지분 단건·함께양도 묶음의 지분 자산·F-13 단위 카드 합계 주입이 모두 채운다)를 「지분 양도」의 대리 지표로 읽어 G-3을 통째로
  // 껐다. 그러나 영 §154①의 보유요건은 공유 여부와 무관하고, 12억 초과 지분은 같은 영 §156①(물건 전체로 고가 판정)·§160①(보유기간이
  // 다른 부분은 합계액 대비 비율 안분)이 이미 정한 물건 전체 분모로 파트별 안분한다(`calcOneHouseProration`).
  if (input.burdenedGiftDenominator !== undefined) return false;
  if (input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift") return false;
  return true;
}

/**
 * 5A — 나중에 취득한 부수토지도 「소득세법 시행령」 제154조 제1항 단서 제2호 가목(수용)이 덮는가.
 *
 * 단서는 1~3호에 해당하면 「그 보유기간 및 거주기간의 제한을 받지 않」는다고 하고, 가목의 대상은
 * 「주택 및 그 부수토지(사업인정 고시일 전에 취득한 주택 및 그 부수토지에 한한다)」다. G-3의 근거가 같은 항의
 * 보유요건이므로, 가목이 성립하고 토지도 고시일 **전**(당일은 「전」이 아니다)에 취득했으면 토지분에 보유요건을 걸지 않는다.
 * 고시일 이후 취득한 토지는 괄호 밖이라 G-3 그대로다. 괄호가 없는 연혁 구간(2006.2.9. 전 양도·부칙 제30조① 경과)은
 * 주택 쪽 판정과 같은 leaf(`expropriationNoticeDateRequirementApplies`)가 정한다.
 * 나중에 취득한 부수토지에 이 단서를 적용한 정면 해석례는 확인하지 못했다(2026-10-11 사용자 결정 — 문언대로 + 확인 필요 고지).
 *
 * 반환: `undefined` 단서 불성립 · `null` 괄호 없는 연혁(취득일 무관) · `Date` 이 날(사업인정 고시일) 전에 취득한 토지만.
 * F-13 부수토지 카드는 짝 주택의 이 값을 `appurtenantHouseVerdict.expropriationLandCutoff`로 받는다.
 */
export function expropriationProvisoLandCutoff(input: ResidenceReqInput): Date | null | undefined {
  const p = input.oneHouseExemptionProviso;
  if (p?.reason !== "expropriation" || resolveExemptionProviso(input) !== "both") return undefined;
  if (!expropriationNoticeDateRequirementApplies(input)) return null;
  return p.businessApprovalDate;
}

/** `expropriationProvisoLandCutoff`의 값으로 그 토지가 단서 안에 드는가 — 고시일 **전**(당일 제외) 취득분만. */
export function landCoveredByExpropriationProviso(landAcquisitionDate: Date, cutoff: Date | null | undefined): boolean {
  return cutoff === null || (cutoff !== undefined && landAcquisitionDate < cutoff);
}

function laterLandCoveredByExpropriationProviso(input: TransferTaxInput): boolean {
  return !!input.landAcquisitionDate && landCoveredByExpropriationProviso(input.landAcquisitionDate, expropriationProvisoLandCutoff(input));
}

/**
 * F-13 부수토지 카드 — 짝 주택보다 나중에 취득해 보유요건에 못 미치지만 짝 주택의 수용 단서가 덮는가.
 * `checkExemption` F-13 분기와 5A 고지가 같은 술어를 쓴다.
 */
export function appurtenantCardCoveredByExpropriationProviso(
  input: Pick<TransferTaxInput, "oneHouseUnitRole" | "appurtenantHouseVerdict" | "acquisitionDate" | "transferDate">,
): boolean {
  const v = input.appurtenantHouseVerdict;
  if (input.oneHouseUnitRole !== "appurtenant_land" || !v) return false;
  if (!isLaterAcquiredLandHeldTooShort(input.acquisitionDate, v.houseAcquisitionDate, input.transferDate)) return false;
  return landCoveredByExpropriationProviso(input.acquisitionDate, v.expropriationLandCutoff);
}

/** 5A 고지(세액은 `isLaterAcquiredLandExemptExcluded`가 정한다) — 보유요건에 못 미친 나중 취득 부수토지를 수용 단서로 비과세했을 때. */
function expropriationLaterLandNotice(input: TransferTaxInput, exemptApplies: boolean): string | null {
  if (!exemptApplies) return null;
  const covered =
    appurtenantCardCoveredByExpropriationProviso(input) ||
    (laterLandFailsHoldingRequirement(input) && laterLandCoveredByExpropriationProviso(input));
  if (!covered) return null;
  return (
    "주택보다 나중에 취득한 부수토지는 보유기간이 「소득세법 시행령」 제154조 제1항의 보유요건에 못 미치지만, 사업인정 고시일 전에 취득한 부수토지로서 " +
    "같은 항 단서 제2호 가목(수용 — 보유기간 및 거주기간의 제한을 받지 않음)에 해당한다고 보아 1세대1주택 비과세를 적용했습니다. " +
    "나중에 취득한 부수토지에 이 단서를 적용한 정면 해석례는 확인하지 못했습니다 — 확인 필요"
  );
}

/** 5A 고지 — 전액 비과세 조기 반환(STEP 1a) 경로용. 조기 반환은 비과세 확정 뒤라 `exemptApplies`가 참이다. */
export function expropriationLaterLandNotices(input: TransferTaxInput): string[] {
  const n = expropriationLaterLandNotice(input, true);
  return n ? [n] : [];
}

/** 나중 취득 부수토지 고지 — T-7(상속 토지 제외) 또는 5A(수용 단서로 비과세). 둘은 G-3 성립·불성립으로 갈려 동시에 나지 않는다. */
export function laterLandExemptNotice(
  input: TransferTaxInput,
  splitDetail: SplitGainResult | undefined,
  exemptApplies: boolean,
): string | null {
  return laterInheritedLandExemptNotice(input, splitDetail, exemptApplies) ?? expropriationLaterLandNotice(input, exemptApplies);
}

/**
 * T-7 고지(D1-3, 세액 불변) — 주택보다 **나중에 토지만 상속**받아 토지분이 1세대1주택 비과세에서 빠질 때.
 *
 * 「소득세법 시행령」 제154조 제8항 제3호의 통산은 문언이 「상속받은 **주택**으로서 상속인과 피상속인이
 * 상속개시 당시 동일세대인 경우」라 토지만 상속받은 경우에는 적용하지 않는다(정면 해석례 미확보 —
 * 혜택 불성립 쪽 + 확인 필요). 종전에는 이 사실이 결과 어디에도 없었다(경고 0건).
 * `applyHousingLandExclusions`가 토지분을 제외하는 조건(비과세·부분비과세 + G-3)과 같은 술어를 쓴다.
 */
export function laterInheritedLandExemptNotice(
  input: TransferTaxInput,
  splitDetail: SplitGainResult | undefined,
  exemptApplies: boolean,
): string | null {
  if (!exemptApplies || !splitDetail) return null;
  if (input.landAcquisitionCause !== "inheritance") return null;
  if (!isLaterAcquiredLandExemptExcluded(input)) return null;
  return (
    "주택보다 나중에 상속받은 부수토지는 상속개시일부터 보유기간을 계산해 보유요건(「소득세법 시행령」 제154조 제1항 — 양도일 연혁 2년·3년) 미만이므로 1세대1주택 비과세에서 제외했습니다. " +
    "피상속인의 보유기간 통산(「소득세법 시행령」 제154조 제8항 제3호)은 문언이 「상속받은 주택으로서 상속개시 당시 동일세대인 경우」라 " +
    "토지만 상속받은 경우에는 적용하지 않았습니다 — 확인 필요"
  );
}

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
  return (
    `토지 면적이 건물 정착면적의 지역별 배율 한도를 ${excess.toFixed(2)}㎡ 넘지만, 이 입력 조합(부담부증여·지분·개별주택가격 보충적 평가가 아닌 상속·증여 평가·소유자 분리·재개발·개별공시지가 최초 고시(1990-08-30) 전 취득[개별주택가격 미공시 환산 제외]·수용·공매·경락 환산 등)은 ` +
    "토지·건물 가액 구분 입력 경로가 없어 초과분을 분리하지 못했습니다 — 초과분 미분리(과소 가능). " +
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
 * 부수토지로서의 보유기간 요건(영 §154① — 현행 2년, **양도일 2012-06-29 전은 3년**) — **주택보다 나중에 취득한 토지**만 걸린다.
 *
 * 부수토지는 주택이 있어야 성립하므로 「부수토지로서의 보유기간」은 주택·토지 취득일 중 **늦은 날**부터다
 * (토지를 먼저 취득했으면 주택 취득일 — 주택의 보유요건이 곧 이 요건이다). 단일 주택 입력(G-3)과
 * 컴패니언 부수토지 카드(F-13 — `checkExemption`)가 **이 한 함수**를 쓴다.
 *
 * 연수는 주택 본체의 §154① 보유요건과 **같은 연혁 leaf**(`resolveOneHouseMinHoldingYears`)가 정한다 — 종전에는 24개월 상수라
 * 주택 자체는 3년(2010-06-15 양도에 주택 2년 5개월 → 과세)인데 부수토지는 2년으로 비과세됐다(S02-5).
 */
export function isLaterAcquiredLandHeldTooShort(
  landAcquisitionDate: Date,
  houseAcquisitionDate: Date,
  transferDate: Date,
): boolean {
  if (landAcquisitionDate.getTime() <= houseAcquisitionDate.getTime()) return false;
  const held = calculateHoldingPeriod(landAcquisitionDate, transferDate);
  return held.years * 12 + held.months < resolveOneHouseMinHoldingYears(transferDate, ONE_HOUSE_HOLDING_YEARS) * 12;
}

/**
 * 배율 한도 판정(G-2)이 도는 입력 게이트 — 주택 · 토지·건물 모두 본인 소유 · 별개취득 · 용도지역 선택 · 정착면적·토지면적 양수.
 * `resolveAppurtenantLandExcess`와 수용 기준일 고지(`expropriationZoneNoticeFor`)가 **같은 게이트**를 쓴다.
 */
function resolveAppurtenantZoneInputs(
  input: TransferTaxInput,
): { zone: NonNullable<TransferTaxInput["appurtenantLandZone"]>; footprint: number; landArea: number } | null {
  if (input.propertyType !== "housing") return null;
  if ((input.selfOwns ?? "both") !== "both") return null;
  // 별개취득이 아니면 «같은 날 취득 주택의 초과분 분리 경로»(`housing-excess-split.ts` — 기준시가 안분 입력이 있는 매매 주택)만 연다(#17).
  if (input.isSeparateAcquisition !== true && !housingExcessSplitAppliesToInput(input)) return null;
  // 주 자산은 입력 키를, 함께 양도 주택 카드는 `companionHousingLand` 사실을 같은 지점에서 읽는다(#17-1).
  const facts = appurtenantLandFactsOfInput(input);
  if (facts.zone === undefined) return null;
  if (facts.footprintM2 <= 0 || facts.landAreaM2 <= 0) return null;
  return { zone: facts.zone, footprint: facts.footprintM2, landArea: facts.landAreaM2 };
}

/**
 * G5-6 — 배율 한도 판정이 실제로 도는 수용 양도(2025-11-28 이후)에 용도지역 기준일(사업인정 고시일 전날)을 알린다. 세액 불변.
 * 판정 게이트는 `resolveAppurtenantLandExcess`와 같다 — 배율이 쓰이지 않는 입력에는 말할 거리가 없다.
 */
export function expropriationZoneNoticeFor(input: TransferTaxInput): string | null {
  if (!resolveAppurtenantZoneInputs(input)) return null;
  return expropriationZoneBaseDateNotice(input);
}

/** 주택 부수토지 배율 한도 판정 결과 (G-2) */
export interface AppurtenantLandExcess {
  /** 적용 배율 (3/5/10) */
  multiplier: number;
  /** 인정 한도 면적 = 정착면적 × 배율 */
  limitArea: number;
  /** 한도 초과 면적 */
  excessArea: number;
  /** 토지 양도차익 중 비사업용으로 이전할 비율 */
  nonBizRatio: number;
}

/**
 * 주택 부수토지 배율 한도 판정 — 초과분이 없으면 `null`.
 *
 * 배율 수치는 「소득세법」 시행령 제168조의12(비사업용 토지 축)와 제167조의5(세율 축)가
 * **동일**하다(3/5/5/10, 2022.1.1. 전 양도분은 도시지역 일률 5배). 입력 필드가
 * `appurtenantLandZone`이므로 그 축의 헬퍼(`appurtenantLandMultiplier`)를 그대로 쓰되,
 * **여기서의 근거 조문은 비사업용 토지 축인 시행령 제168조의12**다(§1.1.1 「축을 섞지 말 것」).
 *
 * ⚠️ 용도지역(`appurtenantLandZone`) 미입력 시 진입하지 않는다 — 미입력 fallback은 가장 작은
 * 한도(3배)를 돌려주어 초과면적을 과다 산출하고 **납세자에게 불리**해진다(계획서 R-7).
 * 미입력은 ⑧validate가 차단한다.
 */
export function resolveAppurtenantLandExcess(
  input: TransferTaxInput,
): AppurtenantLandExcess | null {
  const zoneInputs = resolveAppurtenantZoneInputs(input);
  if (!zoneInputs) return null;
  const { zone, footprint, landArea } = zoneInputs;

  const multiplier = appurtenantLandMultiplier(zone, input.transferDate);
  const limitArea = round2(footprint * multiplier);
  const excessArea = round2(Math.max(0, landArea - limitArea));
  if (excessArea <= 0) return null;
  return { multiplier, limitArea, excessArea, nonBizRatio: excessArea / landArea };
}

/**
 * G-3 제외 사유 문구 — 일반 경로(`applyHousingLandExclusions`)와 §155⑳ 특례 경로(`runRentalHousingExceptionStep`)가 같은 문장을 쓴다.
 * `housingLandGain`은 비과세에서 빠져 전액 과세되는 토지분 양도차익(배율 초과분 제외)이다.
 */
export function laterLandExclusionReason(input: TransferTaxInput, housingLandGain: number): string {
  const held = calculateHoldingPeriod(input.landAcquisitionDate!, input.transferDate);
  return (
    `주택 취득 후 취득한 부수토지(보유 ${held.years}년 ${held.months}개월)는 「소득세법」 ` +
    `시행령 제154조 제1항 보유요건 미충족으로 1세대1주택 비과세 대상이 아님 — ` +
    // 「12억」 리터럴 금지 — 고가주택 기준금액은 양도일 연혁(6억·9억·12억)이다.
    `양도차익 ${housingLandGain.toLocaleString()}을 고가주택 안분 없이 전액 과세`
  );
}

/** `applyHousingLandExclusions` 결과 */
export interface HousingLandExclusionResult {
  /** 배율 초과분(비사업용 토지) 양도차익 — 12억 안분 대상 아님 */
  nonBusinessGain: number;
  /** 배율 내 토지분 과세 양도차익 */
  landTaxableGain: number;
  /** 건물분의 12억 안분 후 과세 양도차익 */
  buildingTaxableGain: number;
  /** 자산 과세 양도차익 = 위 셋의 합 (Σ파트 = 자산 불변식) */
  taxableGain: number;
  step: CalculationStep;
}

/**
 * 주택 부수토지 중 **1세대1주택 비과세 대상이 아닌 부분**을 분리한다 (G-2 + G-3).
 *
 * 겸용주택 정본(`buildHousingPart`)의 ①→② 순서를 그대로 따른다:
 *   ① 비과세 비대상분을 **안분 전** 양도차익에서 분리 — 전액 과세
 *      · G-2: 배율 초과분 → 비사업용 토지(§104의3①5호). 별도 파트로 조립한다.
 *      · G-3: 배율 내이지만 나중 취득으로 보유 요건 연수(2년, 2012-06-29 전 양도분은 3년) 미만인 토지분(영 §154① 보유요건 미충족).
 *   ② 12억 안분(영 §160①)은 **잔여 주택분**(배율 내 + 요건 연수 이상 토지 + 건물)에만 적용.
 *      분모는 자산 양도가액 그대로다 — 고가주택 판정(§89①3호)은 주택과 그 부수토지 전체의
 *      실지거래가액 기준이기 때문이다.
 *      단 **고가주택(일부 비과세) + 배율 초과**의 한도 내 토지분은 기획재정부 재산세제과-915(2011.10.27.) 회신 방식이다 —
 *      전체 부수토지 양도차익의 12억 안분값에서 초과분 양도차익을 뺀 값(음수면 0). 건물분은 종전대로 안분한다.
 *      G-3(나중 취득 토지 보유요건 미달)이 겹치면 토지분 전체가 비과세 대상이 아니라 이 방식을 쓰지 않는다.
 *
 * 파트별 과세 양도차익을 `splitDetail`에 역기입해 `calcLongTermHoldingDeduction`이 같은 값으로
 * 장특공제를 산정하게 한다(이중 안분 방지).
 *
 * 적용 대상이 아니면 `null` — 호출부는 기존 안분 경로를 그대로 쓴다.
 */
export function applyHousingLandExclusions(args: {
  input: TransferTaxInput;
  splitDetail: SplitGainResult | undefined;
  isExempt: boolean;
  isPartialExempt: boolean;
  /** `calcOneHouseProration` — 12억 안분(영 §160①) 단일 소스 */
  prorate: (gain: number) => number;
}): HousingLandExclusionResult | null {
  const { input, splitDetail, isExempt, isPartialExempt, prorate } = args;
  if (!splitDetail) return null;
  const excess = resolveAppurtenantLandExcess(input);
  const laterLand = isLaterAcquiredLandExemptExcluded(input);
  // 함께 양도 1세대1주택 단위의 다른 카드(배율 초과분 · 다른 부수토지 카드)가 있어 합산 엔진이 이 주택 카드 토지분의 몫을 실은 경우 — 자기 초과가 없어도 처리한다.
  const unitShare = input.highValueExcessShare !== undefined && input.highValueExcessShare > 0 ? input.highValueExcessShare : undefined;
  if (!excess && !laterLand && unitShare === undefined) return null;

  const landGain = Math.max(0, splitDetail.land.gain);
  const buildingGain = Math.max(0, splitDetail.building.gain);

  // ① 배율 초과분을 비사업용 토지로 이전 (12억 안분 대상 아님)
  const nonBusinessGain = excess ? Math.floor(landGain * excess.nonBizRatio) : 0;
  const housingLandGain = landGain - nonBusinessGain;

  // ② 잔여 주택분 — 비과세 대상이면 안분(전액 비과세면 0), 아니면 전액 과세
  const exemptApplies = isExempt || isPartialExempt;
  const applyExempt = (gain: number) => (isExempt ? 0 : prorate(gain));
  //   배율 내 토지분: G-3(보유 요건 연수 미만)이면 비과세 대상이 아니라 전액 과세
  //   고가주택(일부 비과세) + 배율 초과 — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식: 전체 부수토지 양도차익을 12억 안분한 값에서
  //   초과분 양도차익을 뺀 것이 한도 내 토지분이고, 음수면 0이다(초과분이 안분 후 토지분보다 크면 그 차액은 없는 것으로 본다).
  //   G-3(나중 취득 토지 보유요건 미달)은 토지분 전체가 비과세 대상이 아니라 안분 대상이 아니므로 종전대로다.
  const rulingApplies = (excess !== null || unitShare !== undefined) && isPartialExempt && !isExempt && !laterLand;
  //   단위 몫(`highValueExcessShare`)이 있으면 한도 내 토지분(자기 토지 − 자기 초과분)에 그 몫을 더해 «전체 부수토지»를 이룬다. 없으면 몫 = 자기 초과분이라 종전과 같다.
  const excessForRuling = unitShare ?? nonBusinessGain;
  const wholeLandGain = housingLandGain + excessForRuling;
  const wholeLandProrated = rulingApplies ? prorate(wholeLandGain) : 0;
  const landTaxableGain = !exemptApplies || laterLand
    ? housingLandGain
    : rulingApplies
      ? highValueExcessLandTaxableGain({ landGain: wholeLandGain, excessGain: excessForRuling, prorate })
      : applyExempt(housingLandGain);
  const buildingTaxableGain = !exemptApplies ? buildingGain : applyExempt(buildingGain);

  splitDetail.land.taxableGainAfterProration = landTaxableGain;
  splitDetail.building.taxableGainAfterProration = buildingTaxableGain;
  if (excess) {
    splitDetail.nonBusinessLandPart = {
      limitArea: excess.limitArea,
      excessArea: excess.excessArea,
      appliedMultiplier: excess.multiplier,
      gain: nonBusinessGain,
      taxableGainAfterProration: nonBusinessGain,
      holdingYears: splitDetail.land.holdingYears,
      longTermRate: 0, // `calcLongTermHoldingDeduction`이 표1로 채운다
      longTermDeduction: 0,
    };
  }

  const reasons: string[] = [];
  if (excess) {
    reasons.push(
      `배율 초과분 ${excess.excessArea.toFixed(2)}㎡(한도 정착면적 × ${excess.multiplier}배 = ` +
        `${excess.limitArea.toFixed(2)}㎡)는 「소득세법」 제104조의3 제1항 제5호의 비사업용 토지 — ` +
        `양도차익 ${nonBusinessGain.toLocaleString()}을 분리해 전액 과세`,
    );
  }
  if (rulingApplies) {
    const diff = wholeLandProrated - excessForRuling;
    reasons.push(
      `고가주택(기준금액 초과) — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식: 전체 부수토지 양도차익 ${wholeLandGain.toLocaleString()}의 ` +
        `안분 후 과세분 ${wholeLandProrated.toLocaleString()} − 배율 초과분 ${excessForRuling.toLocaleString()} = ` +
        `기준면적 이내 토지분 과세 양도차익 ${landTaxableGain.toLocaleString()}` +
        (diff < 0 ? " (음수여서 0)" : "") +
        (unitShare !== undefined && unitShare !== nonBusinessGain ? " (함께 양도하는 부수토지의 배율 초과분을 단위로 합산해 이 카드 몫으로 나눈 값)" : ""),
    );
  }
  if (laterLand) reasons.push(laterLandExclusionReason(input, housingLandGain));
  const taxableGain = nonBusinessGain + landTaxableGain + buildingTaxableGain;
  return {
    nonBusinessGain,
    landTaxableGain,
    buildingTaxableGain,
    taxableGain,
    step: {
      label: "부수토지 비과세 제외",
      formula: `${reasons.join(" / ")} · 건물분 과세 양도차익 ${buildingTaxableGain.toLocaleString()}`,
      amount: taxableGain,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    },
  };
}

/** STEP 1a 전액 비과세 조기 반환을 억제해야 하는가 (G-2 또는 G-3) */
export function hasHousingLandExemptExclusion(input: TransferTaxInput): boolean {
  return isLaterAcquiredLandExemptExcluded(input) || resolveAppurtenantLandExcess(input) !== null;
}
