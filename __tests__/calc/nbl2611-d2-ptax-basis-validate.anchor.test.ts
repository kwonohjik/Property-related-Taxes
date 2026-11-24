/**
 * NBL2611-V1-A (Q-1) ⑧ — 재산세 분류 «근거»는 미선택을 막지 않는다(엔진이 종합합산 + 확인 필요로 접는다 — 리뷰 Q-1 (나) 기각).
 * 철거ㆍ멸실 근거를 골랐다면 면적 범위를 계산할 사실(종전 바닥면적 · 배율표에 있는 용도지역)을 요구한다 — ⑫(`refineNonBusinessLandRaw`)와 같은 술어·같은 문구.
 */
import { describe, it, expect } from "vitest";
import { validateNblOtherLand } from "@/lib/calc/transfer-tax-validate-nbl-other";
import { refineNonBusinessLandRaw, type NblRawRefineInput } from "@/lib/api/transfer-tax-schema-nbl-refines";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { z } from "zod";

const asset = (over: Partial<AssetForm>) =>
  ({ ...makeDefaultAsset(1), nblLandType: "other_land", nblZoneType: "general_residential", nblOtherPropertyTaxType: "separate", ...over }) as AssetForm;

function refineMessages(raw: Partial<NblRawRefineInput>): string[] {
  const msgs: string[] = [];
  const ctx = { addIssue: (i: { message: string }) => msgs.push(i.message) } as unknown as z.RefinementCtx;
  refineNonBusinessLandRaw({ nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential", nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: false, nblGracePeriods: [], ...raw } as NblRawRefineInput, ctx);
  return msgs;
}

// E3f-1b — 철거ㆍ멸실 근거는 철거ㆍ멸실일이 먼저고(이력 철거 행이 날짜를 대지 않을 때), 종전 바닥면적·용도지역은 양도일 직전 과세기준일 ≥ 2024.6.1.(엔진이 읽는 시행본)에서만 요구한다.
// 이 describe는 바닥면적·용도지역 거울을 검증하므로 철거일과 양도일(2024-06-03)을 채워 둔다 — 철거일 규칙·⑧↔⑫ 격자는 `nbl-state-history-e3-5b-demolished-on.anchor.test.ts`.
const ctx8 = { transferDate: "2024-06-03" } as const;
const DEMO = { nblOtherDemolishedOn: "2022-01-01" } as const;

describe("⑧ validateNblOtherLand — 근거", () => {
  it("근거 미선택은 막지 않는다(⑧ 차단 아님)", () => {
    expect(validateNblOtherLand(asset({ nblOtherPropertyTaxBasis: "" }), "자산")).toBeNull();
  });
  it("「모름」·공지상태·비과세 근거도 막지 않는다", () => {
    expect(validateNblOtherLand(asset({ nblOtherPropertyTaxBasis: "unknown" }), "자산")).toBeNull();
    expect(validateNblOtherLand(asset({ nblOtherPropertyTaxBasis: "vacant_state" }), "자산")).toBeNull();
    expect(validateNblOtherLand(asset({ nblOtherPropertyTaxType: "exempt", nblOtherPropertyTaxBasis: "statutory_exempt" }), "자산")).toBeNull();
  });
  it("철거·멸실 + 종전 바닥면적 없음 → 차단", () => {
    expect(validateNblOtherLand(asset({ ...DEMO, nblOtherPropertyTaxBasis: "demolished" }), "자산", ctx8)).toMatch(/철거ㆍ멸실 근거 — 철거 전 건축물의 바닥면적/);
  });
  it("철거·멸실 + 바닥면적 있음 + 배율표에 있는 용도지역 → 통과", () => {
    expect(validateNblOtherLand(asset({ ...DEMO, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "100" }), "자산", ctx8)).toBeNull();
  });
  it("철거·멸실 + 세분 전 용도지역 → 차단", () => {
    expect(validateNblOtherLand(asset({ ...DEMO, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "100", nblZoneType: "residential" }), "자산", ctx8)).toMatch(/용도지역 "residential"/);
  });
  it("건축물 있음 + 철거·멸실(숨은 stale 값): 화면이 묻지 않으므로 막지 않는다", () => {
    expect(
      validateNblOtherLand(asset({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "100", nblOtherPropertyTaxBasis: "demolished" }), "자산"),
    ).toBeNull();
  });
  it("종합합산 선언 + 철거·멸실(숨은 stale 값): 막지 않는다", () => {
    expect(validateNblOtherLand(asset({ nblOtherPropertyTaxType: "comprehensive", nblOtherPropertyTaxBasis: "demolished" }), "자산")).toBeNull();
  });
});

// E3f-1b — 철거ㆍ멸실일은 이 근거의 필수 칸이다(이력 철거 행이 날짜를 대지 않을 때) — ⑫′는 바닥면적·용도지역보다 **먼저** 철거일을 본다. 이 describe는 바닥면적·용도지역 거울을 검증하므로 철거일을 채워 둔다
// (철거일 규칙·⑧↔⑫ 격자는 `nbl-state-history-e3-5b-demolished-on.anchor.test.ts`).
const ON = { nblOtherDemolishedOn: "2022-01-01", transferDate: "2024-06-03" } as const;

describe("⑫ refine — ⑧과 같은 술어·같은 문구", () => {
  it.each([
    ["철거·멸실 + 바닥면적 없음", { ...ON, nblOtherPropertyTaxBasis: "demolished" }, 1],
    ["철거·멸실 + 바닥면적 + 세분 전 용도지역", { ...ON, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "100", nblZoneType: "residential" }, 1],
    ["철거·멸실 + 바닥면적 + 정상", { ...ON, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "100" }, 0],
    ["근거 미선택", {}, 0],
    ["건축물 있음(숨은 stale)", { nblOtherHasBuilding: true, nblOtherPropertyTaxBasis: "demolished" }, 0],
    ["종합합산 선언(숨은 stale)", { nblOtherPropertyTaxType: "comprehensive", nblOtherPropertyTaxBasis: "demolished" }, 0],
  ] as const)("%s → 이슈 %i건", (_l, raw, n) => {
    const msgs = refineMessages(raw as Partial<NblRawRefineInput>).filter((m) => m.includes("철거ㆍ멸실 근거"));
    expect(msgs).toHaveLength(n);
  });

  it("⑧·⑫ 문구가 같다", () => {
    const m8 = validateNblOtherLand(asset({ ...DEMO, nblOtherPropertyTaxBasis: "demolished" }), "자산", ctx8)!;
    const m12 = refineMessages({ ...ON, nblOtherPropertyTaxBasis: "demolished" }).find((m) => m.includes("철거ㆍ멸실 근거"))!;
    expect(m8.endsWith(m12)).toBe(true);
  });
});
