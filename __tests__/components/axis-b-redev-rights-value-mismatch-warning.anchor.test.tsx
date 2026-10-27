/**
 * anchor: 축 B(같은 물건 지분 분할) — 둘째 이후 원조합원 지분의 「권리가액」(소령 §166④1호 · 물건 전체)이 첫 카드 「권리가액」과 다르면
 * 그 칸에 경고한다(막지 않는다). 계획서 `bg-axis-b-right-share-inputs.plan.md` §9.2 · 사용자 결정 「§166 권리가액끼리 비교」.
 *
 * 증여재산 평가 조합원권리가액(상증칙 §16③)과는 비교하지 않는다 — 법문이 달라 다를 수 있다(`burdened-gift-right-valuation.ts` 헤더).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset, type AssetForm } from "@/lib/stores/calc-wizard-asset";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";
import { shareRedevRightsValueMismatch } from "@/lib/calc/axis-b-redev-rights-value";

afterEach(cleanup);

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const first = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase", acquisitionDate: "2009-07-01",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgRightMemberRightsValue: "1200000000", redevRightsValue: "900000000",
    isSuccessorRightToMoveIn: false, ...HALF, ...over,
  }) as AssetForm;
const share = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(2), ...HALF, acquisitionCause: "purchase", acquisitionDate: "2009-07-01", redevApprovalDate: "2018-06-01",
    isSuccessorRightToMoveIn: false, redevRightsValue: "800000000", ...over,
  }) as AssetForm;

function shareCard(primary: AssetForm, asset: AssetForm, splitMode: "fractional" | "companion" = "fractional") {
  const { container } = render(
    <CompanionAssetCard index={1} asset={asset} primaryAsset={primary} bundledSaleMode="actual" onChange={() => {}} transferDate="2026-02-16"
      splitMode={splitMode} onFractionalToggle={() => {}} hasSiblings />,
  );
  return container.querySelector('[data-testid="redev-rights-value-mismatch-warning"]');
}

describe("둘째 지분 카드 권리가액 칸 경고", () => {
  it("첫 카드 권리가액 9억 · 둘째 8억 → 경고(첫 카드 값을 보인다)", () => {
    expect(shareCard(first(), share())?.textContent).toContain("첫 번째 지분 카드의 권리가액(900,000,000)과 다릅니다");
  });
  it("같은 값이면 경고 없음 — 증여재산 평가 조합원권리가액(12억)과는 비교하지 않는다", () => {
    expect(shareCard(first(), share({ redevRightsValue: "900000000" }))).toBeNull();
  });
  it("일반 양도 축 B도 같은 규칙(물건 단위 값 일관성)", () => {
    expect(shareCard(first({ transferType: "regular" }), share({ transferType: "regular" }))?.textContent).toContain("(900,000,000)");
  });
  it("재개발 완공 아파트 원조합원 지분도 같다", () => {
    expect(shareRedevRightsValueMismatch(share(), first({ assetKind: "redevelopment_apt", redevSubject: "apt" }))).toBe(900_000_000);
  });
  it("둘째 지분 권리가액 미입력 → 경고 없음(⑧이 따로 요구한다)", () => {
    expect(shareCard(first(), share({ redevRightsValue: "" }))).toBeNull();
  });
});

describe("범위 — 경고하지 않는 경우", () => {
  it("첫 카드가 승계 — 옛 권리가액이 남아 있어도 비교하지 않는다", () => {
    expect(shareRedevRightsValueMismatch(share(), first(successorRightTogglePatch(true)))).toBeUndefined();
    expect(shareRedevRightsValueMismatch(share(), first({ assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes" }))).toBeUndefined();
  });
  it("둘째 지분이 승계 — 그 카드에는 권리가액 칸이 없다", () => {
    expect(shareRedevRightsValueMismatch(share(successorRightTogglePatch(true)), first())).toBeUndefined();
  });
  it("함께 양도(다른 물건) 카드", () => {
    expect(shareCard(first(), share({ assetKind: "right_to_move_in", redevSubject: "right" }), "companion")).toBeNull();
  });
  it("입주권·재개발 아파트가 아닌 자산", () => {
    expect(shareRedevRightsValueMismatch(share(), first({ assetKind: "housing" }))).toBeUndefined();
  });
  it("첫 카드 자신은 대상이 아니다", () => {
    const p = first();
    const { container } = render(
      <CompanionAssetCard index={0} asset={p} primaryAsset={p} bundledSaleMode="actual" onChange={() => {}} transferDate="2026-02-16"
        splitMode="fractional" onFractionalToggle={() => {}} hasSiblings gbFractionalShares={[p, share()]} />,
    );
    expect(container.querySelector('[data-testid="redev-rights-value-mismatch-warning"]')).toBeNull();
  });
});
