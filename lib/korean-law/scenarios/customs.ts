/**
 * customs 시나리오 — 관세3법 + 관세 판례·심판
 *
 * Design Ref: §7.1 Architecture Decisions / Plan FR-06
 * 체인: full_research / action_basis 부착
 * 트리거: "관세", "수입", "수출", "통관"
 */

import { searchLawMany, searchDecisions } from "../client";
import type { ChainSection } from "../types";
import type { ScenarioContext, ScenarioRunner } from "./index";

async function run(ctx: ScenarioContext): Promise<ChainSection[]> {
  const q = ctx.cleanedQuery || ctx.query;
  const sections: ChainSection[] = [];

  // 관세3법: 관세법 / 자유무역협정의 이행을 위한 관세법의 특례에 관한 법률 / FTA이행법
  const laws = await searchLawMany(`${q} 관세`, 3).catch(() => []);
  if (laws.length > 0) {
    sections.push({ kind: "laws", heading: "관세 관련 법령", laws });
  } else {
    sections.push({
      kind: "note",
      heading: "관세 관련 법령",
      note: "[NOT_FOUND] 관련 법령을 찾지 못했습니다. LLM은 내용을 추측/생성하지 마세요.",
    });
  }

  // 관세 관련 조세심판례
  const ppc = await searchDecisions(q, "ppc", 1, 3).catch(() => ({ items: [], totalCount: 0, page: 1, pageSize: 3 }));
  if (ppc.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "관세 관련 조세심판례",
      decisions: ppc.items,
    });
  }

  return sections;
}

export const customsScenario: ScenarioRunner = {
  name: "customs",
  chains: ["full_research", "action_basis"],
  triggers: [/관세/, /수입[\s·]?관세/, /수출[\s·]?관세/, /통관/, /FTA/, /자유[\s·]?무역/],
  run,
};
