/**
 * 양도세 ⑫ — **엔진이 필요로 하는데 Zod가 비워 두게 두던 값**을 ⑧과 같은 조건으로 요구한다
 * (2026-09-30 Zod↔엔진 필수 점검 · 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md`).
 *
 * 여기 있는 항목은 모두 비워 보내면 400이 아니라 **200 + 다른 세액**이었다(엔진·라우터가 빈 값을 0·기본값·
 * 다른 분기로 조용히 채운다). 조건은 각 항목에 적은 ⑧ 위치의 거울이다 — 어긋나면 「⑧ 통과 ↔ ⑫ 400」
 * 모순이 된다(14지점 ⑧·⑩).
 */
import { householdBuildingResidenceOverflow, redevCompletionDateRequiredForHolding } from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import { z } from "zod";
import { computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { successorAptMaxResidenceMonths } from "@/lib/tax-engine/redevelopment-lthd";
import { toDate } from "./date-coerce";
import { refineBgDonorBuilt } from "./transfer-tax-schema-donor-built";
import { refineCarryoverTaxation } from "./transfer-tax-schema-companion-refines";
import { refineMixedUsePresence } from "./transfer-tax-schema-mixed-use";
import { refineGbPropertyRequired } from "./transfer-tax-schema-required-refines-gb";
import { refineHouseholdRequiredInputs, type HouseholdRefineInput } from "./transfer-tax-schema-household-refines";
import { refineRequiredInputs2a, type Required2aLike } from "./transfer-tax-schema-required-refines-2a";
import { twoHouseExclusionStatusConflict } from "@/lib/calc/two-house-exclusion-status";
import { twoHouseExclusionStatusIssue } from "@/lib/calc/two-house-exclusion-status";
import { dayCareUsageStatusConflict } from "@/lib/calc/daycare-usage-status";
import { dayCareUsageStatusIssue } from "@/lib/calc/daycare-usage-status";
import { duplicateUnavoidableOutsideCapitalRows } from "@/lib/calc/house-row-required-issues";
import { duplicateUnavoidableOutsideCapitalMessage } from "@/lib/calc/house-row-required-issues";

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
  dayCareEndDate?: string;
  dayCareInUse?: boolean;
  isTaxIncentiveRental?: boolean;
  rentalPeriodYears?: number;
  isUnavoidableOutsideCapital?: boolean;
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
    // §167의3①8호의2 「사용하지 않게 된 날부터 6개월」 — 사용 종료일과 「사용 중」은 택일(⑧ `dayCareUsageStatusIssue`의 거울 + 모순).
    const dayCareIssue = dayCareUsageStatusIssue(h) ?? dayCareUsageStatusConflict(h);
    if (dayCareIssue) issue(["houses", i, dayCareIssue.field], dayCareIssue.message);
    // 3호 「5년 이상 임대」 — 비우면 `calcRentalPeriodYears`가 0년으로 읽어 3호가 조용히 빠진다.
    // ⑧ `taxIncentiveRentalPeriodMissing`의 거울: 양도 주택은 ④가 유효 사실(2호 선언 시 2호 칸)을 이 칸에 싣는다.
    if (h.isTaxIncentiveRental === true && !positive(h.rentalPeriodYears))
      issue(["houses", i, "rentalPeriodYears"], "조특법 감면 임대주택(소득세법 시행령 §167의3①3호)은 임대기간(년)이 필요합니다");
  });
  // §155⑧ 「각각 1개씩」 — ⑧ 표시 행은 한 채(⑧ `duplicateUnavoidableOutsideCapitalRows`의 거울). 둘째 행이 있으면 세대 판정과
  //   중과 4호가 서로 다른 행을 볼 수 있었다. ⑧은 양도일 현재 보유 행만 세는데(`duplicateOwnedUnavoidableOutsideCapitalRows`)
  //   ④가 그 행만 실으므로(`housesOwnedAtTransfer`) 여기서는 받은 명부를 그대로 센다 — 엔진 4호의 「첫 ⑧ 행」도 같은 명부에서 찾는다.
  for (const d of duplicateUnavoidableOutsideCapitalRows((houses ?? []).map((h) => h.isUnavoidableOutsideCapital))) {
    issue(["houses", d.index, "isUnavoidableOutsideCapital"], duplicateUnavoidableOutsideCapitalMessage(`houses[${d.firstIndex}]`));
  }
}

type BurdenedGiftLike = {
  valuationMode: string;
  marketValueAtTransfer?: number;
  lendingDepositTotal?: number;
  mortgageDebtAmount?: number;
  mortgageSetAmount?: number;
  /** 조합원입주권 평가 3항 — 있으면 §159①1호 괄호가 발동하지 않는다(엔진 `resolveBgAcquisitionBasis`). */
  rightValuation?: unknown;
  acquisitionMethod?: string;
  actualAcquisitionTotal?: number;
  actualLandAcquisitionPrice?: number;
  actualBuildingAcquisitionPrice?: number;
  presumedAcquisitionTotal?: number;
  presumedLandAcquisitionPrice?: number;
  presumedBuildingAcquisitionPrice?: number;
  /** 이월과세 — 당초 증여자 값 한 벌. K-6/K-7이면 `presumed*`가 여기로 온다(양도인 쪽은 `actual*`). */
  carryoverDonorBasis?: {
    presumedAcquisitionTotal?: number;
    presumedLandAcquisitionPrice?: number;
    presumedBuildingAcquisitionPrice?: number;
  };
  donorRelation?: string;
};

/**
 * 시가 모드 · 담보 승(「상속세 및 증여세법」 제66조) — 엔진이 산정방식과 무관하게 취득가액을 취득시 기준시가 × 채무비율로 강제하고
 * (「소득세법 시행령」 제159조 제1항 제1호 괄호 · `resolveBgAcquisitionBasis`) 실지취득가액·매매사례가액·감정가액을 읽지 않는다.
 * 엔진과 같은 함수로 판정하되 **지분 축소 전** 시가로 본다 — 축소는 시가만 줄이므로 여기서 담보가 이기면 엔진에서도 이긴다
 * (요구를 잘못 빼는 방향으로는 틀리지 않는다). 조합원입주권(괄호 미발동)·이월과세(당초 증여자 값)는 제외 — ⑧이 담보 승을 막는다.
 * 계획서 `docs/00-pm/burdened-gift-residuals-o3-o5-o8.plan.md` O-5.
 */
function collateralForcesStdAcquisition(bg: BurdenedGiftLike): boolean {
  if (bg.valuationMode !== "sangjeungbeop_market" || bg.rightValuation !== undefined || bg.carryoverDonorBasis !== undefined) return false;
  return (
    computeSangjeungbeopValuation(0, 0, {
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: bg.marketValueAtTransfer ?? 0,
      lendingDepositTotal: bg.lendingDepositTotal ?? 0,
      mortgageDebtAmount: bg.mortgageDebtAmount ?? 0,
      mortgageSetAmount: bg.mortgageSetAmount,
      annualRentTotal: 0,
    } as BurdenedGiftInfo).selectedMode === "mortgage"
  );
}

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
      issue(["burdenedGiftInfo", "acquisitionMethod"], "부담부증여 시가 모드는 취득가액 산정방식(actual·salesCase·appraisal·converted)이 필요합니다 (소득세법 §100①)");
    } else if (collateralForcesStdAcquisition(bg)) {
      // 담보 승 — 엔진이 방식별 금액을 읽지 않는다(아래 함수 주석). ⑤가 그 칸을 숨기고 ⑧도 요구하지 않는다(O-5).
    } else if (
      bg.acquisitionMethod === "actual" &&
      !positive(bg.actualAcquisitionTotal) &&
      !positive(bg.actualLandAcquisitionPrice) &&
      !positive(bg.actualBuildingAcquisitionPrice)
    ) {
      issue(["burdenedGiftInfo", "actualAcquisitionTotal"], "부담부증여 실지취득가액 안분은 실지취득가액이 필요합니다");
    }
    if ((bg.acquisitionMethod === "appraisal" || bg.acquisitionMethod === "salesCase") && !collateralForcesStdAcquisition(bg)) {
      const label = bg.acquisitionMethod === "appraisal" ? "감정가액" : "매매사례가액";
      const donor = bg.carryoverDonorBasis;
      if (donor) {
        // 이월과세 × K-6/K-7 — 방식은 당초 증여자 쪽이고 그 금액은 `carryoverDonorBasis`에 온다(소법 §97의2①1호).
        // 양도인 쪽(시나리오 B)은 증여일 평가액 = `actual*`(소령 §163⑨) — 둘 다 요구한다(어느 쪽도 다른 쪽으로 대신하지 않는다).
        if (!positive(donor.presumedAcquisitionTotal) && !positive(donor.presumedLandAcquisitionPrice) && !positive(donor.presumedBuildingAcquisitionPrice))
          issue(["burdenedGiftInfo", "carryoverDonorBasis", "presumedAcquisitionTotal"], `이월과세 부담부증여 ${label} 방식은 당초 증여자의 취득 당시 ${label}이 필요합니다 (소득세법 §97의2①1호)`);
        if (!positive(bg.actualAcquisitionTotal) && !positive(bg.actualLandAcquisitionPrice) && !positive(bg.actualBuildingAcquisitionPrice))
          issue(["burdenedGiftInfo", "actualAcquisitionTotal"], "이월과세 부담부증여는 양도인이 증여받은 때의 상증법 평가액이 필요합니다 (소득세법 시행령 §163⑨ — 시나리오 B)");
      } else if (
        !positive(bg.presumedAcquisitionTotal) &&
        !positive(bg.presumedLandAcquisitionPrice) &&
        !positive(bg.presumedBuildingAcquisitionPrice)
      ) {
        issue(
          ["burdenedGiftInfo", "presumedAcquisitionTotal"],
          `부담부증여 ${label} 방식은 취득 당시 금액이 필요합니다 (소득세법 §97①1호나목)`,
        );
      }
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
    successorGiftSameHousehold?: boolean;
    completionDate?: string;
    approvalDate?: string;
    householdBuilding?: { acquisitionDate: string; residenceMonths?: number };
    newHouseResidenceMonths?: number;
    originalAssetType?: string;
    receiveOnlyMode?: boolean;
  } | null;
  isOneHousehold?: boolean;
  residencePeriodMonths?: number;
  mixedUse?: unknown;
  commercialBuildingValuation?: unknown;
  carryoverTaxation?: Parameters<typeof refineCarryoverTaxation>[0];
  // 주택 split 파트 이월과세 — 있으면 B·C 호스트(`acquisitionCause: carryover_gift`)가 자산 단위 `carryoverTaxation` 없이 통과한다
  landCarryoverPart?: unknown;
  buildingCarryoverPart?: unknown;
};

/**
 * 주 자산 취득원인·재개발 (⑧ `transfer-tax-validate-acquisition.ts`·`-gift-163-9.ts`·`-redev.ts`).
 */
export function refinePrimaryAcquisitionInputs(data: PrimaryLike, ctx: z.RefinementCtx) {
  const issue = issuer(ctx);
  const ownValuation =
    !!data.generalBuildingValuation || !!data.redevelopment || !!data.mixedUse || !!data.commercialBuildingValuation;

  // 이월과세(§97의2) — 컴패니언 arm과 같은 규칙. 비우면 일반 증여로 계산됐다.
  // 파트 이월과세(B·C 호스트)는 자산 단위 `carryoverTaxation` 대신 파트 서브객체를 받는다 — 둘의 상호배제와 서브객체 필수는 leaf(S1·S3)가 본다.
  // (이 면제가 없으면 B·C가 「carryoverTaxation이 필요합니다」로 400이다.)
  const hasSplitPartCarryover = !!(data.landCarryoverPart || data.buildingCarryoverPart);
  if (data.acquisitionCause === "carryover_gift" && !ownValuation && !hasSplitPartCarryover) {
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

  // 증여 승계의 「증여자와 계속 같은 세대」 선언(사전-2020-법령해석재산-0691) — 승계조합원이 증여로 취득한 경우에만 의미가 있다.
  //   ④(`buildRedevelopmentPayload`)는 그 밖에는 보내지 않는다. 다른 취득원인(매매·상속)에 실어 오면 통산이 조용히 적용되지 않으므로 막는다.
  if (
    data.redevelopment?.successorGiftSameHousehold !== undefined &&
    !(data.redevelopment.isSuccessorMember === true && data.acquisitionCause === "gift")
  ) {
    issue(
      ["redevelopment", "successorGiftSameHousehold"],
      "「증여자와 계속 같은 세대」 선언은 증여로 승계취득한 승계조합원 입주권에만 보낼 수 있습니다 (사전-2020-법령해석재산-0691)",
    );
  }

  // G3-4 — 토지만 출자한 원조합원의 완공APT: §154① 비과세 보유기간은 사용승인서 교부일부터 센다(영 §162①4호 ·
  //   서면-2022-부동산-1616). 비우면 엔진이 토지 취득일 기산으로 판정해 준공 후 2년 안 양도도 전액 비과세가 났다.
  //   ⑧ `validateRedevelopmentAsset`의 `landContributedOriginalApt`와 같은 조건(승계 아님 · 토지 출자 · 단독신고 아님).
  //   그 값은 1세대1주택 판정에만 쓰이므로 1세대일 때만 필수다 — ⑧·엔진과 같은 술어(`redevCompletionDateRequiredForHolding`).
  if (
    redevCompletionDateRequiredForHolding({
      isOneHousehold: data.isOneHousehold,
      subject: data.redevelopment?.subject,
      isSuccessorMember: data.redevelopment?.isSuccessorMember,
      originalAssetType: data.redevelopment?.originalAssetType,
      receiveOnlyMode: data.redevelopment?.receiveOnlyMode,
    }) &&
    !data.redevelopment?.completionDate
  ) {
    issue(
      ["redevelopment", "completionDate"],
      "토지만 출자한 완공APT는 준공일(사용승인서 교부일)이 필요합니다 — 1세대1주택 비과세 보유기간 기산일이자 「취득 당시」 조정대상지역 판정일입니다 (소득세법 시행령 §162①4호 · 서면-2022-부동산-1616)",
    );
  }

  // I-8 — 승계조합원 완공APT 거주 개월 수 ≤ 준공일~양도일 개월 수(⑧ `successorAptResidenceOverflow` 같은 leaf).
  //   엔진이 읽는 값(`resolveAptResidenceMonths` 승계 분기)만 본다: 신축 거주 칸이 있으면 그것, 없으면 Step4 값 —
  //   Step4 값은 ⑤가 1세대일 때만 입력받으므로 그때만 본다.
  const rd = data.redevelopment;
  // #12 — 승계조합원과 같은 축: 토지만 출자한 원조합원도 보유기간이 사용승인일부터라 준공 전 거주는 세지 않는다(⑧ 같은 leaf).
  const landContributedApt =
    rd?.subject === "apt" && rd.isSuccessorMember !== true && rd.originalAssetType === "land" && rd.receiveOnlyMode !== true;
  // #12 — 세대원 건물 출자 통산(⑧ `validateRedevelopmentAsset` 미러): 건물 취득일 ≤ 인가일, 거주 개월 ≤ 취득일~인가일 개월 수.
  //   토지 출자 원조합원 완공APT가 아니면 엔진이 읽지 않으므로 검사하지 않는다.
  if (rd?.householdBuilding && landContributedApt && rd.approvalDate) {
    const acq = toDate(rd.householdBuilding.acquisitionDate, "householdBuilding.acquisitionDate");
    const approval = toDate(rd.approvalDate, "approvalDate");
    if (acq > approval) {
      issue(["redevelopment", "householdBuilding", "acquisitionDate"], "세대원 건물 취득일은 관리처분계획 인가일 이전이어야 합니다");
    } else if (rd.householdBuilding.residenceMonths !== undefined) {
      const max = householdBuildingResidenceOverflow(acq, approval, rd.householdBuilding.residenceMonths);
      if (max !== null) {
        issue(["redevelopment", "householdBuilding", "residenceMonths"], `세대원 건물 거주 ${rd.householdBuilding.residenceMonths}개월이 건물 취득일부터 인가일까지의 ${max}개월을 넘습니다`);
      }
    }
  }
  if (rd && rd.subject === "apt" && (rd.isSuccessorMember === true || landContributedApt) && rd.completionDate) {
    const max = successorAptMaxResidenceMonths(toDate(rd.completionDate, "completionDate"), toDate(data.transferDate, "transferDate"));
    if (rd.newHouseResidenceMonths !== undefined) {
      if (rd.newHouseResidenceMonths > max)
        issue(["redevelopment", "newHouseResidenceMonths"], successorResidenceZodMessage(rd.newHouseResidenceMonths, max, landContributedApt ? "토지 출자 신축주택" : undefined));
    } else if (data.isOneHousehold === true && (data.residencePeriodMonths ?? 0) > max) {
      issue(["residencePeriodMonths"], successorResidenceZodMessage(data.residencePeriodMonths ?? 0, max, landContributedApt ? "토지 출자 신축주택" : undefined));
    }
  }
}

function successorResidenceZodMessage(months: number, max: number, subjectLabel = "승계조합원 신축주택"): string {
  return (
    `${subjectLabel} 거주기간 ${months}개월이 준공일부터 양도일까지의 ${max}개월을 넘습니다 — ` +
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
  refineBgDonorBuilt(data as Parameters<typeof refineBgDonorBuilt>[0], ctx); // 부담부증여 × 증여자 신축·증축 (PR-4)
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
