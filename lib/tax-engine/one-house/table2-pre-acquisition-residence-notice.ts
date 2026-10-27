/**
 * 장기보유특별공제 표2(1세대1주택) **대상 판정**(「소득세법 시행령」 §159의4 — 보유기간 중 거주기간 2년 이상)에서 취득 전 동일세대 거주를
 * 어떻게 다뤘는지 알리는 고지 — 그 거주가 표1/표2를 가를 때만 낸다(사용자 결정 2026-10-27 Q-3).
 *
 * 표2 대상 판정은 양도자 본인의 거주다(`resolveTable2SubjectResidenceMonths` — 대법원 2026.1.15. 선고 2025두34935). 그래서
 *  1. **판례 고지** — 상속 전 동거 거주(§154⑧3호 통산분)나 증여 전 동일세대 거주(통산 성립분)를 비과세 거주요건에는 통산했지만 표2에는 더하지 않았고,
 *     더했다면 표2 대상이었을 때. 국세청 사전-2025-법규재산-0506 질의1(통산)과 해석이 다르다는 것을 함께 적는다.
 *  2. **이월과세 시나리오 A**(`holdingAlreadyAtDonor` — 보유기간이 증여자 취득일부터) — 증여 전 거주를 표2 대상 판정에 통산한다(Q-2). 판결이 다루지 않은
 *     질문이라 확인 필요다. 통산해 표2가 된 경우(입력 있음)와, 개월이 미답이라 통산하지 못했는데 채우면 표2가 될 수 있는 경우(모름 = 혜택 불성립)에 낸다.
 *
 * 공통 발동 조건: 12억 초과 고가주택 부분과세(`isHighValuePartial`) · 공제가 실제로 걸림(`lthdApplies`) · 표2의 1주택 축·자산 축 충족
 * (`resolveLthdTable2OneHouseAxis`·`isLthdTable2SubjectAsset` — 같은 술어, 사본 금지).
 */
import type { TransferTaxInput } from "../types/transfer.types";
import type { MixedUseAssetInput } from "../types/transfer-mixed-use.types";
import { TRANSFER } from "../legal-codes";
import { isLthdTable2SubjectAsset, resolveLthdTable2OneHouseAxis } from "../lthd-table2-subject";
import { meetsTable2ResidenceRequirement } from "../transfer-tax-exemption-residence-waivers";
import { resolveExemptionRequirementResidenceMonths } from "./residence-months";
import { resolveTable2SubjectResidenceMonths } from "./residence-months";
import { table2SubjectResidenceMonths } from "./residence-months";
import { giftHouseholdConsolidationStart } from "./gift-household-basis";
import { giftHouseholdMaxPriorResidenceMonths } from "./gift-household-basis";
import { giftHouseholdPriorResidenceMonths } from "./gift-household-basis";

export interface Table2PreAcquisitionResidenceNoticeArgs {
  /** 표2 대상 판정 입력(유효 주택수 반영) — 장기보유특별공제 계산 축과 같은 입력이다. */
  input: TransferTaxInput;
  deemedOneHouseBy155: boolean;
  /** 12억 초과 고가주택 부분과세인가(`exemptionResult.isPartialExempt`). */
  isHighValuePartial: boolean;
  /** 공제가 걸리는가 — 양도차익 양수 · 보유 3년 이상 · 공제 배제 사유 없음(호출부가 이미 아는 값). */
  lthdApplies: boolean;
}

const STATUTE = TRANSFER.LONG_TERM_DEDUCTION_TABLE2_DECREE;

export function table2PreAcquisitionResidenceNotice(a: Table2PreAcquisitionResidenceNoticeArgs): string | undefined {
  const { input } = a;
  if (!a.isHighValuePartial || !a.lthdApplies) return undefined;
  if (!resolveLthdTable2OneHouseAxis(input, a.deemedOneHouseBy155) || !isLthdTable2SubjectAsset(input)) return undefined;
  const meets = (months: number) => meetsTable2ResidenceRequirement(input, Math.floor(months / 12));
  const own = input.residencePeriodMonths;
  const subject = resolveTable2SubjectResidenceMonths(input);
  const basis = input.giftHouseholdBasis;

  if (basis?.holdingAlreadyAtDonor === true) {
    if (meets(own) || !giftHouseholdConsolidationStart(basis)) return undefined;
    if (subject > own) {
      if (!meets(subject)) return undefined;
      return (
        `이월과세(${TRANSFER.CARRYOVER_TAXATION} ①)가 적용되어 보유기간을 증여자가 취득한 날부터 셌으므로, 그 보유기간 중 증여 전 같은 세대로 거주한 ${subject - own}개월을 ` +
        `장기보유특별공제 표2(1세대1주택) 대상 판정(${STATUTE} — 보유기간 중 거주기간 2년 이상)에 통산했습니다. ` +
        "대법원 2026.1.15. 선고 2025두34935는 표2의 거주기간을 양도자가 보유기간 중 거주한 기간으로 보았으나 이월과세 사안은 다루지 않았고, " +
        "이 통산을 정면으로 다룬 해석도 확인하지 못했습니다 — 확인이 필요합니다. (표2 공제율의 거주분은 증여일 이후 본인 거주만 반영했습니다.)"
      );
    }
    if (basis.priorHouseholdResidenceMonths !== undefined) return undefined;
    const maxPrior = giftHouseholdMaxPriorResidenceMonths(basis);
    if (maxPrior <= 0 || !meets(own + maxPrior)) return undefined;
    return (
      `이월과세(${TRANSFER.CARRYOVER_TAXATION} ①)가 적용되어 보유기간을 증여자가 취득한 날부터 셌습니다. 그 보유기간 중 증여 전 같은 세대로 거주한 기간이 있다면 ` +
      `장기보유특별공제 표2(1세대1주택) 대상 판정(${STATUTE})에 통산할 수 있으나, 그 개월 수가 입력되지 않아 통산하지 않고 표1(일반 장기보유특별공제)을 적용했습니다. ` +
      "거주한 기간이 있다면 그 개월 수를 입력하세요 — 정면 해석을 확인하지 못해 확인이 필요합니다."
    );
  }

  const pre = resolveExemptionRequirementResidenceMonths(input) - subject;
  if (pre <= 0 || meets(subject) || !meets(subject + pre)) return undefined;
  return table2PrecedentNoticeText(input.acquisitionCause === "inheritance" ? "상속개시" : "증여", pre);
}

/** 판례 고지 문구 — 단건(위)과 겸용주택(`transfer-tax-mixed-use.ts`)이 같은 문장을 쓴다. 겸용은 거주를 연 단위로 받아 개월 수를 적지 않는다. */
export function table2PrecedentNoticeText(before: "상속개시" | "증여", preMonths?: number): string {
  return (
    `${before} 전 동일세대로 거주한 ${preMonths !== undefined ? `${preMonths}개월` : "기간"}은 1세대1주택 비과세 거주요건에는 통산했지만, 장기보유특별공제 표2(1세대1주택) 대상 판정` +
    `(${STATUTE} — 보유기간 중 거주기간 2년 이상)에는 통산하지 않아 표1(일반 장기보유특별공제)을 적용했습니다. ` +
    "대법원 2026.1.15. 선고 2025두34935는 표2의 거주기간을 양도자가 그 주택을 취득한 날부터 양도한 날까지 보유하는 동안 거주한 기간으로 보았습니다(상속으로 취득한 경우도 같음). " +
    "국세청 사전-2025-법규재산-0506은 동일세대원으로서 거주한 기간을 통산한다고 답해 해석이 다릅니다."
  );
}

/**
 * 겸용주택 주택분 — 위 판례 고지와 같은 조건을 겸용 입력(연 단위 거주)으로 본다. 상속 전 동거 통산분은 `table2ResidencePeriodYears − residencePeriodYears`,
 * 증여 전 거주는 통산 성립분이다(이월과세 A 통산분은 표2에 이미 들어가 빼낸다).
 */
export function mixedUseTable2PrecedentNotice(
  asset: Pick<MixedUseAssetInput, "residencePeriodYears" | "table2ResidencePeriodYears" | "giftHouseholdBasis" | "winWinRentalHouse" | "buildingAcquisitionDate">,
  housingPart: { longTermDeductionTable: 1 | 2; longTermDeductionRate: number },
  isHighValuePartial: boolean,
  transferDate: Date,
): string | undefined {
  const ownMonths = asset.residencePeriodYears * 12;
  const inheritedPriorMonths = ((asset.table2ResidencePeriodYears ?? asset.residencePeriodYears) - asset.residencePeriodYears) * 12;
  const subjectMonths = table2SubjectResidenceMonths(ownMonths, asset.giftHouseholdBasis);
  const pre = inheritedPriorMonths + giftHouseholdPriorResidenceMonths(asset.giftHouseholdBasis) - (subjectMonths - ownMonths);
  if (pre <= 0 || !isHighValuePartial || housingPart.longTermDeductionTable !== 1 || housingPart.longTermDeductionRate <= 0) return undefined;
  const opens = meetsTable2ResidenceRequirement(
    { winWinRentalHouse: asset.winWinRentalHouse, transferDate, acquisitionDate: asset.buildingAcquisitionDate },
    Math.floor((subjectMonths + pre) / 12),
  );
  return opens ? table2PrecedentNoticeText(inheritedPriorMonths > 0 ? "상속개시" : "증여") : undefined;
}
