/**
 * anchor — §155⑳ 거주주택 보유 2년 × §154① 단서 · 계산기 경로(⑤·④·⑧) (`docs/00-pm/rental-residence-holding-proviso.plan.md`
 * Q-R1 (a)·Q-R2 (a) 사용자 결정 2026-10-26). 엔진 주장은 `__tests__/tax-engine/transfer/rental-residence-holding-proviso.anchor.test.ts`.
 *
 * 종전(계획서 §4.2 실측): 증여 전 같은 세대 거주 통산으로 거주 2년을 채운 거주주택이라도 ⑧이 「거주주택 보유기간 2년 이상이
 * 필요합니다」로 계산을 막았고, 2주택 이상 맥락에서는 단서 카드도 숨겨졌다(`provisoGate` → null).
 *
 * 시료: 배우자(같은 세대) 2018-01-01 취득 → 2023-06-01 증여 → 본인 거주 18개월 · 증여 전 같은 세대 거주 36개월 →
 * 2024-12-01 양도(보유 1년 6개월) · 8억 · 장기임대주택 1호(A). 주택 수는 계산기 흔한 입력(임대주택 제외 1주택)이다.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, allIssues, houseRow } from "./_helpers/redev-one-house-route";
import { calcProvisoMode } from "@/lib/calc/transfer-tax-api-residence";
import { provisoGate, effectiveProvisoReason } from "@/lib/calc/transfer-tax-api-helpers";
import { rentalResidenceContextDeclared } from "@/lib/calc/deemed-one-house-context";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { giftBurdenedProvisoMode } from "@/lib/calc/gift-burdened-one-house";
import { giftBurdenedRentalExceptionError } from "@/lib/calc/gift-burdened-rental-exception";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => cleanup());

const HOLDING_BLOCK = "거주주택 보유기간 2년 이상이 필요합니다";

const rental: AssetForm["rentalHousingException"] = {
  ...makeDefaultAsset(1).rentalHousingException,
  applyException: true,
  scenario: "A",
  priorRentalExemptionHistory: "none",
  rentalUnits: [
    {
      ...makeDefaultRentalUnit(),
      businessRegistrationDate: "2018-06-01",
      rentalRegistrationDate: "2018-06-01",
      rentalCategory: "long_general",
      rentalAcquisitionType: "purchase",
      standardPriceAtRentalStart: "300,000,000",
      requirementsConfirmed: true,
      rentalMonths: "96",
    },
  ],
};

function form(formOver: Record<string, unknown> = {}, assetOver: Record<string, unknown> = {}, roster = false) {
  return redevAptForm({
    kind: "housing",
    price: "800000000",
    // roster — 명부에 장기임대 행을 넣은 2주택 입력(임대주택을 센다 → rental_residence 맥락 · STEP 2.5 ⑳ 경로)
    ...(roster
      ? {
          count: "2",
          houses: [houseRow("rt", "2015-01-01", { region: "non_capital", regionCode: "4682025021", officialPrice: "250000000", isApartment: false, acquisitionOrigin: "general", isLongTermRental: true } as never)],
        }
      : {}),
    assetOver: {
      acquisitionCause: "gift",
      acquisitionDate: "2023-06-01",
      fixedAcquisitionPrice: "600000000",
      donorAcquisitionDate: "2018-01-01",
      giftDonorRelation: "spouse",
      giftSameHousehold: "yes",
      giftHouseholdHoldingStartDate: "2018-01-01",
      giftPriorHouseholdResidenceMonths: "36",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "18",
      residencePeriods: [],
      rentalHousingException: rental,
      ...assetOver,
    },
    formOver: { transferDate: "2024-12-01", filingDate: "2024-12-31", residencePeriodMonths: "18", ...formOver } as never,
  });
}

describe("계산기 — §155⑳ 거주주택 보유 2년 × §154① 단서", () => {
  it("RC-1 ★ 3호 부득이 → ⑧ 통과 · ④에 단서 · 비과세(종전 ⑧ 차단)", async () => {
    const f = form({ provisoReason: "unavoidable" });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: "unavoidable" });
    expect(r.result.totalTax).toBe(0);
    // 임대주택을 뺀 1주택 입력이라 ⑳이 서면 STEP 1a 전액 비과세 조기반환(판정 엔진 §154①)으로 끝난다 — 근거는 그 판정의 문구다.
    expect(r.result.exemptReason).toBe("1세대1주택 비과세 (§154① 단서 3호 부득이)");
    expect((r.result.warnings as string[]).some((w) => w.includes("정면 해석례가 없어 확인이 필요합니다"))).toBe(true);
  });

  it("RC-5 ★ 명부에 장기임대 행(2주택) — 카드 맥락 rental_residence · STEP 2.5 ⑳ 비과세 · 근거에 단서", async () => {
    const f = form({ provisoReason: "unavoidable" }, {}, true);
    expect(calcProvisoMode(f)).toBe("rental_residence");
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: "unavoidable" });
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe("장기임대주택 보유자 거주주택 비과세 (§155⑳ · §154① 단서 3호 부득이)");
    // 같은 명부에 5호를 고르면 ④가 보내지 않는다(정규화) — ⑧은 보유 2년으로 막는다
    const p5 = form({ provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true }, {}, true);
    expect(allIssues(p5).some((i) => i.message.includes(HOLDING_BLOCK))).toBe(true);
  });

  it("RC-6 ⑧ 단서 필수 입력도 ⑳ 맥락(2주택)에서 본다 — 2호가목 수용일 미입력이면 막는다", () => {
    const f = form({ provisoReason: "expropriation", provisoBusinessApprovalDate: "2024-01-15" }, {}, true);
    expect(allIssues(f).some((i) => i.message.includes("수용일"))).toBe(true);
    expect(allIssues(form({ provisoReason: "expropriation", provisoBusinessApprovalDate: "2024-01-15", provisoExpropriationDate: "2024-12-01" }, {}, true))).toEqual([]);
  });

  it("RC-2 부정 짝 — 단서 없음이면 ⑧이 종전대로 보유 2년으로 막는다", () => {
    expect(allIssues(form()).some((i) => i.message.includes(HOLDING_BLOCK))).toBe(true);
  });

  it("RC-3 ★ 받지 않는 사유 — 5호(무주택 확인)는 ⑧ 보유 차단을 풀지 않는다", () => {
    const issues = allIssues(form({ provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true }));
    expect(issues.some((i) => i.message.includes(HOLDING_BLOCK))).toBe(true);
  });

  it("RC-4 거주 2년은 여전히 막는다 — 통산 없음(본인 18개월) + 3호", () => {
    const issues = allIssues(form({ provisoReason: "unavoidable" }, { giftPriorHouseholdResidenceMonths: "0" }));
    expect(issues.some((i) => i.message.includes("거주주택 거주기간 2년(24개월) 이상이 필요합니다"))).toBe(true);
    expect(issues.some((i) => i.message.includes(HOLDING_BLOCK))).toBe(false);
  });
});

describe("게이트·정규화 — rental_residence 맥락", () => {
  const base = {
    isOneHousehold: true,
    isHousing: true,
    householdHousingCount: 2,
    temporaryTwoHouseApplies: false,
    deemedOneHouseContextDeclared: false,
    rentalResidenceDeclared: true,
  };

  it("RG-1 ★ 2주택 이상 + ⑳ 선언 → rental_residence · 선언 없음 → 숨김", () => {
    expect(provisoGate(base)).toEqual({ visible: true, mode: "rental_residence" });
    expect(provisoGate({ ...base, householdHousingCount: 3 })).toEqual({ visible: true, mode: "rental_residence" });
    expect(provisoGate({ ...base, rentalResidenceDeclared: false })).toEqual({ visible: false, mode: null });
  });

  it("RG-2 우선순위 — 1주택 · 일시적 2주택 · 의제(합가·⑥⑦⑧)가 ⑳보다 먼저다", () => {
    expect(provisoGate({ ...base, householdHousingCount: 1 }).mode).toBe("one_house");
    expect(provisoGate({ ...base, temporaryTwoHouseApplies: true }).mode).toBe("temporary_two_house");
    expect(provisoGate({ ...base, deemedOneHouseContextDeclared: true }).mode).toBe("deemed_one_house");
  });

  it("RG-3 ★ 정규화 — 1호·2호가목·3호만 남고 5호·나·다목·삭제 전 4호는 버린다", () => {
    for (const r of ["rental_5yr_residence", "expropriation", "unavoidable"]) expect(effectiveProvisoReason("rental_residence", r)).toBe(r);
    for (const r of ["pre_designation_contract", "overseas_migration", "overseas_residence", "rental_registration_4ho"])
      expect(effectiveProvisoReason("rental_residence", r)).toBe("");
  });

  it("RG-4 선언 leaf — 미적용·§154⑩ 단독(B · 0호)은 선언으로 보지 않는다", () => {
    expect(rentalResidenceContextDeclared(rental)).toBe(true);
    expect(rentalResidenceContextDeclared({ ...rental, scenario: "B" })).toBe(true);
    expect(rentalResidenceContextDeclared({ ...rental, applyException: false })).toBe(false);
    expect(rentalResidenceContextDeclared({ ...rental, scenario: "B", rentalUnits: [] })).toBe(false);
    expect(rentalResidenceContextDeclared(undefined)).toBe(false);
  });

  it("RG-5 부담부증여 게이트도 같은 맥락 — 세대 2주택 + ⑳ 선언", () => {
    const bgt = { isOneHousehold: true, householdHousingCount: 2, rentalHousingException: rental } as unknown as BurdenedGiftTransferTaxInput;
    expect(giftBurdenedProvisoMode(bgt)).toBe("rental_residence");
    expect(giftBurdenedProvisoMode({ ...bgt, rentalHousingException: undefined })).toBeNull();
  });
});

describe("⑧ leaf — 보유 2년 검증의 단서 인자", () => {
  const asset = (rh: AssetForm["rentalHousingException"]) =>
    ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2023-06-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "30", rentalHousingException: rh }) as AssetForm;
  const call = (rh: AssetForm["rentalHousingException"], reason?: string) =>
    validateRentalHousingException(rh, asset(rh), 0, "자산1", "2024-12-01", "full", false, false, undefined, undefined, reason);

  it("RV-1 1호·2호가목·3호면 보유 2년을 막지 않고, 그 밖의 사유·미전달이면 막는다", () => {
    for (const r of ["rental_5yr_residence", "expropriation", "unavoidable"]) expect(call(rental, r)).toBeNull();
    for (const r of [undefined, "", "pre_designation_contract", "overseas_migration"]) expect(call(rental, r)).toContain(HOLDING_BLOCK);
  });
});

describe("부담부증여 ⑧ — 같은 leaf에 이 경로의 정규화 사유를 넘긴다", () => {
  const bgt = (o: Record<string, unknown> = {}) =>
    ({
      isOneHousehold: true,
      householdHousingCount: 2,
      acquisitionDate: "2023-06-01",
      residencePeriodMonths: 30,
      rentalHousingException: rental,
      ...o,
    }) as unknown as BurdenedGiftTransferTaxInput;
  const err = (b: BurdenedGiftTransferTaxInput) => giftBurdenedRentalExceptionError({ id: "e1", estateAddress: "" } as never, b, "2024-12-01", "증여 주택");

  it("RV-2 3호면 보유 2년을 막지 않고, 단서 없음·5호면 막는다", () => {
    expect(err(bgt({ provisoReason: "unavoidable" }))).toBeNull();
    expect(err(bgt())).toContain(HOLDING_BLOCK);
    expect(err(bgt({ provisoReason: "pre_designation_contract" }))).toContain(HOLDING_BLOCK);
  });
});

describe("⑤ 카드 — rental_residence 옵션·안내", () => {
  it("RU-1 ★ 해당없음 + 1호·2호가목·3호만 노출 · 거주 2년은 면제되지 않는다는 안내", () => {
    render(
      <ExemptionProvisoSection
        provisoReason=""
        provisoDepartureDate=""
        provisoDepartureOnlyHouse=""
        provisoExpropriationDate=""
        provisoBusinessApprovalDate=""
        provisoRentalLeaseResidenceMonths=""
        provisoPreContractNoHouse={false}
        rental4ho={{}}
        mode="rental_residence"
        onChange={() => {}}
      />,
    );
    const values = screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value).sort();
    expect(values).toEqual(["expropriation", "none", "rental_5yr_residence", "unavoidable"]);
    expect(screen.getByText(/1호·2호가목·3호 사유로 보유기간 2년만 면제됩니다\. 거주기간 2년\(§155⑳1호\)은 면제되지 않습니다\./)).toBeTruthy();
  });
});
