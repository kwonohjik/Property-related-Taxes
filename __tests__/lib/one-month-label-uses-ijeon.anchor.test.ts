/**
 * 사용자 노출 문자열은 「**이전** 1개월」을 쓴다 — 「직전」 금지 가드
 *
 * 계획서: docs/00-pm/stock-listed-conversion-1month-kiwoom-autofetch.plan.md (Phase 3)
 *
 * ## 근거 (조문 실측 2026-08-31)
 *
 * > **소득세법 §99①3** — 「…「상속세 및 증여세법」 제63조제1항제1호가목을 준용하여 평가한 가액.
 * >  이 경우 "평가기준일 **이전ㆍ이후 각 2개월**"은 "**양도일ㆍ취득일 이전 1개월**"로 본다.」
 *
 * 법문이 「이전」이다. 그리고 **「이전」은 그 날을 포함**한다(사용자 확정 2026-08-31 ·
 * `lib/kiwoom/calendar.ts:147-162`가 같은 정의를 적고 있다). 구현
 * (`buildOneMonthBeforeSlots` — 기준일 포함)도 그와 일치한다.
 *
 * 종전 화면 라벨의 「직전」은 **법문·구현 양쪽과 어긋난 표기**였다. 같은 화면 안에서도
 * 거래정지 토글 설명문은 이미 「이전」을 쓰고 있어 두 표기가 공존했다.
 *
 * 국외전출세도 같은 조문을 탄다 — 시행령 §178의9②1호가
 * 「주권상장법인의 주식등: **법 제99조제1항제3호**…에 따른 기준시가」라고 직접 지목한다.
 *
 * ## 규칙의 범위 — 오탐을 먼저 실측했다
 *
 * · 대상: `app`·`lib`·`components` 아래 `.ts`/`.tsx`의 **문자열 리터럴로 보이는 줄**
 * · 제외: 주석(`*`·`//`·`/*`로 시작하는 줄) — Q-1 결정이 주석을 범위에서 뺐다
 * · 리터럴은 **「직전 1개월」로 좁힌다**. 「직전 사업연도」(77건)·「직전 거래일」 등
 *   정당한 「직전」이 많다 — 넓히면 즉시 오탐이 된다.
 *
 * ⚠️ 「따옴표가 앞에 있으면 문자열」이라는 1차 규칙은 **오탐 2건**을 냈다
 *    (JSDoc 안의 `"daily"`·`` `preTransferAutoFillDates` ``). 주석 제외를 더해 0건이 됐다.
 *    규칙을 손볼 때는 **오탐부터 다시 실측**할 것.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const SEARCH_ROOTS = ["app", "lib", "components"];
const FORBIDDEN = "직전 1개월";

function grepForbidden(): string[] {
  let out = "";
  try {
    out = execFileSync("grep", ["-rn", FORBIDDEN, ...SEARCH_ROOTS], {
      encoding: "utf-8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return []; // grep 은 0건이면 exit 1
  }

  const hits: string[] = [];
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [path, no, ...rest] = line.split(":");
    const text = rest.join(":");
    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;

    const trimmed = text.trim();
    // 주석 줄은 범위 밖 (Q-1)
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

    // 문자열 리터럴 안으로 보이는가 — 매치 앞에 따옴표가 있는가
    const before = text.slice(0, text.indexOf(FORBIDDEN));
    if (before.includes('"') || before.includes("'") || before.includes("`")) {
      hits.push(`${path}:${no} ${trimmed.slice(0, 100)}`);
    }
  }
  return hits;
}

describe("IJ — 사용자 노출 문자열은 「이전 1개월」", () => {
  it("IJ-1: 「직전 1개월」을 쓰는 사용자 노출 문자열이 없다 (소득세법 §99①3 문언)", () => {
    const hits = grepForbidden();
    expect(hits, `「직전 1개월」 → 「이전 1개월」로 고칠 것:\n${hits.join("\n")}`).toEqual([]);
  });

  /**
   * 🔑 **구별력 대조군.** grep·필터가 망가지면 IJ-1이 조용히 통과한다.
   *    이 검사가 실제로 문자열을 찾아낸다는 것을 「이전 1개월」로 확인한다.
   */
  it("IJ-2: 같은 필터가 「이전 1개월」 문자열은 실제로 찾아낸다 (IJ-1이 헛도는 것 방지)", () => {
    const out = execFileSync("grep", ["-rn", "이전 1개월", ...SEARCH_ROOTS], {
      encoding: "utf-8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const stringHits = out.split("\n").filter((line) => {
      if (!line) return false;
      const [path, , ...rest] = line.split(":");
      const text = rest.join(":");
      if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return false;
      const trimmed = text.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
        return false;
      }
      const before = text.slice(0, text.indexOf("이전 1개월"));
      return before.includes('"') || before.includes("'") || before.includes("`");
    });
    expect(stringHits.length).toBeGreaterThan(5);
  });

  it("IJ-3: 「직전 사업연도」 같은 정당한 「직전」은 규칙에 걸리지 않는다", () => {
    const out = execFileSync("grep", ["-rc", "직전 사업연도", "lib", "components", "app"], {
      encoding: "utf-8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const total = out
      .split("\n")
      .filter(Boolean)
      .reduce((a, l) => a + Number(l.split(":").pop() ?? 0), 0);
    expect(total).toBeGreaterThan(0); // 실재한다
    expect(grepForbidden()).toEqual([]); // 그런데도 IJ-1은 0건
  });
});
