/**
 * anchor: 상속 취득 상가에서도 부수토지 판정 ⑧이 **도달한다** (UI 리뷰 보통).
 *
 * ⑤는 이 섹션을 `assetKind === "commercial_building"`만 보고 마운트한다 —
 * 「취득방법 무관(**상속 포함**)」이 그 자리의 명시 규약이다
 * (`AssetSectionAcquisition.tsx:292~296`). 그런데 ⑧ 진입부는
 *
 *   if (상가 && acquisitionCause === "inheritance") return validateCommercialInheritanceAsset(...)
 *
 * 로 **먼저 종료**했고, `validateCommercialAppurtenantLand` 호출은 그 아래에 있었다.
 * ⇒ 상속 상가에서는 부수토지 검증이 **한 줄도 실행되지 않았다**:
 *   · 두 면적 중 하나만 채우면 침묵하고,
 *   · 용도지역을 안 고르면 ④가 payload를 만든 채 서버에서 400으로 죽는다.
 *
 * 호출을 상속 인터셉트 **위**로 올렸다. 이 검증은 취득 모드·취득원인과 **직교**하고
 * 미해당이면 `null`로 계속 진행하므로 상속 경로를 가로채지 않는다(anchor A-4).
 */
import { describe, it, expect } from "vitest";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const cb = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    acquisitionPrice: "500000000",
    actualSalePrice: "1000000000",
    ...over,
  }) as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: "2024-06-01",
    contractTotalPrice: "1000000000",
    assets: [a],
  }) as unknown as TransferFormData;

const err = (a: AssetForm) => validateAssetEntry(a, 0, form(a));

/** 상속 상가의 선행 검증(상증법 평가액 등)을 채워 이 축을 격리한다. */
const INHERITED = {
  acquisitionCause: "inheritance" as const,
  cbInheritanceStdPriceAtAcq: "400000000",
};

describe("상가 부수토지 판정 — 상속 취득에서도 ⑧이 도달한다", () => {
  it("🔑 A-1: 상속 + 면적 한쪽만 입력 → 나머지 한쪽을 요구한다 (종전엔 침묵)", () => {
    const a = cb({ ...INHERITED, cbTotalLandArea: "500" });
    expect(err(a)).toContain("집합건물 전체 바닥면적");
  });

  it("🔑 A-2: 상속 + 면적 둘 다 입력 + 용도지역 미선택 → 차단한다 (종전엔 서버 400)", () => {
    const a = cb({ ...INHERITED, cbTotalLandArea: "500", cbTotalBuildingFootprintArea: "200" });
    expect(err(a)).toContain("용도지역을 선택하세요");
  });

  it("🔑 A-3: 상속 + §101① 단서 ON + 면적 공란 → 차단한다", () => {
    const a = cb({ ...INHERITED, cbUnapprovedBuilding: true });
    expect(err(a)).toContain("허가·사용승인 미이행");
  });

  it("A-4: 부수토지 미해당(면적 공란)이면 상속 경로를 가로채지 않는다", () => {
    // 상속 평가액을 비우면 **상속 전용 메시지**가 나와야 한다 — 순서를 바꾸면서
    // 상속 검증을 삼키지 않았음을 고정한다.
    const a = cb({ acquisitionCause: "inheritance" });
    const m = err(a);
    expect(m).not.toBeNull();
    expect(m).not.toContain("부수토지 판정");
  });

  it("A-5: 매매 취득(종전 경로)은 그대로 동작한다", () => {
    const a = cb({ cbTotalLandArea: "500", cbTotalBuildingFootprintArea: "200" });
    expect(err(a)).toContain("용도지역을 선택하세요");
  });
});
