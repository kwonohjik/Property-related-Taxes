/**
 * D1 Pre-Do anchor (UI·클라이언트 ④⑥⑧) — 「토지 상속·증여 + 건물 매매」 설계 전 현행 동작 고정 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1.ui.design.md §1·§3·§5·§11
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §4 D1
 *
 * ## 이 파일이 하는 일
 * 1. **D1 후에도 유지되어야 하는 불변식**을 활성 테스트로 고정한다 — 신축 호스트 회귀 0, 「신축 → 매매」 잔재가 매매에서
 *    무효라는 사실, 매매에서 총 취득가(`fixedAcquisitionPrice`) 후퇴가 없다는 사실, ④ 3경로가 같은 leaf를 쓴다는 사실.
 * 2. **현행 결함(G-11·G-12)을 활성 테스트로 pin**한다 — 이름에 `[D1에서 뒤집힘]`이 붙은 테스트는 D1 Do가 일부러 깨뜨린다.
 *    깨뜨릴 때 같은 자리에서 기대값을 설계 문서 §5 판정으로 바꾼다(조용히 지나가지 않게 하는 안전망).
 * 3. D1 후 기대값은 `it.todo`로 남긴다(§11.1 목록과 1:1).
 *
 * ⚠️ 수치는 `makeMockRates()` 실측값이지 정본 세액이 아니다. 같은 시드의 **상대 비교**가 본질이다.
 * ⚠️ 상태 시드(`setCause`·`toggleOn`)는 `CompanionAcquisitionCauseSection`(:92-110)·`LandPartCauseBlock`(토글 ON 패치)의
 *    onChange 패치를 **손으로 재현**한 것이다 — 그 패치가 바뀌면 이 시드도 같이 고친다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { buildLandPartCausePayload, buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { effectiveLandAcquisitionCause, landPartCauseApplicable } from "@/lib/calc/transfer-land-part-cause";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { phdPayloadActive } from "@/lib/calc/phd-toggle-scope";
import { usesPhdGate } from "@/lib/calc/transfer-lump-sum-base-gate";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2026-06-30";

const ratioed = (v?: string) => {
  const n = parseInt((v ?? "").replace(/,/g, ""), 10);
  return isFinite(n) && n > 0 ? n : undefined;
};

/** 신축(2020-06-01) + 토지 상속(2015-03-10, 피상속인 1990-04-01) — 신축 호스트에서 토글을 켠 D0 상태. */
function base(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "newConstruction",
    acquisitionDate: "2020-06-01",
    occupancyApprovalDate: "2020-06-01",
    landAcquisitionCause: "inheritance",
    landCauseHost: "newConstruction", // 토글 ON이 함께 쓰는 호스트(D1-2)
    landAcquisitionDate: "2015-03-10",
    landDecedentAcquisitionDate: "1990-04-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    fixedAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as AssetForm;
}

/** `CompanionAcquisitionCauseSection` 원인 라디오 패치(:92-110) 중 이 축에 닿는 부분. */
const setCause = (a: AssetForm, value: string): AssetForm => ({
  ...a,
  acquisitionCause: value as AssetForm["acquisitionCause"],
  ...(value !== "purchase" ? { hasSeperateLandAcquisitionDate: false } : {}),
  // D1-2 — 토글을 켠 호스트를 떠나면 태그를 비운다(원인 값은 보존)
  ...(a.landCauseHost && a.landCauseHost !== value ? { landCauseHost: "" as const } : {}),
});

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE,
    filingDate: "2026-08-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1200000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

/** 단건 ④로 body를 만들고 실제 route(⑫⑭ + 엔진)에 태운다. */
async function run(a: AssetForm) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as {
    data?: { result?: { totalTax?: number; splitDetail?: unknown } };
    error?: { fieldErrors?: Record<string, string[]> };
  };
  return { status: res.status, body: cap.body!, tax: json.data?.result?.totalTax, split: json.data?.result?.splitDetail, err: json.error };
}

const v8 = (a: AssetForm) => collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));
const v8Split = (a: AssetForm) => collectWithFields(() => validateSplitDirectInputs(a, "자산1"));

// ─────────────────────────────────────────────────────────────────────────────
// A. D1 후에도 유지되어야 하는 불변식
// ─────────────────────────────────────────────────────────────────────────────
describe("A. 불변식 — D1 후에도 유지 (설계 §3·§6)", () => {
  it("A1 신축 호스트 회귀 0: 토글 ON 상태의 ④ 원인 payload · ⑥ 합계 · ⑧ 통과", () => {
    const a = base();
    expect(landPartCauseApplicable(a)).toBe(true);
    expect(effectiveLandAcquisitionCause(a)).toBe("inheritance");
    expect(buildLandPartCausePayload(a)).toEqual({
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "1990-04-01",
    });
    // 토지 평가액 3억 + 신축비용 4억(건물 후퇴) — 확정
    expect(separateAcqPartsSum(a)).toEqual({ sum: 700_000_000, pending: false });
    expect(v8(a).result).toBeNull();
  });

  it("A2 「신축 ON → 매매」 잔재는 매매에서 무효: 유효 원인 없음 · ④ 미전송 · ⑥ 미확정 · ⑧ 건물 취득가액 요구 (S1)", () => {
    // 토글 ON 후 원인 라디오만 매매로 — `value === "purchase"`라 hasSeperate…가 true로 남는다(CompanionAcquisitionCauseSection:99).
    const s1 = setCause(base(), "purchase");
    expect(s1.hasSeperateLandAcquisitionDate).toBe(true);
    expect(s1.landAcquisitionCause).toBe("inheritance"); // 저장값은 남는다(원값 보존)
    expect(effectiveLandAcquisitionCause(s1)).toBe("");
    expect(buildLandPartCausePayload(s1)).toEqual({});
    const sp = buildSplitPayload(s1, { isBurdenedGift: false, usesPhd: false, ratioed }) as Record<string, unknown>;
    expect(sp.buildingAcquisitionPrice).toBeUndefined(); // 신축비용 4억이 건물 취득가액으로 새지 않는다
    expect(separateAcqPartsSum(s1)).toEqual({ sum: 300_000_000, pending: true });
    const { result, fieldOf } = v8(s1);
    expect(result).toContain("건물 취득가액을 입력하세요");
    expect(fieldOf(result!)).toBe("buildingAcquisitionPrice");
  });

  it("A3 「신축 ON → 상속 → 매매」 후 매매에서 「취득일 다름」을 수동으로 켜도 S1과 같다 (S2')", () => {
    const s2 = { ...setCause(setCause(base(), "inheritance"), "purchase"), hasSeperateLandAcquisitionDate: true } as AssetForm;
    expect(effectiveLandAcquisitionCause(s2)).toBe("");
    expect(buildLandPartCausePayload(s2)).toEqual({});
    expect(v8(s2).result).toContain("건물 취득가액을 입력하세요");
  });

  it("A4 일반 매매 + 「취득일 다름」(원인 미선택): 총 취득가(fixedAcquisitionPrice)가 건물 취득가액으로 후퇴하지 않는다 (S5)", () => {
    const a = base({
      acquisitionCause: "purchase",
      landAcquisitionCause: "",
      landDecedentAcquisitionDate: "",
      fixedAcquisitionPrice: "500,000,000",
      buildingAcquisitionPrice: "",
    });
    expect(buildLandPartCausePayload(a)).toEqual({});
    const sp = buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed }) as Record<string, unknown>;
    expect(sp.buildingAcquisitionPrice).toBeUndefined();
    expect(separateAcqPartsSum(a).pending).toBe(true);
    expect(v8(a).result).toContain("건물 취득가액을 입력하세요");
  });

  it("A5 ④ 3경로(단건·다건·컴패니언)가 같은 원인 키를 싣는다 — 신축 ON 상태", async () => {
    const a = base();
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await callTransferTaxAPI(form(a));
    vi.unstubAllGlobals();
    const pick = (o: Record<string, unknown>) => ({
      cause: o.landAcquisitionCause,
      decedent: o.landDecedentAcquisitionDate,
      landDate: o.landAcquisitionDate,
      landPrice: o.landAcquisitionPrice,
      buildingPrice: o.buildingAcquisitionPrice,
    });
    const single = pick(cap.body!);
    expect(single).toEqual({
      cause: "inheritance",
      decedent: "1990-04-01",
      landDate: "2015-03-10",
      landPrice: 300_000_000,
      buildingPrice: 400_000_000,
    });
    expect(pick(buildPropertyPayload(form(a)) as Record<string, unknown>)).toEqual(single);
    expect(pick(buildAssetPayload(a, "apportioned", TRANSFER_DATE) as Record<string, unknown>)).toEqual(single);
  });

  it("A6 ⑧ 연결 후 규칙(validateSplitDirectInputs)은 신축 토지 원인 자산의 입력 오류 셀을 칸으로 안내한다", () => {
    const f = (over: Partial<AssetForm>) => v8Split(base(over));
    // 양도시 기준시가 없음(일괄양도) → 축 A 기준시가 카드
    {
      const { result, fieldOf } = f({ saleSplitMode: "apportioned", landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" });
      expect(result).toContain("양도시 기준시가");
      expect(fieldOf(result!)).toBe("standardPricePerSqmAtTransfer");
    }
    // 구분양도 합계 초과 → landTransferPrice
    {
      const { result, fieldOf } = f({ landTransferPrice: "900,000,000" });
      expect(result).toContain("양도가액의 합이 양도가액");
      expect(fieldOf(result!)).toBe("landTransferPrice");
    }
    // 토지 평가액 비움 → landAcquisitionPrice
    {
      const { result, fieldOf } = f({ landAcquisitionPrice: "" });
      expect(result).toContain("토지 취득가액을 입력하세요");
      expect(fieldOf(result!)).toBe("landAcquisitionPrice");
    }
    // 자산 단위 자본적지출 → landDirectExpenses (신축 블록에는 이 칸이 없다 — 설계 §5 셀 8)
    {
      const { result, fieldOf } = f({ capitalExpenditure: "10,000,000" });
      expect(result).toContain("자본적지출도 토지분·건물분 칸에 각각 입력");
      expect(fieldOf(result!)).toBe("landDirectExpenses");
    }
    // 파트 자본적지출을 넣었으면 통과
    expect(f({ capitalExpenditure: "10,000,000", landDirectExpenses: "5,000,000" }).result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 현행 결함 pin — D1 Do가 일부러 뒤집는다 (설계 §5 G-11 격자 · G-12)
// ─────────────────────────────────────────────────────────────────────────────
describe("B. D1-1 전환 — 신축 분기 ⑧이 분리 검증·원인 규칙에 닿는다 (종전 pin: ⑧ 통과)", () => {
  /** ⑧이 막고 그 칸으로 이동한다 — 메시지·칸을 함께 본다. */
  const blockedAt = (a: AssetForm) => {
    const r = v8(a);
    return r.result ? r.fieldOf(r.result) : null;
  };

  it("B1 G-11 일괄양도 + 양도시 기준시가 없음 → ⑧ 차단(기준시가 칸) · ⑫도 400 — 종전 ⑧ 통과·⑫ 400 막다른 길", async () => {
    const a = base({ saleSplitMode: "apportioned", landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" });
    expect(blockedAt(a)).toBe("standardPricePerSqmAtTransfer");
    expect((await run(a)).status).toBe(400);
  });

  it("B2 G-11 구분양도 합계 초과 → ⑧ 차단(토지 양도가액 칸) — 종전 ⑧ 통과·⑫ 200·216,183,000(정상 146,366,000)", async () => {
    expect(blockedAt(base({ landTransferPrice: "900,000,000" }))).toBe("landTransferPrice");
    expect((await run(base())).tax).toBe(146_366_000);
  });

  it("B3 G-11 자산 단위 자본적지출 → ⑧ 차단(토지 자본적지출 칸 — 신축 블록에 신설) · 파트 칸은 세액에 반영", async () => {
    expect(blockedAt(base({ capitalExpenditure: "10,000,000" }))).toBe("landDirectExpenses");
    expect(v8(base({ landDirectExpenses: "5,000,000" })).result).toBeNull();
    expect((await run(base({ landDirectExpenses: "5,000,000" }))).tax).toBe(144_650_000);
  });

  it("B4 G-11 신축 + 소유자 분리(원인 없음) + 취득시 기준시가 없음 → ⑧ 차단(취득시 기준시가 칸) · ⑫ 400", async () => {
    const a = base({
      landAcquisitionCause: "",
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "",
      landAcqMode: "",
      buildingAcqMode: "",
      landAcquisitionPrice: "",
      selfOwns: "building_only",
      saleSplitMode: "apportioned",
    });
    expect(blockedAt(a)).toBe("standardPricePerSqmAtAcq");
    expect((await run(a)).status).toBe(400);
  });

  it("B5 G-12 토지 상속개시일 비움 → ⑧ 차단(토지 취득일 칸) · ⑫ 400 — 종전 ⑧ 통과·⑫ 200·토지 파트 침묵 탈락(284,559,000)", async () => {
    const a = base({ landAcquisitionDate: "" });
    expect(blockedAt(a)).toBe("landAcquisitionDate");
    expect((await run(a)).status).toBe(400);
  });

  it("B6 Q-7 1984 토지 상속 → ⑧·⑫ 차단 / Q-4 같은 날 → ⑧만 차단(⑫는 계산 — 엔진 값이 원인 없음과 같다, 계획서 §10.2 T-4)", async () => {
    // D1-4b — 1990 전은 「무조건 차단」이 아니라 ② 입력 완결 요구다: 5칸·면적이 비면 첫 미완 칸(면적)으로 이동, ⑫는 ② 없음 400.
    const pre1990 = base({ landAcquisitionDate: "1984-05-01" });
    expect(blockedAt(pre1990)).toBe("acquisitionArea");
    expect((await run(pre1990)).status).toBe(400);
    const sameDay = base({ landAcquisitionDate: "2020-06-01" });
    expect(blockedAt(sameDay)).toBe("landAcquisitionDate");
    expect(v8(sameDay).result).toContain("취득일이 같으면");
    expect((await run(sameDay)).status).toBe(200);
    // 긍정 짝: 1990-08-30 당일
    expect(v8(base({ landAcquisitionDate: "1990-08-30", landDecedentAcquisitionDate: "1970-01-01" })).result).toBeNull();
  });

  it("B7 Q-5(U-3) 신축 + 소유자 분리 + 토지 원인 → ⑧ 차단(토글 칸) · ⑫ 400 — 종전 ⑧ 통과·⑫ 200(원인 침묵 무시)", async () => {
    const a = base({ selfOwns: "building_only" });
    expect(blockedAt(a)).toBe("landAcquisitionCause");
    expect((await run(a)).status).toBe(400);
  });

  it("B8 R-X1 부담부증여 + 토지 원인 → ⑧ 분리 검증이 차단(토글 칸) — 단건 ④가 원인·토지 취득일을 그대로 싣으므로 ⑫ R-X1과 짝", () => {
    // 진입점(validateAssetAcquisition)에서는 부담부증여 자체 필수 규칙(bgValuationMode)이 먼저 막는다 — 그 칸을
    // 채운 뒤 닿는 분리 검증 단계를 직접 본다.
    const r = v8Split(base({ transferType: "burdened_gift" } as Partial<AssetForm>));
    expect(r.result).toContain("부담부증여로 양도하는 자산에는 토지 취득원인을 따로 지정할 수 없습니다");
    expect(r.fieldOf(r.result!)).toBe("landAcquisitionCause");
  });
});

describe("B′. D1-1 Check 후속 — 신축 호스트의 화면에 없는 플래그·칸 (sync 검사 F1·F2·F3)", () => {
  it("F1 PHD 플래그 잔재(매매에서 자동 ON → 신축 전환): ⑧ 통과 · ④ PHD 미전송 · 토지 원인 그대로 계산 — 끌 토글이 없는 호스트라 무시한다(T-3)", async () => {
    const phdFields = {
      usePreHousingDisclosure: true,
      phdFirstDisclosureDate: "2005-04-30",
      phdFirstDisclosureHousingPrice: "300,000,000",
    } as Partial<AssetForm>;
    for (const over of [{ usePreHousingDisclosure: true } as Partial<AssetForm>, phdFields]) {
      const a = base(over);
      expect(v8(a).result).toBeNull();
      const r = await run(a);
      expect(r.body.preHousingDisclosure).toBeUndefined();
      expect(r.body.landAcquisitionCause).toBe("inheritance");
      expect(r.status).toBe(200);
      expect(r.tax).toBe(146_366_000);
    }
  });

  it("F2 신축 + 소유자 분리(원인 없음) + 자산 단위 자본적지출 → ⑧이 가리키는 파트 칸이 소유자 분리 블록에 있다", () => {
    const a = base({
      landAcquisitionCause: "",
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "",
      landAcqMode: "",
      buildingAcqMode: "",
      landAcquisitionPrice: "",
      selfOwns: "building_only",
      saleSplitMode: "apportioned",
      standardPricePerSqmAtAcq: "1,000,000",
      acquisitionArea: "100",
      standardPriceAtAcq: "800,000,000",
      buildingStandardPriceAtAcq: "300,000,000",
      capitalExpenditure: "10,000,000",
    } as Partial<AssetForm>);
    const r = v8(a);
    // 건물만 소유 → 건물 자본적지출 칸(소유하지 않는 토지 칸은 렌더하지 않는다)
    expect(r.result ? r.fieldOf(r.result) : null).toBe("buildingDirectExpenses");
    expect(v8({ ...a, selfOwns: "land_only" }).fieldOf(v8({ ...a, selfOwns: "land_only" }).result!)).toBe("landDirectExpenses");
    // 칸에 넣으면 통과(긍정 짝)
    expect(v8({ ...a, buildingDirectExpenses: "10,000,000" }).result).toBeNull();
  });

  it("F3 부담부증여 + 소유자 분리: ⑧은 화면에 없는 양도시 기준시가 파트를 요구하지 않는다(④도 보내지 않는다)", () => {
    const a = base({
      landAcquisitionCause: "",
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "",
      landAcqMode: "",
      buildingAcqMode: "",
      landAcquisitionPrice: "",
      selfOwns: "building_only",
      saleSplitMode: "apportioned",
      landStandardPriceAtTransfer: "",
      buildingStandardPriceAtTransfer: "",
      standardPricePerSqmAtAcq: "1,000,000",
      acquisitionArea: "100",
      standardPriceAtAcq: "800,000,000",
      buildingStandardPriceAtAcq: "300,000,000",
      transferType: "burdened_gift",
    } as Partial<AssetForm>);
    const r = v8Split(a);
    expect(r.result ? r.fieldOf(r.result) : null).not.toBe("standardPricePerSqmAtTransfer");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. D1 후 기대값 (설계 §11.1과 1:1) — 구현 시 todo → 실제 테스트로 전환
// ─────────────────────────────────────────────────────────────────────────────
describe("C. D1-2 매매 호스트 개방 (설계 §2·§3·§4·§6.3 · 계획서 §10)", () => {
  /** 매매 호스트 토글 ON 상태: 건물 2018-03-02 매매 3.5억 + 토지 2015-03-10 상속(피상속인 1990-04-01) 평가 3억.
   *  `fixedAcquisitionPrice` 4억은 별개 취득 중 숨겨진 총 취득가 잔재(S7 재료)로 남겨 둔다. */
  const purchase = (over: Partial<AssetForm> = {}) =>
    base({
      acquisitionCause: "purchase",
      occupancyApprovalDate: "",
      acquisitionDate: "2018-03-02",
      landCauseHost: "purchase",
      buildingAcquisitionPrice: "350,000,000",
      ...over,
    });

  it("C1 호스트 태그: 매매에서 켠 상태는 유효, 다른 호스트·태그 없음은 무효", () => {
    expect(landPartCauseApplicable(purchase())).toBe(true);
    expect(effectiveLandAcquisitionCause(purchase())).toBe("inheritance");
    expect(effectiveLandAcquisitionCause(purchase({ landCauseHost: "newConstruction" }))).toBe("");
    expect(effectiveLandAcquisitionCause(purchase({ landCauseHost: "" }))).toBe("");
    expect(v8(purchase()).result).toBeNull();
  });

  it("C2 normalize: 태그 부재 구 세션 — 신축+원인 → newConstruction · 매매+원인 → \"\"(잔재 무효) · 있으면 유지", () => {
    const raw = (o: Partial<AssetForm>) => {
      const r = { ...base(o) } as Record<string, unknown>;
      delete r.landCauseHost;
      return r;
    };
    expect(migrateAsset(raw({})).landCauseHost).toBe("newConstruction");
    expect(migrateAsset(raw({ acquisitionCause: "purchase" })).landCauseHost).toBe("");
    expect(migrateAsset(raw({ landAcquisitionCause: "" })).landCauseHost).toBe("");
    expect(migrateAsset({ ...purchase() }).landCauseHost).toBe("purchase");
  });

  it("C3·C4 S7 — 매매에서 건물 가액을 비우면 숨은 총 취득가로 후퇴하지 않는다: ④ 미전송 · ⑥ 미확정 · ⑧ 건물 취득가액 요구", () => {
    const a = purchase({ buildingAcquisitionPrice: "" });
    const sp = buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed }) as Record<string, unknown>;
    expect(sp.buildingAcquisitionPrice).toBeUndefined();
    expect(separateAcqPartsSum(a)).toEqual({ sum: 300_000_000, pending: true });
    const r = v8(a);
    expect(r.fieldOf(r.result!)).toBe("buildingAcquisitionPrice");
    // 신축 호스트 후퇴는 유지(A1)
    expect(separateAcqPartsSum(base()).sum).toBe(700_000_000);
  });

  it("C5 Q-4·G-12 ⑧(매매): 같은 날·토지일 비움 → 토지 취득일 칸 — 「취득가액 합 초과」 같은 엉뚱한 메시지보다 먼저", () => {
    const same = v8(purchase({ landAcquisitionDate: "2018-03-02" }));
    expect(same.result).toContain("취득일이 같으면");
    expect(same.fieldOf(same.result!)).toBe("landAcquisitionDate");
    // 총 취득가 칸이 비어 있어도(같은 날이면 별개 취득이 아니라 그 칸을 요구하는 규칙이 앞에 있다) 원인 규칙이 먼저다
    const sameNoTotal = v8(purchase({ landAcquisitionDate: "2018-03-02", fixedAcquisitionPrice: "" }));
    expect(sameNoTotal.fieldOf(sameNoTotal.result!)).toBe("landAcquisitionDate");
    const empty = v8(purchase({ landAcquisitionDate: "" }));
    expect(empty.result).toContain("토지 상속개시일(증여일)이 필요합니다");
    expect(empty.fieldOf(empty.result!)).toBe("landAcquisitionDate");
  });

  it("C6 Q-5 ⑧(매매): 소유자 분리 + 토지 원인 → 토글 칸", () => {
    const r = v8(purchase({ selfOwns: "building_only" }));
    expect(r.fieldOf(r.result!)).toBe("landAcquisitionCause");
  });

  it("C7 Q-7 ⑧(매매): 1984 상속 토지 + ② 미입력 → 첫 미완 칸(면적) · ⑫ 400", async () => {
    const a = purchase({ landAcquisitionDate: "1984-05-01", landDecedentAcquisitionDate: "1960-01-01" });
    const r = v8(a);
    expect(r.result).toContain("1990.8.30.");
    expect(r.fieldOf(r.result!)).toBe("acquisitionArea"); // D1-4b — ② 입력 칸 중 첫 미완 칸
    expect((await run(a)).status).toBe(400);
  });

  it("C8 R-X1(매매): 부담부증여 + 토지 원인 → 분리 검증이 토글 칸으로 차단(용도변경·공익수용은 막지 않음 — U-4)", () => {
    const r = v8Split(purchase({ transferType: "burdened_gift" } as Partial<AssetForm>));
    expect(r.result).toContain("부담부증여로 양도하는 자산에는 토지 취득원인을 따로 지정할 수 없습니다");
    expect(r.fieldOf(r.result!)).toBe("landAcquisitionCause");
  });

  it("C9 ④ 3경로(단건·다건·컴패니언) 매매 D1 payload 동일 + route 200·분리 계산·원인 반영", async () => {
    const a = purchase();
    const r = await run(a);
    const pick = (o: Record<string, unknown>) => ({
      cause: o.landAcquisitionCause,
      decedent: o.landDecedentAcquisitionDate,
      landDate: o.landAcquisitionDate,
      landMode: o.landAcqMode,
      landPrice: o.landAcquisitionPrice,
      buildingPrice: o.buildingAcquisitionPrice,
    });
    const single = pick(r.body);
    expect(single).toEqual({
      cause: "inheritance",
      decedent: "1990-04-01",
      landDate: "2015-03-10",
      landMode: "actual",
      landPrice: 300_000_000,
      buildingPrice: 350_000_000,
    });
    expect(pick(buildPropertyPayload(form(a)) as Record<string, unknown>)).toEqual(single);
    expect(pick(buildAssetPayload(a, "apportioned", TRANSFER_DATE) as Record<string, unknown>)).toEqual(single);
    expect(r.status).toBe(200);
    expect(r.split).toBeDefined();
    // 원인이 세액에 닿는지: 토지 상속개시일 2025-02-01(보유 1년 5개월). 상속이면 피상속인 취득일(1990)부터 통산해
    // 주택 단기세율을 벗어나고(§104②1호), 원인을 끄면(토지 매매) 단기세율 — 세액이 달라야 한다.
    // (토지 2015 시드는 어느 쪽이든 2년 초과라 같은 값이 정답이다.)
    const short = { landAcquisitionDate: "2025-02-01" } as Partial<AssetForm>;
    const withCause = await run(purchase(short));
    const plain = await run(purchase({ ...short, landAcquisitionCause: "", landCauseHost: "" }));
    expect(withCause.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(withCause.tax!).toBeLessThan(plain.tax!);
  });

  it("C12 Check F2 — 매매 ON → 상속 → 매매 후 「취득일 다름」만 켜면 토지 원인은 꺼져 있다(켠 적 없는 원인 부활 금지)", () => {
    for (const via of ["inheritance", "newConstruction"]) {
      const back = { ...setCause(setCause(purchase(), via), "purchase"), hasSeperateLandAcquisitionDate: true } as AssetForm;
      expect(back.landAcquisitionCause).toBe("inheritance"); // 값은 보존
      expect(effectiveLandAcquisitionCause(back)).toBe("");
      expect(buildLandPartCausePayload(back)).toEqual({});
    }
  });

  it("C13 Check F1-a — 오래된 매매 주택(PHD 자동 ON) + 토지 원인 + 토지일 비움 → ⑧이 토지 취득일 칸으로 막는다(건물 취득일 후퇴 금지)", () => {
    const a = purchase({ acquisitionDate: "2001-05-01", usePreHousingDisclosure: true, landAcquisitionDate: "" } as Partial<AssetForm>);
    const r = v8(a);
    expect(r.result).toContain("토지 상속개시일(증여일)이 필요합니다");
    expect(r.fieldOf(r.result!)).toBe("landAcquisitionDate");
    // ④도 건물 취득일로 후퇴시키지 않는다(같은 술어)
    expect((buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed }) as Record<string, unknown>).landAcquisitionDate).toBeUndefined();
    expect((buildPropertyPayload(form(a)) as Record<string, unknown>).landAcquisitionDate).toBeUndefined(); // 다건 ④
  });

  it("C14 Check F1-b — PHD 자동 ON + 토지 원인 + 레거시 환산: ④가 자산 단위 기준시가를 빼지 않는다(⑫ 400 막다른 길 방지)", async () => {
    const a = purchase({
      acquisitionDate: "2001-05-01",
      usePreHousingDisclosure: true,
      useEstimatedAcquisition: true,
      buildingAcqMode: "estimated",
      standardPriceAtAcq: "300,000,000",
      standardPriceAtTransfer: "900,000,000",
      buildingStandardPriceAtAcq: "100,000,000",
    } as Partial<AssetForm>);
    const r = await run(a);
    expect(r.body.standardPriceAtTransfer).toBeDefined();
    expect(Object.keys(r.err?.fieldErrors ?? {})).not.toContain("standardPriceAtTransfer");
  });

  it("C11 PHD(T-3, 매매): 자동 ON 플래그·3-시점 값이 있어도 원인 유효면 ④ 미전송 · ⑧ 11칸 미요구 · route 200", async () => {
    const a = purchase({
      usePreHousingDisclosure: true,
      phdFirstDisclosureDate: "2005-04-30",
      phdFirstDisclosureHousingPrice: "300,000,000",
    } as Partial<AssetForm>);
    expect(phdPayloadActive(a)).toBe(false);
    expect(usesPhdGate(a, false)).toBe(false);
    // 원인을 끄면 종전대로 PHD가 살아난다(긍정 짝)
    expect(usesPhdGate({ ...a, landCauseHost: "" }, false)).toBe(true);
    expect(v8(a).result).toBeNull();
    const r = await run(a);
    expect(r.body.preHousingDisclosure).toBeUndefined();
    expect(r.status).toBe(200);
  });
});
