/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 결정 #9: 동거봉양 직계존속 연령 칸은 동거봉양 합가일이 있을 때만 열린다.
 * 노드 쪽 배선(④⑫⑭⑧·엔진)은 `parental-care-parent-age.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MergeDateSection } from "@/components/calc/transfer/MergeDateSection";
import { MergedHouseholdRightSection } from "@/components/calc/transfer/MergedHouseholdRightSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const base = { marriageDate: "", parentalCareMergeDate: "", parentalCareParentAge: "" as const, isFirstTransferredInMerge: false };

describe("MergeDateSection — 연령 칸 가시성", () => {
  it("합가일 없음 → 칸 없음 / 혼인합가만 있음 → 칸 없음(혼인합가에는 60세 요건이 없다)", () => {
    render(<MergeDateSection form={base} onChange={() => {}} />);
    expect(screen.queryByTestId("parental-care-age-over-60")).toBeNull();
    cleanup();
    render(<MergeDateSection form={{ ...base, marriageDate: "2020-03-01" }} onChange={() => {}} />);
    expect(screen.queryByTestId("parental-care-age-over-60")).toBeNull();
  });

  it("★ 동거봉양 합가일 있음 → 3지선다가 열리고 선택은 parentalCareParentAge 패치로 올라간다", () => {
    const patches: unknown[] = [];
    render(<MergeDateSection form={{ ...base, parentalCareMergeDate: "2020-03-01" }} onChange={(p) => patches.push(p)} />);
    expect(screen.queryByTestId("parental-care-age-over-60")).not.toBeNull();
    expect(screen.queryByTestId("parental-care-age-care-benefit")).not.toBeNull();
    expect(screen.queryByTestId("parental-care-age-none")).not.toBeNull();
    fireEvent.click(screen.getByTestId("parental-care-age-care-benefit"));
    expect(patches).toContainEqual({ parentalCareParentAge: "care_benefit" });
  });

  it("선택지 문구 — 합가일 현재 만 나이 · 조부모·배우자 직계존속 포함 · 60세 이상인 분이 주택 보유자가 아니어도 됨 · 2009.2.3. 이전 안내", () => {
    render(<MergeDateSection form={{ ...base, parentalCareMergeDate: "2020-03-01" }} onChange={() => {}} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("합가일 현재 만 나이");
    expect(text).toContain("장인·장모 포함");
    expect(text).toContain("그분이 주택을 보유하지 않아도 됩니다");
    expect(text).toContain("2009년 2월 3일 이전");
    expect(text).toContain("입주권·분양권 합가(§156의2⑧2호)와 상속주택(§155② 단서)에는 이 갈래가 없습니다");
  });
});

describe("MergedHouseholdRightSection — 1주택 + 권리 구간은 이 카드가 합가일 칸을 소유하므로 연령 칸도 소유한다", () => {
  const form = (houses: string, parentalCareMergeDate: string) => ({
    ...createDefaultTransferFormData(),
    presaleRights: [{ id: "r", type: "redevelopment_right" as const, acquisitionDate: "2016-10-01", region: "capital" as const }],
    householdHousingCount: houses,
    parentalCareMergeDate,
    parentalCareParentAge: "" as const,
  });
  it("주택 1채(이 카드가 합가일 소유) + 합가일 있음 → 연령 칸 / 합가일 없음 → 없음", () => {
    render(<MergedHouseholdRightSection form={form("1", "2020-03-01")} onChange={() => {}} />);
    expect(screen.queryByTestId("parental-care-age-over-60")).not.toBeNull();
    cleanup();
    render(<MergedHouseholdRightSection form={form("1", "")} onChange={() => {}} />);
    expect(screen.queryByTestId("parental-care-age-over-60")).toBeNull();
  });
  it("부정 짝 — 주택 2채 이상이면 합가일 칸은 ③ 섹션(MergeDateSection)이 소유하므로 이 카드에는 연령 칸이 없다(중복 렌더 방지)", () => {
    render(<MergedHouseholdRightSection form={form("2", "2020-03-01")} onChange={() => {}} />);
    expect(screen.queryByTestId("parental-care-age-over-60")).toBeNull();
  });
});
