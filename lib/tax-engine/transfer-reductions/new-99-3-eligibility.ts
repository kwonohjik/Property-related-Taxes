/**
 * 조특법 §99의3 적용 배제 검증(우선순위 순) — `new-99-3.ts`에서 분리(800줄 정책, 리뷰 L1 2차).
 * 평가기 `evaluateNew993`만 부른다. 판정 순서·사유 문구는 분리 전과 같다.
 */
import { NEW_99_3_ADDENDA_6762, NEW_HOUSING_SUB_ARTICLE, TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { LAND_ONLY_OWNER_CODE, landOnlyOwnerMessage } from "./new-99-land-only-owner";
import { judgePriorLuxuryHouse, isPriorLuxuryStandardDate } from "./new-99-luxury-house";
import { evaluateNew99AcquisitionGate } from "./new-99-acquisition-cause";
import { PRIOR_ADVANCED_HOUSE_STANDARD_DATE, isHighValueHouseAtDate, type New993Era } from "./new-99-3-era";
import { isHighValueHouseUnder993, resolveNew99BaseDate } from "./new-99-3-base-date";
import type { New993IneligibleReason, New993Input } from "./new-99-3";

// UTC 자정 파싱 — API 경유 입력(new Date("YYYY-MM-DD") = UTC midnight)과 동일 기준.
const D = (s: string) => new Date(s);

const PERIOD_START = D("2001-05-23");
const PERIOD_END = D("2003-06-30");

// ============================================================================
// 헬퍼: 적용 배제 검증 (우선순위 순)
// ============================================================================

export function checkNew993Ineligibility(input: New993Input, era: New993Era, warnings: string[]): New993IneligibleReason[] {
  const reasons: New993IneligibleReason[] = [];
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.NEW_99_3;

  // 0. 소유자 분리(토지만 본인) — 신축주택(건물)을 취득한 자가 아니다 (NH-08). 다른 사유보다 먼저 낸다.
  if (input.isLandOnlyOwner === true) {
    reasons.push({ code: LAND_ONLY_OWNER_CODE, message: landOnlyOwnerMessage("new_99_3"), legalBasis });
    return reasons;
  }

  // 1. 거주자 아님
  if (!input.isResident) {
    reasons.push({
      code: "NOT_RESIDENT",
      message: "거주자가 아닌 자에게는 §99의3이 적용되지 않습니다 (법 §99의3① 본문 「거주자(주택건설사업자는 제외한다)가」)",
      legalBasis,
    });
    return reasons; // 즉시 반환 (다른 사유는 무의미)
  }

  // 2. 본인이 주택건설사업자
  if (input.isHousingConstructionBusiness) {
    reasons.push({
      code: "HOUSING_CONSTRUCTION_BUSINESS",
      message: "본인이 주택건설사업자인 경우 §99의3이 적용되지 않습니다 (조문 본문 괄호)",
      legalBasis,
    });
    return reasons;
  }

  // 2-1. 취득 원인 — 상속·증여(지분 포함)·분양권 승계·인가일 뒤 승계조합원은 불성립 (NH-17 · NH-40 · NH-16, 공용 leaf)
  const causeGate = evaluateNew99AcquisitionGate({
    article: "new_99_3",
    acquisitionType: input.acquisitionType,
    acquisitionCause: input.acquisitionCause,
    firstContract: input.firstContract,
    isRedevSuccessorMember: input.isRedevSuccessorMember,
  });
  if (causeGate) {
    reasons.push(causeGate);
    return reasons;
  }

  // 3. 가격 급등 지역 — 2003.1.1. 이후 계약·승인분(개정규정)만. 종전 규정 적용분(부칙 §29①·②)은 지역 제외가 없다 (NH-01).
  if (input.region === "speculation" && era.priorRuleBasis === undefined) {
    reasons.push({
      code: "SPECULATION_AREA",
      message: "가격 급등 지역(서울·과천·5대 신도시) 내 신축주택은 §99의3이 적용되지 않습니다 (2003.1.1. 이후 계약·사용승인분 — 개정규정)",
      legalBasis,
    });
    return reasons;
  }

  // 4. 신축주택취득기간 외
  const periodTarget = resolveNew99BaseDate(
    input.acquisitionType,
    input.contractDate,
    input.usageApprovalDate,
    input.acquisitionDate,
  );
  if (periodTarget < PERIOD_START || periodTarget > PERIOD_END) {
    const targetLabel =
      input.acquisitionType === "from_builder" ? "매매계약일" : "사용승인일";
    reasons.push({
      code: "OUT_OF_ACQUISITION_PERIOD",
      message: `신축주택취득기간(2001.5.23~2003.6.30) 외 — 기준일(${targetLabel})이 시한 외입니다`,
      legalBasis,
    });
    return reasons;
  }

  // 5. 1호 단서: 매매계약일 입주사실 있는 주택
  if (input.acquisitionType === "from_builder" && input.hasOccupancyAtContract) {
    reasons.push({
      code: "OCCUPANCY_AT_CONTRACT",
      // 「다른 자가」는 법률 제6538호(2002.1.1. 시행 — 그 뒤 양도분부터, 부칙 §2②)로 삭제됐다 — 현행 법문은 입주 주체를 한정하지 않는다 (리뷰 NH-35).
      message: "매매계약일 현재 입주한 사실이 있는 주택은 §99의3 ① 1호 단서로 적용 배제됩니다",
      legalBasis,
    });
    return reasons;
  }

  // 5-a. 재계약·대체취득 배제 (조특령 §99의3④) — 단, 조특칙 §44의4 카브백이 있으면 유지.
  //   조특령 §99의3④는 «법 제99조의3제1항제1호»의 사유다 — 2호(자기건설)에 남은 선언으로 배제하지 않는다 (리뷰 NH-57).
  if (
    input.acquisitionType === "from_builder" &&
    input.isRecontractExcluded === true &&
    input.recontractUnavoidableCause !== true
  ) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message:
        "2001.5.23 전 분양계약을 해제하고 본인·배우자(직계존비속·형제자매 포함)가 당초 주택을 다시 분양받거나 대체하여 다른 주택을 분양받아 취득한 주택은 적용 배제됩니다 (조특령 §99의3④).",
      legalBasis: NEW_HOUSING_SUB_ARTICLE.NEW_99_3_RECONTRACT,
    });
    return reasons;
  }

  // 5-b. 재개발·재건축 변형 — 종전주택 기준시가 필수 (자동 안분 fallback 금지). §99 선례와 동일.
  if (
    input.isRedevelopedNewHouse === true &&
    (input.previousHouseStdPriceAtAcquisition === undefined ||
      input.previousHouseStdPriceAtAcquisition <= 0)
  ) {
    reasons.push({
      code: "MISSING_PREVIOUS_STD_PRICE",
      message:
        "재개발·재건축 신축주택의 안분에는 종전주택 취득 당시 기준시가가 필요합니다 (조특령 §99의3② 1호 단서·2호 괄호).",
      legalBasis: NEW_HOUSING_SUB_ARTICLE.NEW_99_3_INCOME,
    });
    return reasons;
  }

  // 6. 고가주택 (단서)
  // 기간 게이트(:위)와 **같은 축**이어야 한다 — 두 판정이 갈리면 임계가 뒤집힌다 (D3-09).
  const hvBaseDate = resolveNew99BaseDate(
    input.acquisitionType,
    input.contractDate,
    input.usageApprovalDate,
    input.acquisitionDate,
  );
  // 종전 규정 적용분 — §29① 계약·승인일 당시 고급주택 기준 / §29② 종전 고급주택 기준(재산세제과-96: 2002.12.31. 시행 소령 §156).
  // 개정규정 적용분 — 양도 당시 소득세법 §89①3호 고가주택(재산세과-3466). 기준일 축 6억을 양도 후 20년 넘게 끌고 가지 않는다 (NH-04).
  // 종전 «고급주택» 시기는 당시 소득세법 시행령 §156의 공동·단독·시설 기준 전부 (NH-02).
  const priorBase = era.priorRuleBasis === "addenda_29_2" ? PRIOR_ADVANCED_HOUSE_STANDARD_DATE : hvBaseDate;
  const priorLuxury =
    era.priorRuleBasis !== undefined && isPriorLuxuryStandardDate(priorBase)
      ? judgePriorLuxuryHouse(priorBase, input.wholePropertyTransferPrice, {
          ...input.luxuryFacts,
          exclusiveAreaSqm: input.exclusiveAreaSqm,
        })
      : undefined;
  if (priorLuxury) warnings.push(...priorLuxury.confirmations);
  const isHighValue =
    era.priorRuleBasis === undefined
      ? isHighValueHouseAtDate(input.transferDate, input.wholePropertyTransferPrice)
      : (priorLuxury?.isLuxury ??
        isHighValueHouseUnder993(priorBase, input.wholePropertyTransferPrice, input.exclusiveAreaSqm));
  if (isHighValue) {
    const basisLabel =
      era.priorRuleBasis === undefined
        ? `양도일 ${input.transferDate.toISOString().split("T")[0]} 당시 기준`
        : era.priorRuleBasis === "addenda_29_2"
          ? `종전 고급주택 기준 — ${NEW_99_3_ADDENDA_6762.PRIOR_CONSTRUCTION_STARTED}`
          : `적용기준일 ${hvBaseDate.toISOString().split("T")[0]} 당시 기준 — ${NEW_99_3_ADDENDA_6762.PRIOR_CONTRACT_OR_APPROVAL}`;
    reasons.push({
      code: "HIGH_VALUE_HOUSE",
      message: `고가주택(소득세법 §89①3호)은 §99의3 ① 단서로 적용 배제됩니다 (${basisLabel})`,
      legalBasis,
    });
    return reasons;
  }

  return reasons; // 빈 배열 = 적용 가능
}

