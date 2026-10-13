/**
 * 재개발 경로의 §95② 표1·표2 **공제율 leaf** — 표2 대상 판정(`usesTable2`)과 보유분·거주분 율(`computeLthdRateSplit`).
 *
 * 표2는 양도일에 따라 모양이 다르다(`data/lthd-table2-era.ts` — 일반 경로 `calcLongTermRate`·`meetsTable2ResidenceRequirement`와 같은 연혁):
 * - 2009-01-01~2019-12-31 양도: 보유 3년 이상 연 8%(10년 80%) 단일축 · **거주 2년 요건 없음**
 * - 2020-01-01~2020-12-31 양도: 같은 단일축 · 거주 2년 요건(시행령 §159의3)
 * - 2021-01-01~ 양도: 보유 연 4%(40%) + 거주 연 4%(40%) · 거주 2년 요건(§159의4)
 * - 2009-01-01 전 양도: 연혁 미지원 — 현행 식으로 계산하고 호출부가 고지한다(`LTHD_TABLE2_UNSUPPORTED_NOTICE`)
 *
 * 양도일(`transferDate`)을 주지 않으면 현행 식이다 — 종전 호출부와 같다.
 */
import {
  LTHD_TABLE2_RESIDENCE_MIN_YEARS,
  resolveLthdTable2Era,
  table2HoldingOnlyRate,
} from "./data/lthd-table2-era";

export interface LthdRateSplit {
  holding: number;
  residence: number;
  total: number;
  /** 표2 단일축 시기(2009~2020 양도)의 보유 연 8% — 거주분이 없어도 표2다. 결과 카드의 「적용 표」 라벨이 읽는다. */
  holdingOnly?: true;
}

/** 표2가 보유 연 8% 단일축인 양도일인가 (2009-01-01~2020-12-31). */
export function isTable2HoldingOnlyEra(transferDate?: Date): boolean {
  if (!transferDate) return false;
  const era = resolveLthdTable2Era(transferDate);
  return era === "holding_8pct" || era === "holding_8pct_residence_2y";
}

/**
 * §95② **단서**(1세대1주택 표2) 진입 여부 — **단일 소스**.
 *
 * 「대통령령으로 정하는 1세대 1주택」 + 보유기간 중 **거주기간 2년 이상** — 단 2009~2019 양도분은 거주요건이 없다
 * (일반 경로 `meetsTable2ResidenceRequirement`와 같은 연혁). 조특법 §97의4① 단서(「같은 항 단서에 해당하는 경우에는 그러하지 아니하다」)가
 * 가리키는 것이 이 조건이라, 추가공제율 가산 배제 판정도 같은 술어를 써야 한다 — 두 술어로 판정하면 드리프트한다
 * (memory `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ 보유기간(3년) 게이트는 여기 넣지 않는다. 표2 **대상**인지와 공제율이 0인지는 다른 축이고,
 *   §97의4 단서는 「표2 대상이면 가산하지 않는다」이지 「공제율이 있으면」이 아니다.
 */
export function usesTable2(isOneHouseSingle: boolean, residenceYears: number, transferDate?: Date): boolean {
  if (!isOneHouseSingle) return false;
  if (transferDate && resolveLthdTable2Era(transferDate) === "holding_8pct") return true;
  return residenceYears >= LTHD_TABLE2_RESIDENCE_MIN_YEARS;
}

/**
 * 보유분/거주분 분리 율 산정 (신고서 양식 표시용).
 *
 * 표1: holding=min(years×0.02, 0.30), residence=0
 * 표2(2021~): holding=min(years×0.04,0.40), residence=min(resYears×0.04,0.40) (거주 2년+ 가드)
 * 표2(2009~2020): holding=min(years×0.08,0.80), residence=0 (`holdingOnly`)
 *
 * @param years 보유 연수 (정수, 보유개월 / 12 floor)
 * @param isOneHouseSingle 1세대1주택 여부
 * @param residenceYears 거주 연수 (정수) — 표2 **대상 판정**용
 * @param rateResidenceYears 거주분 공제율에 쓰는 거주 연수 — 표2 **대상 판정**(`residenceYears`)과 갈릴 때만 준다(입주권: 인가 후 거주 제외).
 *   생략하면 같은 값. 표2 거주기간 열은 「2년 이상」부터라(§95② 표2) 공제율용 거주가 2년 미만이면 거주분은 0이다.
 * @param transferDate 양도일 — 표2 연혁 축. 생략하면 현행 식.
 */
export function computeLthdRateSplit(
  years: number,
  isOneHouseSingle: boolean,
  residenceYears: number,
  rateResidenceYears: number = residenceYears,
  transferDate?: Date,
): LthdRateSplit {
  if (years < 3) return { holding: 0, residence: 0, total: 0 };

  if (usesTable2(isOneHouseSingle, residenceYears, transferDate)) {
    if (isTable2HoldingOnlyEra(transferDate)) {
      const holding = table2HoldingOnlyRate(years);
      return { holding, residence: 0, total: holding, holdingOnly: true };
    }
    const holding = Math.min(years * 0.04, 0.40);
    const residence = rateResidenceYears >= 2 ? Math.min(rateResidenceYears * 0.04, 0.40) : 0;
    return { holding, residence, total: holding + residence };
  }

  const holding = Math.min(years * 0.02, 0.30);
  return { holding, residence: 0, total: holding };
}
