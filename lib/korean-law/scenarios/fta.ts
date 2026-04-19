/**
 * fta 시나리오 — FTA 조약·이행법·관세율표
 *
 * Design Ref: §7.1 / Plan FR-06
 * 체인: full_research 부착
 * 트리거: "FTA", "자유무역", "협정세율", "원산지"
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

  // 원본 MCP customs/fta: 조약(trty) + 관세해석례(detc w/ "관세") + 조세심판(ppc)
  const [ftaLaws, treaties, customsInterpret, tribunal] = await Promise.all([
    searchLawMany("자유무역협정", 3).catch(() => []),
    searchDecisions(q, "trty", 1, 5).catch(() => EMPTY),
    searchDecisions(`${q} 관세`, "detc", 1, 5).catch(() => EMPTY),
    searchDecisions(`${q} 관세`, "ppc", 1, 3).catch(() => EMPTY),
  ]);

  if (ftaLaws.length > 0) {
    sections.push({
      kind: "laws",
      heading: "[시나리오: fta] FTA 이행법령",
      laws: ftaLaws,
    });
  } else {
    sections.push({
      kind: "note",
      heading: "[시나리오: fta] FTA 이행법령",
      note: formatMarkerMessage("NOT_FOUND", "FTA 이행법령을 찾지 못했습니다"),
    });
  }

  if (treaties.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "[시나리오: fta] 관련 조약",
      decisions: treaties.items,
    });
  }

  if (customsInterpret.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "[시나리오: fta] 관세청 해석례",
      decisions: customsInterpret.items,
    });
  }

  if (tribunal.items.length > 0) {
    sections.push({
      kind: "decisions",
      heading: "[시나리오: fta] 관련 조세심판 결정",
      decisions: tribunal.items,
    });
  }

  sections.push({
    kind: "note",
    heading: "[시나리오: fta] FTA 세율표 안내",
    note:
      "FTA 협정세율표는 법제처 Open API가 직접 제공하지 않습니다.\n" +
      "관세청 UNIPASS (https://unipass.customs.go.kr) 또는 관세법령정보포털에서\n" +
      "HS코드·원산지별 세율을 확인하세요. LLM은 임의로 세율을 생성하지 마세요.",
  });

  return sections;
}

export const ftaScenario: ScenarioRunner = {
  name: "fta",
  chains: ["full_research"],
  triggers: [
    /FTA/,
    /자유\s*무역/,
    /협정\s*세율/,
    /원산지\s*증명/,
    /원산지/,
    /관세/,
    /HS\s*코드/i,
    /조약/,
  ],
  run,
};
