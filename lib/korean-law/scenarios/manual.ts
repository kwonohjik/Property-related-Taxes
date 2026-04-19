/**
 * manual 시나리오 — 공무원 실무 매뉴얼 (행정규칙 + 자치법규 + 해석례)
 *
 * Design Ref: §7.1 / Plan FR-06
 * 체인: full_research / procedure_detail 부착
 * 트리거: "매뉴얼", "지침", "실무", "업무처리"
 */

import { searchDecisions } from "../client";
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

  // 원본 MCP manual 체인 구성: 행정규칙(admrul) + 법령해석례(detc) + 자치법규(ordin)
  const [admrul, detc, ordin] = await Promise.all([
    searchDecisions(q, "admrul", 1, 5).catch(() => EMPTY),
    searchDecisions(q, "detc", 1, 5).catch(() => EMPTY),
    searchDecisions(q, "ordin", 1, 3).catch(() => EMPTY),
  ]);

  sections.push(
    admrul.items.length > 0
      ? { kind: "decisions", heading: "[시나리오: manual] 실무 관련 행정규칙", decisions: admrul.items }
      : {
          kind: "note",
          heading: "[시나리오: manual] 실무 관련 행정규칙",
          note: formatMarkerMessage("NOT_FOUND", "행정규칙을 찾지 못했습니다"),
        }
  );

  sections.push(
    detc.items.length > 0
      ? { kind: "decisions", heading: "[시나리오: manual] 법령해석례 (실무 참고)", decisions: detc.items }
      : {
          kind: "note",
          heading: "[시나리오: manual] 법령해석례",
          note: formatMarkerMessage("NOT_FOUND", "해석례를 찾지 못했습니다"),
        }
  );

  if (ordin.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "[시나리오: manual] 관련 자치법규",
      decisions: ordin.items,
    });
  }

  return sections;
}

export const manualScenario: ScenarioRunner = {
  name: "manual",
  chains: ["full_research", "procedure_detail"],
  triggers: [
    /매뉴얼/,
    /지침/,
    /실무/,
    /업무\s*처리/,
    /사무\s*처리/,
    /절차/,
    /안내/,
    /신청\s*방법/,
  ],
  run,
};
