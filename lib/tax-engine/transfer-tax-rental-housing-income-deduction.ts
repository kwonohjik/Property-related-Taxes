/**
 * STEP 2.5 헬퍼 — §155⑳ 거주주택 특례 경로의 **조특법 §99·§99의3 양도소득금액 차감** (리뷰 NH-37 · Q-19).
 *
 * 종전에는 이 경로가 §99·§99의3을 계산하지 않고 「적용 대상이 아닙니다」로 고지했다. 그러나
 * · 두 조문의 고가주택 배제 단서는 «양도 당시 소득세법 §89①3호 고가주택»(2003.1.1. 이후 계약·사용승인분)이거나,
 *   법률 제6762호 부칙 §29①에 따라 2003.1.1. 전 계약·사용승인분은 «계약·사용승인일 당시의 고급주택 기준»
 *   (면적 AND 가액)이다 — 12억을 넘는다는 사실만으로 배제되지 않는다. 그 판정은 일반 경로와 같은 라우터
 *   (`resolveIncomeDeduction`)가 한다.
 * · 적용 순서: 고가주택이면서 1세대 1주택인 신축주택은 «소득세법 §95③·령 §160(고가주택 양도차익 안분)을 적용한 후
 *   조특법 §99·§99의3을 적용»한다(서면인터넷방문상담4팀-3614 · 재정경제부 재산세제과-1114, 2006.9.8.).
 *   이 경로의 과세대상 양도소득금액(`rhe.taxableGain` — 고가주택 안분·장기보유특별공제·§161 반영 후)에서 감면대상 양도소득금액을 뺀다.
 *   §161 안분과 차감 사이의 순서를 직접 다룬 해석은 확인하지 못했다 — 위 회신의 «고가주택 안분 후 감면»을 §161 결과에도 같게 적용한다(확인 필요 고지).
 *
 * 범위: §99·§99의3(NH-37)과 §98의3·§98의5·§98의6·§98의7·§98의8(US-43 · Q-15 (a)). 그 밖의 조문(§99의2 5년 후·§98의4)은 미반영 고지하고,
 * §98(세율 특칙)·§98의2(장특 특칙)는 각자의 고지로 보낸다(`transfer-tax-rental-housing-reductions.ts`).
 * 순수 함수 — `steps`에 단계를 push하는 부수효과만 있다.
 */
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { reductionAcquisitionCauseOf } from "./transfer-reductions/new-99-acquisition-cause";
import { buildIncomeDeductionStep, resolveIncomeDeduction } from "./transfer-reductions/income-deduction-router";
import type { IncomeDeductionResolution } from "./transfer-reductions/income-deduction-router";
import {
  applyIncomeDeductionSurtax,
  pickIncomeDeductionDetails,
  selectActiveIncomeDeduction,
} from "./transfer-tax-income-deduction-details";
import type { IncomeDeductionDetails } from "./transfer-tax-income-deduction-details";
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";
import { ruralSurtaxDeductionBasis } from "./rural-surtax-basis";

/**
 * 이 경로가 계산하는 차감형.
 *   · §99·§99의3 — §99 리뷰 NH-37 · Q-19
 *   · §98의3·§98의5·§98의6·§98의7·§98의8 — §98 시리즈 리뷰 US-43 · Q-15 (a) 사용자 결정 2026-11-08(일반 경로와 같은 순서: 고가주택 안분·장특 후 차감).
 *     겸용 경로와 같은 집합이다(`transfer-reductions/mixed-use-computed-ids.ts`). 5년 이내 양도분(세액감면형)은 `calcReductions`가 맡는다.
 */
export const RENTAL_HOUSING_INCOME_DEDUCTION_IDS: ReadonlyArray<string> = [
  "new_99_3",
  "new_99",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_7",
  "unsold_98_8",
];

export const RENTAL_HOUSING_INCOME_DEDUCTION_ORDER_NOTICE =
  "조특법 감면(양도소득금액 차감)을 거주주택 비과세 특례(소득세법 시행령 §155⑳)의 과세대상 양도소득금액(고가주택 안분·장기보유특별공제·§161 반영 후)에서 뺐습니다 — " +
  "고가주택이면서 1세대 1주택인 신축주택은 소득세법 §95③·시행령 §160을 적용한 후 조특법 §99·§99의3을 적용한다는 회신(서면인터넷방문상담4팀-3614, 재산세제과-1114)을 " +
  "같은 차감 구조의 조문에 함께 따른 것이고, §161 안분과 차감 사이의 순서를 직접 다룬 해석은 확인하지 못했습니다 — 확인 필요";

export interface RentalHousingIncomeDeduction {
  /** 라우터 평가 결과 — 해당 조문을 고르지 않았으면 `reducible: 0`뿐이다 */
  resolution: IncomeDeductionResolution;
  /** 실제로 뺀 감면대상 양도소득금액(과세대상 양도소득금액 한도) */
  applied: number;
  /** 감면이 선택·평가되었는가(적격 여부 무관) — 고지·상세 echo 판단용 */
  evaluated: boolean;
}

/**
 * §99·§99의3 평가 — 일반 경로(`runIncomeAndBaseSteps`)와 같은 입력으로 라우터를 부른다.
 * `housingIncome` = 특례 적용 후 주택분 과세대상 양도소득금액(배율 이내 부수토지 포함, 배율 초과 비사업용 토지분·나중 취득 토지분 제외).
 */
export function resolveRentalHousingIncomeDeduction(args: {
  input: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  housingIncome: number;
  steps: CalculationStep[];
}): RentalHousingIncomeDeduction {
  const { input, effectiveInput, housingIncome, steps } = args;
  const selected = (input.reductions ?? []).filter((r) => RENTAL_HOUSING_INCOME_DEDUCTION_IDS.includes(r.type));
  if (selected.length === 0 || input.isUnregistered) {
    return { resolution: { reducible: 0 }, applied: 0, evaluated: false };
  }
  const resolution = resolveIncomeDeduction(selected, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    assetContractDate: input.assetContractDate,
    transferPrice: input.transferPrice,
    totalPropertyTransferPrice: input.totalPropertyTransferPrice,
    burdenedGiftDenominator: effectiveInput.burdenedGiftDenominator,
    selfOwns: effectiveInput.selfOwns,
    acquisitionCause: reductionAcquisitionCauseOf(input),
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    transferIncome: housingIncome,
  });
  const applied = resolution.appliedId ? Math.min(Math.max(0, resolution.reducible), Math.max(0, housingIncome)) : 0;
  if (resolution.stepLabel) {
    steps.push(buildIncomeDeductionStep(resolution, housingIncome, housingIncome - applied));
  }
  if (applied > 0) {
    steps.push({
      label: "조특법 양도소득금액 차감 — 거주주택 특례 경로 적용 순서 (확인 필요)",
      formula: RENTAL_HOUSING_INCOME_DEDUCTION_ORDER_NOTICE,
      amount: 0,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
  }
  return { resolution, applied, evaluated: true };
}

/**
 * 농특세 2-pass(감면 전후 산출세액 차 × 20%, 농특세법 §2①1호) — 일반 경로 STEP 7.5와 같은 leaf.
 * 차감이 적용되지 않았으면(부적격·미선택) 상세만 echo하고 농특세는 0이다.
 */
export function finalizeRentalHousingIncomeDeduction(args: {
  deduction: RentalHousingIncomeDeduction;
  taxBefore: number | undefined;
  taxAfter: number;
  /** 양도일 — 차감형 농특세 시행령 항 번호(§5①/§5②) 선택용 */
  transferDate: Date;
  steps: CalculationStep[];
}): { details: IncomeDeductionDetails; ruralSurtax: number } {
  const { deduction, taxBefore, taxAfter, steps } = args;
  let details = pickIncomeDeductionDetails(deduction.resolution);
  const active = selectActiveIncomeDeduction(details);
  if (!active || taxBefore === undefined) return { details, ruralSurtax: 0 };
  const surtax = applyIncomeDeductionSurtax(details, active, { before: taxBefore, after: taxAfter });
  details = surtax.details;
  if (surtax.taxReduction > 0 && !active.isExempt) {
    steps.push({
      label: `${active.articleLabel} 농어촌특별세 (감면세액 × 20%)`,
      formula: `(감면 전 산출세액 ${taxBefore.toLocaleString()} − 감면 후 산출세액 ${taxAfter.toLocaleString()}) × 20% = ${surtax.ruralSurtax.toLocaleString()}`,
      amount: surtax.ruralSurtax,
      legalBasis: ruralSurtaxDeductionBasis(args.transferDate),
    });
  }
  return { details, ruralSurtax: surtax.ruralSurtax };
}
