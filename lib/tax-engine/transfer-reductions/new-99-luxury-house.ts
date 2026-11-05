/**
 * §99·§99의3 고가주택 단서의 **종전 고급주택 기준** — 기준일(계약·사용승인일) 당시 소득세법 시행령 §156 (리뷰 NH-02 · NH-15).
 *
 * 법률 제6762호 부칙 §29①(§99의3)과 §99 단서는 계약·승인일 당시의 «고급주택» 기준을 쓴다. 그 시기 소득세법 시행령 §156은
 * 공동주택만이 아니라 단독주택·시설 기준을 함께 둔다(KoreanLaw 원문 실측):
 *
 * | 시행본 | 1호 단독주택 | 2호 공동주택(다가구 포함, §155⑮ 단독 의제 제외) | 3호 시설 |
 * |---|---|---|---|
 * | 1998.4.1.(MST 22605)·1999.1.1.(MST 22607) | 연면적 264㎡ 이상 또는 부수토지 495㎡ 이상 + 주택·토지 양도가액 합계 5억원 초과 + 취득세 시가표준액 2천만원 이상 | 전용 165㎡ 이상 + 양도가액 5억원 초과 | 엘리베이터·에스컬레이터·67㎡ 이상 수영장 중 1개 이상 |
 * | 1999.9.18.(MST 22609) | 같은 면적 + 양도 당시 실지거래가액 합계 6억원 초과 + 시가표준액 2천만원 이상 | 전용 165㎡ + 실지거래가액 6억원 초과 | 같음 |
 * | 2001.1.1.(MST 53115) | 같은 면적·가액 + 소득세법 §99①1호나목 기준시가 4천만원 이상 | 같음 | 같음 |
 * | 2002.10.1.(MST 59021) | 같음 | 전용 **149㎡** + 6억원 초과 | 같음 |
 *
 * - 1999.9.17.까지의 「양도가액 5억원」은 실지거래가액으로 판정한다(사용자 결정 리뷰 Q-1 a — 물건 전체 양도가액).
 * - 3호(시설)는 **단독주택에만** 적용한다(사용자 결정 리뷰 Q-2 b). 3호에는 가액 요건이 없다.
 * - 다가구주택은 2호 괄호대로 공동주택이다. 하나의 매매단위로 1인에게 양도해 소득세법 시행령 §155⑮에 따라 단독주택으로 보는 경우만 단독주택이다
 *   (화면 선택지가 이 구분을 묻는다).
 * - 「모름」(시가표준액 하한·시설)은 고급주택 요건을 충족한 것으로 보고(혜택 불성립) 확인 필요를 남긴다.
 * - 주택 유형 미입력(직접 API·옛 이력)은 종전과 같이 공동주택 기준으로 판정한다 — ⑧·⑫가 종전 기준 시기에는 유형을 요구한다.
 */

const D = (s: string) => new Date(s);

/** 1999.9.18. 시행 소득세법 시행령(MST 22609)부터 «양도 당시 실지거래가액 6억원» — 그 전날까지 «양도가액 5억원» */
const PRICE_5_EOK_LAST = D("1999-09-17");
/** 2001.1.1. 시행본(MST 53115)부터 단독주택 하한이 «기준시가 4천만원» — 그 전날까지 «취득세 시가표준액 2천만원» */
const FLOOR_STD_2000_LAST = D("2000-12-31");
/** 2002.10.1. 시행본(MST 59021)부터 공동주택 149㎡ — 그 전날까지 165㎡ */
const APT_165_LAST = D("2002-09-30");
/** 소득세법 시행령 §156이 «고급주택»으로 끝나는 마지막 날 — 2003.1.1.부터 «고가주택» */
export const PRIOR_LUXURY_STANDARD_LAST_ISO = "2002-12-31";
const PRIOR_LUXURY_STANDARD_LAST = D(PRIOR_LUXURY_STANDARD_LAST_ISO);

export type New99HouseType = "apartment" | "detached";
export type TriStateAnswer = "yes" | "no" | "unknown";

/** 단독주택 판정 사실 — 공동주택이면 전용면적만 본다. */
export interface PriorLuxuryHouseFacts {
  houseType?: New99HouseType;
  /** 공동주택 전용면적(㎡) */
  exclusiveAreaSqm: number;
  /** 단독주택 연면적(㎡) — 주택으로 보는 부분·주거전용 지하실 포함 */
  grossFloorAreaSqm?: number;
  /**
   * 단독주택에 딸린 토지 면적(㎡) — §156 1호나목 «주택에 부수되는 토지의 연면적»은 **전체 면적**이다(사용자 결정 L1c).
   * 조특법 §99①·§99의3①의 감면 대상 부수토지(건물 연면적 2배 이내)로 줄이지 않는다.
   */
  attachedLandAreaSqm?: number;
  /** 단독주택 하한(시가표준액 2천만원 / 기준시가 4천만원) 이상인가 */
  stdPriceFloorMet?: TriStateAnswer;
  /** 엘리베이터·에스컬레이터·67㎡ 이상 수영장 중 1개 이상 설치 */
  luxuryFacility?: TriStateAnswer;
}

export interface PriorLuxuryJudgment {
  isLuxury: boolean;
  /** 「모름」을 불리하게 처리한 경우의 확인 필요 문구 */
  confirmations: string[];
}

function priceThreshold(baseDate: Date): number {
  return baseDate <= PRICE_5_EOK_LAST ? 500_000_000 : 600_000_000;
}

function floorLabel(baseDate: Date): string {
  return baseDate <= FLOOR_STD_2000_LAST
    ? "취득세 시가표준액 2천만원 이상"
    : "소득세법 §99①1호나목 기준시가 4천만원 이상";
}

/**
 * 기준일 당시 소득세법 시행령 §156 고급주택 해당 여부. `baseDate`는 2002.12.31. 이전이어야 한다(그 뒤는 고가주택 — 호출자가 가른다).
 * `wholePropertyTransferPrice`는 물건 전체(주택 + 딸린 토지) 양도가액이다.
 */
export function judgePriorLuxuryHouse(
  baseDate: Date,
  wholePropertyTransferPrice: number,
  facts: PriorLuxuryHouseFacts,
): PriorLuxuryJudgment {
  const threshold = priceThreshold(baseDate);
  const overPrice = wholePropertyTransferPrice > threshold;
  const priceLabel = baseDate <= PRICE_5_EOK_LAST ? "양도가액 5억원" : "양도 당시 실지거래가액 6억원";

  if (facts.houseType !== "detached") {
    const minArea = baseDate <= APT_165_LAST ? 165 : 149;
    return { isLuxury: facts.exclusiveAreaSqm >= minArea && overPrice, confirmations: [] };
  }

  const confirmations: string[] = [];
  // 3호 — 시설(가액 요건 없음). 단독주택에만 적용(리뷰 Q-2 b).
  if (facts.luxuryFacility === "yes") return { isLuxury: true, confirmations };
  if (facts.luxuryFacility !== "no") {
    confirmations.push(
      "확인 필요: 엘리베이터·에스컬레이터·67㎡ 이상 수영장 설치 여부가 확인되지 않아 고급주택(소득세법 시행령 §156 3호, 기준일 당시)으로 보고 적용 배제했습니다. 설치되지 않았다면 다시 계산하세요.",
    );
    return { isLuxury: true, confirmations };
  }

  // 1호 — 면적(연면적 264㎡ 또는 딸린 토지 495㎡) + 가액 + 하한
  const areaMet = (facts.grossFloorAreaSqm ?? 0) >= 264 || (facts.attachedLandAreaSqm ?? 0) >= 495;
  if (!areaMet || !overPrice) return { isLuxury: false, confirmations };
  if (facts.stdPriceFloorMet === "no") return { isLuxury: false, confirmations };
  if (facts.stdPriceFloorMet !== "yes") {
    confirmations.push(
      `확인 필요: 주택의 ${floorLabel(baseDate)}인지 확인되지 않아 고급주택(소득세법 시행령 §156 1호 — 면적 기준과 ${priceLabel} 초과를 충족)으로 보고 적용 배제했습니다. 하한에 못 미치면 다시 계산하세요.`,
    );
  }
  return { isLuxury: true, confirmations };
}

/** 기준일이 종전 고급주택 기준 시기(2002.12.31. 이전)인가 */
export function isPriorLuxuryStandardDate(baseDate: Date): boolean {
  return baseDate <= PRIOR_LUXURY_STANDARD_LAST;
}
