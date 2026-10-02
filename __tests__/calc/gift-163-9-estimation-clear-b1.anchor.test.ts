/**
 * B1 — 증여로 바뀐 표준·상가 자산에 남은 추계 플래그 (2026-10-02, G3의 형제)
 *
 * 증여 카드(`CompanionAcqGiftBlock`)에는 「취득가액 산정 방식」 라디오가 없다. 매매에서 고른 환산·감정가액·매매사례가액이
 * 남으면 ⑧ §163⑨ 오류(`giftEstimatedModeError`)가 뜨는데 끌 칸이 없었다. ④가 같은 플래그를 엔진에 보내므로
 * 검증을 좁히지 않고 입력 쪽에서 비운다. 경로 2개가 같은 patch(`giftEstimationClearPatch`)를 쓴다:
 * 원인 전환(화면 — E2E `transfer-dead-end-defects.spec.ts` B1이 고정) · 복원 마이그레이션(여기서 고정).
 */
import { describe, it, expect } from "vitest";
import { giftEstimationClearPatch } from "@/lib/calc/transfer-tax-split-acq-mode";
import { giftEstimatedModeBlocked, giftEstimatedModeError } from "@/lib/calc/transfer-tax-validate-gift-163-9";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

describe("giftEstimationClearPatch", () => {
  it("증여 — 추계 플래그 3종을 비운다", () => {
    expect(giftEstimationClearPatch("gift")).toEqual({
      useEstimatedAcquisition: false,
      isAppraisalAcquisition: false,
      isSalesCaseAcquisition: false,
    });
  });
  it.each(["purchase", "inheritance", "carryover_gift", "newConstruction", undefined])(
    "%s — 건드리지 않는다 (추계가 허용되거나 다른 축)",
    (cause) => {
      expect(giftEstimationClearPatch(cause)).toEqual({});
    },
  );
});

const raw = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetKind: "housing",
  acquisitionCause: "gift",
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  ...over,
});
const FLAGS = ["useEstimatedAcquisition", "isAppraisalAcquisition", "isSalesCaseAcquisition"] as const;

describe("복원 마이그레이션 — migrateAsset", () => {
  it.each(FLAGS)("🔑 증여(1985 이후)에 남은 %s를 비운다", (flag) => {
    const a = migrateAsset(raw({ useEstimatedAcquisition: false, [flag]: true }));
    for (const f of FLAGS) expect(a[f], f).toBe(false);
  });

  it.each(["land", "building", "presale_right", "commercial_building"])("%s도 같다", (assetKind) => {
    expect(migrateAsset(raw({ assetKind })).useEstimatedAcquisition).toBe(false);
  });

  it("🔑 긍정 짝: 매매의 환산은 그대로 (게이트를 넓힌 게 아니다)", () => {
    expect(migrateAsset(raw({ acquisitionCause: "purchase" })).useEstimatedAcquisition).toBe(true);
  });
  it("긍정 짝: 1985 이전 증여는 ⑧이 막지 않는 영역(§176의2④ 의제취득) — 건드리지 않는다", () => {
    expect(migrateAsset(raw({ acquisitionDate: "1980-05-01" })).useEstimatedAcquisition).toBe(true);
  });
  it.each(["redevelopment_apt", "right_to_move_in", "general_building"])(
    "🔑 %s — 범위 밖: 플래그 의미가 다르거나 자체 검증·라디오가 있다 (재개발 「증여 종전자산 환산 차단」 오류가 시드로 닿아야 한다)",
    (assetKind) => {
      const a = migrateAsset(raw({ assetKind, hasSeperateLandAcquisitionDate: true }));
      expect(a.useEstimatedAcquisition).toBe(true);
    },
  );
  it("겸용주택도 범위 밖", () => {
    expect(migrateAsset(raw({ isMixedUseHouse: true })).useEstimatedAcquisition).toBe(true);
  });
  it("긍정 짝: 부담부증여도 ⑧이 막지 않는다 — 건드리지 않는다", () => {
    expect(migrateAsset(raw({ transferType: "burdened_gift" })).useEstimatedAcquisition).toBe(true);
  });
});

describe("⑧과 같은 술어 — 마이그레이션이 비운 폼은 §163⑨ 오류가 없다", () => {
  it("비우기 전에는 오류 · 비운 뒤에는 오류 없음", () => {
    const before = raw() as unknown as AssetForm;
    expect(giftEstimatedModeBlocked(before)).toBe(true);
    expect(giftEstimatedModeError(before, "자산 1")).toMatch(/증여 취득 자산은 환산취득가/);
    const after = migrateAsset(raw());
    expect(giftEstimatedModeBlocked(after)).toBe(false);
    expect(giftEstimatedModeError(after, "자산 1")).toBeNull();
  });
});
