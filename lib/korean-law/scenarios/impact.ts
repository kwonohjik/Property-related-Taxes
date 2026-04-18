/**
 * Impact 시나리오 — 개정 전후 영향도 분석
 *
 * 트리거: "영향|영향도|효과|파급|적용범위|위헌|위법|헌법불합치"
 * 부착 체인: chain_law_system
 *
 * 보강 로직:
 *   1. 본법 + 시행령·시행규칙 위임 관계를 서술적 note 섹션으로 제공
 *      (법제처 API가 위임조항 파싱 API를 직접 노출하지 않으므로 메타 가이드 제공)
 *   2. 헌법재판소 결정 3건 + 대법원 위법·무효 판결 5건
 *   3. 조세심판원 취소 결정 5건
 *
 * 한계: 법제처 3단비교(thdCmp) 엔드포인트 노출은 Phase 3 이상. 현재는
 * 사용자가 개정 영향도를 가늠할 수 있는 판례·결정 묶음 제공.
 */

import { searchDecisions } from "../client";
import type { ChainSection } from "../types";
import type { ScenarioRunner } from ".";

const TRIGGERS = [
  /영향|영향도|효과|파급|적용\s*범위/,
  /위헌|위법|헌법\s*불합치/,
  /무효|취소|폐지/,
];

export const impactScenario: ScenarioRunner = {
  name: "impact",
  chains: ["law_system", "full_research"] as const,
  triggers: TRIGGERS,
  async run(ctx) {
    const q = ctx.cleanedQuery ?? ctx.query;
    const [constDec, prec, tribunal] = await Promise.all([
      searchDecisions(`${q} 위헌 위법 헌법불합치`, "expc", 1, 3).catch(() => null),
      searchDecisions(`${q} 무효 취소`, "prec", 1, 5).catch(() => null),
      searchDecisions(`${q} 취소`, "ppc", 1, 5).catch(() => null),
    ]);

    const sections: ChainSection[] = [
      {
        kind: "note",
        heading: "[시나리오: impact] 개정 영향도 분석 안내",
        note:
          "이 섹션은 법제처 3단비교 API를 직접 활용하지 않고, 개정의 사회적 영향을 가늠할 수 있는 판례·결정을 묶어 제공합니다. 실제 개정 전후 조문 대조는 법제처 원문 링크에서 확인하세요.",
      },
    ];
    if (constDec && constDec.items.length > 0) {
      sections.push({
        kind: "decisions",
        heading: "[시나리오: impact] 헌법재판소 결정 (위헌/헌법불합치)",
        decisions: constDec.items,
      });
    }
    if (prec && prec.items.length > 0) {
      sections.push({
        kind: "decisions",
        heading: "[시나리오: impact] 대법원 무효·취소 판결",
        decisions: prec.items,
      });
    }
    if (tribunal && tribunal.items.length > 0) {
      sections.push({
        kind: "decisions",
        heading: "[시나리오: impact] 조세심판원 취소 결정",
        decisions: tribunal.items,
      });
    }
    return sections;
  },
};
