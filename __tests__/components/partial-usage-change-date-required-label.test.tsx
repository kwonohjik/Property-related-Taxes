/**
 * anchor: 「용도변경일」 라벨이 ⑧의 필수 여부를 따라간다 (UI 리뷰 보통).
 *
 * ⑧ `transfer-tax-validate-mixed-use-asset.ts`는 `usePreHousingDisclosure`일 때 이 값을
 * **필수로 차단**한다 — §164⑤ 환산 산식이 최초고시일과 용도변경일의 선후(Case A/B)로
 * 갈리기 때문이다. 그런데 라벨은 항상 「(선택)」이라, 사용자는 비워 두었다가 원인 모를
 * 차단을 만났다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PartialUsageChangeInputs } from "@/components/calc/transfer/mixed-use/PartialUsageChangeInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    hasPartialUsageChange: true,
    partialChangeDirection: "house_to_commercial",
    ...over,
  }) as AssetForm;

const view = (over: Partial<AssetForm> = {}) =>
  render(<PartialUsageChangeInputs asset={asset(over)} onChange={() => {}} />);

describe("보유 중 일부 용도변경 — 용도변경일 라벨", () => {
  it("🔑 U-1: PHD ON이면 「(필수)」로 표시한다", () => {
    view({ usePreHousingDisclosure: true });
    expect(screen.getByText("용도변경일 (필수)")).toBeTruthy();
    expect(screen.queryByText("용도변경일 (선택)")).toBeNull();
  });

  it("U-2: PHD OFF면 종전대로 「(선택)」이다 — ⑧도 요구하지 않는다", () => {
    view({ usePreHousingDisclosure: false });
    expect(screen.getByText("용도변경일 (선택)")).toBeTruthy();
    expect(screen.queryByText("용도변경일 (필수)")).toBeNull();
  });
});
