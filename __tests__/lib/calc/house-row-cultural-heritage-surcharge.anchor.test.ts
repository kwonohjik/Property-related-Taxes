/**
 * anchor — 명부 행의 §155⑥1호 선언이 **중과 축에도** 닿는다 (D-6 후속 ①).
 *
 * ## 왜 한 칸이 두 축인가 (법제처 실독 2026-09-22 · MST 286211)
 *
 * > §167의3① … 다음 각 호의 어느 하나에 해당하지 않는 주택을 말한다.
 * >   **6. 제155조제6항제1호에 해당하는 국가유산주택**
 *
 * 6호가 §155⑥1호를 **그대로 인용**한다. 그리고 §155⑥1호는 주택의 **정의**뿐이다
 * (「지정문화유산 … 국가등록문화유산 … 천연기념물등」) — 「각각 1개씩」은 ⑥ **본문**에 있어
 * 6호로 넘어오지 않는다. ⇒ 행의 선언 그 자체가 6호의 요건 전부이고, 두 축이 같은 칸을 쓴다.
 *
 * ## 무엇이 끊겨 있었나
 *
 * D-6은 `HouseEntry.oneHouseCulturalHeritage`를 만들어 **비과세 축**에만 연결했다. 중과 축의
 * 칸은 `HouseInfo.isCulturalHeritage`이고 엔진은 그것을 읽는데
 * (`multi-house-surcharge-exclusion.ts:58`), **어댑터가 명부 행에 그 키를 싣지 않았다** —
 * Zod(`transfer-tax-schema-sub.ts:301`)·route(`transfer-route-multi-house.ts:97`)·엔진은 전부
 * 열려 있고 어댑터 한 층만 끊긴 잠자는 분기였다. 양도 주택(`selling`)에는 종전부터
 * `sellingHouseExclusion`이라는 **다른** 입력 경로가 있었다.
 *
 * ## ⚠️ 주택 수에는 산입된다
 *
 * §167의3① 본문 괄호가 불산입으로 정한 것은 **1호·12호뿐**이다. 6호는 ⑩호 「유일한 일반주택」
 * 판정과 그 행 자신의 중과 배제에만 쓰인다 — CH-7이 그것을 음성 짝으로 고정한다
 * ([[feedback_negative_anchor_needs_positive_twin]]).
 *
 * 세율은 프로덕션 fallback · 조정지역(강남) 8억/3억 · 양도 2026-09-18 (D16 anchor와 같은 시료).
 */

import { describe, it, expect } from "vitest";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { HouseEntry, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../../tax-engine/_helpers/mock-rates";

// ────────────────────────────── ④⑬ 배선 축 ──────────────────────────────

type Payload = Record<string, unknown>;

function makeHouseEntry(over: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2019-01-01",
    officialPrice: "500000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionPrice: "",
    exclusiveArea: "",
    isUnsoldNewHouse: false,
    completionDate: "",
    isSpouseOwned: false,
    isCoInherited: false,
    decedentSameHouseholdAtInheritance: false,
    isRankingDisqualifiedInheritedHouse: false,
    ...over,
  };
}

function housingForm(houses: HouseEntry[]): TransferFormData {
  const form = createDefaultTransferFormData();
  form.assets[0] = { ...form.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  form.houses = houses;
  return form;
}

/** 단건 경로 — `callTransferTaxAPI`·판정 메뉴가 공유하는 빌더. */
function singleRows(houses: HouseEntry[]): Payload[] {
  const form = housingForm(houses);
  return buildHousesPayload(form.assets[0], houses, 0, form.sellingHouseExclusion) as Payload[];
}

/** 다건(신고 단위) 경로 — 인라인 map이 따로 있어 단건과 어긋날 수 있다. */
function multiRows(houses: HouseEntry[]): Payload[] {
  const body = buildPropertyPayload(housingForm(houses)) as Payload;
  return body.houses as Payload[];
}

describe("CH ④⑬ — 행 선언이 중과 칸(`isCulturalHeritage`)에 실린다", () => {
  it("CH-1 단건: 행이 §155⑥1호를 선언하면 그 행의 중과 칸이 켜진다", () => {
    const rows = singleRows([makeHouseEntry({ oneHouseCulturalHeritage: true })]);
    expect(rows.find((r) => r.id === "h1")!.isCulturalHeritage).toBe(true);
  });

  it("CH-2 음성 짝: 선언이 없으면 켜지지 않는다", () => {
    const rows = singleRows([makeHouseEntry()]);
    expect(rows.find((r) => r.id === "h1")!.isCulturalHeritage).toBeUndefined();
  });

  it("CH-3 다건도 같다 — 같은 입력이 「계산」과 「합산 계산」에서 갈리면 안 된다", () => {
    const rows = multiRows([makeHouseEntry({ oneHouseCulturalHeritage: true })]);
    expect(rows.find((r) => r.id === "h1")!.isCulturalHeritage).toBe(true);
    expect(multiRows([makeHouseEntry()]).find((r) => r.id === "h1")!.isCulturalHeritage).toBeUndefined();
  });

  it("CH-4 행 선언이 `selling`으로 새지 않는다 — 양도 주택은 `sellingHouseExclusion`이 정본", () => {
    const rows = singleRows([makeHouseEntry({ oneHouseCulturalHeritage: true })]);
    expect(rows.find((r) => r.id === "selling")!.isCulturalHeritage).toBeUndefined();

    const form = housingForm([makeHouseEntry()]);
    form.sellingHouseExclusion = { isCulturalHeritage: true };
    const withSelling = buildHousesPayload(
      form.assets[0],
      form.houses,
      0,
      form.sellingHouseExclusion,
    ) as Payload[];
    expect(withSelling.find((r) => r.id === "selling")!.isCulturalHeritage).toBe(true);
  });

  it("CH-5 비과세 축은 그대로다 — 한 선언이 두 축을 **함께** 움직인다", () => {
    const form = housingForm([makeHouseEntry({ oneHouseCulturalHeritage: true })]);
    const special = buildHouseholdSpecialPayload(form, form.assets[0]) as Payload;
    expect(special.culturalHeritageHouse).toBe(true);
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

function hh(others: H[]): TransferTaxInput {
  const hs = [
    engineHouse("selling", "2015-01-01"),
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

const CH = { isCulturalHeritage: true };

describe("CH 세액 — 6호가 ⑩호 「유일한 일반주택」을 세운다", () => {
  it("CH-6 3주택: 나머지 둘이 6호 → 양도 주택이 유일한 일반주택 → 141,966,000", () => {
    const r = calc(hh([CH, CH]));
    expect(r.tax).toBe(141_966_000);
    expect(r.reasons).toContain("only_one_remaining");
    // 🔑 주택 수는 그대로 3이다 — 6호는 본문 괄호의 불산입 대상(1호·12호)이 아니다.
    expect(r.count).toBe(3);
  });

  it("CH-7 음성 짝: 6호가 한 채뿐이면 10호가 서지 않는다 → 354,541,000 (중과 유지)", () => {
    const r = calc(hh([CH, {}]));
    expect(r.tax).toBe(354_541_000);
    expect(r.count).toBe(3);
    expect(r.reasons).toEqual([]);
    // 선언이 아예 없을 때와 **같은 값**이어야 한다 — 6호 1채가 주택 수를 줄이면 여기서 갈린다.
    expect(calc(hh([{}, {}])).tax).toBe(354_541_000);
  });

  it("CH-8 2주택: 상대가 6호 → §167의10①10호 준용 배제 → 141,966,000", () => {
    const r = calc(hh([CH]));
    expect(r.tax).toBe(141_966_000);
    expect(r.count).toBe(2);
    expect(r.reasons).toContain("only_general_two_house");
  });

  it("CH-9 음성 짝: 2주택 둘 다 일반 → 299,816,000 (중과)", () => {
    expect(calc(hh([{}])).tax).toBe(299_816_000);
  });
});
