/** @vitest-environment jsdom */
/**
 * 조정대상지역 고지 — 함께 양도 컴패니언까지 (계획서 `docs/00-pm/regulated-area-assumption-companion.plan.md` Q-1~Q-4 a).
 * 컴패니언은 ④(`companionRegulatedFlags`)가 자기 소재지로 판정해 싣는다 — 고지도 같은 호출을 읽어야 가정이 보인다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { RegulatedAreaAssumptionLine } from "@/components/calc/results/transfer/RegulatedAreaAssumptionLine";
import { companionRegulatedFlags, regulatedAddressAssumptions } from "@/lib/calc/effective-regulated-at-acquisition";
import { regulatedAssumptionPdfGroups } from "@/lib/calc/regulated-area-assumption-text";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const HIGH = { addressJibun: "서울특별시 강남구 테헤란로 1" }; // high — 고지 없음
const LOW = { addressJibun: "강남구 테헤란로 1" }; // 시·도 생략 — low · 조정대상지역
const MEDIUM = { addressJibun: "경기도 남양주시 화도읍 1", acquisitionDate: "2020-12-01" }; // 취득 당시 medium · true

const asset = (n: number, o: Record<string, unknown> = {}) =>
  ({ ...makeDefaultAsset(n), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02", regionCode: "", ...o }) as never;

function form(assets: unknown[], o: Partial<TransferFormData> = {}): TransferFormData {
  return { ...createDefaultTransferFormData(), transferDate: "2026-02-16", assets, ...o } as TransferFormData;
}

const keys = (f: TransferFormData) => regulatedAddressAssumptions(f).map((r) => `${r.assetIndex}:${r.which}/${r.confidence}/${r.isRegulated}/sel=${r.selectable}`);

describe("컴패니언 고지 leaf", () => {
  it("C-1 주 자산 high + 컴패니언 화도읍(medium) → 컴패니언 취득 줄 하나뿐", () => {
    expect(keys(form([asset(1, HIGH), asset(2, MEDIUM)]))).toEqual(["1:acquisition/medium/true/sel=false"]);
  });

  it("C-2 주 자산 low + 컴패니언 low → 자산마다 두 줄 · 컴패니언은 직접 선택 칸 없음", () => {
    expect(keys(form([asset(1, LOW), asset(2, LOW)]))).toEqual([
      "0:transfer/low/true/sel=true",
      "0:acquisition/low/true/sel=true",
      "1:transfer/low/true/sel=false",
      "1:acquisition/low/true/sel=false",
    ]);
  });

  it("C-3 컴패니언에 자체 법정동코드 → 컴패니언 줄 없음", () => {
    expect(keys(form([asset(1, HIGH), asset(2, { ...LOW, regionCode: "1168010100" })]))).toEqual([]);
  });

  it("C-4 컴패니언 토지 → 줄 없음", () => {
    expect(keys(form([asset(1, HIGH), asset(2, { ...LOW, assetKind: "land" })]))).toEqual([]);
  });

  it("C-5 컴패니언 분양권 — §104①4호 구간 안(2020-06-01)은 양도일 한 줄, 구간 밖은 없음", () => {
    const presale = asset(2, { ...LOW, assetKind: "presale_right" });
    expect(keys(form([asset(1, HIGH), presale], { transferDate: "2020-06-01" }))).toEqual(["1:transfer/low/true/sel=false"]);
    expect(keys(form([asset(1, HIGH), presale], { transferDate: "2021-06-01" }))).toEqual([]);
  });

  it("C-6 컴패니언 재개발APT → 양도·취득 두 줄", () => {
    expect(keys(form([asset(1, HIGH), asset(2, { ...LOW, assetKind: "redevelopment_apt" })]))).toEqual([
      "1:transfer/low/true/sel=false",
      "1:acquisition/low/true/sel=false",
    ]);
  });

  it("C-7 같은 물건 지분 분할(축 B) → ④가 싣지 않으므로 컴패니언 줄 없음 · 첫 자산 줄은 그대로", () => {
    const half = { ownershipNumerator: "1", ownershipDenominator: "2" };
    const f = form([asset(1, { ...LOW, ...half }), asset(2, { ...LOW, ...half })], { assetSplitMode: "fractional" });
    expect(keys(f)).toEqual(["0:transfer/low/true/sel=true", "0:acquisition/low/true/sel=true"]);
    // 사용자가 «서로 다른 물건» 으로 고르면(companion) 컴패니언도 ④가 싣는다
    expect(keys({ ...f, assetSplitMode: "companion" })).toHaveLength(4);
  });

  it("C-8 컴패니언 소재지 없음 → 줄 없음(④도 싣지 않는다)", () => {
    expect(keys(form([asset(1, HIGH), asset(2, { addressJibun: "", addressRoad: "" })]))).toEqual([]);
  });

  it("C-9 폼 전역 법정동코드 → 첫 자산 줄만 막고 컴패니언 줄은 남는다(컴패니언 판정은 자기 자산만 읽는다)", () => {
    expect(keys(form([asset(1, LOW), asset(2, LOW)], { regionCode: "1168010100" }))).toEqual([
      "1:transfer/low/true/sel=false",
      "1:acquisition/low/true/sel=false",
    ]);
  });

  it("parity — 컴패니언 줄의 값이 ④가 엔진에 싣는 값과 같다", () => {
    for (const c of [LOW, MEDIUM]) {
      const f = form([asset(1, HIGH), asset(2, c)]);
      const flags = companionRegulatedFlags(f.assets[1], f.transferDate);
      for (const r of regulatedAddressAssumptions(f)) {
        expect(r.isRegulated).toBe(r.which === "transfer" ? flags.isRegulatedArea : flags.wasRegulatedAtAcquisition);
      }
    }
  });
});

describe("컴패니언 고지 화면·PDF", () => {
  it("C-10 단건(컴패니언 없음) — 제목·testid가 종전과 같다", () => {
    render(<RegulatedAreaAssumptionLine form={form([asset(1, LOW)])} />);
    expect(screen.getByTestId("regulated-area-assumption-transfer")).toBeTruthy();
    expect(screen.getByTestId("regulated-area-assumption-acquisition")).toBeTruthy();
    expect(screen.getByTestId("regulated-area-assumption-line").textContent).toContain("조정대상지역 판정 — 확인 필요");
    expect(screen.queryByTestId("regulated-area-assumption-line-1")).toBeNull();
  });

  it("C-11 컴패니언 카드 — 제목에 assetLabel · 직접 선택 안내 없음 · 첫 자산 카드는 직접 선택 안내 유지", () => {
    render(<RegulatedAreaAssumptionLine form={form([asset(1, LOW), asset(2, { ...LOW, assetLabel: "마포 아파트" })])} />);
    const companion = screen.getByTestId("regulated-area-assumption-line-1");
    expect(companion.textContent).toContain("조정대상지역 판정 — 확인 필요 · 마포 아파트");
    expect(companion.textContent).not.toContain("직접 선택하세요");
    expect(companion.textContent).toContain("주소검색으로 소재지를 고르면");
    expect(within(companion).getByTestId("regulated-area-assumption-transfer-1")).toBeTruthy();
    expect(screen.getByTestId("regulated-area-assumption-line").textContent).toContain("「보유 상황」에서 조정대상지역 여부를 직접 선택하세요");
  });

  it("C-12 첫 자산 high + 컴패니언만 해당 → 컴패니언 카드 하나", () => {
    render(<RegulatedAreaAssumptionLine form={form([asset(1, HIGH), asset(2, MEDIUM)])} />);
    expect(screen.queryByTestId("regulated-area-assumption-transfer")).toBeNull();
    expect(screen.getByTestId("regulated-area-assumption-acquisition-1")).toBeTruthy();
  });

  it("C-13 다건 label과 함께 — 「label · assetLabel」", () => {
    render(<RegulatedAreaAssumptionLine form={form([asset(1, HIGH), asset(2, MEDIUM)])} label="양도 2번" />);
    expect(screen.getByTestId("regulated-area-assumption-line-1").textContent).toContain("확인 필요 · 양도 2번 · 자산 2");
  });

  it("C-14 PDF 묶음 — 자산마다 한 그룹 · 컴패니언 label · 빈 그룹 제외", () => {
    const groups = regulatedAssumptionPdfGroups([{ form: form([asset(1, LOW), asset(2, MEDIUM)]) }]);
    expect(groups.map((g) => g.label)).toEqual([undefined, "자산 2"]);
    expect(groups.map((g) => g.rows.length)).toEqual([2, 1]);
    expect(regulatedAssumptionPdfGroups([{ form: form([asset(1, HIGH), asset(2, HIGH)]) }])).toEqual([]);
    expect(regulatedAssumptionPdfGroups([{ form: form([asset(1, HIGH), asset(2, MEDIUM)]), label: "양도 1번" }]).map((g) => g.label)).toEqual(["양도 1번 · 자산 2"]);
  });
});
