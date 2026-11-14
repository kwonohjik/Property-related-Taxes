/**
 * @vitest-environment jsdom
 *
 * anchor(⑦) — §155⑳ 임대사업 승계 echo가 계산기 결과 카드에 호별 한 줄로 뜬다 (G-3·G-5 · Q-6 · 계획서 PR-2).
 * 실제 route 응답(`rentalHousingExceptionDetail`)을 그대로 카드에 그린다 — echo 필드가 엔진→API→카드까지 이어지는지 본다. 세액 불변(표시 전용).
 *
 * | # | 입력 | 결과 |
 * |---|---|---|
 * | E-1 | 증여 승계(증여자 24개월) | 카드에 「같은 세대원에게 증여받아 계속 임대 — 증여자 임대기간 24개월」 · 증여자 신청일 |
 * | E-2 | 상속 승계(30개월) | 카드에 「피상속인 임대기간 30개월」 |
 * | E-3 | 승계 없음 | echo 목록 없음 |
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

function form(unitOver: Record<string, unknown> = {}, formOver: Record<string, unknown> = {}, price = "800000000", fixedAcq = "300000000") {
  const rh = {
    ...makeDefaultAsset(1).rentalHousingException,
    applyException: true,
    scenario: "A",
    priorRentalExemptionHistory: "none",
    rentalUnits: [{ ...makeDefaultRentalUnit(), rentalInputMode: "direct", rentalMonths: "130", requirementsConfirmed: true, ...NA, ...unitOver }],
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


const DONOR = {
  donorBusinessRegistrationDate: "2003-04-01",
  donorRentalRegistrationDate: "2003-05-01",
  donorRentalRegisteredDate: "2003-05-01",
};

describe("⑦ 임대사업 승계 echo", () => {
  it("E-1 증여 승계 — 증여자 개월·증여자 신청일을 풀어 쓴다", async () => {
    const r = await runCalc(form({ rentalSuccession: "household_gift", decedentRentalMonths: "24", ...DONOR }));
    const d = r.result?.rentalHousingExceptionDetail;
    expect(d?.eligibility.perUnitVerdict?.[0].succession).toMatchObject({ kind: "household_gift", predecessorMonths: 24 });
    const t = cardText(d);
    expect(t).toContain("1호: 같은 세대원에게 증여받아 계속 임대 — 증여자 임대기간 24개월을 더했고");
    expect(t).toContain("증여자 지자체 등록 신청일 2003-05-01");
  });

  it("E-2 상속 승계 — 피상속인 개월", async () => {
    const r = await runCalc(form({ rentalSuccession: "inheritance", decedentRentalMonths: "30" }));
    expect(cardText(r.result?.rentalHousingExceptionDetail)).toContain("1호: 상속받아 계속 임대 — 피상속인 임대기간 30개월을 더했습니다");
  });

  it("E-3 승계 없음 — echo 목록을 그리지 않는다", async () => {
    const r = await runCalc(form());
    const { container } = render(<RentalHousingExceptionDetailCard detail={r.result!.rentalHousingExceptionDetail!} />);
    expect(container.querySelector('[data-testid="rental-succession-echo"]')).toBeNull();
  });
});
