/**
 * D0 — 「토지는 다른 원인으로 취득」(`landAcquisitionCause`) 클라이언트 층(④⑥⑧) 정합 (2026-10-08)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §2.3 G-3·G-4·G-5·G-6·G-8
 *
 * 변경 전 실측(같은 시드):
 *   G-4 컴패니언 ④(`buildAssetPayload`)가 `landAcquisitionCause`·`landDecedentAcquisitionDate`를 싣지 않았다
 *   G-5 사이드바 `separateAcqPartsSum` → { sum: 300,000,000(토지만), pending: true } — 신축비용 후퇴가 ⑥에만 없었다
 *   G-6 원인을 매매로 바꿔도 남은 토지 원인이 전송됐다(블록은 신축에서만 렌더 — 끌 칸이 없다)
 *   G-8 단순 증여의 증여자 취득일을 보냈다(엔진은 통산하지 않는다 — §104②2호는 이월과세만)
 */
import { describe, it, expect } from "vitest";
import { buildLandPartCausePayload, buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { effectiveLandAcquisitionCause, splitBuildingAcqPriceInput } from "@/lib/calc/transfer-land-part-cause";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 토지 상속(2015) + 건물 신축(2020) — 토글 ON 시 UI가 세팅하는 상태. */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "newConstruction",
    acquisitionDate: "2020-06-01",
    landAcquisitionCause: "inheritance",
    landCauseHost: "newConstruction", // 토글 ON이 함께 쓰는 호스트(D1-2)
    landAcquisitionDate: "2015-03-10",
    landDecedentAcquisitionDate: "1990-04-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    fixedAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,000,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "600,000,000",
    buildingTransferPrice: "400,000,000",
    landStandardPriceAtTransfer: "600,000,000",
    buildingStandardPriceAtTransfer: "400,000,000",
    ...over,
  } as AssetForm;
}

const ratioed = (v: string | undefined) => {
  const n = parseInt((v ?? "").replace(/,/g, ""), 10);
  return isFinite(n) && n > 0 ? n : undefined;
};

describe("G-6 유효 원인 leaf — 블록이 닫힌 자산의 잔재는 「없음」", () => {
  it("신축 + 주택 + 분리 ON이면 저장값 그대로", () => {
    expect(effectiveLandAcquisitionCause(asset())).toBe("inheritance");
  });
  it.each([
    ["매매로 전환", { acquisitionCause: "purchase" as const }],
    ["상속으로 전환", { acquisitionCause: "inheritance" as const }],
    ["토지로 종류 변경", { assetKind: "land" as const }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["분리 OFF(원인 전환이 분리만 끈 잔재)", { hasSeperateLandAcquisitionDate: false }],
  ])("%s → \"\"", (_n, over) => {
    expect(effectiveLandAcquisitionCause(asset(over))).toBe("");
  });

  it("④ 매매로 바꾼 자산은 토지 원인을 보내지 않는다 — 종전엔 상속 통산이 계속 계산에 쓰였다", () => {
    expect(buildLandPartCausePayload(asset({ acquisitionCause: "purchase" }))).toEqual({});
  });

  it("④ 매매로 바꾼 자산은 신축비용을 건물 취득가액으로 후퇴시키지 않는다", () => {
    const p = buildSplitPayload(asset({ acquisitionCause: "purchase" }), { isBurdenedGift: false, usesPhd: false, ratioed });
    expect(p.buildingAcquisitionPrice).toBeUndefined();
  });
});

describe("G-8 단순 증여의 증여자 취득일은 보내지 않는다", () => {
  it("gift → 원인만", () => {
    expect(
      buildLandPartCausePayload(asset({ landAcquisitionCause: "gift", landDonorAcquisitionDate: "2001-01-01" })),
    ).toEqual({ landAcquisitionCause: "gift" });
  });
  it("inheritance → 원인 + 피상속인 취득일", () => {
    expect(buildLandPartCausePayload(asset())).toEqual({
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "1990-04-01",
    });
  });
});

describe("G-4 컴패니언 ④도 토지 원인을 싣는다", () => {
  it("함께 양도 자산 payload에 landAcquisitionCause·landDecedentAcquisitionDate", () => {
    const p = buildAssetPayload(asset(), "apportioned", "2026-06-30") as Record<string, unknown>;
    expect(p.landAcquisitionCause).toBe("inheritance");
    expect(p.landDecedentAcquisitionDate).toBe("1990-04-01");
  });
  it("분리가 꺼진 컴패니언은 싣지 않는다", () => {
    const p = buildAssetPayload(asset({ hasSeperateLandAcquisitionDate: false }), "apportioned", "2026-06-30") as Record<string, unknown>;
    expect(p.landAcquisitionCause).toBeUndefined();
  });
});

describe("G-5 사이드바 합계 — ④·⑧과 같은 신축비용 후퇴", () => {
  it("토지 평가액 + 신축비용 = 7억, 확정", () => {
    expect(separateAcqPartsSum(asset())).toEqual({ sum: 700_000_000, pending: false });
  });
  it("세 층이 같은 leaf — 건물 파트 칸을 직접 넣으면 그 값이 우선", () => {
    const a = asset({ buildingAcquisitionPrice: "350,000,000" });
    expect(splitBuildingAcqPriceInput(a)).toBe("350,000,000");
    expect(separateAcqPartsSum(a).sum).toBe(650_000_000);
  });
});

describe("G-3·G-2 ⑧ — 엔진·⑫와 같은 leaf", () => {
  it("상속 토지 + 피상속인 취득일 미입력 → 차단, 칸으로 이동", () => {
    const { result, fieldOf } = collectWithFields(() =>
      validateSplitDirectInputs(asset({ landDecedentAcquisitionDate: "" }), "자산1"),
    );
    expect(result).toContain("피상속인 취득일이 필요합니다");
    expect(fieldOf(result!)).toBe("landDecedentAcquisitionDate");
  });

  it("증여 토지는 증여자 취득일 없이 통과 (G-8 — 칸 자체가 없다)", () => {
    expect(validateSplitDirectInputs(asset({ landAcquisitionCause: "gift", landDecedentAcquisitionDate: "" }), "자산1")).toBeNull();
  });

  it("상속 토지에 환산 잔재 → 차단(고칠 라디오가 없어 방법을 안내)", () => {
    const msg = validateSplitDirectInputs(asset({ landAcqMode: "estimated" }), "자산1");
    expect(msg).toContain("상속·증여로 취득한 토지는 취득가액을 환산취득가");
    expect(msg).toContain("껐다가 다시 켜면 실거래가로 고정");
  });

  it("매매로 바꾼 잔재는 토지 원인 규칙을 적용하지 않는다(④가 보내지 않으므로)", () => {
    const msg = validateSplitDirectInputs(
      asset({ acquisitionCause: "purchase", landDecedentAcquisitionDate: "", buildingAcquisitionPrice: "400,000,000" }),
      "자산1",
    );
    expect(msg ?? "").not.toContain("피상속인");
  });
});

/**
 * ⑧ 실제 진입점 — 신축 분기는 `validateSplitDirectInputs`에 닿기 전에 반환한다(14지점 점검 FAIL-1).
 * 위 테스트들은 `validateSplitDirectInputs`를 직접 불러 그 단절을 잡지 못했다.
 */
describe("G-3 ⑧ 진입점(validateAssetAcquisition) — 신축 분기에서도 닿는다", () => {
  const nc = (over: Partial<AssetForm> = {}) => asset({ occupancyApprovalDate: "2020-06-01", ...over });

  it("피상속인 취득일 미입력 → 차단, 칸으로 이동", () => {
    const { result, fieldOf } = collectWithFields(() =>
      validateAssetAcquisition(nc({ landDecedentAcquisitionDate: "" }), "자산1", "2026-06-30"),
    );
    expect(result).toContain("피상속인 취득일이 필요합니다");
    expect(fieldOf(result!)).toBe("landDecedentAcquisitionDate");
  });

  it("입력하면 통과", () => {
    expect(validateAssetAcquisition(nc(), "자산1", "2026-06-30")).toBeNull();
  });

  it("토글 OFF(분리 꺼짐) 신축은 토지 원인 규칙을 보지 않는다", () => {
    expect(
      validateAssetAcquisition(nc({ hasSeperateLandAcquisitionDate: false, landDecedentAcquisitionDate: "" }), "자산1", "2026-06-30"),
    ).toBeNull();
  });
});
