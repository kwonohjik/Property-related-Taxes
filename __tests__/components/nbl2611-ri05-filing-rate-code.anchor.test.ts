/**
 * NBL2611-V9-RI05 (R12) Pre-Do anchor — 신고서 ③ 세율구분: 보유 2년 미만 비사업용 토지에서 단기세율이 이기면 1-35 / 1-36.
 *
 * 정본(KoreanLaw MCP `get_annexes` 「소득세법 시행규칙」 [별지 제84호서식] 작성방법 3쪽 «과세대상자산 및 세율», 2026-11-19 본문 실측):
 *   · ⑨ 1-11 일반세율 +10% 가산 비사업용토지 (16~52%, ’21.1.1. 이후 16~55%)
 *   · ⑩ 1-35 **1년 이상 2년 미만 보유 비사업용토지** — 40%
 *   · ⑪ 1-36 **1년 미만 보유 비사업용토지** — 50%
 *   · ② 1-15 / ③ 1-20 은 «토지·건물 및 부동산에 관한 권리» 중 **비사업용이 아닌** 1~2년 / 1년 미만 보유 자산이다.
 * 같은 서식 부표 1 작성방법 1호의 표에서도 비사업용토지의 1~2년 = 코드 35, 1년 미만 = 코드 36.
 *
 * 엔진은 「소득세법」 §104① 후단에 따라 비사업용 +10%p 누진세액과 단기세율(2·3호) 세액 중 큰 쪽을 적용하고,
 * 단기가 이기면 `rateClause`가 `104-1-2`/`104-1-3`이라 호만으로는 비사업용 토지인지 알 수 없다(종전 1-15/1-20 오기재).
 */
import { describe, it, expect } from "vitest";
import { resolveFilingRateCode } from "@/components/calc/results/transfer/filing-rate-code";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const d = (s: string) => new Date(s);
const cell = (rows: { label: string; values: Record<string, unknown> }[], label: string) =>
  rows.find((r) => r.label === label)?.values["total"] ?? null;

function nblShort(acq: string, trn: string) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      isNonBusinessLand: true,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      acquisitionDate: d(acq),
      transferDate: d(trn),
      transferPrice: 150_000_000,
      acquisitionPrice: 100_000_000,
    }),
    makeMockRates(),
  );
}

describe("엔진 전제 — 비사업용 토지 단기 보유에서 단기세율이 이긴다", () => {
  it("1년 이상 2년 미만: 호 104-1-2 · 세율 40%", () => {
    const r = nblShort("2023-01-01", "2024-06-01");
    expect(r.rateClause).toBe("104-1-2");
    expect(r.appliedRate).toBe(0.4);
  });
  it("1년 미만: 호 104-1-3 · 세율 50%", () => {
    const r = nblShort("2024-01-01", "2024-06-01");
    expect(r.rateClause).toBe("104-1-3");
    expect(r.appliedRate).toBe(0.5);
  });
});

describe("[정본 ③ ⑩ ⑪] 단건 신고서 — 비사업용 토지 단기", () => {
  // 기본 폼의 첫 자산은 주택이다 — 토지 카드로 바꾼다(코드는 자산 종류도 본다).
  const base = createDefaultTransferFormData();
  const form = { ...base, assets: [{ ...base.assets[0], assetKind: "land" as const }, ...base.assets.slice(1)] };
  it("🔴 1~2년 보유 비사업용 → 1-35 · 40% (종전 1-15)", () => {
    const rows = buildRows(nblShort("2023-01-01", "2024-06-01"), "single", form);
    expect(cell(rows, "세율구분 코드")).toBe("1-35");
    expect(cell(rows, "세율")).toBe("40%");
  });
  it("🔴 1년 미만 보유 비사업용 → 1-36 · 50% (종전 1-20)", () => {
    const rows = buildRows(nblShort("2024-01-01", "2024-06-01"), "single", form);
    expect(cell(rows, "세율구분 코드")).toBe("1-36");
    expect(cell(rows, "세율")).toBe("50%");
  });
  it("대조: 사업용 토지 1~2년은 그대로 1-15 (비사업용만 바뀐다)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        isNonBusinessLand: false,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
        acquisitionDate: d("2023-01-01"),
        transferDate: d("2024-06-01"),
        transferPrice: 150_000_000,
        acquisitionPrice: 100_000_000,
      }),
      makeMockRates(),
    );
    expect(cell(buildRows(r, "single", form), "세율구분 코드")).toBe("1-15");
  });
});

describe("resolveFilingRateCode — 비사업용 단기 표지", () => {
  const code = (clause: string, kind: string, date: string, extra: Record<string, unknown> = {}) =>
    resolveFilingRateCode({ rateClause: clause as never, assetKind: kind as never, transferDate: date, ...extra });
  it("표지가 있으면 단기 호를 1-35 / 1-36으로 적는다", () => {
    expect(code("104-1-2", "land", "2024-06-01", { nonBusinessLandShortTerm: true })).toBe("1-35");
    expect(code("104-1-3", "land", "2024-06-01", { nonBusinessLandShortTerm: true })).toBe("1-36");
  });
  it("표지가 없으면 종전대로 1-15 / 1-20 (사업용 토지·표지 미전달 이력)", () => {
    expect(code("104-1-2", "land", "2024-06-01")).toBe("1-15");
    expect(code("104-1-3", "land", "2024-06-01")).toBe("1-20");
  });
  it("표지가 있어도 호가 단기가 아니면 영향이 없다 (8호 → 1-11)", () => {
    expect(code("104-1-8", "land", "2024-06-01", { nonBusinessLandShortTerm: true })).toBe("1-11");
  });
});
