/**
 * E-14a·b·c — 1세대1주택 **의제**에 따른 다주택 중과 배제 호 (계획서 `docs/00-pm/one-house-exemption-fix.plan.md`
 * §9.3 E-14a~c). route 관측은 `__tests__/api/transfer.route.surcharge-deemed-clauses-e14abc.anchor.test.ts`.
 *
 * 네 호가 같은 꼬리 문언(「…에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로 보거나 1세대 1주택으로 보아
 * 제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」 — 소득세법 시행령 MST 286211)을 쓴다.
 * 갈리는 것은 세대의 주택·권리 수와 인용 특례 조문이다:
 *
 * | 세대 | 호 | 인용 | 적용 개시(양도일) |
 * |---|---|---|---|
 * | 주택 2 | §167의10①15호 | 제155조·조특법 | 2023.2.28. (대통령령 제33267호 부칙 제10조) |
 * | 주택 3+ | §167의3①13호 | 제155조·조특법 | 2021.2.17. (대통령령 제31442호 부칙 제2조②) |
 * | 주택 1 + 권리 1 | §167의11①13호 | 제156조의2·제156조의3·조특법 | 2023.2.28. (제33267호 부칙 제10조) |
 * | 주택 + 권리 합 3+ | §167의4③7호 | 제155조·제156조의2·제156조의3·조특법 | 2021.1.1. (제31442호 부칙 제10조②) |
 *
 * 해석(본문 실독 2026-09-28):
 * - 사전-2021-법령해석재산-1719(2021.12.22.) — 거주주택 + 장기임대주택 + 신규주택(§155①+⑳): 「…같은 영 제154조
 *   제1항의 요건을 모두 충족하는 경우에는 같은 영 제167조의3제1항제13호에 따라 중과세율을 적용하지 아니하며」.
 * - 서면-2023-부동산-0197(부동산납세과-1627, 2023.6.22.) — 조특법 §99의2 감면주택 + 상속주택 양도: 「…같은 영
 *   제167조의10제1항제15호에 따라 중과세율을 적용하지 아니하며 장기보유특별공제도 적용할 수 있는 것」.
 * - 서면-2021-법규재산-8497(2023.8.28.) — §155⑳ + §156의2④ 중첩: 「…같은 영 제167조의4제3항제7호에 따라
 *   중과세율을 적용하지 아니하는 것」.
 *
 * 세율은 프로덕션 fallback(`loadFallbackTransferRates`) · 양도 2026-09-18 · 강남 양도 주택 2015 취득(비조정 취득 →
 * 거주요건 없음) · 20억(12억 초과분이 과세되어 중과 여부가 세액에 드러난다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type {
  DeemedOneHouseBasis,
  HouseInfo,
  MultiHouseSurchargeInput,
} from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { determineSurchargeExclusion } from "@/lib/tax-engine/multi-house-surcharge-exclusion";
import { surcharge15HouseCount } from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { resolveSurchargeDeemedOneHouse } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { judgeRentalHousingEligibility } from "@/lib/tax-engine/transfer-tax-rental-housing-judge";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";
import { baseTransferInput, makeMockRatesWithHouseEngine, makeHouseInfo as makeHouseInfoMock } from "../_helpers/mock-rates";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const GN = "1168010100";
const h = (id: string, acq: string, extra: Partial<HouseInfo> = {}): HouseInfo => ({
  id,
  acquisitionDate: D(acq),
  officialPrice: 300_000_000,
  region: "capital",
  regionCode: GN,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});
const SELLING = h("selling", "2015-01-01");
const NEW = h("n", "2025-01-01");
const GENERAL = h("b", "2012-01-01");
/** §155② 상속주택(2019 상속 — 5년 경과라 §167의3①7호 아님, 중과 주택 수에는 산입) */
const INHERITED = h("i", "2019-06-01", { isInherited: true, inheritedDate: D("2019-06-01") });
const TEMP = { previousAcquisitionDate: D("2015-01-01"), newAcquisitionDate: D("2025-01-01") };

/** §155⑳ 장기임대주택 1호 — 가목(2018.3.1. 등록 · 영 §167의3①2호에도 해당) */
const RENTAL_UNIT = {
  businessRegistrationDate: D("2018-03-01"),
  rentalRegistrationDate: D("2018-03-01"),
  rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const,
  isApartment: false,
  region: "seoul-metro" as const,
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000,
  hasMinimum2Units: false,
  rentalMonths: 100,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};
const RENTAL_ROW = h("r1", "2016-01-01", {
  isLongTermRental: true,
  rentalType: "A",
  isRegisteredRental: true,
  rentalRegistrationDate: D("2018-03-01"),
  businessRegistrationDate: D("2018-03-01"),
  rentalStartDate: D("2018-03-01"),
  rentalStartOfficialPrice: 250_000_000,
  rentIncreaseUnder5Pct: true,
  isApartment: false,
});
/**
 * 2019.3.1. 등록 가목 — 영 §167의3①2호 가목 단서(「2018년 3월 31일까지 사업자등록등을 한 주택으로 한정」)로
 * **2호가 아니다**(그래서 §167의10①10호로 빠지지 않는다). §155⑳은 「가목 … 단서에서 정하는 기한의 제한은
 * 적용하지 않되, 2020년 7월 10일 이전에 … 등록 신청 … 을 한 주택으로 한정」이라 **거주주택 특례 대상**이다.
 */
const RENTAL_ROW_2019 = {
  ...RENTAL_ROW,
  rentalRegistrationDate: D("2019-03-01"),
  businessRegistrationDate: D("2019-03-01"),
  rentalStartDate: D("2019-03-01"),
};
const RENTAL_UNIT_2019 = {
  ...RENTAL_UNIT,
  businessRegistrationDate: D("2019-03-01"),
  rentalRegistrationDate: D("2019-03-01"),
  rentalMonths: 90,
};
const rhe = (unit: typeof RENTAL_UNIT) =>
  ({ applyException: true, scenario: "A", rentalUnits: [unit] }) as unknown as TransferTaxInput["rentalHousingException"];

const RIGHT_2025 = { id: "r", type: "redevelopment_right", acquisitionDate: D("2025-01-01"), region: "capital", regionCode: GN };

function input(x: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 2_000_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-09-18"),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 0,
    regionCode: GN,
    sellingHouseId: "selling",
    ...x,
  });
}
function calc(i: TransferTaxInput) {
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const mh = r.multiHouseSurchargeEvaluation;
  return {
    totalTax: r.totalTax,
    reasons: (mh?.exclusionReasons ?? []).map((e) => e.type).join(","),
    detail: mh?.exclusionReasons?.[0]?.detail ?? "",
    surchargeType: mh?.surchargeType,
    appliedRate: r.appliedRate,
  };
}

/** 2주택 일시적 2주택 15호 배제 대조군(E-14 E14-2와 같은 값) — 12억 초과분 기본세율·장특 표2 */
const DEEMED_EXCLUDED_20 = 204_355_800;

describe("E-14b 🔴 §167의3①13호 — 3주택 이상도 §155 의제면 배제 (종전: 합가 중첩만)", () => {
  it("B-0 [대조군] 2주택 일시적 2주택 → 15호 204,355,800", () => {
    const r = calc(input({ householdHousingCount: 2, houses: [SELLING, NEW], temporaryTwoHouse: TEMP }));
    expect(r.totalTax).toBe(DEEMED_EXCLUDED_20);
    expect(r.reasons).toBe("temporary_two_house");
  });

  it("B-1 §155①+② (일반 + 신규 + 상속 2019) — 중과 3주택·비과세 기준 2주택 → 13호 배제 (종전 497,046,000)", () => {
    const r = calc(input({ householdHousingCount: 3, houses: [SELLING, NEW, INHERITED], temporaryTwoHouse: TEMP }));
    expect(r).toMatchObject({ totalTax: DEEMED_EXCLUDED_20, reasons: "temporary_two_house", surchargeType: "none" });
    expect(r.detail).toContain(MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS);
    expect(r.detail).toContain("§155①");
  });

  it("B-1n 부정 짝 — §154① 미충족(2018 조정 취득 · 거주 0) → 3주택 중과 1,327,903,500 그대로", () => {
    const r = calc(
      input({
        acquisitionDate: D("2018-01-01"),
        wasRegulatedAtAcquisition: true,
        householdHousingCount: 3,
        houses: [h("selling", "2018-01-01"), NEW, INHERITED],
        temporaryTwoHouse: { previousAcquisitionDate: D("2018-01-01"), newAcquisitionDate: D("2025-01-01") },
      }),
    );
    expect(r).toMatchObject({ totalTax: 1_327_903_500, reasons: "", surchargeType: "multi_house_3plus" });
  });

  it("B-2 부정 짝(E-14 주택 수 확인) — 일반 3채 + 신규(비과세 기준 3주택) → §155① 불성립 → 3주택 중과 1,327,903,500", () => {
    const r = calc(input({ householdHousingCount: 3, houses: [SELLING, NEW, GENERAL], temporaryTwoHouse: TEMP }));
    expect(r).toMatchObject({ totalTax: 1_327_903_500, reasons: "", surchargeType: "multi_house_3plus" });
  });
});

describe("E-14c §155⑳ 거주주택 — 15호(구 14호)·13호 (종전: 2호 임대주택일 때만 10호로 배제)", () => {
  it("C-0 [대조군] 2호 임대주택(2018.3.1. 등록) + 거주주택 → 배제 102,086,600", () => {
    const r = calc(
      input({ householdHousingCount: 2, residencePeriodMonths: 48, houses: [SELLING, RENTAL_ROW], rentalHousingException: rhe(RENTAL_UNIT) }),
    );
    expect(r.totalTax).toBe(102_086_600);
  });

  it("C-1 2호가 아닌 §155⑳ 임대주택(2019 등록 가목) + 거주주택 → 15호 배제 102,086,600 (종전 167,360,600 — 2주택 중과)", () => {
    const r = calc(
      input({
        householdHousingCount: 2,
        residencePeriodMonths: 48,
        houses: [SELLING, RENTAL_ROW_2019],
        rentalHousingException: rhe(RENTAL_UNIT_2019),
      }),
    );
    expect(r.totalTax).toBe(102_086_600);
    expect(r.appliedRate).toBe(0.38);
  });

  it("C-2 §155①+⑳ (사전-2021-법령해석재산-1719) — 거주 + 임대 + 신규 → 13호 배제 102,086,600 (종전 199,997,600)", () => {
    const r = calc(
      input({
        householdHousingCount: 3,
        residencePeriodMonths: 48,
        houses: [SELLING, RENTAL_ROW, NEW],
        temporaryTwoHouse: TEMP,
        rentalHousingException: rhe(RENTAL_UNIT),
      }),
    );
    expect(r.totalTax).toBe(102_086_600);
    expect(r.appliedRate).toBe(0.38);
  });

  /**
   * E-14h 이후 — 이 세대는 §155⑳ 비과세도 서지 않는다(「장기임대주택 … 과 그 밖의 1주택」 초과 · 비과세와 중과 배제가
   * 같은 판정 `resolveRentalResidenceComposition`). 종전 값 199,997,600은 비과세 특례 적용 + 3주택 중과였다.
   * 중과 쪽 관측(13호 불성립)은 ① 요소 leaf로 옮겨 그대로 단언한다.
   */
  it("C-2n 부정 짝 — 거주 + 임대 + 다른 일반주택(§155① 불성립) → 13호 불성립 · §155⑳도 불성립 → 일반 과세", () => {
    const i = input({
      householdHousingCount: 3,
      residencePeriodMonths: 48,
      houses: [SELLING, RENTAL_ROW, GENERAL],
      rentalHousingException: rhe(RENTAL_UNIT),
    });
    expect(resolveSurchargeDeemedOneHouse(i, parseRatesFromMap(loadFallbackTransferRates(D("2026-09-18"))))).toBeUndefined();
    expect(calculateTransferTax(i, loadFallbackTransferRates(i.transferDate)).rentalHousingExceptionDetail).toBeUndefined();
    const r = calc(i);
    expect(r.totalTax).toBe(1_327_903_500);
    expect(r.appliedRate).toBe(0.75);
  });

  it("C-3 의제 판정 leaf — 시나리오 A만 연다(B 직전거주주택보유주택은 확인 필요 · 종전 동작)", () => {
    const parsed = parseRatesFromMap(loadFallbackTransferRates(D("2026-09-18")));
    const a = input({ householdHousingCount: 2, residencePeriodMonths: 48, houses: [SELLING, RENTAL_ROW_2019], rentalHousingException: rhe(RENTAL_UNIT_2019) });
    expect(resolveSurchargeDeemedOneHouse(a, parsed)).toBe("long_term_rental_residence");
    const b = {
      ...a,
      rentalHousingException: {
        ...a.rentalHousingException!,
        scenario: "B" as const,
        postRegistrationResidenceMonths: 48,
        priorResidenceTransferDate: D("2022-01-01"),
      },
    };
    // 전제: B도 요건 자체는 충족한다 — 아니면 「B라서 안 연다」를 관측하지 못한다(M10 뮤테이션으로 확인).
    expect(judgeRentalHousingEligibility(b)?.passed).toBe(true);
    expect(resolveSurchargeDeemedOneHouse(b, parsed)).toBeUndefined();
    // 요건 미충족(임대기간 부족·확인 없음) → 불성립
    const failed = { ...a, rentalHousingException: rhe({ ...RENTAL_UNIT_2019, requirementsConfirmed: false }) };
    expect(resolveSurchargeDeemedOneHouse(failed, parsed)).toBeUndefined();
    // 미등기 — STEP 2.5가 특례를 적용하지 않는다(§91①)
    expect(resolveSurchargeDeemedOneHouse({ ...a, isUnregistered: true }, parsed)).toBeUndefined();
  });
});

describe("E-14c §156의2·§156의3 — 15호가 아니라 §167의11①13호·§167의4③7호", () => {
  it("R-1 주택 1 + 조합원입주권 1(§156의2③ 3년 내) → §167의11①13호 배제 204,355,800 (종전 422,521,000)", () => {
    const r = calc(input({ householdHousingCount: 1, houses: [SELLING], presaleRights: [RIGHT_2025] as never }));
    expect(r).toMatchObject({ totalTax: DEEMED_EXCLUDED_20, reasons: "right_holding_one_house", surchargeType: "none" });
    expect(r.detail).toContain(MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS);
    expect(r.detail).toContain("§156의2 ③");
  });

  it("R-1n 부정 짝 — 권리 취득 2022(3년 경과 · §156의2④ 미선언 = 판정 보류) → 배제 없음 422,521,000 그대로", () => {
    const r = calc(
      input({
        householdHousingCount: 1,
        houses: [SELLING],
        presaleRights: [{ ...RIGHT_2025, acquisitionDate: D("2022-01-01") }] as never,
      }),
    );
    expect(r).toMatchObject({ totalTax: 422_521_000, reasons: "", surchargeType: "multi_house_2" });
  });

  it("R-2 서면-2021-법규재산-8497 구조 — 거주 + §155⑳ 임대(2호 아님) + 입주권(§156의2③) → §167의4③7호 배제 102,086,600 (종전 199,997,600)", () => {
    const r = calc(
      input({
        householdHousingCount: 1,
        residencePeriodMonths: 48,
        houses: [SELLING, RENTAL_ROW_2019],
        rentalHousingException: rhe(RENTAL_UNIT_2019),
        presaleRights: [RIGHT_2025] as never,
      }),
    );
    expect(r.totalTax).toBe(102_086_600);
    expect(r.appliedRate).toBe(0.38);
  });

  it("R-2n 부정 짝 — 주택 2 + 입주권 1(특수주택 선언 없음) → §89② 배제 확정 · 중과 배제에 기대지 않는다 1,327,903,500", () => {
    // E011(2026-10-06) — 종전에는 §89② 판정 보류라 비과세를 종전 동작(고가주택 부분 비과세)으로 두어 497,046,000이었다.
    //   특수주택 선언이 없는 2주택 + 1권리는 남는 예외가 없어 배제 확정 → §89①3호가 꺼져 전액 과세된다.
    //   이 짝이 지키는 성질(중과가 §155 의제에 기대지 않는다 — 3주택+ 중과 그대로)은 같다.
    const r = calc(
      input({
        householdHousingCount: 2,
        houses: [SELLING, NEW],
        temporaryTwoHouse: TEMP,
        presaleRights: [{ ...RIGHT_2025, acquisitionDate: D("2012-01-01") }] as never,
      }),
    );
    expect(r).toMatchObject({ totalTax: 1_327_903_500, reasons: "", surchargeType: "multi_house_3plus" });
  });

  it("R-3n 부정 짝(실흐름) — 주택 3 + 분양권 1 + 동거봉양 합가·일시적 2주택 중첩 → §89② 판정 보류라 의제 미주입 · 중과 497,046,000", () => {
    const r = calc(
      input({
        householdHousingCount: 3,
        residencePeriodMonths: 48,
        // §155④⑤ 합가 전 구성(2026-10-05 정책) — GENERAL은 합가 전 상대 쪽이 보유하던 주택이다.
        houses: [SELLING, { ...GENERAL, mergeOrigin: "counterpart_side" as const }, h("n", "2024-02-01")],
        parentalCareMerge: { mergeDate: D("2022-01-01") },
        isFirstTransferredInMerge: true,
        temporaryTwoHouse: { previousAcquisitionDate: D("2012-01-01"), newAcquisitionDate: D("2024-02-01") },
        presaleRights: [{ id: "p", type: "presale_right", acquisitionDate: D("2024-01-01"), region: "capital" }] as never,
      }),
    );
    expect(r).toMatchObject({ totalTax: 497_046_000, reasons: "", surchargeType: "multi_house_3plus" });
  });
});

/**
 * PR-3 「제외 행을 빼고 판정」(계획서 `merge-composition-unknown-unfavorable.plan.md` §3-4)의
 * 4개 소비처 중 **중과 15호·13호**(`resolveSurchargeDeemedOneHouseDetail`)가 같은 결론으로
 * 따라오는지 — 비과세 축(`one-house-merge-composition.anchor.test.ts` MC-6)과 같은 배선
 * (`ex.knownHouseExclusionHouseIds`)이다.
 */
describe("E-14/PR-3 중과 15호·13호도 §155②③ 제외 행을 빼고 합가 구성을 판정한다", () => {
  it("MERGE-PR3-1 상속주택 제외 후 (1,1) 성립 → 3주택(상속 산입)인데도 13호 배제", () => {
    const r = calc(
      input({
        householdHousingCount: 3,
        houses: [SELLING, INHERITED, { ...GENERAL, mergeOrigin: "counterpart_side" as const }],
        marriageMerge: { marriageDate: D("2020-01-01") },
        isFirstTransferredInMerge: true,
      }),
    );
    expect(r.reasons).toBe("marriage_merge");
    expect(r.surchargeType).toBe("none");
  });

  it("MERGE-PR3-1n 부정 짝 — GENERAL이 양도자 쪽이면(각자 1주택 아님) 상속주택을 빼도 불성립 · 중과 유지", () => {
    const r = calc(
      input({
        householdHousingCount: 3,
        houses: [SELLING, INHERITED, { ...GENERAL, mergeOrigin: "seller_side" as const }],
        marriageMerge: { marriageDate: D("2020-01-01") },
        isFirstTransferredInMerge: true,
      }),
    );
    expect(r.reasons).toBe("");
    expect(r.surchargeType).toBe("multi_house_3plus");
  });
});

describe("E-14a 조특법 감면주택 — 해석이 확인된 조문만 15호(부동산납세과-1627)", () => {
  const special = (article: string, acq: string) =>
    [{ article, houseAcquisitionDate: D(acq), houseContractDate: D(acq), requirementsConfirmed: true }] as never;

  it("A-1 §99의2 감면주택(명부에 감면 표시 없음) + 양도 주택 → 15호 배제 204,355,800 (종전 422,521,000)", () => {
    const r = calc(
      input({ householdHousingCount: 2, houses: [SELLING, h("s", "2013-06-01")], specialHouseExclusions: special("unsold_99_2", "2013-06-01") }),
    );
    expect(r).toMatchObject({ totalTax: DEEMED_EXCLUDED_20, reasons: "special_act_house_exclusion", surchargeType: "none" });
    expect(r.detail).toContain(MULTI_HOUSE.SPECIAL_ACT_2HOUSE_BASIS);
    expect(r.detail).toContain("조특법 §99의2②");
  });

  it("A-1n 조특법 **시행령** §98②·⑥(미분양 국민주택) → 확인 필요 · 종전 동작(2주택 중과 422,521,000)", () => {
    const r = calc(
      input({ householdHousingCount: 2, houses: [SELLING, h("s", "1996-06-01")], specialHouseExclusions: special("unsold_98", "1996-06-01") }),
    );
    expect(r).toMatchObject({ totalTax: 422_521_000, reasons: "", surchargeType: "multi_house_2" });
  });
});

describe("surcharge15HouseCount — 확인된 조특법 제외(E-14a)는 빼고 센다", () => {
  it.each([
    // [세대 주택 수, §155②③ 제외, 조특법 제외(전체), 그중 확인된 제외, 기대]
    [2, 0, 1, 1, 1], // 확인된 제외만으로 1 → 1 (15호 조특법 경로)
    [2, 0, 1, 0, 2], // 미확인(조특령 §98②·⑥ 등)만으로 1 → 종전 값(조특법 주택 산입)
    [3, 0, 2, 1, 2], // 미확인 1 + 확인 1 → 미확인 주택만 센다
    [3, 0, 1, 1, 2], // 확인된 제외 후에도 2 → 비과세 값
    [3, 1, 1, 1, 1], // 상속 + 확인된 조특법 → 1 (경로 게이트는 `resolveSurchargeDeemedOneHouse` 몫)
  ])("(%i, §155 %i, 조특법 %i 중 확인 %i) → %i", (raw, inh, sa, verified, expected) => {
    expect(surcharge15HouseCount(raw, inh, sa, verified)).toBe(expected);
  });
});

/** 호·연혁 leaf — `determineSurchargeExclusion`에 의제 근거를 직접 준다. */
describe("의제 배제 호의 적용 개시일 · 권리 수 축", () => {
  const ROW = { isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };
  const house = (id: string): HouseInfo => ({ ...ROW, id, acquisitionDate: D("2010-01-01"), officialPrice: 500_000_000, region: "capital" });
  const right = { id: "rt", type: "redevelopment_right" as const, acquisitionDate: D("2020-01-01"), region: "capital" as const };
  const reason = (
    deemed: DeemedOneHouseBasis,
    transferDate: string,
    houses: number,
    rights = 0,
    over: Partial<MultiHouseSurchargeInput> = {},
  ) => {
    const hs = Array.from({ length: houses }, (_, k) => house(k === 0 ? "selling" : `h${k}`));
    return determineSurchargeExclusion(
      {
        houses: hs,
        sellingHouseId: "selling",
        transferDate: D(transferDate),
        isOneHousehold: true,
        deemedOneHouseBy155: deemed,
        sellingHouseMeetsOneHouseRequirements: true,
        presaleRights: Array.from({ length: rights }, (_, k) => ({ ...right, id: `rt${k}` })),
        ...over,
      },
      houses + rights,
      null,
      null,
      new Set(),
      false,
      rights,
    ).exclusionReasons[0];
  };

  it.each([
    ["temporary_two_house", "2021-02-16", undefined],
    ["temporary_two_house", "2021-02-17", MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS],
    ["long_term_rental_residence", "2021-02-17", MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS],
    ["rural_house", "2021-02-17", MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS],
    ["special_act_house_exclusion", "2021-02-17", MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS],
  ] as const)("3주택 %s · 양도 %s → %s", (deemed, t, basis) => {
    const r = reason(deemed, t, 3);
    if (basis === undefined) expect(r).toBeUndefined();
    else expect(r?.detail).toContain(basis);
  });

  it("3주택 · §156의2 의제(권리 미산입)는 13호가 인용하지 않는다", () => {
    expect(reason("house_with_redevelopment_right", "2026-09-18", 3)).toBeUndefined();
  });

  it.each([
    // 2주택 — 15호(2023.2.28.) 전에는 §155⑦·조특법을 인용하는 호가 없었다(연혁 MST 202148~247489).
    ["rural_house", "2023-02-27", undefined],
    ["rural_house", "2023-02-28", MULTI_HOUSE.RURAL_HOUSE_2HOUSE_BASIS],
    ["special_act_house_exclusion", "2023-02-27", undefined],
    ["special_act_house_exclusion", "2023-02-28", MULTI_HOUSE.SPECIAL_ACT_2HOUSE_BASIS],
    // §155⑳ — 구 14호(2021.2.17. 신설) → 15호
    ["long_term_rental_residence", "2021-02-16", undefined],
    ["long_term_rental_residence", "2021-02-17", MULTI_HOUSE.RENTAL_RESIDENCE_2HOUSE_BASIS_OLD],
    ["long_term_rental_residence", "2023-02-28", MULTI_HOUSE.RENTAL_RESIDENCE_2HOUSE_BASIS],
    // E-14e — 2023.2.28. 전 일시적 2주택은 §155① 의제가 아니라 구 8호 사실(`oldClause8TemporaryTwoHouse`)이 받는다.
    //   의제만 주고 8호 사실이 없으면 호가 없다(8호 사실 경로는 `surcharge-old-clauses-e14ef.anchor.test.ts`).
    ["temporary_two_house", "2021-02-16", undefined],
    ["temporary_two_house", "2023-02-28", MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS],
    // 종전 동작 불변 — 상속(경로 게이트)
    ["inherited_general_house", "2021-02-17", MULTI_HOUSE.INHERITED_GENERAL_HOUSE_2HOUSE_BASIS_OLD],
  ] as const)("2주택 %s · 양도 %s → %s", (deemed, t, basis) => {
    const r = reason(deemed, t, 2);
    if (basis === undefined) expect(r).toBeUndefined();
    else expect(r?.detail).toContain(basis);
  });

  it.each([
    // 주택 1 + 권리 1 — §167의11①13호(2023.2.28.) · 제155조는 인용하지 않는다
    ["house_with_redevelopment_right", "2023-02-27", undefined],
    ["house_with_redevelopment_right", "2023-02-28", MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS],
    ["house_with_presale_right", "2023-02-28", MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS],
    ["special_act_house_exclusion", "2023-02-28", MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS],
    ["rural_house", "2026-09-18", undefined],
    ["temporary_two_house", "2026-09-18", undefined],
  ] as const)("주택 1 + 권리 1 · %s · 양도 %s → %s", (deemed, t, basis) => {
    const r = reason(deemed, t, 1, 1);
    if (basis === undefined) expect(r).toBeUndefined();
    else expect(r?.detail).toContain(basis);
  });

  it.each([
    // 주택 + 권리 합 3 이상 — §167의4③7호(대통령령 제31442호 부칙 제10조② 2021.1.1. 이후 양도분)
    ["temporary_two_house", "2020-12-31", undefined],
    ["temporary_two_house", "2021-01-01", MULTI_HOUSE.HOUSE_RIGHT_3PLUS_DEEMED_BASIS],
    ["house_with_redevelopment_right", "2021-01-01", MULTI_HOUSE.HOUSE_RIGHT_3PLUS_DEEMED_BASIS],
  ] as const)("주택 2 + 권리 1 · %s · 양도 %s → %s", (deemed, t, basis) => {
    const r = reason(deemed, t, 2, 1);
    if (basis === undefined) expect(r).toBeUndefined();
    else expect(r?.detail).toContain(basis);
  });

  it("② 요소 — §154① 미충족이면 어느 호도 받지 않는다(구 5·6호 합가만 예외)", () => {
    const off = { sellingHouseMeetsOneHouseRequirements: false };
    expect(reason("temporary_two_house", "2026-09-18", 3, 0, off)).toBeUndefined();
    expect(reason("house_with_redevelopment_right", "2026-09-18", 1, 1, off)).toBeUndefined();
    expect(reason("long_term_rental_residence", "2026-09-18", 2, 0, off)).toBeUndefined();
  });
});

/**
 * 겸용주택 경로 — 호 판정(`determineSurchargeExclusion`)과 조특법 경로 술어(`specialActHouseExclusionBasis`·
 * `verifiedSpecialAct15Exclusions`)를 단건과 **공유**한다. §155⑳·§156의2·§156의3 경로는 겸용에 입력이 없다.
 * 시료는 E-14d anchor(`mixed-use-inheritance-exclusion-e14d.anchor.test.ts`)와 같다 — 겸용주택 1997 신축 ·
 * 양도 2026-06-01 · 30억(주택분 12억 초과) · 조정지역 명부 · 중과 규칙이 있는 mock 세율.
 */
describe("겸용주택 — 같은 호 판정·같은 조특법 술어 (E-14a·b)", () => {
  const T = D("2026-06-01");
  const BIG = 3_000_000_000;
  const sellingMixed = { ...makeHouseInfoMock("selling"), acquisitionDate: D("1997-09-12") };
  const mixed = (houses: HouseInfo[], over: Partial<MixedUseAssetInput> = {}) =>
    calcMixedUseTransferTax(
      BIG,
      T,
      {
        ...mixedUseCase14(),
        isOneHouseExempt: false,
        isOneHousehold: true,
        householdHousingCountForExclusion: houses.length,
        multiHouse: {
          houses,
          sellingHouseId: "selling",
          presaleRights: [],
          isOneHousehold: true,
          isRegulatedArea: true,
        } as NonNullable<MixedUseAssetInput["multiHouse"]>,
        inheritedHouseExclusion: {
          generalHouseGiftedFromDecedentWithin2yr: undefined,
          generalHouseGiftDate: undefined,
          generalHouseRightAtInheritance: undefined,
        },
        ...over,
      } as MixedUseAssetInput,
      makeMockRatesWithHouseEngine(),
    );
  const inheritedOld = makeHouseInfoMock("h2", { acquisitionDate: D("2015-03-01"), isInherited: true, inheritedDate: D("2015-03-01") });
  const newHouse = makeHouseInfoMock("h3", { acquisitionDate: D("2025-01-01") });

  it("MX-1 겸용 + 상속주택(2015) + 신규 주택(§155①) — 중과 3주택 · 비과세 기준 2주택 → 13호 배제", () => {
    const r = mixed([sellingMixed, inheritedOld, newHouse], {
      temporaryTwoHouse: { previousAcquisitionDate: D("1997-09-12"), newAcquisitionDate: D("2025-01-01") },
    });
    expect(r.multiHouseSurcharge?.effectiveHouseCount).toBe(3);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge?.exclusionReasons[0]?.detail).toContain(MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS);
  });

  it("MX-1n 부정 짝 — 신규 주택 선언 없음(§155① 불성립) → 3주택 중과", () => {
    const r = mixed([sellingMixed, inheritedOld, newHouse]);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
  });

  /**
   * PR-3 — 겸용(4개 소비처 중 하나)도 §155②③ 제외 행을 빼고 합가 전 구성을 판정한다
   * (`transfer-tax-mixed-use-exemption.ts`의 `knownHouseExclusionHouseIds` 배선).
   */
  /** `mixed()`의 `over.multiHouse`는 전체를 덮어쓴다(houses·sellingHouseId 소실) — marriageMerge만 더해 직접 조립. */
  const mixedWithMarriage = (houses: HouseInfo[]) =>
    calcMixedUseTransferTax(
      BIG,
      T,
      {
        ...mixedUseCase14(),
        isOneHouseExempt: false,
        isOneHousehold: true,
        householdHousingCountForExclusion: houses.length,
        multiHouse: {
          houses,
          sellingHouseId: "selling",
          presaleRights: [],
          isOneHousehold: true,
          isRegulatedArea: true,
          marriageMerge: { marriageDate: D("2025-06-01") },
        } as NonNullable<MixedUseAssetInput["multiHouse"]>,
        isFirstTransferredInMerge: true,
        inheritedHouseExclusion: {
          generalHouseGiftedFromDecedentWithin2yr: undefined,
          generalHouseGiftDate: undefined,
          generalHouseRightAtInheritance: undefined,
        },
      } as MixedUseAssetInput,
      makeMockRatesWithHouseEngine(),
    );

  it("MX-3 겸용 + 상속주택 제외 후 (1,1) 성립(혼인) → 3주택인데도 13호 배제", () => {
    const r = mixedWithMarriage([sellingMixed, inheritedOld, { ...newHouse, mergeOrigin: "counterpart_side" as const }]);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge?.exclusionReasons[0]?.detail).toContain(MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS);
  });

  it("MX-3n 부정 짝 — 그 주택이 양도자 쪽이면(각자 1주택 아님) 상속주택을 빼도 불성립 · 3주택 중과", () => {
    const r = mixedWithMarriage([sellingMixed, inheritedOld, { ...newHouse, mergeOrigin: "seller_side" as const }]);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
  });

  it("MX-2 겸용 + §99의2 감면주택(명부 표시 없음 · 모드 2) → 15호 조특법 경로 배제", () => {
    const r = mixed([sellingMixed, makeHouseInfoMock("s", { acquisitionDate: D("2013-06-01") })], {
      specialHouseExclusions: [
        { article: "unsold_99_2", houseAcquisitionDate: D("2013-06-01"), houseContractDate: D("2013-06-01"), requirementsConfirmed: true },
      ] as MixedUseAssetInput["specialHouseExclusions"],
    });
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge?.exclusionReasons.map((x) => x.type)).toEqual(["special_act_house_exclusion"]);
    expect(r.multiHouseSurcharge?.exclusionReasons[0]?.detail).toContain("조특법 §99의2②");
  });

  it("MX-2n 조특법 **시행령** §98②·⑥ → 확인 필요 · 2주택 중과 그대로", () => {
    const r = mixed([sellingMixed, makeHouseInfoMock("s", { acquisitionDate: D("1996-06-01") })], {
      specialHouseExclusions: [
        { article: "unsold_98", houseAcquisitionDate: D("1996-06-01"), requirementsConfirmed: true },
      ] as MixedUseAssetInput["specialHouseExclusions"],
    });
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_2");
  });

  /** §98의9(STEP 0.9 `hceApplied`)도 같은 leaf로 대조한다 — 사용자 결정 2026-10-04 (route 관측은 `transfer.route.special-act-15ho-hce-verified`). */
  const unsold989 = (acq: string) =>
    [
      {
        type: "unsold_98_9",
        unsoldHouseAcquisitionDate: D(acq),
        unsoldHouseAcquisitionPrice: 500_000_000,
        unsoldHouseExclusiveArea: 84,
        isNonCapitalRegion: true,
        wasOneHouseholdAtAcquisition: true,
        meetsSellerAndContractRequirement: true,
      },
    ] as MixedUseAssetInput["reductions"];
  const unsoldHouse = (acq: string) =>
    makeHouseInfoMock("u", { acquisitionDate: D(acq), region: "non_capital", officialPrice: 400_000_000 });

  it("MX-3 겸용 + §98의9 준공후미분양(공시 4억) → 15호 조특법 경로 배제 (종전 2주택 중과)", () => {
    const r = mixed([sellingMixed, unsoldHouse("2025-03-01")], { reductions: unsold989("2025-03-01") });
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge?.exclusionReasons.map((x) => x.type)).toEqual(["special_act_house_exclusion"]);
    expect(r.multiHouseSurcharge?.exclusionReasons[0]?.detail).toContain("§98의9");
  });

  it("MX-3n §98의9 취득기간(2024.1.10.~) 밖 → 제외 불성립 · 2주택 중과 그대로", () => {
    const r = mixed([sellingMixed, unsoldHouse("2023-06-01")], { reductions: unsold989("2023-06-01") });
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_2");
  });
});
