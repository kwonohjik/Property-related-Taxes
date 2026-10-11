/**
 * S06-12 anchor — 나목(기존사업자 매입임대) 등록일 게이트는 **지자체 ≤ 2003.10.29. 그리고 세무서 ≤ 2004.6.30.**(의제 포함)이다.
 *
 * 근거(「소득세법 시행령」 §167조의3①2호 · MST 290841 원문 확인):
 *   - 각 목 외의 부분 괄호: 「2003년 10월 29일(기존사업자기준일) 현재 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록을 했으나
 *     법 제168조에 따른 사업자등록을 하지 않은 거주자가 2004년 6월 30일까지 같은 조에 따른 사업자등록을 한 때에는 … 임대사업자등록일에
 *     … 사업자등록을 한 것으로 본다」
 *   - 나목: 「기존사업자기준일 이전에 사업자등록등을 하고 … (기존사업자기준일 이전에 임대주택으로 등록하여 임대하는 것에 한한다)」
 * 종전에는 세무서 등록일 ≤ 2003.10.29.만 봐서 의제(세무서 2004-03-01 · 지자체 2003-05-01)는 불통과(불리),
 * 지자체 등록이 기준일 뒤(세무서 2003-05-01 · 지자체 2015-05-01)인 호는 통과(유리 — 판정 메뉴 비과세)였다. 두 방향 모두 정정한다.
 * 다주택 중과 경로가 같은 leaf(`checkRentalArticle`)를 쓰므로 한 곳 수정으로 ⑳·다주택이 정합한다.
 */
import { describe, it, expect } from "vitest";
import { checkRentalArticle, type NormalizedRentalUnit } from "@/lib/tax-engine/rental-article/check";
import { deriveCategoryAvailability } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { mkCase, observeRaw } from "../../calc/_one-house-pr3a-judge-route";

const u = (biz: string, rent: string): NormalizedRentalUnit => ({
  businessRegistrationDate: new Date(biz), rentalRegistrationDate: new Date(rent), isCapitalArea: true, isApartment: false,
  rentalStartOfficialPrice: 700_000_000, acquisitionOfficialPrice: 200_000_000, rentalYears: 10, landAreaM2: undefined,
  totalFloorAreaM2: undefined, hasMinimum2Units: true, rentIncreaseUnder5Pct: true, isNationalSizeHousing: true,
} as NormalizedRentalUnit);
const avail = (biz: string | null, rent: string | null) =>
  deriveCategoryAvailability(biz ? new Date(biz) : null, rent ? new Date(rent) : null).existing_business.available;

describe("S06-12 나목 등록일 게이트 — leaf · 화면 활성", () => {
  it("긍정 짝: 두 날짜 2003-05-01 → 통과 · 활성", () => {
    expect(checkRentalArticle("나", u("2003-05-01", "2003-05-01")).passed).toBe(true);
    expect(avail("2003-05-01", "2003-05-01")).toBe(true);
  });
  it("의제: 지자체 2003-05-01 · 세무서 2004-03-01(≤2004.6.30.) → 통과 · 활성", () => {
    expect(checkRentalArticle("나", u("2004-03-01", "2003-05-01")).passed).toBe(true);
    expect(avail("2004-03-01", "2003-05-01")).toBe(true);
  });
  it("의제 기한 경계: 세무서 2004-06-30 통과 · 2004-07-01 불통과(REG_DATE_GATE)", () => {
    expect(checkRentalArticle("나", u("2004-06-30", "2003-05-01")).passed).toBe(true);
    expect(checkRentalArticle("나", u("2004-07-01", "2003-05-01")).failCodes).toContain("REG_DATE_GATE");
    expect(avail("2004-07-01", "2003-05-01")).toBe(false);
  });
  it("기준일 경계: 지자체 2003-10-29 통과 · 2003-10-30 불통과", () => {
    expect(checkRentalArticle("나", u("2003-10-29", "2003-10-29")).passed).toBe(true);
    expect(checkRentalArticle("나", u("2003-10-29", "2003-10-30")).failCodes).toContain("REG_DATE_GATE");
  });
  it("역방향: 세무서 2003-05-01 · 지자체 2015-05-01 → 불통과 · 화면 비활성", () => {
    expect(checkRentalArticle("나", u("2003-05-01", "2015-05-01")).failCodes).toContain("REG_DATE_GATE");
    expect(avail("2003-05-01", "2015-05-01")).toBe(false);
  });
  it("날짜 하나만 입력 — 그 날짜만으로 확정되면 비활성, 아니면 활성(판정 불가는 조기 차단하지 않는다)", () => {
    expect(avail(null, "2015-05-01")).toBe(false);
    expect(avail("2015-05-01", null)).toBe(false);
    expect(avail(null, "2003-05-01")).toBe(true);
    expect(avail("2004-03-01", null)).toBe(true);
  });
});

describe("S06-12 판정 메뉴 route", () => {
  const f = (biz: string, rent: string) => ({
    isOneHousehold: true, transferDate: "2026-03-15", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2010-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "60",
      rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [{ unitId: "b", businessRegistrationDate: biz, rentalRegistrationDate: rent,
        rentalCategory: "existing_business", rentalAcquisitionType: "purchase", isApartment: false, region: "seoul-metro", standardPriceAtRentalStart: "700000000",
        acquisitionOfficialPrice: "200000000", isNationalSizeHousing: true, hasMinimum2Units: true, rentalMonths: "130", requirementsConfirmed: true }] } },
    houses: [],
  });
  it("역방향(나목 · 취득 2억 · 임대개시 7억 · 세무서 2003 · 지자체 2015) → 비과세 아님", async () => {
    const o = await observeRaw(mkCase("2026-10-06", f("2003-05-01", "2015-05-01")));
    expect(o.status).toBe(200);
    expect(o.data.rentalHousingException.passed).toBe(false);
    expect(o.j.isExempt).toBe(false);
  });
  it("긍정 짝(두 날짜 2003-05-01) → ⑳ 충족 · 비과세 — 결론을 가르는 것은 지자체 등록일뿐", async () => {
    const o = await observeRaw(mkCase("2026-10-06", f("2003-05-01", "2003-05-01")));
    expect(o.data.rentalHousingException.passed).toBe(true);
    expect(o.j.isExempt).toBe(true);
  });
  it("의제(세무서 2004-03-01 · 지자체 2003-05-01) → ⑳ 충족 · 비과세", async () => {
    const o = await observeRaw(mkCase("2026-10-06", f("2004-03-01", "2003-05-01")));
    expect(o.data.rentalHousingException.passed).toBe(true);
    expect(o.j.isExempt).toBe(true);
  });
});
