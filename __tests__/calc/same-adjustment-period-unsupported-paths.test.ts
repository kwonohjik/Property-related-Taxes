import { describe, it, expect } from "vitest";
import { sameAdjustmentPeriodError } from "@/lib/calc/transfer-tax-validate-sec164";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
/**
 * §164⑧ — 겸용주택·부담부증여 **명시 차단** (침묵 no-op 금지).
 *
 * 두 경로는 `calculateTransferTax`의 STEP 0.47을 타지 않는다(별도 진입점 / 다른 필드).
 * §80⑤ 후단에 따라 부분별 전기 기준시가·조정월수가 필요한데 입력 모델이 자산당 1쌍뿐이라
 * 한 쌍을 양쪽에 쓰면 조용히 틀린 세액이 나온다 ⇒ 지원 전까지 차단하고 사유를 말한다.
 */
describe("§164⑧ 미지원 경로 차단", () => {
  it("겸용", () => {
    const a = { ...makeDefaultAsset(1), sapEnabled: true, sapPriorStdPrice: "100", isMixedUseHouse: true };
    expect(sameAdjustmentPeriodError(a, "자산1")).toContain("겸용주택");
  });
  it("부담부증여", () => {
    const a = { ...makeDefaultAsset(1), sapEnabled: true, sapPriorStdPrice: "100", transferType: "burdened_gift" as const };
    expect(sameAdjustmentPeriodError(a, "자산1")).toContain("부담부증여");
  });
  it("일반은 통과", () => {
    const a = { ...makeDefaultAsset(1), sapEnabled: true, sapPriorStdPrice: "100" };
    expect(sameAdjustmentPeriodError(a, "자산1")).toBeNull();
  });
  it("OFF면 무조건 통과 (겸용이어도)", () => {
    const a = { ...makeDefaultAsset(1), sapEnabled: false, isMixedUseHouse: true };
    expect(sameAdjustmentPeriodError(a, "자산1")).toBeNull();
  });
});

describe("§164⑧ 나목 요건 위반 차단 (보유월수 > 조정월수)", () => {
  // 나목은 「양도일+2월 내 새 고시」가 전제라 조정월수가 보유월수를 항상 덮는다.
  // 전제가 깨진 조합을 그대로 곱하면 양도당시 기준시가가 새 기준시가를 넘어 세액이 과대해진다.
  const base = {
    ...makeDefaultAsset(1),
    sapEnabled: true,
    sapFormula: "new" as const,
    sapNewStdPrice: "110,000,000",
    acquisitionDate: "2005-03-01",
  };

  it("보유 21월 > 조정 12월 → 차단", () => {
    const msg = sameAdjustmentPeriodError(base, "자산1", "2006-11-01");
    expect(msg).toContain("보유기간 월수");
    expect(msg).toContain("§80①1호나목");
  });

  it("보유 ≤ 조정이면 통과", () => {
    expect(sameAdjustmentPeriodError(base, "자산1", "2005-12-01")).toBeNull();
  });

  it("가목은 100분의 100 한도가 있으므로 차단하지 않는다", () => {
    const a = { ...base, sapFormula: "prev" as const, sapPriorStdPrice: "90,000,000" };
    expect(sameAdjustmentPeriodError(a, "자산1", "2006-11-01")).toBeNull();
  });
});
