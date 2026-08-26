/**
 * F-39 · F-40 Pre-Do anchor — 법령 개정 감시(`verify:legal`)의 구멍 2건.
 *
 * ── F-39 `lib/legal-verification/coverage-collect.ts` `MODULES` 가 8개로 고정돼 있다
 *    `lib/tax-engine/legal-codes/` 에는 파일이 15개인데 수집기는 8개만 import 한다.
 *    `transfer.ts` 가 `transfer-nbl`·`transfer-house` 를 `export *` 로 재수출하므로 그 둘은 구제되지만,
 *    나머지는 수집 대상 밖이다 — 빠진 조문은 **모수에서도 사라져 uncovered 에도 뜨지 않으므로
 *    게이트가 100% 로 초록불이 된다.**
 *
 *    ⚠️ 리뷰는 누락을 4개(`building-standard-price`·`surcharge-transition`·`income-tax`·`local-tax`)로
 *       적었으나, 실측하니 **`transfer-mixed-use` 까지 5개**다. 배럴(`legal-codes.ts`)에도 없다.
 *
 *    유일한 관련 가드 `NS-META-1` 은 `expect(MODULES).toHaveLength(8)` 이라 드리프트를 **잡는 대신
 *    고정한다** ⇒ 디렉터리 열거 ↔ MODULES 대조로 바꿔 「새 모듈이 생기면 자동으로 걸리게」 한다.
 *
 * ── F-40 `additions-transfer-decree.ts` 의 소득세법 시행령 §164 키워드가 제1·2항에서만 뽑혔다
 *    키워드 3개가 전부 §164 ①②항 문장이고 ③⑤⑧ 을 고정하는 것은 하나도 없다.
 *    `verifyRule` 이 조 전문에 대해 `includes` 만 보므로 **③⑤⑧ 이 통째로 삭제돼도 PASS** 가 난다.
 *    그런데 이 기능이 의존하는 핵심 항이 바로 ③(직전 고시분)·⑤(산정기준율)·⑧(동일조정기간 환산)이다.
 *    형제 규칙 §165 는 「100분의 80을 곱한 금액」으로 앱 의존 항을 정확히 고정하고 있어 관행에서도 이탈이다.
 *    ⇒ ③⑤⑧ 의 **verbatim** 을 키워드에 추가한다(KoreanLaw 실측 문언).
 *
 * 법령: 「소득세법 시행령」 제164조 제3항·제5항·제8항.
 *
 * ⚠️ §1·§2 는 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const LEGAL_CODES_DIR = "lib/tax-engine/legal-codes";
const COLLECT_SRC = fs.readFileSync("lib/legal-verification/coverage-collect.ts", "utf8");

/** legal-codes 디렉터리의 모듈 파일명(확장자 제외) */
function legalCodeModules(): string[] {
  return fs
    .readdirSync(LEGAL_CODES_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => path.basename(f, ".ts"))
    .sort();
}

/** `transfer.ts` 가 `export *` 로 재수출하는 모듈 — 수집기가 직접 import 하지 않아도 구제된다 */
function reExportedByTransfer(): string[] {
  const src = fs.readFileSync(path.join(LEGAL_CODES_DIR, "transfer.ts"), "utf8");
  return [...src.matchAll(/export \* from "\.\/([\w-]+)"/g)].map((m) => m[1]).sort();
}

describe("F-39 커버리지 수집 모듈 열거 — §1 (수정 전 실패)", () => {
  it("legal-codes 의 모든 모듈이 수집 대상이다 — 직접 import 또는 transfer 재수출", () => {
    const modules = legalCodeModules();
    const reExported = new Set(reExportedByTransfer());
    const missing = modules.filter(
      (m) => !reExported.has(m) && !COLLECT_SRC.includes(`legal-codes/${m}"`),
    );
    expect(missing).toEqual([]);
  });

  it("수집기가 디렉터리 열거와 대조되는 가드를 갖는다 — 개수 하드코딩이 아니다", () => {
    const guard = fs.readFileSync("__tests__/lib/legal-codes-namespace-export.test.ts", "utf8");
    // 「8개」 같은 고정 개수는 드리프트를 잡는 대신 고정한다.
    expect(guard).not.toContain("expect(MODULES).toHaveLength(8)");
  });

  it("transfer 재수출 목록은 사실 고정 — nbl·house", () => {
    expect(reExportedByTransfer()).toEqual(["transfer-house", "transfer-nbl"]);
  });
});

describe("F-40 §164 매니페스트 키워드 — §2 (수정 전 실패)", () => {
  const MANIFEST = fs.readFileSync(
    "lib/legal-verification/manifest/additions-transfer-decree.ts",
    "utf8",
  );

  /** §164 규칙 블록만 잘라낸다 */
  function sec164Block(): string {
    const i = MANIFEST.indexOf('citation: "소득세법 시행령 §164",');
    expect(i).toBeGreaterThan(-1);
    return MANIFEST.slice(i, i + 1200);
  }

  it.each([
    ["③ 직전 고시분", "직전의 기준시가에 의한다"],
    ["⑤ 산정기준율", "국세청장이 고시한 기준율"],
    ["⑧ 동일조정기간 환산", "기준시가의 상승률을 참작하여"],
  ])("%s 을 고정하는 키워드가 있다", (_label, verbatim) => {
    expect(sec164Block()).toContain(verbatim);
  });

  it("종전 ①②항 키워드는 그대로 남는다 (역방향 가드)", () => {
    const block = sec164Block();
    expect(block).toContain("개별공시지가가 없는 토지");
  });
});
