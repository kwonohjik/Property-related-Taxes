/**
 * delegation 시나리오 — 위임입법 미이행·하위법령 공백 감시
 *
 * Design Ref: §7.1 / Plan FR-06
 * 체인: full_research / law_system 부착
 * 트리거: "위임", "하위법령", "시행령 미이행"
 */

import { searchLawMany } from "../client";
import type { ChainSection } from "../types";
import type { ScenarioContext, ScenarioRunner } from "./index";

async function run(ctx: ScenarioContext): Promise<ChainSection[]> {
  const q = ctx.cleanedQuery || ctx.query;
  const sections: ChainSection[] = [];

  // 상위법 + 시행령 + 시행규칙을 모두 검색하여 누락 확인
  const [parent, decree, regulation] = await Promise.all([
    searchLawMany(q, 1).catch(() => []),
    searchLawMany(`${q} 시행령`, 1).catch(() => []),
    searchLawMany(`${q} 시행규칙`, 1).catch(() => []),
  ]);

  const rows: { layer: string; found: boolean; name?: string; date?: string }[] = [
    { layer: "본법(법률)", found: parent.length > 0, name: parent[0]?.lawName, date: parent[0]?.promulgationDate },
    { layer: "시행령", found: decree.length > 0, name: decree[0]?.lawName, date: decree[0]?.promulgationDate },
    { layer: "시행규칙", found: regulation.length > 0, name: regulation[0]?.lawName, date: regulation[0]?.promulgationDate },
  ];

  const missing = rows.filter((r) => !r.found);
  const present = rows.filter((r) => r.found);

  if (present.length > 0) {
    const lawItems = [parent[0], decree[0], regulation[0]].filter((x): x is NonNullable<typeof x> => Boolean(x));
    sections.push({ kind: "laws", heading: "법체계 (본법·시행령·시행규칙)", laws: lawItems });
  }

  if (missing.length > 0) {
    sections.push({
      kind: "note",
      heading: "위임입법 미이행 가능성",
      note:
        `⚠️ 다음 계층의 하위법령이 검색되지 않았습니다 (위임입법 미이행 의심 또는 단순 검색 실패):\n` +
        missing.map((r) => `  - ${r.layer}`).join("\n") +
        `\n\n실제 미이행 여부는 법제처 사이트에서 직접 확인하시기 바랍니다. LLM은 추측하지 마세요.`,
    });
  } else {
    sections.push({
      kind: "note",
      heading: "위임입법 현황",
      note: "상위·하위 법령 3개 계층 모두 검색됨. 위임입법 이행 상태로 추정.",
    });
  }

  return sections;
}

export const delegationScenario: ScenarioRunner = {
  name: "delegation",
  chains: ["full_research", "law_system"],
  triggers: [/위임/, /하위\s*법령/, /시행령\s*미?이행/, /위임\s*입법/],
  run,
};
