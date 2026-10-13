/**
 * G2 후속 — 「토지·건물 취득일 다름」 토글 ON + 토지 취득일 미입력은 같은 날 취득으로 조용히 계산되지 않는다. 토지 취득일을 필수로 받는다.
 *
 * ## 결함 (probe 실측 — 이 게이트 전, 1세대1주택 15억 주택 · 매매 2012-01-02 · 양도 2026-02-16)
 * 토글 ON + 토지 취득일 빈칸 → ⑧ issues 없음 · 200 · 같은 날 값(주택 4,801,500). 환산 4,329,600 · 감정·매매사례 4,742,100 · PHD·배율 초과분
 * 분리(24,196,510)·지분 1/2(1,501,500)·소유자 분리(토지만 소유 627,000)도 전부 통과. 일반건물(V-1)·겸용주택은 같은 토글에서 이미 필수였다.
 * 일부만 막혀 있었다 — #2169가 «파트 방식 라디오 불일치 + 빈칸»일 때만 토지 취득일 칸으로 보냈다(라디오가 같으면 통과).
 *
 * ## 격자: 토글 {ON, OFF} × 토지 취득일 {빈칸, 같은 날, 다른 날} × 경로 {단건 주택·단건 건물·함께 양도 주택 카드} × 라디오 {일치, 불일치}
 * 차단 = 토글 ON ∧ 빈칸 하나뿐이다(경로·라디오·취득가액 방식·자산 속성과 무관). 범위 밖 = 칸이 없거나 쓰이지 않는 자산(상속·증여·신축·소유자 분리 건물만 소유·토지 종류)과
 * 자체 게이트가 있는 자산(D1·D2 원인 모드 · 겸용 · 일반건물).
 *
 * ## 서버(④⑫)
 * 주택·건물 payload는 토글을 싣지 않는다 — 빈 토지 취득일은 토글 OFF의 정당한 «같은 날»과 같은 본문이라 서버가 막을 근거가 없고(⑧이 유일한 관문),
 * 빈 문자열은 400, 별개 취득 선언(`isSeparateAcquisition: true`)에 토지 취득일이 없으면 ⑫가 400으로 막는다(종전 200 같은 날).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, captureBody, postTransfer } from "./_helpers/redev-one-house-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { separateLandDateRequired } from "@/lib/calc/separate-land-date-required";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "250",
  transferArea: "250",
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const household = {
  transferDate: TD,
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
};
const HIGH = "1500000000";
const form = (over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(), ...household, contractTotalPrice: HIGH,
    assets: [{ ...makeDefaultAsset(1), ...HOUSE, actualSalePrice: HIGH, ...over }],
  }) as never;
const LAND_FIRST = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-02", fixedAcquisitionPrice: "100000000", actualSalePrice: "500000000",
  addressJibun: "서울 테스트동 9", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "800000", landNature: "independent",
  standardPriceAtTransfer: "80000000",
};
/** 1번 자산 토지 · 2번 자산 주택(함께 양도 주택 카드) */
const companion = (over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(), ...household, contractTotalPrice: "2000000000",
    assets: [
      { ...makeDefaultAsset(1), ...LAND_FIRST },
      { ...makeDefaultAsset(2), ...HOUSE, addressJibun: "서울 테스트동 2", actualSalePrice: HIGH, standardPriceAtTransfer: "800000000", ...over },
    ],
  }) as never;

const issuesOf = (f: never) => {
  const out: { assetIndex?: number; field?: string; message: string }[] = [];
  for (let st = 0; st <= 5; st++) for (const i of collectStepIssues(st, f)) out.push({ assetIndex: i.assetIndex, field: i.field, message: i.message });
  return out;
};
const NEW_MSG = "「토지·건물 취득일 다름」을 켰으므로 토지 취득일을 입력하세요";
const required = (f: never) => issuesOf(f).filter((i) => i.message.includes(NEW_MSG));

const ON = { hasSeperateLandAcquisitionDate: true };
const EMPTY = { ...ON, landAcquisitionDate: "" };
const SAME = { ...ON, landAcquisitionDate: "2012-01-02" };

describe("격자 — 토글 × 토지 취득일 × 경로: 차단은 «토글 ON ∧ 빈칸» 하나뿐이다", () => {
  const PATHS: [string, (o: Record<string, unknown>) => never, number][] = [
    ["단건 주택", (o) => form(o), 0],
    ["단건 건물(토지 제외)", (o) => form({ assetKind: "building", ...o }), 0],
    ["함께 양도 주택 카드(2번 자산)", (o) => companion(o), 1],
  ];

  it.each(PATHS)("🔑 %s · 토글 ON + 빈칸 → landAcquisitionDate로 막는다 (수정 전: issues 없음 · 같은 날 값)", (_n, mk, idx) => {
    const hit = required(mk(EMPTY));
    expect(hit).toHaveLength(1);
    expect(hit[0].field).toBe("landAcquisitionDate");
    expect(hit[0].assetIndex).toBe(idx);
  });

  it.each(PATHS)("%s · 토글 ON + 같은 날짜 → 통과 · 다른 날짜 → 이 규칙은 걸리지 않는다", (_n, mk) => {
    expect(required(mk(SAME))).toEqual([]);
    expect(required(mk({ ...ON, landAcquisitionDate: "2010-01-04" }))).toEqual([]);
  });

  it.each(PATHS)("%s · 토글 OFF + 빈칸 → 통과(같은 날이 정당한 의미)", (_n, mk) => {
    expect(required(mk({ hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "" }))).toEqual([]);
  });

  it("값 대조 — 단건 토글 ON·같은 날짜는 토글 OFF와 같은 값(4,801,500), 함께 양도 주택 카드는 138,270,000", async () => {
    const off = await runCalc(form({}));
    const same = await runCalc(form(SAME));
    expect(same.issues).toEqual([]);
    expect(same.result.totalTax).toBe(off.result.totalTax);
    expect(same.result.totalTax).toBe(4_801_500);
    const c = await runCalc(companion(SAME));
    expect(c.issues).toEqual([]);
    expect(c.json.data.aggregated.totalTax).toBe(138_270_000);
  });
});

describe("격자 — 파트 방식 라디오 {일치, 불일치} × 빈칸: 어느 쪽이든 토지 취득일 칸으로 (#2169는 불일치만 막았다)", () => {
  it.each([
    ["라디오 미선택", {}],
    ["두 라디오 = 자산 단위(실가)", { landAcqMode: "actual", buildingAcqMode: "actual" }],
    ["토지 환산 / 건물 실가(불일치)", { landAcqMode: "estimated", buildingAcqMode: "actual" }],
    ["토지 실가 / 건물 환산(불일치)", { landAcqMode: "actual", buildingAcqMode: "estimated" }],
  ])("🔑 %s → landAcquisitionDate (라디오 칸이 아니라)", (_n, radios) => {
    const issues = issuesOf(form({ ...EMPTY, ...radios }));
    const hit = issues.filter((i) => i.field === "landAcquisitionDate");
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("토지 취득일을 입력하세요");
    expect(issues.find((i) => i.field === "landAcqMode" || i.field === "buildingAcqMode")).toBeUndefined();
  });

  it("같은 날짜를 넣으면 불일치 라디오는 다음 검증에서 라디오 칸으로 간다(#2169 유지)", () => {
    const issues = issuesOf(form({ ...SAME, landAcqMode: "estimated", buildingAcqMode: "actual" }));
    expect(issues.find((i) => i.field === "landAcqMode")?.message).toContain("같은 날 취득한 주택");
  });
});

describe("순서 — 토지 취득일이 먼저다(같은 날인지 다른 날인지 알아야 뒤의 규칙이 의미를 갖는다)", () => {
  it("🔑 배율 초과 + 소재지 구분 미선택 + 토글 ON·빈칸 → 소재지 구분 요구보다 토지 취득일이 앞선다", () => {
    const issues = issuesOf(form({ ...EMPTY, acquisitionArea: "400", transferArea: "400", appurtenantLandZone: undefined }));
    expect(issues.filter((i) => i.message.includes(NEW_MSG))).toHaveLength(1);
    expect(issues.find((i) => i.field === "appurtenantLandZone")).toBeUndefined();
  });
  it("대조 — 토지 취득일을 채우면 소재지 구분 요구가 나온다", () => {
    const issues = issuesOf(form({ ...SAME, acquisitionArea: "400", transferArea: "400", appurtenantLandZone: undefined }));
    expect(issues.find((i) => i.field === "appurtenantLandZone")).toBeDefined();
  });
});

describe("경로 — 취득가액 방식·자산 속성과 무관하게 막는다 (수정 전: 전부 통과)", () => {
  it.each([
    ["환산취득가액", { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000" }],
    ["감정가액", { isAppraisalAcquisition: true }],
    ["매매사례가액", { isSalesCaseAcquisition: true, similarSalesValue: "500000000" }],
    ["개별주택가격 미공시(PHD) 2003 취득", { acquisitionDate: "2003-01-02", usePreHousingDisclosure: true }],
    ["배율 초과 부수토지(400㎡)", { acquisitionArea: "400", transferArea: "400" }],
    ["소유자 분리 — 토지만 본인 소유", { selfOwns: "land_only" }],
  ])("🔑 %s · 토글 ON + 빈칸 → landAcquisitionDate", (_n, over) => {
    const hit = required(form({ ...EMPTY, ...over }));
    expect(hit).toHaveLength(1);
    expect(hit[0].field).toBe("landAcquisitionDate");
  });

  it("공유지분 1/2 · 토글 ON + 빈칸 → 이 규칙이 걸린다(지분 자체 안내와 별개)", () => {
    expect(required(form({ ...EMPTY, ownershipNumerator: "1", ownershipDenominator: "2" }))).toHaveLength(1);
  });
});

describe("범위 밖 — 칸이 없거나 쓰이지 않거나 자체 게이트가 있다 → 이 규칙은 걸리지 않는다", () => {
  it.each([
    ["소유자 분리 — 건물만 본인 소유(토지 취득일 미사용)", { selfOwns: "building_only" }],
    ["상속 취득(토글 잔재 = 화면에 없는 분리 입력)", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01" }],
    ["증여 취득(토글 잔재)", { acquisitionCause: "gift" }],
    ["신축(토글 잔재)", { acquisitionCause: "newConstruction", occupancyApprovalDate: "2012-01-02" }],
    ["토지 자산(주택에서 켠 토글 잔재)", { assetKind: "land" }],
    ["일반건물(자체 게이트 V-1)", { assetKind: "general_building" }],
    ["부담부증여 양도(토지 취득일이 계산에 쓰이지 않는다 — 아래 값 대조)", { transferType: "burdened_gift" }],
  ])("%s", (_n, over) => {
    expect(required(form({ ...EMPTY, ...over }))).toEqual([]);
  });

  it("겸용주택은 종전 게이트(`validateMixedUseAsset`)가 막는다 — 새 문구가 아니라 기존 문구", () => {
    const issues = issuesOf(form({ ...EMPTY, isMixedUseHouse: true }));
    expect(issues.filter((i) => i.message.includes(NEW_MSG))).toEqual([]);
    expect(issues.find((i) => i.field === "landAcquisitionDate")?.message).toContain("토지 취득일을 입력하세요.");
  });

  it("D1(토지 상속)·D2(건물 상속 + 토지 매매)는 원인별 문구(leaf)가 요구한다 — 이중 안내 없음", () => {
    const d1 = issuesOf(form({ ...EMPTY, landAcquisitionCause: "inheritance", landCauseHost: "purchase", landDecedentAcquisitionDate: "1990-01-01" }));
    expect(d1.filter((i) => i.message.includes(NEW_MSG))).toEqual([]);
    expect(d1.filter((i) => i.field === "landAcquisitionDate")).toHaveLength(1);
    const d2 = issuesOf(form({
      ...EMPTY, acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", landAcquisitionCause: "purchase", landCauseHost: "inheritance",
      publishedValueAtInheritance: "500000000",
    }));
    expect(d2.filter((i) => i.message.includes(NEW_MSG))).toEqual([]);
    expect(d2.filter((i) => i.field === "landAcquisitionDate")).toHaveLength(1);
  });

  it("D1 + 건물 라디오 불일치 + 빈칸 → #2169 분기가 같은 칸(landAcquisitionDate)으로 보낸다 — 일반 게이트가 범위 밖으로 둔 유일한 경로", () => {
    const issues = issuesOf(form({
      ...EMPTY, landAcquisitionCause: "inheritance", landCauseHost: "purchase", landDecedentAcquisitionDate: "1990-01-01", buildingAcqMode: "estimated",
    }));
    const hit = issues.filter((i) => i.field === "landAcquisitionDate");
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("토지 취득일을 입력하세요");
  });
});

describe("⑤ ↔ ⑧ — 필수 표시(`*`)와 차단이 같은 술어 하나다", () => {
  const A = (over: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), ...HOUSE, ...over }) as AssetForm;
  it("토지 취득일이 채워져도 토글 ON이면 «필수»(표시), 토글 OFF·범위 밖이면 아니다", () => {
    expect(separateLandDateRequired(A({ ...SAME }))).toBe(true);
    expect(separateLandDateRequired(A({ hasSeperateLandAcquisitionDate: false }))).toBe(false);
    expect(separateLandDateRequired(A({ ...EMPTY, selfOwns: "building_only" }))).toBe(false);
    expect(separateLandDateRequired(A({ ...EMPTY, acquisitionCause: "gift" }))).toBe(false);
    expect(separateLandDateRequired(A({ ...EMPTY, isMixedUseHouse: true }))).toBe(false);
    expect(separateLandDateRequired(A({ ...EMPTY, transferType: "burdened_gift" }))).toBe(false);
  });
});

describe("부담부증여 양도 — 토지 취득일은 계산에 쓰이지 않아 필수로 받지 않는다 (값 대조)", () => {
  // 채무 6억(전세보증금 3억 + 근저당 3억) · 양도시 기준시가 10억 · 취득시 5억 — 증여자 취득일 2009-03-01 · 양도 2024-03-01
  const BG = {
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000",
    standardPriceAtTransfer: "1000000001", standardPriceAtAcq: "500000001",
  };
  const bgForm = (over: Record<string, unknown>) =>
    ({
      ...createDefaultTransferFormData(), transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1000000000",
      isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
      assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
        acquisitionDate: "2009-03-01", ownershipNumerator: "100", ownershipDenominator: "100", ...BG, ...over }],
    }) as never;

  it("🔑 토글 ON + 토지 취득일 {빈칸·같은 날·더 이른 날·더 늦은 날} → 세액·양도차익이 토글 OFF와 모두 같다(62,167,600 · 291,000,000)", async () => {
    const off = await runCalc(bgForm({}));
    expect(off.result.totalTax).toBe(62_167_600);
    for (const d of ["", "2009-03-01", "2001-03-01", "2020-03-01"]) {
      const r = await runCalc(bgForm({ ...ON, landAcquisitionDate: d }));
      expect(r.result.totalTax, `landAcquisitionDate=${d || "빈칸"}`).toBe(off.result.totalTax);
      expect(r.result.transferGain, `landAcquisitionDate=${d || "빈칸"}`).toBe(off.result.transferGain);
    }
  });

  it("그러므로 ⑧은 빈칸을 막지 않는다(쓰이지 않는 입력의 막다른 길 금지) — 일반 주택은 같은 빈칸을 막는다(대조)", () => {
    expect(required(bgForm(EMPTY))).toEqual([]);
    expect(required(form(EMPTY))).toHaveLength(1);
  });
});

describe("저장값 복원(migrate) — 토글 ON + 빈 토지 취득일은 지어내 채우지 않고 ⑧이 안내한다", () => {
  it("복원 후에도 토글 ON·빈칸 그대로(같은 날 자동 채움 금지) → ⑧이 막는다", () => {
    const restored = migrateAsset({ ...makeDefaultAsset(1), ...HOUSE, ...EMPTY });
    expect(restored.hasSeperateLandAcquisitionDate).toBe(true);
    expect(restored.landAcquisitionDate).toBe("");
    expect(required(form({ ...restored }))).toHaveLength(1);
  });
  it("토글 OFF 저장값은 불변식대로 토지 취득일 = 건물 취득일로 복원 → 통과", () => {
    const restored = migrateAsset({ ...makeDefaultAsset(1), ...HOUSE, hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "" });
    expect(restored.landAcquisitionDate).toBe("2012-01-02");
    expect(required(form({ ...restored }))).toEqual([]);
  });
});

describe("서버(④⑫) — 토글을 모르는 본문은 같은 날 폴백으로 흘리지 않고, 모순 본문은 막는다", () => {
  it("④: 토글 ON + 빈칸 본문은 토글을 싣지 않고 토지 취득일도 없다 — 같은 날(토글 OFF)과 같은 계산 · 서버 차단의 근거가 없다는 사실의 고정", async () => {
    const on = (await captureBody(form(EMPTY))) as Record<string, unknown>;
    expect("landAcquisitionDate" in on).toBe(false);
    expect(Object.keys(on).some((k) => /Seperate/.test(k))).toBe(false);
    expect(on.isSeparateAcquisition).toBe(false);
    const offBody = (await captureBody(form({}))) as Record<string, unknown>;
    expect((await postTransfer(on)).result.totalTax).toBe((await postTransfer(offBody)).result.totalTax);
  });

  it("빈 문자열 토지 취득일은 400 — 조용히 같은 날로 읽지 않는다", async () => {
    const body = JSON.parse(JSON.stringify(await captureBody(form(SAME))));
    body.landAcquisitionDate = "";
    const r = await postTransfer(body);
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors.landAcquisitionDate).toBeDefined();
  });

  it("🔑 별개 취득 선언(isSeparateAcquisition: true) + 토지 취득일 없음 → 400 (수정 전: 200 · 같은 날 값 4,801,500)", async () => {
    const body = JSON.parse(JSON.stringify(await captureBody(form(EMPTY))));
    body.isSeparateAcquisition = true;
    delete body.landAcquisitionDate;
    const r = await postTransfer(body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error.fieldErrors.landAcquisitionDate)).toContain("별개 취득");
    // 법령 조문은 legal-codes 상수로 인용한다(문자열 리터럴 금지) — 보유기간 = 그 자산의 취득일부터 양도일까지
    expect(JSON.stringify(r.json.error.fieldErrors.landAcquisitionDate)).toContain(TRANSFER.HOLDING_PERIOD_CALC);
  });

  it("대조 — 두 날짜가 다른 정상 별개 취득 본문(④가 보내는 모양)은 막지 않는다", async () => {
    const f = form({
      ...ON, landAcquisitionDate: "2010-01-04", landAcqMode: "actual", buildingAcqMode: "actual",
      landAcquisitionPrice: "100000000", buildingAcquisitionPrice: "400000000",
    });
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.body.isSeparateAcquisition).toBe(true);
    expect(r.status).toBe(200);
  });
});
