/**
 * D1-4a — 혼합 원인 토지 파트 영 §164④ 가액(②) 브리지 · ④ 전송 3경로 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1-4.engine.design.md §1·§2·§5
 * 게이트(landSec164Applies)·파생(deriveHousingLandSec164Total)·전송(buildLandPartCausePayload)이 한 술어를 공유함을 잠근다.
 */
import { describe, it, expect, vi } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import {
  landSec164Applies,
  deriveHousingLandSec164PerSqm,
  deriveHousingLandSec164Total,
  isPartialAreaScenario,
} from "@/lib/calc/transfer-pre1990-housing-land-bridge";
import { validateLandPartCause } from "@/lib/calc/transfer-tax-validate-split";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { buildLandPartCausePayload } from "@/lib/calc/transfer-tax-api-split";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

/** 매매 호스트 + 토지 상속 1988-05-01, 면적 100㎡, 등급가액 22,500 / 직전 40,000 / 현재 50,000 → 비율 0.5, 1990.1.1. 7,000,000 → ㎡당 3,500,000 */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    landAcquisitionCause: "inheritance",
    landCauseHost: "purchase",
    landAcquisitionDate: "1988-05-01",
    landDecedentAcquisitionDate: "1960-01-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    acquisitionArea: "100",
    transferArea: "100",
    pre1990GradeMode: "value",
    pre1990Grade_current: "50000",
    pre1990Grade_prev: "40000",
    pre1990Grade_atAcq: "22500",
    pre1990PricePerSqm_1990: "7000000",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "350000000",
    ...over,
  } as AssetForm;
}

describe("게이트 landSec164Applies — 엔진·⑫와 같은 술어(유효 원인 ∧ 토지일 < 1990-08-30)", () => {
  it("매매·신축 호스트 × 상속·증여 × 1990-08-29 → true", () => {
    expect(landSec164Applies(asset())).toBe(true);
    expect(landSec164Applies(asset({ acquisitionCause: "newConstruction", landCauseHost: "newConstruction" }))).toBe(true);
    expect(landSec164Applies(asset({ landAcquisitionCause: "gift", landAcquisitionDate: "1990-08-29" }))).toBe(true);
  });
  it("긍정 짝: 1990-08-30·1991, 토글 OFF·호스트 불일치·분리 OFF·매매 원인은 false", () => {
    expect(landSec164Applies(asset({ landAcquisitionDate: "1990-08-30" }))).toBe(false);
    expect(landSec164Applies(asset({ landAcquisitionDate: "1991-05-01" }))).toBe(false);
    expect(landSec164Applies(asset({ landAcquisitionCause: "" }))).toBe(false);
    expect(landSec164Applies(asset({ landCauseHost: "newConstruction" }))).toBe(false); // 호스트 태그 ≠ 지금 원인(stale)
    expect(landSec164Applies(asset({ hasSeperateLandAcquisitionDate: false }))).toBe(false);
    expect(landSec164Applies(asset({ landAcquisitionCause: "purchase" as never }))).toBe(false);
  });
});

describe("파생 — ㎡당 가액 · 총액 (anchor C-1과 같은 손계산)", () => {
  it("비율 0.5 → ㎡당 3,500,000 · 100㎡ = 350,000,000", () => {
    expect(deriveHousingLandSec164PerSqm(asset())).toBe(3_500_000);
    expect(deriveHousingLandSec164Total(asset())).toBe(350_000_000);
  });
  it("5필드·면적 중 하나라도 비면 0(부분 입력은 ②를 만들지 않는다)", () => {
    for (const k of ["pre1990Grade_current", "pre1990Grade_prev", "pre1990Grade_atAcq", "pre1990PricePerSqm_1990", "acquisitionArea"] as const)
      expect(deriveHousingLandSec164Total(asset({ [k]: "" } as Partial<AssetForm>)), k).toBe(0);
  });
  it("단서 밖이면 5필드가 차 있어도 0", () => {
    expect(deriveHousingLandSec164Total(asset({ landAcquisitionDate: "1991-05-01" }))).toBe(0);
  });
  it("CAP-2는 토지 파트 취득일 기준: 1989-12-31(상한 없음, 비율 2.0) vs 1990-01-01(비율 1.0 상한)", () => {
    const hi = { pre1990Grade_atAcq: "90000" } as Partial<AssetForm>;
    expect(deriveHousingLandSec164PerSqm(asset({ ...hi, landAcquisitionDate: "1989-12-31" }))).toBe(14_000_000);
    expect(deriveHousingLandSec164PerSqm(asset({ ...hi, landAcquisitionDate: "1990-01-01" }))).toBe(7_000_000);
  });
  it("지분 50% → ①`ratioed`와 같은 축으로 스케일(floor 한 번)", () => {
    expect(deriveHousingLandSec164Total(asset({ ownershipNumerator: "1", ownershipDenominator: "2" }))).toBe(175_000_000);
  });
  it("등급 번호 모드(number)도 같은 변환을 탄다 — 등급 입력이 양수가 아니면 null", () => {
    expect(deriveHousingLandSec164PerSqm(asset({ pre1990Grade_atAcq: "0" }))).toBeNull();
  });
  it("일부 양도는 ② 면적을 양도면적으로(resolveAcqAreaForStdPrice) — 표시 규약 유지", () => {
    expect(isPartialAreaScenario({ areaScenario: "partial" })).toBe(true);
    // 콤마 저장값(stale)도 ⑤ 카드·⑧ 상태와 같은 면적으로 읽는다 — 「1,200」을 1로 읽으면 카드 ②와 ④ ②가 갈린다.
    expect(deriveHousingLandSec164Total(asset({ acquisitionArea: "1,200", transferArea: "1,200" }))).toBe(
      deriveHousingLandSec164Total(asset({ acquisitionArea: "1200", transferArea: "1200" })),
    );
    expect(deriveHousingLandSec164Total(asset({ areaScenario: "partial", acquisitionArea: "300", transferArea: "100" }))).toBe(350_000_000);
  });
});

describe("④ buildLandPartCausePayload — ② · 일부 양도 사실", () => {
  it("5칸이 차면 landSec164Value(총액)를 싣는다 · 원인 키는 종전 그대로", () => {
    expect(buildLandPartCausePayload(asset())).toEqual({
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "1960-01-01",
      landSec164Value: 350_000_000,
    });
  });
  it("부분 입력·단서 밖·토글 OFF에서는 ②를 싣지 않는다(⑫가 ② 필수로 막는다)", () => {
    expect(buildLandPartCausePayload(asset({ pre1990Grade_prev: "" })).landSec164Value).toBeUndefined();
    expect(buildLandPartCausePayload(asset({ landAcquisitionDate: "1991-05-01" })).landSec164Value).toBeUndefined();
    expect(buildLandPartCausePayload(asset({ landAcquisitionCause: "" }))).toEqual({});
  });
  it("일부 양도 + 단서 구간이면 isPartialAreaTransfer=true, 구간 밖이면 싣지 않는다", () => {
    expect(buildLandPartCausePayload(asset({ areaScenario: "partial" })).isPartialAreaTransfer).toBe(true);
    expect(buildLandPartCausePayload(asset({ areaScenario: "partial", landAcquisitionDate: "1991-05-01" })).isPartialAreaTransfer).toBeUndefined();
  });
});

describe("④ 3경로(단건 ⑬ 공유 빌더 · 다건 · 컴패니언)가 같은 ②를 싣는다 — G-4 교훈", () => {
  const form = (a: AssetForm) =>
    ({ transferDate: "2026-06-30", filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1200000000", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false }) as unknown as TransferFormData;
  it("단건 body(callTransferTaxAPI)에도 있다", async () => {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }));
    await callTransferTaxAPI(form({ ...asset(), actualSalePrice: "1,200,000,000" } as AssetForm));
    vi.unstubAllGlobals();
    expect(cap.body?.landSec164Value).toBe(350_000_000);
    expect(cap.body?.pre1990Land).toBeUndefined();
  });
  it("다건·컴패니언 body에 landSec164Value가 있다", () => {
    const a = asset();
    const multi = buildPropertyPayload(form(a)) as Record<string, unknown>;
    const comp = buildAssetPayload(a, "apportioned", "2026-06-30") as Record<string, unknown>;
    expect(multi.landSec164Value).toBe(350_000_000);
    expect(comp.landSec164Value).toBe(350_000_000);
    expect(multi.pre1990Land).toBeUndefined();
    expect(comp.pre1990Land).toBeUndefined();
  });
});

describe("⑧ validateLandPartCause (D1-4a·b) — 일부 양도는 첫 칸 areaScenario, ② 필수는 첫 미완 칸", () => {
  const v8 = (a: AssetForm) => collectWithFields(() => validateLandPartCause(a, "자산1"));
  it("일부 양도 + 단서 구간 → areaScenario 칸으로 이동 · 문구는 일부 양도 사유", () => {
    const r = v8(asset({ areaScenario: "partial" }));
    expect(r.result).toContain("일부만 양도");
    expect(r.fieldOf(r.result!)).toBe("areaScenario");
  });
  it("긍정 짝: 일부 양도라도 단서 밖(1991)이면 통과", () => {
    expect(v8(asset({ areaScenario: "partial", landAcquisitionDate: "1991-05-01" })).result).toBeNull();
  });
  it("② 필수 위반(D1-4b): 화면 입력 칸 중 첫 미완 칸으로 이동 — 엔진 문구(landSec164Value)를 화면에 내지 않는다", () => {
    const r = v8(asset({ pre1990Grade_current: "" }));
    expect(r.result).toContain("1990.8.30. 현재 토지등급 칸을 입력하세요");
    expect(r.result).not.toContain("landSec164Value");
    expect(r.fieldOf(r.result!)).toBe("pre1990Grade_current");
  });
});
