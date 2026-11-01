/**
 * anchor — 조특법 §97의5 코드리뷰(2026-11-01) 2·5·6번
 *
 * ## 2. 6개월 초과 공실 → 「계속」 단절 (조특령 §97의5①1호)
 * 국세청 서면-2020-법규재산-4965(2022.5.31): 공실이 여러 번이면 **각** 공실이 6개월 이내인지 본다.
 * 6개월 초과 공실의 처리 해석례는 찾지 못했다 — **가정**: 「계속하여 10년」(§97의5①) ↔ 「통산하여 10년」(§97의3②)
 * 대비에 따라 계속성이 끊기고, 그 공실이 끝난 날부터 다시 센다. 종전(초과 구간만 차감 후 합산)은 통산 모델이었다.
 *
 * ## 5. 수용·정비사업 간주기간 (조특령 §97의5①2호·3호)
 * 「해당 기간 동안 계속하여 임대한 것으로 본다」 — 공실 판정에서 빼고 기간에 산입한다.
 * 3호는 관리처분계획 인가일 전 6개월 ~ 준공일 후 6개월.
 *
 * ## 6. 매입임대 요건 (조특법 §97의5①1호)
 * 「민간매입임대주택 및 … 공공매입임대주택을 취득」 — 민특법 §2 3호 「매매 등으로 소유권을 취득」.
 * 증여(부동산납세과-486)·분양권 승계 후 완공(법령해석과-2193)도 해당. 건설임대(§2 2호)는 제외. 미입력은 불충족.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import {
  evaluateContinuousRental975,
  expandDeemedPeriod,
} from "@/lib/tax-engine/transfer-reductions/rental-97-5-period";
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

const D = (s: string) => new Date(`${s}T00:00:00`);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const reasonText = (r: Rental97Result) => (r.isEligible ? "" : r.ineligibleReasons.map((x) => x.message).join(" "));

/** 임대개시 2014-09-01 → 양도 2026-07-01 (11년 10개월) */
const BASE: Rental97EvaluationInput = {
  id: "rental_97_5",
  acquisitionDate: D("2014-06-01"),
  registrationDate: D("2014-08-01"),
  rentalStartDate: D("2014-09-01"),
  transferDate: D("2026-07-01"),
  isPurchaseRental: true,
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 320_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 50_000_000,
};

describe("6. §97의5①1호 — 매입임대주택", () => {
  it("매입임대 확인 → 적격", () => {
    expect(evaluateRental975({ ...BASE }).isEligible).toBe(true);
  });

  it("🔴 미입력은 충족으로 읽지 않는다 (NOT_PURCHASE_RENTAL)", () => {
    const r = evaluateRental975({ ...BASE, isPurchaseRental: undefined });
    expect(codes(r)).toEqual(["NOT_PURCHASE_RENTAL"]);
  });

  it("🔴 건설임대(false) → 불적용, 사유에 건설임대 명시", () => {
    const r = evaluateRental975({ ...BASE, isPurchaseRental: false });
    expect(codes(r)).toEqual(["NOT_PURCHASE_RENTAL"]);
    expect(reasonText(r)).toMatch(/건설임대주택은 대상이 아닙니다/);
  });
});

describe("2. 6개월 초과 공실 — 계속 임대 단절 후 다시 셈 (가정: 「계속하여」 문언)", () => {
  it("🔴 7개월 공실(2016-01-01~2016-08-01) → 2016-08-01부터 다시 세면 9년 → 미달", () => {
    // 종전 통산 모델: 11년 10개월 − 7개월 = 11년 3개월 → 적격이었다
    const r = evaluateRental975({ ...BASE, vacancyPeriods: [{ startDate: D("2016-01-01"), endDate: D("2016-08-01") }] });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(reasonText(r)).toMatch(/2016-08-01부터 다시 계산/);
  });

  it("정확히 6개월(「이내」 포함) → 계속 임대로 본다", () => {
    const r = evaluateRental975({ ...BASE, vacancyPeriods: [{ startDate: D("2016-01-01"), endDate: D("2016-07-01") }] });
    expect(r.isEligible).toBe(true);
  });

  it("국세청 서면-2020-법규재산-4965 — 3개월·4개월 공실 (합계 7개월) → 각각 6개월 이내라 계속 임대", () => {
    const r = evaluateRental975({
      ...BASE,
      vacancyPeriods: [
        { startDate: D("2017-05-01"), endDate: D("2017-08-01") },
        { startDate: D("2019-08-01"), endDate: D("2019-12-01") },
      ],
    });
    expect(r.isEligible).toBe(true);
  });

  it("단절 후 다시 센 기간이 10년 이상이면 적격 — 기산일만 바뀐다", () => {
    const r = evaluateContinuousRental975({
      start: D("2014-09-01"),
      end: D("2026-07-01"),
      vacancyPeriods: [{ startDate: D("2015-01-01"), endDate: D("2016-01-01") }],
      deemedRentalPeriods: [],
    });
    expect(r.restartDate).toEqual(D("2016-01-01"));
    expect(r.years).toBe(10);
  });
});

describe("5. 수용·정비사업 간주기간 — 계속 임대로 보고 기간에 산입", () => {
  /** 3년 5개월 공실 (재건축 이주~입주) */
  const LONG_VACANCY = [{ startDate: D("2017-01-01"), endDate: D("2020-06-01") }];

  it("expandDeemedPeriod — 3호는 인가일 −6개월 ~ 준공일 +6개월, 2호는 그대로", () => {
    expect(
      expandDeemedPeriod({ reason: "redevelopment", startDate: D("2017-06-01"), endDate: D("2019-12-01") }),
    ).toEqual({ start: D("2016-12-01"), end: D("2020-06-01") });
    expect(
      expandDeemedPeriod({ reason: "expropriation", startDate: D("2017-06-01"), endDate: D("2019-12-01") }),
    ).toEqual({ start: D("2017-06-01"), end: D("2019-12-01") });
  });

  it("간주기간 없으면 3년 5개월 공실이 계속성을 끊는다 (기준선)", () => {
    expect(codes(evaluateRental975({ ...BASE, vacancyPeriods: LONG_VACANCY }))).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("🔴 재건축 인가 2017-06-01 · 준공 2019-12-01 → 공실 전부가 간주기간 → 적격", () => {
    const r = evaluateRental975({
      ...BASE,
      vacancyPeriods: LONG_VACANCY,
      deemedRentalPeriods: [{ reason: "redevelopment", startDate: D("2017-06-01"), endDate: D("2019-12-01") }],
    });
    expect(r.isEligible).toBe(true);
  });

  it("간주기간 앞 남은 공실 조각(2개월)은 6개월 이내라 계속 — 적격", () => {
    // 인가 2017-09-01 → 간주 시작 2017-03-01. 남은 조각 2017-01-01~2017-03-01
    const r = evaluateRental975({
      ...BASE,
      vacancyPeriods: LONG_VACANCY,
      deemedRentalPeriods: [{ reason: "redevelopment", startDate: D("2017-09-01"), endDate: D("2019-12-01") }],
    });
    expect(r.isEligible).toBe(true);
  });

  it("남은 조각이 6개월을 넘으면 여전히 단절 — 인가 2018-03-01(간주 2017-09-01~)이면 8개월 조각", () => {
    const r = evaluateRental975({
      ...BASE,
      vacancyPeriods: LONG_VACANCY,
      deemedRentalPeriods: [{ reason: "redevelopment", startDate: D("2018-03-01"), endDate: D("2019-12-01") }],
    });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("2호 협의매수·수용 기간도 같은 효과", () => {
    const r = evaluateRental975({
      ...BASE,
      vacancyPeriods: LONG_VACANCY,
      deemedRentalPeriods: [{ reason: "expropriation", startDate: D("2017-01-01"), endDate: D("2020-06-01") }],
    });
    expect(r.isEligible).toBe(true);
  });
});

describe("파이프라인·배관 — isPurchaseRental · deemedRentalPeriods", () => {
  const rates = makeMockRates();
  const run = (over: Record<string, unknown>) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        transferDate: D("2026-07-01"),
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2014-06-01"),
        isOneHousehold: false,
        householdHousingCount: 2,
        reductions: [
          {
            type: "rental_97_5",
            registrationDate: D("2014-08-01"),
            rentalStartDate: D("2014-09-01"),
            isTaxRegistered: true,
            isNationalHousingScale: true,
            region: "capital",
            officialPriceAtStart: 320_000_000,
            rentalContinuesToTransfer: true,
            vacancyPeriods: [{ startDate: D("2017-01-01"), endDate: D("2020-06-01") }],
            ...over,
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      rates,
    ) as unknown as { reductionAmount: number; calculatedTax: number; rental97TaxDetail?: Rental97Result };

  it("🔴 router가 두 필드를 evaluator까지 나른다", () => {
    const missing = run({});
    expect(missing.rental97TaxDetail && codes(missing.rental97TaxDetail)).toContain("NOT_PURCHASE_RENTAL");
    const ok = run({
      isPurchaseRental: true,
      deemedRentalPeriods: [{ reason: "redevelopment", startDate: D("2017-06-01"), endDate: D("2019-12-01") }],
    });
    expect(ok.rental97TaxDetail?.isEligible).toBe(true);
    expect(ok.reductionAmount).toBe(ok.calculatedTax);
  });

  function form(over: Record<string, unknown> = {}): AssetReductionForm {
    return {
      ...getReductionDefault("rental_97_5"),
      registrationDate: "2014-08-01",
      rentalStartDate: "2014-09-01",
      isTaxRegistered: true,
      rentIncreaseViolationMode: "none",
      hasVacancyOverGrace: false,
      officialPriceAtStart: "320,000,000",
      isNationalHousingScale: true,
      region: "capital",
      rentalContinuesToTransfer: true,
      isPurchaseRental: true,
      ...over,
    } as AssetReductionForm;
  }

  it("② 기본값 — 매입임대 미선택(null)·간주기간 없음", () => {
    const d = getReductionDefault("rental_97_5") as Record<string, unknown>;
    expect(d.isPurchaseRental).toBeNull();
    expect(d.hasDeemedRentalPeriod).toBe(false);
    expect(d.deemedRentalPeriods).toEqual([]);
  });

  it("③ 구 세션 — 신규 키가 없으면 미선택·없음으로 보정", () => {
    const asset: Record<string, unknown> = { reductions: [{ type: "rental_97_5", registrationDate: "2014-08-01" }] };
    normalizeRentalAndSplitFields(asset);
    const r = (asset.reductions as Record<string, unknown>[])[0];
    expect(r.isPurchaseRental).toBeNull();
    expect(r.deemedRentalPeriods).toEqual([]);
    expect(r.hasDeemedRentalPeriod).toBe(false);
  });

  it("④ 싣는 조건 — null은 생략, 간주기간은 토글 ON + 날짜 있는 행만", () => {
    const off = toEngineReductions([form({ isPurchaseRental: null })], "purchase")[0] as Record<string, unknown>;
    expect("isPurchaseRental" in off).toBe(false);
    expect("deemedRentalPeriods" in off).toBe(false);
    const on = toEngineReductions(
      [
        form({
          hasDeemedRentalPeriod: true,
          deemedRentalPeriods: [
            { reason: "redevelopment", startDate: "2017-06-01", endDate: "2019-12-01" },
            { reason: "expropriation", startDate: "", endDate: "" },
          ],
        }),
      ],
      "purchase",
    )[0] as Record<string, unknown>;
    expect(on.isPurchaseRental).toBe(true);
    expect(on.deemedRentalPeriods).toEqual([{ reason: "redevelopment", startDate: "2017-06-01", endDate: "2019-12-01" }]);
  });

  it("🔑 ⑫ Zod 통과 + ⑭ mapper Date 변환", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_5",
      isPurchaseRental: true,
      deemedRentalPeriods: [{ reason: "redevelopment", startDate: "2017-06-01", endDate: "2019-12-01" }],
    }) as Record<string, unknown>;
    expect(parsed.isPurchaseRental, "⑫ 침묵 stripping").toBe(true);
    expect(parsed.deemedRentalPeriods, "⑫ 침묵 stripping").toHaveLength(1);
    const mapped = mapReductionsToEngine([parsed as never])[0] as unknown as {
      deemedRentalPeriods?: { startDate: Date; endDate: Date }[];
    };
    expect(mapped.deemedRentalPeriods?.[0].startDate).toBeInstanceOf(Date);
    expect(mapped.deemedRentalPeriods?.[0].endDate.toISOString().slice(0, 10)).toBe("2019-12-01");
  });

  describe("⑧ validate", () => {
    const check = (over: Record<string, unknown>) =>
      validateStep2Reductions(2, {
        assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2014-06-01", reductions: [form(over)] }],
        transferDate: "2026-07-01",
      } as unknown as TransferFormData);

    it("매입임대 미선택 → 차단", () => {
      expect(check({ isPurchaseRental: null })?.message).toMatch(/임대주택 취득 유형/);
    });

    it("건설임대 선택은 막지 않는다 — 엔진이 불적용 사유로 보인다", () => {
      expect(check({ isPurchaseRental: false })?.message ?? "").not.toMatch(/임대주택 취득 유형/);
    });

    it("간주기간 켰는데 날짜 빈 행·역순 → 차단", () => {
      const msg = /수용·정비사업으로 임대할 수 없던 기간/;
      expect(
        check({ hasDeemedRentalPeriod: true, deemedRentalPeriods: [{ reason: "redevelopment", startDate: "", endDate: "" }] })
          ?.message,
      ).toMatch(msg);
      expect(
        check({
          hasDeemedRentalPeriod: true,
          deemedRentalPeriods: [{ reason: "expropriation", startDate: "2019-12-01", endDate: "2017-06-01" }],
        })?.message,
      ).toMatch(msg);
    });
  });
});
