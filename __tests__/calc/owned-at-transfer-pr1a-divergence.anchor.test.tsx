/**
 * @vitest-environment jsdom
 *
 * PR1a-② (S14b-4) — ①↔④ 주택 수 불일치 안내는 **실제 계산이 쓰는 수**(`houseCountSelfOffset + countedHouseRows`)로 센다.
 * 양도일 당일·이후 취득 행은 안내의 「목록의 N채」·레거시 「목록 기준 전환」 값에도 들어가지 않는다.
 * (S12-1과 한 PR — 이것만 고치면 잔존 스칼라 상태가 「목록의 1채」라는 다른 거짓 안내가 된다.)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { computeHouseCountDivergence } from "@/lib/calc/house-count-divergence";
import { housesPatchWithDerivedCount } from "@/lib/calc/household-house-count";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { hrow as row } from "./_owned-at-transfer-pr1a-helpers";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const T = "2026-06-01";

function cForm(scalar: string, houses: ReturnType<typeof row>[], legacy = false): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = T;
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionDate: "2015-01-05" });
  f.householdHousingCount = scalar;
  f.houses = houses;
  if (legacy) f.legacyHouseCountPrecedence = true;
  return f;
}

const MIX = [row({ id: "a", acquisitionDate: "2012-01-01" }), row({ id: "same", acquisitionDate: T })];

describe("D leaf — computeHouseCountDivergence", () => {
  const base = { primaryKind: "housing", householdHousingCount: "1", presaleRights: [] as unknown[], transferDate: T };
  it("같은 날 1행 → structural 1 · 불일치 없음", () => {
    const r = computeHouseCountDivergence({ ...base, houses: [{ acquisitionDate: T }] });
    expect(r.structuralCount).toBe(1);
    expect(r.showMismatch).toBe(false);
  });
  it("입주권 · 같은 날 1행 → structural 0", () => {
    const r = computeHouseCountDivergence({ ...base, primaryKind: "right_to_move_in", householdHousingCount: "0", houses: [{ acquisitionDate: T }] });
    expect(r.structuralCount).toBe(0);
    expect(r.showMismatch).toBe(false);
  });
  it("[짝] 전날 취득 행은 센다", () => {
    const r = computeHouseCountDivergence({ ...base, houses: [{ acquisitionDate: "2026-05-31" }] });
    expect(r.structuralCount).toBe(2);
    expect(r.showMismatch).toBe(true);
  });
  it("[짝] 양도일이 비어 있으면 거르지 않는다(종전 그대로)", () => {
    const r = computeHouseCountDivergence({ ...base, transferDate: undefined, houses: [{ acquisitionDate: T }] });
    expect(r.structuralCount).toBe(2);
  });
});

describe("S14b-4 화면", () => {
  it("계산기 · 같은 날 1행만 — 스칼라 1과 계산 1채가 같으므로 불일치 안내 없음", () => {
    render(<HousesListSection form={cForm("1", [row({ id: "same", acquisitionDate: T })])} onChange={() => {}} />);
    expect(screen.queryByTestId("house-count-mismatch")).toBeNull();
  });
  it("계산기 · 정상 1행 + 같은 날 1행 — ⑤ patch 파생 스칼라(2)와 계산 2채 → 안내 없음", () => {
    const hhc = housesPatchWithDerivedCount(MIX, "housing", false, T).householdHousingCount;
    expect(hhc).toBe("2");
    render(<HousesListSection form={cForm(hhc!, MIX)} onChange={() => {}} />);
    expect(screen.queryByTestId("house-count-mismatch")).toBeNull();
  });
  it("계산기 · 레거시 「목록 기준 전환」은 계산이 쓰는 수(2)를 쓴다", () => {
    const onChange = vi.fn();
    render(<HousesListSection form={cForm("1", MIX, true)} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("house-count-adopt-roster"));
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ householdHousingCount: "2" });
  });
  it("판정 메뉴 · 같은 날 1행 — 파생 1채와 안내가 일치(불일치 안내 없음)", () => {
    const f = {
      ...createInitialOneHouseJudgmentForm(),
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01" }],
      transferDate: T,
      isOneHousehold: true,
      houses: [row({ id: "same", acquisitionDate: T })],
      presaleRights: [],
    } as unknown as OneHouseJudgmentFormData;
    render(<Step2 form={f} onChange={() => {}} />);
    expect(screen.queryByTestId("house-count-mismatch")).toBeNull();
  });
  it("[대조] 진짜 불일치(스칼라 3 · 명부 정상 1행 = 2채)는 여전히 안내한다", () => {
    render(<HousesListSection form={cForm("3", [row({ id: "a", acquisitionDate: "2012-01-01" })])} onChange={() => {}} />);
    expect(screen.queryByTestId("house-count-mismatch")?.textContent).toContain("목록의 2채");
  });
});

/**
 * ⑤ 배선 — 실제 `HousesListSection`(→ `HouseEntryEditor` DateInput)에 한 글자씩 입력한다.
 * 일 첫 자리만 쳐도 `YYYY-MM-0d`가 emit되는 DateInput(`buildDateStr`)의 중간값에서도 스칼라가 명부 파생값을 따라간다.
 */
describe("S12-1 ⑤ 타이핑 — 같은 날 취득 행을 입력해도 스칼라 2가 남지 않는다", () => {
  function Harness({ onForm }: { onForm: (f: TransferFormData) => void }) {
    const [form, setForm] = useState(() => {
      const f = cForm("1", []);
      f.transferDate = "2025-06-02";
      return f;
    });
    useEffect(() => {
      onForm(form);
    });
    return <HousesListSection form={form} onChange={(p) => setForm((prev) => ({ ...prev, ...p }))} />;
  }
  it("연 2025 · 월 06 · 일 0 → 02 (양도일 2025-06-02) — 매 입력마다 스칼라 = 1", () => {
    const probe: { form?: TransferFormData } = {};
    render(<Harness onForm={(f) => { probe.form = f; }} />);
    fireEvent.click(screen.getByText("+ 주택 추가"));
    const seen: string[] = [];
    for (const [label, value] of [["연도", "2025"], ["월", "06"], ["일", "0"], ["일", "02"]] as const) {
      fireEvent.change(screen.getAllByLabelText(label)[0], { target: { value } });
      seen.push(`${probe.form!.houses[0].acquisitionDate}=${probe.form!.householdHousingCount}`);
    }
    expect(probe.form!.houses[0].acquisitionDate).toBe("2025-06-02");
    // 마지막 두 입력(일 「0」「02」)은 양도일 당일 이전·당일 — 「2025-06-00」은 양도일 전(2채), 「2025-06-02」는 당일(1채)
    expect(seen.at(-1)).toBe("2025-06-02=1");
    expect(probe.form!.householdHousingCount).toBe("1");
  });
});
