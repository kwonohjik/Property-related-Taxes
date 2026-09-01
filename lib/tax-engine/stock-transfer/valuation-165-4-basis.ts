/**
 * 「소득세법 시행령」 §165④ — **「제4항에 따른 평가액」의 단일 정본**
 *
 * §165④·§165⑤·validate·UI 프리뷰가 **같은 값**을 내야 하는 이유는 조문이 그렇게 쓰여 있기
 * 때문이다. §165⑤ 환산식은 분자·분모를 각각 「취득일 현재의 **제4항에 따른 평가액**」·
 * 「상장일 현재의 **제4항에 따른 평가액**」이라 부르고, 그 후단의 §165⑨ 준용 트리거도
 * 「제4항에 따른 평가액이 **같은 경우**」다. ⇒ 세 지점이 모두 **동일한 평가 함수**를 가리킨다.
 *
 * ## §165④1호 — 본칙 + 단서
 *
 * > 1. 1주당 가액의 평가는 …순손익가치…와 …순자산가치…를 각각 **3과 2의 비율**
 * >    (법 제94조제1항제4호다목에 해당하는 법인의 경우에는 …각각 **2와 3**으로 한다)로
 * >    가중평균한 가액으로 한다. **다만, 그 가중평균한 가액이 1주당 순자산가치에
 * >    100분의 80을 곱한 금액보다 적은 경우에는 1주당 순자산가치에 100분의 80을 곱한 금액을
 * >    평가액으로 한다.**
 *
 * 단서는 본칙의 **일부**다. 「제4항에 따른 평가액」이라고 부르는 곳은 단서까지 포함해서
 * 부르는 것이다 — 단서를 빼려면 그 예외에 근거가 있어야 한다.
 * [[feedback_no_unfavorable_application_without_legal_basis]]
 *
 * ⚠️ **하한은 「비율」에 걸리지 않는다.** §165⑤ 환산비율이 0.8 아래여도 비율을 0.8로
 *    끌어올리지 않는다 — 하한은 분자·분모 **각각의 평가액**에 개별로 걸린다.
 *    (회귀 보호: `post-listing-detail.full.test.ts` PL-FLOOR-1·2)
 *
 * ## 연혁 게이팅은 **양도일** 기준이다
 *
 * 가중치와 하한은 같은 항의 같은 호에서 나오므로 **함께** 게이팅한다. 한쪽만 시기별로
 * 가르면 같은 함수 안에서 서로 다른 시기의 법을 적용하게 된다 — 실제로 그 형태의 결함이
 * 감사에서 잡힌 적이 있다(`audit-fix-stock-valuation-unlisted.test.ts`:
 * 「연혁을 무시하고 현행 3:2 + **무조건** 80% 하한」).
 */

import { STOCK_FLOOR_80_PCT } from "@/lib/tax-engine/legal-codes/stock";

export interface ValuationWeights {
  niWeight: number; // 순손익가치 가중치 (합계 5분의)
  naWeight: number; // 순자산가치 가중치 (합계 5분의)
  hasFloor80: boolean; // 80% 하한(§165④1 단서) 적용 여부
}

/**
 * 양도일 기준 시기별 평가 가중치 조회
 *
 * 연혁 (시행령 §165④ 개정):
 *   ~1998.12.31.        : 순자산 단독 (ni=0, na=5)
 *   1999.1.1.~2007.2.27.: 순손익 3/5 + 순자산 2/5 (80% 하한 없음)
 *   2007.2.28.~         : 순손익 3/5 + 순자산 2/5 + 80% 하한 (현행)
 */
export function getValuationWeights(transferDate: Date): ValuationWeights {
  const ts = transferDate.getTime();

  // 1998.12.31. 이하 — 순자산 단독
  const CUTOFF_1998 = new Date("1999-01-01").getTime();
  if (ts < CUTOFF_1998) {
    return { niWeight: 0, naWeight: 5, hasFloor80: false };
  }

  // 2007.2.28. 이상 — 현행 (80% 하한 포함)
  const CUTOFF_2007_2_28 = new Date("2007-02-28").getTime();
  if (ts >= CUTOFF_2007_2_28) {
    return { niWeight: 3, naWeight: 2, hasFloor80: true };
  }

  // 1999.1.1.~2007.2.27. — 가중평균 동일하나 80% 하한 없음
  return { niWeight: 3, naWeight: 2, hasFloor80: false };
}

/**
 * 「상속세 및 증여세법 시행령」 제55조 제1항 후단(순자산가액 0원 이하 → 0원) **시행일**.
 *
 * ⚠️ **이 하한은 처음부터 있던 규정이 아니다** — 2009.2.4. 개정으로 신설됐다.
 *    그 전 평가에는 하한이 없으므로 자본잠식 법인의 1주당 순자산가치가 **음수로 남는다.**
 *
 * 대비: 같은 법 시행령 **제56조 제1항 후단**(순손익액 음수 → 영)은 **처음부터 있던 규정**이라
 *      연혁 게이팅 대상이 아니다. 두 하한을 한 덩어리로 취급하면 조용히 틀린다.
 *
 * 📌 **근거의 성격**: 사용자(도메인 전문가) 확인 + 현행 조문 말미의 개정 이력
 *    `<개정 1998.12.31, 2000.12.29, 2003.12.30, 2009.2.4>`.
 *    **과거 시행본 본문 대조는 실패했다**(법제처 연혁 API가 해당 조문 구본을 반환하지 않음)
 *    — [[feedback_korean_law_historical_efyd_unavailable]]. 본문으로 재확인되면 이 주석을 갱신할 것.
 */
export const INH_DECREE_55_1_ZERO_FLOOR_EFFECTIVE = new Date("2009-02-04");

/** 평가기준일에 「상속세 및 증여세법 시행령」 제55조 제1항 후단(0원 하한)이 시행 중이었는가 */
export function hasNetAssetZeroFloor(evaluationDate: Date): boolean {
  return evaluationDate.getTime() >= INH_DECREE_55_1_ZERO_FLOOR_EFFECTIVE.getTime();
}

export interface Section165_4Value {
  /** 「제4항에 따른 평가액」 — 단서(80% 하한)까지 적용한 최종값 (원 미만 절사) */
  value: number;
  /** 단서 적용 전 가중평균 원값 (절사 전 — 표시·비교용) */
  weightedRaw: number;
  /** 단서(80% 하한)가 실제로 값을 끌어올렸는지 */
  floorApplied: boolean;
  /** [표시 전용] 실제 적용된 순손익가치 가중치 (합계 5분의) — 연혁·§94①4다목 반영 */
  niWeight: number;
  /** [표시 전용] 실제 적용된 순자산가치 가중치 (합계 5분의) */
  naWeight: number;
}

/**
 * 「제4항에 따른 평가액」 산정 — 본칙 가중평균 + 단서 80% 하한, 양도일 연혁 게이팅.
 *
 * ⚠️ 인자는 **사실**만 받는다(`transferDate`). `hasFloor80` 같은 **판단**을 인자로 받으면
 *    호출부마다 다른 값을 고를 여지가 생겨 단일 정본이 깨진다.
 *
 * @param netIncomeValue 1주당 순손익가치 (환원율 나눗셈 반영 후)
 * @param netAssetValue  1주당 순자산가치
 * @param isHeavyRE      법 §94①4호 다목 법인 — 가중치 2:3 반전
 * @param transferDate   양도일 (연혁 게이팅 기준)
 */
/**
 * §165④1호 본칙 가중평균 — `(순손익 × niWeight + 순자산 × naWeight) ÷ 5`.
 *
 * 하한·연혁 게이팅 **전**의 raw 값이다(floor 하지 않는다 — 호출부가 하한과 비교한 뒤 floor 한다).
 * 같은 한 줄이 세 파일에 흩어져 있었다 — 여기가 정본이다.
 */
export function calcWeightedAvgPerShare(
  netIncomeValue: number,
  netAssetValue: number,
  niWeight: number,
  naWeight: number,
): number {
  return (netIncomeValue * niWeight + netAssetValue * naWeight) / 5;
}

export function calcSection165_4Value(
  netIncomeValueRaw: number,
  netAssetValueRaw: number,
  isHeavyRE: boolean,
  transferDate: Date,
): Section165_4Value {
  // 🔑 **0 하한 — 「상속세 및 증여세법 시행령」 제55조 제1항·제56조 제1항 후단 준용.**
  //    「소득세법」 제99조 제1항 제4호 **전단**이 「…「상속세 및 증여세법」 제63조제1항제1호나목을
  //    **준용**하여 평가한 가액」이라 하고, 「소득세법 시행령」 제165조 제4항은 그 **후단**이 위임한
  //    「평가기준시기 및 평가액」을 정할 뿐 준용을 배제하지 않는다.
  //    ⚠️ **여기가 없으면 반쪽이다** — 간이 direct 모드는 사용자가 1주당 가치를 직접 입력해
  //       `calcNetIncomePerShare`·`calcNetAssetPerShare`를 **거치지 않는다**. 이 함수가 유일한
  //       공통 깔때기다. anchor ZF-4
  //
  //    🔴 **두 하한은 연혁이 다르다** — 제56조 제1항 후단은 **처음부터** 있었고,
  //       제55조 제1항 후단은 **2009.2.4. 신설**이다. 한 덩어리로 걸면 2009 이전 평가에
  //       없던 하한을 소급 적용하게 된다. anchor ZF-9
  const netIncomeValue = Math.max(0, netIncomeValueRaw);
  const netAssetValue = hasNetAssetZeroFloor(transferDate)
    ? Math.max(0, netAssetValueRaw)
    : netAssetValueRaw;
  const weights = getValuationWeights(transferDate);
  const niWeight = isHeavyRE ? 2 : weights.niWeight;
  const naWeight = isHeavyRE ? 3 : weights.naWeight;

  // niWeight 0 = 1998 이하 연혁(순자산 단독). isHeavyRE 반전은 이 연혁에 적용되지 않는다.
  const weightedRaw =
    weights.niWeight === 0 && !isHeavyRE
      ? netAssetValue
      : calcWeightedAvgPerShare(netIncomeValue, netAssetValue, niWeight, naWeight);

  if (weights.hasFloor80) {
    const floor80 = netAssetValue * STOCK_FLOOR_80_PCT;
    if (floor80 > weightedRaw) {
      return { value: Math.floor(floor80), weightedRaw, floorApplied: true, niWeight, naWeight };
    }
  }
  return { value: Math.floor(weightedRaw), weightedRaw, floorApplied: false, niWeight, naWeight };
}
