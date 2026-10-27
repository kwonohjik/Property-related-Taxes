/**
 * 증여받은 주택 — 증여 전 동일세대 거주 개월이 **입력되지 않아** 표2 대상 판정에 통산하지 못했는데, 거주했다면 표2 대상이 되어 공제액이 달라질 때의 확인 필요 고지
 * (결정 #38-8 → #38-9로 범위 축소)
 *
 * 증여 전 동일세대 거주 개월(`GiftHouseholdBasis.priorHouseholdResidenceMonths`, 결정 #38-7)은 비과세 거주요건과 표2(1세대1주택) 대상 판정
 * 「보유기간 중 거주기간 2년 이상」(「소득세법 시행령」 §159의4)에 **통산한다**(결정 #38-9 — 사전-2025-법규재산-0506 질의1). 미답(「모름」)이면 통산하지 않고
 * 계산하며, 결론을 가를 때만 아래 1~6 조건으로 확인 필요를 고지한다(2026-10-04 원칙 — 세액은 통산하지 않은 값(표1)).
 * 표2 **공제율**의 보유·거주기간은 본인 기간(증여일 기산)이라 통산 대상이 아니다.
 *
 * **통산해 표2가 된 경우**에도 확인 필요를 고지한다(사용자 결정 2026-10-27 — 계획서 `table2-pre-acquisition-residence-conflict.plan.md` §10):
 * 조심 2025서3843(2025.12.16.)은 양도일 현재 증여인과 동일세대가 아니어서 증여인 거주기간을 통산하지 않아 표2 적용을 배제한 사안이다(부→자 증여 · 기각).
 * 엔진은 증여일부터 양도일까지 계속 같은 세대일 때만 통산하므로, 양도일 현재 동일세대인지 확인을 고지한다.
 * 상속(§154⑧3호 통산분)은 기획재정부 재산세제과-720(2021.8.10.)이 대상 판정 통산을 정면으로 답해 고지하지 않는다.
 * ⚠️ 대법원 2026.1.15. 2025두34935는 표2 **거주기간별 공제율** 사건이다(처분청이 대상 판정 통산·보유분 표2를 인정한 사안) — 대상 판정 근거로 인용하지 않는다.
 *
 * 발동 조건(전부):
 *  1. 동일세대 통산이 성립(`giftHouseholdConsolidationStart`)하고 증여 전 거주 개월이 **미답**이다(0 = 거주한 적 없음은 고지 없음) —
 *     세대 보유 시작일부터 증여일까지 전부 거주한 상한(`giftHouseholdMaxPriorResidenceMonths`)을 가정한다.
 *  2. 12억 초과 고가주택 부분과세(`isHighValuePartial`) — 장기보유특별공제가 세액에 닿는 경우다. 12억 이하 전액 비과세는 공제를 따질 일이 없다.
 *  3. 표2의 1주택 축·자산 축을 충족(`resolveLthdTable2OneHouseAxis`·`isLthdTable2SubjectAsset`) — 같은 술어를 쓴다(사본 금지).
 *  4. 통산 없이는 거주 2년 미만이라 표1이 적용되는 경우(`meetsTable2ResidenceRequirement` 불충족).
 *  5. 상한만큼 통산하면 그 요건을 충족해 표2 대상이 된다.
 *  6. 공제가 실제로 걸린다 — 보유 3년 이상 · 양도차익 양수 · 장기보유특별공제 배제 사유 없음.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import { TRANSFER } from "../legal-codes";
import { isLthdTable2SubjectAsset, resolveLthdTable2OneHouseAxis } from "../lthd-table2-subject";
import { meetsTable2ResidenceRequirement } from "../transfer-tax-exemption-residence-waivers";
import { resolveExemptionRequirementResidenceMonths } from "./residence-months";
import {
  giftHouseholdConsolidationStart,
  giftHouseholdMaxPriorResidenceMonths,
} from "./gift-household-basis";
import { giftHouseholdPriorResidenceMonths } from "./gift-household-basis";

export interface GiftTable2NoticeArgs {
  /** 표2 대상 판정 입력(유효 주택수 반영) — 장기보유특별공제 계산 축과 같은 입력이다. */
  input: TransferTaxInput;
  deemedOneHouseBy155: boolean;
  /** 12억 초과 고가주택 부분과세인가(`exemptionResult.isPartialExempt`). */
  isHighValuePartial: boolean;
  /** 공제가 걸리는가 — 양도차익 양수 · 보유 3년 이상 · 공제 배제 사유 없음(호출부가 이미 아는 값). */
  lthdApplies: boolean;
}

export function giftTable2PriorResidenceNotice(a: GiftTable2NoticeArgs): string | undefined {
  const { input } = a;
  const basis = input.giftHouseholdBasis;
  if (!a.isHighValuePartial || !a.lthdApplies || !giftHouseholdConsolidationStart(basis)) return undefined;
  if (!resolveLthdTable2OneHouseAxis(input, a.deemedOneHouseBy155) || !isLthdTable2SubjectAsset(input)) return undefined;
  // 입력이 있으면(0 포함) 통산을 적용했거나 거주한 적이 없다는 명시 답이다 — 통산이 표2를 연 경우에만 심판례 확인 필요를 고지한다.
  if (basis?.priorHouseholdResidenceMonths !== undefined) {
    const applied = giftHouseholdPriorResidenceMonths(basis);
    const withPrior = resolveExemptionRequirementResidenceMonths(input);
    if (applied <= 0 || !meetsTable2ResidenceRequirement(input, Math.floor(withPrior / 12))) return undefined;
    if (meetsTable2ResidenceRequirement(input, Math.floor((withPrior - applied) / 12))) return undefined;
    return (
      `증여 전 동일세대로 거주한 ${applied}개월을 장기보유특별공제 표2(1세대1주택) 대상 판정(${TRANSFER.LONG_TERM_DEDUCTION_TABLE2_DECREE} — 보유기간 중 거주기간 2년 이상)에 ` +
      "통산해 표2를 적용했습니다(사전-2025-법규재산-0506). 조심 2025서3843(2025.12.16.)은 양도일 현재 증여인과 동일세대가 아니어서 " +
      "증여인 거주기간을 통산하지 않아 표2 적용을 배제한 사안입니다 — 양도일 현재 증여인과 동일세대인지 확인이 필요합니다. " +
      (basis.holdingAlreadyAtDonor === true
        ? "(표2 공제율의 거주기간은 증여일 이후 본인 거주만 반영했습니다.)"
        : "(표2 공제율의 보유·거주기간은 증여일부터 센 본인의 기간이라 통산하지 않습니다.)")
    );
  }
  const maxPrior = giftHouseholdMaxPriorResidenceMonths(basis);
  if (maxPrior <= 0) return undefined;
  const baseMonths = resolveExemptionRequirementResidenceMonths(input);
  if (meetsTable2ResidenceRequirement(input, Math.floor(baseMonths / 12))) return undefined;
  if (!meetsTable2ResidenceRequirement(input, Math.floor((baseMonths + maxPrior) / 12))) return undefined;
  const statute = TRANSFER.LONG_TERM_DEDUCTION_TABLE2_DECREE;
  return (
    `증여받은 주택을 증여자와 계속 같은 세대로 보유한 경우, 증여 전 동일세대로 함께 거주한 기간은 장기보유특별공제 표2(1세대1주택) 대상 판정(${statute} — 보유기간 중 거주기간 2년 이상)에 ` +
    "통산합니다(사전-2025-법규재산-0506). 증여 전 동일세대 거주 개월이 입력되지 않았기에 통산하지 못했고, 증여일 이후 거주기간이 2년 미만이라 표1(일반 장기보유특별공제)을 적용했습니다. " +
    "증여 전에 같은 세대로 거주한 기간이 있다면 표2 대상이 되어 공제액이 달라질 수 있으니 확인이 필요합니다 — 그 개월 수를 입력하세요. " +
    "(표2 공제율의 보유·거주기간은 증여일부터 센 본인의 기간이라 통산하지 않습니다.)"
  );
}
