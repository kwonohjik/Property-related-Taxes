/**
 * anchor — 1세대1주택 전액 비과세 대상인데 부수토지 일부가 비과세에서 빠져 정상 경로로 계산된 결과(`isExemptCore`)에도 비과세 사유 카드가 뜬다.
 *
 * 종전(2026-11-23 실측): G-2(배율 초과 부수토지)·G-3(주택 취득 뒤 취득한 토지의 보유요건 미달)·PHD(§164⑦ 3시점 환산 분리) G-2는
 *   `isExempt: false`·`isPartialExempt: false`라 전액 비과세 카드(`isExempt`)와 부분 비과세 근거 카드(`isPartialExempt`)가 모두 그려지지 않았다.
 *   G-2 결과 화면에는 「1세대1주택」이 한 번도 나오지 않았고, G-3은 토지 제외 문장(「… 1세대1주택 비과세 대상이 아님」) 한 곳뿐이었다 —
 *   건물분이 왜 0원인지, 판정이 어느 특례로 성립했는지(`exemptReason`), §89② 예외 근거(`article89ExceptionApplied`)가 화면에서 사라졌다.
 *
 * `isExemptCore`만으로 카드를 띄우면 안 된다 — §155⑳ 시나리오 B 미적용(`prhpUnappliedExemptionNotice` 「일반 과세 경로로 계산되었습니다」)도
 *   같은 플래그로 정상 경로를 타지만 부수토지 제외 없이 전액 과세된다. 그래서 엔진이 «부수토지 제외가 실제로 적용됐다»를 echo
 *   (`housingLandExemptExclusion`)로 싣고 카드는 그것만 본다.
 *
 * | # | 경로 | 사안 | 주장 |
 * |---|---|---|---|
 * | E-1 | G-2 | 별개취득 · 정착 50㎡ × 3배 = 150㎡ < 토지 400㎡ · 1세대1주택 6억 | echo excessLand · 카드에 사유·배율 초과·§154 ⑦ |
 * | E-2 | G-3 | 2010 양도 · 토지 2년 6개월(3년 미달) | echo laterLand · 카드에 보유요건·§154① |
 * | E-3 | PHD G-2 | #17-5 시료(2000 취득 · §164⑦ 환산 · 초과 53㎡) | echo excessLand · 카드 |
 * | E-4 | 짝 — 과세 | E-1을 2주택으로 | echo 없음 · 카드 없음 |
 * | E-5 | 짝 — 전액 비과세 | E-2에서 토지 3년 1개월 | 조기 반환 `isExempt` · echo 없음 · 카드 없음 |
 * | E-6 | 짝 — PRHP B 모양 | `isExemptCore`만 있고 echo 없음 | 카드 없음 |
 * | E-7 | §89② 예외 | E-1 결과 + `article89ExceptionApplied` | 카드 안에 근거 줄 |
 * | E-8 | 다건(연간 합산) | 같은 날 취득 · 기준시가 5칸 · 400㎡(초과 100㎡) · 10억 — 폼 → ④ → 다건 route | 자산 내역 echo · 펼친 자산 카드에 카드 |
 * | E-9 | 함께 양도 | 주 자산(한도 이내) + 동반 주택 500㎡(초과 200㎡) — 폼 → ④ → route | 동반 주택 내역 echo · 자산 카드(PropertyCard)에 카드 |
 * | E-10 | 토지만 본인 × G-2 | E-1 + `selfOwns: "land_only"` | echo landOnly · 「건물분」 없이 배율 이내 토지분만 비과세 |
 * | E-11 | 토지만 본인 × G-3 | E-2 + `selfOwns: "land_only"` | 비과세로 남는 몫 없음 → echo·카드 없음 |
 * | E-12 | 짝 — §155⑳ B 미적용(실제) | 1세대1주택 8억 · B 선언 · 임대 1호 · §161 기준시가 없음 | `isExemptCore` · 분리 결과 없음 · 전액 과세 → echo·카드 없음 |
 *
 * PHD는 다건 route가 받지 않는다(§164⑦ 3시점 입력 400) — 다건 시료는 기준시가 5칸 경로다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));
import { calculateTransferTax, type TransferTaxInput, type TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "../tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { PropertyCard } from "@/components/calc/results/BundledAllocationSubCards";
import { runMulti } from "./_helpers/single-multi-route-parity";
import { runCalc } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

afterEach(() => cleanup());

const R = makeMockRates();
vi.mocked(preloadTaxRates).mockResolvedValue(R as never);
const d = (s: string) => new Date(s);
const CARD = '[data-testid="calc-land-exclusion-exempt-basis"]';
const LINE = '[data-testid="calc-89-2-exception-basis"]';
const split = {
  isSeparateAcquisition: true,
  selfOwns: "both",
  landTransferPrice: 350_000_000,
  buildingTransferPrice: 250_000_000,
  landAcquisitionPrice: 100_000_000,
  buildingAcquisitionPrice: 100_000_000,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landStandardPriceAtTransfer: 350_000_000,
  buildingStandardPriceAtTransfer: 250_000_000,
};
const house = (over: Record<string, unknown>) =>
  baseTransferInput({
    transferPrice: 600_000_000,
    acquisitionPrice: 200_000_000,
    residencePeriodMonths: 60,
    householdHousingCount: 1,
    ...split,
    ...over,
  } as Partial<TransferTaxInput>);
const g2 = (over: Record<string, unknown> = {}) =>
  house({
    acquisitionDate: d("2015-01-01"),
    landAcquisitionDate: d("2015-01-01"),
    transferDate: d("2024-06-15"),
    appurtenantLandZone: "metropolitan_residential",
    buildingFootprintArea: 50,
    acquisitionArea: 400,
    ...over,
  });
const g3 = (landAcquisitionDate: string) =>
  house({ acquisitionDate: d("2004-01-01"), transferDate: d("2010-06-15"), landAcquisitionDate: d(landAcquisitionDate) });
const phd = () =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: PHD_TRANSFER_PRICE,
    transferDate: d("2023-02-16"),
    acquisitionDate: d("2000-03-01"),
    landAcquisitionDate: d("2000-03-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 120,
    landSplitMode: "apportioned",
    preHousingDisclosure: PHD_INPUT,
    buildingFootprintArea: 53,
    acquisitionArea: 212,
    appurtenantLandZone: "metropolitan_residential",
  } as never);

function view(r: TransferTaxResult) {
  const c = render(<TransferTaxResultView result={r} formData={undefined as never} onReset={() => {}} onBack={() => {}} />).container;
  const card = c.querySelector(CARD);
  return { card, text: card?.textContent ?? null };
}

describe("isExemptCore — 부수토지 비과세 제외 결과의 비과세 사유 카드", () => {
  it("E-1 G-2 배율 초과 → echo excessLand · 카드에 사유·배율 초과·§154 ⑦", () => {
    const r = calculateTransferTax(g2(), R);
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
    expect(r.isExemptCore).toBe(true);
    expect(r.housingLandExemptExclusion).toEqual({ excessLand: true, laterLand: false });
    const { text } = view(r);
    expect(text).toContain("1세대1주택 특례 적용 — 1세대1주택 비과세");
    expect(text).toContain("건물분과 배율 이내 부수토지분은 비과세");
    expect(text).toContain("배율을 넘는 부수토지분");
    expect(text).toContain("소득세법 시행령 §154 ⑦");
    expect(text).not.toContain("보유기간");
  });

  it("E-2 G-3 나중 취득 토지 보유 미달 → echo laterLand · 카드에 보유요건·§154①", () => {
    const r = calculateTransferTax(g3("2007-12-15"), R);
    expect(r.isExemptCore).toBe(true);
    expect(r.housingLandExemptExclusion).toEqual({ excessLand: false, laterLand: true });
    const { text } = view(r);
    expect(text).toContain("1세대1주택 특례 적용 — 1세대1주택 비과세");
    expect(text).toContain("건물분은 비과세");
    expect(text).not.toContain("배율 이내");
    expect(text).toContain("주택을 취득한 뒤 취득해 보유기간 요건을 채우지 못한 부수토지분");
    expect(text).toContain("소득세법 시행령 §154①");
  });

  it("E-3 PHD(§164⑦) 분리 G-2 → echo excessLand · 카드", () => {
    const r = calculateTransferTax(phd(), R);
    expect(r.isExemptCore).toBe(true);
    expect(r.splitDetail?.nonBusinessLandPart?.excessArea).toBe(53);
    expect(r.housingLandExemptExclusion).toEqual({ excessLand: true, laterLand: false });
    expect(view(r).text).toContain("배율을 넘는 부수토지분");
  });

  it("E-4 짝 — 2주택(과세)은 부수토지 제외 단계가 있어도 echo·카드 없음", () => {
    const r = calculateTransferTax(g2({ householdHousingCount: 2 }), R);
    expect(r.isExempt).toBe(false);
    expect(r.isExemptCore).toBeUndefined();
    expect(r.steps.map((s) => s.label)).toContain("부수토지 비과세 제외");
    expect(r.housingLandExemptExclusion).toBeUndefined();
    expect(view(r).card).toBeNull();
  });

  it("E-5 짝 — 토지 3년 1개월(충족)은 조기 반환 전액 비과세 · echo·카드 없음", () => {
    const r = calculateTransferTax(g3("2007-05-15"), R);
    expect(r.isExempt).toBe(true);
    expect(r.housingLandExemptExclusion).toBeUndefined();
    expect(view(r).card).toBeNull();
  });

  it("E-6 짝 — isExemptCore만 있고 echo가 없으면(§155⑳ B 미적용 모양) 카드 없음", () => {
    const r = calculateTransferTax(g2(), R);
    const { housingLandExemptExclusion: _drop, ...rest } = r;
    void _drop;
    expect(view(rest as TransferTaxResult).card).toBeNull();
  });

  it("E-7 §89② 예외 echo가 있으면 카드 안에 근거 줄", () => {
    const r = calculateTransferTax(g2(), R);
    const applied = { label: "주택과 조합원입주권·분양권을 함께 보유한 세대의 §89② 예외", legalBasis: ["소득세법 시행령 §156의2 ③"] };
    const { card } = view({ ...r, article89ExceptionApplied: applied });
    expect(card?.querySelector(LINE)?.textContent).toContain("§156의2");
  });
});

/** 같은 날 취득 매매 주택 · 기준시가 5칸 — 정착 100㎡ × 3배 = 300㎡ 한도. */
const FORM_HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
};
const formOf = (assets: Record<string, unknown>[], contractTotalPrice: string) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: "2026-02-16",
    contractTotalPrice,
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...FORM_HOUSE, addressJibun: `서울 테스트동 ${i + 1}`, ...a })),
  }) as never;

describe("isExemptCore — 토지만 본인 소유(건물분은 본인 신고분이 아님)", () => {
  it("E-10 토지만 본인 × G-2 → echo landOnly · 카드는 배율 이내 부수토지분만 비과세라고 쓴다(「건물분」 없음)", () => {
    const r = calculateTransferTax(g2({ selfOwns: "land_only" }), R);
    expect(r.isExemptCore).toBe(true);
    expect(r.housingLandExemptExclusion).toEqual({ excessLand: true, laterLand: false, landOnly: true });
    const { text } = view(r);
    expect(text).toContain("배율 이내 부수토지분은 비과세");
    expect(text).not.toContain("건물분");
  });
  it("E-11 토지만 본인 × G-3 → 비과세로 남는 몫이 없어 echo·카드 없음", () => {
    const r = calculateTransferTax({ ...g3("2007-12-15"), selfOwns: "land_only" }, R);
    expect(r.isExemptCore).toBe(true);
    expect(r.housingLandExemptExclusion).toBeUndefined();
    expect(view(r).card).toBeNull();
  });
});

describe("isExemptCore — §155⑳ 시나리오 B 미적용(부수토지 제외 없이 전액 과세)", () => {
  it("E-12 B 선언 · 임대 1호 · §161 기준시가 없음 → isExemptCore인데 분리 결과 없이 과세 — echo·카드 없음", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 800_000_000,
        transferDate: d("2023-03-03"),
        acquisitionPrice: 400_000_000,
        acquisitionDate: d("2009-08-12"),
        expenses: 0,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 60,
        rentalHousingException: {
          applyException: true,
          scenario: "B",
          priorResidenceTransferDate: d("2016-08-25"),
          postRegistrationResidenceMonths: 60,
          rentalUnits: [
            {
              businessRegistrationDate: d("2016-06-01"),
              rentalRegistrationDate: d("2016-06-01"),
              rentalCategory: "long_general",
              rentalAcquisitionType: "purchase",
              isApartment: false,
              region: "seoul-metro",
              isExcluded918Rule: false,
              standardPriceAtRentalStart: 300_000_000,
              hasMinimum2Units: false,
              rentalMonths: 96,
              rentalAutoTermination: false,
              requirementsConfirmed: true,
            },
          ],
        },
      } as Partial<TransferTaxInput>),
      R,
    );
    expect(r.isExemptCore).toBe(true);
    expect(r.splitDetail).toBeUndefined();
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.housingLandExemptExclusion).toBeUndefined();
    expect(view(r).card).toBeNull();
  });
});

describe("isExemptCore — 다건·함께 양도 자산 카드", () => {
  it("E-8 다건 — 자산 내역 echo · 펼친 자산 카드에 비과세 사유 카드", async () => {
    const form = formOf(
      [
        {
          fixedAcquisitionPrice: "500000000",
          actualSalePrice: "1000000000",
          acquisitionArea: "400",
          transferArea: "400",
          standardPriceAtAcq: "500000000",
          standardPricePerSqmAtAcq: "600000",
          buildingStandardPriceAtAcq: "200000000",
          standardPricePerSqmAtTransfer: "800000",
          buildingStandardPriceAtTransfer: "400000000",
        },
      ],
      "1000000000",
    );
    const m = await runMulti([form]);
    expect(m.status).toBe(200);
    const b = m.props[0] as unknown as PerPropertyBreakdown;
    expect(b.isExempt).toBe(false);
    expect(b.isPartialExempt).toBe(false);
    expect(b.housingLandExemptExclusion).toEqual({ excessLand: true, laterLand: false });
    const { container } = render(<PropertyBreakdownAccordion breakdown={b} property={{ propertyId: "p1", form } as never} />);
    fireEvent.click(container.querySelector(".cursor-pointer")!);
    expect(container.querySelector(CARD)?.textContent).toContain("1세대1주택 특례 적용 — 1세대1주택 비과세");
  }, 60_000);

  it("E-9 함께 양도 — 동반 주택 내역 echo · 자산 카드에 비과세 사유 카드 · 한도 이내 주 자산은 전액 비과세(카드 없음)", async () => {
    const base = { fixedAcquisitionPrice: "300000000", actualSalePrice: "500000000", standardPriceAtTransfer: "500000000" };
    const r = await runCalc(
      formOf(
        [
          { ...base, acquisitionArea: "250", transferArea: "250" },
          {
            ...base,
            acquisitionArea: "500",
            transferArea: "500",
            standardPriceAtAcq: "300000000",
            standardPricePerSqmAtAcq: "400000",
            buildingStandardPriceAtAcq: "150000000",
            standardPricePerSqmAtTransfer: "800000",
            buildingStandardPriceAtTransfer: "400000000",
          },
        ],
        "1000000000",
      ),
    );
    expect(r.status).toBe(200);
    const props = (r.json?.data?.aggregated?.properties ?? []) as PerPropertyBreakdown[];
    expect(props[0].isExempt).toBe(true);
    expect(props[0].housingLandExemptExclusion).toBeUndefined();
    expect(props[1].isExempt).toBe(false);
    expect(props[1].housingLandExemptExclusion).toEqual({ excessLand: true, laterLand: false });
    const card = render(<PropertyCard breakdown={props[1]} />).container.querySelector(CARD);
    expect(card?.textContent).toContain("배율을 넘는 부수토지분");
    cleanup();
    expect(render(<PropertyCard breakdown={props[0]} />).container.querySelector(CARD)).toBeNull();
  }, 60_000);
});
