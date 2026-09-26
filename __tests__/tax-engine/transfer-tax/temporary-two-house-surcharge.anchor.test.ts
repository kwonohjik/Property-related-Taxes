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

  // 🔁 OH-01(2026-09-26) — 종전 기대값 3년은 seed의 「2022-05-10 완화 3년」을 옮긴 것이었는데 법령과
  //    다르다. 대통령령 제32654호 부칙 제3조①: 2022-05-10 이후 양도분의 §155①2호는 **2년**이다
  //    (MST 242735 본문 「신규 주택을 취득한 날부터 2년 이내」). 3년 통일은 2023-01-12 이후 양도분
  //    (제33267호 부칙 제8조). 경계 anchor: `temporary-two-house-deadline-era.anchor.test.ts`.
  it("T-A1b 조정 · 2022-05-10 당일 양도 → 2년 (제32654호 부칙 제3조)", () => {
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        { isRegulatedArea: true, transferDate: new Date("2022-05-10") },
        twoHouseRule,
      ),
    ).toBe(2);
  });

  // seed 값 자체를 고정한다 — mock↔seed 드리프트(F-3) 재발 시 여기서 먼저 깨진다.
  // 🔁 OH-01 — 조정대상지역 연혁 3필드는 seed에서 폐지하고 코드 leaf가 정한다
  //    (`data/temporary-two-house-deadline-era.ts`). 남는 것은 §155① 본문 3년뿐이다.
  it("T-B9 seed 규칙 고정 — §155① 본문 처분기한 3년만 남는다", () => {
    expect(twoHouseRule).toEqual({ disposalDeadlineYears: 3 });
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
    // 🔁 2026-08-13 기대값 갱신 (F10) — 종전 147,780,000 / 162,558,000.
    //   이 anchor의 주제는 **§167의10①15호 중과 배제**이고, 세액 숫자는 작성 당시의 장특공제
    //   (표1 8년×2% = 16%)에서 파생된 값이었다. §155① 의제 1세대1주택은 「소득세법 시행령」
    //   §159의4에 따라 **표2 대상**이므로(같은 조 괄호가 「제155조 … 에 따라 1세대 1주택으로
    //   보는 주택을 포함한다」) 12억 초과 과세분 장특은 보유 8년×4% + 거주 3년×4% = 44%다.
    //   과세표준 434,300,000 → 288,700,000 으로 줄어 산출세액이 89,766,000이 된다.
    //   중과 배제 판정(exclusionReasons·surchargeType)은 그대로이므로 anchor의 주제는 불변이다.
    expect(r.calculatedTax).toBe(89_766_000);
    expect(r.totalTax).toBe(98_742_600);
  });

  it("T-B2 🔴 N2 (新 2020-06-01 · 양 2022-05-31 · 조정) → 「비과세 O / 중과배제 X」 소멸", () => {
    // F-2 드리프트 재현 조합. 비과세 정본은 2년 기한으로 의제를 인정하는데
    // 구 중과 배제는 하드코딩 1년으로 부정했다 → 같은 사실관계에 두 결론.
    // 🔁 OH-01(2026-09-26) — 종전 양도일 2022-01-01은 신규 2019-12-17 이후 취득·2022-05-09 이전 양도라
    //    **1년 체제**(대통령령 제30395호 부칙 제15조)에 걸려 의제 자체가 불성립한다(법령상 정답).
    //    이 anchor의 주제(두 경로가 같은 기한)를 재려면 2년 기한이 실제로 적용되는 날이어야 하므로
    //    2022-05-10 이후(제32654호 부칙 제3조 — 2년)·2년 이내인 2022-05-31로 옮겼다. 보유 4년·거주 3년·
    //    12억 기준이 같아 세액은 불변이다.
    const r = calc({ newAcq: "2020-06-01", transfer: "2022-05-31" });
    expect(r.exemptReason).toBe("일시적 2주택 고가주택"); // §155① 의제 성립
    expect(r.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("temporary_two_house");
    // 🔁 2026-08-13 기대값 갱신 (F10) — 종전 168,580,000. 위와 같은 이유(표1 6% → 표2 24%).
    // 🔁 A1a(보유기간 초일 산입, 2026-09-26) — 종전 131,140,000. 종전주택 2018-01-01 → 2022-01-01은
    //    응당일 양도라 §95④ 초일 산입으로 **4년**(종전 구현 3년) ⇒ 표2 보유 4년×4% + 거주 3년×4% = 28%.
    //    12억 초과분 520,000,000 × 72% − 2,500,000 = 371,900,000 × 40% − 25,940,000 = 122,820,000.
    //    비과세·중과배제 판정(위 두 단언)은 불변. anchor: `__tests__/tax-engine/holding-period-first-day-inclusion.anchor.test.ts`.
    expect(r.calculatedTax).toBe(122_820_000);
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
    // 🔁 2026-08-13 기대값 갱신 (F10) — 종전 147,780,000. 비조정이라 중과는 애초에 없고,
    //    바뀐 것은 §159의4 표2 적용(16% → 44%)뿐이다.
    expect(r.calculatedTax).toBe(89_766_000);
  });

  it("T-B5 N6 (양 2026-05-09 · 유예 활성) → **배제가 먼저** — 세액 불변, 경로 변경", () => {
    // 현행: 배제 미도달 → 유예 경로(isSurchargeSuspended=true) · 147,780,000
    // 정정: 배제가 early-return → surchargeType "none" · isSurchargeSuspended=**false** · 동일 세액
    const r = calc({ newAcq: "2025-01-01", transfer: "2026-05-09", suspensionActive: true });
    expect(r.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("temporary_two_house");
    expect(r.isSurchargeSuspended).toBe(false);
    // 🔁 2026-08-13 기대값 갱신 (F10) — 종전 147,780,000. 「배제 경로 ↔ 유예 경로 동일 세액」이라는
    //    이 케이스의 논지는 유지된다(둘 다 중과 미적용 + 표2). 절대값만 표2 반영으로 이동.
    expect(r.calculatedTax).toBe(89_766_000);
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
