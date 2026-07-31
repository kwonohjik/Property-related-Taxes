/**
 * 일시적 2주택 — §167의10①15호(§155 의제) 중과 배제 anchor
 *
 * 계획서: docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md
 *
 * ⚠️ **프로덕션 seed 값으로 돈다** (T-B9 / 계획서 F-3).
 *   테스트 mock(`_helpers/mock-rates.ts`)의 `regulatedAreaDeadlineYears: 1`이
 *   구 배제 1의 하드코딩 1년과 **우연히 일치**해 기한 드리프트(F-2)를 가리고 있었다.
 *   이 파일은 `transferTaxSeeds`에서 규칙을 직접 꺼내 쓴다.
 */
import { describe, it, expect } from "vitest";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import { resolveTemporaryTwoHouseDeadlineYears } from "@/lib/tax-engine/transfer-tax-exemption";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import {
  makeMockRatesWithHouseEngine,
  makeHouseInfo,
  baseTransferInput,
} from "../_helpers/mock-rates";

const seedOneHouseRules = transferTaxSeeds.find(
  (s) => s.category === "special" && s.sub_category === "one_house_exemption",
)!.special_rules as unknown as OneHouseSpecialRulesData;

const twoHouseRule = seedOneHouseRules.temporary_two_house!;

describe("Phase A — resolveTemporaryTwoHouseDeadlineYears (동작 불변 추출)", () => {
  // T-A1: 조정✓/✗ × 양도일 완화(2022-05-10) 전/후 4조합.
  //   checkExemption:342-353 인라인 로직과 **동일값**이어야 한다.
  it.each([
    { label: "비조정 · 완화 전 양도", isRegulatedArea: false, transferDate: "2022-01-01", expected: 3 },
    { label: "비조정 · 완화 후 양도", isRegulatedArea: false, transferDate: "2026-06-01", expected: 3 },
    { label: "조정 · 완화 전 양도", isRegulatedArea: true, transferDate: "2022-01-01", expected: 2 },
    { label: "조정 · 완화 후 양도", isRegulatedArea: true, transferDate: "2026-06-01", expected: 3 },
  ])("T-A1 $label → $expected년", ({ isRegulatedArea, transferDate, expected }) => {
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        { isRegulatedArea, transferDate: new Date(transferDate) },
        twoHouseRule,
      ),
    ).toBe(expected);
  });

  // 완화 시행일 당일(2022-05-10)은 `>=` 이므로 완화 기한이 적용된다.
  it("T-A1b 조정 · 완화 시행일 당일 양도 → 3년 (경계 `>=`)", () => {
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        { isRegulatedArea: true, transferDate: new Date("2022-05-10") },
        twoHouseRule,
      ),
    ).toBe(3);
  });

  // seed 값 자체를 고정한다 — mock↔seed 드리프트(F-3) 재발 시 여기서 먼저 깨진다.
  it("T-B9 seed 규칙 고정 — 조정지역 완화 전 기한은 2년", () => {
    expect(twoHouseRule).toEqual({
      disposalDeadlineYears: 3,
      regulatedAreaDeadlineYears: 2,
      regulatedAreaRelaxDate: "2022-05-10",
      regulatedAreaRelaxDeadlineYears: 3,
    });
  });
});

// ============================================================
// Phase B — §167의10①15호 중과 배제 (엔진 통합)
// ============================================================

/** mock 세율 + **seed의 `temporary_two_house` 규칙** 주입 (T-B9 / F-3 재발 방지) */
function seedRates(o?: { suspensionActive?: boolean }): TaxRatesMap {
  const m = makeMockRatesWithHouseEngine();

  const oneHouseKey = "transfer:special:one_house_exemption" as TaxRateKey;
  const oneHouse = m.get(oneHouseKey) as unknown as Record<string, unknown>;
  m.set(oneHouseKey, {
    ...oneHouse,
    specialRules: {
      ...(oneHouse.specialRules as Record<string, unknown>),
      temporary_two_house: twoHouseRule,
    },
  } as never);

  if (o?.suspensionActive) {
    // makeMockRatesWithHouseEngine은 `surcharge_suspended: false`로 고정한다 — 유예 경로 관측용 복원.
    const surKey = "transfer:surcharge:_default" as TaxRateKey;
    const sur = m.get(surKey) as unknown as Record<string, unknown>;
    m.set(surKey, {
      ...sur,
      specialRules: { surcharge_suspended: true, suspended_until: "2026-05-09" },
    } as never);
  }
  return m;
}

/**
 * 공통 fixture — 종전주택(h1) 취득 2018-01-01 · 양도가 20억 · 취득가 7억 · 거주 36개월 · 2주택.
 *
 * **12억 초과 고가주택**이어야 한다. §155① 의제가 성립하면 비과세도 함께 성립하므로,
 * 중과 배제의 효과는 12억 초과분 과세에서만 관측된다(계획서 F-1 두 번째 행).
 */
function calc(o: {
  newAcq: string;
  transfer: string;
  /** 조정대상지역 — 강남구(11680, 해제 없음) / 비조정은 부산 중구(26110, 이력 없음) */
  region?: string;
  residenceMonths?: number;
  wasRegulatedAtAcquisition?: boolean;
  /** §155① 비과세 입력 자체를 넣지 않는 회귀 케이스 */
  omitTemporaryTwoHouse?: boolean;
  suspensionActive?: boolean;
}) {
  const region = o.region ?? "11680";
  const input = baseTransferInput({
    transferPrice: 2_000_000_000,
    acquisitionPrice: 700_000_000,
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date(o.transfer),
    isRegulatedArea: region === "11680",
    householdHousingCount: 2,
    isOneHousehold: true,
    residencePeriodMonths: o.residenceMonths ?? 36,
    wasRegulatedAtAcquisition: o.wasRegulatedAtAcquisition ?? false,
    sellingHouseId: "h1",
    houses: [
      makeHouseInfo("h1", { regionCode: region, acquisitionDate: new Date("2018-01-01") }),
      makeHouseInfo("h2", { regionCode: region, acquisitionDate: new Date(o.newAcq) }),
    ],
    ...(o.omitTemporaryTwoHouse
      ? {}
      : {
          temporaryTwoHouse: {
            previousAcquisitionDate: new Date("2018-01-01"),
            newAcquisitionDate: new Date(o.newAcq),
          },
        }),
  });
  return calculateTransferTax(input, seedRates({ suspensionActive: o.suspensionActive }));
}

describe("Phase B — §167의10①15호 일시적 2주택 중과 배제", () => {
  it("T-B1 N1 (新 2025-01-01 · 양 2026-06-01 · 조정) → 배제. 284,910,000 → 147,780,000", () => {
    const r = calc({ newAcq: "2025-01-01", transfer: "2026-06-01" });
    expect(r.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("temporary_two_house");
    expect(r.surchargeType).toBeUndefined();
    expect(r.calculatedTax).toBe(147_780_000); // 현행(배관 미도달) 284,910,000 — 차액 137,130,000
    expect(r.totalTax).toBe(162_558_000);
  });

  it("T-B2 🔴 N2 (新 2020-06-01 · 양 2022-01-01 · 조정) → 「비과세 O / 중과배제 X」 소멸", () => {
    // F-2 드리프트 재현 조합. 비과세 정본은 seed 2년 기한으로 의제를 인정하는데
    // 구 중과 배제는 하드코딩 1년으로 부정했다 → 같은 사실관계에 두 결론.
    const r = calc({ newAcq: "2020-06-01", transfer: "2022-01-01" });
    expect(r.exemptReason).toBe("일시적 2주택 고가주택"); // §155① 의제 성립
    expect(r.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("temporary_two_house");
    expect(r.calculatedTax).toBe(168_580_000); // 현행 284,910,000 — 차액 116,330,000
  });

  it("T-B3 N4 (新 2015-01-01 — 기한 초과) → 배제 없음 · 중과 유지 (회귀)", () => {
    const r = calc({ newAcq: "2015-01-01", transfer: "2026-06-01" });
    expect(r.multiHouseSurchargeDetail!.exclusionReasons).toHaveLength(0);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.calculatedTax).toBe(777_435_000);
  });

  it("T-B4 N5 (비조정) → 중과 대상 아님 (회귀)", () => {
    const r = calc({ newAcq: "2025-01-01", transfer: "2026-06-01", region: "26110" });
    expect(r.surchargeType).toBeUndefined();
    expect(r.calculatedTax).toBe(147_780_000);
  });

  it("T-B5 N6 (양 2026-05-09 · 유예 활성) → **배제가 먼저** — 세액 불변, 경로 변경", () => {
    // 현행: 배제 미도달 → 유예 경로(isSurchargeSuspended=true) · 147,780,000
    // 정정: 배제가 early-return → surchargeType "none" · isSurchargeSuspended=**false** · 동일 세액
    const r = calc({ newAcq: "2025-01-01", transfer: "2026-05-09", suspensionActive: true });
    expect(r.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("temporary_two_house");
    expect(r.isSurchargeSuspended).toBe(false);
    expect(r.calculatedTax).toBe(147_780_000); // 현행 유예 경로와 **동일 세액**
  });

  it("T-B5b 유예 활성 + 의제 미성립 → 유예 경로 유지 (회귀)", () => {
    const r = calc({ newAcq: "2015-01-01", transfer: "2026-05-09", suspensionActive: true });
    expect(r.multiHouseSurchargeDetail!.exclusionReasons).toHaveLength(0);
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.calculatedTax).toBe(424_335_000);
  });

  it("T-B6 🔴 N7 (§154① 거주요건 미충족) → 15호 ② 요소로 **중과 유지**", () => {
    // ⚠️ 과다과세 방향(배제가 좁아짐). 법문 「같은 항의 요건을 모두 충족하는 주택」이 근거.
    //    취득 당시 조정대상지역 + 거주 0개월 → §154① 미충족 → 의제 자체가 성립하지 않는다.
    const r = calc({
      newAcq: "2025-01-01",
      transfer: "2026-06-01",
      residenceMonths: 0,
      wasRegulatedAtAcquisition: true,
    });
    expect(r.exemptReason).toBeUndefined(); // 비과세도 불성립 — 두 판정이 일치한다
    expect(r.multiHouseSurchargeDetail!.exclusionReasons).toHaveLength(0);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.calculatedTax).toBe(777_435_000);
  });

  it("T-B7 N8 (§155① 입력 없음) → 완전 불변 (회귀)", () => {
    const r = calc({ newAcq: "2025-01-01", transfer: "2026-06-01", omitTemporaryTwoHouse: true });
    expect(r.multiHouseSurchargeDetail!.exclusionReasons).toHaveLength(0);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.calculatedTax).toBe(777_435_000);
  });
});
