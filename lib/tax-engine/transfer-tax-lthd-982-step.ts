/**
 * STEP 4.05 — §98의2 특칙 장특 재할당 + STEP 4 장특 step 생성 + OH-31 표2 연혁 미지원 고지.
 *
 * `transfer-tax.ts` 800줄 정책 분리 — 순서(특칙 재할당 → step push → 고지)와 로직은 그대로 옮겼다.
 * `calcLongTermHoldingDeduction`의 결과(공제액·율)를 받아 §98의2 특칙으로 덮어쓸 수 있는 값을 돌려준다.
 */
import { applyRate } from "./tax-utils";
import { resolveExemptionRequirementResidenceMonths } from "./one-house/residence-months";
import { meetsTable2ResidenceRequirement } from "./transfer-tax-exemption";
import { isLthdTable2SubjectAsset, resolveLthdTable2OneHouseAxis } from "./lthd-table2-subject";
import { LTHD_TABLE2_UNSUPPORTED_NOTICE, resolveLthdTable2Era, table2HoldingRateAt } from "./data/lthd-table2-era";
import { giftTable2PriorResidenceNotice } from "./one-house/gift-table2-notice";
import { appurtenantLandLthdNoticeText } from "./appurtenant-land-lthd-rate";
import { pushLongTermHoldingSteps } from "./transfer-tax-lthd-steps";
import type { LthdExclusionReason } from "./legal-codes/transfer";
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";
import type { UsageConversionDetail } from "./types/transfer-result.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { Rental97Result } from "./transfer-reductions/types";
import type { Unsold982LthdEcho } from "./transfer-reductions/unsold-hybrid-p4";

export interface Lthd982StepArgs {
  steps: CalculationStep[];
  warnings: string[];
  taxableGain: number;
  /** 표2 대상 판정 입력(유효 주택수 반영) — 계산 축과 같은 입력이다. */
  exemptionJudgeInput: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  /** `surchargeExclusionByReduction.appliedId` — "unsold_98_2"일 때만 특칙을 건다. */
  surchargeExclusionAppliedId: string | undefined;
  deemedOneHouseBy155: boolean;
  /** 12억 초과 고가주택 부분과세인가(`exemptionResult.isPartialExempt`) — 증여 전 동일세대 거주 표2 확인 필요 고지의 게이트(결정 #38-8). */
  isHighValuePartial: boolean;
  holdingPeriod: { years: number; months: number };
  longTermHoldingDeduction: number;
  longTermHoldingRate: number;
  lthdExclusionReason: LthdExclusionReason | undefined;
  usageConversionDetail?: UsageConversionDetail;
  fbLthdFormula?: string;
  appurtenantTable1Applied?: boolean;
  /** 겸용 파트 카드 주택 부수토지에 통칙 95-0…1을 적용해 공제율이 달라진 경우의 고지 입력(`calcLongTermHoldingDeduction` echo) */
  appurtenantLthdNotice?: Parameters<typeof appurtenantLandLthdNoticeText>[0];
  splitDetail?: SplitGainResult;
  /** §97의3·§97의4 echo — 장특 step 산식에서 혼합·가산 공제율을 풀어 쓴다(표시 전용, `transfer-tax-lthd-steps.ts`). */
  rental97LthdDetail?: Rental97Result;
}

export interface Lthd982StepResult {
  longTermHoldingDeduction: number;
  longTermHoldingRate: number;
  /** §98의2 특칙 장특 결과 echo — 적격일 때만(STEP 4.6·결과 카드 표시용, 세액 불변). */
  lthd982Echo?: Unsold982LthdEcho;
  /** §97의3 echo — §98의2가 장특을 대체했으면 엔진 공제액과 맞춘 사본(결과 카드가 엔진 값과 어긋나지 않게). */
  rental97LthdDetail?: Rental97Result;
}

export function applyLthd982AndPushSteps(a: Lthd982StepArgs): Lthd982StepResult {
  const { exemptionJudgeInput, taxableGain, deemedOneHouseBy155, holdingPeriod } = a;
  let { longTermHoldingDeduction, longTermHoldingRate } = a;
  const table2ResidenceYearsForStep = Math.floor(resolveExemptionRequirementResidenceMonths(exemptionJudgeInput) / 12);
  // STEP 4.05: §98의2 특칙 — 장특 = 양도차익 × §95② 표2 보유기간별 공제율 강제 (법 ①1호, P4).
  // 적격 선판정은 STEP 0.45 (중과 배제 5호 열거 — 동일 신호). 1세대1주택 표2(보유+거주)는
  // ①의 "각 표 외의 부분 본문 불구" 범위 밖 — 특례 적용 시 유지 (항상 ≥ 표2 보유 단독).
  let lthd982Applied = false;
  let lthd982Echo: Unsold982LthdEcho | undefined;
  let rental97LthdDetail = a.rental97LthdDetail;
  if (a.surchargeExclusionAppliedId === "unsold_98_2") {
    // 표2 대상 축은 위 STEP 4와 **같은 술어**를 쓴다 — 여기만 실제 주택수를 보면 §155 의제
    // 자산에서 「STEP 4는 표2인데 §98의2 특칙은 표2가 아니라고 본다」는 세 번째 진실이 생긴다.
    const isOneHouseSpecial982 =
      resolveLthdTable2OneHouseAxis(exemptionJudgeInput, deemedOneHouseBy155) &&
      isLthdTable2SubjectAsset(exemptionJudgeInput) &&
      meetsTable2ResidenceRequirement(exemptionJudgeInput, table2ResidenceYearsForStep) &&
      longTermHoldingDeduction > 0;
    // 표2 보유기간별 공제율 — 양도일 시행본 기준(US-02: ~2020.12.31. 연 8%·80%, 2021.1.1.~ 보유 열 연 4%·40%).
    const rate982 = table2HoldingRateAt(exemptionJudgeInput.transferDate, holdingPeriod.years);
    const deduction982 = applyRate(taxableGain, rate982);
    const holdingColumn = { holdingRatePct: Math.round(rate982 * 100), holdingDeduction: deduction982 };
    if (isOneHouseSpecial982) {
      lthd982Echo = { outcome: "one_house_table2_kept", ...holdingColumn, appliedDeduction: longTermHoldingDeduction };
    } else {
      // US-16 / Q-2 (a) — §97의3 특례를 적용한 장특(임대분 70% 혼합)과 §98의2 표2 중 큰 쪽 하나를 쓴다.
      // 두 조문의 우선순위 규정이 없고 §97의3③은 신청 형식이다(`transfer-tax-lthd-rental97.ts` Q-1 (a)와 같은 논리).
      const r97 = a.rental97LthdDetail;
      const rental97Applied = (r97 as { specialApplied?: boolean } | undefined)?.specialApplied === true && !a.usageConversionDetail && !a.fbLthdFormula && !a.splitDetail;
      if (rental97Applied && longTermHoldingDeduction > deduction982) {
        lthd982Echo = { outcome: "rental97_kept", ...holdingColumn, appliedDeduction: longTermHoldingDeduction, rental97Deduction: longTermHoldingDeduction };
        a.warnings.push(
          `조특법 §97의3 특례 장기보유특별공제 ${longTermHoldingDeduction.toLocaleString()}원과 §98의2 표2 보유기간별 공제율 장기보유특별공제 ` +
            `${deduction982.toLocaleString()}원 중 큰 금액인 §97의3 특례 공제액을 적용했습니다. 두 조문의 적용 순서를 정한 규정은 확인되지 않아 확인 필요합니다.`,
        );
      } else {
        const rental97Before = rental97Applied ? longTermHoldingDeduction : undefined;
        longTermHoldingDeduction = deduction982;
        longTermHoldingRate = rate982;
        lthd982Applied = true;
        lthd982Echo = { outcome: "table2_holding", ...holdingColumn, appliedDeduction: deduction982, rental97Deduction: rental97Before };
        if (r97 && !a.usageConversionDetail && !a.fbLthdFormula && !a.splitDetail) {
          // 결과 카드가 엔진이 공제하지 않은 §97의3 공제액을 「적용」으로 그리지 않게 사본을 맞춘다.
          rental97LthdDetail = { ...r97, ...(r97.effectCategory === "long_term_holding_special" ? { specialApplied: false } : {}), replacedBy982Deduction: deduction982 } as unknown as Rental97Result;
        }
        if (rental97Before !== undefined) {
          a.warnings.push(
            `조특법 §98의2 표2 보유기간별 공제율 장기보유특별공제 ${deduction982.toLocaleString()}원과 §97의3 특례 장기보유특별공제 ` +
              `${rental97Before.toLocaleString()}원 중 큰 금액인 §98의2 공제액을 적용했습니다. 두 조문의 적용 순서를 정한 규정은 확인되지 않아 확인 필요합니다.`,
          );
        }
      }
    }
  }
  pushLongTermHoldingSteps({
    steps: a.steps,
    taxableGain,
    holdingPeriod,
    longTermHoldingRate,
    longTermHoldingDeduction,
    residenceYearsForStep: Math.floor(a.effectiveInput.residencePeriodMonths / 12),
    table2ResidenceYearsForStep,
    // 표시 축도 계산 축과 **같은 술어**를 쓴다 — §155의3 면제를 계산에만 반영하고 문구가 표1이면
    // 「공제율은 표2인데 문구는 표1」 드리프트가 난다.
    // 자산 축(순수 토지·건물·배율 초과·판정 불가 카드는 표1 — S08-6)도 같은 술어다.
    meetsTable2Residence:
      isLthdTable2SubjectAsset(exemptionJudgeInput) &&
      meetsTable2ResidenceRequirement(exemptionJudgeInput, table2ResidenceYearsForStep),
    isOneHousehold: exemptionJudgeInput.isOneHousehold,
    // 표시 축도 계산 축과 맞춘다 — §159의4 의제 1세대1주택은 표2를 적용받으므로 산식 문구도
    // 표2(보유 4% + 거주 4%)여야 한다. 어긋나면 「공제율 64%인데 문구는 표1」 drift가 난다.
    householdHousingCount: deemedOneHouseBy155 ? 1 : exemptionJudgeInput.householdHousingCount,
    lthd982Applied,
    lthdExclusionReason: a.lthdExclusionReason,
    // §95⑤ 적용 시 보유분을 표1+표2로 나눠 표시한다 — 없으면 종전 표2 문구 그대로.
    usageConversionDetail: a.usageConversionDetail,
    // §95④ 후단(가업상속) 적용 시 공제율 분해 문구로 대체한다.
    fbLthdFormula: a.fbLthdFormula,
    appurtenantTable1Applied: a.appurtenantTable1Applied,
    transferDate: exemptionJudgeInput.transferDate,
    splitDetail: a.splitDetail,
    rental97LthdDetail,
  });
  // 기본통칙 95-0…1 — 토지가 주택보다 먼저 취득돼 토지분 공제율이 「표1·표2 중 큰 공제율」로 정해졌고 그 값이 토지 자신의
  // 보유연수로 표2를 적용한 값과 달라졌을 때만 고지한다(사실만 — 세액은 파트별 공제액이 정본). §98의2 특칙이 총액을 덮어쓴 경우는 제외.
  const landAppurtenant = a.splitDetail?.land.appurtenantLthd;
  if (landAppurtenant?.changedFromOwnYears && !lthd982Applied) {
    a.warnings.push(
      appurtenantLandLthdNoticeText({
        landHoldingYears: a.splitDetail!.land.holdingYears,
        houseHoldingYears: landAppurtenant.houseHoldingYears,
        table1Rate: landAppurtenant.table1Rate,
        table2Rate: landAppurtenant.table2Rate,
        table1Applied: landAppurtenant.table1Applied,
        basis: landAppurtenant.basis,
      }),
    );
  }
  if (a.appurtenantLthdNotice && !lthd982Applied) a.warnings.push(appurtenantLandLthdNoticeText(a.appurtenantLthdNotice));
  // OH-31 — 2009-01-01 전 양도분의 표2 연혁은 미지원이다(현행 식으로 계산) — 숨기지 않는다.
  if (longTermHoldingDeduction > 0 && resolveLthdTable2Era(exemptionJudgeInput.transferDate) === "unsupported" && resolveLthdTable2OneHouseAxis(exemptionJudgeInput, deemedOneHouseBy155) && isLthdTable2SubjectAsset(exemptionJudgeInput)) a.warnings.push(LTHD_TABLE2_UNSUPPORTED_NOTICE);

  // 결정 #38-8 — 증여 전 동일세대 거주를 표2 대상 판정에 통산하면 결론이 갈릴 때만 확인 필요(세액은 통산하지 않은 값 — 별건 #38-9 결정 대기).
  const giftTable2Notice = giftTable2PriorResidenceNotice({
    input: exemptionJudgeInput,
    deemedOneHouseBy155,
    isHighValuePartial: a.isHighValuePartial,
    lthdApplies: taxableGain > 0 && holdingPeriod.years >= 3 && a.lthdExclusionReason === undefined && !a.usageConversionDetail && !a.splitDetail,
  });
  if (giftTable2Notice) a.warnings.push(giftTable2Notice);

  return { longTermHoldingDeduction, longTermHoldingRate, lthd982Echo, rental97LthdDetail };
}
