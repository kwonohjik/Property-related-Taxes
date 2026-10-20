/**
 * 「소득세법 시행령」 §167의2② — 통산받은 양도차손 중 **감면소득금액 몫**을 감면소득금액에서 뺀다.
 *
 * > 법 제90조의 감면소득금액을 계산함에 있어서 제1항의 양도소득금액에 감면소득금액이 포함되어 있는 경우에는
 * > 순양도소득금액(감면소득금액을 제외한 부분을 말한다)과 감면소득금액이 차지하는 비율로 안분하여 당해 양도차손을
 * > 공제한 것으로 보아 감면소득금액에서 당해 양도차손 해당분을 공제한 금액을 법 제90조의 규정에 의한 감면소득금액으로 본다.
 *
 * 조문은 「법 제90조」를 항 구분 없이 가리킨다 — 소득공제형(§90②)과 **세액감면형(§90①의 B)** 모두다.
 * 종전에는 소득공제형에만 적용해, 세액감면형 B가 통산 전 금액 그대로 `(B − C) / D > 1`을 만들었다
 * (§77 10%가 차손 −1억에 14.3%, −3억에 산출세액 전액 — 계획서 `transfer-90-1-reducible-income-after-loss-offset.plan.md`).
 */
import { safeMultiplyThenDivide } from "./tax-utils";
import { bucketsOf, reducedPartKindsOf } from "./transfer-tax-aggregate-reduction-step";
import type { AssetRecord, LossOffsetOutput } from "./transfer-tax-aggregate-helpers";
import type { ReducibleIncomeBucket } from "./types/transfer-result.types";

/**
 * 감면소득금액이 떠안는 차손 — `floor(받은 차손 × 감면소득금액 / 통산 전 양도소득금액)`, 감면소득금액을 넘지 않는다.
 * 통산 전 양도소득금액이 0 이하면 안분할 수 없어 0이다. 소득공제형·세액감면형이 **이 한 식**을 쓴다.
 */
export function lossShareOnReducible(lossReceived: number, reducible: number, incomeBeforeOffset: number): number {
  if (lossReceived <= 0 || reducible <= 0 || incomeBeforeOffset <= 0) return 0;
  return Math.min(reducible, safeMultiplyThenDivide(lossReceived, reducible, incomeBeforeOffset));
}

/** 세액감면형 B′ — 감면율별 조각과 그 조각들로 다시 쓴 `reducibleIncome`. */
export interface ReducibleAfterLoss {
  buckets: ReducibleIncomeBucket[];
  /** 자산 결과의 `reducibleIncome`을 같은 비율로 줄인 값(§77 계열은 감면율이 박힌 값이라 조각 합과 다르다). */
  reducibleIncome: number;
}

/**
 * 「제1항의 양도소득금액」 — 감면소득을 정한 단위와 그 단위의 **다건 통산 순차손**(받은 차손 − 다른 자산에 넘긴 차손).
 *
 * 단건 엔진의 감면소득(B)은 자기 파트 차손을 자기 다른 파트가 다 받은 뒤의 값이다(자산 양도소득금액 · 파트별 감면이면 감면 파트 적격소득).
 * 다건은 파트를 행으로 신고 전체에서 통산하므로(영 §167의2①) 그 단위의 다건 통산 후 소득과 단건 기준 소득의 차이가 곧 §167의2②의 「당해 양도차손」이다:
 *   - 다른 자산의 차손을 받으면 양수 → B를 줄인다.
 *   - 자기 건물 차손이 다른 자산으로 가면(같은 세율 자산 먼저) 자기 감면 파트가 그만큼 덜 받으므로 음수 → B를 늘린다.
 * 종전에는 파트 통산 전후 차이를 받은 차손으로 세어 자기 자산 안 통산분을 B에서 한 번 더 뺐고(단건 8,665,000 / 다건 7,352,352),
 * 다른 자산에 넘긴 몫은 되돌리지 않았다 — 그래서 감면 자산은 파트 행 통산에서 빼 두었다(계획서 P2 Q-2). 근거: 국심2007전0147(함께 양도한
 * 자산에서 먼저 공제하라는 주장 기각 — 차손을 다른 자산·감면 자산에 안분하고 §167의2②로 감면소득을 줄인 처분 정당).
 *
 * 비주택 split 자산에서 「조세특례제한법」 §77이 한 파트만 요건을 채우면(5B `partWise`) 감면소득은 그 파트의 소득이므로 그 파트만 본다
 * (계획서 §4.2 — 자산 단위로 안분하면 감면 파트가 먼저 다 받은 차손을 감면 제외 파트에 나눠 준다 · 7,244,361 vs 6,860,000).
 */
export function netLossOnReducibleUnit(
  record: AssetRecord,
  incomeAfterOffset: number,
  partIncomeAfterOffset: number[] | undefined,
): { loss: number; base: number } {
  const partWise =
    record.result.reductionTypeApplied === "public_expropriation"
      ? record.result.publicExpropriationDetail?.partWise
      : undefined;
  if (!partWise || !record.lossParts || !partIncomeAfterOffset) return { loss: record.income - incomeAfterOffset, base: record.income };
  const kinds: readonly string[] = reducedPartKindsOf(partWise);
  const after = record.lossParts.reduce((s, p, k) => (kinds.includes(p.kind) ? s + partIncomeAfterOffset[k] : s), 0);
  return { loss: partWise.eligibleIncome - after, base: partWise.eligibleIncome };
}

/**
 * 감면소득에서 뺄 몫(음수면 더할 몫) — 순차손이 양수면 `lossShareOnReducible`(종전 식 그대로), 음수(넘긴 차손이 더 크다)면
 * 같은 비율 `floor(넘긴 순차손 × 감면소득 / 기준 소득)`만큼 늘린다. 기준 소득이 0 이하면 0.
 */
export function reducibleShiftOf(unit: { loss: number; base: number }, reducible: number): number {
  if (unit.loss >= 0) return lossShareOnReducible(unit.loss, reducible, unit.base);
  if (reducible <= 0 || unit.base <= 0) return 0;
  return -safeMultiplyThenDivide(-unit.loss, reducible, unit.base);
}

/**
 * 감면분 차손을 감면율별 조각에 **조각 소득 비율**로 나눈다(Q-2) — 최대잉여법이라 합이 정확히 감면분 차손이다.
 * 잉여가 같으면 조각 배열 순서(단건 엔진이 정한 고정 순서)다 — 입력 순서와 무관하다. `cut`이 음수면 같은 비율로 늘린다(상한 없음).
 */
function cutBuckets(buckets: ReducibleIncomeBucket[], cut: number, total: number): ReducibleIncomeBucket[] {
  const sign = cut < 0 ? -1 : 1;
  const amount = Math.abs(cut);
  const shares = buckets.map((b) => {
    const exact = safeMultiplyThenDivide(amount, b.income, total);
    // 잉여는 2^53을 넘을 수 있어 정수 나머지로 잰다(차손·소득 모두 원 단위 정수).
    return { exact, rem: Number((BigInt(amount) * BigInt(b.income)) % BigInt(total)) };
  });
  let left = amount - shares.reduce((s, x) => s + x.exact, 0);
  const order = shares.map((_, i) => i).sort((a, b) => shares[b].rem - shares[a].rem || a - b);
  for (const i of order) {
    if (left <= 0) break;
    // 줄일 때는 조각 소득을 넘지 않는다(늘릴 때는 상한 없음)
    if (sign < 0 || shares[i].exact < buckets[i].income) {
      shares[i].exact += 1;
      left -= 1;
    }
  }
  return buckets.map((b, i) => ({ ...b, income: b.income - sign * shares[i].exact }));
}

/**
 * 자산별 세액감면형 B′ — 차손을 받지 않았거나 감면소득이 없으면 `undefined`(통산 전 B 그대로).
 *
 * ⚠️ B′가 0이어도 값을 싣는다. 감면 재계산 경로의 **진입 판정은 통산 전 B**로 한다 — `reducibleIncome`을 0으로 덮으면
 *    레거시 합산이 단건 엔진의 감면액을 그대로 더한다(계획서 §4.4 C-1, 실측 감면 0 → 3,636,000).
 */
export function reducibleAfterLossOf(
  records: AssetRecord[],
  offset: Pick<LossOffsetOutput, "incomeAfterOffset" | "partIncomeAfterOffset">,
): (ReducibleAfterLoss | undefined)[] {
  return records.map((r, i) => {
    if (r.result.isExempt) return undefined;
    const buckets = bucketsOf(r.result);
    const total = buckets.reduce((s, b) => s + b.income, 0);
    if (total <= 0) return undefined;
    const cut = reducibleShiftOf(netLossOnReducibleUnit(r, offset.incomeAfterOffset[i], offset.partIncomeAfterOffset[i]), total);
    if (cut === 0) return undefined;
    const after = cutBuckets(buckets, cut, total);
    return {
      buckets: after,
      reducibleIncome: safeMultiplyThenDivide(r.result.reducibleIncome ?? 0, total - cut, total),
    };
  });
}
