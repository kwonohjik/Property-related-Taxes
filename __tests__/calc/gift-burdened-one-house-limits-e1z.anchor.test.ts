/**
 * E-1 한계(e1z) — 증여세 부담부증여 양도 경로의 남은 갭 · ⑧ 검증 · ③ 복원 · 게이트 leaf.
 *
 * ⑧은 양도세 계산기·판정 메뉴와 **같은 규칙·문구**를 ⑤·④와 **같은 게이트**로 건다.
 */
import { describe, it, expect } from "vitest";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import {
  giftBurdenedDeadlineExceptionFields,
  giftBurdenedTempTwoHouseDeadlineInScope,
  giftBurdenedTempTwoHouseRegulatedGate,
} from "@/lib/calc/gift-burdened-temp-two-house";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

function landItem(over: Partial<BurdenedGiftTransferTaxInput> = {}, base: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "land-1",
    category: "real_estate_land",
    name: "테스트 토지",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2020-06-01"),
      standardPriceAtAcquisition: 150_000_000,
      ...over,
    },
    ...base,
  } as EstateItem;
}
const form = (giftDate: string, it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate, donor: "father", giftItems: [it] }) as FormState;
/** 부담부증여 양도세 검증이 있는 단계 — 증여재산 단계(1) */
const v = (giftDate: string, it: EstateItem) => validateStep(1, form(giftDate, it));

describe("G1 ⑧ 상속받은 토지 — ④가 원인을 싣는 순간 ⑫ refine 필수값(피상속인 취득일)을 같이 막는다", () => {
  it("V-G1-1 ★ 상속인데 피상속인 취득일 없음 → 차단 · 상속개시일 이후 → 차단", () => {
    expect(v("2021-06-01", landItem({ acquisitionCause: "inheritance" }))).toContain(
      "상속받은 자산이면 피상속인 취득일을 입력",
    );
    expect(
      v("2021-06-01", landItem({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2020-06-01" })),
    ).toContain("피상속인 취득일은 상속개시일보다 이전");
  });
  it("V-G1-2 부정 짝 — 사실을 다 넣으면 통과 · 비주택의 stale 동일세대 값은 막지 않는다 · 원인 매매면 보지 않는다", () => {
    expect(v("2021-06-01", landItem({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" }))).toBeNull();
    expect(
      v(
        "2021-06-01",
        landItem({
          acquisitionCause: "inheritance",
          decedentAcquisitionDate: "2010-01-01",
          decedentSameHouseholdBeforeInheritance: true,
        }),
      ),
    ).toBeNull();
    expect(v("2021-06-01", landItem({ acquisitionCause: "purchase" }))).toBeNull();
  });
});

// ═══ G2 — §155의3 상생임대주택 ═══════════════════════════════════════════════════

function aptItem(over: Partial<BurdenedGiftTransferTaxInput> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2016-01-10"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      ...over,
    },
  } as EstateItem;
}
const WW = {
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-01-10",
  winWinRentalIncreaseRatePct: "0",
  winWinRentalPriorLeaseMonths: "24",
  winWinRentalLeaseMonths: "24",
};

describe("G2 ③ 복원 — JSON 왕복 후 normalize가 상생임대 5필드를 보존한다", () => {
  it("G2-N1 5필드 그대로", () => {
    const parsed = JSON.parse(JSON.stringify({ giftItems: [aptItem(WW)] }));
    const bgt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!;
    expect(bgt.acquisitionDate).toBeInstanceOf(Date);
    expect(bgt).toMatchObject(WW);
  });
});

describe("G2 ⑧ — 판정 메뉴와 같은 필수값 규칙·문구 · §155⑳1호 거주 24개월 면제(엔진과 같은 술어)", () => {
  it("V-G2-1 ★ 특례 ON인데 체결일·증가율·기간 비움 → 판정 메뉴와 같은 문구로 차단", () => {
    for (const [k, msg] of [
      ["winWinRentalContractDate", "상생임대차계약 체결일을 입력"],
      ["winWinRentalIncreaseRatePct", "임대료 증가율(%)을 입력"],
      ["winWinRentalPriorLeaseMonths", "직전임대차 임대기간(개월)을 입력"],
      ["winWinRentalLeaseMonths", "상생임대차 임대기간(개월)을 입력"],
    ] as const) {
      expect(v("2024-06-01", aptItem({ ...WW, [k]: "" })), k).toContain(msg);
    }
  });
  it("V-G2-2 부정 짝 — 다 넣으면 통과 · 1세대 1주택 OFF(게이트 밖)의 stale 선언은 막지 않는다", () => {
    expect(v("2024-06-01", aptItem(WW))).toBeNull();
    expect(v("2024-06-01", aptItem({ ...WW, winWinRentalContractDate: "", isOneHousehold: false }))).toBeNull();
  });
  it("V-G2-3 ★ §155⑳ 거주 0개월 — 상생임대 없으면 24개월 요구로 차단 · 상생임대면 통과(엔진 §155의3①과 같은 면제)", () => {
    const unit = {
      ...makeDefaultRentalUnit(),
      businessRegistrationDate: "2018-06-01",
      rentalRegistrationDate: "2018-06-01",
      standardPriceAtRentalStart: "300,000,000",
      rentalInputMode: "direct" as const,
      rentalMonths: "30",
      requirementsConfirmed: true,
      rentalAutoTermination: true,
      terminatedRegistrationType: "short_term" as const,
      registrationCancellationDate: "2021-03-03",
    };
    const rhe = {
      applyException: true,
      scenario: "A" as const,
      rentalUnits: [unit],
      postRegistrationResidenceMonths: "",
      priorRentalExemptionHistory: "" as const,
      residenceTransitionUnderAddendum: false,
    };
    const bgt = { householdHousingCount: 2, rentalHousingException: rhe } as Partial<BurdenedGiftTransferTaxInput>;
    expect(v("2025-06-01", aptItem(bgt))).toContain("거주주택 거주기간 2년(24개월) 이상이 필요합니다");
    expect(v("2025-06-01", aptItem({ ...bgt, ...WW }))).toBeNull();
  });
  it("V-G2-4 공용 leaf — 판정 메뉴 ⑧(validateStep3)도 같은 필드·문구를 낸다(규칙 이동 회귀)", () => {
    const f = { ...createInitialOneHouseJudgmentForm(), winWinRentalSpecial: true };
    const ww = validateStep3(f).filter((e) => e.message.startsWith("상생임대주택:"));
    expect(ww.map((e) => e.field)).toEqual([
      "winWinRentalContractDate",
      "winWinRentalIncreaseRatePct",
      "winWinRentalPriorLeaseMonths",
      "winWinRentalLeaseMonths",
    ]);
    expect(validateStep3({ ...f, ...WW }).some((e) => e.message.startsWith("상생임대주택:"))).toBe(false);
  });
});

// ═══ G3 — §155⑯·⑱ ═══════════════════════════════════════════════════════════════

const TT3 = (extra: Record<string, unknown> = {}): Partial<BurdenedGiftTransferTaxInput> => ({
  acquisitionDate: new Date("2015-01-01"),
  householdHousingCount: 2,
  temporaryTwoHouse: {
    previousAcquisitionDate: new Date("2015-01-01"),
    newAcquisitionDate: new Date("2020-01-01"),
    ...extra,
  } as NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>,
});

describe("G3 ③ 복원 · 게이트 leaf", () => {
  it("G3-N1 ③ JSON 왕복 후 ⑯·⑱ 필드 보존(날짜는 Date로)", () => {
    const f = { publicInstitutionRelocation: true, relocatedInstitutionJibun: "세종 x", relocatedSigunguCode: "3611000000", disposalDelayReason: "auction" };
    const parsed = JSON.parse(JSON.stringify({ giftItems: [aptItem(TT3(f))] }));
    const tt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!.temporaryTwoHouse!;
    expect(tt.previousAcquisitionDate).toBeInstanceOf(Date);
    expect(tt).toMatchObject(f);
  });
  it("G3-G1 게이트 — 세대 2주택 + 두 날짜면 열리고, 1주택·날짜 없음이면 닫힌다", () => {
    expect(giftBurdenedTempTwoHouseDeadlineInScope(aptItem(TT3()).burdenedGiftTransferTax!)).toBe(true);
    expect(giftBurdenedTempTwoHouseDeadlineInScope(aptItem({ ...TT3(), householdHousingCount: 1 }).burdenedGiftTransferTax!)).toBe(false);
    expect(
      giftBurdenedTempTwoHouseDeadlineInScope(aptItem(TT3({ newAcquisitionDate: undefined })).burdenedGiftTransferTax!),
    ).toBe(false);
  });
  it("G3-G2 ★ ⑤⑧ §155①2호 게이트 — ⑯이 성립하면 조정 기한 연혁 칸이 닫힌다(판정 메뉴 `judgmentTempTwoHouseVerdict`와 같은 인자)", () => {
    // 신규 2020-06-01 · 증여 2021-03-01 — 두 주택 조정 여부가 기한을 바꾸는 시기(E-1 anchor와 같은 시료)
    const tt = (extra: Record<string, unknown>) => ({
      ...TT3(extra),
      acquisitionDate: new Date("2015-01-01"),
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2015-01-01"),
        newAcquisitionDate: new Date("2020-06-01"),
        ...extra,
      } as NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>,
    });
    expect(giftBurdenedTempTwoHouseRegulatedGate(aptItem(tt({})).burdenedGiftTransferTax!, "2021-03-01", undefined)).not.toBeNull();
    expect(
      giftBurdenedTempTwoHouseRegulatedGate(aptItem(tt({ publicInstitutionRelocation: true })).burdenedGiftTransferTax!, "2021-03-01", undefined),
    ).toBeNull();
  });
  it("G3-F1 필드 파생 — 신규 주택 시·군 코드 = 소재지 법정동코드 앞 5자리 + 0 · 옛 record는 빈 값", () => {
    expect(giftBurdenedDeadlineExceptionFields(aptItem(TT3({ newHouseRegionCode: "4415010100" })).burdenedGiftTransferTax!).newHouseSigunguCode).toBe(
      "4415000000",
    );
    expect(giftBurdenedDeadlineExceptionFields(aptItem(TT3()).burdenedGiftTransferTax!)).toEqual({
      publicInstitutionRelocation: false,
      relocatedInstitutionJibun: "",
      relocatedSigunguCode: "",
      newHouseJibun: "",
      newHouseSigunguCode: "",
      disposalDelayReason: "",
    });
  });
});

// ═══ G4 — §155④⑤ 합가 ═══════════════════════════════════════════════════════════════

describe("G4 ③ 복원", () => {
  it("G4-N1 JSON 왕복 후 합가 3필드 보존", () => {
    const f = { marriageDate: "2020-01-01", parentalCareMergeDate: "", isFirstTransferredInMerge: true };
    const parsed = JSON.parse(JSON.stringify({ giftItems: [aptItem({ householdHousingCount: 2, ...f })] }));
    expect(normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax).toMatchObject(f);
  });
});

// ═══ G6 — 상속받은 자산의 환산취득가액(K-5) (소득세법 시행령 §163⑨) ═══════════════════════════

describe("G6 ⑧ — 상속개시일 평가액이 가목이라 환산(K-5)은 막는다 (계산기 postDeemedClauseARequiredError와 같은 결론)", () => {
  const market = (over: Partial<BurdenedGiftTransferTaxInput>) =>
    landItem({
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: 400_000_000,
      landStdPriceAtTransfer: 300_000_000,
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2010-01-01",
      ...over,
    });
  it("V-G6-1 ★ 상속(개시 2020-06-01) + K-5 → 차단(§163⑨ · §97①1호 단서 안내)", () => {
    expect(v("2021-06-01", market({ acquisitionMethod: "converted" }))).toContain("환산취득가액(K-5)을 쓸 수 없습니다");
  });
  it("V-G6-2 부정 짝 — 상속 + K-4(평가액) 통과 · 매매 + K-5 통과 · 상속개시 1985.1.1. 전(의제취득일 경로 — 확인 필요)은 막지 않는다", () => {
    expect(v("2021-06-01", market({ acquisitionMethod: "actual", actualAcquisitionTotal: 250_000_000 }))).toBeNull();
    expect(v("2021-06-01", market({ acquisitionMethod: "converted", acquisitionCause: "purchase" }))).toBeNull();
    expect(
      v(
        "2021-06-01",
        market({ acquisitionMethod: "converted", acquisitionDate: new Date("1984-06-01"), decedentAcquisitionDate: "1970-01-01" }),
      ),
    ).toBeNull();
  });
});

describe("G6 ⑧ 양도세 계산기 부담부증여 — 같은 술어로 막는다(두 경로 같은 결론)", () => {
  const bgAsset = (over: Partial<AssetForm>): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "land",
      transferType: "burdened_gift",
      acquisitionCause: "inheritance",
      acquisitionDate: "2020-06-01",
      inheritanceStartDate: "2020-06-01",
      decedentAcquisitionDate: "2010-01-01",
      bgValuationMode: "sangjeungbeop_market",
      bgMarketValueAtTransfer: "400,000,000",
      bgAcquisitionMethod: "converted",
      bgLendingDepositTotal: "100,000,000",
      bgMortgageDebtAmount: "50,000,000",
      bgDonorRelation: "lineal_ascendant_adult",
      standardPriceAtAcq: "150,000,000",
      standardPriceAtTransfer: "300,000,000",
      ...over,
    }) as AssetForm;
  it("V-G6-C1 ★ 상속(개시 2020-06-01) + 환산 → 차단", () => {
    expect(validateBurdenedGiftAsset(bgAsset({}), "자산1")).toContain("환산취득가액을 쓸 수 없습니다");
  });
  it("V-G6-C2 부정 짝 — 매매 + 환산 · 상속개시 1985.1.1. 전은 이 규칙으로 막지 않는다", () => {
    expect(validateBurdenedGiftAsset(bgAsset({ acquisitionCause: "purchase" }), "자산1") ?? "").not.toContain(
      "환산취득가액을 쓸 수 없습니다",
    );
    expect(
      validateBurdenedGiftAsset(bgAsset({ acquisitionDate: "1984-06-01", inheritanceStartDate: "1984-06-01" }), "자산1") ?? "",
    ).not.toContain("환산취득가액을 쓸 수 없습니다");
  });
});
