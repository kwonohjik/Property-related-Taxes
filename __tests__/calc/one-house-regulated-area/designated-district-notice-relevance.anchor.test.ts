/**
 * S02-7 — 「지정 지구 안인가」 미선언 고지는 그 선언이 결론을 가를 때만 낸다(형제 고지 `era-undetermined`·`pending`과 같은 규약).
 *
 * 근거: 「소득세법 시행령」 제154조제1항 괄호는 「취득 당시」 조정대상지역만, 제155조제1항제2호는 「신규 주택 취득」 당시를 본다.
 * 1세대1주택 판정(1채·일시적 2주택 아님)에 양도 당시 조정 여부는 쓰이지 않고 판정 메뉴는 중과를 계산하지 않는다.
 * 반송동(4159710200)은 2019.11.8.~2020.6.18.에 동탄2택지개발지구만 조정대상지역이었다.
 */
import { describe, it, expect } from "vitest";
import { judge } from "./_helpers";

const BANSONG = "4159710200";
const ID = "regulated-district-undeclared:selling";

describe("S02-7 — 판정 메뉴: 양도일 지정 상태만으로는 고지하지 않는다", () => {
  it("C1 취득 2016-03-02(지정 전)·양도 2020-05-15·미선언 → 비과세 · 고지 없음", async () => {
    const o = await judge({ regionCode: BANSONG, acq: "2016-03-02", transfer: "2020-05-15" });
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).not.toContain(ID);
  });
  it("C5 C1 + 거주 36개월 → 고지 없음", async () => {
    const o = await judge({ regionCode: BANSONG, acq: "2016-03-02", transfer: "2020-05-15", residence: "36" });
    expect(o.undetermined).not.toContain(ID);
  });
  it("C3 양도 2023-06-01(지정 해제 후) → 고지 없음", async () => {
    const o = await judge({ regionCode: BANSONG, acq: "2016-03-02", transfer: "2023-06-01" });
    expect(o.undetermined).not.toContain(ID);
  });
  it("긍정 짝 C4 — 취득 2018-01-02(지구 한정 지정 중)·미선언 → 과세 + 고지(선언 false면 비과세로 뒤집힘)", async () => {
    const o = await judge({ regionCode: BANSONG, acq: "2018-01-02", transfer: "2020-05-15" });
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain(ID);
    const out = await judge({ regionCode: BANSONG, acq: "2018-01-02", transfer: "2020-05-15", asset: { regionInDesignatedDistrict: false } });
    expect(out.isExempt).toBe(true);
    expect(out.undetermined).not.toContain(ID);
  });
  it("긍정 짝 — 같은 C4에서 거주 36개월이면 선언이 결론을 가르지 않으므로 고지 없음", async () => {
    const o = await judge({ regionCode: BANSONG, acq: "2018-01-02", transfer: "2020-05-15", residence: "28" });
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).not.toContain(ID);
  });
});
