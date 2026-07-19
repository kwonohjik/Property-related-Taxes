/**
 * Pre-Do 앵커 — 일시적 2주택 종전주택 §154① 단서 보유면제 (§155①→§154① 준용)
 *
 * 계획서: docs/02-design/features/transfer-154-proviso-temporary-two-house-gap.plan.md §7
 * 갭: 현행 checkExemption 일시적 2주택 경로(transfer-tax-exemption.ts:215~239)는
 *     종전주택 보유 2년만 판정, §154① 단서(공익수용 등) 보유면제 미적용.
 * 세법: §155① 2문이 §154①1호·2호가목·3호 인용 → 종전주택 보유 2년 미달이어도
 *       단서 사유(both, 화이트리스트) 해당 시 비과세. 나·다목(출국일 1주택)·5호(무주택)는 제외.
 *
 * 화이트리스트 = {rental_5yr_residence(1호), expropriation(2호가), unavoidable(3호)}.
 * acquisitionDate === previousAcquisitionDate 동일 세팅(§5 불변식 — 양도 대상=종전주택).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { provisoGate, effectiveProvisoReason } from "@/lib/calc/transfer-tax-api-helpers";

const mockRates = makeMockRates();

// 일시적 2주택 종전주택 양도 — 보유 1년11개월(2년 미달), 처분기한 내, 비조정
// 종전 취득 2024-01-01 = acquisitionDate, 신규 취득 2024-03-01, 양도 2025-12-01(보유 ~23개월)
function tempTwoHouseInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    transferPrice: 500_000_000, // < 12억 → 전액 비과세 판정
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2024-01-01"),
    transferDate: new Date("2025-12-01"), // 보유 ~23개월 < 2년
    isRegulatedArea: false, // 처분기한 = disposalDeadlineYears(3) → 2027-03-01, 양도일 이내
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: new Date("2024-01-01"), // = acquisitionDate (§5 불변식)
      newAcquisitionDate: new Date("2024-03-01"),
    },
    ...over,
  });
}

describe("일시적 2주택 종전주택 §154① 단서 보유면제 (앵커)", () => {
  // #1 2호가(수용) — 취득(2024-01-01) < 사업인정(2024-06-01) + 수용일+5년 내 → both → 보유면제
  it("★ #1 2호가 수용: 보유 1년11개월이어도 비과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(
      tempTwoHouseInput({
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: new Date("2024-06-01"),
          expropriationDate: new Date("2025-11-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  // #2 3호(부득이) — 거주 1년 이상 → both → 보유면제
  it("★ #2 3호 부득이: 거주 12개월 → 보유면제 비과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(
      tempTwoHouseInput({
        residencePeriodMonths: 12,
        oneHouseExemptionProviso: { reason: "unavoidable" },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  // #3a 나목(해외이주) — both 반환하나 화이트리스트 제외 → 보유면제 미발동 → 과세
  it("#3a 나목 해외이주: 화이트리스트 제외 → 보유2년미달 과세", () => {
    const r = calculateTransferTax(
      tempTwoHouseInput({
        oneHouseExemptionProviso: {
          reason: "overseas_migration",
          departureDate: new Date("2025-06-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  // #3b 5호(공고전계약) — residence_only(both 아님) → 보유면제 미발동 → 과세
  it("#3b 5호 공고전계약: residence_only → 보유2년미달 과세", () => {
    const r = calculateTransferTax(
      tempTwoHouseInput({
        oneHouseExemptionProviso: { reason: "pre_designation_contract" },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  // #4 회귀 — proviso 없음 + 보유 2년 미달 → 과세(현행 동작 불변)
  it("#4 회귀: proviso 없음 + 보유 1년11개월 → 과세", () => {
    const r = calculateTransferTax(tempTwoHouseInput(), mockRates);
    expect(r.isExempt).toBe(false);
  });

  // #5 회귀 — proviso 없음 + 보유 2년 이상 → 정상 일시적 2주택 비과세(불변)
  it("#5 회귀: proviso 없음 + 보유 2년 이상 → 비과세(불변)", () => {
    const r = calculateTransferTax(
      tempTwoHouseInput({
        acquisitionDate: new Date("2023-01-01"),
        transferDate: new Date("2025-12-01"), // 보유 ~35개월 ≥ 2년
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2023-01-01"),
          newAcquisitionDate: new Date("2024-03-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });
});

describe("provisoGate·effectiveProvisoReason — UI 파생 (앵커)", () => {
  const base = {
    isOneHousehold: true,
    isHousing: true,
    householdHousingCount: "1",
    temporaryTwoHouseSpecial: false,
  };
  it("1주택 → visible·one_house", () => {
    expect(provisoGate(base)).toEqual({ visible: true, mode: "one_house" });
  });
  it("2주택+일시적특례 → visible·temporary_two_house", () => {
    expect(
      provisoGate({ ...base, householdHousingCount: "2", temporaryTwoHouseSpecial: true }),
    ).toEqual({ visible: true, mode: "temporary_two_house" });
  });
  it("2주택 특례 OFF → 숨김", () => {
    expect(provisoGate({ ...base, householdHousingCount: "2" })).toEqual({ visible: false, mode: null });
  });
  it("3주택 → 숨김", () => {
    expect(provisoGate({ ...base, householdHousingCount: "3" })).toEqual({ visible: false, mode: null });
  });
  it("비1세대·비주택 → 숨김", () => {
    expect(provisoGate({ ...base, isOneHousehold: false })).toEqual({ visible: false, mode: null });
    expect(provisoGate({ ...base, isHousing: false })).toEqual({ visible: false, mode: null });
  });
  it('effectiveProvisoReason: temp+나·다목·5호 → ""(화이트리스트 제외)', () => {
    expect(effectiveProvisoReason("temporary_two_house", "overseas_migration")).toBe("");
    expect(effectiveProvisoReason("temporary_two_house", "pre_designation_contract")).toBe("");
  });
  it("effectiveProvisoReason: temp+1·2가·3호 → 유지", () => {
    expect(effectiveProvisoReason("temporary_two_house", "expropriation")).toBe("expropriation");
    expect(effectiveProvisoReason("temporary_two_house", "unavoidable")).toBe("unavoidable");
  });
  it('effectiveProvisoReason: one_house+overseas → 유지 / 빈 reason → ""', () => {
    expect(effectiveProvisoReason("one_house", "overseas_migration")).toBe("overseas_migration");
    expect(effectiveProvisoReason("temporary_two_house", "")).toBe("");
  });
  it('effectiveProvisoReason: mode null(카드 숨김) → ""(stale reason 미전송·데드락 방지)', () => {
    // 1주택서 나·다목·5호 선택 후 주택수 2(특례 OFF)/3 전환 → mode null → stale reason 정규화
    expect(effectiveProvisoReason(null, "overseas_migration")).toBe("");
    expect(effectiveProvisoReason(null, "expropriation")).toBe("");
    expect(effectiveProvisoReason(null, "pre_designation_contract")).toBe("");
  });
});
