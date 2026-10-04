/**
 * 양도세 ⑫ — **엔진이 필요로 하는데 Zod가 비워 두게 두던 값**을 ⑧과 같은 조건으로 요구한다
 * (2026-09-30 Zod↔엔진 필수 점검 · 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md`).
 *
 * 여기 있는 항목은 모두 비워 보내면 400이 아니라 **200 + 다른 세액**이었다(엔진·라우터가 빈 값을 0·기본값·
 * 다른 분기로 조용히 채운다). 조건은 각 항목에 적은 ⑧ 위치의 거울이다 — 어긋나면 「⑧ 통과 ↔ ⑫ 400」
 * 모순이 된다(14지점 ⑧·⑩).
 */
import { z } from "zod";
import { successorAptMaxResidenceMonths } from "@/lib/tax-engine/redevelopment-lthd";
import { toDate } from "./date-coerce";
import { refineCarryoverTaxation } from "./transfer-tax-schema-companion-refines";
import { refineMixedUsePresence } from "./transfer-tax-schema-mixed-use";
import { refineGbPropertyRequired } from "./transfer-tax-schema-required-refines-gb";
import { refineHouseholdRequiredInputs, type HouseholdRefineInput } from "./transfer-tax-schema-household-refines";
import { refineRequiredInputs2a, type Required2aLike } from "./transfer-tax-schema-required-refines-2a";
import { twoHouseExclusionStatusConflict } from "@/lib/calc/two-house-exclusion-status";
import { twoHouseExclusionStatusIssue } from "@/lib/calc/two-house-exclusion-status";

type Issue = (path: (string | number)[], message: string) => void;
const issuer = (ctx: z.RefinementCtx): Issue => (path, message) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
const positive = (v: number | undefined) => typeof v === "number" && v > 0;

type HouseRow = {
  isUnavoidableReason?: boolean;
  unavoidableResidenceYears?: number;
  unavoidableReasonResolvedDate?: string;
  unavoidableReasonUnresolved?: boolean;
  isLitigationHousing?: boolean;
  litigationAcquisitionDate?: string;
  litigationPending?: boolean;
  acquisitionOfficialPrice?: number;
  isEmployeeHousing?: boolean;
  freeProvisionYears?: number;
  isDayCareCenter?: boolean;
  dayCareOperationYears?: number;
  isTaxIncentiveRental?: boolean;
  rentalPeriodYears?: number;
};

/**
 * 보유 주택 명부 — 중과 배제 특례의 기간·기준시가 (⑧ `transfer-tax-validate.ts` 명부·양도 주택 배제 검증).
 * 비우면 엔진이 0으로 읽어(`multi-house-surcharge-exclusion.ts`) 배제가 조용히 빠지고 중과된다.
 */
export function refineHouseExclusionInputs(
  houses: ReadonlyArray<HouseRow> | undefined,
  ctx: z.RefinementCtx,
) {
  const issue = issuer(ctx);
  (houses ?? []).forEach((h, i) => {
    if (h.isUnavoidableReason) {
      if (!positive(h.unavoidableResidenceYears))
        issue(["houses", i, "unavoidableResidenceYears"], "부득이한 사유 주택은 거주기간(년)이 필요합니다 (소득세법 시행령 §167의10①3호)");
      if (!positive(h.acquisitionOfficialPrice))
        issue(["houses", i, "acquisitionOfficialPrice"], "부득이한 사유 주택은 취득 당시 기준시가가 필요합니다 (소득세법 시행령 §167의10①3호)");
    }
    // §167의10①3호·7호 — 기산일(해소일·확정판결일)과 「양도일 현재 미해소·진행 중」은 택일이다. ⑧
    // `twoHouseExclusionStatusIssue`의 거울 + 택일 모순(빈 값 = 「모름」이 엔진에서 불성립으로 조용히 바뀌지 않게 막는다).
    const statusIssue = twoHouseExclusionStatusIssue(h) ?? twoHouseExclusionStatusConflict(h);
    if (statusIssue) issue(["houses", i, statusIssue.field], statusIssue.message);
    if (h.isEmployeeHousing && !positive(h.freeProvisionYears))
      issue(["houses", i, "freeProvisionYears"], "사원용 주택은 무상 제공 기간(년)이 필요합니다");
    if (h.isDayCareCenter && !positive(h.dayCareOperationYears))
      issue(["houses", i, "dayCareOperationYears"], "어린이집은 운영 기간(년)이 필요합니다");
    // 3호 「5년 이상 임대」 — 비우면 `calcRentalPeriodYears`가 0년으로 읽어 3호가 조용히 빠진다.
    // ⑧ `taxIncentiveRentalPeriodMissing`의 거울: 양도 주택은 ④가 유효 사실(2호 선언 시 2호 칸)을 이 칸에 싣는다.
    if (h.isTaxIncentiveRental === true && !positive(h.rentalPeriodYears))
      issue(["houses", i, "rentalPeriodYears"], "조특법 감면 임대주택(소득세법 시행령 §167의3①3호)은 임대기간(년)이 필요합니다");
  });
}

type BurdenedGiftLike = {
  valuationMode: string;
  marketValueAtTransfer?: number;
  acquisitionMethod?: string;
  actualAcquisitionTotal?: number;
  actualLandAcquisitionPrice?: number;
  actualBuildingAcquisitionPrice?: number;
  donorRelation?: string;
};

/**
 * 부담부증여 (⑧ `transfer-tax-validate-bg.ts`). 비우면:
 *   정보 없음 → 일반 양도로 계산 · 양도시 시가 → 양도가액 0 · 산정방식 → legacy 분기 · 실지취득가 → 0 ·
 *   관계 → 직계비속으로 증여세 계산.
 */
export function refineBurdenedGiftInputs(
  data: { transferType?: string; burdenedGiftInfo?: BurdenedGiftLike },
  ctx: z.RefinementCtx,
) {
  if (data.transferType !== "burdened_gift") return;
  const issue = issuer(ctx);
  const bg = data.burdenedGiftInfo;
  if (!bg) {
    issue(["burdenedGiftInfo"], "부담부증여(transferType=burdened_gift)는 burdenedGiftInfo가 필요합니다");
    return;
  }
  if (bg.valuationMode === "sangjeungbeop_market") {
    if (!positive(bg.marketValueAtTransfer))
      issue(["burdenedGiftInfo", "marketValueAtTransfer"], "부담부증여 시가 모드는 양도시 시가 평가액이 필요합니다");
    if (!bg.acquisitionMethod) {
      issue(["burdenedGiftInfo", "acquisitionMethod"], "부담부증여 시가 모드는 취득가액 산정방식(actual·converted)이 필요합니다 (소득세법 §100①)");
    } else if (
      bg.acquisitionMethod === "actual" &&
      !positive(bg.actualAcquisitionTotal) &&
      !positive(bg.actualLandAcquisitionPrice) &&
      !positive(bg.actualBuildingAcquisitionPrice)
    ) {
      issue(["burdenedGiftInfo", "actualAcquisitionTotal"], "부담부증여 실지취득가액 안분은 실지취득가액이 필요합니다");
    }
  }
  if (!bg.donorRelation)
    issue(["burdenedGiftInfo", "donorRelation"], "부담부증여는 증여자-수증자 관계가 필요합니다 (상증법 §53)");
}

/** 주 자산 — 자체 서브객체로 취득가액을 잡는 자산(일반건물·재개발·겸용)은 ⑧도 이 분기를 타지 않는다. */
type PrimaryLike = {
  acquisitionCause?: string;
  transferType?: string;
  acquisitionDate: string;
  transferDate: string;
  useEstimatedAcquisition: boolean;
  acquisitionMethod?: string;
  standardPriceAtAcquisition?: number;
  standardPriceAtTransfer?: number;
  preHousingDisclosure?: unknown;
  generalBuildingValuation?: unknown;
  redevelopment?: {
    subject?: string;
    isSuccessorMember?: boolean;
    completionDate?: string;
    newHouseResidenceMonths?: number;
  } | null;
  isOneHousehold?: boolean;
  residencePeriodMonths?: number;
  mixedUse?: unknown;
  commercialBuildingValuation?: unknown;
  carryoverTaxation?: Parameters<typeof refineCarryoverTaxation>[0];
};

/**
 * 주 자산 취득원인·재개발 (⑧ `transfer-tax-validate-acquisition.ts`·`-gift-163-9.ts`·`-redev.ts`).
 */
export function refinePrimaryAcquisitionInputs(data: PrimaryLike, ctx: z.RefinementCtx) {
  const issue = issuer(ctx);
  const ownValuation =
    !!data.generalBuildingValuation || !!data.redevelopment || !!data.mixedUse || !!data.commercialBuildingValuation;

  // 이월과세(§97의2) — 컴패니언 arm과 같은 규칙. 비우면 일반 증여로 계산됐다.
  if (data.acquisitionCause === "carryover_gift" && !ownValuation) {
    const ct = data.carryoverTaxation;
    if (!ct) {
      issue(["carryoverTaxation"], "이월과세(증여) 자산은 증여 정보(carryoverTaxation)가 필요합니다 (소득세법 §97의2)");
    } else {
      refineCarryoverTaxation(ct, data.transferDate, ctx, ["carryoverTaxation"], false);
      // 환산 사용 — 엔진은 최상위 기준시가로 환산한다(`transfer-tax-carryover.ts`). 비우면 0으로 읽혔다.
      if (ct.useEstimatedAcquisition && !data.preHousingDisclosure) {
        if (!positive(data.standardPriceAtAcquisition))
          issue(["standardPriceAtAcquisition"], "이월과세 환산취득가액은 취득시 기준시가가 필요합니다");
        if (!positive(data.standardPriceAtTransfer))
          issue(["standardPriceAtTransfer"], "이월과세 환산취득가액은 양도시 기준시가가 필요합니다");
      }
    }
  }

  // §163⑨ — 증여 취득(1985.1.1. 이후) 자산은 증여일 평가액이 취득가액이다. 추계 모드를 받으면 계산이 됐다.
  if (
    data.acquisitionCause === "gift" &&
    data.transferType !== "burdened_gift" &&
    data.acquisitionDate >= "1985-01-01" &&
    !ownValuation &&
    (data.useEstimatedAcquisition || data.acquisitionMethod === "appraisal" || data.acquisitionMethod === "salesCase")
  ) {
    issue(
      ["useEstimatedAcquisition"],
      "증여 취득 자산은 환산취득가·감정가액·매매사례가액을 쓸 수 없습니다 — 증여일 평가액을 취득가액으로 보내세요 (소득세법 시행령 §163⑨)",
    );
  }

  // 승계조합원 — 준공일(사용검사필증 교부일)이 취득시기다(소령 §162①4호). 비우면 취득일로 읽었다.
  if (data.redevelopment?.isSuccessorMember === true && !data.redevelopment.completionDate) {
    issue(["redevelopment", "completionDate"], "승계조합원은 준공일(사용검사필증 교부일)이 필요합니다 (소득세법 시행령 §162①4호)");
  }

  // I-8 — 승계조합원 완공APT 거주 개월 수 ≤ 준공일~양도일 개월 수(⑧ `successorAptResidenceOverflow` 같은 leaf).
  //   엔진이 읽는 값(`resolveAptResidenceMonths` 승계 분기)만 본다: 신축 거주 칸이 있으면 그것, 없으면 Step4 값 —
  //   Step4 값은 ⑤가 1세대일 때만 입력받으므로 그때만 본다.
  const rd = data.redevelopment;
  if (rd && rd.subject === "apt" && rd.isSuccessorMember === true && rd.completionDate) {
    const max = successorAptMaxResidenceMonths(toDate(rd.completionDate, "completionDate"), toDate(data.transferDate, "transferDate"));
    if (rd.newHouseResidenceMonths !== undefined) {
      if (rd.newHouseResidenceMonths > max)
        issue(["redevelopment", "newHouseResidenceMonths"], successorResidenceZodMessage(rd.newHouseResidenceMonths, max));
    } else if (data.isOneHousehold === true && (data.residencePeriodMonths ?? 0) > max) {
      issue(["residencePeriodMonths"], successorResidenceZodMessage(data.residencePeriodMonths ?? 0, max));
    }
  }
}

function successorResidenceZodMessage(months: number, max: number): string {
  return (
    `승계조합원 신축주택 거주기간 ${months}개월이 준공일부터 양도일까지의 ${max}개월을 넘습니다 — ` +
    `준공 전 거주는 보유기간 중 거주기간이 아닙니다 (소득세법 시행령 §162①4호 · 서면-2019-부동산-4508)`
  );
}

/** 단건·다건 자산 공용 진입점 — `propertySchema`·`propertyItemSchema` superRefine에서 부른다. */
export function refinePropertyRequiredInputs(
  data: PrimaryLike &
    HouseholdRefineInput & { houses?: ReadonlyArray<HouseRow>; burdenedGiftInfo?: BurdenedGiftLike; propertyType?: string } &
    Required2aLike,
  ctx: z.RefinementCtx,
) {
  refineHouseExclusionInputs(data.houses, ctx);
  refineBurdenedGiftInputs(data, ctx);
  refinePrimaryAcquisitionInputs(data, ctx);
  refineMixedUsePresence(data, ctx); // MU-7 (2차 점검)
  refineHouseholdRequiredInputs(data, ctx); // O3·O4·H-3·유예 나목·M2 (2차 점검)
  refineGbPropertyRequired(data, ctx); // 일반건물 I1·I3·X1·Z4·Z5·C1~C4 (2차 점검)
  refineRequiredInputs2a(data, ctx); // §164⑨ EX · 분리취득 SP · 의제 전 상속 PD (2차 점검)
}

type AmendmentLike = {
  applyUnderReportingPenalty: boolean;
  underReductionMode: string;
  applyLatePaymentPenalty: boolean;
  statutoryFilingDeadline?: string;
  amendedFilingDate?: string;
  amendedPaymentDate?: string;
  correctionKind?: string;
  claimReasonType?: string;
  posteriorEventDate?: string;
};

/**
 * 수정신고·경정청구 (⑧ `transfer-tax-validate.ts` step 3). 비우면 §48② 감면율 0·납부지연가산세 0·
 * 납부일 = 오늘·청구기한 판정 생략이 됐다.
 */
export function refineAmendmentInputs(amendment: AmendmentLike | undefined, ctx: z.RefinementCtx) {
  if (!amendment) return;
  const issue = issuer(ctx);
  const a = amendment;
  if (a.correctionKind === "refund_claim" && a.claimReasonType === "posterior" && !a.posteriorEventDate)
    issue(["amendment", "posteriorEventDate"], "후발적 사유 경정청구는 사유를 안 날이 필요합니다 (국세기본법 §45의2②)");
  const autoReduction = a.applyUnderReportingPenalty && a.underReductionMode === "auto_48_2";
  if ((autoReduction || a.applyLatePaymentPenalty) && !a.statutoryFilingDeadline)
    issue(["amendment", "statutoryFilingDeadline"], "§48② 자동감면·납부지연가산세 산정에는 법정신고기한이 필요합니다");
  if (autoReduction && !a.amendedFilingDate)
    issue(["amendment", "amendedFilingDate"], "§48② 자동감면 산정에는 수정신고일이 필요합니다");
  if (a.applyLatePaymentPenalty && !a.amendedPaymentDate)
    issue(["amendment", "amendedPaymentDate"], "납부지연가산세 산정에는 수정신고 납부(예정)일이 필요합니다");
}
