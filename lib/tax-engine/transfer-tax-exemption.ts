/**
 * 1세대1주택 비과세 판단 (소득세법 §89①3호·시행령 §154)
 *
 * transfer-tax-helpers.ts H-2 블록을 800줄 정책 준수를 위해 분리.
 * 하위 호환: transfer-tax-helpers.ts 가 checkExemption·meetsOneHouseHoldingResidence·
 * resolveExemptionProviso 를 재수출하므로 기존 import 경로 무변경.
 *
 *   E-3: 일시적 2주택 비과세 (부칙 양도일 분기 포함)
 *   E-4: §154① 보유·거주 요건 (단서 각호 면제 포함)
 *   E-1: 전액 비과세 (양도가 12억 이하) / E-2: 고가주택 부분과세
 */

import { addYears, format } from "date-fns";
import { calculateHoldingPeriod } from "./tax-utils";
import { EXEMPTION_PROVISO_CONST } from "./legal-codes";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import type { TransferTaxInput } from "./types/transfer.types";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";

interface ExemptionResult {
  isExempt: boolean;
  isPartialExempt: boolean;
  exemptReason?: string;
}

/** §154① 단서 각호 면제 범위 라벨 (exemptReason 표시용) — 모듈 스코프 (per-call 재생성 금지) */
const PROVISO_LABEL: Record<
  NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>["reason"],
  string
> = {
  rental_5yr_residence: "1호 임대주택 거주5년",
  expropriation: "2호가 수용",
  overseas_migration: "2호나 해외이주",
  overseas_residence: "2호다 국외거주",
  unavoidable: "3호 부득이",
  pre_designation_contract: "5호 공고전계약",
};

/**
 * §154① 단서 각호 — 보유·거주 요건 면제 범위 판정 (소득세법 시행령 §154 ① 단서).
 * 반환: "both"(보유+거주 면제 — 1·2·3호) / "residence_only"(거주만 — 5호) / null(미선택 또는 요건 미충족).
 * 시한 상수: EXEMPTION_PROVISO_CONST (가목 5년·나다목 2년·1호 거주5년·3호 거주1년).
 */
export function resolveExemptionProviso(
  input: TransferTaxInput,
): "both" | "residence_only" | null {
  const p = input.oneHouseExemptionProviso;
  if (!p) return null;
  const C = EXEMPTION_PROVISO_CONST;
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  switch (p.reason) {
    case "expropriation":
      // 2호 가목: 사업인정 고시일 전 취득 + 양도일·수용일부터 5년 이내
      if (p.businessApprovalDate && input.acquisitionDate >= p.businessApprovalDate) return null;
      return input.transferDate <= addYears(p.expropriationDate ?? input.transferDate, C.EXPROPRIATION_TRANSFER_YEARS)
        ? "both"
        : null;
    case "overseas_migration":
    case "overseas_residence":
      // 2호 나·다목: 출국일부터 2년 이내
      return p.departureDate && input.transferDate <= addYears(p.departureDate, C.OVERSEAS_TRANSFER_YEARS)
        ? "both"
        : null;
    case "unavoidable":
      // 3호: 1년 이상 거주
      return residenceYears >= C.UNAVOIDABLE_RESIDENCE_YEARS ? "both" : null;
    case "rental_5yr_residence":
      // 1호: 세대전원 거주 5년 이상
      return residenceYears >= C.RENTAL_RESIDENCE_YEARS ? "both" : null;
    case "pre_designation_contract":
      // 5호: 거주만 면제 (계약금일 무주택은 UI validation으로 담보)
      return "residence_only";
    default:
      return null;
  }
}

/**
 * 취득 당시 조정대상지역 여부 — 거주요건(§154① 본문) 판정 입력.
 *
 * regionCode(법정동코드)가 있으면 취득일 기준 isRegulatedByBjdCode로 정밀 판정
 * (읍·면·동/택지지구 예외까지 반영). 없으면 wasRegulatedAtAcquisition boolean fallback (회귀 0 보장).
 * 다주택 중과(multi-house-surcharge: 양도일 기준)와 대칭 — 여기서는 취득일 기준.
 */
export function resolveWasRegulatedAtAcquisition(input: TransferTaxInput): boolean {
  if (input.regionCode) {
    return isRegulatedByBjdCode(
      input.regionCode,
      format(input.acquisitionDate, "yyyy-MM-dd"),
    ).isRegulated;
  }
  return input.wasRegulatedAtAcquisition === true;
}

/**
 * §154① 보유·거주 요건 (단서 각호 면제 포함).
 * 본문: 보유 2년(rule.minHoldingYears) + 취득 당시 조정대상지역이면 거주 2년(rule.regulatedAreaMinResidenceYears).
 * 단서: resolveExemptionProviso "both"=보유+거주 면제 / "residence_only"=거주만 면제 (소령 §154① 단서).
 * §155⑤(혼인 합가) 1세대1주택 의제 중과배제(§167의10①15호) 게이트에 재사용 — checkExemption과 단일 진실.
 */
export function meetsOneHouseHoldingResidence(
  input: TransferTaxInput,
  rule: OneHouseSpecialRulesData["one_house_exemption"],
): boolean {
  const proviso = resolveExemptionProviso(input);
  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const meetsHolding = proviso === "both" || holding.years >= rule.minHoldingYears;
  // §154① 거주요건 경과규정 — 2017.8.3(prePolicyDate) 이전 취득은 조정지역이라도 거주요건 면제.
  // 이월과세 시 acquisitionDate는 증여자(보유 기산)로 교체되므로(§95④), 경과규정 판정은
  // 수증자 실제 취득일(residenceTransitionAcquisitionDate) 사용 — §97의2는 필요경비 계산 특례에 한정.
  const residenceTransitionDate =
    input.residenceTransitionAcquisitionDate ?? input.acquisitionDate;
  const isPrePolicy = residenceTransitionDate < new Date(rule.prePolicyDate);
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  // 취득 당시 조정대상지역 — regionCode 있으면 취득일 기준 정밀 판정, 없으면 boolean fallback
  const wasRegulated = resolveWasRegulatedAtAcquisition(input);
  const meetsResidence =
    proviso === "both" ||
    proviso === "residence_only" ||
    !wasRegulated ||
    // §154① 부칙(대통령령 제28293호) 적용례 — prePolicy 취득은 조정지역이라도 거주요건 면제
    (rule.prePolicyExemptResidence && isPrePolicy) ||
    residenceYears >= rule.regulatedAreaMinResidenceYears;
  return meetsHolding && meetsResidence;
}

export function checkExemption(
  input: TransferTaxInput,
  oneHouseRules: OneHouseSpecialRulesData,
): ExemptionResult {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  if (!input.isOneHousehold || input.propertyType !== "housing") {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-3: 일시적 2주택
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const { previousAcquisitionDate, newAcquisitionDate } = input.temporaryTwoHouse;

    const prevHolding = calculateHoldingPeriod(previousAcquisitionDate, input.transferDate);
    if (prevHolding.years < rule.minHoldingYears) {
      return { isExempt: false, isPartialExempt: false };
    }

    let deadlineYears = twoHouseRule.disposalDeadlineYears;
    if (input.isRegulatedArea) {
      // 부칙: 양도일이 완화 시행일(2022-05-10) 이후이면 완화 기한 적용
      const relaxDate = twoHouseRule.regulatedAreaRelaxDate
        ? new Date(twoHouseRule.regulatedAreaRelaxDate)
        : null;
      if (relaxDate && input.transferDate >= relaxDate) {
        deadlineYears = twoHouseRule.regulatedAreaRelaxDeadlineYears ?? twoHouseRule.regulatedAreaDeadlineYears;
      } else {
        deadlineYears = twoHouseRule.regulatedAreaDeadlineYears;
      }
    }
    const deadline = addYears(newAcquisitionDate, deadlineYears);
    if (input.transferDate <= deadline) {
      return { isExempt: true, isPartialExempt: false, exemptReason: "일시적 2주택 비과세" };
    }
  }

  if (input.householdHousingCount !== 1) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-4: §154① 보유·거주 요건 (2017.8.3 이전 경과규정 포함) — meetsOneHouseHoldingResidence로 단일화
  if (!meetsOneHouseHoldingResidence(input, rule)) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-1: 전액 비과세 (양도가 12억 이하)
  // 우선순위:
  //   1) burdenedGiftDenominator (부담부증여 — D-0-2 해석 B: 분모 = giftValuation C)
  //   2) totalPropertyTransferPrice (지분 모드 — 총 물건가)
  //   3) transferPrice (단독 모드 fallback)
  const exemptionPriceCheck =
    input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
  // §154① 단서 각호 적용 시 비과세 사유에 호 라벨 부가 (result detail·PDF·step formula 자동 노출)
  const provisoReason = input.oneHouseExemptionProviso?.reason;
  const provisoLabel = provisoReason ? ` (§154① 단서 ${PROVISO_LABEL[provisoReason]})` : "";
  if (exemptionPriceCheck <= rule.maxExemptPrice) {
    return { isExempt: true, isPartialExempt: false, exemptReason: `1세대1주택 비과세${provisoLabel}` };
  }

  // E-2: 부분과세 (양도가 12억 초과)
  return { isExempt: false, isPartialExempt: true, exemptReason: `1세대1주택 고가주택${provisoLabel}` };
}
