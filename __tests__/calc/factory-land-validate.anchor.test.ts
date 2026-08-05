/**
 * anchor — 공장용지 ⑧ validate ↔ 엔진 throw 대칭 (Phase C)
 *
 * 계획: docs/02-design/features/factory-site-standard-area-nbl.plan.md §6 Phase C
 *
 * ## 왜 대칭이 중요한가
 *
 * 엔진 `judgeFactoryLandExcess`는 미입력을 `TaxCalculationError`로 던지고, 그 예외는
 * `app/api/calc/transfer/route.ts:432`에서 **HTTP 500**이 된다 — 인라인 필드 오류가 아니다.
 *
 * - **validate가 덜 막으면** → 사용자가 원인 모를 500을 본다.
 * - **validate가 더 막으면** → 엔진은 계산할 수 있는데 UI가 막는다(UI 통과 ↔ validate 차단 모순).
 *
 * ⇒ 아래 SYM-*는 **같은 입력**을 validate와 엔진에 각각 통과시켜 판정이 일치하는지 본다.
 *   한쪽만 고치면 깨진다.
 */
import { describe, it, expect } from "vitest";
import { validateNblFactory } from "@/lib/calc/transfer-tax-validate-nbl-other";
import { buildFactory } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { judgeFactoryLandExcess } from "@/lib/tax-engine/non-business-land/factory-land-standard-area";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";

const parseNumber = (v: string) => {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : undefined;
};

/** 유효한 별표6 경로 입력 (기준 10,000 + 3호가2 인정 2,000 = 12,000㎡ · 전체 20,000㎡) */
function validAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblFactoryEnabled: true,
    nblFactoryLocationCategory: "eup_myeon_or_complex",
    nblFactoryTotalLandArea: "20000",
    nblFactorySegments: [{ id: "s1", floorArea: "1200", ratePercent: "12", industryLabel: "" }],
    nblFactoryIsRestrictedZone: false,
    nblFactoryAdditionalRecognizedArea: "",
    nblFactoryFootprintArea: "",
    nblFactoryIsUnregistered: false,
    ...over,
  } as unknown as AssetForm;
}

/** validate가 통과시킨 입력을 엔진에 실제로 흘려본다. 엔진이 던지면 그 오류를 반환. */
function runEngine(asset: AssetForm): { threw: boolean; message?: string } {
  const f = buildFactory(asset as unknown as Record<string, unknown>, parseNumber, asset.nblZoneType as ZoneType);
  if (!f) return { threw: false };
  try {
    judgeFactoryLandExcess(f, "기타토지(공장)");
    return { threw: false };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
}

describe("⑧ validate — 엔진이 던지는 5조건을 전부 선차단한다", () => {
  const cases: Array<{ id: string; label: string; over: Partial<AssetForm>; expect: RegExp }> = [
    {
      id: "COND-1",
      label: "공장 전체 부속토지 면적 미입력",
      over: { nblFactoryTotalLandArea: "" } as Partial<AssetForm>,
      expect: /공장 전체.*부속토지 면적/,
    },
    {
      id: "COND-2",
      label: "소재 지역 미선택",
      over: { nblFactoryLocationCategory: "" } as Partial<AssetForm>,
      expect: /소재 지역을 선택/,
    },
    {
      id: "COND-3a",
      label: "별표6 경로 — 업종 0건",
      over: { nblFactorySegments: [] } as Partial<AssetForm>,
      expect: /연면적.*기준공장면적률/,
    },
    {
      id: "COND-3b",
      label: "별표6 경로 — 면적률 0",
      over: {
        nblFactorySegments: [{ id: "s1", floorArea: "1200", ratePercent: "0", industryLabel: "" }],
      } as Partial<AssetForm>,
      expect: /기준공장면적률/,
    },
    {
      id: "COND-4",
      label: "§101①1호 경로 — 바닥면적 미입력",
      over: {
        nblFactoryLocationCategory: "urban_other",
        nblFactoryFootprintArea: "",
      } as Partial<AssetForm>,
      expect: /바닥면적/,
    },
    {
      id: "COND-5",
      label: "§101①1호 경로 — 세분 전 용도지역(residential)",
      over: {
        nblFactoryLocationCategory: "urban_other",
        nblFactoryFootprintArea: "1000",
        nblZoneType: "residential",
      } as Partial<AssetForm>,
      expect: /적용배율표/,
    },
  ];

  for (const c of cases) {
    it(`${c.id}: ${c.label} → validate가 막는다`, () => {
      const msg = validateNblFactory(validAsset(c.over), "자산1");
      expect(msg).toMatch(c.expect);
    });

    it(`${c.id}: ${c.label} → validate를 지우면 엔진이 던진다 (대칭 확인)`, () => {
      // validate를 우회해 엔진에 직접 흘려보면 반드시 예외가 나야 한다.
      // 여기서 threw=false가 되면 validate가 **과차단**하고 있다는 뜻이다.
      expect(runEngine(validAsset(c.over)).threw).toBe(true);
    });
  }
});

describe("⑧ validate — 과차단하지 않는다", () => {
  it("PASS-1: 유효 입력(별표6 경로)은 통과하고 엔진도 계산한다", () => {
    const a = validAsset();
    expect(validateNblFactory(a, "자산1")).toBeNull();
    expect(runEngine(a).threw).toBe(false);
  });

  it("PASS-2: 유효 입력(§101①1호 경로)도 통과한다", () => {
    const a = validAsset({
      nblFactoryLocationCategory: "urban_other",
      nblFactoryFootprintArea: "1000",
    } as Partial<AssetForm>);
    expect(validateNblFactory(a, "자산1")).toBeNull();
    expect(runEngine(a).threw).toBe(false);
  });

  it("PASS-3: 토글 OFF면 다른 값이 비어 있어도 통과한다 (공장이 아니다)", () => {
    const a = validAsset({
      nblFactoryEnabled: false,
      nblFactoryLocationCategory: "",
      nblFactoryTotalLandArea: "",
      nblFactorySegments: [],
    } as Partial<AssetForm>);
    expect(validateNblFactory(a, "자산1")).toBeNull();
    expect(runEngine(a).threw).toBe(false);
  });

  it("PASS-4: 단서(허가 미이행)는 면적 입력이 있으면 통과한다 — 엔진이 전량 비사업용으로 판정", () => {
    const a = validAsset({ nblFactoryIsUnregistered: true } as Partial<AssetForm>);
    expect(validateNblFactory(a, "자산1")).toBeNull();
    expect(runEngine(a).threw).toBe(false);
  });

  it("PASS-5: 별표6 경로에서는 바닥면적이 비어 있어도 막지 않는다 (그 경로가 안 쓴다)", () => {
    const a = validAsset({ nblFactoryFootprintArea: "" } as Partial<AssetForm>);
    expect(validateNblFactory(a, "자산1")).toBeNull();
  });

  it("PASS-6: §101①1호 경로에서는 업종이 비어 있어도 막지 않는다 (그 경로가 안 쓴다)", () => {
    const a = validAsset({
      nblFactoryLocationCategory: "urban_other",
      nblFactoryFootprintArea: "1000",
      nblFactorySegments: [],
    } as Partial<AssetForm>);
    expect(validateNblFactory(a, "자산1")).toBeNull();
    expect(runEngine(a).threw).toBe(false);
  });
});
