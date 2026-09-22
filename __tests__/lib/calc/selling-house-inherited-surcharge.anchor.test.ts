/**
 * anchor — 양도 주택 **자신**의 상속 5년 중과 배제 배선 (§167의3①7호 · D-6 후속 ②-상속).
 *
 * ## 엔진은 이미 고쳐져 있었고 입력 경로만 닫혀 있었다
 *
 * D16(2026-09-18)이 `determineSurchargeExclusion`에 양도 주택 자신의 7호 판정을 넣었다
 * (`multi-house-surcharge-exclusion.ts:461`). 그런데 어댑터가 `selling` 행에
 * `isInherited: false`를 **하드코딩**해 그 분기가 잠들어 있었다.
 *
 * D16 anchor(A4·B9)는 `HouseInfo`를 **직접 만드는** 엔진 leaf라 초록이었다 — 배선을 증명하지
 * 못한다([[feedback_library_anchor_does_not_prove_component_uses_it]]). 그래서 이 파일은
 * **폼 → 페이로드**를 본다.
 *
 * ## 동일세대 사실은 §154⑧3호 칸을 그대로 쓴다
 *
 * 법제처 실독 2026-09-22 · MST 286211 — 두 조문이 **같은 질문**을 한다:
 * - §154⑧3호 「상속받은 주택으로서 상속인과 피상속인이 상속개시 당시 **동일세대**인 경우」
 * - §155② 단서 「상속인과 피상속인이 상속개시 당시 **1세대**인 경우」
 *
 * 주체·시점이 같고 「동일세대」·「1세대」는 법 §88 6호의 같은 개념이다. 효과만 반대다
 * (§154⑧3호 = 보유기간 통산 **유리** / §155② 단서 = 특례 배제 **불리**) — 사실은 하나다.
 *
 * ## 비과세 축은 건드리지 않는다
 *
 * 상속주택 주택 수 제외(`transfer-inheritance-exclusion.ts:72`)와 §89② 판정
 * (`transfer-tax-89-2-exclusion.ts:449`)은 둘 다 `h.id !== sellingHouseId`로 양도 행을 **명시
 * 제외**한다. 이 배선 전에는 `isInherited`가 항상 false라 그 필터가 **무의미**했다 — 이제
 * 하중을 받는다. IH-15가 그것을 고정한다.
 *
 * 세율은 프로덕션 fallback · 조정지역(강남) 8억/3억 · 양도 2026-09-18 (D16 anchor와 같은 시료).
 */

import { describe, it, expect } from "vitest";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusion } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry, TransferFormData } from "@/lib/stores/calc-wizard-store";
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

function form(over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    acquisitionCause: "inheritance",
    inheritanceDate: "2024-01-01",
    ...over,
  };
  f.houses = [ROSTER_ROW];
  return f;
}

function sellingRow(over: Partial<AssetForm> = {}): Payload {
  const f = form(over);
  const rows = buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion) as Payload[];
  return rows.find((r) => r.id === "selling")!;
}

function multiSellingRow(over: Partial<AssetForm> = {}): Payload {
  const body = buildPropertyPayload(form(over)) as Payload;
  return (body.houses as Payload[]).find((r) => r.id === "selling")!;
}

describe("IH ④⑬ — 양도 주택의 상속 사실이 페이로드에 실린다", () => {
  it("IH-1 상속 취득이면 `isInherited`·상속개시일이 실린다", () => {
    const s = sellingRow();
    expect(s.isInherited).toBe(true);
    expect(s.inheritedDate).toBe("2024-01-01");
  });

  it("IH-2 음성 짝: 매매 취득이면 실리지 않는다", () => {
    const s = sellingRow({ acquisitionCause: "purchase" });
    expect(s.isInherited).toBe(false);
    expect(s.inheritedDate).toBeUndefined();
  });

  it("IH-3 §155② 단서 — 동일세대 사실은 §154⑧3호 칸에서 온다", () => {
    expect(sellingRow({ decedentSameHouseholdBeforeInheritance: true })
      .decedentSameHouseholdAtInheritance).toBe(true);
    expect(sellingRow({ decedentSameHouseholdBeforeInheritance: false })
      .decedentSameHouseholdAtInheritance).toBe(false);
  });

  it("IH-4 동거봉양 예외는 **동일세대일 때만** 실린다 (요건 없는 주장 차단)", () => {
    expect(
      sellingRow({
        decedentSameHouseholdBeforeInheritance: true,
        parentalCareMergeInheritedHouse: true,
      }).parentalCareMergeInheritedHouse,
    ).toBe(true);
    // 동일세대가 아니면 예외 자체가 성립하지 않는다 — 값이 남아 있어도 싣지 않는다.
    expect(
      sellingRow({
        decedentSameHouseholdBeforeInheritance: false,
        parentalCareMergeInheritedHouse: true,
      }).parentalCareMergeInheritedHouse,
    ).toBeUndefined();
  });

  it("IH-5 §155②1~4호 순위 부적격이 실린다", () => {
    expect(sellingRow({ isRankingDisqualifiedInheritedHouse: true })
      .isRankingDisqualifiedInheritedHouse).toBe(true);
  });

  it("IH-6 상속이 아니면 게이트 필드가 전부 비어 있다 (잔여값 누수 차단)", () => {
    const s = sellingRow({
      acquisitionCause: "purchase",
      decedentSameHouseholdBeforeInheritance: true,
      parentalCareMergeInheritedHouse: true,
      isRankingDisqualifiedInheritedHouse: true,
    });
    expect(s.decedentSameHouseholdAtInheritance).toBeUndefined();
    expect(s.parentalCareMergeInheritedHouse).toBeUndefined();
    expect(s.isRankingDisqualifiedInheritedHouse).toBeUndefined();
  });

  /**
   * ⑧ `inheritanceDate`는 **필수가 아니다**(`transfer-tax-validate-*`에 요구가 없다). fallback이
   * 없으면 취득일만 적은 사용자는 `isInherited: true`인데 기산일이 없어 7호가 **조용히 죽는다**
   * (엔진은 둘 다 있어야 판정한다 — `multi-house-surcharge-count.ts:442`).
   *
   * 근거는 영 §162①5호다(실독 2026-09-22 · MST 286211): 「상속 … 에 의하여 취득한 자산에
   * 대하여는 그 **상속이 개시된 날**」 ⇒ 상속 자산의 취득시기가 곧 상속개시일이다.
   */
  it("IH-17 상속개시일이 비면 취득일로 기산한다 (영 §162①5호)", () => {
    const s = sellingRow({ inheritanceDate: "" });
    expect(s.isInherited).toBe(true);
    expect(s.inheritedDate).toBe("2015-01-01"); // = acquisitionDate
    // 명시 입력이 있으면 그것이 우선이다.
    expect(sellingRow({ inheritanceDate: "2024-01-01" }).inheritedDate).toBe("2024-01-01");
  });

  it("IH-18 fallback은 다건에도 같다 (경로 간 드리프트 차단)", () => {
    expect(multiSellingRow({ inheritanceDate: "" }).inheritedDate).toBe("2015-01-01");
  });

  it("IH-7 다건도 같다 — 같은 입력이 「계산」과 「합산 계산」에서 갈리면 안 된다", () => {
    const s = multiSellingRow({
      decedentSameHouseholdBeforeInheritance: true,
      parentalCareMergeInheritedHouse: true,
    });
    expect(s.isInherited).toBe(true);
    expect(s.inheritedDate).toBe("2024-01-01");
    expect(s.decedentSameHouseholdAtInheritance).toBe(true);
    expect(s.parentalCareMergeInheritedHouse).toBe(true);
    expect(multiSellingRow({ acquisitionCause: "purchase" }).isInherited).toBe(false);
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

const INH = { isInherited: true, inheritedDate: new Date("2024-01-01") };
const OLD_INH = { isInherited: true, inheritedDate: new Date("2019-01-01") };
const SAME_HH = { ...INH, decedentSameHouseholdAtInheritance: true };

describe("IH 세액 — 양도 주택 자신의 7호 배제", () => {
  it("IH-8 3주택, 양도 주택이 5년 내 상속 → 배제 141,966,000 (종전 354,541,000)", () => {
    const r = calc(hh([{}, {}], INH));
    expect(r.tax).toBe(141_966_000);
    expect(r.reasons).toContain("inherited_house_5years");
    // 🔑 주택 수는 3 그대로다 — 7호는 §167의3① 본문 괄호의 불산입 대상이 아니다(D16).
    expect(r.count).toBe(3);
  });

  it("IH-9 음성 짝: 매매 취득이면 중과 354,541,000", () => {
    expect(calc(hh([{}, {}])).tax).toBe(354_541_000);
  });

  it("IH-10 §155② 단서: 동일세대 상속이면 배제가 서지 않는다", () => {
    const r = calc(hh([{}, {}], SAME_HH));
    expect(r.tax).toBe(354_541_000);
    expect(r.reasons).toEqual([]);
  });

  it("IH-11 단서 예외: 동거봉양 합가 전 보유분이면 다시 배제된다", () => {
    const r = calc(hh([{}, {}], { ...SAME_HH, parentalCareMergeInheritedHouse: true }));
    expect(r.tax).toBe(141_966_000);
    expect(r.reasons).toContain("inherited_house_5years");
  });

  it("IH-12 순위 부적격이면 「상속받은 주택」이 아니라 배제가 서지 않는다", () => {
    const r = calc(hh([{}, {}], { ...INH, isRankingDisqualifiedInheritedHouse: true }));
    expect(r.tax).toBe(354_541_000);
    expect(r.reasons).toEqual([]);
  });

  it("IH-13 5년 경과(2019 상속)면 7호 불해당 — 기간 요건이 살아 있다", () => {
    const r = calc(hh([{}, {}], OLD_INH));
    expect(r.tax).toBe(354_541_000);
    expect(r.reasons).toEqual([]);
  });

  it("IH-14 2주택에서도 배제된다 (§167의10①2호 준용) → 141,966,000", () => {
    const r = calc(hh([{}], INH));
    expect(r.tax).toBe(141_966_000);
    expect(r.count).toBe(2);
  });
});

// ────────────────────────────── 비과세 축 무영향 ──────────────────────────────

describe("IH 비과세 축 — 양도 행은 상속주택 주택 수 제외에 참여하지 않는다", () => {
  /**
   * 🔴 이 필터는 **이 PR로 하중을 받기 시작했다.** 종전에는 `selling.isInherited`가 항상 false라
   *    `h.id !== sellingHouseId`가 있으나 마나였다. 필터가 사라지면 양도 주택이 「상속받은 다른
   *    주택」으로 잘못 세어져 비과세 주택 수가 1 줄어든다 — 세액이 조용히 바뀐다.
   */
  it("IH-15 양도 행이 상속이어도 제외 대상 수는 0이다", () => {
    const houses = [
      { id: "selling", isInherited: true, inheritedDate: new Date("2024-01-01") },
      { id: "h2", isInherited: false },
    ] as Parameters<typeof resolveInheritedHouseExclusion>[0];
    expect(resolveInheritedHouseExclusion(houses, "selling", false).excludedCount).toBe(0);
  });

  it("IH-16 긍정 짝: 다른 행이 상속이면 1채가 제외된다 (술어가 죽어 있지 않다)", () => {
    const houses = [
      { id: "selling", isInherited: false },
      { id: "h2", isInherited: true, inheritedDate: new Date("2024-01-01") },
    ] as Parameters<typeof resolveInheritedHouseExclusion>[0];
    expect(resolveInheritedHouseExclusion(houses, "selling", false).excludedCount).toBe(1);
  });
});
