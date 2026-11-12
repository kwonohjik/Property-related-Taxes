/**
 * 부담부증여 × 토지·건물 소유자 분리 — 범위 안(건물 종류) 화면 계산 anchor (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §9.1 · PR-3).
 *
 * 폼 → ④ `captureBody` → route POST(⑫⑭) 경로로 §9.1 수치를 재현한다. 증여한 부분(본인 소유분)의 값만 입력하고 비소유 파트는 0으로 간다(엔진 입력 계약).
 * 공통: 건물 · 기준시가 평가 · 매매 2015-01-01 → 양도 2026-02-16(보유 11년 표1 22%) · 중과 없음 · 모의 세율(`makeMockRates`).
 * 범위 밖(주택·취득원인·매매사례/감정·공유지분·함께 양도)은 사유별 문구로 막힘을 함께 고정한다(⑧ = ⑫).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { bgOwnerSplitActive, bgOwnerSplitReasonMessage, bgOwnerSplitUnsupported, type BgOwnerSplitReason } from "@/lib/calc/bg-owner-split-scope";
import { asset, bldg, land, post, run } from "./_bg-owner-split-fixtures";

const A1 = bldg("200,000,000", "250,000,000");
const A2 = bldg("200,000,000", "80,000,000");
const A3 = bldg("80,000,000", "40,000,000", { bgLendingDepositTotal: "", bgMortgageDebtAmount: "100000000", bgMortgageSetAmount: "100000000" });
const A4 = bldg("80,000,000", "40,000,000", { bgLendingDepositTotal: "60000000", bgMortgageDebtAmount: "60000000", bgMortgageSetAmount: "20000000" });
const MKT = { bgValuationMode: "sangjeungbeop_market", bgMarketValueOwnedPart: "200,000,000" };

const fieldsOf = (r: Awaited<ReturnType<typeof run>>) => r.issues.map((i) => i.field);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("건물만 본인 · 기준시가 평가 (계획서 §9.1)", () => {
  it("A1 건물분 양도 2억 · 취득 2.5억 → 양도차익 −28,750,000 · 결정세액 0 (전체 값이면 4,039,500)", async () => {
    const r = await run([asset(1, A1)]);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.transferGain).toBe(-28_750_000);
    expect(r.result.determinedTax).toBe(0);
    expect(r.result.splitDetail?.selfOwns).toBe("building_only");
  });

  it("A2 건물분 양도 2억 · 취득 8천만 → 양도차익 58,800,000 · 결정세액 5,244,600", async () => {
    const r = await run([asset(1, A2)]);
    expect(r.issues).toEqual([]);
    expect(r.result.transferGain).toBe(58_800_000);
    expect(r.result.longTermHoldingDeduction).toBe(12_936_000);
    expect(r.result.determinedTax).toBe(5_244_600);
  });

  it("A3 §66 담보 승(채무가 증여한 건물분만 담보) → A2와 같은 5,244,600", async () => {
    const r = await run([asset(1, A3)]);
    expect(r.issues).toEqual([]);
    expect(r.result.transferGain).toBe(58_800_000);
    expect(r.result.determinedTax).toBe(5_244_600);
  });

  it("A4 초과부담부(채무 1.2억 > 증여한 건물분 8천만) → ⑧ 차단 · route 400 [EXCESS_BURDENED_GIFT]", async () => {
    const r = await run([asset(1, A4)]);
    expect(r.issues.map((i) => i.message)).toEqual([expect.stringContaining("채무액(120,000,000원)이 증여가액(80,000,000원)을 초과")]);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("EXCESS_BURDENED_GIFT");
  });
});

describe("토지만 본인 · 기준시가 평가", () => {
  it("L 토지분 양도 2억(1,000,000/㎡ × 200㎡) · 취득 8천만(400,000/㎡ × 200㎡) → A2와 같은 5,244,600", async () => {
    const r = await run([asset(1, land("1,000,000", "200", "400,000", "200"))]);
    expect(r.issues).toEqual([]);
    expect(r.result.transferGain).toBe(58_800_000);
    expect(r.result.determinedTax).toBe(5_244_600);
    expect(r.result.splitDetail?.selfOwns).toBe("land_only");
  });
});

describe("시가 평가 — 증여한 부분 시가(bgMarketValueOwnedPart → marketValueAtTransfer)", () => {
  it("실지취득가액: 시가 2억 · 실지 8천만 → 양도가액 1억 − 취득가액 4천만(개산공제 없음) = 60,000,000", async () => {
    const r = await run([asset(1, bldg("200,000,000", "", { ...MKT, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" }))]);
    expect(r.issues).toEqual([]);
    expect(r.result.transferGain).toBe(60_000_000);
    expect(r.body.burdenedGiftInfo).toMatchObject({ marketValueAtTransfer: 200_000_000, actualAcquisitionTotal: 80_000_000 });
  });

  it("환산취득가액: 시가 2억 · 양도시 기준시가 2억 · 취득시 8천만 → 58,800,000 (A2와 같다)", async () => {
    const r = await run([asset(1, bldg("200,000,000", "80,000,000", { ...MKT, bgAcquisitionMethod: "converted" }))]);
    expect(r.issues).toEqual([]);
    expect(r.result.transferGain).toBe(58_800_000);
    expect(r.result.determinedTax).toBe(5_244_600);
  });

  it("총액 칸(bgMarketValueAtTransfer)은 읽지 않는다 — 증여한 부분 시가가 비면 총액이 있어도 ⑧이 그 칸으로 보낸다", async () => {
    const r = await run([asset(1, bldg("200,000,000", "", { ...MKT, bgMarketValueOwnedPart: "", bgMarketValueAtTransfer: "1,000,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" }))]);
    expect(fieldsOf(r)).toEqual(["bgMarketValueOwnedPart"]);
    // 서버로는 총액이 아니라 비어 있는 증여한 부분 시가가 간다 — 총액을 대신 싣지 않는다
    expect((r.body.burdenedGiftInfo as Record<string, unknown>).marketValueAtTransfer).toBeUndefined();
  });
});

describe("④ 전송 본문 — 본인 몫만 싣는다 (Network request body)", () => {
  it("건물만: selfOwns · 건물 기준시가 양시점 · 토지 0 · 양도가액 직접 분할/파트 취득가/파트 시가/증여일 기준시가 없음", async () => {
    const r = await run([
      asset(1, {
        ...A2,
        // 비소유(토지) 칸·날짜 분리·증여일 기준시가에 남은 값 — 읽지 않는다
        standardPricePerSqmAtTransfer: "9,000,000", transferArea: "300", standardPricePerSqmAtAcq: "9,000,000", acquisitionArea: "300",
        bgMarketValueLand: "1", bgMarketValueBuilding: "1", bgGiftBuildingStdPriceAtTransfer: "999,000,000",
        bgActualAcquisitionLand: "5", bgActualAcquisitionBuilding: "5", landTransferPrice: "7", buildingTransferPrice: "7", landAcquisitionPrice: "7", buildingAcquisitionPrice: "7",
      }),
    ]);
    expect(r.status).toBe(200);
    expect(r.body.selfOwns).toBe("building_only");
    expect(r.body.burdenedGiftInfo).toMatchObject({ landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 80_000_000 });
    const info = r.body.burdenedGiftInfo as Record<string, unknown>;
    for (const k of ["marketValueByPart", "giftBuildingStdPriceAtTransfer", "actualLandAcquisitionPrice", "actualBuildingAcquisitionPrice"]) expect(info[k], k).toBeUndefined();
    for (const k of ["landTransferPrice", "buildingTransferPrice", "landAcquisitionPrice", "buildingAcquisitionPrice", "landStandardPriceAtTransfer", "buildingStandardPriceAtTransfer"]) expect(r.body[k], k).toBeUndefined();
    expect(r.result.determinedTax).toBe(5_244_600);
  });

  it("토지만: 건물 칸에 남은 값은 읽지 않는다 · 건물 기준시가 0", async () => {
    const r = await run([asset(1, land("1,000,000", "200", "400,000", "200", { buildingStandardPriceAtTransfer: "900,000,000", buildingStandardPriceAtAcq: "900,000,000" }))]);
    expect(r.status).toBe(200);
    expect(r.body.burdenedGiftInfo).toMatchObject({ landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 0, landStdPriceAtAcquisition: 80_000_000, buildingStdPriceAtAcquisition: 0 });
    expect(r.result.determinedTax).toBe(5_244_600);
  });

  it("단일 기준시가 칸(standardPriceAtTransfer/Acq)에 남은 값은 읽지 않는다 — 본인 몫 칸이 정본", async () => {
    const r = await run([asset(1, { ...A2, standardPriceAtTransfer: "1,000,000,000", standardPriceAtAcq: "500,000,000" })]);
    expect(r.body.burdenedGiftInfo).toMatchObject({ buildingStdPriceAtTransfer: 200_000_000, buildingStdPriceAtAcquisition: 80_000_000 });
    expect(r.result.determinedTax).toBe(5_244_600);
  });

  it("숨은 감정·매매사례 플래그는 판정을 바꾸지 않는다(V-5 — 범위 안에서 다시 고정)", async () => {
    const clean = await run([asset(1, A2)]);
    for (const flag of [{ isAppraisalAcquisition: true }, { isSalesCaseAcquisition: true }]) {
      const r = await run([asset(1, { ...A2, ...flag })]);
      expect(r.issues, JSON.stringify(flag)).toEqual([]);
      expect(r.status).toBe(200);
      expect(r.result.determinedTax).toBe(clean.result.determinedTax);
    }
  });
});

describe("⑧ 본인 몫 필수 입력 (자동 안분 없음 — 비면 그 칸으로 보낸다)", () => {
  it("채무 확인 미체크 → bgOwnerSplitDebtConfirmed", async () => {
    expect(fieldsOf(await run([asset(1, { ...A2, bgOwnerSplitDebtConfirmed: false })]))).toEqual(["bgOwnerSplitDebtConfirmed"]);
  });
  it("건물만 · 양도시 건물 기준시가 없음 → buildingStandardPriceAtTransfer", async () => {
    expect(fieldsOf(await run([asset(1, bldg("", "80,000,000"))]))).toEqual(["buildingStandardPriceAtTransfer"]);
  });
  it("건물만 · 취득시 건물 기준시가 없음(기준시가 평가) → buildingStandardPriceAtAcq", async () => {
    expect(fieldsOf(await run([asset(1, bldg("200,000,000", ""))]))).toEqual(["buildingStandardPriceAtAcq"]);
  });
  it("토지만 · 양도시 토지(공시지가·면적) 없음 → standardPricePerSqmAtTransfer / transferArea", async () => {
    expect(fieldsOf(await run([asset(1, land("", "", "400,000", "200"))]))).toEqual(["standardPricePerSqmAtTransfer"]);
    expect(fieldsOf(await run([asset(1, land("1,000,000", "", "400,000", "200"))]))).toEqual(["transferArea"]);
  });
  it("토지만 · 취득시 토지(공시지가·면적) 없음 → standardPricePerSqmAtAcq / acquisitionArea", async () => {
    expect(fieldsOf(await run([asset(1, land("1,000,000", "200", "", "200"))]))).toEqual(["standardPricePerSqmAtAcq"]);
    expect(fieldsOf(await run([asset(1, land("1,000,000", "200", "400,000", ""))]))).toEqual(["acquisitionArea"]);
  });
  it("토지만 · 토지 취득일 없음 → landAcquisitionDate (Q-8 — 일반 소유자 분리와 같은 규칙) · 건물만은 요구하지 않는다", async () => {
    expect(fieldsOf(await run([asset(1, land("1,000,000", "200", "400,000", "200", { landAcquisitionDate: "" }))]))).toEqual(["landAcquisitionDate"]);
    expect(fieldsOf(await run([asset(1, { ...A2, landAcquisitionDate: "" })]))).toEqual([]);
  });
  it("실지취득가액(시가 평가) — 취득시 기준시가는 요구하지 않는다(쓰지 않는다) · 실지취득가액 총액이 비면 기존 규칙대로 bgActualAcquisitionTotal", async () => {
    const ok = bldg("200,000,000", "", { ...MKT, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" });
    expect(fieldsOf(await run([asset(1, ok)]))).toEqual([]);
    expect(fieldsOf(await run([asset(1, { ...ok, bgActualAcquisitionTotal: "" })]))).toEqual(["bgActualAcquisitionTotal"]);
  });
  it("환산취득가액(시가 평가) — 취득시 기준시가 필수", async () => {
    expect(fieldsOf(await run([asset(1, bldg("200,000,000", "", { ...MKT, bgAcquisitionMethod: "converted" }))]))).toEqual(["buildingStandardPriceAtAcq"]);
  });
});

describe("범위 밖 — 사유별로 막는다 (⑧ selfOwns = ⑫ 400 같은 문구)", () => {
  /** 일반 부담부증여 ⑧이 먼저 요구하는 단일 기준시가·시가·피상속인 칸 — 범위 밖 시료가 selfOwns 사유까지 닿게 채운다(소유자 분리 칸이 아니다). */
  const G = { standardPriceAtTransfer: "1,000,000,000", standardPriceAtAcq: "500,000,000", bgMarketValueAtTransfer: "1,000,000,000", bgPresumedAcquisitionTotal: "300,000,000", decedentAcquisitionDate: "2000-01-01", donorAcquisitionDate: "2000-01-01" };
  const cases: Array<[string, BgOwnerSplitReason, Record<string, unknown>]> = [
    ["주택", "housing", { assetKind: "housing" }],
    ["취득원인 상속", "cause", { acquisitionCause: "inheritance" }],
    ["취득원인 증여", "cause", { acquisitionCause: "gift" }],
    ["시가 · 매매사례가액", "method", { ...MKT, bgAcquisitionMethod: "salesCase" }],
    ["시가 · 감정가액", "method", { ...MKT, bgAcquisitionMethod: "appraisal" }],
  ];
  it.each(cases)("%s → %s", async (_name, reason, over) => {
    const r = await run([asset(1, { ...A2, ...G, ...over })]);
    const expected = bgOwnerSplitReasonMessage(reason);
    expect(r.issues).toEqual([expect.objectContaining({ assetIndex: 0, field: "selfOwns", message: `자산: ${expected}` })]);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain(expected);
  });

  // 이월과세·공유지분은 일반 부담부증여 ⑧의 다른 필수 칸(당초 증여자 값 · 지분 모드 단독 계산 불가)이 먼저 막는다 — ⑧ 술어와 ⑫ 문구를 각각 고정한다.
  it.each([
    ["이월과세", "carryover", { acquisitionCause: "carryover_gift" }],
    ["공유지분 1/2", "coOwnership", { ownershipNumerator: "1", ownershipDenominator: "2" }],
  ] as const)("%s → %s: ⑧ 술어 · ⑫ 400", async (_name, reason, over) => {
    const a = asset(1, { ...A2, ...G, ...over });
    expect(bgOwnerSplitUnsupported(a)).toBe(bgOwnerSplitReasonMessage(reason));
    expect(bgOwnerSplitActive(a)).toBe(false);
    const r = await run([a]);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain(bgOwnerSplitReasonMessage(reason));
  });

  it("함께 양도 묶음(건물 2건) → bundle — 두 자산 모두 selfOwns 칸으로 · ⑫ 400", async () => {
    const r = await run([asset(1, A2), asset(2, A2)]);
    const expected = bgOwnerSplitReasonMessage("bundle");
    expect(r.issues.filter((i) => i.field === "selfOwns").map((i) => [i.assetIndex, i.message])).toEqual([
      [0, `자산 1: ${expected}`],
      [1, `자산 2: ${expected}`],
    ]);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain(expected);
  });

  it("범위 밖 사유는 본인 몫 입력 요구보다 먼저다 — 주택은 채무 확인·기준시가를 요구하지 않고 selfOwns 칸 하나로 보낸다", async () => {
    const r = await run([asset(1, { ...A2, ...G, assetKind: "housing", bgOwnerSplitDebtConfirmed: false, buildingStandardPriceAtTransfer: "", buildingStandardPriceAtAcq: "" })]);
    expect(r.issues.map((i) => i.field)).toEqual(["selfOwns"]);
  });
});

describe("⑫ 직접 API — 본인 몫 계약(비소유 파트 0)은 ④를 거치지 않은 본문도 막는다", () => {
  const info = (b: Awaited<ReturnType<typeof run>>) => b.body.burdenedGiftInfo as Record<string, unknown>;

  it("건물만 본인인데 토지 기준시가가 있다 → 400 (경로 burdenedGiftInfo.landStdPriceAtTransfer)", async () => {
    const r = await run([asset(1, A2)]);
    const res = await post({ ...r.body, burdenedGiftInfo: { ...info(r), landStdPriceAtTransfer: 800_000_000 } });
    expect(res.status).toBe(400);
    // ⑫ Zod가 먼저 필드 오류로 돌려준다(엔진 INVALID_INPUT은 fieldErrors가 없다)
    expect(res.json?.error?.fieldErrors?.["burdenedGiftInfo.landStdPriceAtTransfer"]?.[0]).toContain("증여한 부분(건물)의 값만 보내야 합니다");
    expect(res.text).toContain("토지는 본인 소유가 아니므로");
  });

  it("토지만 본인인데 건물 취득시 기준시가가 있다 → 400", async () => {
    const r = await run([asset(1, land("1,000,000", "200", "400,000", "200"))]);
    const res = await post({ ...r.body, burdenedGiftInfo: { ...info(r), buildingStdPriceAtAcquisition: 50_000_000 } });
    expect(res.status).toBe(400);
    expect(res.json?.error?.fieldErrors?.["burdenedGiftInfo.buildingStdPriceAtTransfer"]?.[0]).toContain("증여한 부분(토지)의 값만 보내야 합니다");
  });

  it("증여한 부분의 양도시 기준시가가 0 · 비소유 파트 실지취득가 · 파트 시가 → 400", async () => {
    const r = await run([asset(1, A2)]);
    for (const over of [{ buildingStdPriceAtTransfer: 0 }, { actualLandAcquisitionPrice: 5 }, { marketValueByPart: { land: 1, building: 1 } }]) {
      const res = await post({ ...r.body, burdenedGiftInfo: { ...info(r), ...over } });
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(Object.keys(res.json?.error?.fieldErrors ?? {}), JSON.stringify(over)).toEqual([`burdenedGiftInfo.${Object.keys(over)[0]}`]);
    }
  });

  it("소유자 분리가 없는(both) 부담부증여는 같은 본문에서 계약을 검사하지 않는다 — 형제 안전망", async () => {
    const r = await run([asset(1, { ...A2, selfOwns: "both" })]);
    const res = await post({ ...r.body, selfOwns: undefined, burdenedGiftInfo: { ...info(r), landStdPriceAtTransfer: 800_000_000 } });
    expect(res.text).not.toContain("증여한 부분(건물)의 값만 보내야 합니다");
  });
});
