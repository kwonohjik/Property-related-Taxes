/**
 * §155⑳ 거주주택 **보유 2년** × §154① 단서 (계획서 `docs/00-pm/rental-residence-holding-proviso.plan.md` Q-R1·Q-R2 (a)).
 *
 * ⑳ 본문은 거주주택을 「국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용」한다 — 그 §154① 본문의 보유 2년은
 * 단서 1호·2호가목·3호가 「보유기간 및 거주기간의 제한을 받지 아니」하게 한다. ⑳1호 거주 2년은 ⑳ 자체 요건이라 면제하지 않는다
 * (부동산납세과-67). 거주 2년을 본인 기간만으로 채우면 보유 2년도 채워지므로, 결론이 바뀌는 것은 증여·상속 전 동일세대 거주를
 * 통산해 거주를 채우고 보유(통산하지 않는다 — 사용자 결정 2026-10-19·10-26)는 2년 미만인 경우다.
 *
 * 🔑 판정(`judgeRentalHousingEligibility`)과 세액(`runRentalHousingExceptionStep`의 `residenceHoldYears` 인자) 두 곳이
 *    **이 함수 하나**로 요건 보유 연수를 얻는다 — 한쪽만 고치면 판정 메뉴와 계산기가 갈린다(계획서 §4.1 실측).
 *    장기보유특별공제 보유 연수에는 쓰지 않는다.
 */
import { calculateHoldingPeriod } from "../tax-utils";
import { RENTAL_RESIDENCE_PROVISO_REASONS } from "../legal-codes/transfer";
import { TRANSFER_RENTAL_HOUSING } from "../legal-codes/transfer-house";
import { PROVISO_LABEL, resolveExemptionProviso } from "../transfer-tax-exemption-holding";
import type { TransferTaxInput } from "../types/transfer.types";

type ProvisoReason = NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>["reason"];

/**
 * 보유 2년 미달을 단서가 메운 경우의 사유 — 아니면 `undefined`.
 * §154⑩ 단독 경로(B · 임대주택 0호)는 별도 제도라 넣지 않는다 — 그 경로는 `phrp154_10ProvisoWaiver`가 판정 맥락으로 넘긴다.
 */
export function rentalResidenceDecisiveProviso(input: TransferTaxInput): ProvisoReason | undefined {
  const rhe = input.rentalHousingException;
  if (rhe?.applyException !== true) return undefined;
  if (rhe.scenario === "B" && rhe.rentalUnits.length === 0) return undefined;
  const reason = input.oneHouseExemptionProviso?.reason;
  if (!reason || !RENTAL_RESIDENCE_PROVISO_REASONS.has(reason)) return undefined;
  if (calculateHoldingPeriod(input.acquisitionDate, input.transferDate).years >= 2) return undefined;
  return resolveExemptionProviso(input) === "both" ? reason : undefined;
}

/** ⑳ 요건 판정에 넘길 거주주택 보유 연수 — 단서가 보유 제한을 풀면 2년으로 본다. */
export function rentalResidenceRequirementHoldYears(input: TransferTaxInput): number {
  const years = calculateHoldingPeriod(input.acquisitionDate, input.transferDate).years;
  return rentalResidenceDecisiveProviso(input) ? Math.max(years, 2) : years;
}

/** 근거 표기 — 「§154① 단서 3호 부득이」. 단서가 결론을 가르지 않으면 `undefined`. */
export function rentalResidenceProvisoLabel(input: TransferTaxInput): string | undefined {
  const reason = rentalResidenceDecisiveProviso(input);
  return reason ? `§154① 단서 ${PROVISO_LABEL[reason]}` : undefined;
}

/** Q-R2 (a) — 단서로 특례가 선 경우의 확인 필요 고지(정면 해석례 없음). 결론은 바꾸지 않는다. */
export function rentalResidenceProvisoNotice(input: TransferTaxInput): string | undefined {
  const label = rentalResidenceProvisoLabel(input);
  if (!label) return undefined;
  return (
    `거주주택 보유기간이 2년 미만이지만 ${label} 사유로 보유기간의 제한을 적용하지 않고 장기임대주택 보유자 거주주택 특례` +
    `(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})를 적용했습니다. 이 특례의 거주주택에 §154① 단서를 적용한 정면 해석례가 없어 확인이 필요합니다` +
    "(거주기간 2년은 단서로 면제되지 않습니다 — 부동산납세과-67)."
  );
}

/**
 * §154⑩ 단독 경로(B · 임대주택 0호)의 §154① 단서 — 성립하면 근거 표기와 면제 범위(`resolveExemptionProviso`)를 돌려준다.
 * §154⑩은 「1주택을 보유한 것으로 보아 제1항을 적용」하므로 단서 사유를 ⑳처럼 거르지 않는다(사용자 결정 2026-10-26 V-R3 (a) ·
 * 계획서 §10). 어느 요건을 실제로 푸는지는 `checkPhrp154_10Eligibility`가 정한다.
 */
export function phrp154_10ProvisoWaiver(
  input: TransferTaxInput,
): { label: string; kind: "both" | "residence_only" } | undefined {
  const rhe = input.rentalHousingException;
  if (rhe?.applyException !== true || rhe.scenario !== "B" || rhe.rentalUnits.length > 0) return undefined;
  const reason = input.oneHouseExemptionProviso?.reason;
  const kind = reason ? resolveExemptionProviso(input) : null;
  return reason && kind ? { label: `§154① 단서 ${PROVISO_LABEL[reason]}`, kind } : undefined;
}
