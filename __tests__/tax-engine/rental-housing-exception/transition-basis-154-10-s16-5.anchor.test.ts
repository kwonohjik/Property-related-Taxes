/**
 * 결정 #21(S16-5) anchor — §154⑩ 표준 경로(B · 임대 0호)의 대통령령 제29523호 부칙 제7조② 경과조치도 **사유까지** 받아야 종전규정이다.
 *
 * 종전에는 체크(`residenceTransitionUnderAddendum`)만으로 종전규정(§154① 원칙)을 줬다. 같은 부칙 문장이 §155⑳ A 경로에서는
 * 「계약금 지급 · 그 전 등록 임대주택 없음」과 사유 미입력을 불성립으로 보는데(`isAddendumTransitionEffective`), §154⑩ 경로만 달랐다.
 * 같은 화면의 라디오는 그 사유에 「종전 규정을 적용받지 못합니다」라고 적어 화면이 자기모순이었다.
 *
 * 시료: 취득 2019-06-01(경과조치 없으면 신규정) · 양도 2023-06-01 · 비조정 · 등록 후 거주 10개월 · 800,000,000 / 400,000,000 ·
 * 기준시가 3·4·5억(mock 세율). 신규정이면 등록일 이후 거주 2년 미충족 → 과세, 종전규정이면 비조정 취득이라 거주요건 없음 → §161① 안분.
 * 근거 한계: 사유 요건은 §155⑳ A 사안의 회신(서면-2020-법령해석재산-1464 · 서면-2021-법규재산-4760)을 같은 부칙 문장에 적용한 것이다 —
 * §154⑩ 경로를 직접 다룬 해석은 확보하지 못했다(고지로 남긴다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { checkEligibility, type EligibilityContext } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import {
  isPreLifetimeLimitRegime,
  needsPre2019ArticleScopeNotice,
} from "@/lib/tax-engine/data/rental-155-20-era";
import { buildRentalHousingVerdict } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const input = (rh: Record<string, unknown> = {}, over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2023-06-01"),
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2019-06-01"),
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    rentalHousingException: {
      applyException: true,
      scenario: "B",
      rentalUnits: [],
      priorResidenceTransferDate: new Date("2022-01-10"),
      wasRegisteredRentalOrChildcare: true,
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtPriorTransfer: 400_000_000,
      standardPriceAtTransfer: 500_000_000,
      postRegistrationResidenceMonths: 10,
      ...rh,
    },
    ...over,
  } as Partial<TransferTaxInput>);

/** 종전규정(§161① 안분 적용) — 전 시료 공통 */
const APPLIED_TAX = 53_933_000;
/** 신규정 불충족 → 특례 미적용 일반 과세 */
const NOT_APPLIED_TAX = 84_029_000;

describe("S16-5 §154⑩ 경로 — 경과조치 사유 없이는 종전규정을 주지 않는다 (엔진)", () => {
  it("T-1 ★ 체크만(사유 없음) → 신규정(등록일 이후 거주 2년) 불충족 → 특례 미적용 (전 53,933,000 → 후 84,029,000)", () => {
    const r = calculateTransferTax(input({ residenceTransitionUnderAddendum: true }), rates);
    expect(r.rentalHousingExceptionDetail?.applied ?? false).toBe(false);
    expect(r.totalTax).toBe(NOT_APPLIED_TAX);
    // 결론을 가르므로 확인 필요 고지 — 화면 중립 문구 + 근거 한계
    const confirm = r.steps.find((s) => s.label.includes("확인 필요"))?.formula ?? "";
    expect(confirm).toContain("§154⑩ 경로를 직접 다룬 해석은 확인되지 않았습니다");
    expect(confirm).not.toContain("판정 메뉴에서");
  });

  it("T-2 ★ 「계약금 · 그 전 등록 임대주택 없음」 → 종전규정 불성립 (전 53,933,000 → 후 84,029,000)", () => {
    const r = calculateTransferTax(
      input({ residenceTransitionUnderAddendum: true, residenceTransitionBasis: "contract_without_prior_rental" }),
      rates,
    );
    expect(r.rentalHousingExceptionDetail?.applied ?? false).toBe(false);
    expect(r.totalTax).toBe(NOT_APPLIED_TAX);
  });

  it("T-3 긍정 짝 — 「당시 거주」·「계약금 + 그 전 등록 임대주택 소유」는 종전규정 → §161① 안분 적용 (세액 불변 53,933,000)", () => {
    for (const basis of ["residing", "contract_with_prior_rental"] as const) {
      const r = calculateTransferTax(
        input({ residenceTransitionUnderAddendum: true, residenceTransitionBasis: basis }),
        rates,
      );
      expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
      expect(r.totalTax).toBe(APPLIED_TAX);
      expect(r.steps.some((s) => s.label.includes("확인 필요"))).toBe(false);
    }
  });

  it("T-4 부정 짝 — 경과조치를 선언하지 않은 신규정 시료는 같은 과세이고 사유 고지는 없다 (선언하지 않은 사실은 고지 대상이 아니다)", () => {
    const r = calculateTransferTax(input(), rates);
    expect(r.totalTax).toBe(NOT_APPLIED_TAX);
    expect(r.steps.some((s) => s.formula.includes("부칙 경과조치"))).toBe(false);
  });

  it("T-5 부정 짝 — 2019.2.12 전 취득은 사유와 무관하게 종전규정(세액 불변 · 사유 고지 없음)", () => {
    const r = calculateTransferTax(
      input({ residenceTransitionUnderAddendum: true }, { acquisitionDate: new Date("2018-06-01") }),
      rates,
    );
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.steps.some((s) => s.formula.includes("부칙 경과조치"))).toBe(false);
  });

  it("T-6 사유 고지는 결론을 가를 때만 — 신규정도 불충족이고 종전규정도 불충족(조정지역 취득 · 거주 2년 미만)이면 고지하지 않는다", () => {
    const base: EligibilityContext = {
      scenario: "B",
      transferDate: new Date("2023-06-01"),
      residenceAcquisitionDate: new Date("2019-06-01"),
      priorResidenceTransferDate: new Date("2022-01-10"),
      wasRegisteredRentalOrChildcare: true,
      wasRegulatedAtAcquisition: true,
      postRegistrationResidenceMonths: 10,
      residenceTransitionUnderAddendum: true,
    };
    const both = checkEligibility([], 4, 1, false, base);
    expect(both.passed).toBe(false);
    expect(both.notices ?? []).toHaveLength(0);
    // 종전규정이면 충족(거주 2년 이상)하는 짝 — 고지한다
    const decisive = checkEligibility([], 4, 3, false, base);
    expect(decisive.passed).toBe(false);
    expect(decisive.notices?.[0]).toContain("확인 필요");
  });

  it("T-7 leaf — isPreLifetimeLimitRegime이 사유를 본다 / needsPre2019ArticleScopeNotice 연쇄 (§155⑳ 마·바목 고지가 사유 없음에서 사라진다)", () => {
    const acq = new Date("2020-01-01");
    expect(isPreLifetimeLimitRegime(acq, true, "")).toBe(false);
    expect(isPreLifetimeLimitRegime(acq, true, "contract_without_prior_rental")).toBe(false);
    expect(isPreLifetimeLimitRegime(acq, true, "residing")).toBe(true);
    expect(isPreLifetimeLimitRegime(acq, true, "contract_with_prior_rental")).toBe(true);
    expect(isPreLifetimeLimitRegime(acq, false, "residing")).toBe(false);
    expect(isPreLifetimeLimitRegime(new Date("2018-12-31"), false, "")).toBe(true);
    expect(needsPre2019ArticleScopeNotice(acq, true, "", ["마"])).toBe(false);
    expect(needsPre2019ArticleScopeNotice(acq, true, "residing", ["마"])).toBe(true);
    expect(needsPre2019ArticleScopeNotice(new Date("2018-12-31"), false, "", ["마"])).toBe(true);
  });
});

describe("S16-5 판정 메뉴 결론(buildRentalHousingVerdict) — 계산기와 같은 leaf", () => {
  const verdictOf = (rh: Record<string, unknown>) => buildRentalHousingVerdict(input(rh));
  it("V-1 ★ 체크만 · 「계약금 + 그 전 등록 임대주택 없음」 → 불충족 (종전: 충족 · 비과세)", () => {
    for (const rh of [
      { residenceTransitionUnderAddendum: true },
      { residenceTransitionUnderAddendum: true, residenceTransitionBasis: "contract_without_prior_rental" },
    ]) {
      const v = verdictOf(rh);
      expect(v?.passed).toBe(false);
      expect(v?.residenceFailReasons.some((r) => r.includes("등록일 이후"))).toBe(true);
    }
  });
  it("V-2 긍정 짝 — 사유가 종전규정을 주면 충족 · 경과조치 미선언 신규정 시료는 불충족 (경계)", () => {
    expect(verdictOf({ residenceTransitionUnderAddendum: true, residenceTransitionBasis: "residing" })?.passed).toBe(true);
    expect(verdictOf({ residenceTransitionUnderAddendum: true, residenceTransitionBasis: "contract_with_prior_rental" })?.passed).toBe(true);
    expect(verdictOf({})?.passed).toBe(false);
  });
});

