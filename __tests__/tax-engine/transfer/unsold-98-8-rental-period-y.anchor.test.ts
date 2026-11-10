// 그룹 Y anchor — §98의8 임대기간: 초일 산입 · 공실 구간별 만 개월 합산 · 등록일 기산 · 등록 기한 · ⑧ 모순 일자 · echo
//
// 근거: 조특법 §98의8①(괄호) · 조특령 §98의7⑤ → §98의5⑤1호 「임대를 개시하는 날부터 기산할 것」(KoreanLaw MST 288915·284389, 2026-11-10 실독).
// §98의6 2호(#3078)와 같은 공용 헬퍼를 쓴다. 등록 기한(2015.12.31.)은 §98의6 사용자 결정(2026-11-09)을 준용한 것 — 해석례 없음, 확인 필요.
//
// 손계산은 엔진 출력 전에 적었다(주석의 개월 수). 개월 = 구간별 「양 끝 포함 만 개월」의 합.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

// route를 먼저 import해야 스키마 모듈 순환 초기화(TDZ)가 정상 순서로 풀린다.
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { evaluateUnsold988, type Unsold988Input } from "@/lib/tax-engine/transfer-reductions/unsold-98-8";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

// 취득 2015-07-01 · 계약 2015-06-01 · 임대계약 2015-11-20 · 개시 2015-12-01 · 등록 두 건 2015-12-01
const base988 = (over: Partial<Unsold988Input> = {}): Unsold988Input => ({
  transferDate: D("2020-11-30"),
  acquisitionDate: D("2015-07-01"),
  contractDate: D("2015-06-01"),
  acquisitionPrice: 550_000_000,
  exclusiveAreaSqm: 84.5,
  rentalContractDate: D("2015-11-20"),
  rentalStartDate: D("2015-12-01"),
  businessRegistrationDate: D("2015-12-01"),
  rentalRegistrationDate: D("2015-12-01"),
  isUnsoldAfterCompletion: true,
  isFirstContract: true,
  isNotRecontract: true,
  transferIncome: 200_000_000,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer: 400_000_000,
  ...over,
});
const codes = (i: Unsold988Input) => evaluateUnsold988(i).ineligibleReasons.map((x) => x.code);

describe("Y-1 초일 산입 — 개시하는 날부터 기산", () => {
  it("개시 2015-12-01 · 종료 2020-11-30 = 60개월 적격 (종전 59개월 불적격) · 11-29 = 59개월 불적격", () => {
    const ok = evaluateUnsold988(base988());
    expect(ok.isEligible).toBe(true);
    expect(ok.rentalMonths).toBe(60);
    // (300M−200M)/(400M−200M)=0.5 → 200M × 0.5 × 50% = 50M
    expect(ok.reducibleTransferIncome).toBe(50_000_000);
    const short = evaluateUnsold988(base988({ transferDate: D("2020-11-29") }));
    expect(short.rentalMonths).toBe(59);
    expect(short.ineligibleReasons.map((x) => x.code)).toContain("RENTAL_PERIOD_SHORT");
  });
});

describe("Y-2 공실 구간별 만 개월 합산", () => {
  it("공실 6일(2018-03-15~03-20) → 구간1 27개월 + 구간2 32개월 = 59개월 불적격 (공실 없으면 60개월)", () => {
    // 구간1 2015-12-01~2018-03-14 = 27개월(+13일 절사), 구간2 2018-03-21~2020-11-30 = 32개월(+10일 절사)
    const r = evaluateUnsold988(base988({ rentalVacancies: [{ startDate: D("2018-03-15"), endDate: D("2018-03-20") }] }));
    expect(r.isEligible).toBe(false);
    expect(r.rentalMonths).toBe(59);
    expect(r.rentalPeriodEcho).toEqual({ basisDate: "2015-12-01", rentalMonths: 59, vacancyMonths: 1, inheritedMonths: 0 });
    expect(r.ineligibleReasons.find((x) => x.code === "RENTAL_PERIOD_SHORT")?.message).toContain("공실 구간 제외");
  });

  it("공실 12개월(2017-01-01~12-31)이라도 양도를 늦추면 적격: 2015-12-01~2021-12-01 → 13개월 + 47개월 = 60개월", () => {
    // 구간1 2015-12-01~2016-12-31 = 13개월, 구간2 2018-01-01~2021-12-01 = 47개월(+1일)
    const r = evaluateUnsold988(
      base988({ transferDate: D("2021-12-01"), rentalVacancies: [{ startDate: D("2017-01-01"), endDate: D("2017-12-31") }] }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.rentalMonths).toBe(60);
    expect(r.rentalPeriodEcho).toEqual({ basisDate: "2015-12-01", rentalMonths: 60, vacancyMonths: 12, inheritedMonths: 0 });
  });
});

describe("Y-3 기산일 = max(사업자등록일, 임대사업자등록일, 실제 임대개시일)", () => {
  it("사업자등록 2015-12-20 · 임대사업자등록 2015-12-10 · 개시 2015-12-01 → 기산 2015-12-20: 양도 2020-12-19 = 60 적격 / 12-18 = 59 불적격", () => {
    const o = { businessRegistrationDate: D("2015-12-20"), rentalRegistrationDate: D("2015-12-10") };
    const ok = evaluateUnsold988(base988({ ...o, transferDate: D("2020-12-19") }));
    expect(ok.isEligible).toBe(true);
    expect(ok.rentalPeriodEcho?.basisDate).toBe("2015-12-20");
    expect(codes(base988({ ...o, transferDate: D("2020-12-18") }))).toContain("RENTAL_PERIOD_SHORT");
  });
  it("등록이 개시보다 빠르면 개시일부터 센다", () => {
    const r = evaluateUnsold988(base988({ businessRegistrationDate: D("2015-10-01"), rentalRegistrationDate: D("2015-10-02") }));
    expect(r.rentalPeriodEcho?.basisDate).toBe("2015-12-01");
  });
});

describe("Y-4 등록 기한 (법 §98의8① 괄호 — 2015.12.31. 이전, §98의6 사용자 결정 준용)", () => {
  const t = D("2021-01-31");
  it("2015-12-31 등록 적격 / 2016-01-01 등록 부적격 (사업자등록·임대사업자등록 각각)", () => {
    expect(codes(base988({ transferDate: t, businessRegistrationDate: D("2015-12-31") }))).not.toContain("REGISTRATION_AFTER_DEADLINE");
    expect(codes(base988({ transferDate: t, rentalRegistrationDate: D("2015-12-31") }))).not.toContain("REGISTRATION_AFTER_DEADLINE");
    expect(codes(base988({ transferDate: t, businessRegistrationDate: D("2016-01-01") }))).toContain("REGISTRATION_AFTER_DEADLINE");
    expect(codes(base988({ transferDate: t, rentalRegistrationDate: D("2016-01-01") }))).toContain("REGISTRATION_AFTER_DEADLINE");
  });
  it("등록이 임대계약보다 늦어도(2015년 안) 사유가 아니다 — 기산만 늦춘다", () => {
    const r = evaluateUnsold988(base988({ transferDate: t, rentalRegistrationDate: D("2015-12-31") }));
    expect(r.isEligible).toBe(true);
    expect(r.rentalPeriodEcho?.basisDate).toBe("2015-12-31");
    // 2015-12-31~2021-01-31: 61개월 (2020-12-31 = 60개월 완료, 2021-01-30 = 61개월 완료)
    expect(r.rentalMonths).toBe(61);
  });
});

describe("Y-5 ⑧ 모순 일자 (엔진은 사유로 막는다)", () => {
  it("계약 > 개시 · 종료 < 개시 · 등록일 미입력 · 상속 소수 · 공실 역전", () => {
    expect(codes(base988({ rentalContractDate: D("2015-12-02") }))).toContain("RENTAL_DATE_ORDER");
    expect(codes(base988({ rentalEndDate: D("2015-11-30") }))).toContain("RENTAL_DATE_ORDER");
    expect(codes(base988({ businessRegistrationDate: undefined }))).toContain("MISSING_RENTAL_REGISTRATION");
    expect(codes(base988({ rentalRegistrationDate: undefined }))).toContain("MISSING_RENTAL_REGISTRATION");
    expect(codes(base988({ inheritedRentalMonths: 5.5 }))).toContain("INVALID_INHERITED_RENTAL_MONTHS");
    expect(codes(base988({ rentalVacancies: [{ startDate: D("2017-02-01"), endDate: D("2017-01-01") }] }))).toContain("RENTAL_VACANCY_ORDER");
    expect(codes(base988({ rentalStartDate: undefined }))).toContain("MISSING_RENTAL_START");
  });
  it("임대종료일이 양도일을 넘으면 양도일까지로 자른다 (종료 2021-06-30, 양도 2020-11-29 → 59개월)", () => {
    const r = evaluateUnsold988(base988({ transferDate: D("2020-11-29"), rentalEndDate: D("2021-06-30") }));
    expect(r.rentalMonths).toBe(59);
  });
  it("상속 합산은 정수 개월 그대로: 본인 54개월(양도 2020-05-31) + 6 = 60 적격 / +5 = 59 불적격", () => {
    // 2015-12-01~2020-05-31 = 54개월. 양도 2020-05-31은 취득 5년(2020-07-01) 이내 → 전액 기준
    const t = D("2020-05-31");
    expect(codes(base988({ transferDate: t, inheritedRentalMonths: 6 }))).not.toContain("RENTAL_PERIOD_SHORT");
    expect(codes(base988({ transferDate: t, inheritedRentalMonths: 5 }))).toContain("RENTAL_PERIOD_SHORT");
  });
});

// ─────────── 세액 (mock 세율): 종전 ↔ 현행 판정이 갈리는 두 시나리오 ───────────
const R988 = (over: Record<string, unknown> = {}) =>
  ({
    type: "unsold_98_8" as const,
    contractDate988: D("2015-06-01"),
    acquisitionPrice988: 550_000_000,
    exclusiveAreaSqm988: 84.5,
    rentalContractDate988: D("2015-11-20"),
    rentalStartDate988: D("2015-12-01"),
    businessRegistrationDate988: D("2015-12-01"),
    rentalRegistrationDate988: D("2015-12-01"),
    isUnsoldAfterCompletion988: true,
    isFirstContract988: true,
    isNotRecontract988: true,
    standardPriceAtAcquisition988: 200_000_000,
    standardPriceAt5Years988: 300_000_000,
    standardPriceAtTransfer988: 400_000_000,
    ...over,
  }) as unknown as NonNullable<Parameters<typeof calculateTransferTax>[0]["reductions"]>[number];

const run = (reductions: Parameters<typeof calculateTransferTax>[0]["reductions"], transferDate = "2020-11-30") =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 550_000_000,
      acquisitionDate: D("2015-07-01"),
      transferDate: D(transferDate),
      householdHousingCount: 2,
      reductions,
    }),
    makeMockRates(),
  );

describe("Y-6 세액 — 개시 2015-12-01·양도 2020-11-30(초일 산입 60개월)", () => {
  const none = run([]);
  const withRed = run([R988()]);
  it("종전(59개월 불적격 = 감면 없음)과 달리 적격 → 소득 차감으로 결정세액이 낮아진다", () => {
    expect(withRed.unsold988Detail?.isEligible).toBe(true);
    expect(withRed.unsold988Detail?.rentalMonths).toBe(60);
    expect(withRed.determinedTax).toBeLessThan(none.determinedTax);
  });
  it("공실 6일을 입력하면 59개월 불적격 → 감면 없음과 같은 세액", () => {
    const vac = run([R988({ rentalVacancyPeriods988: [{ startDate: D("2018-03-15"), endDate: D("2018-03-20") }] })]);
    expect(vac.unsold988Detail?.isEligible).toBe(false);
    expect(vac.determinedTax).toBe(none.determinedTax);
  });
});

// ─────────── ⑧ validate ───────────
function form988(over: Record<string, unknown>, transferDate = "2020-11-30") {
  const form = createDefaultTransferFormData();
  form.transferDate = transferDate;
  const r = {
    ...getReductionDefault("unsold_98_8"),
    contractDate988: "2015-06-01",
    acquisitionPrice988: "550,000,000",
    exclusiveAreaSqm988: "84.5",
    rentalContractDate988: "2015-11-20",
    rentalStartDate988: "2015-12-01",
    businessRegistrationDate988: "2015-12-01",
    rentalRegistrationDate988: "2015-12-01",
    isUnsoldAfterCompletion988: true,
    isFirstContract988: true,
    isNotRecontract988: true,
    standardPriceAtAcquisition988: "200,000,000",
    standardPriceAt5Years988: "300,000,000",
    standardPriceAtTransfer988: "400,000,000",
    ...over,
  } as unknown as AssetReductionForm;
  form.assets[0] = { ...form.assets[0], acquisitionDate: "2015-07-01", reductions: [r] };
  return form;
}
const v8 = (over: Record<string, unknown>, transferDate?: string) => validateStep(2, form988(over, transferDate)) ?? null;

describe("Y-7 ⑧ — §98의8 임대 입력 검증", () => {
  it("정상 입력은 통과", () => {
    expect(v8({})).toBeNull();
  });
  it("사업자등록일·임대사업자등록일 미입력 차단", () => {
    expect(v8({ businessRegistrationDate988: "" })).toMatch(/^§98의8 적용: 사업자등록일/);
    expect(v8({ rentalRegistrationDate988: "" })).toMatch(/^§98의8 적용: 임대사업자등록일/);
  });
  it("종료 < 개시 · 계약 > 개시 · 종료 > 양도 차단, 종료 = 양도일은 통과", () => {
    expect(v8({ rentalEndDate988: "2015-11-30" })).toMatch(/임대종료일이 임대개시일보다 앞섭니다/);
    expect(v8({ rentalContractDate988: "2015-12-02" })).toMatch(/임대계약 체결일이 임대개시일보다 늦습니다/);
    expect(v8({ rentalEndDate988: "2020-12-01" })).toMatch(/임대종료일이 양도일보다 늦습니다/);
    expect(v8({ rentalEndDate988: "2020-11-30" })).toBeNull();
  });
  it("상속 합산 소수·음수 차단, 정수·0 통과", () => {
    expect(v8({ inheritedRentalMonths988: "5.9" })).toMatch(/정수 개월/);
    expect(v8({ inheritedRentalMonths988: "-1" })).toMatch(/정수 개월/);
    expect(v8({ inheritedRentalMonths988: "6" })).toBeNull();
    expect(v8({ inheritedRentalMonths988: "0" })).toBeNull();
  });
  it("공실 행 미완성·역전 차단", () => {
    expect(v8({ rentalVacancyPeriods988: [{ startDate: "2018-03-15", endDate: "" }] })).toMatch(/공실 구간의 시작일·종료일을 모두/);
    expect(v8({ rentalVacancyPeriods988: [{ startDate: "2018-03-20", endDate: "2018-03-15" }] })).toMatch(/공실 구간의 종료일이 시작일보다/);
    expect(v8({ rentalVacancyPeriods988: [{ startDate: "2018-03-15", endDate: "2018-03-20" }] })).toBeNull();
  });
  it("등록 기한 위반(2016.1.1. 이후)은 ⑧이 막지 않는다 — 엔진 사유로 결과 카드에 보인다", () => {
    expect(v8({ rentalRegistrationDate988: "2016-01-01" })).toBeNull();
  });
});

// ─────────── ④ 변환 ───────────
describe("Y-8 ④ — 폼 → API 변환", () => {
  it("등록일 2건·완성된 공실 행만·상속 개월 정수(절사 없음)를 싣는다", () => {
    const f = form988({
      rentalVacancyPeriods988: [{ startDate: "2018-03-15", endDate: "2018-03-20" }, { startDate: "2019-01-01", endDate: "" }],
      inheritedRentalMonths988: "6",
    });
    const [r] = toEngineReductions(f.assets[0].reductions as AssetReductionForm[], "purchase") as Array<Record<string, unknown>>;
    expect(r.businessRegistrationDate988).toBe("2015-12-01");
    expect(r.rentalRegistrationDate988).toBe("2015-12-01");
    expect(r.rentalVacancyPeriods988).toEqual([{ startDate: "2018-03-15", endDate: "2018-03-20" }]);
    expect(r.inheritedRentalMonths988).toBe(6);
  });
  it("상속 5.9는 5로 절사되지 않는다 (⑧이 막으므로 도달분만 확인)", () => {
    const f = form988({ inheritedRentalMonths988: "5.9" });
    const [r] = toEngineReductions(f.assets[0].reductions as AssetReductionForm[], "purchase") as Array<Record<string, unknown>>;
    expect(r.inheritedRentalMonths988).toBe(5.9);
  });
});

// ─────────── route: ⑧→④→⑫→⑭→엔진 ───────────
describe("Y-9 route anchor — POST /api/calc/transfer (⑫ Zod → ⑭ 매퍼 → 엔진)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(async (_t, d) => loadFallbackTransferRates(d as Date) as never);
  });

  const post = async (reductions: object[]) => {
    const body = {
      propertyType: "housing",
      transferPrice: 900_000_000,
      transferDate: "2020-11-30",
      acquisitionPrice: 550_000_000,
      acquisitionDate: "2015-07-01",
      acquisitionCause: "purchase",
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: false,
      annualBasicDeductionUsed: 0,
      reductions,
    };
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    );
    const json = (await res.json()) as { data?: { result: { totalTax: number; unsold988Detail?: { isEligible: boolean; rentalMonths: number; rentalPeriodEcho?: { basisDate: string; rentalMonths: number; vacancyMonths: number } } } } };
    return { status: res.status, json };
  };
  const wire = {
    type: "unsold_98_8",
    contractDate988: "2015-06-01",
    acquisitionPrice988: 550_000_000,
    exclusiveAreaSqm988: 84.5,
    rentalContractDate988: "2015-11-20",
    rentalStartDate988: "2015-12-01",
    businessRegistrationDate988: "2015-12-01",
    rentalRegistrationDate988: "2015-12-01",
    isUnsoldAfterCompletion988: true,
    isFirstContract988: true,
    isNotRecontract988: true,
    standardPriceAtAcquisition988: 200_000_000,
    standardPriceAt5Years988: 300_000_000,
    standardPriceAtTransfer988: 400_000_000,
  };

  it("60개월 적격 — 등록일이 ⑫에서 stripping 없이 엔진에 도달해 기산일 echo가 나온다", async () => {
    const r = await post([wire]);
    expect(r.status).toBe(200);
    const d = r.json.data!.result.unsold988Detail!;
    expect(d.isEligible).toBe(true);
    expect(d.rentalMonths).toBe(60);
    expect(d.rentalPeriodEcho).toMatchObject({ basisDate: "2015-12-01", rentalMonths: 60, vacancyMonths: 0 });
  });

  it("공실 구간(⑫ vacancyPeriodSchema → ⑭ toDate)이 엔진에 도달 — 59개월 불적격 · 감면 없음과 같은 총세액", async () => {
    const vac = await post([{ ...wire, rentalVacancyPeriods988: [{ startDate: "2018-03-15", endDate: "2018-03-20" }] }]);
    expect(vac.status).toBe(200);
    const d = vac.json.data!.result.unsold988Detail!;
    expect(d.isEligible).toBe(false);
    expect(d.rentalMonths).toBe(59);
    const ok = await post([wire]);
    expect(vac.json.data!.result.totalTax).toBeGreaterThan(ok.json.data!.result.totalTax);
  });

  it("기산일: 사업자등록 2015-12-20(개시 2015-12-01) → 양도 2020-11-30에는 59개월 불적격", async () => {
    const r = await post([{ ...wire, businessRegistrationDate988: "2015-12-20" }]);
    const d = r.json.data!.result.unsold988Detail!;
    expect(d.isEligible).toBe(false);
    expect(d.rentalPeriodEcho?.basisDate).toBe("2015-12-20");
  });
});
