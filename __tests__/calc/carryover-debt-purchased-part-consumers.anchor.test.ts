/**
 * anchor — 이월과세 채무 부분(매입분) 결과가 `mode:"bundled"` 자산 1건으로 바뀌면서 영향받는 소비자(설계서 §2.7).
 *  · 정정(수정신고·경정청구) 분류 — 자산 1건 bundled는 종전에 정정 불가였다(`assets.length>1` 부수 효과). 다건 불러오기 allow-list에는 새지 않는다.
 *  · 가산세 인라인 계산 — 자산은 1건인데 「다자산」 안내가 나가던 것을 사유 문구로.
 *  · 카드 id 접미사 `__purchased` → 폼 자산 복원.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/calc/transfer-tax-api", () => ({ callTransferTaxAPI: vi.fn() }));

import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import { classifyLoadableTransfer } from "@/lib/calc/transfer-multi-load-entry";
import { runPenaltyCalc } from "@/app/calc/transfer-tax/transfer-calc-actions";
import { assetOfProperty } from "@/components/calc/results/transfer/sale-split-unentered-notice";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CalculationRecord } from "@/lib/storage/types";

const split = { purchasedPartSplit: { debtAmount: 1 } };
const record = (properties: unknown[], assets: unknown[] = [{}]) =>
  ({ taxType: "transfer", resultData: { mode: "bundled", aggregated: { properties } }, inputData: { assets } }) as unknown as CalculationRecord;

describe("정정 분류", () => {
  it("채무 부분 조각 echo가 있는 bundled 자산 1건 → bundled(정정 가능) · 다건 불러오기 대상은 아니다", () => {
    const r = record([{ carryoverTaxationDetail: { scenarioA: split } }]);
    expect(classifyAmendableTransfer(r)).toBe("bundled");
    expect(classifyLoadableTransfer(r)).toBeNull();
  });
  it("echo가 없는 bundled 자산 1건은 종전대로 정정 불가(null)", () => {
    expect(classifyAmendableTransfer(record([{ carryoverTaxationDetail: { scenarioA: {} } }]))).toBeNull();
  });
});

describe("가산세 인라인 계산", () => {
  it("채무 부분 조각 결과면 「다자산」이 아니라 이 사유를 말한다 · 일반 bundled는 종전 문구", async () => {
    const cb = { setDeterminedTax: vi.fn(), setUnpaidTax: vi.fn(), setPenaltyResult: vi.fn(), setError: vi.fn() };
    vi.mocked(callTransferTaxAPI).mockResolvedValueOnce({ mode: "bundled", aggregated: { properties: [{ carryoverTaxationDetail: { scenarioA: split } }] } } as never);
    await runPenaltyCalc(createDefaultTransferFormData(), cb);
    expect(cb.setError.mock.calls[0][0]).toContain("채무 부분(매입분)");
    vi.mocked(callTransferTaxAPI).mockResolvedValueOnce({ mode: "bundled", aggregated: { properties: [{}] } } as never);
    await runPenaltyCalc(createDefaultTransferFormData(), cb);
    expect(cb.setError.mock.calls[1][0]).toContain("다자산 일괄양도");
  });
});

describe("카드 id 접미사", () => {
  it("`primary__purchased` · `{assetId}__purchased`는 원 폼 자산으로 되돌린다", () => {
    const f = createDefaultTransferFormData();
    expect(assetOfProperty("primary__purchased", f, undefined)).toBe(f.assets[0]);
    expect(assetOfProperty("primary", f, undefined)).toBe(f.assets[0]);
  });
});
