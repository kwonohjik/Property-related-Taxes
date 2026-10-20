/**
 * PR6b — 장기임대주택 특례 결과 표시·인용 (S09-3 · S06-13 · S06-8 · X2-9). 세액·판정 결론은 바뀌지 않는다.
 *
 * - S09-3  판정 메뉴 B 충족 배지 — 전액 「비과세」로 단언하지 않는다(소령 §154⑩ 「직전거주주택의 양도일 후의 기간분에 대해서만」).
 * - S06-13 §154⑩ 표준 경로(B · 0호) 결과의 근거 조문 = 판정이 정한 `eligibility.laws`(§154⑩).
 * - S06-8  RH-A2는 §155⑳ 전단 → §154①이라 표2 장특을 반영하고 「소령 §161①」을 붙이지 않는다.
 * - X2-9   보유기간 사유 인용 「소령 §154⑤·법 §95④」(소령 §95는 재고자산 평가 조문).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { buildCaseForm, type RulingCase } from "../one-house-rulings/harness";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { oneHouseVerdictOf, oneHouseVerdictFromResult, oneHouseVerdictLabel } from "@/lib/calc/one-house-judgment-verdict";
import { resolveHighValueHouseThreshold } from "@/lib/tax-engine/one-house/threshold";
import { handoff, mkCase, runCalc, runJudgment, withToday } from "./_helpers";
import e177 from "../one-house-rulings/cases/E177.json";
import e191 from "../one-house-rulings/cases/E191.json";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

// ───────────────────────── 공용 픽스처 ─────────────────────────
const b0 = (e191 as RulingCase[]).find((c) => c.id === "E191-era")!;
/** B · 임대주택 0호(§154⑩ 표준 경로) + §161 기준시가 입력. */
function mkB0(top: Record<string, unknown> = {}, rhOver: Record<string, unknown> = {}, assetOver: Record<string, unknown> = {}): RulingCase {
  const ref = b0.referenceForm!;
  const asset = { ...(ref.asset as Record<string, unknown>) };
  const rhe = {
    ...(asset.rentalHousingException as Record<string, unknown>),
    standardPriceAtAcquisitionForPhrp: "100000000", standardPriceAtPriorTransfer: "200000000", standardPriceAtTransferForPhrp: "300000000",
    ...rhOver,
  };
  return { ...b0, form: { ...ref, ...top, asset: { ...asset, fixedAcquisitionPrice: "200000000", addressJibun: "서울특별시 종로구 청운동 1", rentalHousingException: rhe, ...assetOver } } };
}

// ───────────────────────── S09-3 ─────────────────────────
describe("S09-3 판정 메뉴 B 충족 — 배지·이력·불러오기·출처 줄이 전액 「비과세」를 단언하지 않는다", () => {
  it("[전제] 같은 사실의 계산기는 RH-B1 과세 세액을 낸다", async () => {
    const c = mkB0();
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.issues).toEqual([]);
      expect(r.result?.rentalHousingExceptionDetail?.scenarioId).toBe("RH-B1");
      expect(r.result?.totalTax).toBeGreaterThan(0);
    });
  });
  it("B 충족(12억 이하): 라벨 「기간분 비과세」 — 「비과세」·「과세」 단정 아님, 이력·불러오기 술어도 같은 라벨", async () => {
    const c = mkB0();
    await withToday(c.today, async () => {
      const form = buildCaseForm(c);
      const j = await runJudgment(form);
      expect(j.data.rentalHousingException).toMatchObject({ scenario: "B", passed: true });
      expect(j.data.judgment.isExempt).toBe(true); // 판정 결론(엔진)은 그대로 — 이 PR은 표시만
      const v = oneHouseVerdictOf(j.data.judgment, resolveHighValueHouseThreshold(new Date(form.transferDate)), j.data.contestedIssues, j.data.rentalHousingException);
      expect(v.label).toBe("기간분 비과세");
      expect(v.detail).toMatch(/직전거주주택 양도일 후의 기간분/);
      expect(v.detail).not.toBe("1세대1주택 비과세 요건을 충족합니다.");
      // 이력 목록·불러오기 모달·출처 줄은 저장된 resultData(= 응답)에서 같은 술어를 거친다
      expect(oneHouseVerdictFromResult(j.data)?.label).toBe("기간분 비과세");
      expect(oneHouseVerdictLabel(j.data)).toBe("기간분 비과세");
    });
  });
  it("B 충족 + 고가주택(15억): 같은 라벨, 설명에 고가주택 과세 계산 병기", async () => {
    const c = mkB0({ contractTotalPrice: "1500000000" });
    await withToday(c.today, async () => {
      const form = buildCaseForm(c);
      const j = await runJudgment(form);
      expect(j.data.judgment.isPartialExempt).toBe(true);
      const v = oneHouseVerdictOf(j.data.judgment, resolveHighValueHouseThreshold(new Date(form.transferDate)), j.data.contestedIssues, j.data.rentalHousingException);
      expect(v.label).toBe("기간분 비과세");
      expect(v.detail).toMatch(/고가주택.*초과.*§161②/);
    });
  });
  it("[짝] A 충족(거주주택 양도)은 「비과세」 그대로", async () => {
    const a = (e177 as RulingCase[]).find((c) => c.id === "E177-era")!;
    await withToday(a.today, async () => {
      const form = buildCaseForm(a);
      const j = await runJudgment(form);
      if (j.data.rentalHousingException?.scenario !== "A" || !j.data.rentalHousingException.passed) return; // 픽스처 전제
      expect(oneHouseVerdictOf(j.data.judgment, undefined, j.data.contestedIssues, j.data.rentalHousingException).label).toBe("비과세");
    });
  });
  it("[짝] 특례 정보가 없거나 B 미충족이면 종전 술어 그대로", () => {
    expect(oneHouseVerdictOf({ isExempt: true }).label).toBe("비과세");
    expect(oneHouseVerdictOf({ isExempt: true }, undefined, undefined, { scenario: "B", passed: false }).label).toBe("비과세");
    expect(oneHouseVerdictOf({ isExempt: false }, undefined, undefined, { scenario: "B", passed: true }).label).toBe("과세");
  });
});

// ───────────────────────── S06-13 ─────────────────────────
const T = "2023-03-03";
const UNIT = { ...makeDefaultRentalUnit(), businessRegistrationDate: "2014-01-01", rentalRegistrationDate: "2014-01-01", standardPriceAtRentalStart: "200,000,000", rentalInputMode: "direct" as const, rentalMonths: "100", requirementsConfirmed: true };
function bCalcForm(units: 0 | 1) {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: T, householdHousingCount: "1", isOneHousehold: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, contractTotalPrice: "800,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "800,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "24" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException, applyException: true, scenario: "B", rentalUnits: units ? [UNIT] : [],
    priorResidenceTransferDate: "2016-08-25", standardPriceAtAcquisitionForPhrp: "300,000,000", standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000", postRegistrationResidenceMonths: "24", wasRegisteredRentalOrChildcare: units === 0,
  };
  return f;
}
type Step = { label: string; formula?: string; legalBasis?: string };
const APPLIED = "장기임대주택 보유자 거주주택 비과세 특례";

describe("S06-13 §154⑩ 표준 경로(B · 0호) 근거 표시", () => {
  it("계산기: 적용·비과세 step의 근거가 §154⑩ (판정 laws와 같은 값), 세액은 임대 1호 대조와 같다", async () => {
    const r0 = await runCalc(bCalcForm(0));
    const r1 = await runCalc(bCalcForm(1));
    const steps0 = r0.result.steps as Step[];
    const applied = steps0.find((s) => s.label === APPLIED)!;
    expect(r0.result.rentalHousingExceptionDetail.eligibility.laws).toEqual(["소득세법 시행령 §154⑩"]);
    expect(applied.legalBasis).toBe("소득세법 시행령 §154⑩");
    expect(applied.formula).toBe("§154⑩ + §161 — RH-B1 시나리오 적용");
    const nt0 = steps0.find((s) => s.label.startsWith("비과세 양도소득금액"))!;
    expect(nt0.label).toBe("비과세 양도소득금액 (소령 §161①)"); // B는 §161① 유지
    expect(nt0.legalBasis).toBe("소득세법 시행령 §154⑩");
    // [짝] 임대 1호 B는 §155⑳ 경로 — 종전 표시 유지, 세액 동일(표시만 바뀜)
    const applied1 = (r1.result.steps as Step[]).find((s) => s.label === APPLIED)!;
    expect(applied1.legalBasis).toBe("소득세법 시행령 §155⑳");
    expect(applied1.formula).toBe("§155⑳ + §161 — RH-B1 시나리오 적용");
    expect(r0.result.totalTax).toBe(r1.result.totalTax);
    expect(r0.result.taxableGain).toBe(r1.result.taxableGain);
  });
  it("판정 메뉴: rental.legalBasis = §154⑩ (0호) / §155⑳ (1호)", async () => {
    for (const [n, basis] of [[0, "소득세법 시행령 §154⑩"], [1, "소득세법 시행령 §155⑳"]] as const) {
      const c = mkCase("2023-03-04", {
        isOneHousehold: true, transferDate: T, contractTotalPrice: "800000000", wasRegulatedAtAcquisition: false,
        asset: {
          assetKind: "housing", acquisitionDate: "2009-08-12", residenceInputMode: "direct", residencePeriodMonthsAsset: "24",
          rentalHousingException: {
            applyException: true, scenario: "B", priorResidenceTransferDate: "2016-08-25", postRegistrationResidenceMonths: "24", wasRegisteredRentalOrChildcare: n === 0,
            rentalUnits: n ? [{ ...UNIT, rentalCategory: "long_general", rentalAcquisitionType: "purchase", region: "seoul-metro", standardPriceAtRentalStart: "200000000" }] : [],
          },
        },
        houses: [],
      });
      await withToday(c.today, async () => {
        const j = await runJudgment(buildCaseForm(c));
        expect(j.data.rentalHousingException.passed, `units=${n}`).toBe(true);
        expect(j.data.rentalHousingException.legalBasis).toBe(basis);
      });
    }
  });
});

// ───────────────────────── S06-8 ─────────────────────────
const GANGNAM = "1168010100";
const RENTAL: HouseEntry = { id: "h4", region: "capital", regionCode: GANGNAM, acquisitionDate: "2013-06-01", officialPrice: "300000000", isInherited: false, isLongTermRental: true, isApartment: false, isOfficetel: false, isUnsoldHousing: false };
/** ⑳ A(거주주택 양도) · 15억(12억 초과) / 대조: rental=false → 일반 고가 1세대1주택. */
export function a2Form(rental: boolean) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2016-01-01", fixedAcquisitionPrice: "500,000,000", regionCode: GANGNAM, addressJibun: "서울 강남구 역삼동 1", residenceInputMode: "direct", residencePeriodMonthsAsset: "40" };
  Object.assign(f, { householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: !rental, transferDate: "2026-03-01", contractTotalPrice: "1,500,000,000", residencePeriodMonths: "40", householdHousingCount: rental ? "2" : "1", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: rental ? [RENTAL] : [] });
  if (rental) {
    const a = f.assets[0];
    a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "80", requirementsConfirmed: true }] };
  }
  return f;
}

describe("S06-8 RH-A2 결과 echo — 실제 적용한 표2(52%)·§161① 라벨은 B에만, 세액 불변", () => {
  it("장특 echo = 표2 전체(52%), 비과세 echo = exemptGain, A step에 §161 없음, 세액·과세표준 = 일반 고가 대조군", async () => {
    const r = await runCalc(a2Form(true));
    const ctl = await runCalc(a2Form(false));
    const x = r.result;
    expect(r.issues).toEqual([]);
    expect(x.rentalHousingExceptionDetail.scenarioId).toBe("RH-A2");
    expect(x.rentalHousingExceptionDetail.appliedTable).toBe("table-2");
    // 세액 불변 — 표시 결함이다
    expect(x.totalTax).toBe(19_013_500);
    expect(x.totalTax).toBe(ctl.result.totalTax);
    expect(x.taxBase).toBe(ctl.result.taxBase);
    expect(x.calculatedTax).toBe(ctl.result.calculatedTax);
    // 표2 기준: 장특률 52%(보유 10년 40% + 거주 3년 12%), 장특 = 양도차익 × 52%
    expect(x.longTermHoldingRate).toBeCloseTo(0.52, 6);
    expect(x.longTermHoldingDeduction).toBe(520_000_000);
    expect(x.transferGain - x.longTermHoldingDeduction).toBe(x.rentalHousingExceptionDetail.formulaTrace.gain95Table2); // §95① 양도소득금액
    // 비과세 양도소득금액 = 표2 양도소득금액 − 과세대상 = exemptGain
    expect(x.nontaxableGainAmount).toBe(x.rentalHousingExceptionDetail.exemptGain);
    expect(x.nontaxableGainAmount).toBe(384_000_000);
    const steps = x.steps as Step[];
    expect(steps.filter((s) => s.label.includes("§161①"))).toEqual([]);
    expect(steps.find((s) => s.label === "비과세 양도소득금액")?.formula).toContain("480,000,000");
    expect(steps.find((s) => s.label === APPLIED)?.formula).toBe("§155⑳ — RH-A2 시나리오 적용");
  });
  it("[짝] B(RH-B1)는 표1·「(소령 §161①)」 유지 — 종전 echo 그대로", async () => {
    const r = await runCalc(bCalcForm(0));
    const x = r.result;
    expect(x.rentalHousingExceptionDetail.appliedTable).toBe("table-1");
    expect(x.nontaxableGainAmount).toBe(x.rentalHousingExceptionDetail.exemptGain);
    expect(x.transferGain - x.longTermHoldingDeduction).toBe(x.rentalHousingExceptionDetail.formulaTrace.gain95Table1);
  });
});

// ───────────────────────── X2-9 ─────────────────────────
describe("X2-9 §154⑩ 경로 보유기간 사유 인용", () => {
  const mk = (acq: string) => mkB0({}, {}, { acquisitionDate: acq, residencePeriodMonthsAsset: "12" });
  it("보유 1년: 「소령 §154⑤·법 §95④」 (소령 §95 아님)", async () => {
    const c = mk("2016-01-10");
    await withToday(c.today, async () => {
      const j = await runJudgment(buildCaseForm(c));
      const hold = (j.data.rentalHousingException.residenceFailReasons as string[]).filter((r) => r.includes("보유기간 2년 미충족"));
      expect(hold).toHaveLength(1);
      expect(hold[0]).toContain("소령 §154⑤·법 §95④");
      expect(hold[0]).not.toMatch(/·§95④/);
    });
  });
  it("[짝] 보유 2년 이상: 보유기간 사유 없음", async () => {
    const c = mk("2014-03-15");
    await withToday(c.today, async () => {
      const j = await runJudgment(buildCaseForm(c));
      expect((j.data.rentalHousingException.residenceFailReasons as string[]).filter((r) => r.includes("보유기간"))).toEqual([]);
    });
  });
});
