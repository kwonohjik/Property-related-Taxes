import { format } from "date-fns";
import { judgeNblRateDeferral, NBL_RATE_DEFERRAL_FROM, NBL_RATE_DEFERRAL_TO } from "./data/nbl-rate-deferral-era";
import type { TransferTaxInput } from "./types/transfer.types";

const dotted = (ymd: string): string => `${ymd.split("-").map(Number).join(".")}.`; // 2009-03-16 → 2009.3.16.

/**
 * 비사업용 토지 8호 중과 유예 기간(양도 2009.3.16.~2015.12.31.)인데 **지정지역 여부를 선언하지 않은** 경우의 «확인 필요» 고지.
 *
 * 모르는 사실에 기대는 요건은 성립하지 않은 것으로 계산하므로(중과 유지) 결론을 가르는 이 경우에만 알린다.
 * 지정지역이 아니라고 확인되면 §104①8호 중과가 적용되지 않고 §104①1호 세율(보유 2년 미만이면 2·3호)이 적용된다.
 */
export function nblDeferralAreaNotice(
  input: Pick<TransferTaxInput, "isNonBusinessLand" | "transferDate" | "isDesignatedArea">,
): string | undefined {
  if (!input.isNonBusinessLand) return undefined;
  if (judgeNblRateDeferral({ transferDate: input.transferDate, isDesignatedArea: input.isDesignatedArea }) !== "area_unconfirmed") {
    return undefined;
  }
  return (
    `양도일(${format(input.transferDate, "yyyy.MM.dd")})이 비사업용 토지 중과 유예 기간(${dotted(NBL_RATE_DEFERRAL_FROM)}~${dotted(NBL_RATE_DEFERRAL_TO)})입니다. ` +
    `이 토지가 양도 당시 「소득세법」 제104조의2제2항에 따른 지정지역에 있지 않으면 같은 법 제104조제1항제8호 세율(기본세율 +10%p)을 적용하지 않고 ` +
    `제104조제1항제1호 세율(보유기간 2년 미만이면 제2호·제3호 세율)을 적용합니다(같은 법 제104조제6항 · 법률 제12169호 부칙 제20조). ` +
    `지정지역 여부를 선언하지 않아 8호 세율로 계산했습니다 — 지정지역 여부를 확인해 선언하면 세액이 달라질 수 있습니다(확인 필요).`
  );
}
