/**
 * @vitest-environment jsdom
 *
 * anchor — 계산기 ⑤ §155⑳ 카드의 「거주주택 요건 충족 상태」 ✓/✗가 엔진 판정과 같은 쪽을 가리킨다
 * (`docs/00-pm/rhe-e1-notice-and-card-verdict-mismatch.plan.md` B · Q-B1 (a) — ⑧과 같은 leaf `rentalResidenceRequirementStatus`).
 *
 * 종전: 카드는 Step4 거주 개월·보유 연수만 보고 그려, 엔진이 비과세 0으로 끝낸 입력(M1 동일세대 통산 · M2 완공APT 분리 거주 ·
 * M4 §154① 단서 3호)에도 「✗ 미충족 — 일반 양도소득세로 계산됩니다」를 띄웠다(2026-11-03 실측). 진짜 미달(D1·E3)은 ✗ 그대로다.
 * 카드 props는 계산기 Step1 → AssetSectionExtras와 같은 값(`calcRentalResidenceFacts`)으로 만든다.
 */
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { calcRentalResidenceFacts } from "@/lib/calc/rental-residence-form-facts";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => cleanup());

const rental: AssetForm["rentalHousingException"] = {
  ...makeDefaultAsset(1).rentalHousingException,
  applyException: true,
  scenario: "A",
  priorRentalExemptionHistory: "none",
  rentalUnits: [
    {
      ...makeDefaultRentalUnit(),
      businessRegistrationDate: "2018-06-01",
      rentalRegistrationDate: "2018-06-01", rentalRegisteredDate: "2018-06-01",
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


const unitR = () => ({ ...makeDefaultRentalUnit(), businessRegistrationDate: "2015-01-01", rentalRegistrationDate: "2015-01-01", rentalRegisteredDate: "2015-01-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "110", requirementsConfirmed: true });
const LATER = { transferDate: "2025-03-03", filingDate: "2025-05-31" };
const WIN_WIN_FACTS = {
  ...oneHouseJudgmentExtraDefaults, winWinRentalSpecial: true, winWinRentalContractDate: "2022-03-01",
  winWinRentalIncreaseRatePct: "5", winWinRentalPriorLeaseMonths: "24", winWinRentalLeaseMonths: "24",
};
const PHRP_B = {
  ...rental, scenario: "B", rentalUnits: [], priorResidenceTransferDate: "2019-03-01", wasRegisteredRentalOrChildcare: true,
  standardPriceAtAcquisitionForPhrp: "300,000,000", standardPriceAtPriorTransfer: "350,000,000", standardPriceAtTransferForPhrp: "400,000,000",
} as AssetForm["rentalHousingException"];
const NO_GIFT = { acquisitionCause: "purchase", giftSameHousehold: "", giftPriorHouseholdResidenceMonths: "", giftHouseholdHoldingStartDate: "" };

const CASES: [string, ReturnType<typeof form>, { exempt: boolean; text?: RegExp }][] = [
  ["M0 대조 · 본인 30 · 보유 4년", form({ ...LATER, residencePeriodMonths: "30" }, { acquisitionDate: "2021-01-04", residencePeriodMonthsAsset: "30", giftPriorHouseholdResidenceMonths: "" }), { exempt: true }],
  ["M1 증여 · 본인 12 + 증여 전 동일세대 18", form({ ...LATER, residencePeriodMonths: "12" }, { acquisitionDate: "2021-01-04", residencePeriodMonthsAsset: "12", giftPriorHouseholdResidenceMonths: "18" }),
    { exempt: true, text: /현재 30개월 \(같은 세대 거주 통산 18개월 포함\)/ }],
  ["M2 완공APT · 종전 12 + 신축 12", redevAptForm({ price: "1000000000", assetOver: { rentalHousingException: { ...rental, rentalUnits: [unitR()] }, residencePeriods: [], redevPriorHouseResidenceMonths: "12", redevNewHouseResidenceMonths: "12" } }),
    { exempt: true, text: /현재 24개월/ }],
  ["M3 상생임대 · 본인 거주 0", { ...form({ ...LATER, residencePeriodMonths: "0" }, { ...NO_GIFT, acquisitionDate: "2021-01-04", residencePeriodMonthsAsset: "0" }), importedOneHouseFacts: WIN_WIN_FACTS } as ReturnType<typeof form>,
    { exempt: true, text: /상생임대주택이라 적용하지 않음/ }],
  // SYNC-1(계획서 rental-155-20-review-fixes PR-3) — §155의3① 양도기한(대통령령 제36737호): 종료일 2024-03-01 → 2026.12.31. 이전 종료라 2027-12-31까지.
  //   카드가 양도일을 술어에 넘기지 않던 때는 2028 양도에도 「상생임대주택이라 적용하지 않음」 ✓ — 엔진은 불성립(과세)이었다.
  ["M3d 상생임대 · 종료 2024-03-01 · 양도 2027-06-01(기한 안) · 본인 거주 0",
    { ...form({ transferDate: "2027-06-01", filingDate: "2027-08-31", residencePeriodMonths: "0" }, { ...NO_GIFT, acquisitionDate: "2021-01-04", residencePeriodMonthsAsset: "0" }), importedOneHouseFacts: { ...WIN_WIN_FACTS, winWinRentalLeaseEndDate: "2024-03-01" } } as ReturnType<typeof form>,
    { exempt: true, text: /상생임대주택이라 적용하지 않음/ }],
  ["M3x 짝 · 같은 상생임대 · 양도 2028-06-01(기한 2027-12-31 경과) · 본인 거주 0",
    { ...form({ transferDate: "2028-06-01", filingDate: "2028-08-31", residencePeriodMonths: "0" }, { ...NO_GIFT, acquisitionDate: "2021-01-04", residencePeriodMonthsAsset: "0" }), importedOneHouseFacts: { ...WIN_WIN_FACTS, winWinRentalLeaseEndDate: "2024-03-01" } } as ReturnType<typeof form>,
    { exempt: false }],
  ["M4 §154① 단서 3호 · 보유 1년 6개월 · 명부 임대 행", form({ provisoReason: "unavoidable" }, {}, true), { exempt: true, text: /보유기간 — §154① 단서 사유가 성립해 적용하지 않음/ }],
  // 리뷰 게이트 재현(2026-11-03) — 사유만 고르고 성립하지 않으면(1호 임차 거주 12개월 < 5년) 엔진은 과세 → 카드도 ✗. 성립(72개월)이면 ✓.
  ["M4n 짝 · §154① 단서 1호 불성립(임차 거주 12개월) · 명부 임대 행", form({ provisoReason: "rental_5yr_residence", provisoRentalLeaseResidenceMonths: "12" }, {}, true), { exempt: false }],
  ["M4p §154① 단서 1호 성립(임차 거주 72개월) · 명부 임대 행", form({ provisoReason: "rental_5yr_residence", provisoRentalLeaseResidenceMonths: "72" }, {}, true),
    { exempt: true, text: /보유기간 — §154① 단서 사유가 성립해 적용하지 않음/ }],
  ["D1 짝 · 매매 · 본인 거주 0 · 명부 임대 행", form({ ...LATER, residencePeriodMonths: "0" }, { ...NO_GIFT, acquisitionDate: "2021-01-04", residencePeriodMonthsAsset: "0" }, true), { exempt: false }],
  ["E3 짝 · §154⑩ 단독 · 보유 1년 9개월", form({ transferDate: "2020-03-01", filingDate: "2020-05-31", residencePeriodMonths: "13" },
    { ...NO_GIFT, acquisitionDate: "2018-06-01", residencePeriodMonthsAsset: "13", rentalHousingException: PHRP_B }), { exempt: false }],
];

describe("⑤ §155⑳ 카드 ✓/✗ = 엔진 판정", () => {
  it.each(CASES)("CV ★ %s", async (_n, f, want) => {
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(want.exempt);
    const a = f.assets[0];
    const rf = calcRentalResidenceFacts(f, a, 0);
    render(
      <RentalHousingExceptionSection rh={a.rentalHousingException} asset={a} acquisitionDate={a.acquisitionDate} transferDate={f.transferDate} mode="calc"
        onChange={() => {}} onChangeResidence={() => {}} mergeRental={rf.mergeRental} wasRegulatedAtAcquisition={rf.wasRegulatedAtAcquisition}
        residenceFacts={{ winWinResidenceExempt: rf.winWinResidenceExempt, provisoReason: rf.provisoReason, provisoScope: rf.provisoScope }} />,
    );
    const body = document.body.textContent ?? "";
    expect(body.includes("✗ 미충족"), "카드 ✗ ⇔ 엔진 비과세 아님").toBe(!want.exempt);
    expect(body.includes("일반 양도소득세로 계산됩니다")).toBe(!want.exempt);
    if (want.text) expect(body).toMatch(want.text);
  });
});

/**
 * V-B3 — §154⑩ 단독 경로 · 2019.2.12 전 강남(취득 당시 조정) 취득 · 보유 2년 9개월. §154① 단서가 종전규정 거주 2년을 풀면
 * 엔진은 §154⑩을 적용한다(세액 = 비조정 대조 P3와 같은 21,147,500 — 직전거주주택 양도일 전 차익만 과세). 단서가 없으면 전액 과세
 * 61,215,000. 이 경로는 결과가 isExempt=false로 같으므로 세액으로 가른다(2026-11-03 실측).
 */
const GN = "1168010100";
const vb3 = (res: string, fo: Record<string, unknown>, region = GN) =>
  form({ transferDate: "2021-03-01", filingDate: "2021-05-31", residencePeriodMonths: res, ...(region === GN ? { isRegulatedArea: true, wasRegulatedAtAcquisition: true } : {}), ...fo },
    { ...NO_GIFT, regionCode: region, acquisitionDate: "2018-06-01", residencePeriodMonthsAsset: res, rentalHousingException: PHRP_B });
const PHRP_MET = 21_147_500;
const PHRP_UNMET = 61_215_000;
const VB3: [string, ReturnType<typeof form>, { tax: number; cardFail: boolean; text?: RegExp }][] = [
  ["P1 §154① 단서 3호 · 거주 12개월", vb3("12", { provisoReason: "unavoidable" }), { tax: PHRP_MET, cardFail: false, text: /거주기간 — §154① 단서 사유가 성립해 적용하지 않음/ }],
  ["P2 §154① 단서 5호 · 거주 0", vb3("0", { provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true }), { tax: PHRP_MET, cardFail: false, text: /거주기간 — §154① 단서 사유가 성립해 적용하지 않음/ }],
  ["P4 짝 · §154① 단서 3호 불성립(거주 6개월 < 1년)", vb3("6", { provisoReason: "unavoidable" }), { tax: PHRP_UNMET, cardFail: true }],
  ["P0 짝 · 단서 없음 · 거주 12개월", vb3("12", {}), { tax: PHRP_UNMET, cardFail: true }],
  ["P2' 짝 · 단서 없음 · 거주 0", vb3("0", {}), { tax: PHRP_UNMET, cardFail: true }],
  ["P3 대조 · 비조정 취득 · 거주 0", vb3("0", {}, "4682025021"), { tax: PHRP_MET, cardFail: false }],
];

describe("V-B3 §154⑩ 단서 거주 면제 — 카드 ✓/✗ = 엔진 §154⑩ 적용 여부", () => {
  it.each(VB3)("CV-P ★ %s", async (_n, f, want) => {
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(want.tax);
    const a = f.assets[0];
    const rf = calcRentalResidenceFacts(f, a, 0);
    render(
      <RentalHousingExceptionSection rh={a.rentalHousingException} asset={a} acquisitionDate={a.acquisitionDate} transferDate={f.transferDate} mode="calc"
        onChange={() => {}} onChangeResidence={() => {}} mergeRental={rf.mergeRental} wasRegulatedAtAcquisition={rf.wasRegulatedAtAcquisition}
        residenceFacts={{ winWinResidenceExempt: rf.winWinResidenceExempt, provisoReason: rf.provisoReason, provisoScope: rf.provisoScope }} />,
    );
    const body = document.body.textContent ?? "";
    expect(body.includes("✗ 미충족"), "카드 ✗ ⇔ 엔진 §154⑩ 불성립").toBe(want.cardFail);
    expect(body.includes("일반 양도소득세로 계산됩니다")).toBe(want.cardFail);
    if (want.text) expect(body).toMatch(want.text);
  });
});
