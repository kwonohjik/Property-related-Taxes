/**
 * G6-9 — 평가셋 메타데이터 정합(하네스 규약 harness.ts 「입력 경로가 생기면 form으로 옮기고 match 여부를 다시 본다」).
 * 제품 동작이 아니라 평가셋이 사실대로 말하는지 고정한다: F318 승격(주소 보강으로 비거주자 축 구별력), 자기모순 노트 정정.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { observeCase, matchesExpected, type RulingCase } from "./harness";

const DIR = path.join(__dirname, "cases");
const all: RulingCase[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => {
    const p = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    return Array.isArray(p) ? p : [p];
  });
const byId = (id: string) => all.find((c) => c.id === id)!;

describe("G6-9 평가셋 노트·분류 정합", () => {
  it("[RN-1] F318-era는 match이고, 비거주자 축에 구별력이 있다(true → 과세 · false → 비과세)", async () => {
    const c = byId("F318-era");
    expect(c.bucket).toBe("match");
    expect(c.referenceForm).toBeUndefined();
    expect(c.form?.asset?.regionCode).toBe("2711010100");
    const yes = await observeCase(c);
    expect(matchesExpected(yes, c.expected!)).toBe(true);
    expect(yes.unmetExceptions).toContain("non-resident-121-2");
    const no = await observeCase({ ...c, form: { ...c.form, transferorNonResident: false } });
    expect(no.isExempt).toBe(true);
    expect(no.appliedExceptions).toContain("155-5-marriage-merge");
  }, 60_000);

  it("[RN-2] 부정 짝 — 주소를 빼면 두 값 모두 과세라 구별력이 없다(그래서 주소 보강이 승격 조건이다)", async () => {
    const c = byId("F318-era");
    const bare = { ...c.form, asset: { ...c.form!.asset, regionCode: undefined } };
    const yes = await observeCase({ ...c, form: { ...bare, transferorNonResident: true } });
    const no = await observeCase({ ...c, form: { ...bare, transferorNonResident: false } });
    expect(yes.isExempt).toBe(false);
    expect(no.isExempt).toBe(false);
  }, 60_000);

  it("[RN-3] G121-era 노트는 G119-era를 match로 부른다", () => {
    expect(byId("G119-era").bucket).toBe("match");
    expect(byId("G121-era").note ?? "").toContain("G119-era가 단언한다(match)");
    expect(byId("G121-era").note ?? "").not.toContain("G119-era가 단언한다(mismatch)");
  });

  it("[RN-4] E151-era 노트 머리가 bucket과 모순되지 않는다", () => {
    const c = byId("E151-era");
    expect(c.bucket === "match").toBe((c.note ?? "").startsWith("match"));
  });

  it("[RN-5] E156-dual — 600㎡·재귀농 false는 비과세, stale 문장은 없다", async () => {
    const e = byId("E156-dual");
    const f = JSON.parse(JSON.stringify(e.form));
    f.houses[0].ruralLandAreaSqm = "600";
    f.houses[0].ruralReturnedToFarmExitHouse = false;
    const o = await observeCase({ ...e, form: f });
    expect(o.isExempt).toBe(true);
    expect(e.note ?? "").not.toMatch(/600㎡로 줄여도[^.]*과세\(프로브\)/);
  }, 60_000);

  it("[RN-6] 「참고 관측」이 비과세였던 22건은 작성 당시 관측임을 밝히고 재관측값(과세)을 적는다", () => {
    const stale = all.filter((c) => c.bucket !== "match" && (c.note ?? "").includes("참고 관측(작성 당시)"));
    expect(stale.length).toBe(22);
    for (const c of stale) expect(c.note, c.id).toContain("재관측(2026-10-11): 과세");
  });
});
