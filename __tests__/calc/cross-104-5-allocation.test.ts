/**
 * §104⑤ 크로스 — 기본공제 배분 2안 비교 (C-3d-2)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3d-recalc.plan.md` **W-2** · X-4 · X-6
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 배분에 따라 세액이 갈리는데 **크로스에는 배분기가 없다**(`MAX_BENEFIT`은 부동산 안에서만 돈다).
 * 그래서 한쪽에 전액 몰아준 **두 경우를 실제로 계산해** 유리한 쪽을 고른다.
 *
 * 🔒 **주입 방향이 뒤집히면 조용히 불리한 답을 낸다** — A-1이 후보별 주입값을 직접 고정한다.
 *   「부동산에 몰아준다」 = 부동산 기사용액 0 · **주식 기사용액 250만**(그쪽이 이미 썼다고 봄).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const recalcRealEstate = vi.fn();
const recalcOtherAsset = vi.fn();
const callCross1045API = vi.fn();

vi.mock("@/lib/calc/cross-104-5-recalc", () => ({
  recalcRealEstate: (...a: unknown[]) => recalcRealEstate(...a),
  recalcOtherAsset: (...a: unknown[]) => recalcOtherAsset(...a),
}));
vi.mock("@/lib/calc/cross-104-5-api", () => ({
  callCross1045API: (...a: unknown[]) => callCross1045API(...a),
}));

import { pickBestAllocation } from "@/lib/calc/cross-104-5-allocation";
import type { CalculationRecord } from "@/lib/storage/types";

const REC = (id: string) => ({ id, inputData: {}, resultData: {} }) as unknown as CalculationRecord;

/** 어댑터가 읽을 수 있는 최소 부동산 결과 */
const aggResult = (o: Record<string, unknown> = {}) => ({
  groupTaxes: [],
  calculatedTaxByGroups: 100_000_000,
  calculatedTax: 100_000_000,
  taxBase: 300_000_000,
  clause1BucketTaxBase: 300_000_000,
  clause1BucketTax: 100_000_000,
  clause8TaxBase: 0,
  clause8Tax: 0,
  reductionAmount: 0,
  ...o,
});

const stockResult = (o: Record<string, unknown> = {}) => ({
  basicDeductionGroup: "real_estate_and_other_asset",
  taxBase: 200_000_000,
  calculatedTax: 56_060_000,
  clause1BucketTaxBase: 200_000_000,
  clause1BucketTax: 56_060_000,
  clause9TaxBase: 0,
  clause9Tax: 0,
  ...o,
});

beforeEach(() => {
  recalcRealEstate.mockReset().mockResolvedValue(aggResult());
  recalcOtherAsset.mockReset().mockResolvedValue(stockResult());
  callCross1045API.mockReset().mockResolvedValue({ calculatedTax: 156_060_000 });
});

const run = () =>
  pickBestAllocation({
    realEstateRecord: REC("re"),
    otherAssetRecord: REC("oa"),
    taxYear: 2024,
  });

describe("배분 2안 — 주입값", () => {
  it("A-1: 🔒 후보별 주입이 **서로 반대**다", async () => {
    await run();
    expect(recalcRealEstate).toHaveBeenCalledTimes(2);
    expect(recalcOtherAsset).toHaveBeenCalledTimes(2);

    // 후보 1 = 부동산에 몰아줌 → 부동산 기사용 0 · 주식 기사용 250만
    expect(recalcRealEstate.mock.calls[0][1]).toEqual({ annualBasicDeductionUsed: 0 });
    expect(recalcOtherAsset.mock.calls[0][1]).toEqual({
      realEstateGroupBasicDeductionUsed: 2_500_000,
    });
    // 후보 2 = 기타자산에 몰아줌 → 반대
    expect(recalcRealEstate.mock.calls[1][1]).toEqual({
      annualBasicDeductionUsed: 2_500_000,
    });
    expect(recalcOtherAsset.mock.calls[1][1]).toEqual({ realEstateGroupBasicDeductionUsed: 0 });
  });

  it("A-2: 크로스는 후보마다 1회 — 라우트별 2회(X-4)", async () => {
    await run();
    expect(callCross1045API).toHaveBeenCalledTimes(2);
    expect(callCross1045API.mock.calls[0][0].taxYear).toBe(2024);
  });
});

describe("배분 2안 — 선택 규칙", () => {
  it("A-3: ⭐ **세액이 작은 쪽**을 채택한다 (납세자 유리 = MAX_BENEFIT 방향)", async () => {
    callCross1045API
      .mockResolvedValueOnce({ calculatedTax: 160_000_000 }) // 부동산에 몰아줌
      .mockResolvedValueOnce({ calculatedTax: 150_000_000 }); // 기타자산에 몰아줌 ← 유리
    const r = await run();
    expect(r.best.side).toBe("other_asset");
    expect(r.best.cross.calculatedTax).toBe(150_000_000);
    expect(r.candidates).toHaveLength(2);
    expect(r.failures).toHaveLength(0);
  });

  it("A-4: 동률이면 **먼저 온 후보**(부동산) — 결정적이어야 한다", async () => {
    callCross1045API.mockResolvedValue({ calculatedTax: 150_000_000 });
    const r = await run();
    expect(r.best.side).toBe("real_estate");
  });

  it("A-5: 후보 결과에 **재계산된 두 엔진 결과**가 실린다 (감면 재판정용 — X-3)", async () => {
    recalcRealEstate.mockResolvedValue(aggResult({ reductionAmount: 12_000_000 }));
    const r = await run();
    // 이 함수는 감면을 판정하지 않는다 — 값을 실어 보내고 호출자가 정한다.
    expect(r.best.realEstate.reductionAmount).toBe(12_000_000);
  });
});

describe("배분 2안 — 실패 처리 (X-6)", () => {
  it("A-6: 한 후보가 실패하면 **나머지를 채택**하고 사유를 남긴다", async () => {
    recalcRealEstate
      .mockResolvedValueOnce(aggResult())
      .mockRejectedValueOnce(new Error("겸용주택은 다시 계산할 수 없습니다"));
    const r = await run();
    expect(r.candidates).toHaveLength(1);
    expect(r.best.side).toBe("real_estate");
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].side).toBe("other_asset");
    expect(r.failures[0].reason).toContain("겸용주택");
  });

  it("A-7: 둘 다 실패하면 throw — 호출자가 현행(감지·경고)으로 돌아간다", async () => {
    recalcOtherAsset.mockRejectedValue(new Error("저장된 입력이 없습니다"));
    await expect(run()).rejects.toThrow(/저장된 입력이 없습니다/);
  });

  it("A-8: 어댑터가 값을 못 읽으면 그 후보만 실패한다", async () => {
    // 구 버전 형태 — 호별 필드 없음
    recalcOtherAsset
      .mockResolvedValueOnce(stockResult())
      .mockResolvedValueOnce({ basicDeductionGroup: "real_estate_and_other_asset", taxBase: 1 });
    const r = await run();
    expect(r.candidates).toHaveLength(1);
    expect(r.failures[0].side).toBe("other_asset");
  });
});
