/**
 * anchor: 자경농지 상속 — 「피상속인 경작기간 합산 요건 미확인」 차단은 **합산이 필요한 경우**에만 건다 (C1).
 *
 * 결함(막다른 오류): 검증(`transfer-tax-validate-reductions.ts`)은 피상속인 경작기간이 남아 있고 합산 토글 둘이 꺼져 있으면
 *   「합산하려면 …확인하세요」로 막는데, `Step5.tsx`는 본인 자경기간 ≥ 8년이면 합산 토글·피상속인 칸을 숨긴다.
 *   본인 칸을 8년 미만에서 8년 이상으로 고치면 피상속인 값이 스토어에 남아(숨긴 칸은 값을 지우지 않는다) 오류만 남고
 *   고칠 칸이 없었다(입력칸 이동 Phase 4 · 계획서 §7-4 C1).
 *
 * 열지 않고 좁히는 근거 = 엔진 소비처: `calculateSelfFarmingReduction`은 합산 후 연수를 **8년 충족 판정에만** 쓴다.
 *   본인 순 자경기간이 이미 8년 이상이면 피상속인 연수는 결과를 바꾸지 않는다(감면율·한도는 연수와 무관).
 *
 * ⚠️ 본인 「순」 기간 = 자경기간 − 결격 과세기간(조특령 §66⑭ — 엔진 `ownYears`). 화면 게이트가 총 기간(결격 전)만 보면
 *   본인 8년·결격 2년(순 6년)에서 합산 칸을 숨기는데 엔진은 합산이 필요하다 → 가림이 아니라 **침묵 오계산**이므로
 *   게이트와 검증 모두 순 기간 단일 술어(`selfFarmingOwnYearsSufficient`)를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { calculateSelfFarmingReduction } from "@/lib/tax-engine/self-farming-reduction";

type SF = Extract<AssetReductionForm, { type: "self_farming" }>;

function form(sf: Partial<SF>) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2025-05-01";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2005-01-01",
    reductions: [
      { type: "self_farming", farmingYears: "10", decedentFarmingYears: "5", useSelfFarmingIncorporation: false, ...sf } as AssetReductionForm,
    ],
  };
  return f;
}
const BLOCK = /피상속인 경작기간을 합산하려면/;
const issue = (sf: Partial<SF>) => validateStep(2, form(sf));

describe("C1 — 피상속인 합산 요건 차단은 본인 순 자경기간이 8년 미만일 때만", () => {
  it("🔑 본인 10년 + 피상속인 5년(남은 값) + 토글 꺼짐 → 막지 않는다 (화면이 칸을 숨기는 구간)", () => {
    expect(issue({})).toBeNull();
  });
  it("🔑 본인 8년(경계) → 막지 않는다", () => {
    expect(issue({ farmingYears: "8" })).toBeNull();
  });
  it("긍정 짝: 본인 7년 + 피상속인 5년 + 토글 꺼짐 → 막는다 (게이트를 지운 게 아니다)", () => {
    expect(issue({ farmingYears: "7" })).toMatch(BLOCK);
  });
  it("🔑 긍정 짝: 본인 8년·결격 2년(순 6년) + 토글 꺼짐 → 막는다 — 엔진이 합산을 필요로 한다", () => {
    expect(issue({ farmingYears: "8", disqualifiedTaxPeriodsSelf: "2" })).toMatch(BLOCK);
  });
  it("본인 10년·결격 2년(순 8년) → 막지 않는다 (경계)", () => {
    expect(issue({ farmingYears: "10", disqualifiedTaxPeriodsSelf: "2" })).toBeNull();
  });
  it("긍정 짝: 본인 7년 + 토글 하나 켬 → 통과 (정상 경로 보존)", () => {
    expect(issue({ farmingYears: "7", heirContinuedFarming1Year: true })).toBeNull();
  });
});

describe("C1 — 엔진 소비 증거: 순 8년 이상이면 피상속인 연수는 결과를 바꾸지 않는다", () => {
  const base = { transferIncome: 100_000_000, minFarmingYears: 8, rate: 1, annualLimit: 100_000_000 } as never;
  const run = (over: Record<string, unknown>) =>
    calculateSelfFarmingReduction({ ...(base as object), ...over } as never);
  it("본인 10년: 합산 토글 꺼짐·켬 모두 qualifies 동일", () => {
    const off = run({ farmingYears: 10, decedentFarmingYears: 5 });
    const on = run({ farmingYears: 10, decedentFarmingYears: 5, heirContinuedFarming1Year: true });
    expect(off.qualifies).toBe(true);
    expect(on.qualifies).toBe(true);
    expect(on.reducibleIncome).toBe(off.reducibleIncome);
  });
  it("본인 8년·결격 2년: 합산 없이는 불충족, 합산하면 충족 — 순 기간이 판정 기준", () => {
    expect(run({ farmingYears: 8, disqualifiedTaxPeriodsSelf: 2, decedentFarmingYears: 5 }).qualifies).toBe(false);
    expect(
      run({ farmingYears: 8, disqualifiedTaxPeriodsSelf: 2, decedentFarmingYears: 5, heirContinuedFarming1Year: true }).qualifies,
    ).toBe(true);
  });
});
