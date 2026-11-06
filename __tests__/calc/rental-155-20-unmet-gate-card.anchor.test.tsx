/**
 * @vitest-environment jsdom
 *
 * anchor — 계산기: **⑳ 적용 전제(미등기 · 1세대 아님 · 세대 구성 초과)가 불성립이면 결과에 「적용 불가 + 사유」 카드가 뜬다** (V-7 후속).
 *
 * 호별·거주 요건 판정 전에 막히는 경로라 종전에는 사유가 접힌 「전체 엔진 계산 과정」(`steps`)에만 있었다.
 * 이제 `eligibility.gateFailReasons`를 채운 `applied: false` 상세를 싣는다(`gate-unmet.ts`). 세액은 불변(표시 전용).
 *
 * | # | 입력 | 결과 |
 * |---|---|---|
 * | G-1 | 미등기 양도 | applied=false · 사유 「미등기양도자산」 · 카드 「적용 불가」 |
 * | G-2 | 1세대 아님 | applied=false · 사유 「1세대 요건」 |
 * | G-3 | 세대 구성 초과(구성 판정 주입) | applied=false · 주입한 사유 문구 |
 * | G-4 | 대조 — 게이트 통과 | applied=true · 사유 칸 없음 |
 *
 * 양도차손 경로는 대상이 아니다 — 차손이면 §155⑳ step이 **실행되지 않아**(`transfer-tax.ts` 차손 조기 반환이 먼저) 불성립 사유 자체가 없다(G-5).
 */
import { it, expect, vi, beforeEach, describe, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

const inject = vi.hoisted(() => ({ on: false }));
const INJECTED_REASON = "주입된 세대 구성 불성립(안전망 시료)";

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
vi.mock("@/lib/tax-engine/transfer-tax-rental-residence-composition", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-rental-residence-composition")>();
  return {
    ...actual,
    resolveRentalResidenceComposition: (...args: Parameters<typeof actual.resolveRentalResidenceComposition>) =>
      inject.on
        ? { status: "exceeded" as const, otherHouseCount: 1, reason: INJECTED_REASON }
        : actual.resolveRentalResidenceComposition(...args),
  };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";

beforeEach(() => {
  inject.on = false;
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

function form(formOver: Record<string, unknown> = {}, price = "800000000", fixedAcq = "300000000") {
  const rh = {
    ...makeDefaultAsset(1).rentalHousingException,
    applyException: true,
    scenario: "A",
    priorRentalExemptionHistory: "none",
    rentalUnits: [{ ...makeDefaultRentalUnit(), rentalInputMode: "direct", rentalMonths: "130", requirementsConfirmed: true, ...NA }],
  };
  return redevAptForm({
    kind: "housing",
    price,
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
      fixedAcquisitionPrice: fixedAcq,
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "60",
      residencePeriods: [],
      rentalHousingException: rh,
    },
    formOver: { transferDate: "2026-03-15", filingDate: "2026-05-31", residencePeriodMonths: "60", ...formOver } as never,
  });
}

type Detail = NonNullable<Awaited<ReturnType<typeof runCalc>>["result"]>["rentalHousingExceptionDetail"];
function cardText(detail: Detail) {
  const { container } = render(<RentalHousingExceptionDetailCard detail={detail!} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("V-7 후속 — ⑳ 적용 전제 불성립 → 결과 카드", () => {
  it("G-1 미등기 양도 — 카드 「적용 불가」 + 미등기 사유", async () => {
    const r = await runCalc(form({ isUnregistered: true }));
    const d = r.result?.rentalHousingExceptionDetail;
    expect(d?.applied).toBe(false);
    expect(d?.eligibility.gateFailReasons?.join(" ")).toContain("미등기양도자산");
    const t = cardText(d);
    expect(t).toContain("적용 불가");
    expect(t).toContain("미등기양도자산");
    expect(t).not.toContain("거주기간(2년 이상)과 임대주택 정보를 정확히 입력"); // 입력 안내가 아니라 전제 안내
  });

  it("G-2 1세대 아님 — 카드 「적용 불가」 + 1세대 사유", async () => {
    const r = await runCalc(form({ isOneHousehold: false }));
    const d = r.result?.rentalHousingExceptionDetail;
    expect(d?.applied).toBe(false);
    expect(d?.eligibility.gateFailReasons?.join(" ")).toContain("1세대 요건");
    expect(cardText(d)).toContain("1세대 요건");
  });

  it("G-3 세대 구성 초과 — 카드에 구성 불성립 사유", async () => {
    inject.on = true;
    const r = await runCalc(form());
    const d = r.result?.rentalHousingExceptionDetail;
    expect(d?.applied).toBe(false);
    expect(d?.eligibility.gateFailReasons).toContain(INJECTED_REASON);
    expect(cardText(d)).toContain(INJECTED_REASON);
  });

  it("G-4 대조 — 게이트를 통과하면 적용 카드(사유 칸 없음)", async () => {
    const r = await runCalc(form());
    const d = r.result?.rentalHousingExceptionDetail;
    expect(d?.applied).toBe(true);
    expect(d?.eligibility.gateFailReasons).toBeUndefined();
  });

  it("G-5 양도차손 — ⑳ step이 실행되지 않아 불성립 상세가 없다(사유 자체가 없다)", async () => {
    const r = await runCalc(form({}, "200000000", "300000000")); // 양도가 2억 < 취득가 3억
    expect(r.result?.rentalHousingExceptionDetail).toBeUndefined();
    expect((r.result?.steps ?? []).some((s: { label: string }) => s.label.includes("장기임대주택 거주주택 비과세 특례"))).toBe(false);
  });
});
