/**
 * anchor (A3 · OH-12 · OH-12c ⑤) — 실제 입력 컴포넌트(`HouseCountExemptionInputs` — 계산기 Step4·판정 메뉴
 * Step2 공용)가 두 신규 칸을 **게이트대로** 열고 폼 필드에 쓴다.
 *
 *   · 증여일 — 「피상속인 증여분」 토글이 켜졌을 때만
 *   · 상속개시 후 취득 양도 주택의 취득 경위 — 양도 주택 취득일이 상속개시일보다 뒤(2013-02-15 이후)일 때만
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseCountExemptionInputs } from "@/app/calc/transfer-tax/steps/step4-sections/HouseCountExemptionInputs";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function form(inheritedDate: string, over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  const primary = makeDefaultAsset(1);
  primary.assetKind = "housing";
  primary.acquisitionDate = "2018-01-01";
  return {
    ...f,
    transferDate: "2023-06-01",
    isOneHousehold: true,
    householdHousingCount: "2",
    assets: [primary],
    houses: [
      {
        id: "h1",
        region: "capital",
        acquisitionDate: inheritedDate,
        officialPrice: "300000000",
        isInherited: true,
        inheritedDate,
        isLongTermRental: false,
        isApartment: true,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
    ...over,
  };
}

const RIGHT_LABEL = "상속개시 후 취득한 양도 주택 — 취득 경위";
const GIFT_LABEL = "피상속인으로부터 증여받은 날";

describe("⑤ 취득 경위 선택지", () => {
  it("🔴 상속 2015 · 양도 주택 2018 취득 → 열린다 · 선택하면 폼에 쓴다", () => {
    const onChange = vi.fn();
    render(<HouseCountExemptionInputs form={form("2015-01-01")} onChange={onChange} />);
    expect(screen.getByText(RIGHT_LABEL)).toBeTruthy();
    fireEvent.click(screen.getByText("상속개시 당시 보유한 조합원입주권으로 취득한 신축주택"));
    expect(onChange).toHaveBeenCalledWith({ generalHouseRightAtInheritance: "redevelopment_right" });
  });

  it("부정 짝 — 상속 2019(양도 주택을 상속개시 당시 보유) → 닫힌다", () => {
    render(<HouseCountExemptionInputs form={form("2019-01-01")} onChange={vi.fn()} />);
    expect(screen.queryByText(RIGHT_LABEL)).toBeNull();
  });
});

describe("⑤ 증여일", () => {
  it("🔴 증여 토글 ON → 증여일 칸이 열린다", () => {
    render(
      <HouseCountExemptionInputs
        form={form("2019-01-01", { generalHouseGiftedFromDecedentWithin2yr: true })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(GIFT_LABEL)).toBeTruthy();
  });

  it("부정 짝 — 토글 OFF → 칸 없음", () => {
    render(<HouseCountExemptionInputs form={form("2019-01-01")} onChange={vi.fn()} />);
    expect(screen.queryByText(GIFT_LABEL)).toBeNull();
  });
});
