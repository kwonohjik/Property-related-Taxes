/**
 * anchor(화면 경로 ⑧→④→⑫⑭→엔진 · 판정 메뉴) — §155⑳ 세대 구성 × §155④⑤ 합가, 임대주택이 일시적 2주택 신규 주택인 경우.
 *
 * 계획서 `docs/00-pm/rental-155-20-merge-temp-composition.plan.md` PR-2 · 사용자 결정 2026-10-25 Q-2 (a)(④⑤ 둘 다).
 * 근거: 상속증여세과-20(2013.3.28. — 2012 혼인 · 2013 임대 취득·등록 → 「장기임대주택 보유시에도 혼인으로 인한 2주택 비과세 특례
 *   규정이 적용되는 것임」) · 부동산거래관리과-244(혼인 전 임대) · 부동산거래관리과-44(④ · 「세대합가 후에 취득한 주택」 = 상대 쪽 주택).
 *
 * 결함: 구성 판정(`judgeOtherHouse`)이 명부 도출 일시적 2주택(신규 주택 = 임대 행)을 받고, 그 행이 「그 밖의 주택」이 아니라
 *   성립으로 쓰지 않은 뒤 §155④⑤를 다시 보지 않았다 → 「일시적 2주택·상속주택 특례로 제외되지 않습니다」 불성립. 같은 사실에서
 *   임대 행만 2007 취득이면 ⑳ 성립이었다(임대주택 취득일로 ⑳이 갈림). 세액은 판정 엔진의 ①+⑤ 중첩 비과세와 같아 바뀌지 않는다
 *   (계획서 §1.6 계산기 144조합 · V-2 중과 기간 양도일 재측정).
 *
 * 시료: 거주주택 2008-01-01 취득 · 거주 2019-06~2024-06 · 2024-06-01 양도 · 비조정 · 그 밖의 주택 h3 2015-01-01 ·
 *   임대 행 r1(「장기임대」 · 2023-02-01 등록).
 *
 * | # | 입력 | 기대 |
 * |---|---|---|
 * | MT-1 | 혼인 2022 → 임대 2023 · A 10억 | 0 · 세대 구성 불성립 고지 없음 |
 * | MT-2 | 같음 · A 15억 | 14,124,000 · ⑳ 경로(임대 행 2007 취득 짝 MT-2b와 같음) |
 * | MT-3 | 같음 · B 10억·15억 | 50,171,000 · 141,966,000 · §161(§154⑩ 대체 아님) |
 * | MT-4 | 임대 2023-01(양도자 쪽) → 혼인 2023-06 · A | 0 · 고지 없음 |
 * | MT-5 | 동거봉양 2022 → 임대 2023 · A | 0 · 고지 없음(§155④) |
 * | MT-6 (짝) | 그 밖의 주택 양도자 쪽 | 124,366,000 · 불성립 |
 * | MT-7 (짝) | 그 밖의 주택 혼인 후 취득(44) | 124,366,000 · 불성립 |
 * | MT-8 (짝) | 소유 쪽 미입력(⑧ 차단 · API 직접) | 124,366,000 · 「확인 필요」 |
 * | MT-9 | 판정 메뉴 · 혼인 2022 → 임대 2023 · A | ⑳ 카드 「요건 충족」 · 비과세 |
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
    shouldBypassRateLimit: vi.fn().mockReturnValue(true),
  };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

const NC = { region: "non_capital", regionCode: "4682025021", officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" };
const unit = () => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2023-02-01",
  rentalRegistrationDate: "2023-02-01",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct" as const,
  rentalMonths: "16",
  requirementsConfirmed: true,
});
const A = () => ({ applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none" });
const B = () => ({
  ...A(),
  scenario: "B",
  priorResidenceTransferDate: "2020-01-01",
  postRegistrationResidenceMonths: "30",
  standardPriceAtAcquisitionForPhrp: "100,000,000",
  standardPriceAtPriorTransfer: "200,000,000",
  standardPriceAtTransferForPhrp: "300,000,000",
});
type Origin = "seller_side" | "counterpart_side" | undefined;
const calc = (o: {
  rhe?: object;
  price?: string;
  merge?: { marriageDate: string } | { parentalCareMergeDate: string; parentalCareParentAge: "over_60" };
  rentalAcq?: string;
  rentalOrigin?: Origin;
  otherAcq?: string;
  otherOrigin?: Origin;
}) =>
  runCalc(
    redevAptForm({
      kind: "housing",
      price: o.price ?? "1000000000",
      count: "3",
      houses: [
        houseRow("r1", o.rentalAcq ?? "2023-01-01", { ...NC, isLongTermRental: true, ...(o.rentalOrigin ? { mergeOrigin: o.rentalOrigin } : {}) } as never),
        houseRow("h3", o.otherAcq ?? "2015-01-01", { ...NC, ...(o.otherOrigin ? { mergeOrigin: o.otherOrigin } : {}) } as never),
      ],
      assetOver: { rentalHousingException: o.rhe ?? A() },
      formOver: { ...(o.merge ?? { marriageDate: "2022-01-01" }), isFirstTransferredInMerge: true } as never,
    }),
  );
const M1 = { otherOrigin: "counterpart_side" as const };

const COMPOSITION = "세대 구성 요건";
const w = (r: Awaited<ReturnType<typeof calc>>) => (r.result.warnings ?? []) as string[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const steps = (r: Awaited<ReturnType<typeof calc>>) => ((r.result.steps ?? []) as any[]).map((s) => `${s.label} :: ${s.formula}`);
const noCompositionNotice = (r: Awaited<ReturnType<typeof calc>>) => {
  expect(w(r).filter((x) => x.includes(COMPOSITION))).toEqual([]);
  expect(steps(r).some((s) => s.includes("일시적 2주택·상속주택 특례로 제외되지 않습니다"))).toBe(false);
};

describe("§155⑳ 세대 구성 × 합가 — 임대 행이 일시적 2주택 신규 주택이어도 그 밖의 주택은 §155④⑤로 빠진다", () => {
  it("MT-1 ★ 혼인 2022 → 임대 2023 · A 10억 → 0 · 세대 구성 불성립 고지 없음(종전 「일시적 2주택·상속주택 특례로 제외되지 않습니다」)", async () => {
    const r = await calc(M1);
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    noCompositionNotice(r);
  });

  it("MT-2 ★ A 15억 → 14,124,000 · ⑳ 경로 = 임대 행 2007 취득 짝(MT-2b)", async () => {
    const r = await calc({ ...M1, price: "1500000000" });
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(14_124_000);
    expect(r.result.rentalHousingExceptionDetail?.applied).toBe(true);
    noCompositionNotice(r);
    // MT-2b 짝 — 임대 행만 2007 취득(일시적 2주택 신규 주택 아님)이면 종전에도 ⑳ 성립이었다.
    const pair = await calc({ ...M1, price: "1500000000", rentalAcq: "2007-01-01", rentalOrigin: "seller_side" });
    expect(pair.issues).toEqual([]);
    expect(pair.result.totalTax).toBe(14_124_000);
    expect(pair.result.rentalHousingExceptionDetail?.applied).toBe(true);
  });

  it.each([
    ["1000000000", 50_171_000],
    ["1500000000", 141_966_000],
  ])("MT-3 B %s → %i · §155⑳ + §161 경로(영 §154⑩ 대체 아님)", async (price, tax) => {
    const r = await calc({ ...M1, rhe: B(), price });
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(tax);
    expect(steps(r).some((s) => s.startsWith("직전거주주택보유주택 — 영 §154⑩ 안분"))).toBe(false);
    expect(steps(r).some((s) => s.startsWith("장기임대주택 보유자 거주주택 비과세 특례 :: §155⑳ + §161"))).toBe(true);
    noCompositionNotice(r);
  });

  it("MT-4 임대 2023-01(양도자 쪽) → 혼인 2023-06 · A → 0 · 고지 없음(부동산거래관리과-244형)", async () => {
    const r = await calc({ ...M1, merge: { marriageDate: "2023-06-01" }, rentalOrigin: "seller_side" });
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(0);
    noCompositionNotice(r);
  });

  it("MT-5 동거봉양 합가 2022 → 임대 2023 · A → 0 · 고지 없음(§155④ · 부동산거래관리과-44)", async () => {
    const r = await calc({ ...M1, merge: { parentalCareMergeDate: "2022-01-01", parentalCareParentAge: "over_60" } });
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(0);
    noCompositionNotice(r);
  });

  it("MT-6 (짝) 그 밖의 주택이 양도자 쪽 → 각자 1주택 혼인 아님 → 124,366,000 · 불성립 불변", async () => {
    const r = await calc({ otherOrigin: "seller_side" });
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(124_366_000);
    expect(r.result.rentalHousingExceptionDetail?.applied).not.toBe(true);
  });

  it("MT-7 (짝) 그 밖의 주택을 혼인 후 취득(부동산거래관리과-44 「세대합가 후에 취득한 주택」) → 124,366,000 · 불성립 불변", async () => {
    const r = await calc({ ...M1, otherAcq: "2023-06-01" });
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(124_366_000);
    expect(r.result.rentalHousingExceptionDetail?.applied).not.toBe(true);
  });

  it("MT-8 (짝) 소유 쪽 미입력 — ⑧ 차단 · API 직접이면 124,366,000 + 「확인 필요」 불변", async () => {
    const r = await calc({});
    expect(r.issues.some((i) => i.message.includes("혼인 전 보유자를 고르세요"))).toBe(true);
    expect(r.result.totalTax).toBe(124_366_000);
    expect(steps(r).some((s) => s.startsWith("장기임대주택 거주주택 비과세 특례 — 확인 필요"))).toBe(true);
  });
});

describe("판정 메뉴 — 같은 사실의 ⑳ 카드", () => {
  const menuCase = () =>
    ({
      id: "mt-menu",
      docNo: "",
      docDate: "",
      basis: "era",
      today: "2024-06-02",
      summary: "",
      form: {
        isOneHousehold: true,
        transferDate: "2024-06-01",
        contractTotalPrice: "1000000000",
        marriageDate: "2022-01-01",
        isFirstTransferredInMerge: true,
        houses: [
          { id: "r1", region: "capital", acquisitionDate: "2023-01-01", officialPrice: "250000000", isLongTermRental: true, isApartment: false, acquisitionOrigin: "general" },
          { id: "h3", region: "capital", acquisitionDate: "2015-01-01", officialPrice: "300000000", isApartment: false, acquisitionOrigin: "general", mergeOrigin: "counterpart_side" },
        ],
        asset: {
          assetKind: "housing",
          acquisitionDate: "2008-01-01",
          fixedAcquisitionPrice: "500000000",
          addressJibun: "서울특별시 종로구 청운동 1",
          residenceInputMode: "direct",
          residencePeriodMonthsAsset: "60",
          rentalHousingException: {
            applyException: true,
            scenario: "A",
            priorRentalExemptionHistory: "none",
            rentalUnits: [
              {
                unitId: "b",
                businessRegistrationDate: "2023-02-01",
                rentalRegistrationDate: "2023-02-01",
                rentalCategory: "long_general",
                rentalAcquisitionType: "purchase",
                isApartment: false,
                region: "seoul-metro",
                standardPriceAtRentalStart: "250000000",
                acquisitionOfficialPrice: "250000000",
                isNationalSizeHousing: true,
                hasMinimum2Units: true,
                rentalMonths: "16",
                requirementsConfirmed: true,
                mergeOrigin: "seller_side",
              },
            ],
          },
        },
      },
    }) as never;

  it("MT-9 ★ 혼인 2022 → 임대 2023 · A → ⑳ 「요건 충족」(종전 「요건 미충족」) · 비과세", async () => {
    const v = await judgeAndRender(menuCase());
    expect(v.status).toBe(200);
    expect(v.issues.filter((x: string) => x.startsWith("error"))).toEqual([]);
    expect(v.data.rentalHousingException.passed).toBe(true);
    expect(v.isExempt).toBe(true);
    expect(v.text).not.toContain("요건 미충족 — 특례가 적용되지 않습니다");
  });
});
