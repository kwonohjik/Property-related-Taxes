/**
 * compliance 시나리오 — 조례의 상위법 적합성 검증
 *
 * Design Ref: §7.1 / Plan FR-06
 * 체인: ordinance_compare / full_research 부착
 * 트리거: "조례 적합성", "상위법 위반", "조례 유효성"
 */

import { searchLawMany, searchDecisions } from "../client";
import type { ChainSection } from "../types";
import type { ScenarioContext, ScenarioRunner } from "./index";

async function run(ctx: ScenarioContext): Promise<ChainSection[]> {
  const q = ctx.cleanedQuery || ctx.query;
  const sections: ChainSection[] = [];

  const [parentLaw, ordinances] = await Promise.all([
    searchLawMany(q, 2).catch(() => []),
    searchDecisions(q, "ordin", 1, 5).catch(() => ({ items: [], totalCount: 0, page: 1, pageSize: 5 })),
  ]);

  if (parentLaw.length > 0) {
    sections.push({ kind: "laws", heading: "관련 상위법령", laws: parentLaw });
  }

  if (ordinances.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "관련 자치법규(조례)",
      decisions: ordinances.items,
    });
    sections.push({
      kind: "note",
      heading: "적합성 검증 가이드",
      note:
        `상위법령과 조례를 대조하여 다음을 확인하세요:\n` +
        `  1. 조례의 규율 사항이 법률의 위임 범위 내인지\n` +
        `  2. 권리 제한 조항이 있으면 법률적 근거가 있는지\n` +
        `  3. 벌칙·과태료가 조례에서 직접 규정되었다면 위헌 소지\n\n` +
        `자동 판단은 불가능하므로 법률 전문가와 상담하세요. LLM은 임의로 위법 판정을 내리지 마세요.`,
    });
  } else {
    sections.push({
      kind: "note",
      heading: "자치법규 검색 결과",
      note: "[NOT_FOUND] 관련 자치법규를 찾지 못했습니다. LLM은 내용을 추측/생성하지 마세요.",
    });
  }

  return sections;
}

export const complianceScenario: ScenarioRunner = {
  name: "compliance",
  chains: ["ordinance_compare", "full_research"],
  triggers: [/적합성/, /상위법\s*위반/, /조례\s*유효/, /위임\s*범위/],
  run,
};
