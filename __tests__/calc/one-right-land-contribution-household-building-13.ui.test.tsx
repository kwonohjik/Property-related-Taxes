/**
 * @vitest-environment jsdom
 *
 * #13 ⑤ — 토지 출자 입주권 「세대원 건물 소유」 선언의 입력 경로·표시.
 *
 * 선언은 판정 메뉴 §89①4호 카드에서 받고(Q-7 · #2050 방식), 계산기는 읽기 전용 요약 + 안내만 한다.
 * 계산기 「1세대 해당」 토글은 잠그지 않는다(1세대 성립은 사용자 선언 · Q-3′) — 불성립은 안내와 결과 고지가 말한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RedevelopmentRightExemptionSection } from "@/components/calc/transfer/RedevelopmentRightExemptionSection";
import { ImportedRedevRightFactsCard } from "@/components/calc/transfer/ImportedRedevRightFactsCard";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const rightAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in",
    redevSubject: "right",
    redevExemptionEligibleAtApproval: "yes",
    ...over,
  }) as AssetForm;

describe("판정 메뉴 §89①4호 카드 — 세대원 건물 소유 선언 위젯", () => {
  it("선언 칸과 선택지가 보이고, 고르면 onChange로 패치된다", () => {
    const onChange = vi.fn();
    render(<RedevelopmentRightExemptionSection asset={rightAsset()} onChange={onChange} />);
    expect(screen.getByText(/토지만 출자한 경우 — 철거 대상 건물\(기존주택\)의 세대 소유/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/예 — 인가일·양도일 모두 같은 세대가 소유/));
    expect(onChange).toHaveBeenCalledWith({ redevLandHouseholdOwnedBuilding: "yes" });
    fireEvent.click(screen.getByLabelText(/아니오 — 다른 세대 소유/));
    expect(onChange).toHaveBeenCalledWith({ redevLandHouseholdOwnedBuilding: "no" });
  });

  it("저장된 값이 선택 상태로 반영된다 (라벨만 있고 배선이 없으면 안 된다)", () => {
    render(
      <RedevelopmentRightExemptionSection asset={rightAsset({ redevLandHouseholdOwnedBuilding: "no" })} onChange={() => {}} />,
    );
    expect((screen.getByLabelText(/아니오 — 다른 세대 소유/) as HTMLInputElement).checked).toBe(true);
  });

  it("설명에 두 시점(인가일·양도일)과 소유 주체(본인 또는 같은 세대원)가 있다", () => {
    render(<RedevelopmentRightExemptionSection asset={rightAsset()} onChange={() => {}} />);
    expect(screen.getAllByText(/본인이나 같은 세대원이 소유해야/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/인가일과 양도일 두 시점 모두/).length).toBeGreaterThan(0);
  });
});

describe("계산기 읽기 전용 요약 — 판정 메뉴에서 넘겨받은 사실", () => {
  it("토지 출자: 선언 값을 보여 준다", () => {
    render(
      <ImportedRedevRightFactsCard
        asset={rightAsset({ redevOriginalAssetType: "land", redevLandHouseholdOwnedBuilding: "yes" })}
      />,
    );
    expect(screen.getByText(/인가일·양도일 모두 같은 세대가 소유/)).toBeTruthy();
  });
  it("토지 출자 + 선언 없음: 불성립이라고 말한다", () => {
    render(<ImportedRedevRightFactsCard asset={rightAsset({ redevOriginalAssetType: "land" })} />);
    expect(screen.getByText(/선언 없음 — 토지만 출자한 입주권은 비과세 불성립/)).toBeTruthy();
  });
  it("부정 짝 — 주택 출자면 그 행을 보여 주지 않는다 (stale 선언이 근거처럼 보이지 않게)", () => {
    render(
      <ImportedRedevRightFactsCard
        asset={rightAsset({ redevOriginalAssetType: "housing", redevLandHouseholdOwnedBuilding: "yes" })}
      />,
    );
    expect(screen.queryByText(/철거 대상 건물의 세대 소유/)).toBeNull();
  });
});

function step4Form(assetOver: Partial<AssetForm>): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: [{ ...base.assets[0], assetKind: "right_to_move_in", redevSubject: "right", acquisitionDate: "2009-04-09", ...assetOver } as AssetForm],
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "0",
  };
}

describe("Step4 — 1세대 해당 토글은 잠기지 않고, 선언 상태별 안내가 다르다", () => {
  it("토지 출자: 토글 활성 + 선언 없음 안내", () => {
    render(<Step4 form={step4Form({ redevOriginalAssetType: "land" })} onChange={() => {}} />);
    const toggle = screen.getAllByRole("switch").find((e) => e.getAttribute("aria-label") === "1세대 해당")!;
    expect(toggle).toBeTruthy();
    // 잠금(disabled)은 속성 또는 aria-disabled/data-disabled로 나타난다 — 어느 쪽도 없어야 한다.
    expect(toggle.hasAttribute("disabled")).toBe(false);
    expect(toggle.getAttribute("aria-disabled")).not.toBe("true");
    expect(toggle.hasAttribute("data-disabled")).toBe(false);
    const notice = screen.getByTestId("land-contributed-right-notice");
    expect(notice.textContent).toContain("선언이 없어 비과세·고가 안분을 적용하지 않습니다");
  });
  it("토지 출자 + 「예」 / 「아니오」 안내", () => {
    const { unmount } = render(
      <Step4 form={step4Form({ redevOriginalAssetType: "land", redevLandHouseholdOwnedBuilding: "yes" })} onChange={() => {}} />,
    );
    expect(screen.getByTestId("land-contributed-right-notice").textContent).toContain("「예」로 선언되어 있습니다");
    unmount();
    render(<Step4 form={step4Form({ redevOriginalAssetType: "land", redevLandHouseholdOwnedBuilding: "no" })} onChange={() => {}} />);
    expect(screen.getByTestId("land-contributed-right-notice").textContent).toContain("「아니오」로 선언되어");
  });
  it("부정 짝 — 주택 출자는 안내가 없다", () => {
    render(<Step4 form={step4Form({ redevOriginalAssetType: "housing" })} onChange={() => {}} />);
    expect(screen.queryByTestId("land-contributed-right-notice")).toBeNull();
  });
});
