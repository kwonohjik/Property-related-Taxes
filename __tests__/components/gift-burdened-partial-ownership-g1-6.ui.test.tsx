/**
 * @vitest-environment jsdom
 *
 * 1h-G1-6 ⑤ — 증여 화면 부담부증여 주택 필드에 「일부 지분만 증여」 토글이 실제로 배선됐는가(⑧ 차단의 입력 경로).
 * 렌더 진입점은 증여세 마법사가 쓰는 `EstateBodyRealEstate`(mode="gift")다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const item = (bgt: Record<string, unknown> = {}): EstateItem =>
  ({
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 1_000_000_000,
    leaseDeposit: 300_000_000,
    mortgageAmount: 0,
    assumedDebtForGift: 300_000_000,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2015-01-01"),
      standardPriceAtAcquisition: 500_000_000,
      householdHousingCount: 1,
      ...bgt,
    },
  }) as unknown as EstateItem;

const render1 = (it: EstateItem, onUpdate: (i: EstateItem) => void = () => {}) =>
  render(<EstateBodyRealEstate item={it} onUpdate={onUpdate} valuationDate="2025-06-01" mode="gift" showCollateralDeductToggle={false} />);

const sw = () =>
  screen.getByTestId("bg-transfer-partial-ownership").querySelector('[role="switch"]') as HTMLElement;

describe("G1-6 ⑤ 일부 지분만 증여 토글", () => {
  it("토글이 보이고, 켜면 burdenedGiftTransferTax.isPartialOwnershipGift = true 로 저장된다", () => {
    const onUpdate = vi.fn();
    render1(item(), onUpdate);
    fireEvent.click(sw());
    const saved = (onUpdate.mock.calls.at(-1)![0] as EstateItem).burdenedGiftTransferTax!;
    expect(saved.isPartialOwnershipGift).toBe(true);
  });
  it("긍정 짝 — 켜진 상태에서 다시 누르면 미설정(undefined)으로 돌아간다", () => {
    const onUpdate = vi.fn();
    render1(item({ isPartialOwnershipGift: true }), onUpdate);
    fireEvent.click(sw());
    const saved = (onUpdate.mock.calls.at(-1)![0] as EstateItem).burdenedGiftTransferTax!;
    expect(saved.isPartialOwnershipGift).toBeUndefined();
  });
});
