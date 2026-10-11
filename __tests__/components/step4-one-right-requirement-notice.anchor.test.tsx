/** @vitest-environment jsdom */
/**
 * anchor — 계산기 Step4 「1세대1입주권 비과세 요건」 안내가 입력과 반대로 충족을 단정하지 않는다 (S15-13).
 *
 * 「소득세법」 제89조제1항제4호 가목 「양도일 현재 다른 주택 또는 분양권을 보유하지 아니할 것」, 나목 「(분양권을
 * 보유하지 아니하는 경우로 한정한다)」. 분양권 보유 여부는 바로 아래 「분양권·입주권」 목록이 정본이다 — 종전에는
 * 목록에 분양권이 있어도 「분양권 미보유 조건 충족」을 띄웠다. 2022.1.1. 전 취득분 적용 범위는 법률 제18578호
 * 부칙 제7조 ②·③(법제처 실독 — ② 종전 규정 · ③ 2022.1.1. 이후 취득 분양권 대상)이라 이 안내는 가르지 않는다.
 * 또 입주권 화면에는 「§⑥ 비과세 토글」이 없다(입주권 사실은 판정 메뉴 소유 — `ImportedRedevRightFactsCard` 읽기 전용).
 *
 * | # | 목록 상태 | 기대 |
 * |---|---|---|
 * | N-1 | 분양권 1개 | 「분양권 미보유」 단정 없음 · 분양권 요건·부칙 안내 |
 * | N-2 | 🔑 긍정 짝 — 빈 목록 + 「없음」 확인 | 「분양권 미보유」 |
 * | N-3 | 빈 목록 + 확인 없음 | 단정 없음 · 입력 요청 |
 * | N-4 | 모든 경우 | 「§⑥ 비과세 토글」 없음 |
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const presale = (type: PresaleRightEntry["type"], id: string): PresaleRightEntry =>
  ({ id, type, acquisitionDate: "2023-01-01", region: "capital" }) as PresaleRightEntry;

function form(rows: PresaleRightEntry[], over: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    transferDate: "2024-06-01",
    assets: base.assets.map((a, i) =>
      i === 0
        ? { ...a, assetKind: "right_to_move_in" as const, redevSubject: "right", redevApprovalDate: "2022-06-01", acquisitionDate: "2012-01-01" }
        : a,
    ),
    isOneHousehold: true,
    householdHousingCount: "0",
    presaleRights: rows,
    ...over,
  } as TransferFormData;
}

function notice(f: TransferFormData): string {
  const { container } = render(<Step4 form={f} onChange={() => {}} />);
  return container.querySelector('[data-testid="one-right-requirement-notice"]')?.textContent ?? "";
}

describe("S15-13 · 입주권 요건 안내 — 분양권", () => {
  it("N-1 분양권 1개 → 「분양권 미보유」를 단정하지 않고 분양권 요건·부칙을 안내", () => {
    const t = notice(form([presale("presale_right", "p1")]));
    expect(t).toMatch(/1세대1입주권 비과세 요건/);
    expect(t).not.toMatch(/분양권 미보유/);
    expect(t).toMatch(/분양권을 보유하지 않을 것/);
    expect(t).toContain(REDEVELOPMENT.ONE_RIGHT_PRESALE_ADDENDUM);
  });

  it("N-2 🔑 긍정 짝 — 빈 목록 + 「없음」 확인이면 「분양권 미보유」", () => {
    expect(notice(form([], { householdNoPresaleRightsConfirmed: true }))).toMatch(/분양권 미보유/);
  });

  it("N-3 빈 목록 + 확인 없음 → 단정하지 않고 입력을 요청", () => {
    const t = notice(form([]));
    expect(t).not.toMatch(/분양권 미보유/);
    expect(t).toMatch(/분양권 보유 여부를 입력하세요/);
  });
});

describe("S15-13 · 없는 토글을 가리키지 않는다", () => {
  it("N-4 「§⑥ 비과세 토글」이 어떤 목록 상태에서도 없다 · 판정 메뉴 불러오기를 안내", () => {
    for (const rows of [[], [presale("presale_right", "p1")]]) {
      const t = notice(form(rows as PresaleRightEntry[]));
      expect(t).not.toMatch(/§⑥|비과세 토글/);
      expect(t).toMatch(/판정 불러오기/);
      cleanup();
    }
  });

  it("N-5 대조 — 세대 주택이 있으면 안내 자체가 없다(노출 조건 그대로)", () => {
    expect(notice(form([], { householdHousingCount: "1" }))).toBe("");
  });
});
