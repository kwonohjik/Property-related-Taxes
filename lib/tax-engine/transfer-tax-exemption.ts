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
import { EXEMPTION_PROVISO_CONST, TEMP_TWO_HOUSE_PROVISO_REASONS } from "./legal-codes";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import type { TransferTaxInput } from "./types/transfer.types";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";

// §156의2⑤ 대체주택 특례 — 신축주택 완성 후 대체주택 양도 기한.
// 2023.01.12 이후 양도분부터 3년(구 2년). 소득세법 시행령 부칙(대통령령 제33267호).
const REPLACEMENT_HOUSE_3YR_TRANSFER_START = new Date("2023-01-12");
const REPLACEMENT_HOUSE_DEADLINE_YEARS_NEW = 3;
const REPLACEMENT_HOUSE_DEADLINE_YEARS_OLD = 2;

/**
 * 거주요건 판정 입력 — TransferTaxInput의 부분집합. UI(Step4 안내 메시지)와 엔진이 공용.
 * resolveExemptionProviso·resolveWasRegulatedAtAcquisition·meetsOneHouseResidenceRequirement 입력.
 */
export type ResidenceReqInput = Pick<
  TransferTaxInput,
  | "acquisitionDate"
  | "transferDate"
  | "residencePeriodMonths"
  | "oneHouseExemptionProviso"
  | "regionCode"
  | "wasRegulatedAtAcquisition"
  | "residenceTransitionAcquisitionDate"
>;

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
  input: ResidenceReqInput,
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
export function resolveWasRegulatedAtAcquisition(input: ResidenceReqInput): boolean {
  if (input.regionCode) {
    return isRegulatedByBjdCode(
      input.regionCode,
      format(input.acquisitionDate, "yyyy-MM-dd"),
    ).isRegulated;
  }
  return input.wasRegulatedAtAcquisition === true;
}

/**
 * §154① 본문 거주요건 단독 판정 (보유요건 제외) — Step4 거주요건 안내 메시지와 엔진 공용(단일 진실).
 * true = 거주요건 충족 또는 면제. 단서면제(both·residence_only)·취득시 비조정·
 * 2017.8.3 이전 취득(경과규정)·거주 2년 이상 중 하나라도 해당하면 충족.
 */
export function meetsOneHouseResidenceRequirement(
  input: ResidenceReqInput,
  rule: Pick<
    OneHouseSpecialRulesData["one_house_exemption"],
    "regulatedAreaMinResidenceYears" | "prePolicyDate" | "prePolicyExemptResidence"
  >,
): boolean {
  const proviso = resolveExemptionProviso(input);
  // §154① 거주요건 경과규정 — 2017.8.3(prePolicyDate) 이전 취득은 조정지역이라도 거주요건 면제.
  // 이월과세 시 acquisitionDate는 증여자(보유 기산)로 교체되므로(§95④), 경과규정 판정은
  // 수증자 실제 취득일(residenceTransitionAcquisitionDate) 사용 — §97의2는 필요경비 계산 특례에 한정.
  const residenceTransitionDate =
    input.residenceTransitionAcquisitionDate ?? input.acquisitionDate;
  const isPrePolicy = residenceTransitionDate < new Date(rule.prePolicyDate);
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  // 취득 당시 조정대상지역 — regionCode 있으면 취득일 기준 정밀 판정, 없으면 boolean fallback
  const wasRegulated = resolveWasRegulatedAtAcquisition(input);
  return (
    proviso === "both" ||
    proviso === "residence_only" ||
    !wasRegulated ||
    // §154① 부칙(대통령령 제28293호) 적용례 — prePolicy 취득은 조정지역이라도 거주요건 면제
    (rule.prePolicyExemptResidence && isPrePolicy) ||
    residenceYears >= rule.regulatedAreaMinResidenceYears
  );
}

/**
 * §154① 보유·거주 요건 (단서 각호 면제 포함).
 * 본문: 보유 2년(rule.minHoldingYears) + 취득 당시 조정대상지역이면 거주 2년(거주요건은 위 헬퍼 재사용).
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
  return meetsHolding && meetsOneHouseResidenceRequirement(input, rule);
}

export function checkExemption(
  input: TransferTaxInput,
  oneHouseRules: OneHouseSpecialRulesData,
): ExemptionResult {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  if (!input.isOneHousehold || input.propertyType !== "housing") {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-5: §156의2⑤ 대체주택 특례 — 재개발·재건축 시행기간 중 거주 목적 대체주택.
  // 신축주택+대체주택 2주택이나 대체주택 양도를 1세대1주택으로 의제(§154① 보유·거주 요건 면제).
  // 요건 미충족 시 fall through(일반 과세). 사후관리(§156의2⑬) 경고는 결과 warnings에서 별도 처리.
  if (input.replacementHouse) {
    const rh = input.replacementHouse;
    // ① 사업시행인가일 이후 대체주택 취득 + 1년 이상 거주
    const meetsAcquisition =
      input.acquisitionDate >= rh.businessApprovalDate &&
      Math.floor(rh.replacementResidenceMonths / 12) >= 1;
    // ④ 신축주택 완성 전 또는 완성 후 3년(2023.01.12 이후 양도분; 구 2년)내 대체주택 양도
    const deadlineYears =
      input.transferDate >= REPLACEMENT_HOUSE_3YR_TRANSFER_START
        ? REPLACEMENT_HOUSE_DEADLINE_YEARS_NEW
        : REPLACEMENT_HOUSE_DEADLINE_YEARS_OLD;
    const meetsTransferTiming =
      input.transferDate < rh.completionDate ||
      input.transferDate <= addYears(rh.completionDate, deadlineYears);
    // ③ 신축주택 1년 이상 거주 (전제 — 자기선언, 미충족 시 §156의2⑬ 추징)
    const meetsNewHouseResidence = rh.willResideNewHouse === true;

    if (meetsAcquisition && meetsTransferTiming && meetsNewHouseResidence) {
      const priceCheck =
        input.burdenedGiftDenominator ??
        input.totalPropertyTransferPrice ??
        input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return {
          isExempt: true,
          isPartialExempt: false,
          exemptReason: "대체주택 특례 비과세 (§156의2⑤)",
        };
      }
      return {
        isExempt: false,
        isPartialExempt: true,
        exemptReason: "대체주택 특례 고가주택 (§156의2⑤)",
      };
    }
  }

  // E-3: 일시적 2주택
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const { previousAcquisitionDate, newAcquisitionDate } = input.temporaryTwoHouse;

    // §155①→§154①1·2가·3호 준용: 종전주택이 §154① 단서(both, 화이트리스트) 해당 시 보유 2년 요건 면제.
    // 나·다목(출국일 1주택)·5호(무주택·residence_only)는 일시적 2주택과 양립 불가라 화이트리스트로 제외.
    // resolveExemptionProviso는 input.acquisitionDate(=종전주택 취득일, previousAcquisitionDate와 동일 의도) 기준.
    const provisoReason = input.oneHouseExemptionProviso?.reason;
    const provisoRelaxesHolding =
      resolveExemptionProviso(input) === "both" &&
      provisoReason !== undefined &&
      TEMP_TWO_HOUSE_PROVISO_REASONS.has(provisoReason);

    const prevHolding = calculateHoldingPeriod(previousAcquisitionDate, input.transferDate);
    if (!provisoRelaxesHolding && prevHolding.years < rule.minHoldingYears) {
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
      const provisoLabel = provisoRelaxesHolding
        ? ` (§154① 단서 ${PROVISO_LABEL[provisoReason!]})`
        : "";
      return { isExempt: true, isPartialExempt: false, exemptReason: `일시적 2주택 비과세${provisoLabel}` };
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
