/**
 * anchor(④·⑤·⑧) — 다주택 중과 판정 메뉴 P1 · D7: 보유 주택 행의 「소득세법 시행령」 §167의3①4호(사원용)·8호(저당권 3년)·
 * 8호의2(어린이집) + 8호의2 사용 상태(사용 종료일 또는 「양도일 현재 사용 중」 택일).
 *
 * 계획서 `docs/00-pm/multi-house-surcharge-judgment-menu.plan.md` §5.4 · Q-A.
 *
 * | # | 주장 |
 * |---|---|
 * | D7-1 | ④ 행의 4·8·8의2 사실이 양도 주택과 같은 변환으로 실린다 |
 * | D7-2 | ④ 「사용 중」을 고르면 남은 종료일은 싣지 않는다 · 어린이집이 꺼져 있으면 사용 상태도 싣지 않는다 |
 * | D7-3 | ④ 양도 주택 사용 상태도 같은 leaf로 실린다 |
 * | D7-4 | ⑧ 계산기 행: 어린이집 사용 상태가 비면 막는다 · 고르면 통과 · 사원용 기간 비면 막는다 |
 * | D7-5 | ⑧ 계산기 양도 주택: 사용 상태가 비면 `sellingHouseExclusion.dayCareEndDate`로 막는다 |
 * | D7-6 | ⑧ 판정 메뉴 행: 같은 leaf로 막는다(⑫가 같은 조건으로 400을 내므로) |
 * | D7-7 | ⑤ 행 편집 ④ 카드: 어린이집을 켜면 사용 기간·사용 상태 칸이 열리고, 「사용 중」을 고르면 종료일을 지우고 칸을 닫는다 |
 * | D7-8 | 판정 메뉴(중과 입력 닫힘)에서도 D7 사실이 담긴 행이면 ④ 카드를 연다(막다른 길 방지) |
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { buildHousesPayload, buildOtherHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { houseEntrySpecialExclusionVisible } from "@/lib/calc/house-entry-judgment-scope";
import { HouseEntrySpecialExclusionSection } from "@/components/calc/transfer/HouseEntrySpecialExclusionSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeHouse } from "./one-house-rulings/harness";

afterEach(cleanup);

const row = (over: Partial<HouseEntry> = {}) =>
  makeHouse("h1", { region: "capital", acquisitionDate: "2018-01-01", officialPrice: "300000000", ...over });

function calcForm(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  return { ...f, transferDate: "2024-06-01", filingDate: "2024-08-31", householdHousingCount: "3", ...over };
}
const issueMessages = (f: TransferFormData) => collectStep1Issues(f).map((i) => i.message);

describe("D7-1~3 ④ 변환", () => {
  it("[D7-1] 행의 4·8·8의2 사실이 실린다", () => {
    const [p] = buildOtherHousesPayload([
      row({
        isMortgageExecution: true,
        isEmployeeHousing: true,
        freeProvisionYears: "12",
        isDayCareCenter: true,
        dayCareOperationYears: "6",
        dayCareEndDate: "2024-03-01",
      }),
    ]) as Record<string, unknown>[];
    expect(p).toMatchObject({
      isMortgageExecution: true,
      isEmployeeHousing: true,
      freeProvisionYears: 12,
      isDayCareCenter: true,
      dayCareOperationYears: 6,
      dayCareEndDate: "2024-03-01",
    });
  });

  it("[D7-2] 「사용 중」이면 종료일을 싣지 않고, 어린이집이 꺼져 있으면 사용 상태·기간을 싣지 않는다", () => {
    const [inUse] = buildOtherHousesPayload([
      row({ isDayCareCenter: true, dayCareOperationYears: "6", dayCareInUse: true, dayCareEndDate: "2024-03-01" }),
    ]) as Record<string, unknown>[];
    expect(inUse.dayCareInUse).toBe(true);
    expect(inUse.dayCareEndDate).toBeUndefined();
    const [off] = buildOtherHousesPayload([
      row({ isDayCareCenter: false, dayCareOperationYears: "6", dayCareEndDate: "2024-03-01", freeProvisionYears: "12" }),
    ]) as Record<string, unknown>[];
    expect(off.dayCareOperationYears).toBeUndefined();
    expect(off.dayCareEndDate).toBeUndefined();
    expect(off.dayCareInUse).toBeUndefined();
    expect(off.freeProvisionYears).toBeUndefined();
  });

  it("[D7-3] 양도 주택 사용 상태도 같은 leaf로 실린다", () => {
    const f = calcForm({
      houses: [row()],
      sellingHouseExclusion: { isDayCareCenter: true, dayCareOperationYears: "6", dayCareEndDate: "2024-02-01" },
    });
    const [selling] = buildHousesPayload(f.assets[0], f.houses ?? [], 0, f.sellingHouseExclusion, f.transferDate) as Record<
      string,
      unknown
    >[];
    expect(selling).toMatchObject({ id: "selling", isDayCareCenter: true, dayCareOperationYears: 6, dayCareEndDate: "2024-02-01" });
  });
});

describe("D7-4~6 ⑧", () => {
  it("[D7-4] 계산기 행: 사용 상태 비면 차단 · 고르면 통과 · 사원용 기간 비면 차단", () => {
    const blocked = issueMessages(calcForm({ houses: [row({ isDayCareCenter: true, dayCareOperationYears: "6" })] }));
    expect(blocked.some((m) => /어린이집: 사용하지 않게 된 날을 입력하거나/.test(m))).toBe(true);
    const ok = issueMessages(calcForm({ houses: [row({ isDayCareCenter: true, dayCareOperationYears: "6", dayCareInUse: true })] }));
    expect(ok.some((m) => /어린이집/.test(m))).toBe(false);
    const emp = issueMessages(calcForm({ houses: [row({ isEmployeeHousing: true })] }));
    expect(emp.some((m) => /사원용 주택의 무상 제공 기간/.test(m))).toBe(true);
  });

  it("[D7-5] 계산기 양도 주택: 사용 상태 비면 `sellingHouseExclusion.dayCareEndDate`로 차단", () => {
    const issues = collectStep1Issues(
      calcForm({ houses: [row()], sellingHouseExclusion: { isDayCareCenter: true, dayCareOperationYears: "6" } }),
    );
    expect(issues.some((i) => i.field === "sellingHouseExclusion.dayCareEndDate")).toBe(true);
  });

  it("[D7-6] 판정 메뉴 행: 같은 leaf로 차단", () => {
    const f = createInitialOneHouseJudgmentForm();
    const form = {
      ...f,
      isOneHousehold: true,
      transferDate: "2024-06-01",
      assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" }],
      houses: [row({ isDayCareCenter: true, dayCareOperationYears: "6" })],
    } as unknown as OneHouseJudgmentFormData;
    const e = validateStep2(form).find((x) => x.field === "houses.0.dayCareEndDate");
    expect(e?.message).toMatch(/어린이집: 사용하지 않게 된 날을 입력하거나/);
  });
});

describe("D7-7~8 ⑤", () => {
  it("[D7-7] 어린이집을 켜면 칸이 열리고 「사용 중」을 고르면 종료일을 지운다", () => {
    let house = row();
    const onUpdate = (patch: Partial<HouseEntry>) => {
      house = { ...house, ...patch };
    };
    const { rerender } = render(<HouseEntrySpecialExclusionSection house={house} onUpdate={onUpdate} />);
    expect(screen.queryByText("어린이집 사용 기간 (년)")).toBeNull();
    fireEvent.click(document.querySelector('[data-slot="switch"][aria-label="어린이집 운영 주택"]')!);
    expect(house.isDayCareCenter).toBe(true);
    house = { ...house, dayCareEndDate: "2024-03-01" };
    rerender(<HouseEntrySpecialExclusionSection house={house} onUpdate={onUpdate} />);
    expect(screen.getByText("어린이집 사용 기간 (년)")).toBeTruthy();
    expect(screen.getByText(/어린이집으로 사용하지 않게 된 날/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("house-daycare-in-use-h1"));
    expect(house.dayCareInUse).toBe(true);
    expect(house.dayCareEndDate).toBeUndefined();
  });

  it("[D7-8] 중과 입력을 닫은 화면도 D7 사실이 담긴 행이면 ④ 카드를 연다", () => {
    expect(houseEntrySpecialExclusionVisible(row(), true)).toBe(false);
    expect(houseEntrySpecialExclusionVisible(row({ isDayCareCenter: true }), true)).toBe(true);
    expect(houseEntrySpecialExclusionVisible(row({ isEmployeeHousing: true }), true)).toBe(true);
    expect(houseEntrySpecialExclusionVisible(row({ isMortgageExecution: true }), true)).toBe(true);
  });
});
