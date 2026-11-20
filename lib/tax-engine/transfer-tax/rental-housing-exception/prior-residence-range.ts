/**
 * §155⑳ 후단 직전거주주택 양도일의 범위 — 「그 보유기간 중에 양도한 다른 거주주택」(소득세법 시행령 §155⑳ 후단 · §154⑩2호).
 *
 * 2026-11 리뷰 D-61 · 결정 Q-25: 하한은 **본인 취득일**, 상한은 이 주택의 양도일(같은 날은 §154⑨ 양도 순서 선택이라 막지 않는다).
 * 동일세대 상속·증여 등으로 보유기간을 통산하는 주택은 본인 취득일 전이라도 통산 보유기간 안이면 막지 않고 확인 필요를 알린다.
 * 엔진(`checkEligibility` — B 미적용 + 사유)·⑧(`validateRentalHousingException`)·⑫(`addPropertyRefines` — 양도일 뒤만)가 이 술어를 쓴다.
 */
import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";

export type PriorResidenceRange = "after_transfer" | "before_acquisition" | "before_acquisition_consolidated";

const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function priorResidenceTransferDateRange(
  prior: Date,
  acquisition: Date,
  transfer: Date,
  /** 통산 보유 기산일(엔진 `resolveExemptionHoldingStartDate`) — 본인 취득일보다 이르면 그 사이 날짜는 막지 않고 확인 필요다. */
  holdingStart?: Date,
): PriorResidenceRange | null {
  if (day(prior) > day(transfer)) return "after_transfer";
  if (day(prior) >= day(acquisition)) return null;
  if (holdingStart && day(holdingStart) < day(acquisition) && day(prior) >= day(holdingStart)) return "before_acquisition_consolidated";
  return "before_acquisition";
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ART = TRANSFER_RENTAL_HOUSING.PIT_RD_155_20;

/** 엔진 사유·고지 문장 — B 미적용 사유(막는 두 경우)와 확인 필요 고지(통산 경우). */
export function priorResidenceRangeMessage(kind: PriorResidenceRange, prior: Date, acquisition: Date, transfer: Date): string {
  if (kind === "after_transfer") {
    return `직전거주주택 양도일(${ymd(prior)})이 이 주택의 양도일(${ymd(transfer)}) 뒤입니다 — ${ART} 후단은 「그 보유기간 중에 양도한 다른 거주주택」만 직전거주주택으로 보므로 직전거주주택보유주택 계산(B)을 적용하지 않았습니다.`;
  }
  if (kind === "before_acquisition") {
    return `직전거주주택 양도일(${ymd(prior)})이 이 주택의 취득일(${ymd(acquisition)}) 전입니다 — ${ART} 후단은 「그 보유기간 중에 양도한 다른 거주주택」만 직전거주주택으로 보므로 직전거주주택보유주택 계산(B)을 적용하지 않았습니다.`;
  }
  return (
    `직전거주주택 양도일(${ymd(prior)})이 이 주택의 취득일(${ymd(acquisition)}) 전이지만 동일세대 통산 보유기간 안이라 직전거주주택으로 보았습니다 — ` +
    `${ART} 후단 「그 보유기간 중」에 통산 보유기간이 포함되는지는 정면 해석을 확인하지 못해 확인이 필요합니다.`
  );
}
