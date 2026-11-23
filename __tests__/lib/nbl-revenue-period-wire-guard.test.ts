/**
 * 게이트 — 기타토지 업종 영위 기간(NBL-STATE-HISTORY-E3-②) UI 배선 확인(허용 목록). 침묵 소실 grep 게이트(UI 계획서 §9).
 *
 * 왜 필요한가: ⑫ Zod 칸 누락(strip)·④ 와이어 술어 누락은 TypeScript가 못 잡는다(14지점 ⑫⑬⑭). 새 칸 3개(`nblRevenuePeriodOn`·`nblRevenueBusinessEndDate`·`nblRevenueYearRows`)를 읽는
 * 프로덕션 파일을 **정확히** 고정해, 한 곳만 배선하거나(화면에 있는데 판정에 안 쓰이는 칸) 새 사용처가 술어를 우회하는 것을 막는다. 새 사용처를 만드는 PR이 이 목록을 갱신한다.
 * 선례: `nbl-state-history-leaf-unreachable.test.ts`(WIRE-6·8).
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { statSync } from "node:fs";
import { join } from "node:path";
import { relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** 주석 제거 — 머리주석의 심볼 언급이 사용으로 잡히지 않게 한다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = ["lib", "app", "components"].flatMap((r) => walk(join(REPO_ROOT, r))).map((f) => ({
  path: relative(REPO_ROOT, f),
  src: stripComments(readFileSync(f, "utf-8")),
}));
const src = (p: string) => FILES.find((f) => f.path === p)!.src;
const usersOf = (re: RegExp) => FILES.filter((f) => re.test(f.src)).map((f) => f.path).sort();

const KEYS = /nblRevenuePeriodOn|nblRevenueBusinessEndDate|nblRevenueYearRows/;
const SCOPE = "lib/calc/nbl-revenue-period-scope.ts";
const VALIDATE = "lib/calc/transfer-tax-validate-nbl-revenue-period.ts";
const REQUEST = "lib/calc/non-business-land-request.ts";
const REFINES = "lib/api/transfer-tax-schema-nbl-refines.ts";
const SCHEMA = "lib/api/transfer-tax-schema-nbl.ts";
const MAPPER = "lib/tax-engine/non-business-land/form-mapper-helpers.ts";

describe("E3-② 영위 기간 칸 배선 — 허용 목록", () => {
  it("WIRE-1: 새 칸 이름을 읽는 프로덕션 파일 = ①②③ 상태·복원 · ④ 전송(술어) · ⑤ 위젯·미리보기 · ⑧ 검증 · ⑫ Zod·refine · ⑭ 매퍼 · 엔진 leaf — 정확히 이 파일들", () => {
    expect(usersOf(KEYS)).toEqual(
      [
        "lib/stores/calc-wizard-asset-nbl-other.ts", // ① 타입
        "lib/stores/calc-wizard-asset-nbl.ts", // ② NBL_DEFAULTS
        "lib/stores/calc-wizard-asset-factory.ts", // ② factory
        "lib/stores/calc-wizard-asset-migrate-nbl.ts", // ③ 복원
        SCOPE, // ④⑤⑧ 공용 술어(와이어 3칸 덮어쓰기 포함)
        "lib/calc/nbl-revenue-period-preview.ts", // ⑤ 미리보기(와이어 레코드로 ⑭ 빌더 호출)
        VALIDATE, // ⑧
        "components/calc/transfer/nbl/RevenuePeriodSection.tsx", // ⑤ 위젯
        "lib/tax-engine/non-business-land/revenue-history.ts", // ⑧⑫ 공용 issue leaf(결함 칸 이름)
        SCHEMA, // ⑫ Zod
        REFINES, // ⑫ refine
        MAPPER, // ⑭
      ].sort(),
    );
  });

  it("WIRE-2: ④ 와이어(`non-business-land-request.ts`)는 새 칸을 직접 쓰지 않고 술어 파일의 `revenuePeriodWireFields`만 prefix-pick 뒤에 얹는다", () => {
    expect(src(REQUEST)).toMatch(/\.\.\.revenuePeriodWireFields\(asset, transferDate\)/);
    expect(src(REQUEST)).not.toMatch(KEYS);
    const body = src(REQUEST);
    expect(body.indexOf("...nblFields"), "prefix-pick 뒤에서 덮어쓴다").toBeLessThan(body.indexOf("...revenuePeriodWireFields"));
  });

  it("WIRE-3: ⑧은 ⑫와 같은 issue leaf(`revenueHistoryInputIssue`)를 쓰고 하한일(`floorDate`)은 ⑧만 쓴다 — ⑫가 쓰면 축 B 늦은 지분이 400", () => {
    expect(src(VALIDATE)).toMatch(/\brevenueHistoryInputIssue\(/);
    expect(src(REFINES)).toMatch(/\brevenueHistoryInputIssue\(/);
    expect(src(VALIDATE)).toMatch(/ctx\.floorDate/);
    expect(src(REFINES), "⑫는 floorDate를 넘기지 않는다").not.toMatch(/floorDate/);
  });

  it("WIRE-4: ⑧이 검사하는 행 목록은 ④가 싣는 행 목록과 같은 함수(`revenuePeriodWireRows`) — 어긋나면 «화면에 없는 행을 요구하며 영구 차단»", () => {
    expect(src(VALIDATE)).toMatch(/\brevenuePeriodWireRows\(/);
    expect(src(SCOPE)).toMatch(/export function revenuePeriodWireFields[\s\S]*revenuePeriodWireRows\(/);
  });

  it("WIRE-5: ⑧ 수입금액 필수 규칙의 «읽는 해» 게이트와 ⑤ 위젯 안내가 같은 술어(`revenuePeriodReadsYear` · `revenuePeriodRowYears`)를 쓴다", () => {
    expect(src("lib/calc/transfer-tax-validate-nbl.ts")).toMatch(/\brevenuePeriodReadsYear\(/);
    expect(src("components/calc/transfer/nbl/RevenuePeriodSection.tsx")).toMatch(/\brevenuePeriodRowYears\(/);
    expect(src("components/calc/transfer/nbl/OtherLandDetailSection.tsx")).toMatch(/\bnblRevenuePeriodInUse\(/);
  });

  it("WIRE-6: 위젯·결과 카드가 고지 상수를 엔진 단일 소스에서 읽는다(문구 재정의 없음)", () => {
    expect(src("components/calc/transfer/nbl/RevenuePeriodSection.tsx")).toMatch(/NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE[\s\S]*NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE[\s\S]*NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE/);
  });

  it("WIRE-7: ⑫ Zod가 새 칸 3개를 가진다(빠지면 침묵 strip) · ⑭ 매퍼가 읽는다", () => {
    for (const k of ["nblRevenuePeriodOn", "nblRevenueBusinessEndDate", "nblRevenueYearRows"]) {
      expect(src(SCHEMA), `⑫ ${k}`).toContain(k);
    }
    expect(src(SCHEMA)).toMatch(/nblRevenueYearRows:\s*z\.array\(nblRevenueYearRowRawSchema\)/);
    expect(src(MAPPER)).toContain("nblRevenuePeriodOn");
    expect(src(MAPPER)).toContain("nblRevenueYearRows");
  });
});
