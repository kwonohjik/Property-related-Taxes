import { subYears } from "date-fns";
import { TRANSFER } from "./legal-codes";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import type { TransferTaxInput } from "./types/transfer.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import { clauseBucketKey } from "./transfer-tax-rate-clause";
import type { SplitPartRateResult, SplitRatePart } from "./transfer-tax-split-rate";

/**
 * 조특법 §77① 감면율 — 경계는 **2025-01-01 양도분**이다.
 *
 * 개정: 법률 **제20778호**(공포·시행 **2025-03-14**). 같은 법 **부칙 제10조**
 *   「제77조제1항 및 제4항의 개정규정은 이 법 시행일이 **속하는 과세연도에 양도하는
 *    경우부터** 적용한다」 ⇒ 시행일이 속한 과세연도가 2025년(양도세 과세기간 1.1~12.31)
 *   이므로 **2025-01-01 양도분부터** 개정율이 간다(시행일 이전 양도분에도 소급).
 *
 * ⚠️ 시행일자별 본문만 보면 틀린다 — `efYd=20250101`은 10%, `efYd=20260101`은 15%라
 *   그 둘만 비교하면 「2026-01-01 시행」으로 오독하게 된다. 실제 갈림은 `efYd=20250314`
 *   (mst 269877)이고, 소급 여부는 **부칙**을 읽어야 확정된다.
 *   (코드리뷰 D7-01·D7-02가 이 함정에 빠져 오탐을 냈다 — anchor
 *    `expropriation-2025-amendment-boundary.anchor.test.ts`가 경계를 고정한다.)
 */
export const PUBLIC_EXPROPRIATION_RATES = Object.freeze({
  // 2018-01-01 ~ 2024-12-31 양도분 (개정 전)
  CURRENT_2018: Object.freeze({ cash: 0.10, bond: 0.15, bond3y: 0.30, bond5y: 0.40 }),
  // 2025-01-01 이후 양도분 (법률 제20778호, 부칙 §10 — 과세연도 단위 소급)
  AMENDED_2025: Object.freeze({ cash: 0.15, bond: 0.20, bond3y: 0.35, bond5y: 0.45 }),
  /**
   * 종전 감면율 — **법률 제13560호(2015-12-15 공포, 2016-01-01 시행) 부칙 제53조**.
   *
   * 부칙 원문(법제처 DRF `fetchAddendaUnits("177204")` 실측):
   *   「제53조(공익사업용 토지 등에 대한 양도소득세의 감면에 관한 경과조치) 이 법 시행 전에
   *    사업인정 고시가 된 사업지역의 사업시행자에게 **2017년 12월 31일까지** 사업지역 내
   *    토지등을 양도한 경우는 제77조제1항 각 호 외의 부분의 개정규정에도 불구하고
   *    **종전의 규정에 따른다**.」
   *
   * ⇒ 「종전의 규정」 = 제13560호 시행 **직전**(2014-01-01 ~ 2015-12-31) 시행본의 §77①
   *   = **15 / 20 / 30 / 40**. 세 시대의 요율(DRF 시행본 실측):
   *     · 2010-01-01 ~ 2013-12-31 — 20 / 25 / 40 / 50
   *     · **2014-01-01 ~ 2015-12-31 — 15 / 20 / 30 / 40**  ← 보존 대상
   *     · 2016-01-01 ~ (제13560호)  — 10 / 15 / 30 / 40
   *
   * 🔴 **2026-09-03 정정 (세액 변경)** — 종전에는 `20 / 25 / 40 / 50`(2010~2013 세트)이었다.
   *   부칙을 못 읽어 「미확인」으로 두는 사이 **두 시대를 건너뛴 값**이 들어가 있었다.
   *   2014년 인하(법률 제12173호)의 부칙에는 §77 적용례·경과조치가 **0건**이라
   *   (「공익사업」 언급 자체가 없다 — 부칙 전문 실측) 2010~2013 요율이 2016년 이후로
   *   이어질 경로가 없다. ⇒ 종전 값은 감면 과다(= 세액 과소)였다.
   */
  LEGACY:  Object.freeze({ cash: 0.15, bond: 0.20, bond3y: 0.30, bond5y: 0.40 }),
});

/**
 * @deprecated 양도연도 분기 — getInvoluntaryTransferLimits(year).annual 사용.
 * 2025+ 값(2억) 유지 (하위호환 · 테스트 참조).
 */
export const PUBLIC_EXPROPRIATION_ANNUAL_LIMIT = 200_000_000;

/**
 * 조특법 §133② 비자발적 양도(§77·§77의2·§77의3) 감면 종합한도 — 양도연도 분기.
 *
 * §133②는 법률 **제20778호**(공포·시행 2025-03-14)로 **신설**됐고, 같은 법 **부칙 제15조①**
 * 「제133조제1항부터 제3항까지의 개정규정은 이 법 시행일이 **속하는 과세연도에 양도하는
 *  경우부터** 적용한다」에 따라 **2025 과세연도 양도분부터** 연 2억 / 5년 3억이다.
 * 2024년 이전 양도분은 §133①에 §77 계열이 함께 열거돼 자경 계열과 **1억을 공유**한다
 * (그룹 «구성» 자체가 갈린다 — `buildLimitGroups` 참조).
 */
export function getInvoluntaryTransferLimits(
  transferYear: number,
): { annual: number; fiveYear: number } {
  return transferYear >= 2025
    ? { annual: 200_000_000, fiveYear: 300_000_000 }
    : { annual: 100_000_000, fiveYear: 200_000_000 };
}

export const AMENDED_2025_TRANSFER_CUTOFF = new Date("2025-01-01T00:00:00");
/** 부칙 §53 「이 법 시행(2016-01-01) 전에 사업인정 고시가 된」 ⇒ 고시일 ≤ 2015-12-31 (원문 대조 ✅) */
export const LEGACY_APPROVAL_CUTOFF = new Date("2015-12-31T23:59:59");
/** 부칙 §53 「2017년 12월 31일까지 … 양도한 경우」 ⇒ 양도일 ≤ 2017-12-31 (원문 대조 ✅) */
export const LEGACY_TRANSFER_CUTOFF = new Date("2017-12-31T23:59:59");
/** 조특법 §77① 일몰 — 2026.12.31 이전 양도분에 한정(양도일 기준). */
export const PUBLIC_EXPROPRIATION_SUNSET = new Date("2026-12-31T23:59:59");

export interface PublicExpropriationReductionInput {
  cashCompensation: number;
  bondCompensation: number;
  bondHoldingYears?: 3 | 5 | null;
  businessApprovalDate: Date;
  /** 취득일(상속 시 피상속인 취득일 — §77⑨, `expropriationAcquisitionDate`) — §77① '고시일 소급 2년 이전 취득' 요건 검증용. 미제공 시 요건 미검증(하위호환). */
  acquisitionDate?: Date;
  transferDate: Date;
  calculatedTax: number;
  /** 양도소득금액 = 양도차익 − 장기보유특별공제 (기본공제 차감 전) */
  transferIncome: number;
  /** 실제 적용된 기본공제 (당해 연도 한도 내 잔여) */
  basicDeduction: number;
  /** 과세표준 = 양도소득금액 − 기본공제 (산출세액 분모) */
  taxBase: number;
  /**
   * 5B — 토지·건물을 따로 취득한 자산의 파트별 취득일·양도소득금액. 주면 「소급 2년 이전 취득」 요건을 파트마다 판정한다
   * (`acquisitionDate`보다 우선). 미제공이면 종전대로 `acquisitionDate` 하나로 자산 전체를 판정한다.
   */
  parts?: PublicExpropriationParts;
}

/** 5B 파트 입력 — `income`은 그 파트의 양도소득금액(과세 양도차익 − 장기보유특별공제) */
export interface PublicExpropriationParts {
  land: { acquisitionDate: Date; income: number; clauseBasis?: PartClauseBasis };
  building: { acquisitionDate: Date; income: number; clauseBasis?: PartClauseBasis };
}

/**
 * 「소득세법」 §90①의 A·D를 **감면대상 파트가 속한 호**로 잡을 때의 산출세액·과세표준(Q-F2c).
 * 토지·건물이 서로 다른 세율의 호에 속하면 다른 호의 세율이 감면으로 번지지 않도록 그 파트의 호 버킷만 쓴다
 * (재산세과-3820 「각호별로 산출세액과 감면세액을 산정」 — 다건 M-8과 같은 규칙).
 */
export interface PartClauseBasis {
  calculatedTax: number;
  taxBase: number;
}

export interface PublicExpropriationReductionResult {
  isEligible: boolean;
  reductionAmount: number;
  rawReductionAmount: number;
  weightedRate: number;
  breakdown: {
    cashRate: number;
    bondRate: number;
    cashAmount: number;
    bondAmount: number;
    /** 현금보상분 감면소득금액 = 양도소득금액 × 현금 / 총보상 */
    cashIncome: number;
    /** 채권보상분 감면소득금액 = 양도소득금액 − 현금분 */
    bondIncome: number;
    /** 현금분에 배정된 기본공제 (§103② 감면율 낮은 자산 우선) */
    basicDeductionOnCash: number;
    /** 채권분에 배정된 기본공제 (낮은쪽 소득이 기본공제보다 작을 때 잔여분) */
    basicDeductionOnBond: number;
    /** 현금 감면금액 = (현금분 − 현금 기본공제) × 현금율 */
    cashReduction: number;
    /** 채권 감면금액 = (채권분 − 채권 기본공제) × 채권율 */
    bondReduction: number;
    /** 감면대상소득금액 = 현금 감면금액 + 채권 감면금액 */
    reducibleIncome: number;
  };
  useLegacyRates: boolean;
  /** 적용 감면율 세트 — 결과 카드 배지 (2025 개정율 안내용) */
  rateSetApplied: "current_2018" | "amended_2025" | "legacy";
  cappedByAnnualLimit: boolean;
  appliedAnnualLimit: number;
  legalBasis: string;
  warnings: string[];
  notEligibleReason?: string;
  /**
   * 5B — 한 파트만 「소급 2년 이전 취득」 요건을 충족해 감면대상을 그 파트로 한정했을 때만 채운다.
   * `breakdown`의 현금·채권분 소득은 `eligibleIncome`을, 기본공제는 `basicDeductionOnExcluded`를 뺀 나머지를 기준으로 한다.
   */
  partWise?: {
    eligiblePart: "land" | "building";
    /** 감면대상 파트의 양도소득금액 */
    eligibleIncome: number;
    /** 감면 제외 파트의 양도소득금액(= 자산 양도소득금액 − 감면대상분) */
    excludedIncome: number;
    /** 감면 제외 파트에 먼저 배정한 기본공제 (「소득세법」 §103② — 감면율이 낮은 자산부터) */
    basicDeductionOnExcluded: number;
    /** 감면대상 파트가 속한 호의 산출세액·과세표준 — 있으면 §90①의 A·D로 쓴다(호별 산정, Q-F2c). */
    clauseBasis?: PartClauseBasis;
  };
}

function pickBondRate(
  rates: { bond: number; bond3y: number; bond5y: number },
  bondHoldingYears: 3 | 5 | null | undefined,
): number {
  if (bondHoldingYears === 5) return rates.bond5y;
  if (bondHoldingYears === 3) return rates.bond3y;
  return rates.bond;
}

function emptyBreakdown(input: PublicExpropriationReductionInput) {
  return {
    cashRate: 0,
    bondRate: 0,
    cashAmount: input.cashCompensation,
    bondAmount: input.bondCompensation,
    cashIncome: 0,
    bondIncome: 0,
    basicDeductionOnCash: 0,
    basicDeductionOnBond: 0,
    cashReduction: 0,
    bondReduction: 0,
    reducibleIncome: 0,
  };
}

export function calculatePublicExpropriationReduction(
  input: PublicExpropriationReductionInput,
): PublicExpropriationReductionResult {
  const warnings: string[] = [];
  const totalCompensation = input.cashCompensation + input.bondCompensation;

  // 조특법 §77①: 사업인정고시일(고시 전 양도 시 양도일)부터 소급 2년 이전에 취득한 토지등에 한정.
  // acquisitionDate 미제공 시 검증 불가로 통과(하위호환) — 메인 파이프라인은 자산 취득일을 전달한다.
  const acqBaselineDate =
    input.transferDate < input.businessApprovalDate ? input.transferDate : input.businessApprovalDate;
  const acqCutoff = subYears(acqBaselineDate, 2);
  let failsAcqRequirement = input.acquisitionDate !== undefined && input.acquisitionDate > acqCutoff;
  // 5B — 문언 「2년 이전에 취득한 토지등을 양도함으로써 발생하는 소득」을 토지·건물 각각에 적용한다(2026-10-11 사용자 결정 —
  //   파트별 판정을 정면으로 다룬 해석례 없음, 확인 필요 고지). 한 파트만 충족하면 그 파트의 양도소득금액만 감면대상이고,
  //   기본공제는 감면이 없는 파트에 먼저 배정한다(「소득세법」 §103② — 감면율이 낮은 자산의 양도소득금액에서부터 공제).
  let transferIncome = input.transferIncome;
  let basicDeductionInput = input.basicDeduction;
  let partWise: PublicExpropriationReductionResult["partWise"];
  if (input.parts) {
    const landOk = input.parts.land.acquisitionDate <= acqCutoff;
    const buildingOk = input.parts.building.acquisitionDate <= acqCutoff;
    failsAcqRequirement = !landOk && !buildingOk;
    if (landOk !== buildingOk) {
      const eligiblePart = landOk ? "land" : "building";
      const eligibleIncome = Math.min(Math.max(0, input.parts[eligiblePart].income), input.transferIncome);
      const excludedIncome = input.transferIncome - eligibleIncome;
      const basicDeductionOnExcluded = Math.min(Math.max(0, input.basicDeduction), excludedIncome);
      transferIncome = eligibleIncome;
      basicDeductionInput = input.basicDeduction - basicDeductionOnExcluded;
      const clauseBasis = input.parts[eligiblePart].clauseBasis;
      partWise = {
        eligiblePart,
        eligibleIncome,
        excludedIncome,
        basicDeductionOnExcluded,
        ...(clauseBasis && clauseBasis.taxBase > 0 ? { clauseBasis } : {}),
      };
    }
  }

  // 조특법 §77① 일몰: 2026.12.31 이전 양도분에 한정(양도일 기준).
  const failsSunset = input.transferDate > PUBLIC_EXPROPRIATION_SUNSET;

  // 비적격 조기 반환
  if (
    totalCompensation <= 0 ||
    input.calculatedTax <= 0 ||
    input.transferIncome <= 0 ||
    input.taxBase <= 0 ||
    failsAcqRequirement ||
    failsSunset
  ) {
    return {
      isEligible: false,
      reductionAmount: 0,
      rawReductionAmount: 0,
      weightedRate: 0,
      breakdown: emptyBreakdown(input),
      useLegacyRates: false,
      rateSetApplied:
        input.transferDate >= AMENDED_2025_TRANSFER_CUTOFF
          ? "amended_2025"
          : "current_2018",
      cappedByAnnualLimit: false,
      appliedAnnualLimit: getInvoluntaryTransferLimits(
        input.transferDate.getFullYear(),
      ).annual,
      legalBasis: TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
      warnings,
      notEligibleReason: failsSunset
        ? "양도일이 2026-12-31 이후입니다 (조특법 §77① 일몰)"
        : failsAcqRequirement
        ? "사업인정고시일부터 소급 2년 이전에 취득한 토지등이 아닙니다(조특법 §77①)"
        : totalCompensation <= 0
          ? "보상액(현금+채권) 합계가 0 이하입니다"
          : input.calculatedTax <= 0
            ? "산출세액이 0 이하입니다"
            : input.transferIncome <= 0
              ? "양도소득금액이 0 이하입니다"
              : "과세표준이 0 이하입니다",
    };
  }

  // ── 감면율 결정 (양도일 우선: 2025 개정 → 부칙 제53조 → 현행) ──
  // 2025.1.1. 이후 양도분은 무조건 AMENDED_2025 (제13560호 부칙 §53은 양도≤2017만 → 중첩 없음).
  const isAmended2025 = input.transferDate >= AMENDED_2025_TRANSFER_CUTOFF;
  const useLegacyRates =
    !isAmended2025 &&
    input.businessApprovalDate <= LEGACY_APPROVAL_CUTOFF &&
    input.transferDate <= LEGACY_TRANSFER_CUTOFF;

  const rateSetApplied: "current_2018" | "amended_2025" | "legacy" = isAmended2025
    ? "amended_2025"
    : useLegacyRates
      ? "legacy"
      : "current_2018";
  const rateSet = isAmended2025
    ? PUBLIC_EXPROPRIATION_RATES.AMENDED_2025
    : useLegacyRates
      ? PUBLIC_EXPROPRIATION_RATES.LEGACY
      : PUBLIC_EXPROPRIATION_RATES.CURRENT_2018;

  // ── 연간 한도 (조특법 §133② — 양도연도 분기: 2025+ 2억 / 이전 1억) ──
  const annualLimit = getInvoluntaryTransferLimits(
    input.transferDate.getFullYear(),
  ).annual;

  const cashRate = rateSet.cash;
  const bondRate = pickBondRate(rateSet, input.bondHoldingYears);

  // ── ① 양도소득금액을 보상액 비율로 안분 ──
  //   현금분 = floor(양도소득금액 × 현금 / 총보상)
  //   채권분 = 양도소득금액 − 현금분 (잔여값 = 합계 정확 일치)
  const cashIncome =
    input.cashCompensation > 0
      ? safeMultiplyThenDivide(
          transferIncome,
          input.cashCompensation,
          totalCompensation,
        )
      : 0;
  const bondIncome = Math.max(0, transferIncome - cashIncome);

  // ── ② 기본공제 배정 (소득세법 §103② — 감면율 낮은 자산에서 먼저 차감) ──
  const basicDeduction = Math.max(0, basicDeductionInput);
  let basicDeductionOnCash = 0;
  let basicDeductionOnBond = 0;

  const onlyCash = input.bondCompensation <= 0;
  const onlyBond = input.cashCompensation <= 0;

  if (onlyCash) {
    basicDeductionOnCash = Math.min(basicDeduction, cashIncome);
  } else if (onlyBond) {
    basicDeductionOnBond = Math.min(basicDeduction, bondIncome);
  } else {
    const cashIsLower = cashRate <= bondRate;
    if (cashIsLower) {
      basicDeductionOnCash = Math.min(basicDeduction, cashIncome);
      basicDeductionOnBond = Math.min(
        basicDeduction - basicDeductionOnCash,
        bondIncome,
      );
    } else {
      basicDeductionOnBond = Math.min(basicDeduction, bondIncome);
      basicDeductionOnCash = Math.min(
        basicDeduction - basicDeductionOnBond,
        cashIncome,
      );
    }
  }

  // ── ③ 자산별 감면금액 (원 미만 절사) ──
  const cashTaxable = Math.max(0, cashIncome - basicDeductionOnCash);
  const bondTaxable = Math.max(0, bondIncome - basicDeductionOnBond);
  const cashReduction = applyRate(cashTaxable, cashRate);
  const bondReduction = applyRate(bondTaxable, bondRate);
  const reducibleIncome = cashReduction + bondReduction;

  // ── ④ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준 ──
  //   감면대상 파트의 호가 따로 있으면 그 호의 산출세액·과세표준(호별 산정 — Q-F2c).
  const basis = partWise?.clauseBasis;
  const rawReductionAmount = safeMultiplyThenDivide(
    basis?.calculatedTax ?? input.calculatedTax,
    reducibleIncome,
    basis?.taxBase ?? input.taxBase,
  );

  // ── ⑤ 연간 한도(조특법 §133② — 양도연도별) capping ──
  const cappedByAnnualLimit = rawReductionAmount > annualLimit;
  const reductionAmount = Math.min(
    rawReductionAmount,
    annualLimit,
    input.calculatedTax,
  );

  const weightedRate =
    input.calculatedTax > 0 ? reductionAmount / input.calculatedTax : 0;

  if (cappedByAnnualLimit) {
    warnings.push(
      `감면세액이 연간 한도 ${annualLimit.toLocaleString()}원을 초과하여 한도로 capping되었습니다 (조특법 §133②)`,
    );
  }
  if (useLegacyRates) {
    warnings.push(
      `사업인정고시일(${input.businessApprovalDate.toISOString().slice(0, 10)})이 2015-12-31 이전이고 양도일(${input.transferDate.toISOString().slice(0, 10)})이 2017-12-31 이전이므로 종전 감면율 적용 (조특법 법률 제13560호 부칙 제53조)`,
    );
  }
  if (input.bondHoldingYears && input.bondCompensation <= 0) {
    warnings.push("채권 만기특약이 선택됐으나 채권보상액이 0입니다");
  }

  return {
    isEligible: true,
    reductionAmount,
    rawReductionAmount,
    weightedRate,
    breakdown: {
      cashRate,
      bondRate,
      cashAmount: input.cashCompensation,
      bondAmount: input.bondCompensation,
      cashIncome,
      bondIncome,
      basicDeductionOnCash,
      basicDeductionOnBond,
      cashReduction,
      bondReduction,
      reducibleIncome,
    },
    useLegacyRates,
    rateSetApplied,
    cappedByAnnualLimit,
    appliedAnnualLimit: annualLimit,
    legalBasis: useLegacyRates
      ? `${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION} + ${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL}`
      : TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
    warnings,
    ...(partWise ? { partWise } : {}),
  };
}

/**
 * 5B — 토지·건물을 따로 취득한 자산의 §77 파트 입력. 둘 다 본인 소유인 별개취득 자산만 만든다(그 밖은 종전 자산 단위 판정).
 * 파트 양도소득금액 = 고가주택 안분 후 과세 양도차익(`taxableGainAfterProration`, 없으면 `gain`) − 그 파트의 장기보유특별공제.
 * 취득일은 자산 단위 판정과 같은 축이다(건물 = 자산 취득일, 토지 = 토지 취득일) — 상속받은 파트는 §77⑨로 피상속인 취득일.
 * 토지 파트의 원인은 `landAcquisitionCause`가 있으면 그것, 없으면 자산 원인이다(`resolveLandRateBasis`와 같은 선택).
 */
export function buildPublicExpropriationParts(
  input: Pick<
    TransferTaxInput,
    | "isSeparateAcquisition" | "landAcquisitionDate" | "acquisitionDate" | "selfOwns"
    | "acquisitionCause" | "decedentAcquisitionDate" | "landAcquisitionCause" | "landDecedentAcquisitionDate"
  >,
  splitDetail: SplitGainResult | undefined,
  /** 단건 STEP 7의 파트별 세율 판정 — 있으면 각 파트가 속한 호의 산출세액·과세표준을 싣는다(Q-F2c). */
  partTax?: SplitPartRateResult,
): PublicExpropriationParts | undefined {
  if (input.isSeparateAcquisition !== true || !input.landAcquisitionDate || !splitDetail) return undefined;
  if ((input.selfOwns ?? "both") !== "both") return undefined;
  const income = (p: SplitGainResult["land"]) => (p.taxableGainAfterProration ?? p.gain) - p.longTermDeduction;
  const useLandCause = input.landAcquisitionCause !== undefined;
  const landDate = inheritedAcquisitionDate(
    useLandCause ? input.landAcquisitionCause : input.acquisitionCause,
    input.landAcquisitionDate,
    useLandCause ? input.landDecedentAcquisitionDate : input.decedentAcquisitionDate,
  )!;
  const landBasis = partClauseBasisOf(partTax, ["land", "non_business_land"]);
  const buildingBasis = partClauseBasisOf(partTax, ["building"]);
  return {
    land: { acquisitionDate: landDate, income: income(splitDetail.land), ...(landBasis ? { clauseBasis: landBasis } : {}) },
    building: {
      acquisitionDate: expropriationAcquisitionDate(input)!,
      income: income(splitDetail.building),
      ...(buildingBasis ? { clauseBasis: buildingBasis } : {}),
    },
  };
}

/**
 * 파트 종류(`kinds`)가 속한 §104⑤2호 호 버킷의 산출세액·과세표준 합.
 *
 * 자산 세액이 파트별 세율 합계(§104⑤2호)이고 파트가 둘 이상의 호에 걸칠 때만 낸다 — 합산 누진(1호)이 이기거나
 * 모든 파트가 한 호면 호별 = 자산 전체라 산정할 것이 없다(다건의 「전체 누진 채택 시 합산 유지」 F-9 Q-2와 같다). 파트가 둘 이상의 호에 걸치면
 * (주택 토지 + 배율 초과분) 귀속할 수 없어 내지 않는다. 키는 `evaluateSplitPartTax`의 묶음과 같은
 * `clauseBucketKey(…, 파트 순번, …)`다 — 파트 배열은 그 묶음의 순서 그대로다.
 */
function partClauseBasisOf(
  partTax: SplitPartRateResult | undefined,
  kinds: readonly SplitRatePart["kind"][],
): PartClauseBasis | undefined {
  if (!partTax || partTax.chosen !== "per_asset") return undefined;
  const keys = partTax.parts.map((p, i) => clauseBucketKey(p.candidateClauses, p.appliedRate, i, p.bucketFlatRate));
  // 모든 파트가 한 호면 그 호 = 자산 전체라 종전 산식과 같다 — 싣지 않는다(카드의 「호별 산정」 안내가 틀려진다).
  if (new Set(keys).size <= 1) return undefined;
  const own = new Set(keys.filter((_, i) => kinds.includes(partTax.parts[i].kind)));
  if (own.size !== 1) return undefined;
  const [key] = own;
  return partTax.parts.reduce<PartClauseBasis>(
    (acc, p, i) =>
      keys[i] === key ? { calculatedTax: acc.calculatedTax + p.calculatedTax, taxBase: acc.taxBase + p.taxBase } : acc,
    { calculatedTax: 0, taxBase: 0 },
  );
}

/**
 * 「조세특례제한법」 제77조 제9항·제77조의3 제3항 — 상속받은 토지등은 피상속인이 그 토지등을 취득한 날을 취득일로 본다.
 * 상속이 아니거나 피상속인 취득일이 없으면 `own` 그대로다(상속이면 피상속인 취득일은 입력 필수 — 화면 검증이 막는다).
 * §77⑨의 다른 한 축(「소득세법」 제97조의2 제1항이 적용되는 증여 = 증여자 취득일)은 여기서 다루지 않는다 —
 * 이월과세 시나리오 A가 취득일 자체를 증여자 취득일로 바꿔 다시 계산하고(`transfer-tax-carryover.ts`),
 * 같은 조 제2항으로 배제되면 제1항이 적용되지 않으므로 의제도 없다.
 * §77의2(대토보상)에는 같은 의제 규정이 없어 쓰지 않는다(조특령 §73에도 없음).
 */
function inheritedAcquisitionDate(
  cause: TransferTaxInput["acquisitionCause"],
  own: Date | undefined,
  decedent: Date | undefined,
): Date | undefined {
  return cause === "inheritance" && decedent ? decedent : own;
}

/** 자산 단위 §77①·§77의3 취득일 — `calcReductions`의 `expropriationAcquisitionDate` 인자. */
export function expropriationAcquisitionDate(
  input: Pick<TransferTaxInput, "acquisitionCause" | "acquisitionDate" | "decedentAcquisitionDate">,
): Date | undefined {
  return inheritedAcquisitionDate(input.acquisitionCause, input.acquisitionDate, input.decedentAcquisitionDate);
}

/** 5B 고지 — 파트별 판정으로 감면대상을 한 파트로 한정했을 때. 결과 조립(`transfer-tax-normal-return.ts`)이 경고에 싣는다. */
export function publicExpropriationPartWiseNotice(
  detail: Pick<PublicExpropriationReductionResult, "isEligible" | "partWise"> | undefined,
): string | null {
  const pw = detail?.isEligible ? detail.partWise : undefined;
  if (!pw) return null;
  const [ok, ng] = pw.eligiblePart === "land" ? ["토지", "건물"] : ["건물", "토지"];
  return (
    `토지와 건물의 취득일이 달라 「조세특례제한법」 제77조 제1항의 「사업인정고시일부터 소급하여 2년 이전에 취득한 토지등」 요건을 ` +
    `파트별로 판정했습니다 — ${ok}분만 요건을 충족해 ${ok}분 양도소득금액만 감면대상으로 하고, ${ng}분은 감면하지 않았습니다` +
    `(기본공제는 「소득세법」 제103조 제2항에 따라 감면이 없는 ${ng}분에서 먼저 공제). ` +
    "토지·건물을 따로 취득한 자산에 이 요건을 파트별로 적용한 정면 해석례는 확인하지 못했습니다 — 확인 필요"
  );
}
