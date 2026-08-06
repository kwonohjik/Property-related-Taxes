/**
 * 게이트 — 재산세 **플래그 기반 토지 분류기는 도달 불가**임을 고정한다
 *
 * ## 왜 이 파일이 필요한가
 *
 * 재산세에는 토지 3분류 판정이 **세 벌** 있는데 그중 **둘은 프로덕션에서 호출되지 않는다**
 * (2026-08-06 실측). 그런데 테스트가 초록이라 겉보기에는 살아 있는 것처럼 보인다.
 *
 * | 모듈 | 진입점 | 프로덕션 호출처 |
 * |---|---|---|
 * | `separate-taxation.ts` | `calculateSeparateTax` | ✅ **살아 있음** — `property-tax.ts` (API 경로) |
 * | `property-land-classification.ts` | `classifyLand` | ❌ `property-object.ts`만 (그 자신도 죽음) |
 * | `property-object.ts` | `determinePropertyTaxObject` | ❌ **0건** |
 * | `property-tax-comprehensive-aggregate.ts` | `calculateComprehensiveAggregate` | ❌ 테스트만 |
 *
 * `property-tax-comprehensive-aggregate.ts`는 **부분적으로만 살아 있다** — `property-tax.ts`가
 * 쓰는 것은 `calculateComprehensiveAggregateTax`(세율 적용, 숫자 인자)와 `applyBurdenCap`뿐이고
 * **분류 로직은 죽어 있다**. 이름이 한 글자 차이라 혼동하기 쉽다.
 *
 * ## 🔴 배선하면 물려받는 결함 2건
 *
 * 죽은 분류기들은 살아 있는 경로가 2026-08-06에 정정한 두 결함을 **그대로 갖고 있다**:
 *
 * 1. **면적 한도 없음** — 「지방세법 시행령」 §102①1호는 분리과세 공장용지를 "공장입지기준면적
 *    **범위의** 토지"로 한정하는데, 플래그(`isIndustrialDistrict`·`isCattleFarmland`)만 보고
 *    한도 없이 전량 분리과세한다. 초과분은 종합합산 누진(0.2~0.5%) 대상이다.
 * 2. **소재지 경로 미분기** — §102①1호는 §101①1호 **각 목**(읍·면지역/산업단지/공업지역)으로
 *    한정하고, 그 밖의 시지역 공장용지는 §101①1호 **본문** → 별도합산이다. 두 조문은 배타 분기다.
 *
 * ⇒ 다필지 재산세 UI를 만들며 이 분류기를 배선하려는 사람은 **먼저 그 둘을 넘겨야 한다**.
 *   이 테스트가 깨지면 그 신호다. 정정 참조: `separate-taxation.ts` `classifyStandard`.
 *
 * ## 왜 정적 분석인가
 *
 * "호출되지 않는다"는 런타임으로 증명할 수 없다(호출되지 않는 것을 실행할 수는 없다).
 * `coverage-collect.ts`와 같은 방식으로 **소스 트리를 읽어** import를 세는 순수 정적 분석이라
 * `.env.local`·네트워크 없이 vitest에서 돈다 ⇒ pre-push·CI 양쪽에서 자동으로 걸린다.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
/** 프로덕션 소스 루트 — 테스트는 제외한다(테스트가 부르는 것은 도달 가능이 아니다) */
const PRODUCTION_ROOTS = ["lib", "app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * 주석을 걷어낸다. 이 저장소는 모듈 헤더에 아키텍처 설명을 길게 적는 관행이 있어
 * `determinePropertyTaxObject` 같은 심볼명이 **설명문에** 등장한다
 * (`types/property.types.ts:488` 실측). 그대로 세면 주석이 호출로 잡힌다.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = PRODUCTION_ROOTS.flatMap((r) => walk(join(REPO_ROOT, r))).map((f) => ({
  path: relative(REPO_ROOT, f),
  src: stripComments(readFileSync(f, "utf-8")),
}));

/** `import ... from "...<module>"` 형태만 센다 — 주석·문자열 언급은 제외 */
function importersOf(moduleBasename: string): string[] {
  const re = new RegExp(`^\\s*import[\\s\\S]*?from\\s+["'][^"']*${moduleBasename}["']`, "m");
  return FILES.filter((f) => re.test(f.src)).map((f) => f.path);
}

/** import 절 **안에서** 심볼을 참조하는 프로덕션 파일 */
function importersOfSymbol(symbol: string): string[] {
  const re = new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, "m");
  return FILES.filter((f) => re.test(f.src)).map((f) => f.path);
}

/** 죽은 클러스터 — 서로를 부르는 것은 도달 가능이 아니다 */
const DEAD_CLUSTER = [
  "lib/tax-engine/property-object.ts",
  "lib/tax-engine/property-land-classification.ts",
];

const WIRE_UP_WARNING =
  "배선하려면 먼저 두 결함을 넘겨야 한다: (1) §102①1호 공장입지기준면적 한도 없음 " +
  "(2) §101①1호↔§102①1호 소재지 배타 분기 미적용. 정정 참조: separate-taxation.ts classifyStandard";

describe("도달 불가 — 플래그 기반 분류기는 프로덕션에서 호출되지 않는다", () => {
  it("DEAD-1: `property-land-classification`을 import하는 프로덕션 파일은 죽은 클러스터뿐이다", () => {
    const importers = importersOf("property-land-classification");
    const outside = importers.filter((p) => !DEAD_CLUSTER.includes(p));
    expect(outside, `새 호출자: ${outside.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
    // 클러스터 내부 연결은 존재해야 한다 — 0이면 이 가드가 공허하게 참이 된다
    expect(importers).toContain("lib/tax-engine/property-object.ts");
  });

  it("DEAD-2: `property-object` 진입점 `determinePropertyTaxObject`는 프로덕션 호출처가 없다", () => {
    const callers = FILES.filter(
      (f) =>
        f.path !== "lib/tax-engine/property-object.ts" &&
        /\bdeterminePropertyTaxObject\b/.test(f.src),
    ).map((f) => f.path);
    expect(callers, `새 호출자: ${callers.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
  });

  it("DEAD-3: 다필지 분류 진입점 `calculateComprehensiveAggregate`도 호출처가 없다", () => {
    // ⚠️ `calculateComprehensiveAggregateTax`(세율 적용)와 **다른 함수**다 — 이름이 접미사
    //    하나 차이라 혼동하기 쉽다. 아래 DEAD-4가 그 구분이 실재함을 함께 고정한다.
    const callers = importersOfSymbol("calculateComprehensiveAggregate").filter(
      (p) => p !== "lib/tax-engine/property-tax-comprehensive-aggregate.ts",
    );
    expect(callers, `새 호출자: ${callers.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
  });

  it("DEAD-4: 반면 `calculateComprehensiveAggregateTax`(세율)는 살아 있다 — 구분이 실재한다", () => {
    // 이 단언이 없으면 DEAD-3이 "이름을 잘못 써서 통과"하는 것과 구별되지 않는다.
    expect(importersOfSymbol("calculateComprehensiveAggregateTax")).toContain(
      "lib/tax-engine/property-tax.ts",
    );
  });
});

describe("살아 있는 경로는 하나다 — 정정이 들어간 곳", () => {
  it("DEAD-5: API가 타는 분리과세는 `separate-taxation.ts`다", () => {
    expect(importersOf("separate-taxation")).toContain("lib/tax-engine/property-tax.ts");
  });

  it("DEAD-6: 그 살아 있는 경로에는 면적 한도가 실제로 들어 있다", () => {
    // 죽은 쪽을 배선할 사람이 "어디를 베껴야 하는가"의 좌표. 이 심볼이 사라지면
    // 위 주석의 「정정 참조」가 stale이 되므로 함께 깨뜨린다.
    const live = FILES.find((f) => f.path === "lib/tax-engine/separate-taxation.ts")!;
    expect(live.src).toContain("judgeFactoryAreaLimit");
    expect(live.src).toContain("computeFactoryStandardArea");
  });
});
