/**
 * anchor — 일반건물 양도가액 결정 방식 **입력 위젯** (Phase 2-E · ⑤)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §5 · §6
 *
 * ## 노출 규칙
 *
 * | 상황 | 화면 |
 * |---|---|
 * | 일괄양도(기본) | 라디오만 — 양도가액 2칸은 숨긴다 |
 * | 구분양도 | 2칸 + §166⑧ 예외 카드 |
 * | 증축(S-10) · 부담부증여(S-11) | **입력 대신 사유 안내** — 칸을 띄우고 validate에서 막으면 dead-end다 |
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GeneralBuildingSaleSplitSection } from "@/components/calc/transfer/GeneralBuildingSaleSplitSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

let lastPatch: Partial<AssetForm> = {};

function Harness({ init, blockedReason }: { init?: Partial<AssetForm>; blockedReason?: string }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    ...init,
  } as AssetForm);

  return (
    <GeneralBuildingSaleSplitSection
      asset={asset}
      onChange={(patch) => {
        lastPatch = patch;
        setAsset((a) => ({ ...a, ...patch }));
      }}
      sectionNum="③"
      {...(blockedReason ? { blockedReason } : {})}
    />
  );
}

describe("⑤-1 — 모드에 따라 입력 칸이 갈린다", () => {
  it("일괄양도(기본)에서는 양도가액 2칸이 없다", () => {
    render(<Harness />);
    expect(screen.getByTestId("gb-sale-split-mode")).toBeTruthy();
    expect(screen.queryByTestId("gb-land-transfer-price")).toBeNull();
    expect(screen.queryByTestId("gb-building-transfer-price")).toBeNull();
  });

  it("구분양도를 고르면 2칸이 나온다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByTestId("gb-land-transfer-price")).toBeTruthy();
    expect(screen.getByTestId("gb-building-transfer-price")).toBeTruthy();
  });

  it("라디오를 바꾸면 폼에 반영된다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /구분양도/ }));
    expect(lastPatch.saleSplitMode).toBe("actual");
  });

  it("§166⑧ 예외 카드는 구분양도에서만 보인다 — 판정 자체가 그때만 돈다", () => {
    render(<Harness />);
    expect(screen.queryByTestId("sale-split-exemption-toggle")).toBeNull();
    cleanup();
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByTestId("sale-split-exemption-toggle")).toBeTruthy();
  });

  it("30% 규칙과 잔액 도출을 화면에서 안내한다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByText(/30% 이상 차이/)).toBeTruthy();
    expect(screen.getByText(/한쪽만 입력하면 나머지는 총액에서 자동 계산/)).toBeTruthy();
  });
});

describe("⑤-2 — 차단 조합은 칸을 열지 않고 이유를 말한다", () => {
  it("증축이면 입력 대신 안내가 뜬다 (S-10)", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} blockedReason="증축이 있는 건물은 … 지원하지 않습니다." />);
    expect(screen.getByTestId("gb-sale-split-blocked")).toBeTruthy();
    expect(screen.queryByTestId("gb-sale-split-mode")).toBeNull();
    expect(screen.queryByTestId("gb-land-transfer-price")).toBeNull();
  });

  it("안내에는 대신 무엇으로 계산되는지가 들어간다 — 막기만 하면 사용자가 다음 행동을 모른다", () => {
    render(<Harness blockedReason="부담부증여는 …" />);
    expect(screen.getByText(/양도시 기준시가 비율로 안분합니다/)).toBeTruthy();
  });
});
