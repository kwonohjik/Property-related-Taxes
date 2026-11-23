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
 *
 * 결과 고지문 8종(#17 · #17-2 · D2 · D1-H 등)은 `transfer-tax-appurtenant-land-notices.ts`로 옮겼고 아래에서 재export한다(2026-11-21 · 800줄 정책).
 */
import { calculateHoldingPeriod } from "./tax-utils";
import { landOnlyBuildingOwnerOtherHousehold } from "./land-only-owner-household";
import { landOnlyHouseholdMergeDate } from "./land-only-owner-household";
import { laterOfMergeDate } from "./land-only-owner-household";
import { areaTimes, judgeAreaLimit } from "./area-limit";
import { round2 } from "./area-utils";
import { appurtenantLandMultiplier, expropriationZoneBaseDateNotice } from "./appurtenant-land-rate";
import { housingExcessDeemNotices, housingExcessDeemedBusiness } from "./appurtenant-excess-deeming";
import { resolveOneHouseMinHoldingYears } from "./data/one-house-holding-residence-era";
import { expropriationNoticeDateRequirementApplies } from "./data/one-house-154-1-proviso-era";
import { resolveExemptionProviso, type ResidenceReqInput } from "./transfer-tax-exemption-holding";
import { resolveRateBasis, type RateBasisRule } from "./transfer-rate-holding-basis";
import { aggregateLandRebuildPeriods, landRebuildApplies, type LandRebuildAggregation } from "./transfer-land-rebuild-rate";
import { coerceOptionalDate } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import { appurtenantLandFactsOfInput, housingExcessSplitAppliesToInput } from "./housing-excess-split";
import type { DeemedBusinessExcess, SplitGainResult } from "./types/transfer-split-gain.types";
import { highValueExcessLandTaxableGain } from "./high-value-excess-land";
export { highValueExcessLandTaxableGain, allocateUnitExcessShares } from "./high-value-excess-land";
export { housingExcessAcqContractNotice } from "./housing-excess-acq-contract";
export {
  housingExcessUnseparatedNotice,
  housingExcessCapexNotice,
  housingExcessInheritedNotice,
  highValueExcessFormulaNotice,
  highValueExcessRulingNoticeText,
  landBeforeBuildingAcquisitionRateNotice,
  buildingSec164ApportionNotice,
  houseLandSec164Notice,
} from "./transfer-tax-appurtenant-land-notices";
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
 *   근거 수준: **토지를 먼저, 주택을 나중에** 취득한 방향은 직접 근거가 있다 — 사전-2025-법규재산-0289(2025.6.4.: 토지 상속(1991) 후 주택 매수(2024.7.) →
 *   1년 내 양도, 토지 중 영 §167의5 부수토지분은 70%·장기보유특별공제는 토지 전체 보유기간), 나대지 위 주택 신축도 기획재정부 재산세제과-1354(2022.10.27.)·
 *   사전-2021-법규재산-1232(2022.10.31.)·조심 2024인3140. **토지를 나중에** 취득한 방향은 여전히 간접이다 — 국세청 상속증여세과-466(2013.8.12.)·
 *   부동산거래관리과-435(2010.3.22.)가 부수토지의 취득시기를 개별 판정하도록 한 데서 논리적으로 이어진 것이고 "세율 보유기간을 `max`로" 라는 명시 판단은 없다(계획서 §10-1).
 *   ⇒ 되돌릴 수 있도록 이 함수 하나에 격리한다.
 * - **구주택 멸실·신축 통산**(`landRebuildPriorHouse`, 서면법규과-1222 · 사전-2023-법규재산-0097): 입력이 있으면 `max` 대신 두 구간 통산 개월을 만드는
 *   **등가 기산일**을 돌려준다(`resolveLandRebuildAggregation`). 입력이 없으면 위 규칙 그대로 — 나대지·상가 철거 후 신축((7) 계열)은 입력이 없어 불변이다.
 */
export function resolveAppurtenantLandRateBasisDate(input: TransferTaxInput): Date | undefined {
  const effective = resolveLandStatutoryAcquisitionDate(input);
  if (!effective) return undefined;
  // ② 주택은 "주택부수토지로서의" 보유기간 → `max` — 단 다른 세대 토지만 본인은 이 세대 주택의 부수토지가 아니라 일반 토지다(서면법규과-944).
  if (input.propertyType !== "housing" || landOnlyBuildingOwnerOtherHousehold(input)) return effective;
  const rebuilt = resolveLandRebuildAggregation(input);
  if (rebuilt) return rebuilt.equivalentBasisDate;
  // 같은 세대 토지만 본인은 합가일도 `max`에 든다(`landOnlyRateInput`과 같은 규칙).
  const start = laterOfMergeDate(effective, landOnlyHouseholdMergeDate(input));
  return start.getTime() >= input.acquisitionDate.getTime() ? start : input.acquisitionDate;
}

/**
 * 구주택 멸실·신축 통산 — 입력이 유효한 호스트(`landRebuildApplies`)면 두 구간·합산 개월·등가 기산일, 아니면 `undefined`.
 * 구주택 부수토지 기간의 시작은 **토지 §104② 법정 기산일**(`resolveLandRateBasis` — 상속은 피상속인·이월과세는 증여자 취득일)과
 * 입력한 구주택 취득일(`later`) 중 늦은 날이다. 결과 echo(`transfer-split-part-echo.ts`)·고지·세율 시드가 이 함수 하나를 부른다.
 */
export function resolveLandRebuildAggregation(input: TransferTaxInput): LandRebuildAggregation | undefined {
  if (!landRebuildApplies(input)) return undefined;
  const land = resolveLandRateBasis(input);
  const acquisition = coerceOptionalDate(input.acquisitionDate as Date | string | undefined);
  const transfer = coerceOptionalDate(input.transferDate as Date | string | undefined);
  if (!land || !acquisition || !transfer) return undefined;
  return aggregateLandRebuildPeriods({
    landBasisDate: land.date,
    rebuild: input.landRebuildPriorHouse!,
    newHouseAcquisitionDate: acquisition,
    transferDate: transfer,
  });
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
    // 수유자 여부는 자산 단위 선언 하나다 — 토지 파트가 따로 상속이어도 같은 사람의 같은 사실로 본다.
    nonHeirBequest: input.nonHeirBequest,
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
export function buildNblPartRateInput(input: TransferTaxInput, basisDate: Date, deemedBusiness = false): TransferTaxInput {
  return {
    ...buildLandRateInput(input, basisDate),
    propertyType: "land",
    // NBL2611-C4 — 수용 의제·유예로 비사업용이 아닌 초과분은 같은 토지 파트이되 중과(+10%p)가 없다.
    isNonBusinessLand: !deemedBusiness,
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
  // 토지만 본인도 같다 — 같은 세대원이 각각 소유해도 그 토지를 「주택부수토지로서 보유」한 기간만 보유요건에 든다(재산46014-610).
  // 건물만 본인은 토지를 양도하지 않는다. 다른 세대 토지는 STEP 1이 비과세를 이미 거뒀다(V-3′).
  if (input.selfOwns === "building_only") return false;
  // 별개취득 입력이어야 `calcSplitGain`이 반드시 파트를 낸다(총액 경로로 흘러 null이 되지 않음).
  if (input.isSeparateAcquisition !== true) return false;
  const land = input.landAcquisitionDate;
  if (!land) return false;
  // 합가일이 토지 취득일보다 늦으면 그 날부터가 「주택부수토지로서 보유」한 기간이다(재산46014-610) — 토지가 먼저여도 합가가 늦으면 같은 제외가 걸린다.
  if (!isLaterAcquiredLandHeldTooShort(laterOfMergeDate(land, landOnlyHouseholdMergeDate(input)), input.acquisitionDate, input.transferDate)) return false;
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
  if (!appurtenantCardHeldTooShort(input)) return false;
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
 * 부수토지 카드(F-13)의 보유요건 — 짝 주택 verdict의 취득일에 **합가일**을 더한다(합가 이전은 주택부수토지로서의 보유가 아니다 — 재산46014-610).
 * `checkExemption`의 부수토지 분기와 수용 단서 판정(`appurtenantCardCoveredByExpropriationProviso`)이 **이 한 함수**를 쓴다.
 */
export function appurtenantCardHeldTooShort(
  input: Pick<TransferTaxInput, "appurtenantHouseVerdict" | "acquisitionDate" | "transferDate">,
): boolean {
  const v = input.appurtenantHouseVerdict;
  if (!v) return false;
  return isLaterAcquiredLandHeldTooShort(laterOfMergeDate(input.acquisitionDate, v.houseMergeDate), v.houseAcquisitionDate, input.transferDate);
}

/**
 * 배율 한도 판정(G-2)이 도는 입력 게이트 — 주택 · 토지를 본인이 소유(소유자 같음 또는 토지만) · 별개취득 · 용도지역 선택 · 정착면적·토지면적 양수.
 * `resolveAppurtenantLandExcess`와 수용 기준일 고지(`expropriationZoneNoticeFor`)가 **같은 게이트**를 쓴다.
 *
 * 토지만 본인도 판정한다 — 「소득세법」 §104의3①5호(「주택부속토지 중 … 배율을 곱하여 산정한 면적을 초과하는 토지」)에 소유자 조건이 없고,
 * 소유자가 다른 주택의 부수토지도 초과분은 비사업용 토지다(서면인터넷방문상담4팀-2511 · 같은 5팀-2469). 건물만 본인은 초과 토지를 갖지 않는다.
 * 소유자 분리는 이미 기준시가 비율로 토지·건물 파트를 만들므로(`calcSplitGain` `isOwnerSplit`) 같은 날 취득이어도 아래 별개취득 게이트를 거치지 않는다.
 */
function resolveAppurtenantZoneInputs(
  input: TransferTaxInput,
): { zone: NonNullable<TransferTaxInput["appurtenantLandZone"]>; footprint: number; landArea: number } | null {
  if (input.propertyType !== "housing") return null;
  const selfOwns = input.selfOwns ?? "both";
  if (selfOwns === "building_only") return null;
  // 별개취득이 아니면 «같은 날 취득 주택의 초과분 분리 경로»(`housing-excess-split.ts` — 기준시가 안분 입력이 있는 매매 주택)만 연다(#17).
  if (selfOwns === "both" && input.isSeparateAcquisition !== true && !housingExcessSplitAppliesToInput(input)) return null;
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

/**
 * NBL2611-C4 — 배율 초과분의 수용 의제·유예 고지(세액 불변). 초과분이 있는 입구에서만 말한다(`resolveAppurtenantLandExcess`와 같은 게이트).
 * 수용인데 고시일이 없으면 확인 필요 · 의제 성립이면 근거 · 유예를 입력했으나 기간기준 미충족이면 그 사실.
 */
export function appurtenantExcessDeemNoticesFor(input: TransferTaxInput): string[] {
  return housingExcessDeemNotices(input, resolveAppurtenantLandExcess(input) !== null);
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
  /** NBL2611-C4 — 영 §168의14③3호(수용 의제)·①(유예)로 비사업용 토지로 보지 않는 초과분이면 그 사유(분리·과세는 그대로, 세율만 일반 토지) */
  deemedBusiness?: DeemedBusinessExcess;
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
  // NBL2611-V9-I — 한도·초과는 정수 정확 연산(`area-limit.ts`). `round2`는 면적 2자리 확정 역할만 유지한다.
  const limitArea = round2(areaTimes(footprint, multiplier));
  const excessArea = round2(judgeAreaLimit(landArea, limitArea).excess);
  if (excessArea <= 0) return null;
  // NBL2611-C4(R16) — 배율을 넘는 면적이라도 수용 무조건 의제(영 §168의14③3호)·유예기간(①)으로 비사업용이 아니면 세율만 일반 토지다. 비과세 범위(§154⑦)는 그대로라 분리는 유지한다.
  const deemedBusiness = housingExcessDeemedBusiness(input);
  return { multiplier, limitArea, excessArea, nonBizRatio: excessArea / landArea, ...(deemedBusiness ? { deemedBusiness } : {}) };
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
  const unitShare = input.highValueExcessShare !== undefined && input.highValueExcessShare !== 0 ? input.highValueExcessShare : undefined;
  if (!excess && !laterLand && unitShare === undefined) return null;

  // 파트 차손은 **과세분만** 남긴다 — 하류 파트 세율 판정이 「소득세법 시행령」 §167의2①로 다른 파트에서 공제한다(계획서 `transfer-split-part-loss-offset-p2.plan.md` Q-1).
  //   비과세분 차손은 과세분과 통산하지 않는다(상속증여세과-209) — 12억 초과 고가주택이면 차손도 양도차익과 같은 비율로 안분해 과세분만 남는다.
  //   · 건물: 아래 `buildingTaxableGain`이 전액 비과세 0 · 일부 비과세 안분 · 과세 그대로를 정한다(종전에는 차손을 먼저 0으로 잘랐다).
  //   · 토지: 배율 초과분(비사업용 토지 — 비과세 대상 아님)은 차손도 전액 과세분이다. 기준면적 이내분은 전액 비과세면 0, 고가주택(일부 비과세)이면
  //     재산세제과-915 회신 산식을 부호만 대칭으로 쓴다(`highValueExcessLandTaxableGain` — 사용자 결정 2026-10-20 A안 · 조심2016부0323).
  const landGain = splitDetail.land.gain;
  const buildingGain = splitDetail.building.gain;

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
  //   토지만 본인은 건물을 갖지 않는다 — 건물분은 본인 신고분이 아니다(`transfer-tax.ts` 소유자 분리 · 소령 §166⑥).
  const buildingTaxableGain = input.selfOwns === "land_only" ? 0 : !exemptApplies ? buildingGain : applyExempt(buildingGain);

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
      ...(excess.deemedBusiness ? { deemedBusiness: excess.deemedBusiness } : {}),
    };
  }

  const reasons: string[] = [];
  if (excess) {
    reasons.push(
      `배율 초과분 ${excess.excessArea.toFixed(2)}㎡(한도 정착면적 × ${excess.multiplier}배 = ` +
        `${excess.limitArea.toFixed(2)}㎡)는 ` +
        (excess.deemedBusiness
          ? `비과세 범위(영 §154⑦)를 넘어 — 비사업용 토지로 보지 않는 토지(${excess.deemedBusiness.legalBasis}) — `
          : "「소득세법」 제104조의3 제1항 제5호의 비사업용 토지 — ") +
        `양도차익 ${nonBusinessGain.toLocaleString()}을 분리해 전액 과세`,
    );
  }
  if (rulingApplies) {
    const diff = wholeLandProrated - excessForRuling;
    reasons.push(
      `고가주택(기준금액 초과) — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식: 전체 부수토지 양도차익 ${wholeLandGain.toLocaleString()}의 ` +
        `안분 후 과세분 ${wholeLandProrated.toLocaleString()} − 배율 초과분 ${excessForRuling.toLocaleString()} = ` +
        `기준면적 이내 토지분 과세 양도차익 ${landTaxableGain.toLocaleString()}` +
        (landTaxableGain !== diff ? (wholeLandGain < 0 ? " (토지 차손인데 양수여서 0)" : " (음수여서 0)") : "") +
        (unitShare !== undefined && unitShare !== nonBusinessGain
          ? ` (함께 양도하는 부수토지의 배율 초과분${unitShare < 0 ? " 양도차손" : ""}을 단위로 합산해 이 카드 몫으로 나눈 값)`
          : ""),
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
