/**
 * SC-7-h — 증여의제 §45의3·§45의5 엔진이 **산식 근거로 삼는 상증령 조문**이 전부
 * 개정 감시(`verify:legal` 매니페스트) 안에 있는가.
 *
 * ⚠️ 이 파일이 생긴 경위를 남긴다 — 발견의 잔여 목록이 **실측으로 뒤집혔기 때문**이다.
 *    감사 배치는 「§32의3·§31의3·§29의3·§29의2·§32의2·§31의5·§34의2가 미등재」라고 적었으나,
 *    전수 측정 결과 앞의 6건은 **상증「령」으로 인용된 적이 0건**이다(맨 `§NN` 패턴을 세면서
 *    상증「법」 조문 번호를 시행령으로 오분류했다). 등재할 대상 자체가 없었다.
 *
 * 그래서 이 anchor는 「빠진 것을 채운다」가 아니라 **그 측정을 고정**한다 —
 * 새 시행령 조문을 산식 근거로 쓰기 시작하면 여기서 빨개진다.
 *
 * 🔑 공용 커버리지 게이트(`legal-verification-coverage-complete.test.ts`)와 층위가 다르다.
 *    그쪽의 모수는 **`legal-codes/` export 값**이다. 시행령을 값으로 인용하지 않고 주석·
 *    JSDoc으로만 근거를 적으면 그 모수에 들어가지 않는다 — 이 파일이 그 사각을 본다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ENGINE_DIR = "lib/tax-engine/gift-deemed";
const MANIFEST = "lib/legal-verification/manifest/additions-inheritance-decree.ts";

/**
 * 구법 조문 — 현행 법제처 본문에 존재하지 않으므로 개정 감시 대상이 **될 수 없다**.
 * 등재하면 `verify:legal`이 「키워드 미발견」으로 실패한다.
 *
 * - §34의2: 2019년 이전 일감몰아주기(현행 §34의3). `related-corp-era.ts`가 구법 구간을
 *   **차단**하면서 그 근거로만 인용한다(계산에 쓰지 않는다).
 */
const HISTORICAL_ONLY = new Set(["34의2"]);

function engineSources(): { file: string; src: string }[] {
  return readdirSync(ENGINE_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: join(ENGINE_DIR, f), src: readFileSync(join(ENGINE_DIR, f), "utf-8") }));
}

/** 「상증령 §X」·「영 §X」로 인용된 시행령 조문 번호를 모은다. */
function citedDecreeArticles(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { file, src } of engineSources()) {
    for (const m of src.matchAll(/(?:상증령|영) §(\d+(?:의\d+)?)/g)) {
      const art = m[1];
      out.set(art, [...(out.get(art) ?? []), file]);
    }
  }
  return out;
}

describe("SC-7-h — 증여의제 엔진의 상증령 인용 ↔ 개정 감시 매니페스트", () => {
  const cited = citedDecreeArticles();
  const manifest = readFileSync(MANIFEST, "utf-8");

  it("[DC-0] 스캐너가 실제로 무언가를 본다 (구별력 확보)", () => {
    // 0건이면 아래 단언은 무엇이든 통과한다 — 그 상태를 먼저 배제한다.
    expect(cited.size).toBeGreaterThanOrEqual(3);
    // 이 모듈의 실체인 두 조문은 반드시 잡혀야 한다.
    expect([...cited.keys()]).toEqual(expect.arrayContaining(["34의3", "34의5"]));
  });

  it("[DC-1] 산식 근거로 인용한 **현행** 시행령 조문은 전부 매니페스트에 있다", () => {
    const missing = [...cited.entries()]
      .filter(([art]) => !HISTORICAL_ONLY.has(art))
      .filter(([art]) => !manifest.includes(`citation: "상증령 §${art}"`))
      .map(([art, files]) => `상증령 §${art} ← ${[...new Set(files)].join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("[DC-2] 구법 전용 조문은 매니페스트에 **넣지 않는다** (현행 본문에 없어 검증이 실패한다)", () => {
    // 음성 짝 — 「빠진 것을 전부 채워라」로 읽고 §34의2까지 등재하면 `verify:legal`이 깨진다.
    for (const art of HISTORICAL_ONLY) {
      expect(manifest.includes(`citation: "상증령 §${art}"`)).toBe(false);
    }
    // 그리고 그 조문은 실제로 구법 서술 파일에서만 인용돼야 한다.
    const files = cited.get("34의2") ?? [];
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.includes("era"))).toBe(true);
  });

  it("[DC-3] 감사 배치가 「미등재」로 적은 6건은 애초에 시행령 인용이 아니다 (재기재 방지)", () => {
    // 🔴 이 단언은 결함을 막는 게 아니라 **틀린 결론의 재유입**을 막는다.
    //    맨 `§NN` 패턴을 세면 상증「법」 조문이 시행령으로 오분류된다 — 그 측정을 고정한다.
    for (const art of ["29의2", "29의3", "31의3", "31의5", "32의2", "32의3"]) {
      expect(cited.has(art)).toBe(false);
    }
  });
});
