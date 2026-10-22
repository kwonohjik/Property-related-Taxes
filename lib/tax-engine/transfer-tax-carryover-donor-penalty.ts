/**
 * 이월과세(소득세법 §97의2①) × **증여자가 신축·증축한 건물** — 「소득세법」 §114조의2 환산취득가액 5% 가산세 (순수 leaf).
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (사용자 확정 D1~D4 · Q-1 R2 · Q-2 · Q-6 b)
 *
 * ## 한 줄 요약
 * 이월과세가 **실제로 적용(A 채택)** 되어 증여자 기준 환산취득가액이 취득가액이 될 때만, 그 환산취득가액의 **건물분**(증축은 증축 부분)에
 * 5%를 더한다. 수증자 취득가액을 증여 당시 평가액(실지거래가액, 영 §163⑨)으로 계산하는 경우(②3호 B 채택·②1호·②2호·③ 배제)는 가산세가 없다.
 *
 * ## 구조 — 기존 `penaltyAxis` 채널을 재사용한다
 * finalize STEP 10.5와 손실 조기반환(§114조의2② — 산출세액 0에도 적용)은 이미 `effectiveInput.penaltyAxis` + `isSelfBuilt/constructionDate/buildingType/
 * extensionFloorArea`를 읽는다. 그래서 **A 채택 입력**에 그 필드들을 실어 주기만 하면 두 경로·다건 합산·결과 4뷰가 코드 변경 없이 따라온다.
 * ②3호 비교는 §92③2호 결정세액(가산세 前)이라 이 leaf가 건드리지 않는다 — 비교·채택은 현행과 모든 셀에서 같다.
 *
 * ## 최상위 isSelfBuilt 와 분리한 이유
 * 최상위 `isSelfBuilt/constructionDate`는 양도자 **본인** 신축(매매 취득 전제)이다. 수증자는 증여받았으므로 신축자가 될 수 없고(영 §162①5호 — 취득시기는 증여일),
 * A·B 시나리오가 `{...rawInput}`을 공유해 B(수증자 기준)까지 증여자 신축일을 읽는 길이 열린다. 그래서 `carryoverTaxation.donorBuilt`(중첩)에 둔다.
 *
 * 순환 의존을 피하려고 `transfer-tax-carryover.ts`를 import하지 않는다 — 결과 모양은 구조 타입으로만 받는다.
 */
import { addYears } from "date-fns";
import { TRANSFER } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { apportionByStdPrice } from "./std-price-apportion";
import { calculateBuildingPenalty, splitExtensionPenaltyBase } from "./transfer-tax-building-penalty";
import { resolveTransferPriceSplit } from "./transfer-tax-split-sale-price";
import { calcLandStdPriceAtAcq } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { TransferTaxInput } from "./types/transfer.types";
import type { SplitPartResult } from "./types/transfer-split-gain.types";
import type {
  CarryoverTaxationDetail,
  CarryoverTaxationInput,
  DonorBuiltInput,
  DonorBuiltPenaltyEcho,
} from "./types/transfer-carryover.types";

type Ct = NonNullable<TransferTaxInput["carryoverTaxation"]>;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const positive = (n: number | undefined): n is number => typeof n === "number" && n > 0;

function invalid(message: string, field: string): never {
  throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { field });
}

/** 신축·증축일 범위와 증축 필수 칸 — 자산 전체(`carryoverTaxation.donorBuilt`)와 split 건물 파트가 같은 규칙을 쓴다. */
function assertDonorBuiltDatesAndExtension(db: DonorBuiltInput, ct: Ct | CarryoverTaxationInput, field: string): void {
  const law = TRANSFER.BUILDING_PENALTY;
  const t = db.constructionDate.getTime();
  if (!(t >= ct.donorAcquisitionDate.getTime()) || !(t <= ct.giftRegistryDate.getTime()))
    invalid(
      `증여자의 신축·증축일은 증여자 취득일 이후, 증여 등기접수일 이전이어야 합니다 (${TRANSFER.CARRYOVER_DONOR_BASIS}).`,
      `${field}.constructionDate`,
    );
  if (db.buildingType === "extension") {
    if (!positive(db.extensionFloorArea))
      invalid(`증축한 건물의 가산세(${law})는 증축 바닥면적 합계가 필요합니다 (85㎡ 초과만 대상).`, `${field}.extensionFloorArea`);
    if (!positive(db.extensionStdPriceAtAcquisition))
      invalid(
        `증축 가산세(${law})의 기준은 「증축한 부분에 한정한」 환산취득가액이라 증축 부분의 증여자 취득(완공) 당시 기준시가가 필요합니다.`,
        `${field}.extensionStdPriceAtAcquisition`,
      );
  }
}

/**
 * 입력 거부 — **조용히 무시하지 않는다.** `donorBuilt`가 있는데 계산에 닿을 수 없는 조합이면 던진다(⑧·⑫와 같은 규칙, 직접 호출 방어선).
 * 이월과세가 적용배제되더라도(입력 수준 오류) 같다 — 입력이 모순이면 시나리오 판정과 무관하게 막는다.
 */
export function assertDonorBuiltInput(rawInput: TransferTaxInput, ct: Ct): void {
  const db = ct.donorBuilt;
  if (!db) return;
  const law = TRANSFER.BUILDING_PENALTY;

  if (ct.useEstimatedAcquisition !== true)
    invalid(
      `증여자가 신축·증축한 건물의 가산세(${law})는 증여자 취득가액을 환산취득가액으로 계산할 때만 적용됩니다 — 실지거래가액 승계에는 보낼 수 없습니다.`,
      "carryoverTaxation.donorBuilt",
    );
  if (rawInput.propertyType !== "housing" && rawInput.propertyType !== "building")
    invalid(`증여자 신축·증축 가산세(${law})는 주택·건물에만 적용됩니다.`, "carryoverTaxation.donorBuilt");
  if (rawInput.preHousingDisclosure)
    invalid(
      `증여자 신축·증축 가산세(${law})는 개별주택가격·공동주택가격 최초공시 전 환산(${TRANSFER.PRE_HOUSING_DISCLOSURE_APPORTION})과 함께 쓸 수 없습니다 — 신축 후 5년 이내 양도 건물은 최초공시 이후 취득입니다. 일반 기준시가 환산을 선택하세요.`,
      "carryoverTaxation.donorBuilt",
    );
  if (rawInput.landAcquisitionDate)
    invalid(
      `토지·건물을 나눠 계산하는 자산의 증여자 신축·증축 가산세(${law})는 아직 지원하지 않습니다.`,
      "carryoverTaxation.donorBuilt",
    );
  if (rawInput.transferType === "burdened_gift" || rawInput.burdenedGiftInfo)
    invalid(
      `부담부증여의 이월과세에서 증여자 신축·증축 가산세(${law})는 아직 지원하지 않습니다.`,
      "carryoverTaxation.donorBuilt",
    );

  assertDonorBuiltDatesAndExtension(db, ct, "carryoverTaxation.donorBuilt");

  if (rawInput.propertyType === "housing") {
    const h = db.housing;
    if (!h)
      invalid(
        `일체 주택의 증여자 신축·증축 가산세(${law})는 건물분만 대상이라 개별주택가격을 토지·건물 기준시가 비율로 나누는 입력(증여자 취득 당시·양도 당시 토지·건물 기준시가)이 필요합니다 (${TRANSFER.BUNDLED_APPORTIONMENT}).`,
        "carryoverTaxation.donorBuilt.housing",
      );
    if (calcLandStdPriceAtAcq(h.landPricePerSqmAtAcquisition, h.landArea) == null)
      invalid("증여자 취득 당시 건물분 기준시가를 구하려면 토지의 ㎡당 개별공시지가와 면적이 필요합니다.", "carryoverTaxation.donorBuilt.housing.landPricePerSqmAtAcquisition");
    if (!positive(h.buildingStdPriceAtAcquisition))
      invalid("증여자 취득 당시 건물분 기준시가를 구하려면 취득 당시 건물 기준시가가 필요합니다 — 합계에서 토지분을 빼 대신하지 않습니다.", "carryoverTaxation.donorBuilt.housing.buildingStdPriceAtAcquisition");
    if (!positive(h.landStdPriceAtTransfer) || !positive(h.buildingStdPriceAtTransfer))
      invalid("양도 당시 건물분 기준시가와 양도가액 건물분을 구하려면 양도 당시 토지·건물 기준시가가 모두 필요합니다.", "carryoverTaxation.donorBuilt.housing.landStdPriceAtTransfer");
    if (!positive(rawInput.standardPriceAtAcquisition) || !positive(rawInput.standardPriceAtTransfer))
      invalid("일체 주택의 건물분을 구하려면 증여자 취득 당시·양도 당시 주택공시가격(개별주택가격·공동주택가격)이 필요합니다.", "standardPriceAtAcquisition");
  } else if (db.buildingType === "extension" && !positive(rawInput.standardPriceAtTransfer)) {
    invalid("증축 부분 환산취득가액의 분모인 양도 당시 기준시가가 필요합니다.", "standardPriceAtTransfer");
  }
}

/** 일체 주택 건물분 base 와 산정 내역 — 기존 S3-1 헬퍼를 증여자 취득 당시·양도 당시에 적용한다. */
function housingBase(
  rawInput: TransferTaxInput,
  db: DonorBuiltInput,
): { base: number; split: NonNullable<DonorBuiltPenaltyEcho["housingSplit"]>; formula: NonNullable<DonorBuiltPenaltyEcho["formula"]> } {
  const h = db.housing!;
  // ① 취득 당시 건물분 B_acq = H − floor(H × L ÷ (L+N)) — `calcAcqStdPair` 주택 비-별개 분기와 같은 함수
  const landAtAcq = calcLandStdPriceAtAcq(h.landPricePerSqmAtAcquisition, h.landArea)!;
  const acquisitionBuilding = apportionByStdPrice(rawInput.standardPriceAtAcquisition!, landAtAcq, h.buildingStdPriceAtAcquisition).building;
  // ② 양도 당시 건물분 B_tr — `calcSplitAcquisitionPrice`의 양도시 안분(:507-512)과 같은 호출
  const transferBuilding = apportionByStdPrice(rawInput.standardPriceAtTransfer!, h.landStdPriceAtTransfer, h.buildingStdPriceAtTransfer).building;
  // ③ 양도가액 건물분 S_b — 법정 서열(구분 기재 → §100③ 30% → 감정 → 기준시가) 그대로
  const sale = h.sale ?? {};
  const saleBuilding = resolveTransferPriceSplit({
    transferPrice: rawInput.transferPrice,
    transferDate: rawInput.transferDate,
    landStandardPriceAtTransfer: h.landStdPriceAtTransfer,
    buildingStandardPriceAtTransfer: h.buildingStdPriceAtTransfer,
    landTransferPrice: sale.landTransferPrice,
    buildingTransferPrice: sale.buildingTransferPrice,
    landAppraisalAtTransfer: sale.landAppraisalAtTransfer,
    buildingAppraisalAtTransfer: sale.buildingAppraisalAtTransfer,
    saleSplitExemption: sale.saleSplitExemption,
  } as TransferTaxInput).building;
  if (!(transferBuilding > 0))
    invalid("양도 당시 건물분 기준시가가 0이라 환산취득가액을 구할 수 없습니다.", "carryoverTaxation.donorBuilt.housing.buildingStdPriceAtTransfer");
  // ④ 건물분 환산 — 신축은 분자 B_acq, 증축은 증축 부분 취득(완공) 당시 기준시가(기존 분리 취득 증축 관행 `splitExtensionPenaltyBase`와 같은 척도)
  const numerator = db.buildingType === "extension" ? db.extensionStdPriceAtAcquisition! : acquisitionBuilding;
  return {
    base: calculateEstimatedAcquisitionPrice(saleBuilding, numerator, transferBuilding),
    split: { acquisitionBuilding, transferBuilding, saleBuilding },
    formula: { multiplicand: saleBuilding, numerator, denominator: transferBuilding },
  };
}

/**
 * `calcCarryoverScenarios` 결과에 증여자 신축·증축 가산세를 얹는다. `donorBuilt`가 없으면 **입력 그대로 반환**(회귀 0).
 *
 * · 이월과세 자체 배제(isEligible=false) → `carryover_excluded` · ②3호 B 채택 → `scenario_b` — 입력(채택 시나리오)은 건드리지 않는다.
 * · A 채택 → §114조의2 게이트(5년·시행일·증축 85㎡)를 기존 `calculateBuildingPenalty`로 판정하고, 열리면 채택 입력에 `penaltyAxis`를 싣는다.
 */
export function withDonorBuiltPenalty<R extends { detail: CarryoverTaxationDetail; adoptedInput: TransferTaxInput }>(
  rawInput: TransferTaxInput,
  result: R,
): R {
  const db = rawInput.carryoverTaxation?.donorBuilt;
  if (!db) return result;
  const { detail, adoptedInput } = result;
  const echoHead = { buildingType: db.buildingType, constructionDate: ymd(db.constructionDate) };
  const notApplied = (reason: NonNullable<DonorBuiltPenaltyEcho["notAppliedReason"]>, extra?: Partial<DonorBuiltPenaltyEcho>): R => ({
    ...result,
    detail: { ...detail, donorBuiltPenalty: { applied: false, notAppliedReason: reason, ...echoHead, ...extra } },
  });

  if (!detail.isEligible) return notApplied("carryover_excluded");
  if (detail.adoptedScenario !== "A") return notApplied("scenario_b");

  const fifth = ymd(addYears(db.constructionDate, 5));
  const gate = calculateBuildingPenalty(
    {
      ...adoptedInput,
      isSelfBuilt: true,
      penaltyDonorBuilt: true,
      acquisitionMethod: "estimated",
      buildingType: db.buildingType,
      constructionDate: db.constructionDate,
      extensionFloorArea: db.extensionFloorArea,
    },
    1,
  );
  if (gate === null) return notApplied("outside_penalty_window", { fifthAnniversary: fifth });

  let base: number;
  let housingSplit: DonorBuiltPenaltyEcho["housingSplit"];
  let formula: DonorBuiltPenaltyEcho["formula"];
  if (rawInput.propertyType === "housing") {
    const h = housingBase(rawInput, db);
    base = h.base;
    housingSplit = h.split;
    formula = h.formula;
  } else if (db.buildingType === "extension") {
    base = calculateEstimatedAcquisitionPrice(rawInput.transferPrice, db.extensionStdPriceAtAcquisition!, rawInput.standardPriceAtTransfer!);
    formula = { multiplicand: rawInput.transferPrice, numerator: db.extensionStdPriceAtAcquisition!, denominator: rawInput.standardPriceAtTransfer! };
  } else {
    // 건물 단독 신축 — 증여자 환산취득가액 전체가 건물분이다. §97②2호 단서 swap 이 발동해도 «환산을 썼다는 사실»에 붙는 가산세라 base 는 swap 전 값이다.
    base = detail.scenarioA.acquisitionPrice;
  }

  const penalty = calculateBuildingPenalty(
    {
      ...adoptedInput,
      isSelfBuilt: true,
      penaltyDonorBuilt: true,
      acquisitionMethod: "estimated",
      buildingType: db.buildingType,
      constructionDate: db.constructionDate,
      extensionFloorArea: db.extensionFloorArea,
    },
    base,
  )!.penalty;

  return {
    ...result,
    adoptedInput: {
      ...adoptedInput,
      isSelfBuilt: true,
      penaltyDonorBuilt: true,
      buildingType: db.buildingType,
      constructionDate: db.constructionDate,
      extensionFloorArea: db.extensionFloorArea,
      penaltyAxis: { acquisitionMethod: "estimated", base },
    },
    detail: {
      ...detail,
      donorBuiltPenalty: {
        applied: true,
        ...echoHead,
        fifthAnniversary: fifth,
        base,
        penalty,
        ...(housingSplit ? { housingSplit } : {}),
        ...(formula ? { formula } : {}),
      },
    },
  };
}

// ─── split 파트(P6) — 건물 파트 이월과세 × 증여자 신축·증축 ───────────────────────────────────────────

/**
 * 입력 거부(split 파트) — 토지 파트는 가산세 대상이 아니다(건물분만, D4). 건물 파트는 환산 입력(`useEstimatedAcquisition`)일 때만.
 * 주택 일체 안분은 필요 없다 — 파트별 기준시가가 이미 토지·건물로 나뉘어 있다.
 */
export function assertDonorBuiltPartInput(rawInput: TransferTaxInput, key: "land" | "building", ct: CarryoverTaxationInput): void {
  const db = ct.donorBuilt;
  if (!db) return;
  const law = TRANSFER.BUILDING_PENALTY;
  const field = `${key}CarryoverPart.donorBuilt`;
  if (key === "land")
    invalid(`토지 파트에는 증여자 신축·증축 가산세(${law})를 적용하지 않습니다 — 가산세는 건물분만 대상입니다.`, field);
  if (ct.useEstimatedAcquisition !== true)
    invalid(
      `증여자가 신축·증축한 건물의 가산세(${law})는 증여자 취득가액을 환산취득가액으로 계산할 때만 적용됩니다 — 실지거래가액 승계에는 보낼 수 없습니다.`,
      field,
    );
  if (rawInput.propertyType !== "housing" && rawInput.propertyType !== "building")
    invalid(`증여자 신축·증축 가산세(${law})는 주택·건물에만 적용됩니다.`, field);
  if (rawInput.preHousingDisclosure)
    invalid(
      `증여자 신축·증축 가산세(${law})는 개별주택가격·공동주택가격 최초공시 전 환산(${TRANSFER.PRE_HOUSING_DISCLOSURE_APPORTION})과 함께 쓸 수 없습니다 — 신축 후 5년 이내 양도 건물은 최초공시 이후 취득입니다.`,
      field,
    );
  if (rawInput.transferType === "burdened_gift" || rawInput.burdenedGiftInfo)
    invalid(`부담부증여의 이월과세에서 증여자 신축·증축 가산세(${law})는 아직 지원하지 않습니다.`, field);
  assertDonorBuiltDatesAndExtension(db, ct, field);
}

/** 채택(A) 입력에 싣는 §114조의2 게이트 입력 — finalize·손실 조기반환이 `effectiveInput`에서 읽는다(`penaltyAxis`는 split 건물 파트 축이 따로 낸다). */
export function donorBuiltPartPatch(db: DonorBuiltInput): Partial<TransferTaxInput> {
  return {
    isSelfBuilt: true,
    penaltyDonorBuilt: true,
    buildingType: db.buildingType,
    constructionDate: db.constructionDate,
    extensionFloorArea: db.extensionFloorArea,
    extensionStdPriceAtAcquisition: db.extensionStdPriceAtAcquisition,
  };
}

/** 가산세가 붙지 않은 이유 echo — 입력 머리(신축·증축 구분, 신축일)만 싣는다. */
export function donorBuiltNotAppliedEcho(
  db: DonorBuiltInput,
  reason: NonNullable<DonorBuiltPenaltyEcho["notAppliedReason"]>,
  extra?: Partial<DonorBuiltPenaltyEcho>,
): DonorBuiltPenaltyEcho {
  return { applied: false, notAppliedReason: reason, buildingType: db.buildingType, constructionDate: ymd(db.constructionDate), ...extra };
}

/**
 * A 채택 건물 파트의 가산세 echo — 패치가 실린 채택 입력(`patched`)과 그 입력으로 낸 건물 파트 결과(`part`)에서 읽는다.
 * base 는 엔진 finalize 와 **같은 함수**(`splitExtensionPenaltyBase`)가 구한 값이다 — 신축은 건물 파트 환산취득가액, 증축은 증축 부분 환산.
 * 게이트(5년·시행일·증축 85㎡)가 닫히면 `outside_penalty_window`.
 */
export function donorBuiltPartAppliedEcho(db: DonorBuiltInput, patched: TransferTaxInput, part: SplitPartResult): DonorBuiltPenaltyEcho {
  const fifth = ymd(addYears(db.constructionDate, 5));
  const gateInput: TransferTaxInput = { ...patched, acquisitionMethod: "estimated" };
  if (calculateBuildingPenalty(gateInput, 1) === null) return donorBuiltNotAppliedEcho(db, "outside_penalty_window", { fifthAnniversary: fifth });
  let formula: DonorBuiltPenaltyEcho["formula"];
  if (db.buildingType === "extension") {
    // 분모(양도 당시 건물 기준시가)는 환산 파트의 필수 입력이라 비면 엔진이 이미 던졌다(`splitCarryoverBasis` 경로) — 여기서는 항상 양수다.
    formula = { multiplicand: part.transferPrice, numerator: db.extensionStdPriceAtAcquisition!, denominator: part.stdPriceAtTransfer! };
  }
  const base = splitExtensionPenaltyBase(gateInput, "estimated", part);
  const penalty = calculateBuildingPenalty(gateInput, base)!.penalty;
  return {
    applied: true,
    buildingType: db.buildingType,
    constructionDate: ymd(db.constructionDate),
    fifthAnniversary: fifth,
    base,
    penalty,
    ...(formula ? { formula } : {}),
  };
}
