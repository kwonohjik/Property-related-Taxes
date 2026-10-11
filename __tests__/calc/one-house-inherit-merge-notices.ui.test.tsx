/**
 * 1세대1주택 상속·합가 화면 안내 5건 (재검증 G5-9 · S14a-8 · S14b-1 · S15-15 · S14a-13).
 *
 * 법령 근거 — 「소득세법 시행령」 현행(시행 2026.10.01, MST 290841) 원문 확인:
 *  - §155⑲: 상속주택 외 주택 양도 시까지 협의분할(「민법」 제1013조) 등기를 하지 않았으면 같은 법 제1009조·제1010조의
 *    상속분에 따라 소유하는 것으로 보고, 양도 후 제척기간 내 등기하여 §155②③을 적용받지 못하게 되면 등기일이 속하는
 *    달의 말일부터 2개월 이내에 추가 납부세액을 신고·납부한다.
 *  - §167의3①·§167의10① 본문 괄호: 주택 수 불산입은 제1호·제12호뿐 — 7호(상속 5년)·2호(장기임대)는 중과 대상에서만 빠진다.
 *    §155②는 기간 제한이 없다.
 *  - §156의3④ 단서(분양권): 「합치기 이전부터 보유하고 있었던 분양권만 상속받은 분양권으로 본다」 — 전환 요건 없음.
 *    §156의2⑥ 단서(입주권): 「합치기 이전부터 보유하고 있었던 주택이 조합원입주권으로 전환된 경우에만」.
 *  - 합가 기한 연혁은 엔진 leaf(`merge-exemption-era.ts`)가 정본 — 화면은 그것을 읽는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import { MergeDateSection } from "@/components/calc/transfer/MergeDateSection";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { mergeExemptionYearsLabel } from "@/lib/calc/one-house-era-labels";
import { createDefaultTransferFormData, type HouseEntry } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { countEffectiveHouses, isSurchargeExemptInherited } from "@/lib/tax-engine/multi-house-surcharge-count";
import { makeHouse, defaultRules } from "../tax-engine/_helpers/multi-house-mock";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const entry = (o: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h1",
  region: "capital",
  acquisitionDate: "2018-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...o,
});

describe("G5-9 — §155⑲ 협의분할 미등기 안내", () => {
  it("상속주택 ON — 협의분할·법정상속분·§155⑲와 사후 신고·납부(2개월)를 알린다", () => {
    render(<HouseEntryEditor house={entry({ isInherited: true, inheritedDate: "2023-01-01" })} onUpdate={() => {}} />);
    const t = screen.getByTestId("house-entry-155-19-notice").textContent ?? "";
    expect(t).toMatch(/협의분할/);
    expect(t).toMatch(/법정상속분/);
    expect(t).toContain("「민법」 제1013조");
    expect(t).toContain("「민법」 제1009조·제1010조");
    expect(t).toContain("소득세법 시행령 §155⑲");
    expect(t).toMatch(/2개월 이내/);
    expect(t).toMatch(/신고·납부/);
  });
  it("공동상속 토글을 켜기 전에도 보인다(「단독」으로 두는 사용자도 읽는다)", () => {
    render(<HouseEntryEditor house={entry({ isInherited: true, isCoInherited: false })} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-entry-155-19-notice")).not.toBeNull();
  });
  it("긍정 짝 — 상속주택이 아니면 안내가 없다", () => {
    render(<HouseEntryEditor house={entry()} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-entry-155-19-notice")).toBeNull();
  });
  it("결정 #6 — 최대지분 안내는 「산입하되 §155② 요건으로 제외」이고 판정 기준일(상속개시일)을 알린다", () => {
    const { container } = render(
      <HouseEntryEditor house={entry({ isInherited: true, isCoInherited: true })} onUpdate={() => {}} />,
    );
    const t = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toContain("최대지분 상속인은 그 주택을 소유한 것으로 보아 주택 수에 산입하되");
    expect(t).toContain("상속주택 특례 요건(소령 §155② — 동일세대 단서·상속개시 당시 보유·2년 내 증여·순위)");
    expect(t).toContain("소수지분이면 §155③으로 주택 수에서 제외됩니다");
    expect(t).toContain("최대지분 판정 기준일은 상속개시일입니다");
    // 부정 짝 — 변경 전 단정 문구(최대지분이면 제외하지 않는다는 뜻)는 없다
    expect(t).not.toMatch(/최대지분 상속인이면 주택 수에 산입되고, 소수지분이면/);
  });
});

describe("S14a-8 — 상속·장기임대 주택 수 안내", () => {
  it("상속 토글 ON — 「주택 수 산정에서 자동 배제」 안내가 없고 중과·주택 수 축을 나눠 말한다", () => {
    const { container } = render(
      <HouseEntryEditor house={entry({ isInherited: true, inheritedDate: "2023-01-01" })} onUpdate={() => {}} />,
    );
    expect(screen.queryAllByText(/주택 수 산정에서 자동 배제/)).toHaveLength(0);
    const t = container.textContent ?? "";
    expect(t).toContain("5년 이내이면 중과 대상에서만 제외되고 주택 수에는 산입됩니다");
    expect(t).toMatch(/§155②\)에는 이 5년 기간 제한이 없습니다/);
  });
  it("장기임대 유형 — 「미충족 시 주택 수에 산입」(충족 시 불산입 함의) 안내가 없다", () => {
    const { container } = render(
      <HouseEntryRentalTypeSection
        house={entry({ isLongTermRental: true, rentalType: "B" } as Partial<HouseEntry>)}
        idPrefix="t"
        onUpdate={() => {}}
      />,
    );
    expect(screen.queryAllByText(/미충족 시 주택 수에 산입/)).toHaveLength(0);
    expect(container.textContent ?? "").toContain("요건 충족 여부와 무관하게 주택 수에는 산입되며");
  });
  it("긍정 짝 — 엔진: 상속 5년 이내도 주택 수 3, 중과 배제는 참", () => {
    const td = new Date("2024-06-01");
    const inh = makeHouse("inh", { isInherited: true, inheritedDate: new Date("2022-01-01"), decedentSameHouseholdAtInheritance: false });
    expect(countEffectiveHouses([makeHouse("s"), inh, makeHouse("o")], td, [], defaultRules).count).toBe(3);
    expect(isSurchargeExemptInherited(inh, td)).toBe(true);
  });
});

function presaleForm(type: PresaleRightEntry["type"]): OneHouseJudgmentFormData {
  const base = { ...createDefaultTransferFormData(), ...createInitialOneHouseJudgmentForm() };
  return {
    ...base,
    assets: base.assets.map((a, i) => (i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-06-01" } : a)),
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    presaleRights: [
      { id: "r1", type, acquisitionDate: "2016-10-01", region: "capital", isInherited: true, decedentSameHouseholdAtInheritance: true },
    ],
  };
}

describe("S14b-1 — 동일세대 상속 단서 예외 칸 라벨(분양권 §156의3④ · 입주권 §156의2⑥)", () => {
  it("분양권 행 — 「주택이 전환된 것」이 아니라 「합가 전부터 보유하던 분양권」을 묻는다", () => {
    render(<Step2 form={presaleForm("presale_right")} onChange={() => {}} />);
    expect(screen.queryAllByText(/주택이 전환된 것/)).toHaveLength(0);
    expect(screen.queryAllByText(/동거봉양 합가 전부터 보유하던 분양권/).length).toBeGreaterThan(0);
  });
  it("긍정 짝 — 입주권 행은 전환 문언 그대로", () => {
    render(<Step2 form={presaleForm("redevelopment_right")} onChange={() => {}} />);
    expect(screen.queryAllByText(/동거봉양 합가 전부터 보유하던 주택이 전환된 것/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/합가 전부터 보유하던 분양권/)).toHaveLength(0);
  });
});

describe("S15-15 — 합가 기한 안내는 엔진 연혁 leaf를 읽는다", () => {
  const text = (marriageDate: string, parentalCareMergeDate: string) => {
    const { container } = render(
      <MergeDateSection form={{ marriageDate, parentalCareMergeDate, parentalCareParentAge: "", isFirstTransferredInMerge: true }} onChange={() => {}} />,
    );
    return container.textContent ?? "";
  };
  it("혼인 안내는 경과 규정(2024-11-12 전 양도 5년)을 병기한다", () => {
    const t = text("2018-03-01", "");
    expect(t).toContain(`혼인합가 후 ${mergeExemptionYearsLabel({ marriageDate: "2018-03-01" })} 내 먼저 양도`);
    expect(t).toContain("10년(2024-11-12 전 양도는 5년)");
  });
  it("동거봉양 안내는 경과 규정(2018-02-13 전 양도 5년)을 병기한다", () => {
    const t = text("", "2010-03-01");
    expect(t).toContain(`동거봉양 합가 후 ${mergeExemptionYearsLabel({ parentalCareMergeDate: "2010-03-01" })} 내 먼저 양도`);
    expect(t).toContain("10년(2018-02-13 전 양도는 5년)");
  });
  it("합가일 미입력이어도 두 안내가 각자 종류의 경과 규정을 말한다(종류 고정)", () => {
    const t = text("", "");
    expect(t).toContain("혼인합가 후 10년(2024-11-12 전 양도는 5년) 내");
    expect(t).toContain("동거봉양 합가 후 10년(2018-02-13 전 양도는 5년) 내");
    expect(t).not.toContain("후 10년 내 먼저");
  });
  it("양도일을 주면 해소된 연수 — leaf와 같다", () => {
    expect(mergeExemptionYearsLabel({ kind: "marriage", transferDate: "2024-06-01" })).toBe("5년");
    expect(mergeExemptionYearsLabel({ kind: "marriage", transferDate: "2024-11-12" })).toBe("10년");
    expect(mergeExemptionYearsLabel({ kind: "parental_care", transferDate: "2017-06-01" })).toBe("5년");
  });
});
