/**
 * anchor — §89①4호 미성립 사유의 「N년을 넘겼습니다」는 **기한을 실제로 넘겼을 때만** 적는다 (S05-7).
 *
 * 「소득세법」 제89조제1항제4호나목 「해당 1주택을 취득한 날부터 3년 이내에 해당 조합원입주권을 양도할 것」.
 * 종전에는 다른 주택 1채 + 취득일이 있으면 기한을 보지 않고 문장을 붙여, 3년 이내 취득인데도 입주권 2개·인가일 요건
 * 미선언 같은 다른 사유로 미성립이면 「3년을 넘겼습니다」가 함께 떴다(기한 안·기한 초과의 사유가 글자까지 같았다).
 * 사유 목록은 판정(`resolveOneRightExemptionClause`)과 같은 `isWithinDeadline` leaf로 다시 묻는다.
 *
 * | # | 입력 | 기대 |
 * |---|---|---|
 * | R-1 | G077-era — 입주권 2개, C 취득 2016-12-16 · 양도 2017-05-02(약 4.5개월) | 「넘겼습니다」 없음 |
 * | R-2 | 입주권 1개 + 인가일 요건 미선언, 기한 안 | 「넘겼습니다」 없음 |
 * | R-3 | 🔑 긍정 짝 — C 취득 2013-01-10(기한 초과) · 입주권 1개 | 「3년을 넘겼습니다」 있음 |
 * | R-4 | 경계 — 3년 만료일 당일(2020-12-16 양도) 인가일 요건 미선언 | 없음 · 만료 다음 날(2020-12-17)은 있음 |
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RulingCase } from "./harness";
import { observe } from "./observe";

const cases = JSON.parse(readFileSync(join(__dirname, "cases/G077.json"), "utf8")) as RulingCase[];
const era = cases.find((c) => c.id === "G077-era")!;
const later = cases.find((c) => c.id === "P-G077-later-sold")!;
const clone = (c: RulingCase): RulingCase => JSON.parse(JSON.stringify(c));
const OVER = /년을 넘겼습니다/;
const overSaid = (reasons: string[]) => reasons.some((r) => OVER.test(r));

function withOtherHouse(base: RulingCase, acquired: string, transferDate?: string): RulingCase {
  const c = clone(base);
  (c.form!.asset as Record<string, unknown>).redevOtherHouseAcquisitionDate = acquired;
  (c.form!.houses as { acquisitionDate: string }[])[0].acquisitionDate = acquired;
  if (transferDate) (c.form as Record<string, unknown>).transferDate = transferDate;
  return c;
}

describe("S05-7 · 「N년을 넘겼습니다」는 기한 초과일 때만", () => {
  it("R-1 입주권 2개(C 취득 약 4.5개월 뒤 양도) → 미성립이지만 「넘겼습니다」 없음", async () => {
    const o = await observe(era);
    expect(o.ve).toEqual([]);
    expect(o.ex).toBe(false);
    expect(o.reasons.some((r) => /입주권이 1개여야/.test(r))).toBe(true);
    expect(overSaid(o.reasons)).toBe(false);
  });

  it("R-2 인가일 요건 미선언(기한 안) → 「넘겼습니다」 없음", async () => {
    const c = clone(later);
    (c.form!.asset as Record<string, unknown>).redevExemptionEligibleAtApproval = "no";
    const o = await observe(c);
    expect(o.ex).toBe(false);
    expect(o.reasons.some((r) => /인가일 현재/.test(r))).toBe(true);
    expect(overSaid(o.reasons)).toBe(false);
  });

  it("R-3 🔑 긍정 짝 — C 취득 2013-01-10(기한 초과) → 「3년을 넘겼습니다」", async () => {
    const o = await observe(withOtherHouse(later, "2013-01-10"));
    expect(o.ex).toBe(false);
    expect(o.reasons.some((r) => /3년을 넘겼습니다/.test(r))).toBe(true);
  });

  it("R-3b 🔑 긍정 짝 — 입주권 2개 + 기한 초과도 둘 다 적는다(G077-era에서 C 취득만 2013-01-10)", async () => {
    const o = await observe(withOtherHouse(era, "2013-01-10"));
    expect(o.reasons.some((r) => /입주권이 1개여야/.test(r))).toBe(true);
    expect(o.reasons.some((r) => /3년을 넘겼습니다/.test(r))).toBe(true);
  });

  it("R-4 경계 — 3년 만료일 당일은 기한 안, 다음 날은 초과", async () => {
    const mk = (transferDate: string) => {
      const c = withOtherHouse(later, "2017-12-16", transferDate);
      (c.form!.asset as Record<string, unknown>).redevExemptionEligibleAtApproval = "no";
      return c;
    };
    expect(overSaid((await observe(mk("2020-12-16"))).reasons)).toBe(false);
    expect(overSaid((await observe(mk("2020-12-17"))).reasons)).toBe(true);
  });
});
