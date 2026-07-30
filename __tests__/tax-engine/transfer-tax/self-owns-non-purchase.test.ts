/**
 * anchor: 소유자 분리(selfOwns)를 **상속·증여 등 비-매매 취득원인**에서도 성립시킨다 [요구 C].
 *
 * 계획서: docs/02-design/features/transfer-self-owns-non-purchase.plan.md
 *
 * 🔴 현행 결함: `selfOwns`는 `splitDetail`이 있을 때만 소비된다(transfer-tax.ts:315).
 *   `splitDetail`을 만드는 `calcSplitGain`은 ① `landAcquisitionDate` ② 안분 비율(취득시 기준시가)
 *   둘 다 요구하는데 상속·증여 UI에는 어느 것도 없다 → `selfOwns`가 조용히 무시되고
 *   **비소유 파트까지 전액 과세**된다.
 *
 * 불변식:
 *   · 상속 평가액은 STEP 0.45에서 `input.acquisitionPrice`에 주입되므로(inheritance-acquisition-helpers.ts:204)
 *     파트별 취득가액 입력 없이 **§166⑥ 기준시가 비율 안분**으로 나뉜다.
 *   · 취득일이 하나(상속개시일)이므로 `isSeparateAcquisition`은 false — 파트별 완결 규칙 미발동.
 *   · 안분된 두 파트의 합은 총 취득가액과 같다(잔액 도출 — splitPair).
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/**
 * 상속 취득 자산 — 건물만 본인 소유, 토지는 타인(배우자 등).
 * 취득일은 상속개시일 하나이므로 토지·건물이 같다(별개취득 아님).
 */
const INHERITED = {
  propertyType: "building",
  transferDate: new Date("2025-10-01"),
  acquisitionDate: new Date("2020-03-15"),
  transferPrice: 500_000_000,
  // STEP 0.45가 주입한 상속 평가액(§163⑨) — 엔진 진입 시점엔 이미 채워져 있다
  acquisitionPrice: 200_000_000,
  selfOwns: "building_only",
  acquisitionCause: "inheritance",
  // 양도가액 안분 근거 — 일괄양도 + 양도시 기준시가 비율(§166⑥ → 부가세령 §64①1호)
  saleSplitMode: "apportioned",
  landStandardPriceAtTransfer: 300_000_000,
  buildingStandardPriceAtTransfer: 100_000_000,
} as unknown as TransferTaxInput;

/** 취득시 기준시가 — 토지분 = 단가 × 면적, 건물분 = 총액 − 토지분(§99①1호) */
const ACQ_STD = {
  standardPricePerSqmAtAcquisition: 1_000_000,
  acquisitionArea: 100,
  standardPriceAtAcquisition: 250_000_000,
} as const;

const input = (over: Record<string, unknown>) =>
  ({ ...INHERITED, ...over }) as unknown as TransferTaxInput;

describe("N1 — 전제 확증: 토지 취득일이 없으면 selfOwns가 무시된다", () => {
  it("splitDetail 자체가 만들어지지 않는다 (→ 상위에서 전체 양도차익 과세)", () => {
    expect(calcSplitGain(input({ ...ACQ_STD })), "landAcquisitionDate 가드").toBeNull();
  });
});

describe("N2 — 토지 취득일만으로는 부족하다 (기준시가 없으면 안분 불가)", () => {
  it("안분 비율을 만들 수 없어 여전히 null", () => {
    expect(
      calcSplitGain(input({ landAcquisitionDate: new Date("2020-03-15") })),
      "취득시 기준시가가 없으면 취득가액을 토지·건물로 나눌 수 없다",
    ).toBeNull();
  });
});

describe("N3 — 토지 취득일 + 취득시 기준시가 → 분리 성립", () => {
  const r = () =>
    calcSplitGain(input({ ...ACQ_STD, landAcquisitionDate: new Date("2020-03-15") }))!;

  it("splitDetail이 생성되고 selfOwns가 전달된다", () => {
    expect(r()).not.toBeNull();
    expect(r().selfOwns).toBe("building_only");
  });

  it("취득가액이 §166⑥ 취득시 기준시가 비율로 안분된다", () => {
    // 토지분 기준시가 = 1,000,000 × 100 = 100,000,000 / 건물분 = 250,000,000 − 100,000,000
    // 토지 비율 = 100,000,000 ÷ 250,000,000 = 0.4
    const { land, building } = r();
    expect(land.acquisitionPrice).toBe(80_000_000); // floor(200,000,000 × 0.4)
    expect(building.acquisitionPrice).toBe(120_000_000);
  });

  it("파트 합계 = 총 취득가액 (잔액 도출 — 누락·중복 없음)", () => {
    const { land, building } = r();
    expect(land.acquisitionPrice + building.acquisitionPrice).toBe(200_000_000);
  });

  it("양도가액은 **양도시** 기준시가 비율로 안분된다 (취득시 비율 아님)", () => {
    // 토지 300,000,000 : 건물 100,000,000 → 토지 75%
    const { land, building } = r();
    expect(land.transferPrice).toBe(375_000_000);
    expect(building.transferPrice).toBe(125_000_000);
  });

  it("본인 소유(건물) 파트의 양도차익이 산출된다", () => {
    expect(r().building.gain).toBe(5_000_000); // 125,000,000 − 120,000,000
  });
});

describe("N4 — 취득일이 같으므로 별개취득 규칙은 발동하지 않는다", () => {
  it("파트별 취득가액을 입력하지 않아도 차단되지 않는다", () => {
    // 별개취득(isSeparateAcquisition=true)이면 파트별 취득가액이 필수라 throw한다.
    // 상속·증여는 취득일이 하나이므로 그 규칙 대상이 아니다.
    expect(() =>
      calcSplitGain(input({ ...ACQ_STD, landAcquisitionDate: new Date("2020-03-15") })),
    ).not.toThrow();
  });

  it("개산공제는 없다 — 상속 평가액은 실지거래가액에 준하는 확정 가액(actual 모드)", () => {
    const r = calcSplitGain(input({ ...ACQ_STD, landAcquisitionDate: new Date("2020-03-15") }))!;
    expect(r.land.appraisalDeduction).toBe(0);
    expect(r.building.appraisalDeduction).toBe(0);
  });
});

describe("N5 — 증여도 동형", () => {
  it("증여 신고가액(acquisitionPrice)이 같은 규칙으로 안분된다", () => {
    const r = calcSplitGain(
      input({
        ...ACQ_STD,
        acquisitionCause: "gift",
        landAcquisitionDate: new Date("2020-03-15"),
      }),
    )!;
    expect(r.selfOwns).toBe("building_only");
    expect(r.land.acquisitionPrice + r.building.acquisitionPrice).toBe(200_000_000);
  });
});

describe("N6 — 회귀: 소유자 분리가 없으면 종전대로", () => {
  it("selfOwns='both' + 취득일 동일 → 분리 계산은 돌되 양쪽 gain이 모두 살아 있다", () => {
    const r = calcSplitGain(
      input({ ...ACQ_STD, selfOwns: "both", landAcquisitionDate: new Date("2020-03-15") }),
    )!;
    expect(r.selfOwns).toBe("both");
    expect(r.land.gain + r.building.gain).toBe(500_000_000 - 200_000_000);
  });
});

// ─── 배관(API·validate) anchor — 계획서 §4.2·§4.5 ────────────────────────────
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 상속 취득 + 건물만 본인 소유 — 토지 취득일은 입력받지 않는다(취득일이 하나). */
function inheritedAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "2020-03-15",
    selfOwns: "building_only",
    hasSeperateLandAcquisitionDate: false, // 비-매매는 이 플래그를 켜지 않는다
    actualSalePrice: "500,000,000",
    saleSplitMode: "apportioned",
    landStandardPriceAtTransfer: "300,000,000",
    buildingStandardPriceAtTransfer: "100,000,000",
    standardPricePerSqmAtAcq: "1,000,000",
    acquisitionArea: "100",
    standardPriceAtAcq: "250,000,000",
    ...over,
  } as AssetForm;
}

describe("N7 — API ⑬: 토지 취득일 미입력이어도 acquisitionDate로 후퇴한다", () => {
  const payload = (a: AssetForm) =>
    buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed: () => undefined });

  it("selfOwns ≠ both → landAcquisitionDate = acquisitionDate", () => {
    expect(payload(inheritedAsset()).landAcquisitionDate).toBe("2020-03-15");
  });

  it("취득일이 같으므로 별개취득으로 판정되지 않는다", () => {
    expect(payload(inheritedAsset()).isSeparateAcquisition).toBe(false);
  });

  it("회귀 — selfOwns='both'이고 분리 토글도 없으면 전송하지 않는다", () => {
    const p = payload(inheritedAsset({ selfOwns: "both" }));
    expect(p.landAcquisitionDate).toBeUndefined();
  });
});

describe("N8 — validate ⑧: 취득시 기준시가가 없으면 차단한다", () => {
  it("3요소 완비 → 통과", () => {
    expect(validateSplitDirectInputs(inheritedAsset(), "자산 1")).toBeNull();
  });

  it("🔴 ㎡당 공시지가 미입력 → 차단 (엔진이 조용히 selfOwns를 무시하기 전에)", () => {
    expect(
      validateSplitDirectInputs(inheritedAsset({ standardPricePerSqmAtAcq: "" }), "자산 1"),
    ).toMatch(/개별공시지가/);
  });

  it("🔴 기준시가 총액 미입력 → 차단 (건물분 = 총액 − 토지분)", () => {
    expect(
      validateSplitDirectInputs(inheritedAsset({ standardPriceAtAcq: "" }), "자산 1"),
    ).toMatch(/기준시가 총액/);
  });

  it("회귀 — selfOwns='both'이면 요구하지 않는다", () => {
    expect(
      validateSplitDirectInputs(
        inheritedAsset({ selfOwns: "both", standardPricePerSqmAtAcq: "", standardPriceAtAcq: "" }),
        "자산 1",
      ),
    ).toBeNull();
  });
});
