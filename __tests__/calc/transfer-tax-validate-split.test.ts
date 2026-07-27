/**
 * 토지/건물 분리 직접 입력 — 총액 초과 차단 (Phase B).
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (§3-B)
 *
 * 엔진 splitPair는 한쪽만 입력 시 반대쪽을 잔액으로 도출한다 → 입력 > 총액이면 음수.
 * 엔진은 clamp하지 않으므로(조용한 오답 방지) validate가 차단한다.
 * 판정식은 엔진 export(`isSplitPairOverflow`) 단일 소스 — ⑧ 규칙 준수.
 */
import { describe, it, expect } from "vitest";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { isSplitPairOverflow } from "@/lib/tax-engine/transfer-tax-split-gain";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

function splitAsset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    hasSeperateLandAcquisitionDate: true,
    saleSplitMode: "actual" as const,
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "400,000,000",
    ...over,
  };
}

describe("isSplitPairOverflow — 엔진 판정식 (splitPair 분기와 1:1)", () => {
  it("둘 다 미입력 → 초과 불가(비율 안분)", () => {
    expect(isSplitPairOverflow(1000, undefined, undefined)).toBe(false);
  });
  it("한쪽만 입력 → 그 값이 총액 초과 시 true", () => {
    expect(isSplitPairOverflow(1000, 700, undefined)).toBe(false);
    expect(isSplitPairOverflow(1000, 1200, undefined)).toBe(true);
    expect(isSplitPairOverflow(1000, undefined, 1200)).toBe(true);
  });
  it("둘 다 입력 → 합 ≠ 총액이면 true (초과·미달 **모두**)", () => {
    expect(isSplitPairOverflow(1000, 700, 300)).toBe(false);
    expect(isSplitPairOverflow(1000, 700, 400)).toBe(true); // 초과
    expect(
      isSplitPairOverflow(1000, 300, 300),
      "🔴 합 < 총액도 차단해야 한다 — 양도가액 축에서 양도차익 과소 = 세액 과소가 침묵 통과",
    ).toBe(true);
  });
  it("경계: 정확히 총액 → 모순 아님", () => {
    expect(isSplitPairOverflow(1000, 1000, undefined)).toBe(false);
    expect(isSplitPairOverflow(1000, 600, 400)).toBe(false);
  });
});

describe("validateSplitDirectInputs — 게이트", () => {
  it("취득일 분리 OFF → 미검증", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ hasSeperateLandAcquisitionDate: false, buildingTransferPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it('분리 방식 "기준시가 비율 안분" → 양도가액 overflow 미검증 (칸 미노출, 양도시 기준시가는 입력됨)', () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({
          saleSplitMode: "apportioned",
          landStandardPriceAtTransfer: "500,000,000",
          buildingStandardPriceAtTransfer: "500,000,000",
          buildingTransferPrice: "9,999,999,999",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

describe("validateSplitDirectInputs — 양도시 기준시가 필수 (§7.2, 2026-07-28 사용자 확정)", () => {
  it("apportioned 일괄양도 + 양도시 기준시가 미입력 → 차단", () => {
    const err = validateSplitDirectInputs(splitAsset({ saleSplitMode: "apportioned" }), "자산 1");
    expect(err).toContain("양도시 기준시가");
  });

  it("estimated 파트(환산) + 양도시 기준시가 미입력 → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({ saleSplitMode: "actual", useEstimatedAcquisition: true }),
      "자산 1",
    );
    expect(err).toContain("양도시 기준시가");
  });

  it("apportioned + 양도시 토지·건물 기준시가 모두 입력 → 통과", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({
          saleSplitMode: "apportioned",
          landStandardPriceAtTransfer: "500,000,000",
          buildingStandardPriceAtTransfer: "500,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("actual 구분양도 + 실가 파트 → 양도시 기준시가 불필요(미입력 통과)", () => {
    expect(validateSplitDirectInputs(splitAsset({ saleSplitMode: "actual" }), "자산 1")).toBeNull();
  });
});

describe("validateSplitDirectInputs — 양도가액 (케이스 6·6-b)", () => {
  it("정상: 건물만 3억 (총 10억) → 통과", () => {
    expect(validateSplitDirectInputs(splitAsset({ buildingTransferPrice: "300,000,000" }), "자산 1")).toBeNull();
  });

  it("케이스 6-b: 건물만 12억 (총 10억) → 차단", () => {
    const err = validateSplitDirectInputs(splitAsset({ buildingTransferPrice: "1,200,000,000" }), "자산 1");
    expect(err).toContain("건물 양도가액");
    expect(err).toContain("음수");
  });

  it("케이스 6: 토지 7억 + 건물 4억 = 11억 (총 10억) → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({ landTransferPrice: "700,000,000", buildingTransferPrice: "400,000,000" }),
      "자산 1",
    );
    expect(err).toContain("합이 양도가액");
  });
});

describe("validateSplitDirectInputs — 취득가액 (케이스 6-c)", () => {
  it("정상: 건물만 1.5억 (총 4억) → 통과", () => {
    expect(validateSplitDirectInputs(splitAsset({ buildingAcquisitionPrice: "150,000,000" }), "자산 1")).toBeNull();
  });

  it("케이스 6-c: 토지 2.5억 + 건물 2억 = 4.5억 (총 4억) → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({ landAcquisitionPrice: "250,000,000", buildingAcquisitionPrice: "200,000,000" }),
      "자산 1",
    );
    expect(err).toContain("합이 취득가액");
  });

  it("환산취득가 모드 → 취득가액 미검증 (총액 미입력, 양도시 기준시가는 입력됨)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({
          useEstimatedAcquisition: true,
          landStandardPriceAtTransfer: "500,000,000",
          buildingStandardPriceAtTransfer: "500,000,000",
          buildingAcquisitionPrice: "9,999,999,999",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("매매사례가액 모드 → 취득가액 미검증 (추계액 · 칸 숨김)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ isSalesCaseAcquisition: true, buildingAcquisitionPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

describe("validateSplitDirectInputs — 자본적지출 (총액 = directExpenses, 엔진 input.expenses 소스)", () => {
  it("🔴 capitalExpenditure는 총액이 아니다 — 엔진은 directExpenses(=input.expenses)를 쓴다", () => {
    // capitalExpenditure를 총액으로 보면 판정식만 공유하고 피연산자가 달라져 단일 소스가 무효화된다.
    // 엔진은 expenses=0 → 독립 입력으로 처리하므로 모순 자체가 없다 → validate도 통과여야 한다.
    expect(
      validateSplitDirectInputs(
        splitAsset({ capitalExpenditure: "100,000,000", buildingDirectExpenses: "999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("legacy directExpenses 1억 + 건물만 3천만 → 통과(잔액 7천만)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ directExpenses: "100,000,000", buildingDirectExpenses: "30,000,000" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("legacy directExpenses 1억 + 토지 7천만 + 건물 5천만 = 1.2억 → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({
        directExpenses: "100,000,000",
        landDirectExpenses: "70,000,000",
        buildingDirectExpenses: "50,000,000",
      }),
      "자산 1",
    );
    expect(err).toContain("자본적지출");
  });
});

describe("validateSplitDirectInputs — 총액 매핑 다분기 경로는 미검증 (dual-truth 회피)", () => {
  it("부담부증여 → 미검증", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ transferType: "burdened_gift", buildingTransferPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("지분(분수) 모드 → 미검증 (총액이 지분 안분됨)", () => {
    // 판정은 API 정본 getOwnershipRatio(asset) < 1.0 — 기본 자산은 "100"/"100"(비율 1.0)이라 지분 아님.
    expect(
      validateSplitDirectInputs(
        splitAsset({ ownershipNumerator: "1", ownershipDenominator: "2", buildingTransferPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("기본 자산(100/100)은 지분 모드가 아니다 — 검증 대상 (회귀 방어)", () => {
    const err = validateSplitDirectInputs(splitAsset({ buildingTransferPrice: "9,999,999,999" }), "자산 1");
    expect(err, "100/100을 지분으로 오판하면 검증이 통째로 죽는다").not.toBeNull();
  });
});
