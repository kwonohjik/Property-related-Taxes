/**
 * 자산 카드 수 상한 — ⑤·⑧·⑫ 정합 (`lib/calc/asset-card-count-cap.ts`)
 *
 * ## 결함
 *
 * 「+ 지분 추가」·「+ 자산 추가」 버튼에 상한이 없었고 ⑧도 개수를 보지 않았다. ⑫는 배열 상한이 있어
 * 일반건물 지분 묶음은 11장째(주 자산 포함 전 카드가 `generalBuildingShares` · max 10), 그 밖은 12장째
 * (주 자산 1 + `companionAssets` max 10)에서 계산 단계 400이 났다 — 화면 통과 ↔ 서버 거부.
 */
import { describe, it, expect } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { assetCardCapMessage, maxAssetCards, GB_SHARES_MAX, COMPANION_ASSETS_MAX } from "@/lib/calc/asset-card-count-cap";
import { generalBuildingSharesSchema } from "@/lib/api/transfer-tax-building-share-schemas";

const GB_MSG = assetCardCapMessage(true);
const OTHER_MSG = assetCardCapMessage(false);

function gbFractionalForm(n: number) {
  return {
    ...createDefaultTransferFormData(),
    assetSplitMode: "fractional" as const,
    assets: Array.from({ length: n }, (_, i) => ({
      ...makeDefaultAsset(i + 1),
      assetKind: "general_building",
      ownershipNumerator: "1",
      ownershipDenominator: String(n),
    })),
  } as never;
}

function landCompanionForm(n: number) {
  return {
    ...createDefaultTransferFormData(),
    assetSplitMode: "companion" as const,
    assets: Array.from({ length: n }, (_, i) => ({ ...makeDefaultAsset(i + 1), assetKind: "land" })),
  } as never;
}

const messages = (form: never) => collectStepIssues(0, form).map((i) => i.message);

describe("자산 카드 수 상한", () => {
  it("상한 값 — 일반건물 지분 묶음 10장 · 그 밖 11장", () => {
    expect(maxAssetCards(true)).toBe(10);
    expect(maxAssetCards(false)).toBe(11);
  });

  it("⑧ 일반건물 지분 10장 → 상한 문구 없음 · 11장 → 차단", () => {
    expect(messages(gbFractionalForm(10))).not.toContain(GB_MSG);
    expect(messages(gbFractionalForm(11))).toContain(GB_MSG);
  });

  it("⑧ 함께 양도 토지 11장 → 상한 문구 없음 · 12장 → 차단", () => {
    expect(messages(landCompanionForm(11))).not.toContain(OTHER_MSG);
    expect(messages(landCompanionForm(12))).toContain(OTHER_MSG);
  });

  it("⑧ 일반건물이어도 함께 양도(서로 다른 물건)면 11장까지 — ④가 `companionAssets`로 보낸다", () => {
    const form = {
      ...(landCompanionForm(11) as object),
      assets: Array.from({ length: 11 }, (_, i) => ({ ...makeDefaultAsset(i + 1), assetKind: "general_building" })),
    } as never;
    expect(messages(form)).not.toContain(GB_MSG);
    expect(messages(form)).not.toContain(OTHER_MSG);
  });

  it("⑫ `generalBuildingShares` 상한 = ⑧ 상한 — max 이하는 개수로 거부하지 않고, +1은 too_big", () => {
    const share = { shareId: "s", shareLabel: "s", ownershipRatio: 0.1, acquisitionDate: "2010-01-01", valuation: {} };
    const tooBig = (n: number) => {
      const r = generalBuildingSharesSchema.safeParse(Array.from({ length: n }, (_, i) => ({ ...share, shareId: `s${i}` })));
      return !r.success && r.error.issues.some((i) => i.code === "too_big" && i.path.length === 0);
    };
    expect(tooBig(GB_SHARES_MAX)).toBe(false);
    expect(tooBig(GB_SHARES_MAX + 1)).toBe(true);
    expect(GB_SHARES_MAX).toBe(maxAssetCards(true));
    expect(COMPANION_ASSETS_MAX + 1).toBe(maxAssetCards(false));
  });
});
