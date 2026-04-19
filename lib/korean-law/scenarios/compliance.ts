/**
 * compliance 시나리오 — 조례의 상위법 적합성 검증
 *
 * Design Ref: §7.1 / Plan FR-06
 * 체인: ordinance_compare / full_research 부착
 * 트리거: "조례 적합성", "상위법 위반", "조례 유효성"
 */

import { searchLawMany, searchDecisions } from "../client";
import { formatMarkerMessage } from "../markers";
import type { ChainSection, DecisionSearchPage } from "../types";
import type { ScenarioContext, ScenarioRunner } from "./index";

const EMPTY: DecisionSearchPage = {
  items: [],
  totalCount: 0,
  page: 1,
  pageSize: 5,
};

async function run(ctx: ScenarioContext): Promise<ChainSection[]> {
  const q = ctx.cleanedQuery || ctx.query;
  const sections: ChainSection[] = [];

  // 원본 MCP compliance: 상위법 + 자치법규 + 헌재 위헌결정(expc) + 행심 위법취소(ppc)
  const [parentLaw, ordinances, consDecisions, tribunal] = await Promise.all([
    searchLawMany(q, 2).catch(() => []),
    searchDecisions(q, "ordin", 1, 5).catch(() => EMPTY),
    searchDecisions(`${q} 위헌`, "expc", 1, 5).catch(() => EMPTY),
    searchDecisions(`${q} 위법`, "ppc", 1, 3).catch(() => EMPTY),
  ]);

  if (parentLaw.length > 0) {
    sections.push({
      kind: "laws",
      heading: "[시나리오: compliance] 관련 상위법령",
      laws: parentLaw,
    });
  }

  if (ordinances.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "[시나리오: compliance] 관련 자치법규(조례)",
      decisions: ordinances.items,
    });
  } else {
    sections.push({
      kind: "note",
      heading: "[시나리오: compliance] 자치법규 검색 결과",
      note: formatMarkerMessage("NOT_FOUND", "관련 자치법규를 찾지 못했습니다"),
    });
  }

  if (consDecisions.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "[시나리오: compliance] 헌재 위헌·한정위헌 결정",
      decisions: consDecisions.items,
    });
  }

  if (tribunal.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "[시나리오: compliance] 조세심판·행정심판 위법 판단",
      decisions: tribunal.items,
    });
  }

  sections.push({
    kind: "note",
    heading: "[시나리오: compliance] 적합성 검증 가이드",
    note:
      `상위법령·헌재결정·행심 결정을 대조하여 다음을 확인하세요:\n` +
      `  1. 조례의 규율 사항이 법률의 위임 범위 내인지\n` +
      `  2. 권리 제한 조항이 있으면 법률적 근거가 있는지\n` +
      `  3. 벌칙·과태료가 조례에서 직접 규정되었다면 위헌 소지\n\n` +
      `자동 판단은 불가능하므로 법률 전문가와 상담하세요. LLM은 임의로 위법 판정을 내리지 마세요.`,
  });

  return sections;
}

export const complianceScenario: ScenarioRunner = {
  name: "compliance",
  chains: ["ordinance_compare", "full_research"],
  triggers: [
    /적합성/,
    /상위법\s*위반/,
    /조례\s*유효/,
    /위임\s*범위/,
    /위헌/,
    /규제\s*준수/,
    /컴플라이언스/,
  ],
  run,
};
