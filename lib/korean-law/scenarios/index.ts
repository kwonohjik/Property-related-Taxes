/**
 * 체인 시나리오 자동 탐지 & 확장
 *
 * upstream: chrisryugj/korean-law-mcp src/tools/scenarios/index.ts
 *
 * 체인 실행 시 쿼리·rawText 를 regex 매칭해 해당 시나리오를 자동 감지하고,
 * 체인 결과에 시나리오 전용 보강 섹션(가산세 감경 판례 / 개정 타임라인 / 영향도 등)을
 * 첨부한다.
 *
 * 현재 구현된 세법 실무 직결 시나리오 3종:
 *   - penalty    : 가산세·과태료 감경 판례 (chain_action_basis)
 *   - timeline   : 세법 개정 시점별 판례·해석례 (chain_amendment_track)
 *   - impact     : 개정 전후 영향도 분석 (chain_law_system)
 *
 * 향후 추가 예정(upstream 레퍼런스): delegation, compliance, manual, customs.
 */

import type { ChainSection, ChainType } from "../types";
import { formatMarkerMessage } from "../markers";
import { penaltyScenario } from "./penalty";
import { timelineScenario } from "./timeline";
import { impactScenario } from "./impact";
import { customsScenario } from "./customs";
import { manualScenario } from "./manual";
import { delegationScenario } from "./delegation";
import { complianceScenario } from "./compliance";
import { ftaScenario } from "./fta";

export type ScenarioName =
  | "penalty"
  | "timeline"
  | "impact"
  | "customs"
  | "manual"
  | "delegation"
  | "compliance"
  | "fta";

export interface ScenarioContext {
  /** 사용자 쿼리 */
  query: string;
  /** 자연어 날짜 범위 추출 후 cleaned query */
  cleanedQuery?: string;
  /** document_review 의 rawText (필요 시) */
  rawText?: string;
}

export interface ScenarioRunner {
  name: ScenarioName;
  /** 이 시나리오가 부착될 수 있는 chain 목록 */
  chains: ReadonlyArray<ChainType>;
  /** 쿼리 매칭 정규식 (하나라도 히트하면 발동) */
  triggers: RegExp[];
  /** 섹션 생성 함수 (실패 시 null — chains.ts 의 secOrSkip 과 별개, 조용히 skip) */
  run: (ctx: ScenarioContext) => Promise<ChainSection[]>;
}

const SCENARIOS: ScenarioRunner[] = [
  penaltyScenario,
  timelineScenario,
  impactScenario,
  customsScenario,
  manualScenario,
  delegationScenario,
  complianceScenario,
  ftaScenario,
];

/**
 * 쿼리·체인 조합에 매칭되는 시나리오 자동 탐지.
 *
 * 반환: 매칭된 시나리오 이름 배열 (중복 없음, 우선순위 순)
 */
export function detectScenarios(
  chain: ChainType,
  ctx: ScenarioContext
): ScenarioName[] {
  const haystack = `${ctx.query} ${ctx.rawText ?? ""}`;
  const matched: ScenarioName[] = [];
  for (const s of SCENARIOS) {
    if (!s.chains.includes(chain)) continue;
    const hit = s.triggers.some((re) => re.test(haystack));
    if (hit) matched.push(s.name);
  }
  return matched;
}

/**
 * 감지된 시나리오들을 순차 실행해 결과 섹션 집합 반환.
 * 한 시나리오가 실패하면 해당 섹션만 누락, 나머지는 정상 반환.
 */
export async function runScenarios(
  chain: ChainType,
  ctx: ScenarioContext,
  names: ScenarioName[]
): Promise<ChainSection[]> {
  const runners = SCENARIOS.filter(
    (s) => names.includes(s.name) && s.chains.includes(chain)
  );
  const results = await Promise.allSettled(runners.map((r) => r.run(ctx)));
  const sections: ChainSection[] = [];
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === "fulfilled") {
      sections.push(...res.value);
    } else {
      // 시나리오 실패는 note 섹션으로 대체 (체인 전체는 보존)
      const reason =
        res.reason instanceof Error ? res.reason.message : String(res.reason);
      sections.push({
        kind: "note",
        heading: `[시나리오: ${runners[i].name}] 실행 실패`,
        note: formatMarkerMessage("FAILED", `사유: ${reason}`),
      });
    }
  }
  return sections;
}
