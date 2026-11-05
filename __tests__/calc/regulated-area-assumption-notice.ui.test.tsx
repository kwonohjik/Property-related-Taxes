/** @vitest-environment jsdom */
/**
 * 결과 화면 「조정대상지역 판정 — 확인 필요」 — leaf(`regulatedAddressAssumptions`)와 한 줄 컴포넌트, 결과 뷰 4+1곳 배치.
 * 계획서 `docs/00-pm/regulated-area-assumption-notice.plan.md` §4(N-1~N-10) · Q-1~Q-3 a.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, cleanup } from "@testing-library/react";
import { RegulatedAreaAssumptionLine } from "@/components/calc/results/transfer/RegulatedAreaAssumptionLine";
import { regulatedAddressAssumptions, calcStoredRegulatedFlags } from "@/lib/calc/effective-regulated-at-acquisition";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function form(asset: Record<string, unknown>, over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-02-16",
    ...over,
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02", regionCode: "", ...asset }],
  } as TransferFormData;
}
const which = (f: TransferFormData) => regulatedAddressAssumptions(f).map((r) => `${r.which}:${r.isRegulated}:${r.confidence}`);

describe("leaf — ④가 실은 값 중 신뢰도 high가 아닌 주소 문자열 판정만", () => {
  it("N-1 시·도 생략 → 양도·취득 두 줄 · 조정대상지역 · low · ④ 값과 같다", () => {
    const f = form({ addressJibun: "강남구 테헤란로 1" });
    expect(which(f)).toEqual(["transfer:true:low", "acquisition:true:low"]);
    const flags = calcStoredRegulatedFlags(f);
    expect(regulatedAddressAssumptions(f).map((r) => r.isRegulated)).toEqual([flags.isRegulatedArea, flags.wasRegulatedAtAcquisition]);
  });
  it("N-2 읍·면 예외를 못 보는 시군구(남양주 화도읍) → medium", () => {
    expect(which(form({ addressJibun: "경기도 남양주시 화도읍 1", acquisitionDate: "2015-01-01" }, { transferDate: "2020-12-01" }))).toEqual([
      "transfer:true:medium",
    ]);
  });
  it("N-3 정식·약칭 시·도 + 시군구(high) → 없음", () => {
    expect(which(form({ addressJibun: "서울 강남구 테헤란로 1" }))).toEqual([]);
  });
  it("N-4 법정동코드(자산 또는 폼 전역) → 없음", () => {
    expect(which(form({ addressJibun: "강남구 테헤란로 1", regionCode: "1168010100" }))).toEqual([]);
    expect(which(form({ addressJibun: "강남구 테헤란로 1" }, { regionCode: "1168010100" }))).toEqual([]);
  });
  it("N-5·N-6 직접 만진 토글은 내지 않는다", () => {
    expect(which(form({ addressJibun: "강남구 테헤란로 1" }, { isRegulatedAreaTouched: true, wasRegulatedAtAcquisitionTouched: true }))).toEqual([]);
    expect(which(form({ addressJibun: "강남구 테헤란로 1" }, { isRegulatedAreaTouched: true }))).toEqual(["acquisition:true:low"]);
  });
  it("N-6′ 입주권은 만짐 표지를 보지 않는다(Step4가 지운다) — 두 줄", () => {
    expect(which(form({ assetKind: "right_to_move_in", addressJibun: "강남구 테헤란로 1" }, { isRegulatedAreaTouched: true }))).toHaveLength(2);
  });
  it("N-7 토지 → 없음", () => {
    expect(which(form({ assetKind: "land", addressJibun: "강남구 테헤란로 1" }))).toEqual([]);
  });
  it("N-8 데이터에 없는 시·도(제주) → 아님 · low 줄", () => {
    expect(which(form({ addressJibun: "제주특별자치도 제주시 1" }))).toEqual(["transfer:false:low", "acquisition:false:low"]);
  });
});

describe("한 줄 컴포넌트", () => {
  it("문구 — 어느 날 · 어떻게 계산 · 근거 · 할 일", () => {
    render(<RegulatedAreaAssumptionLine form={form({ addressJibun: "강남구 테헤란로 1" })} />);
    expect(screen.getByTestId("regulated-area-assumption-transfer").textContent).toContain("양도일(2026-02-16): 조정대상지역으로 보고 계산 — ");
    expect(screen.getByTestId("regulated-area-assumption-acquisition").textContent).toContain("취득 당시(2018-03-02): 조정대상지역으로 보고 계산");
    expect(screen.getByTestId("regulated-area-assumption-line").textContent).toContain("주소검색으로 소재지를 고르면 법정동코드로 동 단위까지 판정합니다");
  });
  it("N-9 다건 label · 해당 없으면 그리지 않는다", () => {
    render(<RegulatedAreaAssumptionLine form={form({ addressJibun: "강남구 테헤란로 1" })} label="자산 2" />);
    expect(screen.getByText("조정대상지역 판정 — 확인 필요 · 자산 2")).toBeTruthy();
    cleanup();
    const { container } = render(<RegulatedAreaAssumptionLine form={form({ addressJibun: "서울특별시 강남구 1" })} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("N-10 결과 뷰 4+1곳 배치 — 선례 「같은 날 양도 순서」 줄이 있는 곳에는 이 줄도 있다(역grep)", () => {
  const VIEWS = [
    "components/calc/results/TransferTaxResultView.tsx",
    "components/calc/results/BundledAllocationCard.tsx",
    "components/calc/results/mixed-use/MixedUseResultCard.tsx",
    "components/calc/results/MultiTransferTaxResultView.tsx",
  ];
  for (const v of VIEWS) {
    it(v, () => {
      const src = readFileSync(v, "utf8");
      expect(src).toContain("<SameDayOrderLine");
      expect(src).toContain("<RegulatedAreaAssumptionLine");
    });
  }
});
