/**
 * D3 — §155⑦ 농어촌주택과 §155① 일시적 2주택이 겹친 3주택 (`ruralTemporaryTwoHouseOverlapCountHolds`).
 *
 * ⑦ 농어촌주택과 일반주택을 각각 1개씩 소유한 1세대가 신규 주택을 취득해 3주택이 된 상태에서 종전 일반주택을
 * 양도하면 농어촌주택을 빼고 §155①을 적용한다(서면인터넷방문상담4팀-3617 · 서면인터넷방문상담4팀-977).
 * ⑦·⑳·① 세 특례를 함께 쓴 4주택은 부인됐다(부동산납세과-870) — 3주택까지만.
 *
 * 판정 메뉴 route 결론은 해석례 평가셋(`E022-*` match · `E022-current-rural-later-unmet` 음성 짝)이 고정한다.
 *
 * | # | 소비처 | 주장 |
 * |---|---|---|
 * | X-1 | 비과세 E-3 | 3주택 + ⑦ 충족 + ① 기간 충족 → 비과세 · ⑦ 근거가 함께 표시된다 |
 * | X-2 | 비과세 E-3 | ⑦ 요건 미달(⑩5호)이면 3주택 그대로 → 과세(음성 짝) |
 * | X-3 | 비과세 E-3 | 4주택이면 ⑦을 빼도 3채 → 과세(음성 짝) |
 * | X-4 | 비과세 E-3 | ① 기간(3년) 경과면 ⑦을 빼도 불성립 → 과세(음성 짝) |
 * | S-1 | 중과 15호 선판정 | 같은 술어 — 중첩이면 `temporary_two_house`, ⑦ 미달이면 없음 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveDeemedOneHouseBy155 } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** E022-current — 종전 2019-06-01 · 귀농 2022-01-10 · 신규 2023-09-01 · 양도 2026-06-15 · 비조정 9억 */
function overlap(over: Partial<TransferTaxInput> = {}, rural: Record<string, unknown> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 3,
    transferPrice: 900_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: D("2019-06-01"),
    transferDate: D("2026-06-15"),
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    temporaryTwoHouse: { previousAcquisitionDate: D("2019-06-01"), newAcquisitionDate: D("2023-09-01") },
    ruralHouse: {
      kind: "return_to_farm",
      isOutsideCapitalEupMyeon: true,
      acquisitionDate: D("2022-01-10"),
      isHighPriceAtAcquisition: false,
      landAreaSqm: 300,
      wholeHouseholdMoved: true,
      ...rural,
    } as TransferTaxInput["ruralHouse"],
    ...over,
  });
}

describe("X 비과세 E-3 — ⑦·① 중첩 3주택", () => {
  it("X-1 ⑦ 충족 + ① 기간 충족 → 비과세 · 두 조문이 함께 근거", () => {
    const r = calculateTransferTax(overlap(), rates);
    expect(r.isExempt).toBe(true);
    // 구조화 근거(155-1 · 155-7)는 판정 메뉴 route 관측(평가셋 E022-*)이 고정한다 — 여기선 사람이 읽는 근거.
    expect(r.exemptReason).toContain("일시적 2주택 비과세");
    expect(r.exemptReason).toContain("§155⑦3호 귀농 농어촌주택 제외");
  });
  it("X-2 ⑩5호(세대 전원 이사) 미달 → 과세", () => {
    expect(calculateTransferTax(overlap({}, { wholeHouseholdMoved: false }), rates).isExempt).toBe(false);
  });
  it("X-3 4주택 → 과세(3주택까지만)", () => {
    expect(calculateTransferTax(overlap({ householdHousingCount: 4 }), rates).isExempt).toBe(false);
  });
  it("X-4 신규 취득 후 3년 경과 → 과세", () => {
    expect(calculateTransferTax(overlap({ transferDate: D("2026-09-02") }), rates).isExempt).toBe(false);
  });
});

describe("S-1 중과 15호 선판정 — 같은 술어", () => {
  const rules = {
    temporary_two_house: {
      disposalDeadlineYears: 3,
      regulatedAreaDeadlineYears: 2,
      regulatedAreaRelaxDate: "2022-05-10",
      regulatedAreaRelaxDeadlineYears: 3,
    },
  } as unknown as OneHouseSpecialRulesData;
  it("중첩이면 temporary_two_house · ⑦ 미달이면 성립하지 않는다", () => {
    expect(resolveDeemedOneHouseBy155(overlap(), rules)).toBe("temporary_two_house");
    expect(resolveDeemedOneHouseBy155(overlap({}, { wholeHouseholdMoved: false }), rules)).toBeUndefined();
  });
});
