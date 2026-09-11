/**
 * 상속·증여 UI 리뷰 G3 — 배선·정책 축 anchor (소스).
 *
 * 여기 세 건은 렌더로 재기에 비용이 과한 축이다.
 * · IG-063 — prop 하나가 부모에서 안 내려와 세무사 모드 이력 조회가 항상 0건이었다.
 * · IG-117 — 정변환 `dateToStr`이 로컬 getter라 UTC 자정 파싱과 어긋났다(타임존 의존 버그).
 * · IG-092 — `Number("")`가 0이라 빈칸이 계산 게이트를 통과했다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

describe("[G3-S] IG-063 — currentClientId가 부모에서 내려온다", () => {
  const src = read("components/calc/inheritance/stock/StockItemEditor.tsx");

  it("S-1: 🔴 UnlistedStockV2Card에 activeClientId가 전달된다", () => {
    expect(src).toContain("currentClientId={activeClientId ?? null}");
  });

  it("S-2: 그 값의 출처가 professional store다 (상수·null 하드코딩이 아니다)", () => {
    expect(src).toContain("useProfessionalStore()");
    expect(src).toContain("@/lib/stores/professional-store");
  });

  it("S-3: 필터가 실제로 그 값을 쓰는 축이 살아 있다 (죽은 prop이 아님)", () => {
    const lookup = read("lib/calc/unlisted-stock-valuation-lookup.ts");
    expect(lookup).toContain("currentClientId");
  });
});

describe("[G3-T] IG-117 — 날짜 정변환이 UTC 기준으로 통일됐다", () => {
  const src = read(
    "components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx",
  );

  it("T-1: 🔴 dateToStr이 toISOString 기준이다 (로컬 getter 아님)", () => {
    expect(src).toContain('d.toISOString().slice(0, 10)');
  });

  it("T-2: 🔴 인라인 복제가 남아 있지 않다 (주석 밖에 로컬 getter 없음)", () => {
    const codeOnly = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
    expect(codeOnly).not.toContain("getFullYear()");
    expect(codeOnly).not.toContain("getMonth()");
  });

  it("T-3: new Date 직접 호출이 없다 (루트 CLAUDE.md 정책)", () => {
    const codeOnly = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
    expect(codeOnly).not.toContain("new Date(");
    expect(src).toContain("toOptionalDate");
  });

  it("T-4: 형제 파일과 같은 규칙이다 (한 카드 안 두 규칙 공존 해소)", () => {
    const sibling = read(
      "components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx",
    );
    expect(sibling).toContain('toISOString().slice(0, 10)');
  });
});

describe("[G3-U] IG-092 — 이자율 빈칸이 계산 게이트를 통과하지 않는다", () => {
  const src = read("app/calc/family-business-postmgmt/page.tsx");

  it("U-1: 🔴 canCalculate에 trim 가드가 있다", () => {
    expect(src).toContain("interestRate.trim().length > 0");
  });

  it("U-2: 대조 — 같은 게이트의 baseTaxableAmount도 같은 가드를 쓴다 (동일 층위)", () => {
    expect(src).toMatch(/baseTaxableAmount\.trim\(\)\.length > 0/);
  });

  it("U-3: `Number(\"\")`가 0이라는 전제를 고정한다 (이 결함의 뿌리)", () => {
    expect(Number("")).toBe(0);
  });
});
