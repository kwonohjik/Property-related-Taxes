/**
 * ⑬ callTransferTaxAPI body — priorReductionUsage 동기화 회귀 (H-1)
 *
 * 2026-06-11 review-autofix: Step5 위젯·store·Zod(⑨⑫)·route(⑭)는 모두 존재했으나
 * fetch body 빌드(⑬)에서만 누락되어 §133 5년 이력이 서버에 도달하지 않던 결함.
 * TypeScript 미감지 영역 — 실행 경로 테스트로 가드.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => {
  vi.unstubAllGlobals();
});

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({ data: { mode: "single", result: {} } }),
      } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

function makeForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-03-01";
  form.contractTotalPrice = "500,000,000";
  form.assets[0] = {
    ...form.assets[0],
    acquisitionDate: "2020-01-01",
    fixedAcquisitionPrice: "300,000,000",
  };
  return form;
}

describe("⑬ priorReductionUsage body 동기화 (H-1 회귀)", () => {
  it("입력 이력이 fetch body에 그대로 포함된다", async () => {
    const form = makeForm();
    form.priorReductionUsage = [
      { year: 2024, type: "self_farming", amount: 150_000_000 },
      { year: 2025, type: "public_expropriation", amount: 30_000_000 },
    ];
    const { run, get } = captureBody(form);
    await run();
    expect(get()!.priorReductionUsage).toEqual([
      { year: 2024, type: "self_farming", amount: 150_000_000 },
      { year: 2025, type: "public_expropriation", amount: 30_000_000 },
    ]);
  });

  it("이력 미입력 시 빈 배열로 전송된다 (Zod default와 동일 — 모순 없음)", async () => {
    const form = makeForm();
    form.priorReductionUsage = [];
    const { run, get } = captureBody(form);
    await run();
    expect(get()!.priorReductionUsage).toEqual([]);
  });
});
