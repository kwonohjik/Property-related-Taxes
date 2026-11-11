/**
 * @vitest-environment jsdom
 *
 * anchor: 배우자 지분 증여 예외(기준-2025-법규재산-0033, 2025.4.1) — 명부 행 ⑥ 「증여 취득」 토글과 불성립 사유가 그 예외를 안내한다.
 *
 * 해석: 부부가 공동으로 조특법 §98의3 미분양주택(분양권 포함)을 사업주체등과 최초로 매매계약한 뒤 한 명의 지분을 배우자에게 증여해도,
 * 소득세법 §89①3호 적용 시 **해당 주택 전체**를 세대의 소유주택으로 보지 않는다 — 주택 수 제외(행 ⑥)에 관한 해석이다.
 * 종전: 토글 문구가 «배우자·직계존비속 … 증여로 취득한 주택은 빠지지 않습니다»로만 적혀, 이 예외 사례에서 사용자가 토글을 켜 제외를 잃기 쉬웠다.
 * 토글은 기본 꺼짐(= 제외)이라 예외 사례는 켜지 않으면 된다 — 안내만 붙인다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntryCountExclusionSection } from "@/components/calc/transfer/HouseEntryCountExclusionSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { resolveSpecialHouseExclusions, SPECIAL_HOUSE_EXCLUSION_WINDOWS } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { unsold98AcquisitionCauseReason, SPOUSE_SHARE_GIFT_EXCEPTION_NOTE } from "@/lib/tax-engine/transfer-reductions/unsold-98-acquisition-cause";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const row = (article: string): HouseEntry =>
  ({
    id: "h2", region: "non_capital", acquisitionDate: "2014-03-19", officialPrice: "300000000", isInherited: false, isLongTermRental: false,
    isApartment: true, isOfficetel: false, isUnsoldHousing: false,
    countExclusion: { kind: "special", special: { article, houseAcquisitionDate: "", houseContractDate: "2009-02-12", isNationalHousing: false, requirementsConfirmed: true } },
  }) as unknown as HouseEntry;

const T = new Date("2018-07-22");
const decl = (article: "unsold_98_3", extra: Record<string, unknown> = {}) => {
  const inWindow = SPECIAL_HOUSE_EXCLUSION_WINDOWS[article].windows[0][0];
  return { article, houseId: "h2", houseAcquisitionDate: inWindow, houseContractDate: inWindow, requirementsConfirmed: true, ...extra } as never;
};

describe("배우자 지분 증여 예외 안내", () => {
  it("S-1: 🔴 행 ⑥ 증여 토글 설명이 예외(공동 최초계약 후 배우자 지분 증여 → 제외 유지)와 「켜지 마세요」를 안내한다", () => {
    render(<HouseEntryCountExclusionSection house={row("unsold_98_3")} onUpdate={() => {}} />);
    const box = screen.getByTestId("house-row-count-exclusion-acquired-by-gift");
    expect(box.textContent).toContain("기준-2025-법규재산-0033");
    expect(box.textContent).toContain("공동으로");
    expect(box.textContent).toContain("켜지 마세요");
    expect(box.textContent).toContain("주택 전체를 소유주택으로 보지 않습니다");
    // 종전 본 문구는 그대로
    expect(box.textContent).toContain("증여받은 사람의 소유주택에서 빠지지 않습니다");
  });

  it("S-2: 예외 사례는 토글을 켜지 않으면(기본) 주택 수에서 제외되고, 켜면 불성립 사유에 같은 안내가 붙는다", () => {
    const off = resolveSpecialHouseExclusions([decl("unsold_98_3")], T);
    expect(off.excludedCount).toBe(1);
    const on = resolveSpecialHouseExclusions([decl("unsold_98_3", { acquiredByGift: true })], T);
    expect(on.excludedCount).toBe(0);
    expect(on.entries[0].reason).toContain("증여");
    expect(on.entries[0].reason).toContain(SPOUSE_SHARE_GIFT_EXCEPTION_NOTE);
  });

  it("S-3: 감면주택 자체의 양도 쪽 증여 불성립 문구에는 예외를 붙이지 않는다(해석례는 주택 수 제외만 다룬다)", () => {
    const sale = unsold98AcquisitionCauseReason("unsold_98_3", "gift");
    expect(sale?.message).toContain("증여");
    expect(sale?.message).not.toContain("기준-2025-법규재산-0033");
  });
});
