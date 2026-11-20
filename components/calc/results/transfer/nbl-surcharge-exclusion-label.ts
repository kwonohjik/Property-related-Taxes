import type { NblSurchargeExclusionReason } from "@/lib/tax-engine/types/transfer-result.types";

/**
 * 비사업용 토지 +10%p 중과배제(`nblSurchargeExcluded`) 표시 문구 — 사유에 따라 근거 조문이 다르다.
 *
 * 사유가 없는 결과(= 사유 필드가 생기기 전 저장 이력)는 **위기취득**으로 읽는다. 그때는 그 사유뿐이었다.
 */
export function nblExclusionReasonOf(by: NblSurchargeExclusionReason | undefined): NblSurchargeExclusionReason {
  return by ?? "crisis_acquisition";
}

/**
 * 장기보유특별공제 문구 — 엔진 echo(`judgment.surcharge.longTermDeductionExcluded`)로 가른다.
 * NBL2611-V5-H: 2016.1.1. 전 양도분은 당시 「소득세법」 §95②가 비사업용 토지를 제외해 장특이 0이다(`isNblLthdExclusionEra`).
 */
export function nblLthdBannerPhrase(longTermDeductionExcluded: boolean | undefined, nonBusinessAreaRatio?: number): string {
  if (!longTermDeductionExcluded) return "장기보유특별공제 표1 적용";
  // NBL2611-V5-G1 — 한 필지 중 일부만 비사업용이면 배제는 비사업용 파트에만 걸리고 그 밖의 파트는 표1을 받는다.
  return nonBusinessAreaRatio !== undefined && nonBusinessAreaRatio > 0 && nonBusinessAreaRatio < 1
    ? "비사업용 파트의 장기보유특별공제 배제 — 양도일이 2016.1.1. 전이라 당시 「소득세법」 §95②가 비사업용 토지를 제외했습니다(그 밖의 파트는 표1 적용)"
    : "장기보유특별공제 배제 — 양도일이 2016.1.1. 전이라 당시 「소득세법」 §95②가 비사업용 토지를 제외했습니다";
}

/** 비사업용 토지 판정 카드 상단 배너 */
export function nblExclusionBannerText(
  by: NblSurchargeExclusionReason | undefined,
  longTermDeductionExcluded?: boolean,
  nonBusinessAreaRatio?: number,
): string {
  return nblExclusionReasonOf(by) === "transfer_deferral"
    ? "비사업용 토지 — 양도일이 중과 유예 기간(2009.3.16.~2015.12.31.)이고 지정지역이 아니어서 §104⑥ · 법률 제12169호 부칙 제20조에 따라 " +
        "§104①8호 세율(+10%p)을 적용하지 않고 §104①1호 기본세율을 적용합니다. 장기보유특별공제는 §95②에 따로 정해집니다."
    : `비사업용 토지 — 부칙 §9270호 §14① 취득기간(2009.3.16~2012.12.31) 세율 배제로 기본세율 적용(+10%p 미적용). ${nblLthdBannerPhrase(longTermDeductionExcluded, nonBusinessAreaRatio)}.`;
}

/** 다건 자산 행 보조 배지 */
export function nblExclusionBadgeText(by: NblSurchargeExclusionReason | undefined): string {
  return nblExclusionReasonOf(by) === "transfer_deferral" ? "양도일 유예(§104⑥)" : "부칙 §14① 중과배제";
}
