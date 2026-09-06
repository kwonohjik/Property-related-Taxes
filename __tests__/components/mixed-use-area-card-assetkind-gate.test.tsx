/**
 * @vitest-environment jsdom
 *
 * anchor: 겸용주택 면적 11칸 카드가 `assetKind` 게이트를 함께 본다 — UI 리뷰 高.
 *
 * 같은 축의 다른 지점은 모두 `assetKind === "housing"`을 함께 본다:
 *   `areaScenarioOptions`(:184) · `isMixedUseSeparated`(`AssetFootprintField.tsx:51`) ·
 *   ④ `buildMixedUsePayload`(`transfer-tax-api-mixed-use.ts:23`) · ③ `MixedUseExpandedPanel`
 *
 * 이 카드만 `isMixedUseHouse`만 봐서, 겸용을 켠 뒤 자산 종류를 토지·상가 등으로 바꾸면
 * 축 A(면적 입력 방식 + 면적 칸)와 겸용 11칸 카드가 **동시에** 떴다. ④는 `assetKind`
 * 게이트 때문에 겸용 payload를 만들지 않으므로 **그 11칸에 채운 값은 전부 버려진다** —
 * 계산에 쓰이지 않는 카드에 같은 물건의 토지 면적을 두 번 넣게 되고, 카드 안의 겸용 토글은
 * 이미 사라진 상태라 카드를 없앨 방법도 없었다.
 *
 * ⚠️ 자산 종류 **전환**으로 들어오는 경로는 `housing-flag-reset.ts`(2026-09-07)가 플래그를
 *    비워 막는다. 그러나 stale sessionStorage·이력 복원분은 전환을 거치지 않으므로
 *    **렌더 게이트가 정본**이다(memory `feedback_new_asset_field_stale_sessionstorage_guard`).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AssetAreaSection } from "@/components/calc/transfer/asset-sections/AssetAreaSection";
import { isMixedUseSeparated } from "@/components/calc/transfer/asset-sections/AssetFootprintField";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return { ...makeDefaultAsset(1), isMixedUseHouse: true, ...over } as AssetForm;
}

/** 겸용 11칸 카드가 렌더됐는가 — 그 카드에만 있는 라벨로 판정한다. */
function hasMixedUseCard(a: AssetForm): boolean {
  const { container } = render(<AssetAreaSection asset={a} onChange={() => {}} />);
  return (container.textContent ?? "").includes("전체 토지 면적");
}

describe("겸용 면적 카드 — assetKind 게이트", () => {
  it("🔑 M-1: 주택 + 겸용이면 렌더된다 (기존 동작)", () => {
    expect(hasMixedUseCard(asset({ assetKind: "housing" }))).toBe(true);
  });

  it("🔑 M-2: 겸용 플래그가 남아도 비주택이면 렌더되지 않는다 (④가 버릴 값을 받지 않는다)", () => {
    for (const k of ["land", "commercial_building", "general_building"] as const) {
      expect(hasMixedUseCard(asset({ assetKind: k })), `${k}에서 렌더됐다`).toBe(false);
    }
  });

  it("M-3: 게이트 술어가 형제와 같은 것이다 (복제 금지)", () => {
    expect(isMixedUseSeparated(asset({ assetKind: "housing" }))).toBe(true);
    expect(isMixedUseSeparated(asset({ assetKind: "land" }))).toBe(false);
  });
});
