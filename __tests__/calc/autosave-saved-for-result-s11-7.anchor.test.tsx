/**
 * S11-7 anchor — 자동저장 훅의 `savedId`는 **어느 결과의 id인지** 밝힌다(`savedFor`).
 *
 * 결함: 새 결과를 저장하는 중이거나 저장이 거절돼도 `savedId`는 직전 결과(판정 A)의 id로 남았다.
 * 판정 메뉴 「이 결과로 세액 계산」이 그 id를 출처로 넘겨, B의 계산이 A 판정의 출처로 표시됐다.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const pending: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
let calls = 0;
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: {
    saveOrUpdateByBusinessKey: () => {
      calls++;
      if (calls === 1) return Promise.resolve({ id: "rec-A", created: true });
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  },
}));
vi.mock("@/lib/storage/client-repository", () => ({ clientRepository: { touch: () => {} } }));

import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";

const RA = { judgment: { isExempt: true } };
const RB = { judgment: { isExempt: false } };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("S11-7 anchor — savedId는 어느 결과의 id인가", () => {
  it("긍정 짝: A 저장이 끝나면 savedId=rec-A이고 savedFor는 A의 resultData다", async () => {
    calls = 0;
    const { result } = renderHook(() =>
      useAutoSaveCalculation({ taxType: "one_house_exemption", inputData: { a: 1 }, resultData: RA, taxLawVersion: "2026-03-01" }),
    );
    await flush();
    expect(result.current.savedId).toBe("rec-A");
    expect(result.current.savedFor).toBe(RA);
  });

  it("B 저장 중에는 savedFor가 B가 아니다(savedId는 직전 결과 id로 남아도)", async () => {
    calls = 0;
    pending.length = 0;
    const { result, rerender } = renderHook((p: { r: Record<string, unknown> }) =>
      useAutoSaveCalculation({ taxType: "one_house_exemption", inputData: { a: 1 }, resultData: p.r, taxLawVersion: "2026-03-01" }),
      { initialProps: { r: RA } },
    );
    await flush();
    rerender({ r: RB });
    await flush();
    expect(result.current.savedId).toBe("rec-A");
    expect(result.current.savedFor).not.toBe(RB);
  });

  it("B 저장이 거절돼도 savedFor는 B가 아니다", async () => {
    calls = 0;
    pending.length = 0;
    const { result, rerender } = renderHook((p: { r: Record<string, unknown> }) =>
      useAutoSaveCalculation({ taxType: "one_house_exemption", inputData: { a: 1 }, resultData: p.r, taxLawVersion: "2026-03-01" }),
      { initialProps: { r: RA } },
    );
    await flush();
    rerender({ r: RB });
    await flush();
    await act(async () => { pending[0].reject(new Error("quota")); await Promise.resolve(); });
    expect(result.current.savedFor).not.toBe(RB);
  });

  it("B 저장이 성공하면 savedFor는 B다", async () => {
    calls = 0;
    pending.length = 0;
    const { result, rerender } = renderHook((p: { r: Record<string, unknown> }) =>
      useAutoSaveCalculation({ taxType: "one_house_exemption", inputData: { a: 1 }, resultData: p.r, taxLawVersion: "2026-03-01" }),
      { initialProps: { r: RA } },
    );
    await flush();
    rerender({ r: RB });
    await flush();
    await act(async () => { pending[0].resolve({ id: "rec-B", created: true }); await Promise.resolve(); });
    expect(result.current.savedId).toBe("rec-B");
    expect(result.current.savedFor).toBe(RB);
  });
});
