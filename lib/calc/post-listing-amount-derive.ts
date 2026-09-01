/**
 * §165⑤ 간이 모드 «순액 입력» — 원천값에서 1주당 가치를 파생한다.
 *
 * 사용자가 순손익액·주식수·순자산가액(영업권 포함 전)·영업권을 넣으면
 * `listingYearNetIncomePerShare` 등 **기존 결과 4필드로 mirror**된다.
 * ⇒ API 변환·Zod·Route·엔진은 무변경이다(계획서 §4).
 *
 * 🔑 **산식을 여기서 다시 세우지 않는다.** 완전재현 모드가 쓰는 엔진 헬퍼에 위임한다 —
 *    집계값 하나를 배열에 담아 넘기면 `netIncomeAmount = Σ addA − Σ subB` 가 그대로 그 값이
 *    되고, floor 시점·순서가 완전재현과 **동일**해진다. 별도 산식을 세우면 1원 단위로 갈린다.
 *
 * 법령:
 *   §165④1 가목 — 직전 사업연도 1주당 순손익액 ÷ 환원율
 *   §165④1 나목 — 직전 사업연도 종료일 현재 장부가액 ÷ 발행주식총수
 *   환원율 10% = 소득세법 시행규칙 §81② → 상증칙 §17 「연간 100분의 10」
 *
 * ⚠️ 영업권 행은 §165④1나목 문언에서 직접 나오지 않는다. 완전재현 모드가 따르는
 *    상증령 §55 순자산가액 구조(자산 − 부채 + 영업권)에서 온 것이고 사례 48 PDF 재현으로
 *    검증돼 있다. 이 모듈은 그 구조를 **노출**할 뿐 해석을 바꾸지 않는다.
 *
 * ⚠️ 주식수는 **한 연도에 1개**다 — 순손익·순자산이 공유한다(§165④4호).
 *    완전재현 모드는 `NIYear`·`NAYear`가 각자 `shareCount`를 갖는다.
 */

import {
  calcNetIncomePerShare,
  calcNetAssetPerShare,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";

/** 환원율 — 소칙 §81② → 상증칙 §17. 간이 모드는 고정이다(입력 노출 없음). */
export const SIMPLE_DISCOUNT_RATE = 0.10;

export interface AmountInputs {
  /** 직전 사업연도 순손익액 (원) */
  netIncomeAmount: number;
  /** 직전 사업연도 종료일 현재 발행주식총수 — 순손익·순자산 공용 */
  shareCount: number;
  /** 직전 사업연도 순자산가액 — **영업권 포함 전** (원) */
  netAssetAmount: number;
  /** 영업권 (원). 해당 없으면 0 */
  goodwill: number;
}

export interface DerivedPerShare {
  /** 1주당 순손익가치 — 산출 불가(주식수 ≤ 0)면 0 */
  netIncomePerShare: number;
  /** 1주당 순자산가치 — 산출 불가면 0 */
  netAssetPerShare: number;
  /** 중간값 — 화면 산식 표시용 (1주당 순손익액, 환원율로 나누기 «전») */
  perShareIncomeBeforeRate: number;
  /** 중간값 — 영업권을 더한 최종 순자산가액 */
  netAssetTotal: number;
}

/**
 * 원천값 → 1주당 가치.
 *
 * 주식수가 0 이하이면 파생값을 **0으로 돌려준다**. 호출부는 0을 mirror하지 않고
 * 빈 문자열로 두어야 한다 — 「입력했는데 0원」이 되면 validate 판정이 애매해진다
 * (자동 fallback 금지 정책).
 */
export function derivePerShareFromAmounts(input: AmountInputs): DerivedPerShare {
  const { netIncomeAmount, shareCount, netAssetAmount, goodwill } = input;

  const ni = calcNetIncomePerShare({
    addA: [netIncomeAmount],
    subB: [],
    shareCount,
    discountRate: SIMPLE_DISCOUNT_RATE,
  });

  const na = calcNetAssetPerShare({
    assetTotalRow1: netAssetAmount,
    assetAdd: [],
    assetSub: [],
    liabTotalRow8: 0,
    liabAdd: [],
    liabSub: [],
    goodwillRow19: goodwill,
    shareCount,
  });

  return {
    netIncomePerShare: ni.perShareValue,
    netAssetPerShare: na.perShareAsset,
    perShareIncomeBeforeRate: ni.perShareIncome,
    netAssetTotal: na.netAssetAmount,
  };
}
