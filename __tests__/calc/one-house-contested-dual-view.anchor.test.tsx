/**
 * @vitest-environment jsdom
 *
 * P4 — 해석이 갈리는 쟁점(양론)을 두 입장의 결론으로 보여 준다. route 결론(두 입장 각각)은 해석례 평가셋
 * `E001`·`E094`(C6) · `E107`·`E109`·`E110`(C1) · `E083`·`E084`·`E086`·`E088`·`E076`(C2)이 고정하고,
 * 쟁점이 없어야 하는 짝은 `N-E107-not-gifted` · `E002-era`(혼인 — 양론 아님) · `E156-farmexit`(재귀농 — 양론 아님)이다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | D-1 | 감지 | C1·C2·C6 사실 패턴에서만 감지 · 최대지분자·동거봉양 예외·입주권 양도·혼인 동반은 감지하지 않음 |
 * | L-1 | 입주권 leaf | 동거봉양 합가는 재판정 플래그가 있을 때만 판정 · 합가 후 상속받은 직계존속 주택은 상대 쪽 1채 |
 * | V-1 | 배지 | 결론이 갈리면 「해석이 갈림」, 같으면 본 결론 · 이력(resultData)도 같은 술어 |
 * | Z-1 | ⑫ | 재판정 플래그는 본문으로 못 들어온다(Zod strip) — 본 판정은 엔진 입장 그대로 |
 * | P-1 | ④⑭ | 「동일세대원에게 증여」는 상속주택일 때만 실리고 route가 엔진 행으로 넘긴다 |
 * | W-1 | ⑤ | 칩은 판정 메뉴 편집 창에만 · 켜면 같은 칸 · 상속 OFF면 지운다 |
 * | C-1 | ⑦ | 결과 화면이 두 결론·근거·엔진 입장을 보여 준다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import { detectContestedIssues, buildContestedIssue } from "@/lib/tax-engine/one-house/contested-issues";
import { resolveRightSaleMarriageMerge } from "@/lib/tax-engine/one-house/right-sale-marriage-merge";
import { oneHouseVerdictOf, oneHouseVerdictFromResult } from "@/lib/calc/one-house-judgment-verdict";
import { buildOtherHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { mapHousesToEngine } from "@/lib/api/transfer-route-multi-house";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import E001 from "./one-house-rulings/cases/E001.json";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const C1 = "155-2-inherited-house-gifted-within-household";
const C2 = "155-3-same-household-co-inherited-minority";
const C6 = "155-4-parental-care-merge-right-sale";

const engineInput = (over: Record<string, unknown>) =>
  ({
    propertyType: "housing",
    isOneHousehold: true,
    acquisitionDate: new Date("2017-06-15"),
    transferDate: new Date("2023-12-15"),
    sellingHouseId: "S",
    houses: [],
    ...over,
  }) as unknown as TransferTaxInput;

describe("D-1 감지", () => {
  const ids = (over: Record<string, unknown>) => detectContestedIssues(engineInput(over)).map((d) => d.id);
  const coMinority = { id: "A", isInherited: true, isCoInherited: true, decedentSameHouseholdAtInheritance: true };

  it("C2 — 동일세대 상속 공동상속 소수지분이면 감지하고, 반대 입장 입력은 그 행의 동일세대 게이트만 연다", () => {
    expect(ids({ houses: [coMinority] })).toEqual([C2]);
    const [d] = detectContestedIssues(engineInput({ houses: [coMinority] }));
    expect(d.otherPositionInput.houses?.[0]).toMatchObject({ isInherited: true, isCoInherited: true, decedentSameHouseholdAtInheritance: false });
  });
  it("C2 — 최대지분자·동거봉양 합가 전 보유·별도세대·단독상속·양도 주택 자신은 감지하지 않는다", () => {
    expect(ids({ houses: [{ ...coMinority, isLargestCoInheritedShareholder: true }] })).toEqual([]);
    expect(ids({ houses: [{ ...coMinority, parentalCareMergeInheritedHouse: true }] })).toEqual([]);
    expect(ids({ houses: [{ ...coMinority, decedentSameHouseholdAtInheritance: false }] })).toEqual([]);
    expect(ids({ houses: [{ ...coMinority, isCoInherited: false }] })).toEqual([]);
    expect(ids({ houses: [{ ...coMinority, id: "S" }] })).toEqual([]);
  });
  it("C1 — 상속주택 행에 증여 표시가 있으면 감지하고, 반대 입장 입력은 그 행을 상속주택이 아닌 주택으로 둔다", () => {
    const gifted = { id: "B", isInherited: true, inheritedDate: new Date("2008-01-09"), inheritedGiftedToHouseholdMember: true };
    expect(ids({ houses: [gifted] })).toEqual([C1]);
    const [d] = detectContestedIssues(engineInput({ houses: [gifted] }));
    expect(d.otherPositionInput.houses?.[0]).toMatchObject({ id: "B", isInherited: false, inheritedDate: undefined });
    expect(ids({ houses: [{ ...gifted, inheritedGiftedToHouseholdMember: undefined }] })).toEqual([]);
    expect(ids({ houses: [{ ...gifted, isInherited: false }] })).toEqual([]);
  });
  it("C1·C2는 주택 양도에서만 — 입주권 양도는 §155②③을 「다른 주택」에서 빼지 않는다", () => {
    expect(ids({ propertyType: "right_to_move_in", houses: [coMinority] })).toEqual([]);
  });
  it("C6 — 입주권 양도 + 동거봉양 합가일이면 감지 · 혼인합가가 함께 있거나 주택 양도면 감지하지 않는다", () => {
    const care = { parentalCareMerge: { mergeDate: new Date("2003-12-29") } };
    expect(ids({ propertyType: "right_to_move_in", ...care })).toEqual([C6]);
    const [d] = detectContestedIssues(engineInput({ propertyType: "right_to_move_in", ...care }));
    expect(d.otherPositionInput.contestedRightSaleParentalCareMergeApply).toBe(true);
    expect(ids({ propertyType: "right_to_move_in", ...care, marriageMerge: { marriageDate: new Date("2003-01-01") } })).toEqual([]);
    expect(ids({ ...care })).toEqual([]);
  });
  it("결론이 같으면 conclusionsDiffer=false · 엔진 입장이 본 판정 결론을 갖는다", () => {
    const same = buildContestedIssue({ id: C1, houseIds: ["B"] }, "exempt", "exempt");
    expect(same.conclusionsDiffer).toBe(false);
    const differ = buildContestedIssue({ id: C2, houseIds: ["A"] }, "taxable", "exempt");
    expect(differ.enginePosition).toBe("A");
    expect(differ.positions.map((p) => [p.key, p.verdict])).toEqual([["A", "taxable"], ["B", "exempt"]]);
  });
});

describe("L-1 입주권 합가 leaf — 동거봉양", () => {
  const base = {
    isFirstTransferredInMerge: true,
    acquisitionDate: new Date("1998-08-01"),
    transferDate: new Date("2004-03-03"),
    parentalCareMerge: { mergeDate: new Date("2003-12-29") },
    houses: [{ id: "p", acquisitionDate: new Date("1995-05-15"), mergeOrigin: "counterpart_side" }],
  } as unknown as Parameters<typeof resolveRightSaleMarriageMerge>[0];

  it("재판정 플래그가 없으면 판정하지 않는다(엔진 입장 B — 계산기도 같다)", () => {
    expect(resolveRightSaleMarriageMerge(base)).toBeNull();
  });
  it("플래그가 있으면 상대 쪽 1채를 뺀다", () => {
    expect(resolveRightSaleMarriageMerge({ ...base, contestedRightSaleParentalCareMergeApply: true })).toMatchObject({
      status: "applies",
      kind: "parental_care",
      excludedHouseIds: ["p"],
    });
  });
  it("합가 후 상속받은 직계존속 주택(합가 전부터 피상속인 보유)은 상대 쪽 1채로 센다", () => {
    const inherited = {
      ...base,
      contestedRightSaleParentalCareMergeApply: true,
      houses: [{ id: "m", acquisitionDate: new Date("2004-01-20"), parentalCareMergeInheritedHouse: true }],
    } as typeof base;
    expect(resolveRightSaleMarriageMerge(inherited)).toMatchObject({ status: "applies", excludedHouseIds: ["m"] });
    const plainAfter = { ...inherited, houses: [{ id: "m", acquisitionDate: new Date("2004-01-20") }] } as typeof base;
    expect(resolveRightSaleMarriageMerge(plainAfter)).toMatchObject({ status: "fails" });
  });
});

describe("V-1 판정 배지", () => {
  it("결론이 갈리면 「해석이 갈림」, 같으면 본 결론", () => {
    expect(oneHouseVerdictOf({ isExempt: true }, undefined, [{ conclusionsDiffer: true }]).label).toBe("해석이 갈림");
    expect(oneHouseVerdictOf({ isExempt: true }, undefined, [{ conclusionsDiffer: false }]).label).toBe("비과세");
    expect(oneHouseVerdictOf({ isExempt: false }).label).toBe("과세");
  });
  it("이력 resultData도 같은 술어를 거친다", () => {
    expect(oneHouseVerdictFromResult({ judgment: { isExempt: false }, contestedIssues: [{ conclusionsDiffer: true }] })?.label).toBe(
      "해석이 갈림",
    );
    expect(oneHouseVerdictFromResult({ judgment: { isExempt: false } })?.label).toBe("과세");
  });
});

describe("Z-1 ⑫ — 재판정 플래그는 본문으로 못 들어온다", () => {
  const post = async (extra: Record<string, unknown>) => {
    const c = (E001 as RulingCase[]).find((x) => x.id === "E001-dual")!;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
    const body = { ...buildOneHouseExemptionApiBody(buildCaseForm(c)), ...extra };
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    return (await res.json()).data as OneHouseExemptionResponse;
  };
  it("플래그를 본문에 실어도 본 판정은 입장 B(과세)이고 쟁점 카드의 입장 A만 비과세다", async () => {
    const r = await post({ contestedRightSaleParentalCareMergeApply: true });
    expect(r.judgment.isExempt).toBe(false);
    expect(r.contestedIssues?.map((c) => [c.id, c.positions[0].verdict, c.positions[1].verdict])).toEqual([[C6, "exempt", "taxable"]]);
  });
});

const row = (over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "B",
  region: "capital",
  acquisitionDate: "2008-01-09",
  officialPrice: "300000000",
  isInherited: true,
  inheritedDate: "2008-01-09",
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

describe("P-1 ④ · ⑭", () => {
  it("④ 상속주택일 때만 싣는다 · ⑭ route 매핑이 엔진 행으로 넘긴다", () => {
    const [on] = buildOtherHousesPayload([row({ inheritedGiftedToHouseholdMember: true })]) as Record<string, unknown>[];
    expect(on.inheritedGiftedToHouseholdMember).toBe(true);
    const [off] = buildOtherHousesPayload([row({ isInherited: false, inheritedGiftedToHouseholdMember: true })]) as Record<
      string,
      unknown
    >[];
    expect(off.inheritedGiftedToHouseholdMember).toBeUndefined();
    expect(mapHousesToEngine([on as never])?.[0]).toMatchObject({ inheritedGiftedToHouseholdMember: true });
  });
});

describe("W-1 ⑤ 편집 창", () => {
  const CHIP = "house-row-inherited-gifted-to-household-member";
  it("householdGiftEnabled일 때만 칩이 보이고, 켜면 같은 칸으로 올라간다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row()} onUpdate={onUpdate} householdGiftEnabled />);
    fireEvent.click(screen.getByTestId(CHIP).querySelector("[role=switch], button, input")!);
    expect(onUpdate).toHaveBeenCalledWith({ inheritedGiftedToHouseholdMember: true });
    cleanup();
    render(<HouseEntryEditor house={row()} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId(CHIP)).toBeNull();
  });
  it("상속 OFF로 바꾸면 지운다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row({ inheritedGiftedToHouseholdMember: true })} onUpdate={onUpdate} householdGiftEnabled />);
    fireEvent.click(screen.getByRole("switch", { name: /피상속인으로부터 상속받은 주택/ }));
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ isInherited: false, inheritedGiftedToHouseholdMember: undefined }),
    );
  });
  it("판정 메뉴 Step2 편집 창에는 있고, 계산기 명부 편집 창에는 없다", async () => {
    const { Step2 } = await import("@/app/calc/one-house-exemption/steps/Step2");
    const { createInitialOneHouseJudgmentForm } = await import("@/lib/stores/one-house-judgment-form.types");
    const f = createInitialOneHouseJudgmentForm();
    render(
      <Step2
        form={{
          ...f,
          isOneHousehold: true,
          transferDate: "2026-03-01",
          assets: [{ ...f.assets[0], assetKind: "housing" as const, acquisitionDate: "2015-01-01" }],
          houses: [row()],
        }}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.queryByTestId(CHIP)).not.toBeNull();
    cleanup();
    const { HousesListSection } = await import("@/app/calc/transfer-tax/steps/step4-sections/HousesListSection");
    const { createDefaultTransferFormData } = await import("@/lib/stores/calc-wizard-store");
    render(<HousesListSection form={{ ...createDefaultTransferFormData(), houses: [row()] }} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.getByRole("switch", { name: /피상속인으로부터 상속받은 주택/ })).not.toBeNull(); // 편집 창이 열렸다(짝)
    expect(screen.queryByTestId(CHIP)).toBeNull();
  });
});

describe("C-1 ⑦ 결과 화면", () => {
  const result = {
    judgment: {
      isExempt: false,
      isPartialExempt: false,
      appliedExceptions: [],
      pending: [],
      undetermined: [],
      unmetExceptions: [],
      legalBasis: [],
    },
    houseCount: { total: 1, countedForExemption: 1, excluded: [] },
    contestedIssues: [buildContestedIssue({ id: C2, houseIds: ["A"] }, "taxable", "exempt")],
  } as unknown as OneHouseExemptionResponse;

  it("배지는 「해석이 갈림」 · 두 입장 결론·근거와 엔진 입장을 보여 준다", () => {
    render(<OneHouseJudgmentResultView result={result} />);
    expect(screen.getByTestId("one-house-verdict").textContent).toBe("해석이 갈림");
    expect(screen.getByTestId(`one-house-contested-${C2}-A-verdict`).textContent).toBe("과세");
    expect(screen.getByTestId(`one-house-contested-${C2}-B-verdict`).textContent).toBe("비과세");
    expect(screen.getByTestId(`one-house-contested-${C2}-B`).textContent).toContain("조심-2023-중-7006");
    expect(screen.getByTestId(`one-house-contested-${C2}-note`).textContent).toContain("입장 A에 따릅니다");
  });
  it("쟁점이 없으면 카드도 없고 배지는 본 결론", () => {
    render(<OneHouseJudgmentResultView result={{ ...result, contestedIssues: undefined }} />);
    expect(screen.getByTestId("one-house-verdict").textContent).toBe("과세");
    expect(screen.queryByTestId(`one-house-contested-${C2}`)).toBeNull();
  });
});
