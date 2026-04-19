/**
 * Penalty 시나리오 — 가산세·과태료 감경 판례 수집
 *
 * 트리거: 쿼리에 "가산세|과태료|벌칙|감경|정당한 사유|불가피|경정청구|과징금" 등
 * 부착 체인: chain_action_basis
 *
 * 보강 로직:
 *   1. "감경 | 정당한 사유" 키워드로 판례 5건 추가 검색
 *   2. 조세심판원(ppc) 결정 5건 추가 — 실제 감경 결정 다수
 *   3. 법령해석례(detc) 3건 — 가산세 제외 사유 유권해석
 *
 * 모두 0건이어도 최소 1개 NOT_FOUND 섹션을 반환해 시나리오 감지 사실을 사용자에게 노출.
 */

import { searchDecisions } from "../client";
import { formatMarkerMessage } from "../markers";
import type { ChainSection } from "../types";
import type { ScenarioRunner } from ".";

const TRIGGERS = [
  /가산세|과태료|벌칙|과징금/,
  /감경|경감|정당한\s*사유|불가피|면제|제외/,
  /경정청구/,
];

async function safePage<T>(p: () => Promise<T>): Promise<T | null> {
  try {
    return await p();
  } catch {
    return null;
  }
}

/** 쿼리에 이미 키워드가 있으면 재강화하지 않음 (enriched 중복으로 0건 반환 방지) */
function maybeEnrich(base: string): string {
  const hasMitig = /감경|경감|정당한\s*사유/.test(base);
  return hasMitig ? base : `${base} 감경 정당한 사유`;
}

export const penaltyScenario: ScenarioRunner = {
  name: "penalty",
  chains: ["action_basis", "full_research"] as const,
  triggers: TRIGGERS,
  async run(ctx) {
    const base = ctx.cleanedQuery ?? ctx.query;
    const enriched = maybeEnrich(base);

    const [prec, tribunal, interpretation] = await Promise.all([
      safePage(() => searchDecisions(enriched, "prec", 1, 5)),
      safePage(() => searchDecisions(enriched, "ppc", 1, 5)),
      safePage(() => searchDecisions(enriched, "detc", 1, 3)),
    ]);

    const sections: ChainSection[] = [];
    if (prec && prec.items.length > 0) {
      sections.push({
        kind: "decisions",
        heading: "[시나리오: penalty] 감경 판례",
        decisions: prec.items,
      });
    }
    if (tribunal && tribunal.items.length > 0) {
      sections.push({
        kind: "decisions",
        heading: "[시나리오: penalty] 조세심판원 감경 결정",
        decisions: tribunal.items,
      });
    }
    if (interpretation && interpretation.items.length > 0) {
      sections.push({
        kind: "decisions",
        heading: "[시나리오: penalty] 법령해석례 (가산세 제외 사유)",
        decisions: interpretation.items,
      });
    }

    // 모두 0건이어도 시나리오 감지 사실을 최소 1섹션으로 노출.
    if (sections.length === 0) {
      sections.push({
        kind: "note",
        heading: "[시나리오: penalty] 감경 관련 판례 없음",
        note: formatMarkerMessage(
          "NOT_FOUND",
          `"${enriched}" 키워드로는 감경 관련 결정이 조회되지 않았습니다. 더 짧은 키워드(예: "가산세 감경")로 재시도하세요.`
        ),
      });
    }
    return sections;
  },
};
