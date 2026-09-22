/**
 * anchor — 양도 주택 **자신**의 장기임대 중과 배제 배선 (§167의3①2호 · D-6 후속 ③-장기임대).
 *
 * ## 문화유산(6호)·상속(7호)과 **같은 모양의 결함**이었다
 *
 * 엔진은 양도 주택 자신의 2호를 이미 판정한다
 * (`multi-house-surcharge-exclusion.ts` — `isSurchargeExemptRental(sellingHouse, …)`).
 * Zod `houseSchema`도 `isLongTermRental`·`rentalType`·9유형 필드를 전부 받는다. 그런데 ④ 어댑터가
 * `selling` 행에 `isLongTermRental: false`를 **하드코딩**해 그 분기가 잠들어 있었다 —
 * 「어댑터 한 층만 끊긴 잠자는 분기」 세 번째다.
 *
 * 엔진 leaf anchor(`rental-type-matrix.test.ts` 등)는 `HouseInfo`를 **직접 만들어** 초록이었다
 * ([[feedback_library_anchor_does_not_prove_component_uses_it]]). 그래서 이 파일은 **폼 → 페이로드**
 * 를 본다.
 *
 * ## 목을 골라낼 수 없다 — 법문이 전제를 뒤집었다
 *
 * 착수 전 가설은 「9목 중 양도 주택에 쓰이는 목만 추리면 된다」였다. 법문(실독 2026-09-22 ·
 * MST 286211)이 **반증**했다:
 *   · **사목** = 「등록 말소 이후 1년 이내 **양도하는** 주택」 — 문언 자체가 양도 주택이다.
 *   · **라목** = 「해당 주택을 **양도하는** 거주자는 … 미분양주택 확인서 사본 … 제출해야 한다」.
 * ⇒ 명부 행의 매트릭스를 **그대로 공유**한다(`RentalDeclaration`) — 복제하면 두 진실이 된다.
 *
 * ## 실측 (조정지역 3주택/2주택 · 양도 2026-09-18 · 프로덕션 fallback 세율)
 *
 * | 시나리오 | 세액 | 차이 |
 * |---|---|---|
 * | 3주택 중과(비임대) | 354,541,000 | — |
 * | 3주택 장기임대 배제 | 141,966,000 | **−212,575,000** |
 * | 2주택 중과(비임대) | 299,816,000 | — |
 * | 2주택 장기임대 배제 | 141,966,000 | **−157,850,000** |
 *
 * 배선 전에는 **과다 과세** 방향이었다.
 *
 * ## ✅ 후속 해소 — 유형 미선택도 등록 완비 + 5년을 요구한다 (2026-09-22)
 *
 * 최초 배선 시점의 `isSurchargeExemptRental` 마지막 줄은 `house.rentalType ? 정밀판정 : true`로,
 * 유형이 없으면 등록·임대기간을 **전혀 확인하지 않고** 배제했다. §167의3①2호 **본문**이
 * 사업자등록등을, **각 목 전부**가 임대기간을 요구하므로(실독 MST 286211) 근거가 없었다.
 * ⇒ 술어를 `isLongTermRentalHousingExempt` **하나**에 위임하고, §167의3④(기간만 미달 → 10호
 * 의제)는 `isLongTermRentalDutyPeriodPending`의 유형 미선택 분기로 **살렸다**. LR-11·LR-12가 고정.
 */

import { describe, it, expect } from "vitest";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import {
  sellingHouseLongTermRentalVisible,
  sellingHouseExclusionVisible,
} from "@/lib/calc/house-count-inputs-scope";
import type { HouseEntry, RentalDeclaration, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../../tax-engine/_helpers/mock-rates";

// ────────────────────────────── ④⑬ 배선 축 ──────────────────────────────

type Payload = Record<string, unknown>;

const ROSTER_ROW: HouseEntry = {
  id: "h1",
  region: "capital",
  acquisitionDate: "2012-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

/** 등록 완비 + 6년 임대 (유형 미선택 = legacy 경로) */
const REGISTERED: RentalDeclaration = {
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalRegistrationDate: "2017-01-01",
  businessRegistrationDate: "2017-01-01",
  rentalPeriodYears: "6",
};

function form(ltr?: RentalDeclaration): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  f.houses = [ROSTER_ROW];
  if (ltr) f.sellingHouseExclusion = { ...f.sellingHouseExclusion, longTermRental: ltr };
  return f;
}

function sellingRow(ltr?: RentalDeclaration): Payload {
  const f = form(ltr);
  const rows = buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion) as Payload[];
  return rows.find((r) => r.id === "selling")!;
}

describe("LR ④⑬ — 양도 주택의 장기임대 선언이 페이로드에 실린다", () => {
  it("LR-1 미선언이면 종전과 동일하다 (`isLongTermRental: false`)", () => {
    const s = sellingRow();
    expect(s.isLongTermRental).toBe(false);
    expect(s.isApartment).toBe(false);
    expect(s.rentalType).toBeUndefined();
  });

  it("LR-2 등록 경로 — 등록 플래그·등록일 2종·임대기간이 실린다", () => {
    const s = sellingRow(REGISTERED);
    expect(s.isLongTermRental).toBe(true);
    expect(s.isRegisteredRental).toBe(true);
    expect(s.rentalRegistrationDate).toBe("2017-01-01");
    expect(s.businessRegistrationDate).toBe("2017-01-01");
    expect(s.rentalPeriodYears).toBe(6);
  });

  it("LR-3 토글 OFF면 등록 정보가 남아 있어도 싣지 않는다", () => {
    const s = sellingRow({ ...REGISTERED, isLongTermRental: false });
    expect(s.isLongTermRental).toBe(false);
    expect(s.isRegisteredRental).toBeUndefined();
    expect(s.rentalPeriodYears).toBeUndefined();
  });

  it("LR-4 9유형 매트릭스는 `rentalType`을 고른 때만 나간다 (명부 행과 같은 규약)", () => {
    expect(sellingRow(REGISTERED).hasMinimum2Units).toBeUndefined();
    const s = sellingRow({ ...REGISTERED, rentalType: "C", hasMinimum2Units: true, rentalLandArea: "250" });
    expect(s.rentalType).toBe("C");
    expect(s.hasMinimum2Units).toBe(true);
    expect(s.rentalLandArea).toBe(250);
  });

  it("LR-5 사목(G) — 말소 게이트 3종 + base 목이 실린다 (양도 주택 전용 목)", () => {
    const s = sellingRow({
      ...REGISTERED,
      rentalType: "G",
      saMokBaseArticle: "가",
      rentalCancellationDate: "2025-09-01",
      hasHalfDutyPeriodMet: true,
      isSoldWithin1YearOfCancellation: true,
    });
    expect(s.rentalType).toBe("G");
    expect(s.saMokBaseArticle).toBe("가");
    expect(s.rentalCancellationDate).toBe("2025-09-01");
    expect(s.hasHalfDutyPeriodMet).toBe(true);
    expect(s.isSoldWithin1YearOfCancellation).toBe(true);
  });

  it("LR-6 아파트 선언이 실린다 — 종전 `isApartment: false` 하드코딩이 아·자목을 무력화했다", () => {
    expect(sellingRow({ ...REGISTERED, isApartment: true }).isApartment).toBe(true);
  });

  /**
   * ⚠️ 한 필드가 두 조문 축을 겸한다 — §167의10①3호(부득이)와 장기임대 나·라목이 둘 다
   *    「취득 당시 기준시가」를 본다. 부득이 칸이 비었을 때 `undefined`로 덮으면 임대 쪽 값이
   *    조용히 지워진다(속성 순서상 부득이 줄이 spread 뒤에 온다).
   */
  it("LR-7 `acquisitionOfficialPrice` — 임대 칸 값이 부득이 칸에 지워지지 않는다", () => {
    const s = sellingRow({ ...REGISTERED, rentalType: "D", acquisitionOfficialPrice: "280000000" });
    expect(s.acquisitionOfficialPrice).toBe(280_000_000);
  });

  it("LR-8 부득이 3호 값이 있으면 그쪽이 이긴다 (두 칸이 같은 사실을 가리킨다)", () => {
    const f = form({ ...REGISTERED, rentalType: "D", acquisitionOfficialPrice: "280000000" });
    f.sellingHouseExclusion = {
      ...f.sellingHouseExclusion,
      isUnavoidableReason: true,
      acquisitionOfficialPrice: "250000000",
    };
    const rows = buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion) as Payload[];
    expect(rows.find((r) => r.id === "selling")!.acquisitionOfficialPrice).toBe(250_000_000);
  });

  it("LR-9 「합산 계산」 경로도 같이 실린다 (단건만 고치면 두 화면이 갈린다)", () => {
    const body = buildPropertyPayload(form({ ...REGISTERED, rentalType: "E" })) as Payload;
    const s = (body.houses as Payload[]).find((r) => r.id === "selling")!;
    expect(s.isLongTermRental).toBe(true);
    expect(s.rentalType).toBe("E");
    const off = buildPropertyPayload(form()) as Payload;
    expect((off.houses as Payload[]).find((r) => r.id === "selling")!.isLongTermRental).toBe(false);
  });
});

// ────────────────────────────── ⑤ 노출 게이트 ──────────────────────────────

describe("LR ⑤ — 2호는 2주택에서도 성립하므로 게이트가 2채다", () => {
  it("LR-10 2주택이면 뜬다 (3주택+ 섹션은 안 뜬다 — 게이트가 다르다)", () => {
    const f = form();
    f.householdHousingCount = "2";
    expect(sellingHouseLongTermRentalVisible(f)).toBe(true);
    expect(sellingHouseExclusionVisible(f)).toBe(false);

    f.householdHousingCount = "1";
    expect(sellingHouseLongTermRentalVisible(f)).toBe(false);

    // 켜 둔 뒤 1채로 낮춰도 끌 화면은 남는다 (dead-end 회피 — 형제 게이트와 같은 규칙)
    const on = form(REGISTERED);
    on.householdHousingCount = "1";
    expect(sellingHouseLongTermRentalVisible(on)).toBe(true);
  });
});

// ────────────────────────────── 세액 축 ──────────────────────────────

type H = Record<string, unknown>;
const engineHouse = (id: string, acq: string, o: H = {}) => ({
  id,
  acquisitionDate: new Date(acq),
  officialPrice: 300_000_000,
  region: "capital" as const,
  regionCode: "11680",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...o,
});

function hh(others: H[], selling: H = {}): TransferTaxInput {
  const hs = [
    engineHouse("selling", "2015-01-01", selling),
    ...others.map((o, i) => engineHouse(`h${i + 2}`, "2012-01-01", o)),
  ];
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate: new Date("2026-09-18"),
    isRegulatedArea: true,
    isOneHousehold: false,
    householdHousingCount: hs.length,
    houses: hs as TransferTaxInput["houses"],
    sellingHouseId: "selling",
  } as Partial<TransferTaxInput>);
}

function calc(i: TransferTaxInput) {
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const e = r.multiHouseSurchargeEvaluation!;
  return {
    tax: r.totalTax,
    count: e.effectiveHouseCount,
    reasons: (e.exclusionReasons ?? []).map((x) => x.type),
  };
}

/** 등록 완비 + 6년 (엔진 시료 — 유형 미선택) */
const ENG_REG = {
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalRegistrationDate: new Date("2017-01-01"),
  businessRegistrationDate: new Date("2017-01-01"),
  rentalPeriodYears: 6,
};
/** 사목(G) — 자진·자동 말소 후 1년 내 양도, base 가목 */
const ENG_SAMOK = {
  ...ENG_REG,
  rentalType: "G",
  saMokBaseArticle: "가",
  rentalCancellationDate: new Date("2025-09-01"),
  hasHalfDutyPeriodMet: true,
  isSoldWithin1YearOfCancellation: true,
  rentalStartOfficialPrice: 500_000_000,
  rentIncreaseUnder5Pct: true,
  isApartment: false,
};

describe("LR 세액 — 양도 주택 자신의 2호 배제", () => {
  it("LR-A 3주택, 양도 주택이 등록 장기임대 → 배제 141,966,000 (종전 354,541,000)", () => {
    const r = calc(hh([{}, {}], ENG_REG));
    expect(r.tax).toBe(141_966_000);
    expect(r.reasons).toContain("long_term_rental_house");
    // 🔑 주택 수는 3 그대로다 — 2호는 §167의3① 본문 괄호(1호·12호)의 불산입 대상이 아니다(D16).
    expect(r.count).toBe(3);
  });

  it("LR-B 음성 짝: 비임대면 중과 354,541,000", () => {
    expect(calc(hh([{}, {}])).tax).toBe(354_541_000);
  });

  it("LR-C 2주택에서도 배제된다 (§167의10①2호 준용) → 141,966,000 (종전 299,816,000)", () => {
    const r = calc(hh([{}], ENG_REG));
    expect(r.tax).toBe(141_966_000);
    expect(r.count).toBe(2);
  });

  it("LR-D 사목(G) — 말소 후 1년 내 양도면 배제된다 (양도 주택 전용 목)", () => {
    const r = calc(hh([{}, {}], ENG_SAMOK));
    expect(r.tax).toBe(141_966_000);
    expect(r.reasons).toContain("long_term_rental_house");
  });

  it("LR-E 사목 게이트가 살아 있다 — 5% 미충족·2020.8.18 전 말소는 배제되지 않는다", () => {
    expect(calc(hh([{}, {}], { ...ENG_SAMOK, rentIncreaseUnder5Pct: false })).tax).toBe(354_541_000);
    expect(
      calc(hh([{}, {}], { ...ENG_SAMOK, rentalCancellationDate: new Date("2019-09-01") })).tax,
    ).toBe(354_541_000);
  });

  it("LR-F 마목 아파트 — 2020.7.11 이후 등록분은 배제되지 않는다 (`isApartment` 배선이 하중을 받는다)", () => {
    const 마 = {
      isLongTermRental: true,
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2021-01-01"),
      businessRegistrationDate: new Date("2021-01-01"),
      rentalType: "E",
      rentalPeriodYears: 11,
      rentIncreaseUnder5Pct: true,
      rentalStartOfficialPrice: 500_000_000,
    };
    expect(calc(hh([{}, {}], { ...마, isApartment: true })).tax).toBe(354_541_000);
    expect(calc(hh([{}, {}], { ...마, isApartment: false })).tax).toBe(141_966_000);
  });

  it("LR-G 말소일(legacy 칸)이 양도일 이전이면 배제가 해제된다", () => {
    expect(
      calc(hh([{}, {}], { ...ENG_REG, rentalCancelledDate: new Date("2026-01-01") })).tax,
    ).toBe(354_541_000);
  });
});

// ────────────────────────── 유형 미선택도 요건을 요구한다 ──────────────────────────

describe("LR 유형 미선택 — 등록 완비 + 5년이 문턱이다 (2026-09-22 정정)", () => {
  /**
   * 🔴 종전에는 `isLongTermRental: true` **하나**로 배제됐다(실측 141,966,000 = −212,575,000의
   *    무근거 감세). §167의3①2호 본문의 사업자등록등·각 목의 임대기간을 아무것도 보지 않았다.
   */
  it("LR-11 토글만·기간 미달·등록 미완비는 배제되지 않는다", () => {
    expect(calc(hh([{}, {}], { isLongTermRental: true })).tax).toBe(354_541_000);
    expect(calc(hh([{}, {}], { ...ENG_REG, rentalPeriodYears: 4 })).tax).toBe(354_541_000);
    expect(
      calc(hh([{}, {}], { ...ENG_REG, businessRegistrationDate: undefined })).tax,
    ).toBe(354_541_000);
  });

  it("LR-12 긍정 짝: 등록 완비 + 5년이면 배제된다 (문턱이 5년에 있다)", () => {
    expect(calc(hh([{}, {}], { ...ENG_REG, rentalPeriodYears: 5 })).tax).toBe(141_966_000);
    expect(calc(hh([{}, {}], { ...ENG_REG, rentalPeriodYears: 4.9 })).tax).toBe(354_541_000);
  });

  it("LR-13 유형을 고르면 목별 정밀 판정이 살아 있다", () => {
    // 가목 — 임대개시 기준시가 6억(수도권) 초과면 배제되지 않는다
    const 가 = { ...ENG_REG, rentalType: "A", rentIncreaseUnder5Pct: true, isApartment: false };
    expect(calc(hh([{}, {}], { ...가, rentalStartOfficialPrice: 500_000_000 })).tax).toBe(141_966_000);
    expect(calc(hh([{}, {}], { ...가, rentalStartOfficialPrice: 700_000_000 })).tax).toBe(354_541_000);
  });

  /**
   * §167의3④ — 「의무임대기간…의 요건을 충족하기 전에 **일반주택을 양도**하는 경우에도 …
   * 장기임대주택등으로 보아 제1항제10호를 적용한다」. 2호를 조이면서 이 혜택을 함께 없애면
   * **법이 주는 것을 빼앗는다** ⇒ 유형 미선택 분기를 ④에 넣었다.
   *
   * 🔑 여기서는 임대주택이 **다른 집**이고 양도 주택은 일반주택이다 — 10호 경로다.
   */
  it("LR-14 ④ 기간 미달 임대주택 + 일반주택 양도 → 10호 의제로 배제 (혜택 보존)", () => {
    const 기간미달 = { ...ENG_REG, rentalPeriodYears: 4 };
    const r = calc(hh([기간미달], {}));
    expect(r.count).toBe(2);
    expect(r.tax).toBe(141_966_000);
  });

  it("LR-15 음성 짝: 등록 미완비면 ④도 아니다 (「기간 외 요건」을 못 갖췄다)", () => {
    expect(calc(hh([{ isLongTermRental: true }], {})).tax).toBe(299_816_000);
  });
});
