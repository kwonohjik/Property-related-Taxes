/**
 * 장기보유특별공제 **보유분·거주분 분리**의 표시 단일 소스.
 *
 * ## 왜 필요한가
 *
 * 엔진은 표2(1세대1주택 고가주택)·§95⑤(용도변경)에서 정식 sub-step을 emit한다
 * (`transfer-tax-lthd-steps.ts` — 「보유 기간분 장특」·「거주 기간분 장특」).
 * 상세명세서는 그것을 우선 읽었지만 **신고서 양식은 한 번도 읽지 않고** UI에서 표2 4%/년으로
 * 다시 안분했다(`splitLtDeduction`). 그래서 같은 화면의 두 카드가 같은 항목을 다른 금액으로
 * 표시했다 — 실측 보유분 **448,000,000(신고서) vs 224,000,000(엔진·명세서)**.
 *
 * §95⑤ 용도변경은 보유분이 「비주택 기간 표1 + 주택 기간 표2」의 **혼합**이라 UI의 균일
 * 4%/년 재안분으로는 애초에 재현할 수 없다(결과탭 코드리뷰 #015 #067 #068 #085).
 *
 * ⇒ 엔진 sub-step이 있으면 **그것이 정본**이고, 없을 때만 UI 계산으로 떨어진다.
 */
import type { CalculationStep } from "@/lib/tax-engine/types/transfer.types";
import { splitLtDeduction } from "@/components/calc/results/transfer/FilingFormTableHelpers";

const HOLDING_LABEL = "보유 기간분 장특";
const RESIDENCE_LABEL = "거주 기간분 장특";

export interface LthdSplit {
  holdingAmount: number;
  residenceAmount: number;
  /** 엔진 sub-step에서 왔는가 — 표시 문구·법령 근거 분기에 쓴다. */
  fromEngine: boolean;
}

function findStep(steps: CalculationStep[] | undefined, label: string) {
  return steps?.find((s) => s.label === label);
}

/**
 * 표2 적용 여부 — **엔진 신호 우선**.
 *
 * 종전에는 세 곳이 각각 `residenceMs >= 24` 휴리스틱으로 재판정해, 표1로 계산된 자산에도
 * 「거주 기간분」을 만들어내고 「표2 적용」이라 적었다. 엔진이 거주분 sub-step을 냈는지가
 * 가장 직접적인 신호다.
 */
export function isTable2Applied(
  steps: CalculationStep[] | undefined,
  fallbackUseTable2: boolean,
): boolean {
  const res = findStep(steps, RESIDENCE_LABEL);
  if (res) return res.amount > 0;
  return findStep(steps, HOLDING_LABEL) ? false : fallbackUseTable2;
}

/**
 * 보유분·거주분을 구한다.
 *
 * @param fallback 엔진 sub-step이 없을 때 쓰는 UI 계산 인자. 인자가 갈리면 단일 소스가
 *   아니게 되므로(memory `feedback_shared_predicate_argument_parity`) 호출부는 같은 값을 넘긴다.
 */
export function resolveLthdSplit(
  steps: CalculationStep[] | undefined,
  fallback: { total: number; holdingMs: number; residenceMs: number; useTable2: boolean },
): LthdSplit {
  const h = findStep(steps, HOLDING_LABEL);
  if (h) {
    const res = findStep(steps, RESIDENCE_LABEL);
    return { holdingAmount: h.amount, residenceAmount: res?.amount ?? 0, fromEngine: true };
  }
  const split = splitLtDeduction(
    fallback.total,
    fallback.holdingMs,
    fallback.residenceMs,
    fallback.useTable2,
  );
  return { ...split, fromEngine: false };
}
