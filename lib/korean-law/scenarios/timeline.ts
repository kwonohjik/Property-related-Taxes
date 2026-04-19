/**
 * Timeline 시나리오 — 세법 개정 시점별 판례·해석례 매핑
 *
 * 트리거: "개정|시행|타임라인|시계열|변화|전후|구법|신법"
 * 부착 체인: chain_amendment_track
 *
 * 보강 로직:
 *   1. 쿼리로 대법원 판례 10건을 선고일 내림차순 정렬 (법제처 sort 파라미터 사용 불가 시 클라이언트 정렬)
 *   2. 법령해석례(detc) 5건 — 개정 직후 해석례
 *   3. 날짜 범위가 지정됐으면 fromDate~toDate 구간에 해당하는 건만 필터
 */

import { searchDecisions } from "../client";
import { formatMarkerMessage } from "../markers";
import type { ChainSection } from "../types";
import type { ScenarioRunner } from ".";
import { parseDateRange } from "../date-parser";

const TRIGGERS = [
  /개정|시행|타임라인|시계열|연혁/,
  /변화|전후|구법|신법|과거/,
  /\d{4}\s*년.*\d{4}\s*년/,
];

function ymdFrom(raw: string): number {
  // 날짜 문자열 "20240318" / "2024-03-18" / "2024. 3. 18." 모두 수용
  const digits = raw.replace(/\D/g, "");
  return parseInt(digits.slice(0, 8), 10) || 0;
}

export const timelineScenario: ScenarioRunner = {
  name: "timeline",
  chains: ["amendment_track", "full_research"] as const,
  triggers: TRIGGERS,
  async run(ctx) {
    const { fromDate, toDate, cleanedQuery } = parseDateRange(ctx.query);
    const q = cleanedQuery || ctx.query;

    const [prec, interpretation] = await Promise.all([
      searchDecisions(q, "prec", 1, 10).catch(() => null),
      searchDecisions(q, "detc", 1, 5).catch(() => null),
    ]);

    // 날짜 필터 (있으면) — 법제처 API 자체 필터링이 불안정해 클라이언트 사이드 필터
    const from = fromDate ? parseInt(fromDate, 10) : 0;
    const to = toDate ? parseInt(toDate, 10) : 99999999;
    const inRange = <T extends { date: string }>(arr: T[]): T[] =>
      arr
        .filter((item) => {
          const y = ymdFrom(item.date);
          if (!y) return true; // 날짜 없는 항목은 제외하지 않음
          return y >= from && y <= to;
        })
        .sort((a, b) => ymdFrom(b.date) - ymdFrom(a.date));

    const sections: ChainSection[] = [];
    if (prec && prec.items.length > 0) {
      const filtered = inRange(prec.items);
      if (filtered.length > 0) {
        sections.push({
          kind: "decisions",
          heading: `[시나리오: timeline] 판례 타임라인${
            fromDate || toDate ? ` (${fromDate ?? "~"} ~ ${toDate ?? "~"})` : ""
          }`,
          decisions: filtered,
        });
      }
    }
    if (interpretation && interpretation.items.length > 0) {
      const filtered = inRange(interpretation.items);
      if (filtered.length > 0) {
        sections.push({
          kind: "decisions",
          heading: "[시나리오: timeline] 법령해석례 (개정 직후)",
          decisions: filtered,
        });
      }
    }
    if (sections.length === 0) {
      sections.push({
        kind: "note",
        heading: "[시나리오: timeline] 타임라인 자료 없음",
        note: formatMarkerMessage(
          "NOT_FOUND",
          `"${q}" 에 대한 판례·해석례 타임라인 데이터가 조회되지 않았습니다.`
        ),
      });
    }
    return sections;
  },
};
