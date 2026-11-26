/**
 * F-2 — 이력 모달이 자산별 적용률과 산식 근거(구 ③ / 신 ③1호)를 보이고, 산정할 수 없으면 사유를 보인다.
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §6.3
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/storage/calculation-repository", () => ({ calculationRepository: { list: vi.fn() } }));

import { calculationRepository } from "@/lib/storage/calculation-repository";
import { FamilyBusinessInheritanceHistoryModal } from "@/components/calc/transfer/FamilyBusinessInheritanceHistoryModal";
import type { CalculationRecord } from "@/lib/storage/types";

afterEach(cleanup);

function record(id: string, fb: Record<string, unknown>): CalculationRecord {
  return {
    id, userId: "local-user", taxType: "inheritance", title: `상속 ${id}`,
    inputData: {
      deathDate: "2024-03-01",
      estateItems: [{ id: `land-${id}`, name: "공장부지", familyBusinessCategory: "business_real_estate", marketValue: 900_000_000 }],
      stockItems: [{ id: `stock-${id}`, name: "법인주식", familyBusinessCategory: "corporate_stock", marketValue: 1_000_000_000 }],
    },
    resultData: { result: { deductionDetail: { familyBusinessDetail: { appliedRate: 1, operatingYears: 30, ...fb } } } },
    taxLawVersion: "2024-03-01", linkedCalculationId: null, clientId: null,
    createdAt: "2024-04-01T00:00:00.000Z", updatedAt: "2024-04-01T00:00:00.000Z",
  } as CalculationRecord;
}

async function open(records: CalculationRecord[], transferDate: string) {
  vi.mocked(calculationRepository.list).mockResolvedValue(records);
  render(<FamilyBusinessInheritanceHistoryModal open onOpenChange={() => {}} currentTransferDate={transferDate} onSelect={() => {}} />);
  return screen.findAllByTestId("fb-history-asset-rate");
}

describe("F-2 이력 모달 — 자산별 적용률", () => {
  it("공제 400억 ÷ 1,200억 · 양도일 2026-01-01 → 33.3333% · 구 ③ · 법인 주식은 부동산 화면에 없다", async () => {
    const rows = await open([record("a", { deduction: 40_000_000_000, finalValue: 120_000_000_000, usedDirectInput: false })], "2026-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("33.3333%");
    expect(rows[0].textContent).toContain("구 소득세법 시행령 §163의2③");
    expect(screen.queryByText("법인주식")).toBeNull();
  });

  it("양도일 2026-03-01 → 신 ③1호 라벨", async () => {
    const rows = await open([record("b", { deduction: 40_000_000_000, finalValue: 120_000_000_000, usedDirectInput: false })], "2026-03-01");
    expect(rows[0].textContent).toContain("소득세법 시행령 §163의2③1호");
  });

  it("직접입력 모드 → 산정 불가 사유", async () => {
    const rows = await open([record("c", { deduction: 30_000_000_000, finalValue: 30_000_000_000, usedDirectInput: true })], "2026-01-01");
    expect(rows[0].textContent).toContain("직접입력 모드로 계산해 가업상속 재산가액이 없습니다");
  });
});
