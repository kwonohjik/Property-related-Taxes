/**
 * anchor — F36 UI 절반 (2026-08 코드리뷰)
 *
 * 증축이 있으면 「감정평가가액으로 안분」 **선택지 하나만** 비활성화한다.
 *
 * ⚠️ **섹션 전체를 `blockedReason`으로 덮으면 안 된다** — 증축 × 구분 기재는 Q-4 확정으로
 *    허용이고(`gb-sale-split-section.test.tsx` ⑤-4 · `gb-sale-split-plumbing.test.ts`),
 *    그 계약을 깨뜨리면 사용자는 §100② 구분 기재 경로를 통째로 잃는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingSaleSplitSection } from "@/components/calc/transfer/GeneralBuildingSaleSplitSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function Harness({ init, hasExtension }: { init?: Partial<AssetForm>; hasExtension?: boolean }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    ...init,
  } as AssetForm);
  return (
    <GeneralBuildingSaleSplitSection
      asset={asset}
      onChange={(patch) => setAsset((a) => ({ ...a, ...patch }))}
      sectionNum="③"
      {...(hasExtension ? { hasExtension } : {})}
    />
  );
}

/** 라디오 input을 value로 집는다 — 라벨 문구 변경에 덜 취약하다. */
function radio(value: string): HTMLInputElement {
  const el = screen
    .getByTestId("gb-sale-split-mode")
    .querySelector<HTMLInputElement>(`input[value="${value}"]`);
  expect(el).toBeTruthy();
  return el!;
}

describe("F36 ⑤ — 증축이면 감정평가 선택지만 비활성화된다", () => {
  it("🔴 증축 ON — 감정평가 옵션이 disabled", () => {
    render(<Harness hasExtension />);
    expect(radio("appraisal").disabled).toBe(true);
  });

  it("나머지 두 선택지는 그대로 고를 수 있다", () => {
    render(<Harness hasExtension />);
    expect(radio("actual").disabled).toBe(false);
    expect(radio("apportioned").disabled).toBe(false);
  });

  it("🔑 섹션 전체를 막지 않는다 — 구분 기재 칸은 열린다 (Q-4 확정)", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} hasExtension />);
    expect(screen.queryByTestId("gb-sale-split-blocked")).toBeNull();
    expect(screen.getByTestId("gb-land-transfer-price")).toBeTruthy();
  });

  it("사유를 화면에 적는다 — inline 라디오는 옵션 hint를 렌더하지 않는다", () => {
    render(<Harness hasExtension />);
    expect(
      screen.getByTestId("gb-sale-split-appraisal-disabled").textContent,
    ).toContain("감정평가가액");
  });

  it("증축이 없으면 감정평가 옵션이 활성이고 안내도 없다", () => {
    render(<Harness />);
    expect(radio("appraisal").disabled).toBe(false);
    expect(screen.queryByTestId("gb-sale-split-appraisal-disabled")).toBeNull();
  });
});
