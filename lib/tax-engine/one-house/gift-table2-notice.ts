/**
 * 증여받은 주택 — **장기보유특별공제 표2 대상 판정**에 증여 전 동일세대 거주기간을 통산하는지 확인 필요 고지 (결정 #38-8)
 *
 * 증여 전 동일세대 거주 개월(`GiftHouseholdBasis.priorHouseholdResidenceMonths`, 결정 #38-7)은 **비과세 거주요건에만** 통산한다.
 * 표2(1세대1주택) 대상 판정 「보유기간 중 거주기간 2년 이상」(「소득세법 시행령」 §159의4)에 통산할지는 해석이 갈려 사용자 결정 대기(별건 #38-9)이므로,
 * 세액은 통산하지 않은 값(표1)으로 계산하고 **통산하면 표2 대상이 되어 결론이 갈릴 때만** 확인 필요를 알린다 — 반사실 판정이다.
 *
 * 발동 조건(전부):
 *  1. 동일세대 통산이 성립(`giftHouseholdConsolidationStart`) 하고 증여 전 거주 개월이 「0」이 아니다 — 입력이 있으면 그 값, 없으면 세대 보유 시작일부터
 *     증여일까지 전부 거주한 상한(`giftHouseholdMaxPriorResidenceMonths`)을 가정한다.
 *  2. 12억 초과 고가주택 부분과세(`isHighValuePartial`) — 장기보유특별공제가 세액에 닿는 경우다. 12억 이하 전액 비과세는 공제를 따질 일이 없다.
 *  3. 표2의 1주택 축·자산 축을 충족(`resolveLthdTable2OneHouseAxis`·`isLthdTable2SubjectAsset`) — 같은 술어를 쓴다(사본 금지).
 *  4. 통산 없이는 거주 2년 미만이라 표1이 적용되는 경우(`meetsTable2ResidenceRequirement` 불충족).
 *  5. 통산하면 그 요건을 충족해 표2 대상이 된다.
 *  6. 공제가 실제로 걸린다 — 보유 3년 이상 · 양도차익 양수 · 장기보유특별공제 배제 사유 없음.
 *
 * 국세청·법원 입장은 단정하지 않는다 — 해석이 갈린다는 사실만 알린다.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import { TRANSFER } from "../legal-codes";
import { isLthdTable2SubjectAsset, resolveLthdTable2OneHouseAxis } from "../lthd-table2-subject";
import { meetsTable2ResidenceRequirement } from "../transfer-tax-exemption-residence-waivers";
import { resolveExemptionResidenceMonths } from "./residence-months";
import {
  giftHouseholdConsolidationStart,
  giftHouseholdMaxPriorResidenceMonths,
  giftHouseholdPriorResidenceMonths,
} from "./gift-household-basis";

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
  const answered = basis?.priorHouseholdResidenceMonths;
  if (answered === 0) return undefined;
  const priorMonths = answered === undefined ? giftHouseholdMaxPriorResidenceMonths(basis) : giftHouseholdPriorResidenceMonths(basis);
  if (priorMonths <= 0) return undefined;
  const baseMonths = resolveExemptionResidenceMonths(input);
  if (meetsTable2ResidenceRequirement(input, Math.floor(baseMonths / 12))) return undefined;
  if (!meetsTable2ResidenceRequirement(input, Math.floor((baseMonths + priorMonths) / 12))) return undefined;
  const statute = TRANSFER.LONG_TERM_DEDUCTION_TABLE2_DECREE;
  return (
    `증여받은 주택을 증여자와 계속 같은 세대로 보유한 경우, 증여 전 동일세대 거주기간을 장기보유특별공제 표2(1세대1주택) 대상 판정(${statute} — 보유기간 중 거주기간 2년 이상)에 ` +
    "통산하는지는 해석이 갈립니다. 이 계산은 표2 대상 판정에 통산하지 않아 거주기간이 2년 미만이므로 표1(일반 장기보유특별공제)을 적용했습니다. " +
    (answered === undefined
      ? "증여 전 동일세대 거주 개월이 입력되지 않았지만 그 기간이 있다면 통산 여부에 따라 표2 대상이 되어 공제액이 달라질 수 있습니다 — "
      : `증여 전 동일세대 거주기간 ${priorMonths}개월을 통산하면 표2 대상이 되어 공제액이 달라집니다 — `) +
    "표2 대상 판정의 통산 여부는 확인이 필요합니다. (비과세 거주요건에는 별도로 통산했습니다.)"
  );
}
