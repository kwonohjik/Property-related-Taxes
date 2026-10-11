/**
 * @vitest-environment jsdom
 *
 * PR1b S14b-2 앵커 — 1세대 2주택(명부 1행)에서도 양도 주택 자신의 §167의3①4·5·6·8·8의2호
 * (영 §167의10①2호 준용) 선언 칸이 보인다. 엔진은 effectiveHouseCount >= 2에서 이미 판정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import {
  sellingHouseExclusionVisible,
  sellingHouseTwoHouseExclusionVisible,
} from "@/lib/calc/house-count-inputs-scope";
import { housesPatchWithDerivedCount } from "@/lib/calc/household-house-count";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const T = "2026-09-01";
const ROW: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: "1168010100",
  acquisitionDate: "2012-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(others: number) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.transferDate = T;
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: "1168010100" });
  f.houses = Array.from({ length: others }, (_, i) => ({ ...ROW, id: `h${i + 2}` }));
  f.householdHousingCount = housesPatchWithDerivedCount(f.houses, "housing", false, T).householdHousingCount ?? "1";
  return f;
}

const TOGGLES = ["국가유산(문화재) 주택", "저당권 실행·채권변제 취득 (3년 이내)", "사원용 주택", "어린이집 운영 주택"];

describe("S14b-2 anchor draft", () => {
  it("2주택(명부 1행) — 게이트가 열리고 다섯 호 토글이 렌더된다", () => {
    const f = form(1);
    expect(f.householdHousingCount).toBe("2");
    expect(sellingHouseExclusionVisible(f)).toBe(true);
    render(<HousesListSection form={f} onChange={() => {}} />);
    for (const t of TOGGLES) expect(screen.queryAllByText(t, { exact: false }).length, t).toBeGreaterThan(0);
    expect(screen.queryAllByText(/조특법 감면주택|조세특례/).length).toBeGreaterThan(0);
  });
  it("2주택 — 섹션이 렌더되고 제목이 「3주택 이상 시」 전용으로 읽히지 않는다(긍정 짝: 「2주택 이상 시」가 있다)", () => {
    render(<HousesListSection form={form(1)} onChange={() => {}} />);
    expect(screen.queryByText("양도 주택 중과배제 특례 (3주택 이상 시)")).toBeNull();
    expect(screen.queryByText("양도 주택 중과배제 특례 (2주택 이상 시)")).not.toBeNull();
  });
  it("3주택(명부 2행)도 열린다 — 상위 구간은 그대로다", () => {
    const f = form(2);
    expect(sellingHouseExclusionVisible(f)).toBe(true);
    render(<HousesListSection form={f} onChange={() => {}} />);
    expect(screen.queryByText("양도 주택 중과배제 특례 (2주택 이상 시)")).not.toBeNull();
  });
  it("짝 결함 — 스칼라 3(불산입 주택이 낀 유효 2채 세대)에서도 2주택 전용 섹션(§167의10①3호·7호)이 열린다", () => {
    expect(sellingHouseTwoHouseExclusionVisible(form(2))).toBe(true);
    expect(sellingHouseTwoHouseExclusionVisible(form(1))).toBe(true);
  });
  it("대조 — 1주택(명부 0행)은 둘 다 닫힌다", () => {
    expect(sellingHouseExclusionVisible(form(0))).toBe(false);
    expect(sellingHouseTwoHouseExclusionVisible(form(0))).toBe(false);
  });
});
