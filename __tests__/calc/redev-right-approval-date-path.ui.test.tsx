/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §89② 조합원입주권 축 시행일의 **선언 경로** (R-2)
 *
 * 인가일 칸이 없으면 2006-01-01 전 인가분을 보유한 세대는 §89② 배제를 면할 방법이 없다
 * (memory `feedback_api_trigger_without_input_path_is_noop`).
 *
 * ## 🔑 분양권 행에는 뜨지 않는다
 *
 * 부칙 §12는 **조합원입주권**만 대상이고, 분양권은 §88 10호 정의 시행일 기준 **취득일** 축이다.
 * 분양권 행에 인가일 칸을 띄우면 무관한 입력을 강요하고 축이 하나인 것처럼 읽힌다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const APPROVAL = /관리처분계획 인가일/;

function rightEntry(over: Partial<PresaleRightEntry> = {}): PresaleRightEntry {
  return { id: "r1", type: "redevelopment_right", acquisitionDate: "2015-10-01", region: "capital", ...over };
}

function form(rights: PresaleRightEntry[]): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-06-01" } : a,
    ),
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    presaleRights: rights,
  };
}

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

describe("⑤ 인가일 선언 경로", () => {
  it("★ 조합원입주권 행에 인가일 칸이 있다", () => {
    render(<Step4 form={form([rightEntry()])} onChange={() => {}} />);
    expect(shows(APPROVAL)).toBe(true);
  });

  it("🔑 분양권 행에는 뜨지 않는다 — 축이 다르다", () => {
    render(<Step4 form={form([rightEntry({ type: "presale_right" })])} onChange={() => {}} />);
    expect(shows(APPROVAL)).toBe(false);
  });

  it("권리가 없으면 뜨지 않는다", () => {
    render(<Step4 form={form([])} onChange={() => {}} />);
    expect(shows(APPROVAL)).toBe(false);
  });

  it("★ 입력값이 화면에 반영된다 — 라벨만 있고 배선이 없으면 안 된다", () => {
    render(
      <Step4
        form={form([rightEntry({ managementDisposalApprovalDate: "2005-06-01" })])}
        onChange={() => {}}
      />,
    );
    const year = screen.getAllByDisplayValue("2005");
    expect(year.length).toBeGreaterThan(0);
  });

  it("🔑 「2006-01-01 전」 기준이 화면 문구에 있다 — 사용자가 판단 기준을 알아야 한다", () => {
    render(<Step4 form={form([rightEntry()])} onChange={() => {}} />);
    expect(shows(/2006-01-01 전에 인가된 입주권은/)).toBe(true);
  });
});
