/**
 * F-17 — §167의10①7호의 3년 기산점은 「소송으로 인한 **확정판결일**」이다.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-17 · §27.
 *
 * 법문(로컬 캐시 MST 286211 직독): 「주택의 소유권에 관한 소송이 진행 중이거나 해당 소송결과로
 * 취득한 주택(소송으로 인한 **확정판결일**부터 3년이 경과하지 아니한 경우에 한정한다)」
 *
 * 종전 화면은 그 칸을 「소송 취득일」이라 불렀다. 확정판결일 ≤ 등기 취득일이므로 사용자가
 * 등기일을 넣으면 3년 창이 **늦게 시작**해 배제가 과하게 유지된다 — 과소 과세 방향이다.
 * (F-16 실측 축으로 141,966,000 vs 299,816,000이 갈린다.)
 *
 * 🔴 **필드명 `litigationAcquisitionDate`는 legacy로 남긴다.** 이름을 바꾸면 sessionStorage와
 *    이력(`inputData: formData`)에 저장된 값이 유실되고, 그러면 「미입력 = 소송 진행 중」으로
 *    읽혀 조용히 배제가 켜진다(세액 감소 방향의 silent 회귀). 의미는 라벨과 주석이 못박는다.
 *    ⇒ 이 anchor가 그 라벨을 지킨다. 라벨이 「취득일」로 되돌아가면 red다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntrySpecialExclusionSection } from "@/components/calc/transfer/HouseEntrySpecialExclusionSection";
import { SellingHouseTwoHouseExclusionSection } from "@/components/calc/transfer/SellingHouseTwoHouseExclusionSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const house = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "h1",
    region: "capital",
    acquisitionDate: "2019-01-01",
    officialPrice: "500000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

describe("F-17 ⑤ 다른 보유 주택 — 7호 날짜 칸 라벨", () => {
  it("F17-1 「소송 확정판결일」을 요구한다 — 「소송 취득일」이 아니다", () => {
    render(<HouseEntrySpecialExclusionSection house={house({ isLitigationHousing: true })} onUpdate={() => {}} />);
    expect(screen.getByText(/소송 확정판결일/)).toBeTruthy();
    expect(screen.queryByText(/소송 취득일/)).toBeNull();
  });

  it("F17-2 기산점이 「그날부터 3년」임을 밝힌다", () => {
    render(<HouseEntrySpecialExclusionSection house={house({ isLitigationHousing: true })} onUpdate={() => {}} />);
    expect(screen.getByText(/판결 확정 시 — 그날부터 3년 이내 배제/)).toBeTruthy();
  });
});

describe("F-17 ⑤ 양도 주택 — 7호 날짜 칸 라벨", () => {
  it("F17-3 「소송 확정판결일」을 요구한다 — 「소송 취득일」이 아니다", () => {
    render(<SellingHouseTwoHouseExclusionSection value={{ isLitigationHousing: true }} onChange={() => {}} />);
    expect(screen.getByText(/소송 확정판결일/)).toBeTruthy();
    expect(screen.queryByText(/소송 취득일/)).toBeNull();
  });

  it("F17-4 (긍정 짝) 토글이 꺼져 있으면 날짜 칸 자체가 없다", () => {
    render(<SellingHouseTwoHouseExclusionSection value={{}} onChange={() => {}} />);
    expect(screen.queryByText(/소송 확정판결일/)).toBeNull();
  });
});
