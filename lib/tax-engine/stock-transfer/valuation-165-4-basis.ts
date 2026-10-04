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

/**
 * 「제4항에 따른 평가액」의 산식 — 양도일 연혁.
 *   - `"weighted"` : 순손익가치·순자산가치 가중평균(3:2 · 반전 법인 2:3) — 2007.2.28.~
 *   - `"max"`      : 순손익가치가 순자산가치에 미달하면 순자산가치 = max — 2000.4.3.~2007.2.27.
 */
export type Section165_4Model = "weighted" | "max";

export interface ValuationWeights {
  model: Section165_4Model;
  niWeight: number; // 순손익가치 가중치 (합계 5분의) — max 산식이면 0
  naWeight: number; // 순자산가치 가중치 (합계 5분의) — max 산식이면 0
  hasFloor80: boolean; // 80% 하한(§165④1 단서) 적용 여부
}

/** 영 §165④1호 단서(80% 하한) 적용 개시 양도일 — 대통령령 제28637호 부칙 제1조 단서 1호 · 제2조② */
export const FLOOR_80_EFFECTIVE = new Date("2018-04-01");

/** 영 §165④1호 가중평균(3:2) 적용 개시 양도일 — 대통령령 제19890호(2007.2.28.) 부칙 제1조 본문 · 제3조 */
export const WEIGHTED_MODEL_EFFECTIVE = new Date("2007-02-28");

/**
 * 계산을 지원하는 첫 양도일 — 소득세법 시행규칙(재정경제부령 제138호, 2000.4.3.) §81②2호 max 산식 · 부칙 제3조①.
 * 그 전(시행규칙 §81②2호 1996.3.30.~2000.4.2.)은 「(순자산가치 + 순손익액÷15%) ÷ 2」에 순자산 단독 사유
 * (직전 사업연도 6월 미만 · 영 §158①1호 가목 법인 · 순손익가치가 순자산가치의 50% 미달 등)가 붙는데,
 * 그 입력이 없다. ⇒ ⑧·⑫가 차단하고(`isSection165_4EraUnsupported`) 엔진은 값을 내지 않는다.
 */
export const SECTION_165_4_SUPPORTED_FROM = new Date("2000-04-03");

/** 양도일이 계산 미지원 구간(2000.4.2. 이전)인가 — ⑧·⑫ 차단 술어 · UI 미리보기 가드 */
export function isSection165_4EraUnsupported(transferDate: Date): boolean {
  return transferDate.getTime() < SECTION_165_4_SUPPORTED_FROM.getTime();
}

/**
 * 양도일 기준 시기별 평가 산식 조회
 *
 * 연혁 (시행본 본문 대조 — 계획서 `stock-165-4-valuation-followups.plan.md` §4 · §11):
 *   ~2000.4.2.            : 시행규칙 §81②2호 산술평균 — **미지원(throw)**. ⑧·⑫가 먼저 막는다.
 *   2000.4.3.~2007.2.27.  : max(순손익가치, 순자산가치) — 시행규칙 §81②2호 가·나목(제138호) →
 *                           2001.1.1.부터 영 §165④1·2호(제17032호 · 2006.2.9. 제19327호 동일). 가중치·반전·하한 없음
 *   2007.2.28.~2018.3.31. : 순손익 3/5 + 순자산 2/5(영 §158①1호 가목 법인 2:3), **80% 하한 없음** — 제19890호
 *   2018.4.1.~            : 3/5 + 2/5 + 80% 하한(§165④1호 단서) — 현행
 *
 * 80% 하한 시행일: 대통령령 제28637호(2018.2.13.) 부칙 제1조 단서 1호 「…제165조제4항…의 개정규정: 2018년 4월 1일」,
 *   제2조② 「양도소득에 관한 개정규정은 이 영 시행 이후 양도하는 분부터 적용」.
 *   2007.2.28.(MST 77490)·2010.2.18.(MST 102729)·2017.2.3.(MST 191522)·2018.2.13.(MST 202148) 시행본 §165④1호에는 단서(하한)가 없다.
 *
 * 종전 모델(~1998.12.31. 순자산 단독 · 1999.1.1.~ 3:2)은 근거가 없었다 — 1999.1.1. 시행본(제15967호)의 §165①2호
 * 변경은 「총리령 → 재정경제부령」 명칭뿐이다.
 */
export function getValuationWeights(transferDate: Date): ValuationWeights {
  if (isSection165_4EraUnsupported(transferDate)) {
    throw new Error(
      `소득세법 시행령 §165④ 보충적 평가 — ${transferDate.toISOString().slice(0, 10)} 양도분은 계산하지 않는다(2000.4.2. 이전 · ⑧·⑫ 차단 누락)`,
    );
  }
  const ts = transferDate.getTime();

  // 2000.4.3.~2007.2.27. — max(순손익가치, 순자산가치)
  if (ts < WEIGHTED_MODEL_EFFECTIVE.getTime()) {
    return { model: "max", niWeight: 0, naWeight: 0, hasFloor80: false };
  }

  // 2018.4.1. 이상 — 현행 (80% 하한 포함)
  if (ts >= FLOOR_80_EFFECTIVE.getTime()) {
    return { model: "weighted", niWeight: 3, naWeight: 2, hasFloor80: true };
  }

  // 2007.2.28.~2018.3.31. — 가중평균, 80% 하한 없음
  return { model: "weighted", niWeight: 3, naWeight: 2, hasFloor80: false };
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
  /** 단서 적용 전 가중평균 원값 (절사 전 — 표시·비교용). max 산식이면 max 값 */
  weightedRaw: number;
  /** 단서(80% 하한)가 실제로 값을 끌어올렸는지 */
  floorApplied: boolean;
  /** [표시 전용] 적용된 산식 — `"max"`면 `weightedRaw`는 max(순손익가치, 순자산가치)이고 가중치는 0이다 */
  model: Section165_4Model;
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

  // 2000.4.3.~2007.2.27. — 「1호 가액(순손익가치)이 순자산가치에 미달하면 순자산가치」 = max.
  // 가중치가 없으니 2:3 반전(2007.2.28. 신설)도 80% 하한(2018.4.1. 신설)도 없다.
  if (weights.model === "max") {
    const weightedRaw = Math.max(netIncomeValue, netAssetValue);
    return { value: Math.floor(weightedRaw), weightedRaw, floorApplied: false, model: "max", niWeight: 0, naWeight: 0 };
  }

  const niWeight = isHeavyRE ? 2 : weights.niWeight;
  const naWeight = isHeavyRE ? 3 : weights.naWeight;
  const weightedRaw = calcWeightedAvgPerShare(netIncomeValue, netAssetValue, niWeight, naWeight);

  if (weights.hasFloor80) {
    const floor80 = netAssetValue * STOCK_FLOOR_80_PCT;
    if (floor80 > weightedRaw) {
      return { value: Math.floor(floor80), weightedRaw, floorApplied: true, model: "weighted", niWeight, naWeight };
    }
  }
  return { value: Math.floor(weightedRaw), weightedRaw, floorApplied: false, model: "weighted", niWeight, naWeight };
}

/**
 * 순자산가치 **단독** 평가액 — 영 §165④3호 각 목 · §165⑧1호 후단의 「제4항제1호나목의 계산식에 따라 평가한 가액」.
 *
 * 0 하한(상증령 §55① 후단 준용)은 가중평균(`calcSection165_4Value`)과 **같은 연혁**으로 건다 — 같은 1호 나목의
 * 순자산가치다. 종전에는 단독 분기마다 `Math.floor(na)`만 써서 자본잠식 법인의 음수 순자산이 그대로 남아
 * **취득가액이 음수**가 됐다(계획서 `stock-165-4-valuation-followups.plan.md` §1).
 * 80% 하한은 걸지 않는다 — 3호는 「제1호 각 목 외의 부분에도 불구하고」라 1호 단서도 비켜간다.
 */
export function calcNetAssetOnlyValue(netAssetValueRaw: number, transferDate: Date): number {
  return Math.floor(hasNetAssetZeroFloor(transferDate) ? Math.max(0, netAssetValueRaw) : netAssetValueRaw);
}

/**
 * 보충평가 1주당 평가액 — 순자산 단독이면 `calcNetAssetOnlyValue`, 아니면 `calcSection165_4Value`.
 * ⑧·⑫가 «양도기준시가 0 이하» 차단을 엔진과 같은 값으로 판정하려고 쓴다.
 */
export function calcSupplementaryPerShare(
  netIncomeValueRaw: number,
  netAssetValueRaw: number,
  isHeavyRE: boolean,
  transferDate: Date,
  netAssetOnly: boolean,
): number {
  return netAssetOnly
    ? calcNetAssetOnlyValue(netAssetValueRaw, transferDate)
    : calcSection165_4Value(netIncomeValueRaw, netAssetValueRaw, isHeavyRE, transferDate).value;
}

/**
 * 양도기준시가(1주당 보충평가액)가 0 이하인가 — ⑧·⑫ 차단 술어(Q-4b). 값은 엔진과 같은 정본에서 낸다.
 * 0 하한이 걸린 뒤에도 0 이하면 환산 산식의 분모가 0이다 — 종전 엔진은 경고만 남기고 취득가액 0으로 끝냈다.
 */
export function isTransferSupplementaryNonPositive(
  netIncomeValueRaw: number,
  netAssetValueRaw: number,
  isHeavyRE: boolean,
  transferDate: Date,
  netAssetOnly: boolean,
): boolean {
  return calcSupplementaryPerShare(netIncomeValueRaw, netAssetValueRaw, isHeavyRE, transferDate, netAssetOnly) <= 0;
}
