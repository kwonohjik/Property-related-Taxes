/**
 * 게이트: **모수 밖으로 새는 법령이 없어야 한다**
 *
 * ── 왜 이 테스트가 필요한가 (2026-08-05) ──────────────────────────────────
 * `legal-verification-coverage-complete.test.ts`는 "모수 **안**의 조문이 전부 등록돼
 * 있는가"만 본다. 모수 자체는 `LAW_ALIAS` 키 집합(= `coverage.ts`의 `KNOWN_ABBRS`)이
 * 정하는데, **거기 없는 법령은 조용히 분모에서 빠진다**. 그래서 커버리지 100%가
 * 유지되는 동안에도 검사받지 않는 조문이 쌓일 수 있다 — 실제로 그렇게 됐다:
 *
 *   · 시행령·시행규칙 93개 조문이 `상증령`·`상증칙`·`소령` 같은 약칭 때문에 모수 밖이었다.
 *   · 커버리지 테스트는 그동안 계속 녹색이었다(공허하게 참).
 *
 * ⇒ 이 테스트는 반대 방향을 지킨다: **모수 밖 법령 = 문서화된 「검증 불가」 목록과 정확히 일치**.
 *   새 법령이 모수 밖으로 새는 순간 빨개진다.
 *
 * ── 실패했다면 ──────────────────────────────────────────────────────────────
 * 대부분은 **약칭이 `LAW_ALIAS`에 없을 뿐**이다 → `citation-parser.ts`의 `LAW_ALIAS`에
 * 등재하고, 그 법령의 인용 조문을 `manifest/additions-*.ts`에 등록한다.
 * 부칙·훈령처럼 법제처 조문 API로 **정말 조회할 수 없는** 경우에만
 * `UNVERIFIABLE_LAW_NAMES`에 이유와 함께 추가한다(갭을 넓히는 방향이므로 신중히).
 */
import { describe, it, expect } from "vitest";
import { collectUnknownLawCitations } from "@/lib/legal-verification/coverage-collect";
import { UNVERIFIABLE_LAW_NAMES } from "@/lib/legal-verification/coverage";

describe("법령 검증 — 모수 밖 인용", () => {
  it("모수 밖 법령은 문서화된 「검증 불가」 목록뿐이다", () => {
    const unknown = collectUnknownLawCitations();

    // 실패 시 어떤 법령이 어떤 인용 문자열 때문에 샜는지 바로 보이도록 정렬해 단언한다
    const actual = [...unknown.keys()].sort((a, b) => a.localeCompare(b, "ko"));
    const documented = Object.keys(UNVERIFIABLE_LAW_NAMES).sort((a, b) =>
      a.localeCompare(b, "ko"),
    );

    expect(actual, `모수 밖 인용:\n${formatDetail(unknown)}`).toEqual(documented);
  });

  it("「검증 불가」 목록의 모든 항목에 이유가 적혀 있다", () => {
    for (const [law, reason] of Object.entries(UNVERIFIABLE_LAW_NAMES)) {
      expect(reason.length, `${law}: 이유 미기재`).toBeGreaterThan(10);
    }
  });
});

function formatDetail(unknown: Map<string, string[]>): string {
  return [...unknown.entries()]
    .map(([law, raws]) => `  "${law}" ← ${raws.join(" | ")}`)
    .join("\n");
}
