/**
 * @vitest-environment jsdom
 *
 * anchor — 계산기: **⑳ 호별·거주 요건이 불성립이면 결과에 「적용 불가 + 미충족 사유」 카드가 뜬다** (V-7).
 *
 * 종전: 호별 토글 OFF(SYNC-2로 ⑧이 막지 않는다)·거주기간 미달이면 엔진은 불성립으로 계산하는데 결과에 ⑳ 카드가 없고,
 * 사유는 접힌 「전체 엔진 계산 과정 보기」 한 줄뿐이었다. 불성립 판정(`applied: false`)을 `rentalHousingExceptionDetail`로 싣는다.
 * 세액은 불변(표시 전용) — 아래 T-세액이 성립 시료와 같은 입력의 불성립 세액을 고정한다.
 *
 * | # | 입력 | 결과 |
 * |---|---|---|
 * | U-1 | 나목 · 2호 이상 토글 OFF | detail.applied=false · 사유 「2호 이상」 · 카드 「적용 불가」 |
 * | U-2 | 나목 · 거주 0개월 | detail.applied=false · 거주 사유 · 카드 「적용 불가」 |
 * | U-3 | 나목 · 요건 충족 | detail.applied=true (대조 — 종전과 같다) |
 */
import { it, expect, vi, beforeEach, describe, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({
  ...(await o<typeof import("@/lib/db/tax-rates")>()),
  preloadTaxRates: vi.fn(),
}));
vi.mock("@/lib/api/rate-limit", async (o) => ({
  ...(await o<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

const NA = {
  businessRegistrationDate: "2003-05-01",
  rentalRegistrationDate: "2003-05-01",
  rentalCategory: "existing_business",
  rentalAcquisitionType: "purchase",
  region: "seoul-metro",
  acquisitionOfficialPrice: "200000000",
  standardPriceAtRentalStart: "200000000",
  isNationalSizeHousing: true,
  hasMinimum2Units: true,
};

function form(u: Record<string, unknown>, residenceMonths = "60") {
  const rh = {
    ...makeDefaultAsset(1).rentalHousingException,
    applyException: true,
    scenario: "A",
    priorRentalExemptionHistory: "none",
    rentalUnits: [{ ...makeDefaultRentalUnit(), rentalInputMode: "direct", rentalMonths: "130", requirementsConfirmed: true, ...u }],
  };
  return redevAptForm({
    kind: "housing",
    price: "800000000",
    count: "2",
    houses: [
      houseRow("rt", "2003-05-01", {
        region: "capital",
        officialPrice: "200000000",
        isApartment: false,
        acquisitionOrigin: "general",
        isLongTermRental: true,
      } as never),
    ],
    assetOver: {
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      fixedAcquisitionPrice: "300000000",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: residenceMonths,
      residencePeriods: [],
      rentalHousingException: rh,
    },
    formOver: { transferDate: "2026-03-15", filingDate: "2026-05-31", residencePeriodMonths: residenceMonths } as never,
  });
}

function cardText(detail: NonNullable<Awaited<ReturnType<typeof runCalc>>["result"]>["rentalHousingExceptionDetail"]) {
  const { container } = render(<RentalHousingExceptionDetailCard detail={detail!} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("V-7 ⑳ 불성립 → 결과 카드", () => {
  it("U-1 나목 · 2호 이상 토글 OFF — 카드 「적용 불가」 + 사유", async () => {
    const r = await runCalc(form({ ...NA, hasMinimum2Units: false }));
    expect(r.issues).toEqual([]); // ⑧은 막지 않는다(SYNC-2)
    const d = r.result?.rentalHousingExceptionDetail;
    expect(d?.applied).toBe(false);
    const t = cardText(d);
    expect(t).toContain("적용 불가");
    expect(t).toContain("2호 이상");
    expect(r.result?.totalTax).toBe(124366000); // 세액 불변(mock 세율) — 종전과 같다
    expect(r.result?.isExempt).toBe(false);
  });

  it("U-2 나목 · 거주 0개월 — 카드 「적용 불가」 + 거주 사유", async () => {
    const r = await runCalc(form(NA, "0"));
    const d = r.result?.rentalHousingExceptionDetail;
    expect(d?.applied).toBe(false);
    const t = cardText(d);
    expect(t).toContain("적용 불가");
    expect(t).toContain("거주");
    expect(r.result?.totalTax).toBe(124366000);
  });

  it("U-3 대조 — 요건 충족이면 적용 카드(applied=true)", async () => {
    const r = await runCalc(form(NA));
    expect(r.result?.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.result?.totalTax).toBe(0);
  });
});
