/**
 * 토지만 본인 × 같은 세대 합가 — 거주기간을 합가일 이후만 통산했다는 고지(계획서 `land-only-merge-residence-period.plan.md` Q-2 a).
 * 비과세 거주요건은 서면4팀-331·-3794(2006), §155⑳1호 거주요건은 기준-2025-법규재산-0040이 같은 규칙을 답했다 — 정면 해석이 없는 장특 표2 거주분에만 「확인이 필요합니다」를 병기한다(O-12 정정).
 * 시료: `land-only-household-merge-date.anchor.test.ts`와 같다(10억 · 주택 2014-09-01 · 토지 2008-07-01 · 양도 2024-06-01).
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const house = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 400_000_000,
    landTransferPrice: 400_000_000, buildingTransferPrice: 600_000_000, landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 300_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2008-07-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    residencePeriodMonths: 24, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: D("2022-06-01"),
    ...over,
  } as Partial<TransferTaxInput>);
const notices = (i: TransferTaxInput) => (calculateTransferTax(i, rates).warnings ?? []).filter((w) => w.includes("거주기간은 입력하신 세대 합가일"));

describe("고지 — 합가한 토지만 본인 주택에 거주기간이 입력돼 계산에 쓰였을 때 1건", () => {
  it("🔑 B8 합가 2022-06-01 · 거주 24개월: 합가일 · 0040 · 「확인이 필요합니다」", () => {
    const n = notices(house());
    expect(n.length).toBe(1);
    expect(n[0]).toContain("2022-06-01");
    expect(n[0]).toContain("기준-2025-법규재산-0040");
    // O-12(계획서 land-only-merge-residence-self-required.plan.md Q-2 a) — 비과세 거주요건은 2006 해석례가 정면으로 답했다
    expect(n[0]).toContain("서면인터넷방문상담4팀-331(2006.2.17.)");
    expect(n[0]).toContain("-3794(2006.11.17.)");
    // 「정면 해석이 없는 유추 · 확인이 필요합니다」는 표2 거주분에만 걸린다(한 번, 표2 거주분 뒤)
    expect(n[0].split("정면 해석이 없는").length - 1).toBe(1);
    expect(n[0].indexOf("정면 해석이 없는")).toBeGreaterThan(n[0].indexOf("표2 거주분"));
    const hedge = n[0].slice(n[0].indexOf("장기보유특별공제 표2 거주분에"));
    expect(hedge).toContain("확인이 필요합니다");
    expect(hedge).not.toContain("비과세"); // 비과세 거주요건은 정면 해석이 있어 «유추» 문장에 섞지 않는다
  });

  it("거주 0개월 · 합가일이 취득일 이전 · 합가 안 함 · 다른 세대 · 합가 미응답이면 없다", () => {
    expect(notices(house({ residencePeriodMonths: 0 }))).toEqual([]);
    expect(notices(house({ buildingOwnerHouseholdMergeDate: D("2010-01-01") }))).toEqual([]);
    expect(notices(house({ buildingOwnerHouseholdMerged: false }))).toEqual([]);
    expect(notices(house({ buildingOwnerSameHousehold: false }))).toEqual([]);
    expect(notices(house({ buildingOwnerHouseholdMerged: undefined }))).toEqual([]);
  });

  it("값은 바꾸지 않는다 — 고지 유무와 무관하게 거주 24개월 과세표준은 같다(엔진 변경 없음 · 비과세)", () => {
    const r = calculateTransferTax(house(), rates);
    expect([r.isExempt, r.calculatedTax]).toEqual([true, 0]);
  });
});
