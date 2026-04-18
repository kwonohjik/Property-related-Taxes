/**
 * manual 시나리오 — 공무원 실무 매뉴얼 (행정규칙 + 자치법규 + 해석례)
 *
 * Design Ref: §7.1 / Plan FR-06
 * 체인: full_research / procedure_detail 부착
 * 트리거: "매뉴얼", "지침", "실무", "업무처리"
 */

import { searchDecisions } from "../client";
import type { ChainSection } from "../types";
import type { ScenarioContext, ScenarioRunner } from "./index";

async function run(ctx: ScenarioContext): Promise<ChainSection[]> {
  const q = ctx.cleanedQuery || ctx.query;
  const sections: ChainSection[] = [];

  const [admrul, detc] = await Promise.all([
    searchDecisions(q, "admrul", 1, 5).catch(() => ({ items: [], totalCount: 0, page: 1, pageSize: 5 })),
    searchDecisions(q, "detc", 1, 5).catch(() => ({ items: [], totalCount: 0, page: 1, pageSize: 5 })),
  ]);

  sections.push(
    admrul.items.length > 0
      ? { kind: "decisions", heading: "실무 관련 행정규칙", decisions: admrul.items }
      : { kind: "note", heading: "실무 관련 행정규칙", note: "[NOT_FOUND] 행정규칙을 찾지 못했습니다. LLM은 내용을 추측/생성하지 마세요." }
  );

  sections.push(
    detc.items.length > 0
      ? { kind: "decisions", heading: "법령해석례 (실무 참고)", decisions: detc.items }
      : { kind: "note", heading: "법령해석례", note: "[NOT_FOUND] 해석례를 찾지 못했습니다. LLM은 내용을 추측/생성하지 마세요." }
  );

  return sections;
}

export const manualScenario: ScenarioRunner = {
  name: "manual",
  chains: ["full_research", "procedure_detail"],
  triggers: [/매뉴얼/, /지침/, /실무/, /업무\s*처리/, /사무\s*처리/],
  run,
};
