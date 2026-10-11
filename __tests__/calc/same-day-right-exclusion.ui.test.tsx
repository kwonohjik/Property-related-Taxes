/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 코드 리뷰 결정 #1: 양도일 당일·이후 취득 분양권·입주권은 화면도 보유로 세지 않는다.
 * ④·판정 메뉴 요약과 같은 술어(`rightsOwnedAtTransfer`)를 ⑤ 표시가 쓰는지, 행에 제외 배지가 뜨는지 본다.
 *
 * | # | 주장 |
 * |---|---|
 * | SDU-1 | 입주권 양도 계산기 — 「세대 보유 조합원입주권 수」 표시가 양도일 이전 취득분만 센다 |
 * | SDU-2 | 분양권·입주권 행 — 양도일 당일·이후 취득이면 제외 배지, 양도 전이면 없다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const right = (id: string, acquisitionDate: string): PresaleRightEntry =>
  ({ id, type: "redevelopment_right", acquisitionDate, region: "capital" }) as PresaleRightEntry;

function rightSaleForm(rights: PresaleRightEntry[]): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "0",
    presaleRights: rights,
    assets: base.assets.map((a, i) => (i === 0 ? { ...a, assetKind: "right_to_move_in" as const, acquisitionDate: "2010-04-09" } : a)),
  };
}

describe("SDU-1 ⑤ 입주권 수 표시", () => {
  it("[SDU-1] 양도 전 취득 입주권은 센다(2개) · 같은 날·양도 후는 세지 않는다(1개)", () => {
    // 표시 문구 뒤에 「양도하는 입주권 1개 + …」 설명이 붙어 있어 맨 앞 숫자만 본다.
    const text = () => (screen.getByTestId("household-right-count-derived").textContent ?? "").trim().slice(0, 2);
    const { unmount } = render(<Step4 form={rightSaleForm([right("r", "2024-05-01")])} onChange={() => {}} />);
    expect(text()).toBe("2개");
    unmount();
    const same = render(<Step4 form={rightSaleForm([right("r", "2024-06-01")])} onChange={() => {}} />);
    expect(text()).toBe("1개");
    same.unmount();
    render(<Step4 form={rightSaleForm([right("r", "2024-08-01")])} onChange={() => {}} />);
    expect(text()).toBe("1개");
  });
});

describe("SDU-2 행 배지", () => {
  const badge = (id: string) => screen.queryByTestId(`presale-right-after-transfer-badge-${id}`);
  it("[SDU-2] 같은 날·양도 후 취득 행에는 제외 배지, 양도 전 취득 행에는 없다", () => {
    render(
      <PresaleRightsSection
        rights={[right("before", "2024-05-01"), right("same", "2024-06-01"), right("after", "2024-08-01")]}
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    expect(badge("before")).toBeNull();
    expect(badge("same")?.textContent).toContain("양도일(같은 날 포함) 이후 취득");
    expect(badge("after")).toBeTruthy();
  });
  it("[SDU-2+] 짝 — 양도일을 모르면(미입력) 배지를 달지 않는다", () => {
    render(<PresaleRightsSection rights={[right("x", "2024-06-01")]} onChange={() => {}} />);
    expect(badge("x")).toBeNull();
  });
});
