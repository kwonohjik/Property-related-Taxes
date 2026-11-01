/**
 * anchor — 조특법 §97의5 코드리뷰(2026-11-01) 9번 (7번 레거시 경로는 `rental-housing-reduction.test.ts` LR-05)
 *
 * (a) 조특령 §97의3③1호 후단 — 「임대료등 증액 청구는 … 증액이 있은 후 1년 이내에는 하지 못하고」 (§97의5①3호 준용).
 *     기간 계산은 민법 §157·§160 — 직전 계약(증액)일의 1년은 다음 해 같은 날 만료. 그날까지의 증액은 위반.
 *     (가정: 계약 이력의 계약일을 증액 시점으로 본다 — 청구일 입력은 없다.)
 *     직전 계약이 2020.2.11 이후인 경우부터 적용(대통령령 제30390호 부칙 §16) — 시행일 경계는
 *     `rental-97-3-97-5-rent-cap-from-rental-start.anchor.test.ts`.
 * (b) 조특령 §97의5③ — 「「소득세법」 제168조에 따른 사업자등록과 … 임대사업자등록을 하고 … 등록하여 임대하는 날부터」
 *     → 세무서 사업자등록일도 임대개시 기산의 한 축.
 * (c) 조특령 §97의3③4호 — 소재지에 따라 한도 6억/3억. 3억 초과 ~ 6억 이하에서 소재지 미입력은 추정하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { validateRentIncreaseInterval } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { normalizeRentalAndSplitFields } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const D = (s: string) => new Date(`${s}T00:00:00`);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));

/** 등록 2018-08-01 · 임대개시 2018-09-01 · 양도 2029-01-01 (10년 4개월) */
const BASE: Rental97EvaluationInput = {
  id: "rental_97_5",
  acquisitionDate: D("2018-06-01"),
  registrationDate: D("2018-08-01"),
  rentalStartDate: D("2018-09-01"),
  transferDate: D("2029-01-01"),
  isPurchaseRental: true,
  isTaxRegistered: true,
  taxRegistrationDate: D("2018-08-01"),
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 320_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 50_000_000,
};

const jeonse = (date: string, deposit: number) => ({
  contractDate: D(date),
  contractType: "jeonse" as const,
  deposit,
  monthlyRent: 0,
});

describe("(a) 조특령 §97의3③1호 후단 — 증액 후 1년 이내 재증액 금지", () => {
  it("🔴 다음 해 같은 날 증액(4%) → 「1년 이내」라 위반 (5% 이내여도)", () => {
    const r = evaluateRental975({
      ...BASE,
      rentHistory: [jeonse("2020-09-01", 100_000_000), jeonse("2021-09-01", 104_000_000)],
    });
    expect(codes(r)).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
  });

  it("다음 날(1년 경과 후) 증액 → 적격", () => {
    const r = evaluateRental975({
      ...BASE,
      rentHistory: [jeonse("2020-09-01", 100_000_000), jeonse("2021-09-02", 104_000_000)],
    });
    expect(r.isEligible).toBe(true);
  });

  it("1년 이내라도 동결·감액은 증액이 아니다", () => {
    const v = validateRentIncreaseInterval(
      [jeonse("2018-09-01", 100_000_000), jeonse("2019-03-01", 100_000_000), jeonse("2019-06-01", 95_000_000)],
      0.04,
    );
    expect(v.isAllValid).toBe(true);
  });

  it("5% 초과와 1년 이내는 별개 사유로 함께 붙는다", () => {
    const r = evaluateRental975({
      ...BASE,
      rentHistory: [jeonse("2020-09-01", 100_000_000), jeonse("2021-03-01", 110_000_000)],
    });
    expect(codes(r)).toEqual(["RENT_INCREASE_VIOLATED", "RENT_INCREASE_WITHIN_1_YEAR"]);
  });
});

describe("(b) 조특령 §97의5③ — 세무서 사업자등록일도 임대개시 기산의 한 축", () => {
  it("🔴 사업자등록 2019-03-01(늦음) → 기산 2019-03-01 → 9년 10개월 → 미달", () => {
    const r = evaluateRental975({ ...BASE, taxRegistrationDate: D("2019-03-01") });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("사업자등록이 등록일·임대개시보다 빠르면 기산일을 바꾸지 않는다", () => {
    expect(evaluateRental975({ ...BASE, taxRegistrationDate: D("2018-07-01") }).isEligible).toBe(true);
  });

  it("🔴 사업자등록을 확인했는데 날짜 미입력 → MISSING_TAX_REGISTRATION_DATE (등록일로 대체하지 않는다)", () => {
    expect(codes(evaluateRental975({ ...BASE, taxRegistrationDate: undefined }))).toContain(
      "MISSING_TAX_REGISTRATION_DATE",
    );
  });
});

describe("(c) 조특령 §97의3③4호 — 소재지가 한도를 가르는 구간은 추정하지 않는다", () => {
  // 4호는 2018.9.13 이전 취득분에 적용되지 않는다(대통령령 제29241호 부칙 §2②1호) — 그 이후 취득 사안으로 본다
  const POST = {
    acquisitionDate: D("2018-10-01"),
    registrationDate: D("2018-11-01"),
    rentalStartDate: D("2018-11-01"),
    taxRegistrationDate: D("2018-11-01"),
  };
  it("🔴 소재지 미입력 + 기준시가 4억 → MISSING_REGION (종전: 수도권 6억으로 읽어 통과)", () => {
    expect(codes(evaluateRental975({ ...BASE, ...POST, region: undefined, officialPriceAtStart: 400_000_000 }))).toEqual([
      "MISSING_REGION",
    ]);
  });

  it("3억 이하면 소재지와 무관하게 통과", () => {
    expect(evaluateRental975({ ...BASE, ...POST, region: undefined, officialPriceAtStart: 300_000_000 }).isEligible).toBe(true);
  });

  it("6억 초과면 소재지와 무관하게 초과", () => {
    expect(codes(evaluateRental975({ ...BASE, ...POST, region: undefined, officialPriceAtStart: 700_000_000 }))).toEqual([
      "OFFICIAL_PRICE_EXCEEDED",
    ]);
  });
});

describe("배관 — taxRegistrationDate (②③④⑧⑫⑭)", () => {
  function form(over: Record<string, unknown> = {}): AssetReductionForm {
    return {
      ...getReductionDefault("rental_97_5"),
      registrationDate: "2018-08-01",
      rentalStartDate: "2018-09-01",
      isTaxRegistered: true,
      taxRegistrationDate: "2018-08-01",
      isPurchaseRental: true,
      rentIncreaseViolationMode: "none",
      hasVacancyOverGrace: false,
      officialPriceAtStart: "320,000,000",
      isNationalHousingScale: true,
      region: "capital",
      rentalContinuesToTransfer: true,
      ...over,
    } as AssetReductionForm;
  }

  it("② 기본값 빈 문자열 · ③ 구 세션 보정", () => {
    expect((getReductionDefault("rental_97_5") as Record<string, unknown>).taxRegistrationDate).toBe("");
    const asset: Record<string, unknown> = { reductions: [{ type: "rental_97_5" }] };
    normalizeRentalAndSplitFields(asset);
    expect((asset.reductions as Record<string, unknown>[])[0].taxRegistrationDate).toBe("");
  });

  it("④ 사업자등록 확인 시에만 싣는다", () => {
    const on = toEngineReductions([form()], "purchase")[0] as Record<string, unknown>;
    expect(on.taxRegistrationDate).toBe("2018-08-01");
    const off = toEngineReductions([form({ isTaxRegistered: false })], "purchase")[0] as Record<string, unknown>;
    expect("taxRegistrationDate" in off).toBe(false);
  });

  it("🔑 ⑫ Zod 통과 + ⑭ mapper Date 변환", () => {
    const parsed = reductionSchema.parse({ type: "rental_97_5", taxRegistrationDate: "2018-08-01" });
    expect((parsed as Record<string, unknown>).taxRegistrationDate, "⑫ 침묵 stripping").toBe("2018-08-01");
    const mapped = mapReductionsToEngine([parsed])[0] as unknown as { taxRegistrationDate?: Date };
    expect(mapped.taxRegistrationDate).toBeInstanceOf(Date);
  });

  it("⑧ 사업자등록 확인 + 날짜 미입력 → 차단", () => {
    const issue = validateStep2Reductions(2, {
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2018-06-01", reductions: [form({ taxRegistrationDate: "" })] }],
      transferDate: "2029-01-01",
    } as unknown as TransferFormData);
    expect(issue?.message).toMatch(/세무서 사업자등록일을 입력/);
  });
});
