/**
 * anchor: §97의3 — **매입임대 등록 시한 2020.12.31** (D2-07 후속 축)
 *
 * D2-07(`rental-97-addenda-transitional.anchor.test.ts`)은 「민간건설임대주택 **한정**은
 * 2023.1.1 이후 등록분부터」를 맞게 잡았다. 그러나 그 **앞 구간의 등록 시한**을 보지 않아
 * 2021.1.1~2022.12.31 등록 **매입임대**가 통과하고 있었다.
 *
 * 종전 문언(2022-12-08 시행본 mst 237393 §97의3①):
 *   「…**2020년 12월 31일**(「민간임대주택에 관한 특별법」 제2조제2호에 따른 **민간건설임대주택의
 *    경우에는 2022년 12월 31일**)**까지** … 등록 … 100분의 50 … 다만 10년 이상 … 100분의 70」
 *
 * 근거 3층 (2026-09-14 법제처 원문):
 *   1. 괄호(매입 2020.12.31 / 건설 2022.12.31)는 **법률 제17759호**(2020.12.29 공포, 2021.1.1 시행)에서
 *      신설됐다 — 2020-01-01 시행본(mst 212779)은 「2022.12.31까지」 단일이고, 2021-01-01 시행본
 *      (mst 224851)에 괄호가 처음 등장한다.
 *   2. 법률 제17759호 부칙에 **§97의3 전용 적용례·경과조치가 없다**(부칙 전문 7,182자 전수) ⇒
 *      일반 적용례 **부칙 §2③**(양도소득세 개정규정은 시행 이후 양도분부터).
 *   3. 2023년 개정(법률 제19199호) **부칙 §38**이 시행 전 등록분을 종전 규정에 남기므로,
 *      2021~2022년 등록분에 적용되는 문언 = 1.의 시한 문언이다.
 *
 * 실측 과소과세 (아래 B 그룹 · 양도가 8억 / 취득가 3억):
 *   · 10년 임대 → 결정세액 36,185,000 이어야 할 것이 **96,875,000원 적게** 나왔다
 *   · 8년 임대  → **66,950,000원 적게** 나왔다
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const D = (s: string) => new Date(s);
type Any = Parameters<typeof evaluateRental973>[0];

describe("A. 엔진 — 등록 시한 축(매입 2020.12.31)과 범위 한정 축(2023.1.1)은 사유가 다르다", () => {
  const BASE = {
    id: "rental_97_3" as const,
    acquisitionDate: D("2013-01-01"),
    transferDate: D("2035-01-01"),
    rentalStartDate: D("2013-06-01"),
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    officialPriceAtStart: 400_000_000,
    stdPriceAtRentalStart: 400_000_000,
    stdPriceAtAcquisition: 400_000_000,
    stdPriceAtTransfer: 900_000_000,
    isNationalHousingScale: true,
    region: "capital" as const,
    propertyType: "non_apartment" as const,
    rentalHousingType: "long_term_private" as const,
    rentalContinuesToTransfer: true,
  };
  const codesOf = (r: ReturnType<typeof evaluateRental973>) =>
    r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
  const run = (reg: string, construction?: boolean) =>
    evaluateRental973({
      ...BASE,
      registrationDate: D(reg),
      rentalStartDate: D(reg),
      ...(construction === undefined ? {} : { isPrivateConstructionRental: construction }),
    } as Any);

  it("A-1: 등록 2021-06 매입임대 → 등록 시한 초과로 배제", () => {
    expect(codesOf(run("2021-06-01", false))).toContain("PURCHASE_RENTAL_REG_DEADLINE");
  });

  it("A-2: 등록 2022-06 매입임대 → 배제 (건설임대만 2022.12.31까지)", () => {
    expect(codesOf(run("2022-06-01", false))).toContain("PURCHASE_RENTAL_REG_DEADLINE");
  });

  it("A-3: 등록 2022-06 **건설**임대 → 통과 (대조군 — 새 게이트가 과잉 차단하지 않는다)", () => {
    expect(codesOf(run("2022-06-01", true))).not.toContain("PURCHASE_RENTAL_REG_DEADLINE");
    expect(codesOf(run("2022-06-01", true))).not.toContain("NOT_PRIVATE_CONSTRUCTION_RENTAL");
  });

  it("A-4: 등록 2020-06 매입임대 → 통과 (시한 내 — 경과조치가 살아 있다)", () => {
    expect(codesOf(run("2020-06-01", false))).toEqual([]);
  });

  it("A-5: 경계 — 2020.12.31 매입은 통과, 2021.1.1은 배제", () => {
    expect(codesOf(run("2020-12-31", false))).not.toContain("PURCHASE_RENTAL_REG_DEADLINE");
    expect(codesOf(run("2021-01-01", false))).toContain("PURCHASE_RENTAL_REG_DEADLINE");
  });

  it("A-6: 2023.1.1 이후 매입임대는 **범위 한정** 사유로 배제 — 두 코드가 섞이지 않는다", () => {
    const codes = codesOf(run("2023-06-01", false));
    expect(codes).toContain("NOT_PRIVATE_CONSTRUCTION_RENTAL");
    expect(codes).not.toContain("PURCHASE_RENTAL_REG_DEADLINE");
  });
});

describe("B. 세액 — 2021~2022 등록 매입임대의 과소과세 실측", () => {
  const rates = makeMockRates();
  function build(reg: string, transfer: string, construction: boolean) {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date(reg),
      transferDate: new Date(transfer),
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      residencePeriodMonths: 0,
      reductions: [
        {
          type: "rental_97_3" as const,
          registrationDate: new Date(reg),
          rentalStartDate: new Date(reg),
          isTaxRegistered: true,
          rentIncreaseViolated: false,
          officialPriceAtStart: 400_000_000,
          isNationalHousingScale: true,
          region: "capital" as const,
          propertyType: "non_apartment" as const,
          rentalHousingType: "long_term_private" as const,
          isConvertedFromShortTerm: false,
          isPrivateConstructionRental: construction,
        },
      ],
    });
  }

  it("B-1: 등록 2021-06 매입 + 10년 임대 → 비적격, 결정세액 133,060,000 (종전 36,185,000 = 96,875,000 과소)", () => {
    const r = calculateTransferTax(build("2021-06-01", "2031-12-01", false), rates);
    expect(r.rental97LthdDetail?.isEligible).toBe(false);
    expect(r.longTermHoldingDeduction).toBe(100_000_000); // 일반 장특율 폴백
    expect(r.determinedTax).toBe(133_060_000);
  });

  it("B-2: 등록 2021-06 매입 + 8년 임대 → 비적격, 결정세액 141,060,000 (종전 74,110,000 = 66,950,000 과소)", () => {
    const r = calculateTransferTax(build("2021-06-01", "2029-12-01", false), rates);
    expect(r.rental97LthdDetail?.isEligible).toBe(false);
    expect(r.determinedTax).toBe(141_060_000);
  });

  it("B-3: 등록 2022-06 **건설** + 10년 임대 → 적격 70%, 결정세액 36,185,000 (대조군)", () => {
    const r = calculateTransferTax(build("2022-06-01", "2032-12-01", true), rates);
    expect(r.rental97LthdDetail?.isEligible).toBe(true);
    expect((r.rental97LthdDetail as { overrideRate?: number } | undefined)?.overrideRate).toBe(0.7);
    expect(r.determinedTax).toBe(36_185_000);
  });

  it("B-4: 등록 2020-12 매입 + 10년 임대 → 적격 70% (시한 내 대조군)", () => {
    const r = calculateTransferTax(build("2020-12-01", "2030-12-01", false), rates);
    expect(r.rental97LthdDetail?.isEligible).toBe(true);
    expect(r.determinedTax).toBe(36_185_000);
  });
});

/**
 * C. ⑧ validate — ④·⑤와 같은 경계(2020.12.31)를 알아야 한다.
 *
 * 게이트가 세 층(엔진 · ⑧ · ⑤ UI)에 복제돼 있어 한 층만 고치면 어긋난다
 * (memory `feedback_enumerate_all_write_sites_before_fixing`).
 */
describe("C. ⑧ validate — 등록 시한 경계 동기화", () => {
  const MSG_DEADLINE = /민간매입임대\)의 등록 시한은 2020\.12\.31/;
  const MSG_SCOPE = /2023\.1\.1 이후 등록분은 민간건설임대주택/;

  function check(over: Record<string, unknown>) {
    const reduction = {
      ...getReductionDefault("rental_97_3"),
      rentalStartDate: "2016-01-05",
      isTaxRegistered: true,
      rentIncreaseViolationMode: "none",
      rentalContinuesToTransfer: true,
      hasVacancyOverGrace: false,
      officialPriceAtStart: "400,000,000",
      isNationalHousingScale: true,
      stdPriceAtAcquisition: "400,000,000",
      stdPriceAtTransfer: "800,000,000",
      isPrivateConstructionRental: false,
      ...over,
    } as AssetReductionForm;
    return validateStep2Reductions(2, {
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-02-01", reductions: [reduction] }],
      transferDate: "2035-03-10",
    } as unknown as TransferFormData);
  }

  it("C-1: 등록 2021-06 매입임대 → 시한 문구로 차단", () => {
    expect(check({ registrationDate: "2021-06-01" })?.message ?? "").toMatch(MSG_DEADLINE);
  });

  it("C-2: 등록 2020-12-01 매입임대 → 시한 축으로 차단하지 않는다", () => {
    expect(check({ registrationDate: "2020-12-01" })?.message ?? "").not.toMatch(MSG_DEADLINE);
  });

  it("C-3: 경계 — 2020.12.31은 통과, 2021.1.1은 차단", () => {
    expect(check({ registrationDate: "2020-12-31" })?.message ?? "").not.toMatch(MSG_DEADLINE);
    expect(check({ registrationDate: "2021-01-01" })?.message ?? "").toMatch(MSG_DEADLINE);
  });

  it("C-4: 등록 2023-06 매입임대 → **한정** 문구로 차단 (두 문구가 섞이지 않는다)", () => {
    const m = check({ registrationDate: "2023-06-01" })?.message ?? "";
    expect(m).toMatch(MSG_SCOPE);
    expect(m).not.toMatch(MSG_DEADLINE);
  });

  it("C-5: 등록 2021-06 + 건설임대 확인 → 통과 (대조군)", () => {
    const m = check({ registrationDate: "2021-06-01", isPrivateConstructionRental: true })?.message ?? "";
    expect(m).not.toMatch(MSG_DEADLINE);
    expect(m).not.toMatch(MSG_SCOPE);
  });
});
