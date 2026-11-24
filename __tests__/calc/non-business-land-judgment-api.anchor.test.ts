/**
 * ④⑬ 비사업용 토지 판정 메뉴 클라이언트 변환 anchor — `buildNblJudgmentApiBody` · `callNblJudgmentAPI`.
 *
 * 계획서: docs/01-plan/features/nbl-judgment-menu.engine.plan.md §5.1 · 「사용자 결정 2차」 Q-1 (c) · UI 계획서 §13.3.
 * mutation 대응: M-7(④ 래퍼가 raw의 `transferDate` 누락) — route parity anchor(A-1 전 행 400)와 이 파일의 raw 동치 단언이 함께 잡는다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildNblJudgmentApiBody, callNblJudgmentAPI } from "@/lib/calc/non-business-land-judgment-api";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { CARRYOVER_BASE, landForm } from "./_helpers/nbl-judgment-menu";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => vi.unstubAllGlobals());

const asset = (over: Partial<AssetForm> = {}) => landForm(over).assets[0];

describe("④ buildNblJudgmentApiBody — 계산기 ④와 같은 leaf", () => {
  it("본문 = { nonBusinessLandRaw } 한 키 — raw는 `buildNonBusinessLandRaw` 결과 그대로(양도일 포함)", () => {
    const a = asset();
    const body = buildNblJudgmentApiBody(a, "2024-06-01");
    expect(Object.keys(body ?? {})).toEqual(["nonBusinessLandRaw"]);
    expect(body?.nonBusinessLandRaw).toEqual(buildNonBusinessLandRaw(a, "2024-06-01"));
    expect(body?.nonBusinessLandRaw.transferDate).toBe("2024-06-01");
  });

  it("⑧이 막았어야 하는 상태(정밀판정 OFF · 면적·취득일·지목 없음)면 undefined", () => {
    expect(buildNblJudgmentApiBody(asset({ nblUseDetailedJudgment: false }), "2024-06-01")).toBeUndefined();
    expect(buildNblJudgmentApiBody(asset({ acquisitionArea: "" }), "2024-06-01")).toBeUndefined();
    expect(buildNblJudgmentApiBody(asset({ acquisitionDate: "" }), "2024-06-01")).toBeUndefined();
    expect(buildNblJudgmentApiBody(asset({ nblLandType: "" }), "2024-06-01")).toBeUndefined();
  });

  it("이월과세: 증여 등기접수일을 최상위에 싣는다 · raw 취득일은 증여자 취득일(소유기간 기산)", () => {
    const a = asset(CARRYOVER_BASE);
    const body = buildNblJudgmentApiBody(a, "2023-12-01");
    expect(body?.carryoverGiftRegistryDate).toBe("2022-06-01");
    expect(body?.nonBusinessLandRaw.acquisitionDate).toBe("2012-01-01");
    expect(body?.nonBusinessLandRaw.acquisitionCause).toBe("carryover_gift");
  });

  it("이월과세가 아니면 남은 증여 등기접수일 잔재는 싣지 않는다 (취득원인이 게이트)", () => {
    const a = asset({ carryover: { ...(CARRYOVER_BASE.carryover as object) } as never });
    expect(buildNblJudgmentApiBody(a, "2024-06-01")?.carryoverGiftRegistryDate).toBeUndefined();
  });

  it("이월과세인데 증여자 취득일이 없으면 raw 취득일이 비어 본문이 만들어지지 않는다(⑧이 막는다)", () => {
    const a = asset({ ...CARRYOVER_BASE, carryover: { ...(CARRYOVER_BASE.carryover as object), donorAcquisitionDate: "" } as never });
    expect(buildNblJudgmentApiBody(a, "2023-12-01")).toBeUndefined();
  });
});

describe("⑬ callNblJudgmentAPI — 응답 envelope", () => {
  const stubFetch = (res: { ok: boolean; status?: number; json: unknown }) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: res.ok, status: res.status ?? (res.ok ? 200 : 400), json: async () => res.json } as unknown as Response;
    }));
    return calls;
  };

  it("성공 `{ data }` → data를 돌려준다 · POST 경로·본문", async () => {
    const calls = stubFetch({ ok: true, json: { data: { judgment: { isNonBusinessLand: true }, inputEffects: {} } } });
    const data = await callNblJudgmentAPI(asset(), "2024-06-01");
    expect(data.judgment.isNonBusinessLand).toBe(true);
    expect(calls[0].url).toBe("/api/calc/non-business-land-judgment");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body)).nonBusinessLandRaw.transferDate).toBe("2024-06-01");
  });

  it("실패 `{ error: { message, fieldErrors } }` → [object Object] 없이 문장으로 던진다", async () => {
    stubFetch({ ok: false, json: { error: { code: "INVALID_INPUT", message: "입력값이 올바르지 않습니다", fieldErrors: { "nonBusinessLandRaw.acquisitionDate": ["취득일은 양도일보다 이전이어야 합니다"] } } } });
    await expect(callNblJudgmentAPI(asset(), "2024-06-01")).rejects.toThrow(/입력값이 올바르지 않습니다[\s\S]*취득일은 양도일보다 이전이어야 합니다/);
    await expect(callNblJudgmentAPI(asset(), "2024-06-01")).rejects.not.toThrow(/\[object Object\]/);
  });

  it("실패 본문이 JSON이 아니면 HTTP 상태로 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error("not json"); } }) as unknown as Response));
    await expect(callNblJudgmentAPI(asset(), "2024-06-01")).rejects.toThrow("HTTP 502");
  });

  it("본문이 만들어지지 않으면 요청하지 않고 던진다", async () => {
    const calls = stubFetch({ ok: true, json: { data: {} } });
    await expect(callNblJudgmentAPI(asset({ nblLandType: "" }), "2024-06-01")).rejects.toThrow(/부족/);
    expect(calls).toHaveLength(0);
  });
});
