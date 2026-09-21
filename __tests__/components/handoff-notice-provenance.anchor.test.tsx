/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 판정 안내 카드는 **이미 다녀온 사용자에게 「가라」고 하지 않는다** (P6-c-5)
 *
 * ## 🔴 고친 비일관 — 셋 중 하나만 상태를 봤다
 *
 * P6-b·c-1·c-2가 계산기에 **판정 메뉴 안내 카드 3종**을 만들었고, 셋 다 같은 문장으로
 * 끝난다: 「…판정한 뒤, 1단계의 「📋 판정 불러오기」로 가져오세요」.
 *
 * | 카드 | 위치 | provenance 관측 | 다녀온 사용자에게 |
 * |---|---|---|---|
 * | `judgment-handoff-notice` | Step4 | ✅ `form`을 받는다 | 사라짐 |
 * | `rental-housing-handoff-notice` | 자산카드 ⑤ | ✗ `asset`만 받았다 | **그대로 떴다** |
 * | `redev-right-handoff-notice` | 자산카드 ③ | ✗ `asset`만 받았다 | **그대로 떴다** |
 *
 * 판정을 불러왔는데 그 특례가 **해당 없어** 선언하지 않은 사용자(대부분)에게 「판정하러
 * 가세요」라고 말했다 — 이미 다녀왔고 다시 가도 할 것이 없다.
 *
 * 실측으로 하나 더 확인했다: **입주권 주 자산**이면 한 자산 카드 안에 ③ 취득(redev)과
 * ⑤ 기타(rental) 안내가 **동시에** 뜬다. 둘 다 같은 링크·같은 꼬리 문장이었다.
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 |
 * |---|---|
 * | HP-1 | §155⑳ — provenance 없으면 「판정하러 가세요」 |
 * | HP-2 | §155⑳ — provenance 있으면 「선언이 없습니다」 (부정형의 긍정 짝) |
 * | HP-3 | §89①4호 — 같은 두 갈래 |
 * | HP-4 | 두 갈래 모두 **판정 메뉴 링크는 유지**한다 — 선언하러 갈 길은 남겨야 한다 |
 * | HP-5 | 선언이 **있으면** 안내가 아니라 요약이 뜬다(P6-c-1·c-2 계약 불변) |
 *
 * ## ⚠️ 배선 축은 여기서 못 본다
 *
 * 이 anchor는 컴포넌트에 `judgmentLoaded`를 **직접 넘긴다**. Step1부터 5계층을 타고 실제로
 * 도달하는지는 `e2e/transfer-handoff-notice-provenance.spec.ts`가 본다 — P6-c-1이 prop
 * 체인이 끊겨 조용히 사라지는 것을 겪은 자리다(U1-03).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import {
  ImportedRedevRightFactsCard,
  type ImportedRedevRightSlice,
} from "@/components/calc/transfer/ImportedRedevRightFactsCard";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const GO_JUDGE = /판정한 뒤/;
const NOT_DECLARED = /선언이 ?없습니다/;

/**
 * 🔑 **안내 카드의 `textContent`로 본다.** 문구가 `<strong>`로 나뉘어 있어
 *    `getByText`는 분리된 노드를 잡지 못한다 — 한 번 빨개져서 알았다.
 */
const noticeText = (testId: string) =>
  (screen.getByTestId(testId).textContent ?? "").replace(/\s+/g, " ");

function housingAsset(over: Partial<AssetForm["rentalHousingException"]> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2018-01-01",
    rentalHousingException: { ...a.rentalHousingException, applyException: false, ...over },
  };
}

function renderRental(asset: AssetForm, judgmentLoaded: boolean) {
  render(
    <RentalHousingExceptionSection
      mode="calc"
      judgmentLoaded={judgmentLoaded}
      rh={asset.rentalHousingException}
      asset={asset}
      acquisitionDate={asset.acquisitionDate}
      transferDate="2026-06-01"
      onChangeResidence={() => {}}
      onChange={() => {}}
    />,
  );
}

const redevSlice = (over: Partial<ImportedRedevRightSlice> = {}): ImportedRedevRightSlice => ({
  ...(makeDefaultAsset(1) as unknown as ImportedRedevRightSlice),
  ...over,
});

describe("HP-1·2 §155⑳ 안내 — provenance로 갈린다", () => {
  it("[HP-1] 판정을 안 다녀왔으면 「판정하러 가세요」", () => {
    renderRental(housingAsset(), false);
    const t = noticeText("rental-housing-handoff-notice");
    expect(t).toMatch(GO_JUDGE);
    expect(t).not.toMatch(NOT_DECLARED);
  });

  /** 🔴 HP-1의 **긍정 짝**. 없으면 「문구를 통째로 지웠다」와 구별되지 않는다. */
  it("[HP-2] 이미 다녀왔으면 「선언이 없습니다」로 바뀐다", () => {
    renderRental(housingAsset(), true);
    const t = noticeText("rental-housing-handoff-notice");
    expect(t).toMatch(NOT_DECLARED);
    expect(t).not.toMatch(GO_JUDGE);
  });
});

describe("HP-3 §89①4호 안내 — 같은 두 갈래", () => {
  it("[HP-3a] 판정 전 — 「판정하러 가세요」", () => {
    render(<ImportedRedevRightFactsCard asset={redevSlice()} judgmentLoaded={false} />);
    const t = noticeText("redev-right-handoff-notice");
    expect(t).toMatch(GO_JUDGE);
    expect(t).not.toMatch(NOT_DECLARED);
  });

  it("[HP-3b] 판정 후 — 「선언이 없습니다」", () => {
    render(<ImportedRedevRightFactsCard asset={redevSlice()} judgmentLoaded />);
    const t = noticeText("redev-right-handoff-notice");
    expect(t).toMatch(NOT_DECLARED);
    expect(t).not.toMatch(GO_JUDGE);
  });
});

describe("HP-4 두 갈래 모두 판정 메뉴 링크를 남긴다", () => {
  /**
   * 🔑 「선언이 없습니다」가 **막다른 길이면 안 된다** — 해당하는 사용자는 선언하러 가야 한다.
   *    문구만 바꾸고 경로를 없애면 P6가 만든 유일한 입력 경로가 끊긴다.
   */
  it("[HP-4a] §155⑳ — provenance 유무와 무관하게 링크가 있다", () => {
    for (const loaded of [false, true]) {
      renderRental(housingAsset(), loaded);
      expect(
        screen.getByTestId("rental-housing-handoff-link").getAttribute("href"),
      ).toBe("/calc/one-house-exemption");
      cleanup();
    }
  });

  it("[HP-4b] §89①4호 — 같다", () => {
    for (const loaded of [false, true]) {
      render(<ImportedRedevRightFactsCard asset={redevSlice()} judgmentLoaded={loaded} />);
      expect(
        screen.getByTestId("redev-right-handoff-link").getAttribute("href"),
      ).toBe("/calc/one-house-exemption");
      cleanup();
    }
  });
});

describe("HP-5 선언이 있으면 안내가 아니라 요약이다 (기존 계약 불변)", () => {
  it("[HP-5a] §155⑳ — provenance가 있어도 선언이 있으면 요약", () => {
    renderRental(
      housingAsset({ applyException: true, rentalUnits: [makeDefaultRentalUnit()] }),
      true,
    );
    expect(screen.getByTestId("imported-rental-housing-facts")).toBeTruthy();
    expect(screen.queryByTestId("rental-housing-handoff-notice")).toBeNull();
  });

  it("[HP-5b] §89①4호 — 같다", () => {
    render(
      <ImportedRedevRightFactsCard
        asset={redevSlice({ redevExemptionEligibleAtApproval: "yes" })}
        judgmentLoaded
      />,
    );
    expect(screen.getByTestId("imported-redev-right-facts")).toBeTruthy();
    expect(screen.queryByTestId("redev-right-handoff-notice")).toBeNull();
  });
});
