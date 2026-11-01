/**
 * anchor — §97의5 코드리뷰 결함과 같은 결함이 §97의3에도 있었다 (2026-11-01)
 *
 * 1. 종점 — 법 §97의3①1호 「10년 이상 계속하여 임대한 **후** 양도하는 경우」.
 *    양도 전 임대 종료를 선언해도 기간을 양도일까지 셌다. 공실은 령 §97의3② 「통산」이라 차감 모델은 그대로 둔다.
 * 2. 조특령 §97의3③1호 후단 — 「증액이 있은 후 1년 이내에는 하지 못하고」 미검증.
 * 3. 조특령 §97의3④ 후단 — 「소득세법」 §168 사업자등록일이 늦으면 그날부터 임대 개시 — 예/아니오만 받았다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { normalizeRentalAndSplitFields } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

/** UTC 자정 — 엔진 날짜 상수·API 경로(`toDate("YYYY-MM-DD")`)와 같은 축. 로컬 자정은 KST에서 9시간 앞서 시행일 경계가 어긋난다. */
const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const rate = (r: Rental97Result) => (r as unknown as { overrideRate?: number }).overrideRate;

/** 등록·임대개시 2015-01-01 → 양도 2026-07-01 (11년 6개월), 취득 즉시 임대 · 계속 임대 */
const BASE: Rental97EvaluationInput = {
  id: "rental_97_3",
  acquisitionDate: D("2015-01-01"),
  registrationDate: D("2015-01-01"),
  rentalStartDate: D("2015-01-01"),
  transferDate: D("2026-07-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2015-01-01"),
  rentIncreaseViolated: false,
  officialPriceAtStart: 300_000_000,
  isNationalHousingScale: true,
  region: "capital",
  rentalContinuesToTransfer: true,
};

const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });

describe("1. §97의3①1호 — 종점은 임대 종료일", () => {
  const ENDED = {
    rentalContinuesToTransfer: false,
    stdPriceAtAcquisition: 300_000_000,
    stdPriceAtRentalEnd: 450_000_000,
    stdPriceAtTransfer: 600_000_000,
  } as const;

  it("기준선 — 계속 임대 11년 6개월 → 70%", () => {
    expect(rate(evaluateRental973({ ...BASE }))).toBe(0.7);
  });

  it("🔴 2023-03-01 종료(8년 2개월) → 2022.12.31 전 등록분 50% (종전: 양도일까지 세어 70%)", () => {
    const r = evaluateRental973({ ...BASE, ...ENDED, rentalEndDate: D("2023-03-01") });
    expect(rate(r)).toBe(0.5);
  });

  it("🔴 2021-01-01 종료(6년) → 미달 (종전: 70%)", () => {
    expect(codes(evaluateRental973({ ...BASE, ...ENDED, rentalEndDate: D("2021-01-01") }))).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("조기 종료인데 종료일 미입력 → MISSING_RENTAL_END_DATE (기간 미달로 이중 표시하지 않는다)", () => {
    expect(codes(evaluateRental973({ ...BASE, ...ENDED }))).toEqual(["MISSING_RENTAL_END_DATE"]);
  });

  it("종료일이 양도일 이후 → INVALID_RENTAL_END_DATE", () => {
    expect(codes(evaluateRental973({ ...BASE, ...ENDED, rentalEndDate: D("2026-08-01") }))).toEqual([
      "INVALID_RENTAL_END_DATE",
    ]);
  });
});

describe("2. 조특령 §97의3③1호 후단 — 1년 이내 재증액 금지", () => {
  it("🔴 다음 해 같은 날 4% 증액 → 위반", () => {
    const r = evaluateRental973({ ...BASE, rentHistory: [jeonse("2020-03-01", 100_000_000), jeonse("2021-03-01", 104_000_000)] });
    expect(codes(r)).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
  });

  it("다음 날 증액 → 적격", () => {
    const r = evaluateRental973({ ...BASE, rentHistory: [jeonse("2020-03-01", 100_000_000), jeonse("2021-03-02", 104_000_000)] });
    expect(r.isEligible).toBe(true);
  });
});

describe("3. 조특령 §97의3④ — 사업자등록일도 기산의 한 축", () => {
  it("🔴 사업자등록 2017-01-01(늦음) → 9년 6개월 → 2022.12.31 전 등록분 50%", () => {
    expect(rate(evaluateRental973({ ...BASE, taxRegistrationDate: D("2017-01-01") }))).toBe(0.5);
  });

  it("🔴 사업자등록 확인 + 날짜 미입력 → MISSING_TAX_REGISTRATION_DATE", () => {
    expect(codes(evaluateRental973({ ...BASE, taxRegistrationDate: undefined }))).toContain("MISSING_TAX_REGISTRATION_DATE");
  });
});

describe("파이프라인·배관 — rentalEndDate · taxRegistrationDate (§97의3)", () => {
  it("🔴 router가 두 필드를 evaluator까지 나른다", () => {
    const run = (over: Record<string, unknown>) =>
      calculateTransferTax(
        baseTransferInput({
          transferPrice: 900_000_000,
          transferDate: D("2026-07-01"),
          acquisitionPrice: 300_000_000,
          acquisitionDate: D("2015-01-01"),
          isOneHousehold: false,
          householdHousingCount: 2,
          reductions: [
            {
              type: "rental_97_3",
              registrationDate: D("2015-01-01"),
              rentalStartDate: D("2015-01-01"),
              isTaxRegistered: true,
              officialPriceAtStart: 300_000_000,
              isNationalHousingScale: true,
              region: "capital",
              rentalHousingType: "long_term_private",
              rentalContinuesToTransfer: true,
              ...over,
            },
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
        makeMockRates(),
      ) as unknown as { rental97LthdDetail?: Rental97Result };
    expect(codes(run({}).rental97LthdDetail!)).toContain("MISSING_TAX_REGISTRATION_DATE");
    expect(rate(run({ taxRegistrationDate: D("2017-01-01") }).rental97LthdDetail!)).toBe(0.5);
  });

  function form(over: Record<string, unknown> = {}): AssetReductionForm {
    return {
      ...getReductionDefault("rental_97_3"),
      registrationDate: "2015-01-01",
      rentalStartDate: "2015-01-01",
      isTaxRegistered: true,
      taxRegistrationDate: "2015-01-01",
      rentIncreaseViolationMode: "none",
      hasVacancyOverGrace: false,
      officialPriceAtStart: "300,000,000",
      isNationalHousingScale: true,
      isPrivateConstructionRental: false,
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: "450,000,000",
      rentalEndDate: "2023-03-01",
      ...over,
    } as AssetReductionForm;
  }

  it("② 기본값 · ③ 구 세션 보정", () => {
    expect((getReductionDefault("rental_97_3") as Record<string, unknown>).taxRegistrationDate).toBe("");
    const asset: Record<string, unknown> = { reductions: [{ type: "rental_97_3" }] };
    normalizeRentalAndSplitFields(asset);
    expect((asset.reductions as Record<string, unknown>[])[0].taxRegistrationDate).toBe("");
  });

  it("④ 조기 종료면 종료일을, 사업자등록 확인이면 등록일을 싣는다", () => {
    const out = toEngineReductions([form()], "purchase")[0] as Record<string, unknown>;
    expect(out.rentalEndDate).toBe("2023-03-01");
    expect(out.taxRegistrationDate).toBe("2015-01-01");
    const cont = toEngineReductions([form({ rentalContinuesToTransfer: true })], "purchase")[0] as Record<string, unknown>;
    expect("rentalEndDate" in cont).toBe(false);
  });

  it("🔑 ⑫ Zod 통과 + ⑭ mapper Date 변환", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_3",
      rentalEndDate: "2023-03-01",
      taxRegistrationDate: "2015-01-01",
    }) as Record<string, unknown>;
    expect(parsed.rentalEndDate, "⑫ 침묵 stripping").toBe("2023-03-01");
    expect(parsed.taxRegistrationDate, "⑫ 침묵 stripping").toBe("2015-01-01");
    const mapped = mapReductionsToEngine([parsed as never])[0] as unknown as { rentalEndDate?: Date; taxRegistrationDate?: Date };
    expect(mapped.rentalEndDate).toBeInstanceOf(Date);
    expect(mapped.taxRegistrationDate).toBeInstanceOf(Date);
  });

  describe("⑧ validate", () => {
    const check = (over: Record<string, unknown>) =>
      validateStep2Reductions(2, {
        assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-01-01", reductions: [form(over)] }],
        transferDate: "2026-07-01",
      } as unknown as TransferFormData);

    it("조기 종료 + 종료일 미입력 → 차단", () => {
      expect(check({ rentalEndDate: "" })?.message).toMatch(/§97의3 적용: 양도 전에 임대를 종료했으면 임대 종료일/);
    });

    it("종료일이 사업자등록일보다 앞서면 차단 — 엔진 기산일과 같은 축", () => {
      expect(check({ taxRegistrationDate: "2023-06-01", rentalEndDate: "2023-03-01" })?.message).toMatch(/임대 종료일은/);
    });

    it("사업자등록 확인 + 날짜 미입력 → 차단", () => {
      expect(check({ taxRegistrationDate: "" })?.message).toMatch(/§97의3 적용: 세무서 사업자등록일을 입력/);
    });
  });
});
