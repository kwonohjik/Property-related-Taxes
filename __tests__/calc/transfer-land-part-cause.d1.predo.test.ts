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
 * ⚠️ 상태 시드(`setCause`·`toggleOn`)는 `CompanionAcquisitionCauseSection`(:92-110)·`NewConstructionLandAcqBlock`(:78-97)의
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
    const pre1990 = base({ landAcquisitionDate: "1984-05-01" });
    expect(blockedAt(pre1990)).toBe("landAcquisitionDate");
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
describe("C. D1 후 기대값 (todo)", () => {
  it.todo("C1 호스트 태그: 매매 호스트에서 켠 상태(landCauseHost='purchase')는 유효 원인 = 저장값, 신축 호스트 태그는 매매에서 무효");
  it.todo("C2 normalize: landCauseHost 부재 + 신축 + 원인 설정 → 'newConstruction'; 부재 + 매매 + 원인 설정 → '' (잔재 무효)");
  it.todo("C3 splitBuildingAcqPriceInput의 fixedAcquisitionPrice 후퇴는 신축 호스트에서만 — 매매에서 건물가 비우면 ⑧ 건물 취득가액 요구");
  it.todo("C4 ⑥ separateAcqPartsSum: 매매 + 원인 + 건물가 비움 → pending (S7: 현행 게이트 확대만 하면 700,000,000 확정으로 오표시)");
  it.todo("C6 Q-5 ⑧: 매매 호스트 + 원인 유효 + selfOwns≠both → landAcquisitionCause 칸 이동(신축은 D1-1 B7) · ⑤ 두 토글 상호 잠금");
  it.todo("C8 결합 제외(매매 호스트): 부담부증여 → ⑧ 차단(토글 칸). 용도변경·공익수용은 막지 않는다(계획서 §10.1 U-4). PHD는 C11(무시)");
  it.todo("C9 ④ 3경로(단건·다건 buildPropertyPayload·컴패니언 buildAssetPayload) D1 조합 payload 동일 (게이트 확대 시뮬레이션 실측: lac/ldd/lad/lam=actual/bap=350,000,000/sep=true)");
  it.todo("C11 PHD: 원인 유효이면 phdPayloadActive/usesPhdGate가 거짓 — ④ preHousingDisclosure 미전송 · ⑧ 11칸 미요구");
});
