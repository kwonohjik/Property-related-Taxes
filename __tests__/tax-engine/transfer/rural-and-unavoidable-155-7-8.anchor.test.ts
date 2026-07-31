/**
 * anchor: §155⑧ 수도권 밖 부득이한 사유 주택(E-3) · §155⑦ 농어촌주택(E-4).
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md §1.3·§1.4
 *
 * 둘 다 「일반주택을 양도하는 경우 국내에 1개의 주택을 소유하고 있는 것으로 보아 §154①을 적용」한다
 * — **양도 대상은 일반주택**이고, 특례 주택은 보유만 한다. 방향을 뒤집으면 정반대 결과가 나온다.
 *
 * 중과 배제 경로가 서로 다르다:
 *   ⑧ → 영 §167의10①**4호**「제155조제8항에 따른 수도권 밖에 소재하는 주택」 (15호를 거치지 않는다)
 *   ⑦ → 영 §167의10①**15호**(§155 의제 일반)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRatesWithHouseEngine, makeHouseInfo, baseTransferInput } from "../_helpers/mock-rates";

const seedRules = transferTaxSeeds.find(
  (s) => s.category === "special" && s.sub_category === "one_house_exemption",
)!.special_rules as unknown as OneHouseSpecialRulesData;

function seedRates(): TaxRatesMap {
  const m = makeMockRatesWithHouseEngine();
  const k = "transfer:special:one_house_exemption" as TaxRateKey;
  const cur = m.get(k) as unknown as Record<string, unknown>;
  m.set(k, {
    ...cur,
    specialRules: {
      ...(cur.specialRules as Record<string, unknown>),
      temporary_two_house: seedRules.temporary_two_house,
    },
  } as never);
  return m;
}

const D = (s: string) => new Date(s);

/** 양도 대상 = **일반주택**(12억 초과 고가). 특례 주택은 h2로 보유만 한다. */
function calc(over: Partial<TransferTaxInput> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 2_000_000_000,
      acquisitionPrice: 700_000_000,
      acquisitionDate: D("2018-01-01"),
      transferDate: D("2026-06-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      residencePeriodMonths: 36,
      sellingHouseId: "h1",
      houses: [
        makeHouseInfo("h1", { regionCode: "11680", acquisitionDate: D("2018-01-01") }),
        makeHouseInfo("h2", { regionCode: "11680", acquisitionDate: D("2019-01-01") }),
      ],
      ...over,
    }),
    seedRates(),
  );
}

// ============================================================
// E-3 — §155⑧ 수도권 밖 부득이한 사유 주택
// ============================================================

describe("E-3 — §155⑧ 수도권 밖 부득이 주택 보유 + 일반주택 양도", () => {
  it("미입력 → 2주택 그대로 (회귀)", () => {
    const r = calc();
    expect(r.exemptReason).toBeUndefined();
    expect(r.surchargeType).toBe("multi_house_2");
  });

  it("🔴 사유 해소일부터 3년 이내 양도 → 1주택 의제 · 고가주택 부분과세 + 중과 배제", () => {
    const r = calc({
      unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: D("2025-01-01") },
    });
    expect(r.exemptReason).toBe("수도권 밖 부득이한 사유 주택 고가주택 (§155⑧ 근무상 형편)");
    // 중과는 15호가 아니라 §167의10①4호로 직접 배제된다.
    expect(r.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("unavoidable_outside_capital");
    expect(r.surchargeType).toBeUndefined();
  });

  it("사유 해소 후 3년 초과 → 미적용 (기한 경계)", () => {
    const r = calc({
      unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: D("2023-05-31") },
    });
    expect(r.exemptReason).toBeUndefined();
    expect(r.surchargeType).toBe("multi_house_2");
  });

  it("해소일 당일 + 3년 = 경계 포함 (해소 2023-06-01 · 양도 2026-06-01)", () => {
    const r = calc({
      unavoidableOutsideCapitalHouse: { reason: "study", resolvedDate: D("2023-06-01") },
    });
    expect(r.exemptReason).toBe("수도권 밖 부득이한 사유 주택 고가주택 (§155⑧ 취학)");
  });

  it("W-1: 해소일 미입력(사유 미해소) → 기한이 기산되지 않아 적용 — 명문 부재를 불리하게 보지 않는다", () => {
    const r = calc({ unavoidableOutsideCapitalHouse: { reason: "illness" } });
    expect(r.exemptReason).toBe("수도권 밖 부득이한 사유 주택 고가주택 (§155⑧ 질병 요양)");
  });

  it("3주택이면 §155⑧ 의제가 성립하지 않는다 (「각각 1개씩」)", () => {
    const r = calc({
      householdHousingCount: 3,
      houses: [
        makeHouseInfo("h1", { regionCode: "11680", acquisitionDate: D("2018-01-01") }),
        makeHouseInfo("h2", { regionCode: "11680", acquisitionDate: D("2019-01-01") }),
        makeHouseInfo("h3", { regionCode: "11680", acquisitionDate: D("2019-06-01") }),
      ],
      unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: D("2025-01-01") },
    });
    expect(r.exemptReason).toBeUndefined();
  });

  it("§154① 미충족(취득 당시 조정 + 거주 0) → 의제해도 비과세 불성립", () => {
    const r = calc({
      residencePeriodMonths: 0,
      wasRegulatedAtAcquisition: true,
      unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: D("2025-01-01") },
    });
    expect(r.exemptReason).toBeUndefined();
  });
});

// ============================================================
// E-4 — §155⑦ 농어촌주택 (상속·이농·귀농 3유형)
// ============================================================

describe("E-4 — §155⑦ 농어촌주택 보유 + 일반주택 양도", () => {
  it("미입력 → 2주택 그대로 (회귀)", () => {
    expect(calc().exemptReason).toBeUndefined();
  });

  it("🔴 1호 상속 농어촌주택 (피상속인 취득 후 5년 이상 거주) → 1주택 의제", () => {
    const r = calc({
      ruralHouse: {
        kind: "inherited",
        isOutsideCapitalEupMyeon: true,
        decedentResidenceYears: 6,
      },
    });
    expect(r.exemptReason).toBe("농어촌주택 고가주택 (§155⑦1호 상속)");
    // 중과는 15호(§155 의제)를 경유한다. 일시적 2주택과 근거 항이 다르므로 사유 type도 구분한다.
    expect(r.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("rural_house");
    expect(r.surchargeType).toBeUndefined();
  });

  it("1호 — 피상속인 거주 5년 미만 → 농어촌주택 불성립", () => {
    const r = calc({
      ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 4 },
    });
    expect(r.exemptReason).toBeUndefined();
  });

  it("소재 요건(수도권 밖 읍·면) 미충족 → 유형 불문 불성립", () => {
    const r = calc({
      ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: false, decedentResidenceYears: 10 },
    });
    expect(r.exemptReason).toBeUndefined();
  });

  it("🔴 2호 이농주택 (이농인 취득 후 5년 이상 거주) → 1주택 의제", () => {
    const r = calc({
      ruralHouse: { kind: "farm_exit", isOutsideCapitalEupMyeon: true, ownerResidenceYears: 5 },
    });
    expect(r.exemptReason).toBe("농어촌주택 고가주택 (§155⑦2호 이농)");
  });

  it("2호 — 거주 5년 미만 → 불성립", () => {
    const r = calc({
      ruralHouse: { kind: "farm_exit", isOutsideCapitalEupMyeon: true, ownerResidenceYears: 4 },
    });
    expect(r.exemptReason).toBeUndefined();
  });

  it("🔴 3호 귀농주택 — ⑩ 요건 전부 충족 + ⑦단서 5년 이내 양도 → 1주택 의제", () => {
    const r = calc({
      ruralHouse: {
        kind: "return_to_farm",
        isOutsideCapitalEupMyeon: true,
        acquisitionDate: D("2023-01-01"), // 양도 2026-06-01 → 5년 이내
        isHighPriceAtAcquisition: false,
        landAreaSqm: 500,
        wholeHouseholdMoved: true,
      },
    });
    expect(r.exemptReason).toBe("농어촌주택 고가주택 (§155⑦3호 귀농)");
    // ⑪⑫는 엔진이 판정할 수 없다 — 경고로 노출(계획서 G-4)
    expect(r.warnings?.some((w) => w.includes("§155⑫"))).toBe(true);
  });

  it("3호 — ⑦단서: 취득일부터 5년 초과 양도 → 불성립", () => {
    const r = calc({
      ruralHouse: {
        kind: "return_to_farm",
        isOutsideCapitalEupMyeon: true,
        acquisitionDate: D("2020-01-01"), // 양도까지 6년 5개월
        isHighPriceAtAcquisition: false,
        landAreaSqm: 500,
        wholeHouseholdMoved: true,
      },
    });
    expect(r.exemptReason).toBeUndefined();
  });

  it.each([
    { label: "⑩2호 취득 당시 고가주택", over: { isHighPriceAtAcquisition: true } },
    { label: "⑩3호 대지 660㎡ 초과", over: { landAreaSqm: 700 } },
    { label: "⑩5호 세대전원 미이사", over: { wholeHouseholdMoved: false } },
  ])("3호 — $label → 불성립", ({ over }) => {
    const r = calc({
      ruralHouse: {
        kind: "return_to_farm",
        isOutsideCapitalEupMyeon: true,
        acquisitionDate: D("2023-01-01"),
        isHighPriceAtAcquisition: false,
        landAreaSqm: 500,
        wholeHouseholdMoved: true,
        ...over,
      },
    });
    expect(r.exemptReason).toBeUndefined();
  });

  it("대지 660㎡ 경계 — 660은 「이내」라 충족", () => {
    const r = calc({
      ruralHouse: {
        kind: "return_to_farm",
        isOutsideCapitalEupMyeon: true,
        acquisitionDate: D("2023-01-01"),
        isHighPriceAtAcquisition: false,
        landAreaSqm: 660,
        wholeHouseholdMoved: true,
      },
    });
    expect(r.exemptReason).toBe("농어촌주택 고가주택 (§155⑦3호 귀농)");
  });

  it("3주택이면 성립하지 않는다 (「각각 1개씩」)", () => {
    const r = calc({
      householdHousingCount: 3,
      ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 10 },
    });
    expect(r.exemptReason).toBeUndefined();
  });

  it("§154① 미충족 → 의제해도 비과세 불성립", () => {
    const r = calc({
      residencePeriodMonths: 0,
      wasRegulatedAtAcquisition: true,
      ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 10 },
    });
    expect(r.exemptReason).toBeUndefined();
  });
});
