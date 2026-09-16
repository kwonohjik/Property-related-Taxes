/**
 * anchor — **차손 자산도 적용 세율·§104 호를 싣는다** (신고서 「세율구분 코드」 열)
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * 양도차익이 0 이하면 `buildLossTransferTaxResult`가 조기반환하는데, 종전에는
 * `appliedRate: 0`을 싣고 `rateClause`를 **아예 넣지 않았다**(세율 단계에 도달하지 않는다).
 * 그 결과 신고서의 **「세율구분 코드」 열이 `-`** 가 되어, **미등기 양도인지 화면에서
 * 판별할 수 없었다**. 미등기의 효과 넷이 차손 + 실거래가 자산에서는 전부 관측 불가이기 때문이다:
 *
 * | 효과 | 차손 자산에서 |
 * |---|---|
 * | 70% 단일세율 (§104①10호) | 세액 0 — 세율 미표시 |
 * | 장기보유특별공제 배제 (§95②) | 차손이라 어차피 0 |
 * | 기본공제 배제 (§103①) | 합산 단계에서만 작동 |
 * | 필요경비개산공제 0.3% (§163⑥4) | **환산취득가 모드 전용** — 실거래가면 무효 |
 *
 * 사용자가 미등기 토글을 켜고 계산했는데도 화면이 종전과 똑같아 **적용 여부를 확인할 길이
 * 없었다**(계획서 `loss-offset-same-rate-axis.plan.md` §10 결함 ③).
 *
 * 🔒 **세액은 한 원도 바뀌지 않는다** — 실리는 것은 표시 축뿐이다. T-0이 그것을 고정한다.
 *
 * ⚠️ 이 echo는 **정상 경로(STEP 7)와 같은 입력**으로 만들어야 한다 — `selfOwns === "land_only"`면
 *   세율 기산일이 토지 취득일이다(소령 §166⑥). 같은 자산이 차익일 때와 차손일 때 다른 호를
 *   표시하면 안 된다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

/** 양도가 100,000,000 < 취득가 120,000,000 → 양도차손 −20,000,000 */
function lossInput(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2024-01-01"),
    transferPrice: 100_000_000,
    acquisitionPrice: 120_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    ...o,
  });
}

describe("차손 자산의 세율·호 echo", () => {
  it("T-0 🔒: 세액은 전부 0 그대로다 (표시 축만 바뀐다)", () => {
    const r = calculateTransferTax(lossInput({ isUnregistered: true }), mockRates);
    expect(r.transferGain).toBe(-20_000_000);
    expect(r.taxBase).toBe(0);
    expect(r.calculatedTax).toBe(0);
    expect(r.determinedTax).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it("T-1: 미등기 차손 → §104①10호 · 70% (종전 undefined · 0)", () => {
    const r = calculateTransferTax(lossInput({ isUnregistered: true }), mockRates);
    expect(r.rateClause).toBe("104-1-10");
    expect(r.appliedRate).toBe(0.7);
  });

  it("T-2: 주택 1년미만 차손 → §104①3호 · 70%", () => {
    const r = calculateTransferTax(
      lossInput({ propertyType: "housing", acquisitionDate: D("2025-10-01") }),
      mockRates,
    );
    expect(r.rateClause).toBe("104-1-3");
    expect(r.appliedRate).toBe(0.7);
  });

  it("T-3: 일반 누진 차손 → §104①1호", () => {
    const r = calculateTransferTax(lossInput(), mockRates);
    expect(r.rateClause).toBe("104-1-1");
  });

  it("T-4: 비사업용 토지 차손 → §104①8호", () => {
    const r = calculateTransferTax(lossInput({ isNonBusinessLand: true }), mockRates);
    expect(r.rateClause).toBe("104-1-8");
  });

  it("T-5: 차익일 때와 **같은 호**를 표시한다 — 부호만 다른 동일 자산", () => {
    const loss = calculateTransferTax(
      lossInput({ propertyType: "housing", acquisitionDate: D("2025-10-01") }),
      mockRates,
    );
    const gain = calculateTransferTax(
      lossInput({
        propertyType: "housing",
        acquisitionDate: D("2025-10-01"),
        transferPrice: 200_000_000,
        acquisitionPrice: 120_000_000,
      }),
      mockRates,
    );
    expect(gain.transferGain).toBeGreaterThan(0);
    expect(loss.rateClause).toBe(gain.rateClause);
    expect(loss.appliedRate).toBe(gain.appliedRate);
  });

  it("T-6: `selfOwns=\"land_only\"`는 **토지 취득일**로 호를 정한다 (소령 §166⑥)", () => {
    // 건물 취득 2024-01-01(2년 이상) · 토지 취득 2025-10-01(8개월) — 토지만 본인 소유.
    // 기산일을 건물 취득일로 잡으면 §104①1호(누진)가 되어 차익일 때와 어긋난다.
    const common = {
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: D("2025-10-01"),
      selfOwns: "land_only" as const,
      landTransferPrice: 40_000_000,
      buildingTransferPrice: 60_000_000,
      landAcquisitionPrice: 60_000_000,
      buildingAcquisitionPrice: 60_000_000,
    };
    const loss = calculateTransferTax(lossInput(common), mockRates);
    expect(loss.transferGain).toBeLessThan(0);
    expect(loss.rateClause, "토지 8개월 → §104①3호").toBe("104-1-3");
    expect(loss.appliedRate).toBe(0.5); // 토지 1년 미만 50%
  });
});
