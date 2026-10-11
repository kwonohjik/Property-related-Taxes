/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 1h-G1-7(결정 #24 B) · 1h-G1-4(결정 #25 C) · 1h-G1-9(결정 #26 B)
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | UI-H1 | 토글 라벨은 엔진 뜻(「증여자 세대가 1세대에 해당」)이고, 끄면 무엇이 판정되지 않는지 상시 안내가 ON/OFF 모두 보인다 · 기본값 OFF는 그대로 |
 * | UI-H2 | 결과 고지(1세대 OFF)는 결론을 가를 때만 — 주택 수 1 · §155① 두 날짜 · 합가일. 1세대 ON·비주택·입력 없는 2주택은 없다 |
 * | UI-H3 | 결과 카드가 증여 화면 전용 고지를 같은 공용 카드(접힘 밖)로 보인다 |
 * | UI-M1 | 합가 입력란: 증여 화면은 지키지 않는 3주택 중첩·중과 경감 안내를 숨긴다 · 계산기는 그대로 |
 * | UI-M2 | 세대 3주택 + 합가일 → 판정하지 않는다는 안내 · 주택 수 2는 없다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import { MergeDateSection } from "@/components/calc/transfer/MergeDateSection";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import {
  GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE,
  GIFT_BURDENED_ONE_HOUSEHOLD_OFF_HINT,
  giftBurdenedNotOneHouseholdNotice,
  giftBurdenedNotOneHouseholdNoticeNeeded,
} from "@/lib/calc/gift-burdened-household-notice";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function item(bgt: Partial<BurdenedGiftTransferTaxInput> = {}, over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2015-01-01"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: false,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      ...bgt,
    },
    ...over,
  } as unknown as EstateItem;
}
const renderGift = (it: EstateItem) =>
  render(<EstateBodyRealEstate item={it} onUpdate={() => {}} valuationDate="2025-06-01" mode="gift" showCollateralDeductToggle={false} />);
const OFF_TOGGLE = () => screen.getByRole("switch", { name: /증여자 세대가 1세대에 해당/ });

describe("UI-H1 토글 라벨·상시 안내 (#24)", () => {
  it("★ 라벨이 «증여자 세대가 1세대에 해당» — 옛 «1세대 1주택 (§89)» 결론형 라벨이 아니다", () => {
    renderGift(item());
    expect(screen.getByRole("switch", { name: /증여자 세대가 1세대에 해당/ })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /1세대 1주택 \(§89\)/ })).toBeNull();
  });
  it("★ 끄면 판정하지 않는 것을 늘 보인다(OFF·ON 모두) · 기본값(미설정)은 OFF", () => {
    renderGift(item({ isOneHousehold: undefined }));
    expect(OFF_TOGGLE().getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain(GIFT_BURDENED_ONE_HOUSEHOLD_OFF_HINT);
    cleanup();
    renderGift(item({ isOneHousehold: true }));
    expect(OFF_TOGGLE().getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain(GIFT_BURDENED_ONE_HOUSEHOLD_OFF_HINT);
  });
});

describe("UI-H2 결과 고지는 결론을 가를 때만 (#24)", () => {
  const T2 = { previousAcquisitionDate: new Date("2015-01-01"), newAcquisitionDate: new Date("2023-03-01") };
  it("고지 있음 — 1세대 OFF · 주택 수 1 / §155① 두 날짜(주택 수 2) / 합가일 입력", () => {
    expect(giftBurdenedNotOneHouseholdNotice(item())).toBe(GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE);
    expect(giftBurdenedNotOneHouseholdNotice(item({ householdHousingCount: 2, temporaryTwoHouse: T2 }))).not.toBeNull();
    expect(giftBurdenedNotOneHouseholdNotice(item({ householdHousingCount: 2, marriageDate: "2020-01-01" }))).not.toBeNull();
    expect(giftBurdenedNotOneHouseholdNotice(item({ householdHousingCount: 3, parentalCareMergeDate: "2020-01-01" }))).not.toBeNull();
  });
  it("고지 없음(부정 짝) — 1세대 ON · 입력 없는 2주택 · 비주택 · 토글 OFF 자산", () => {
    expect(giftBurdenedNotOneHouseholdNotice(item({ isOneHousehold: true }))).toBeNull();
    expect(giftBurdenedNotOneHouseholdNotice(item({ householdHousingCount: 2 }))).toBeNull();
    expect(giftBurdenedNotOneHouseholdNotice(item({ householdHousingCount: 3 }))).toBeNull();
    expect(giftBurdenedNotOneHouseholdNotice(item({}, { category: "real_estate_land" } as Partial<EstateItem>))).toBeNull();
    expect(giftBurdenedNotOneHouseholdNotice({ ...item(), burdenedGiftTransferTax: undefined })).toBeNull();
    expect(giftBurdenedNotOneHouseholdNoticeNeeded({ isOneHousehold: false, householdHousingCount: 1 } as BurdenedGiftTransferTaxInput, false)).toBe(false);
  });
  it("문구는 «확인 필요» 형식이고 절감·유리/불리 표현이 없다", () => {
    expect(GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE).toContain("확인 필요");
    expect(GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE).not.toMatch(/절세|절감|유리|불리/);
  });
});

describe("UI-H3 결과 카드", () => {
  const result = {
    isExempt: false,
    transferGain: 0,
    taxableGain: 0,
    longTermHoldingDeduction: 0,
    longTermHoldingRate: 0,
    basicDeduction: 0,
    taxBase: 0,
    appliedRate: 0.06,
    calculatedTax: 0,
    determinedTax: 0,
    penaltyTax: 0,
    localIncomeTax: 0,
    totalTax: 0,
    progressiveDeduction: 0,
    warnings: ["엔진 경고 예시"],
  } as unknown as TransferTaxResult;
  it("★ 증여 화면 전용 고지를 엔진 경고와 같은 공용 카드로(접힌 상세 밖) 보인다", () => {
    render(<BurdenedTransferTaxResultCard transferTaxResults={[result]} notices={[GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE]} />);
    expect(screen.getByText(GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE)).toBeTruthy();
    expect(screen.getByText("엔진 경고 예시")).toBeTruthy();
  });
  it("부정 짝 — notices 없으면 엔진 경고만", () => {
    render(<BurdenedTransferTaxResultCard transferTaxResults={[result]} />);
    expect(screen.queryByText(GIFT_BURDENED_NOT_ONE_HOUSEHOLD_NOTICE)).toBeNull();
    expect(screen.getByText("엔진 경고 예시")).toBeTruthy();
  });
});

describe("UI-M1 합가 입력란 안내 (#25 하위 1)", () => {
  const form = { marriageDate: "2020-01-01", parentalCareMergeDate: "", isFirstTransferredInMerge: true };
  it("★ 증여 화면(variant=gift): 3주택 중첩·중과 경감/배제 안내가 없다", () => {
    render(<MergeDateSection form={form} onChange={() => {}} variant="gift" />);
    const t = document.body.textContent ?? "";
    expect(t).not.toContain("겹쳐 3주택이 된 경우도 적용");
    expect(t).not.toContain("중과");
    expect(t).toContain("1세대1주택 비과세(§155⑤)");
    expect(t).toContain("1세대1주택 비과세(§155④)");
  });
  it("부정 짝 — 양도세 계산기(기본)는 종전 안내 그대로", () => {
    render(<MergeDateSection form={form} onChange={() => {}} />);
    const t = document.body.textContent ?? "";
    expect(t).toContain("겹쳐 3주택이 된 경우도 적용");
    expect(t).toContain("중과 배제");
  });
});

describe("UI-M2 세대 3주택 + 합가일 안내 (#25·#26)", () => {
  it("★ 주택 수 3 + 합가일 → 이 화면에서 판정하지 않는다는 안내(확인 필요)", () => {
    renderGift(item({ isOneHousehold: true, householdHousingCount: 3, marriageDate: "2020-01-01" }));
    const n = screen.getByTestId("bg-three-house-merge-notice");
    expect(n.textContent).toContain("판정하지 않고 계산");
    expect(n.textContent).toContain("양도소득세 계산기(부담부증여)");
  });
  it("부정 짝 — 주택 수 2 · 합가일 없는 3주택은 안내 없음", () => {
    renderGift(item({ isOneHousehold: true, householdHousingCount: 2, marriageDate: "2020-01-01" }));
    expect(screen.queryByTestId("bg-three-house-merge-notice")).toBeNull();
    cleanup();
    renderGift(item({ isOneHousehold: true, householdHousingCount: 3 }));
    expect(screen.queryByTestId("bg-three-house-merge-notice")).toBeNull();
  });
});
