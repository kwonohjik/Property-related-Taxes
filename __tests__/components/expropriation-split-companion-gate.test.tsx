/**
 * anchor: 「토지·건물 분리 양도 + 공익수용 환산」 — ⑤가 ⑧과 **같은 축**을 본다 (UI 리뷰 보통).
 *
 * ⑧ `validateSplitLandExprAsset(a, label, transferDate, index > 0)`은 컴패니언(함께양도
 * 두 번째 이후)이면 **값과 무관하게** 차단한다(A05, 2026-09-02 확정 — 그 2필드는 ④⑫⑭
 * 어디에도 없어 엔진에 도달하지 않고, 조합 전체가 HTTP 500으로 죽는다).
 *
 * 그런데 ⑤ `ExpropriationBlock`은 `isCompanionBundle`을 **받지 않아** 그 조합에서도
 * 「② 토지분 보상액 총액」·「③ 토지분 보상산정 기초 기준시가 총액」 2칸을 그대로 렌더했다.
 * ⇒ 사용자는 채울 수 있는 칸을 채운 뒤 「함께양도 자산은 … 지원하지 않습니다」로 막혔다.
 *
 * 이제 칸 대신 **그 사유**를 보여준다(침묵 숨김 금지).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExpropriationBlock } from "@/components/calc/transfer/ExpropriationBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 건물 split + 수용 + 환산 + 양도 ≥ 2009-02-04 — 토지분 총액 트랙이 열리는 최소 조건. */
const splitBuilding = (): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "building",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-01-01",
    hasSeperateLandAcquisitionDate: true,
    useEstimatedAcquisition: true,
    parcelMode: false,
    reductions: [{ type: "public_expropriation" }],
  }) as unknown as AssetForm;

const view = (isCompanionBundle: boolean) =>
  render(
    <ExpropriationBlock
      asset={splitBuilding()}
      onChange={() => {}}
      transferDate="2024-06-01"
      isCompanionBundle={isCompanionBundle}
    />,
  );

describe("공익수용 토지분 총액 트랙 — 컴패니언 축", () => {
  it("🔑 E-1: 컴패니언이면 ⑧이 막는 2칸을 렌더하지 않는다", () => {
    view(true);
    expect(screen.queryByText("② 토지분 보상액 총액")).toBeNull();
    expect(screen.queryByText("③ 토지분 보상산정 기초 기준시가 총액")).toBeNull();
  });

  it("🔑 E-2: 대신 차단 사유를 보여준다 (침묵 숨김이 아니다)", () => {
    view(true);
    expect(screen.getByText(/함께양도\(두 번째 이후\) 자산은/)).toBeTruthy();
  });

  it("🔑 E-3: 첫 자산(비-컴패니언)에서는 종전대로 2칸이 있다", () => {
    view(false);
    expect(screen.getByText("② 토지분 보상액 총액")).toBeTruthy();
    expect(screen.getByText("③ 토지분 보상산정 기초 기준시가 총액")).toBeTruthy();
  });

  it("E-4: 첫 자산에서는 차단 안내가 뜨지 않는다", () => {
    view(false);
    expect(screen.queryByText(/함께양도\(두 번째 이후\) 자산은/)).toBeNull();
  });

  it("E-5: prop 기본값은 비-컴패니언이다 (기존 호출부 무변경 보장)", () => {
    render(
      <ExpropriationBlock asset={splitBuilding()} onChange={() => {}} transferDate="2024-06-01" />,
    );
    expect(screen.getByText("② 토지분 보상액 총액")).toBeTruthy();
  });
});
