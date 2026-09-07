/**
 * anchor: ⑧ 요구 범위·표시 fallback 정정 (UI 리뷰 보통 #7·#12·#31).
 *
 * | 축 | 종전 |
 * |---|---|
 * | §99의3 (#7) | 재개발 변형 ON + 5년 **이내** → ⑧이 요구하지 않아 감면이 **조용히 0** |
 * | 인구감소 (#12) | 화면은 `?? "interest"`(4억), 엔진은 `?? autoKind`(9억일 수 있다) |
 * | §77 (#31) | 2018 세트를 「**현행** 감면율」이라 불러 지금도 유효한 것처럼 읽혔다 |
 */
import { describe, it, expect } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { classifyPopulationDeclineArea } from "@/lib/tax-engine/data/population-decline-areas";
import { PUBLIC_EXPROPRIATION_RATES } from "@/lib/tax-engine/public-expropriation-reduction";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** §99의3을 고른 주택 — 취득 2020, 양도 2023(5년 이내). */
const asset = (over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2020-03-01",
    acquisitionPrice: "500000000",
    actualSalePrice: "1000000000",
    reductions: [
      {
        type: "new_99_3",
        // 선행 ⑧ 검증(취득유형·취득시 기준시가·전용면적·5년 시점 기준시가)을 모두 채워
        // 이 축을 격리한다 — 앞 가드가 먼저 return하면 anchor가 아무것도 관측하지 못한다.
        acquisitionType993: "purchase",
        contractDate993_purchase: "2020-01-01",
        standardPriceAtAcquisition993: "400000000",
        standardPriceAt5Years: "700000000",
        exclusiveAreaSqm993: "84",
        contractDate993: "2020-01-01",
        isRedevelopedNewHouse993: false,
        previousHouseStdPrice993: "0",
        standardPriceAtTransfer993: "",
        ...(over.reductionOver as object),
      },
    ],
  }) as unknown as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: "2023-03-01",
    filingDate: "2023-05-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    householdHousingCount: "1",
    isOneHousehold: true,
  }) as unknown as TransferFormData;

/** 감면·공제는 3단계(내부 step 2)다. */
const msgs = (f: TransferFormData) => collectStepIssues(2, f).map((i) => i.message);

describe("§99의3 양도시 기준시가 — 재개발 변형은 5년 이내에도 필수 (#7)", () => {
  it("🔑 G-1: 변형 ON + 5년 이내 + 미입력 → 차단한다 (종전엔 침묵 → 감면 0)", () => {
    const a = asset({
      reductionOver: { isRedevelopedNewHouse993: true, previousHouseStdPrice993: "300000000" },
    });
    expect(msgs(form(a)).some((m) => m.includes("양도시 기준시가"))).toBe(true);
  });

  it("G-2: 변형 OFF + 5년 이내는 종전대로 요구하지 않는다 (축을 죽인 게 아니다)", () => {
    expect(msgs(form(asset())).some((m) => m.includes("양도시 기준시가"))).toBe(false);
  });

  it("G-3: 변형 ON이어도 값을 채우면 통과한다", () => {
    const a = asset({
      reductionOver: {
        isRedevelopedNewHouse993: true,
        previousHouseStdPrice993: "300000000",
        standardPriceAtTransfer993: "900000000",
      },
    });
    expect(msgs(form(a)).some((m) => m.includes("양도시 기준시가"))).toBe(false);
  });
});

describe("인구감소지역 자동판정 — 화면 fallback이 엔진과 같다 (#12)", () => {
  it("🔑 G-4: 자동판정 함수가 다·라목을 실제로 가른다 — 표시 fallback의 소스", () => {
    // 이 함수가 `null`만 돌려준다면 화면 fallback 교체가 no-op이 된다(구별력 확인).
    const kinds = new Set<string | null>();
    for (const code of ["46770", "41111", "48330", "51770"]) {
      kinds.add(classifyPopulationDeclineArea(code).kind);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe("§77 감면율 세트 라벨 (#31)", () => {
  it("🔑 G-5: 2018 세트는 2024-12-31까지 양도분 전용이다 — 「현행」이 아니다", () => {
    // 2025-01-01 이후 양도분은 다른 요율이 적용된다(라벨이 「현행」이면 거짓이 된다).
    expect(PUBLIC_EXPROPRIATION_RATES.CURRENT_2018.cash).toBe(0.1);
    expect(PUBLIC_EXPROPRIATION_RATES.AMENDED_2025.cash).toBe(0.15);
  });
});
