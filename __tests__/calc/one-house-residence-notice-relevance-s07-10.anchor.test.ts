/**
 * S07-10 — 거주기간 요건 판정 보류 고지는 그 요건이 비과세 결론을 가를 때만 낸다.
 *
 * `154-1-residence-deadline-unavailable`(거주 충족일 미산출)과 `154-1-capital-newtown-location-unverified`(2011.6.2. 이전 양도분의
 * 신도시 소재지 미확인)는 「거주만 채우면 비과세」일 때 의미가 있다. 3주택·특례 없는 2주택·§155① 처분기한 경과처럼 거주와 무관하게
 * 과세가 정해졌는데 「판정을 보류했습니다」가 뜨면 확정된 과세 위에 거짓 안내가 얹힌다. 게이트는 결론을 다시 쓰지 않고 엔진 본체 판정
 * (`checkExemptionCore`)에 거주 개월만 채워 다시 돌린 값을 쓴다.
 *
 * 전제 짝(거주 36개월로 바꿔도 과세)이 「이 고지가 결론을 가르지 않는다」를 보인다. 보유 미달 1주택(PD-15)은 유지한다.
 * 삭제 전 §154①4호 고지(`154-1-4ho-rental-registration-unverified`)의 보유 미달 축은 별도 결정이라 단언하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { observeCase } from "./one-house-rulings/harness";
import type { RulingCase } from "./one-house-rulings/harness";

const RD = "154-1-residence-deadline-unavailable";
const CN = "154-1-capital-newtown-location-unverified";

type O = { tr?: string; acq?: string; res: string; region?: string | null; houses?: Record<string, unknown>[] };
function mc(id: string, o: O): RulingCase {
  const tr = o.tr ?? "2026-06-15";
  return {
    id, docNo: "-", docDate: "-", basis: "current", today: tr, summary: id, bucket: "match",
    form: {
      isOneHousehold: true, transferDate: tr, contractTotalPrice: "900000000",
      asset: {
        assetKind: "housing", acquisitionDate: o.acq ?? "2018-03-02",
        ...(o.region === null ? {} : { regionCode: o.region ?? "1168010100" }),
        residencePeriodMonthsAsset: o.res,
      },
      houses: o.houses ?? [],
    } as RulingCase["form"],
  };
}
/** 강남 3주택(특례 없음) */
const H3h = [
  { id: "o1", region: "capital", acquisitionDate: "2015-01-01" },
  { id: "o2", region: "capital", acquisitionDate: "2016-01-01" },
];
/** 2007-05-01 양도 · 신규 2004-06-01 취득 — §155① 처분기한(구법) 경과 */
const Y1h = [{ id: "new", region: "capital", acquisitionDate: "2004-06-01" }];

describe("S07-10 거주 고지 게이트", () => {
  it("3주택(거주 0): 거주 36개월이어도 과세 → 거주 고지 없음", async () => {
    expect((await observeCase(mc("H3c", { res: "36", houses: H3h }))).isExempt).toBe(false); // 전제
    const o = await observeCase(mc("H3", { res: "0", houses: H3h }));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).not.toContain(RD);
  });

  it("특례 없는 2주택(거주 0): 거주 고지 없음", async () => {
    const h2 = [{ id: "n", region: "capital", acquisitionDate: "2020-01-01" }];
    expect((await observeCase(mc("H2c", { res: "36", houses: h2 }))).isExempt).toBe(false); // 전제
    expect((await observeCase(mc("H2", { res: "0", houses: h2 }))).undetermined).not.toContain(RD);
  });

  it("2007 양도 · §155① 처분기한 경과 2주택(거주 0): 거주 고지·신도시 고지 없음", async () => {
    const base = { tr: "2007-05-01", acq: "2000-01-01", region: null, houses: Y1h } as const;
    expect((await observeCase(mc("Y1c", { ...base, res: "36" }))).isExempt).toBe(false); // 전제
    const o = await observeCase(mc("Y1", { ...base, res: "0" }));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).not.toContain(RD);
    expect(o.undetermined).not.toContain(CN);
  });

  it("긍정 짝 — 1주택(거주 0): 거주가 결론을 가르므로 고지 유지, 거주 36개월이면 비과세", async () => {
    const o = await observeCase(mc("H1", { res: "0" }));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain(RD);
    expect((await observeCase(mc("H1c", { res: "36" }))).isExempt).toBe(true);
  });

  it("긍정 짝 — 2007 양도 1주택(주소 없음, 거주 0): 거주 고지·신도시 고지 유지", async () => {
    const base = { tr: "2007-05-01", acq: "2000-01-01", region: null } as const;
    const o = await observeCase(mc("Y2", { ...base, res: "0" }));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain(RD);
    expect(o.undetermined).toContain(CN);
    const c = await observeCase(mc("Y2c", { ...base, res: "36" }));
    expect(c.isExempt || c.isPartialExempt).toBe(true); // 2007 양도 9억은 6억 초과분 과세(고가주택)
  });

  it("긍정 짝 — 보유도 모자란 1주택(PD-15): 거주를 채워도 아직 과세지만 고지 유지", async () => {
    const o = await observeCase(mc("R4", { acq: "2025-01-10", res: "0" })); // 보유 1년 5개월
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain(RD);
  });
});
