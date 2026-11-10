/**
 * 함께 양도(일괄) 컴패니언 조합원입주권의 §89①4호 비과세·고가 안분 — 화면 카드(`CompanionRightExemptionNote`)와
 * 상세명세서(`DetailedStatementHelpers`)가 **같은 사실·같은 문구 조각**을 읽도록 모은 정본이다.
 *
 * 표시 전용 — 세액은 엔진 값 그대로다. 12억 비교는 안분한 입주권 몫의 양도가액이며, 일괄양도에서의 비교 기준은
 * 정면 해석례를 확인하지 못했다(`docs/00-pm/companion-right-4ho-open.plan.md` Q-2).
 */
import { formatHighValueThresholdLabel } from "@/lib/tax-engine/one-house/threshold";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

export type CompanionRightDetail = Pick<
  RedevelopmentResult,
  "oneRightExemptionApplied" | "oneRightHighValueApplied" | "oneRightExemptionClause" | "highValueAllocation"
>;

const CLAUSE_LABEL = { ga: "가목", na: "나목" } as const;
const CLAUSE_BASIS = {
  ga: "양도일 현재 다른 주택·분양권이 없는 1세대",
  na: "양도일 현재 다른 주택 1채를 보유하고 그 취득일부터 기한 안에 양도하는 1세대",
} as const;

export type CompanionRightFacts =
  | {
      kind: "highValue";
      label: string;
      /** 예: "12억" */
      threshold: string;
      /** 과세 비율(0~1) */
      taxableRatio: number;
      nontaxableGain: number;
      taxableGain: number;
    }
  | { kind: "exempt"; label: string; basis: string };

export function companionRightFacts(detail: CompanionRightDetail | undefined): CompanionRightFacts | null {
  const clause = detail?.oneRightExemptionClause;
  if (!detail || !clause) return null;
  const label = CLAUSE_LABEL[clause];
  const alloc = detail.oneRightHighValueApplied ? detail.highValueAllocation : undefined;
  if (alloc) {
    return {
      kind: "highValue",
      label,
      threshold: formatHighValueThresholdLabel(alloc.nontaxableThreshold),
      taxableRatio: alloc.taxableRatio,
      nontaxableGain: alloc.nontaxableGain,
      taxableGain: alloc.taxableGain,
    };
  }
  if (!detail.oneRightExemptionApplied) return null;
  return { kind: "exempt", label, basis: CLAUSE_BASIS[clause] };
}

/**
 * 상세명세서 자산별 행에 덧붙이는 한 문장(원 단위 숫자는 명세서 관례대로 접미사 없이).
 * 화면 카드와 같은 사실(`companionRightFacts`)에서 만든다 — 어느 목으로 비과세·안분이 났는지와 12억 비교 기준을 함께 밝힌다.
 */
export function companionRightStatementText(detail: CompanionRightDetail | undefined, transferPrice: number): string | undefined {
  const facts = companionRightFacts(detail);
  if (!facts) return undefined;
  if (facts.kind === "highValue") {
    return (
      `§89①4호 ${facts.label} — ${facts.threshold} 초과 안분: 이 입주권 몫의 양도가액 ${transferPrice.toLocaleString()}이 ${facts.threshold}을 넘어 ` +
      `넘는 비율(${(facts.taxableRatio * 100).toFixed(2)}%)만 과세 — 비과세 양도차익 ${facts.nontaxableGain.toLocaleString()} · 과세 양도차익 ${facts.taxableGain.toLocaleString()} ` +
      `(${facts.threshold} 비교는 함께 양도 가액을 안분한 입주권 몫의 양도가액으로 했습니다 — 확인 필요)`
    );
  }
  return `§89①4호 ${facts.label} — 1세대1입주권 비과세: 세대가 보유한 유일한 조합원입주권이고 ${facts.basis}라는 입력을 기준으로 비과세`;
}
