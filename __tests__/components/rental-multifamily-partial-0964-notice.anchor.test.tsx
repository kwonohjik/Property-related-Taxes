/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 다가구주택 일부 호실만 임대등록한 경우 입력 안내(서면-2023-부동산-0964[부동산납세과-2622], 2023.11.14.).
 *
 * 회신: 다가구주택(A) 8호 중 7호만 임대등록·1호 거주 + B 주택 양도 → 소득세법 시행령 §155⑳ 적용 불가.
 * 엔진 세대 구성 판정(`resolveRentalResidenceComposition`)은 미등록 호실을 일반 주택으로 넣으면 `exceeded`(명부·명부 없음 모두)로
 * 같은 결론을 내지만, 빠뜨리면 `met`이다(throwaway probe 2026-11-12). 이 안내는 그 입력 방법을 ⑳ 카드 「임대주택 정보」에 적는다.
 *
 * | # | 주장 |
 * |---|---|
 * | MF-1 | ⑳ 카드(full · 적용 ON · 시나리오 A) 「임대주택 정보」에 안내와 근거가 보인다 |
 * | MF-2 | 판정 메뉴(facts) 화면에도 같은 안내가 보인다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalHousingExceptionSection, type RentalHousingSectionMode } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

function renderSection(mode: RentalHousingSectionMode) {
  const a = makeDefaultAsset(1);
  const asset: AssetForm = {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2004-09-01",
    rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A" },
  };
  render(
    <RentalHousingExceptionSection
      mode={mode}
      rh={asset.rentalHousingException}
      asset={asset}
      acquisitionDate={asset.acquisitionDate ?? ""}
      transferDate="2024-01-01"
      onChange={vi.fn()}
    />,
  );
}

const EXPECTED =
  "다가구주택의 일부 호실만 임대등록했다면, 등록하지 않은 호실(본인 거주 포함)은 임대주택이 아니라 별도 주택으로 세대 주택 수·보유 주택 목록에 넣으세요 — 이 경우 거주주택 특례가 적용되지 않습니다(서면-2023-부동산-0964, 2023.11.14.).";

describe("다가구 일부 호실 임대등록 안내(0964)", () => {
  it.each(["full", "facts"] as const)("MF-1·2 ★ %s 모드 「임대주택 정보」에 안내와 근거", (mode) => {
    renderSection(mode);
    const t = (screen.getByTestId("rental-multifamily-partial-0964").textContent ?? "").replace(/\s+/g, " ");
    expect(t).toBe(EXPECTED);
  });
});
