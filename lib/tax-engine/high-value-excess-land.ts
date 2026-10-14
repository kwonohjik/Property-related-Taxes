/**
 * 고가주택(일부 비과세) + 배율 초과 부수토지 — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식의 **단일 소스 leaf**.
 *
 * 의존이 없는 순수 모듈이다(단일 주택 `applyHousingLandExclusions` · 겸용주택 `buildHousingPart` · 함께 양도 부수토지 카드
 * `resolveTaxableGain` · §155⑳ 특례 단계가 모두 같은 함수를 쓰므로, 어느 경로의 import 그래프에도 순환을 만들지 않게 분리했다).
 * `transfer-tax-appurtenant-land.ts`가 재수출한다.
 */
import { safeMultiplyThenDivide } from "./tax-utils";

/**
 * 고가주택(일부 비과세) + 배율 초과 부수토지의 **기준면적 이내 토지분 과세 양도차익** — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식의 단일 소스.
 *
 * 회신은 주택과 «전체 부수토지»의 양도차익을 각각 안분하고, 기준면적 이내 토지분은 «전체 부수토지의 안분 후 양도차익 − 기준면적 초과 토지분의 양도차익
 * (초과분은 안분 전 전액)»으로 보며, 초과분이 더 크면 그 초과금액은 없는 것으로 본다. 이 함수가 그 식 하나다 — 단일 주택(`applyHousingLandExclusions`) ·
 * 겸용주택(`buildHousingPart`) · 함께 양도 부수토지 카드(`resolveTaxableGain`)가 같은 함수를 쓴다.
 *
 * @param landGain  **전체 부수토지** 양도차익 — 기준면적 이내분 + 배율 초과분(안분 전). 음수는 0으로 본다.
 * @param excessGain 배율 초과분 양도차익(안분 전 전액 과세되는 값). 음수는 0으로 본다.
 * @param prorate   고가주택 안분(영 §160①) — 호출부 경로의 안분 함수를 그대로 넘긴다(경로마다 분모·절사 규약이 다르다).
 */
export function highValueExcessLandTaxableGain(args: {
  landGain: number;
  excessGain: number;
  prorate: (gain: number) => number;
}): number {
  const land = Math.max(0, args.landGain);
  const excess = Math.max(0, args.excessGain);
  return Math.max(0, args.prorate(land) - excess);
}

/**
 * 같은 1세대1주택 단위 안에서 **기준면적 이내 토지 조각**(주택 카드의 토지분 · 함께 양도 부수토지 카드들)에 배율 초과분 양도차익 합계(X)를 몫으로 나눈다.
 * 조각 i의 몫 = floor(X × 조각 양도차익 / 조각 합계) — 마지막 양수 조각이 잔액을 흡수해 Σ몫 = X(「합 불변식」). 한 조각이면 몫 = X다.
 * 조각마다 `highValueExcessLandTaxableGain({ landGain: 조각 + 몫, excessGain: 몫 })`을 하면 모든 조각의 부호가 같고(몫/조각이 같은 비율) 합은 단위 전체의
 * max(0, 안분(전체 토지) − X)와 절사 오차 안에서 같다.
 */
export function allocateUnitExcessShares(withinGains: readonly number[], excessTotal: number): number[] {
  const gains = withinGains.map((g) => Math.max(0, g));
  const sum = gains.reduce((a, b) => a + b, 0);
  if (!(excessTotal > 0) || !(sum > 0)) return gains.map(() => 0);
  const lastPositive = gains.reduce((acc, g, i) => (g > 0 ? i : acc), -1);
  const shares = gains.map((g) => (g > 0 ? safeMultiplyThenDivide(excessTotal, g, sum) : 0));
  const assigned = shares.reduce((a, b) => a + b, 0);
  shares[lastPositive] += excessTotal - assigned;
  return shares;
}
