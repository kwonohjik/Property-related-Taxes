/**
 * Pre-Do anchor — 겸용주택 **별개 취득** 주택 건물분 취득시 기준시가의 시점 혼합 (Phase B0 · V-1)
 *
 * 설계서: `docs/02-design/features/mixed-use-acq-std-date-mismatch.engine.design.md`
 * 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.3 M-0 · §5 B0
 *
 * 결함: 주택 건물분 취득시 기준시가 `acqBuildingStd = 개별주택가격(건물 취득일 기준) −
 *       ㎡당 공시지가(토지 취득일 기준) × 주택부수토지` (`transfer-tax-mixed-use-housing.ts:273-276`).
 *       토지·건물 취득일이 다르면 **서로 다른 날짜의 값끼리 뺀다**.
 *
 * 🔑 **Route(POST) 경로**로 건다 — 엔진 직접 호출은 ⑫ Zod를 거치지 않아 신규 필드가 strip되는지
 *    못 본다(`feedback_leaf_anchor_skips_zod_layer`). Route 경유라 ⑫⑬⑭ 배관(신규 필드 strip 여부)까지 증명한다.
 *
 * 구성
 *   · C-1~3  신규 칸을 **L1(토지일 값)** 으로 채우면 종전(결함) 값이 그대로 재현 — 환산 / 실가 / 감정·매매사례 3모드
 *   · C-4    (반전됨) 건물분 기준시가는 건물일 공시지가에만 종속, 토지일 공시지가는 토지분만 움직임
 *   · C-5~6  불변 — **함께 취득**(두 날짜 같음)은 수정 후에도 값이 같아야 한다(⑫ 신규 필드 미전송)
 *   · S-1~3  수정 후 기대값 — 패치한 엔진 실측이 설계서 파이썬 재구현값과 1원 일치(2026-10-06)
 *   · S-4    별개 취득 + 신규 필드 미입력 → 차단(자동 fallback 금지)
 *
 * ─── 픽스처(전 케이스 공통) ───
 *   토지 취득 2005-06-10 / 건물 취득 2010-03-15 / 양도 2024-08-20 · 양도가액 30억
 *   주택 100㎡ · 상가 100㎡ · 토지 200㎡(주택부수 100 · 상가부수 100) · `isOneHouseExempt:false`(전부 과세)
 *   양도시: 개별주택가격 16억 · 상가건물 1억 · 공시지가 12,000,000/㎡
 *   취득시: 개별주택가격 4억(건물 취득일 기준) · 상가건물 8천만(건물 취득일 기준)
 *          공시지가 **토지 취득일 기준 L1 = 1,200,000/㎡** · **건물 취득일 기준 L2 = 1,800,000/㎡**(신규 입력 후보)
 *   ⚠️ 공시지가 값은 가상이다(실공시값 아님) — 두 날짜의 값이 **다를 때** 결함이 드러나는 구조만 보는 anchor.
 *
 * ─── 손계산(검증: 아래 현행 값은 같은 산식으로 재현해 엔진 출력과 1원까지 일치 확인) ───
 *   주택 양도가액  = floor(30억 × 16억 / (16억 + 12,000,000×100 + 1억)) = 1,655,172,413
 *     토지분 = floor(×0.75) = 1,241,379,309 · 건물분 = 413,793,104
 *   현행: 취득시 토지분 120,000,000(= L1×100) · 건물분 400,000,000 − 120,000,000 = 280,000,000
 *   수정(최소안 M): 토지분 120,000,000(= L1×100, 토지 파트) · 건물분 400,000,000 − L2×100 = 220,000,000
 *     ⇒ 토지분 + 건물분 ≠ 개별주택가격(= 340,000,000 ≠ 400,000,000) — 별개 취득에서는 의도된 결과다
 *       (단건 별개취득도 파트별 독립 — `transfer-tax-split-acq-price.ts:55-57`)
 *   취득가액 분할 비율 = 토지분 / (토지분 + 건물분), 개산공제 = floor(각 분 × 3%)(소령 §163⑥)
 *   LTHD(표1): 토지 19년 30% · 건물 14년 28% (파트별 · 양수 차익에만 — 주택 건물 차손은 0 처리)
 *   세율: 과표 > 10억 → 45%, 누진공제 65,940,000 · 지방소득세 = floor(결정세액 / 10)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
import { preloadTaxRates } from "@/lib/db/tax-rates";

type Mode = "estimated" | "actual" | "appraisal";

const L1 = 1_200_000; // 토지 취득일(2005-06-10) 기준 ㎡당 개별공시지가
const L2 = 1_800_000; // 건물 취득일(2010-03-15) 기준 ㎡당 개별공시지가

/** 모드별 mixedUse 플래그 — ④ `buildMixedUsePayload`(transfer-tax-api-mixed-use.ts:70-85)와 같은 의미 */
const MODE_FLAGS: Record<Mode, Record<string, unknown>> = {
  estimated: {},
  actual: { useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000 },
  appraisal: { useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: 900_000_000 },
};

function body(
  mode: Mode,
  opts: {
    landDate?: string;
    landPerSqm?: number;
    /** 신규 필드(수정 후) — 현행 Zod는 알 수 없는 키를 strip한다 */
    landPerSqmAtBuildingAcq?: number;
  } = {},
) {
  const { landDate = "2005-06-10", landPerSqm = L1, landPerSqmAtBuildingAcq } = opts;
  return {
    transferPrice: 3_000_000_000,
    acquisitionPrice: 900_000_000,
    acquisitionDate: "2010-03-15",
    transferDate: "2024-08-20",
    expenses: 0,
    useEstimatedAcquisition: mode === "estimated",
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 0,
    propertyType: "mixed-use-house" as const,
    mixedUse: {
      isMixedUseHouse: true as const,
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      landAcquisitionDate: landDate,
      buildingAcquisitionDate: "2010-03-15",
      transferStandardPrice: {
        housingPrice: 1_600_000_000,
        commercialBuildingPrice: 100_000_000,
        landPricePerSqm: 12_000_000,
      },
      acquisitionStandardPrice: {
        housingPrice: 400_000_000,
        commercialBuildingPrice: 80_000_000,
        landPricePerSqm: landPerSqm,
        ...(landPerSqmAtBuildingAcq !== undefined
          ? { landPricePerSqmAtBuildingAcq: landPerSqmAtBuildingAcq }
          : {}),
      },
      residencePeriodYears: 0,
      isOneHouseExempt: false,
      isMetropolitanArea: true,
      zoneType: "general_residential" as const,
      ...MODE_FLAGS[mode],
    },
  };
}

interface HousingPartEcho {
  estimatedAcquisitionPrice: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  landAppraisalDed: number;
  buildingAppraisalDed: number;
  landStdPriceAtAcq: number;
  buildingStdPriceAtAcq: number;
  incomeAmount: number;
}
interface MixedResult {
  housingPart: HousingPartEcho;
  commercialPart: { incomeAmount: number; landStdPriceAtAcq: number; buildingStdPriceAtAcq: number };
  total: { determinedTax: number; localTax: number; totalPayable: number };
}

async function post(payload: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withIdentityStdInBody(payload)),
    }),
  );
  return { status: res.status, json: (await res.json()) as { data?: { mode: string; result: MixedResult }; error?: unknown } };
}

async function call(payload: unknown): Promise<MixedResult> {
  const { status, json } = await post(payload);
  expect(status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data?.mode).toBe("mixed-use");
  return json.data!.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

// ════════════════════════════════════════════════════════════════
// C — 현행 특성화 (2026-10-06 실측, base 88f7bf67)
// ════════════════════════════════════════════════════════════════
describe("B0 — 건물일 공시지가 = 토지일 값(L1)으로 입력하면 종전 값 그대로 (별개 취득: 토지 2005-06-10 / 건물 2010-03-15)", () => {
  it("C-1 환산 — 건물분 기준시가 280,000,000 = 4억(건물일) − L1(토지일)×100", async () => {
    const r = await call(body("estimated", { landPerSqmAtBuildingAcq: L1 }));
    const h = r.housingPart;
    expect(h.landStdPriceAtAcq).toBe(120_000_000);
    expect(h.buildingStdPriceAtAcq).toBe(280_000_000); // 종전(결함) 값 — L2=L1 입력이면 그대로: 건물일 4억 − 토지일 1.2M×100
    expect(h.estimatedAcquisitionPrice).toBe(413_793_103); // 총액 = 양도가×4억/16억 — B0 비대상
    expect(h.landAcqPrice).toBe(124_137_930); // 비율 120/400 = 0.3
    expect(h.buildingAcqPrice).toBe(289_655_173);
    expect(h.landAppraisalDed).toBe(3_600_000); // 개산공제 3%
    expect(h.buildingAppraisalDed).toBe(8_400_000);
    expect(h.incomeAmount).toBe(862_880_277);
    expect(r.total.determinedTax).toBe(677_954_008);
    expect(r.total.localTax).toBe(67_795_400);
    expect(r.total.totalPayable).toBe(745_749_408);
  });

  it("C-2 실가 — 주택분 취득가액 600,000,000을 0.3 : 0.7로 분할(개산공제 없음)", async () => {
    const r = await call(body("actual", { landPerSqmAtBuildingAcq: L1 }));
    const h = r.housingPart;
    expect(h.buildingStdPriceAtAcq).toBe(280_000_000);
    expect(h.estimatedAcquisitionPrice).toBe(600_000_000); // 안분 400/(400+120+80) — 주택:상가 비율(B1 축)
    expect(h.landAcqPrice).toBe(180_000_000);
    expect(h.buildingAcqPrice).toBe(420_000_000);
    expect(h.landAppraisalDed + h.buildingAppraisalDed).toBe(0);
    expect(h.incomeAmount).toBe(742_965_517);
    expect(r.total.determinedTax).toBe(594_155_689);
    expect(r.total.localTax).toBe(59_415_568);
    expect(r.total.totalPayable).toBe(653_571_257);
  });

  it("C-3 감정·매매사례 — 실가와 같은 분할 + 개산공제 3%(280M 기준)", async () => {
    const r = await call(body("appraisal", { landPerSqmAtBuildingAcq: L1 }));
    const h = r.housingPart;
    expect(h.buildingStdPriceAtAcq).toBe(280_000_000);
    expect(h.landAcqPrice).toBe(180_000_000);
    expect(h.buildingAcqPrice).toBe(420_000_000);
    expect(h.landAppraisalDed).toBe(3_600_000);
    expect(h.buildingAppraisalDed).toBe(8_400_000);
    expect(h.incomeAmount).toBe(740_445_517);
    expect(r.total.determinedTax).toBe(590_807_689);
    expect(r.total.localTax).toBe(59_080_768);
    expect(r.total.totalPayable).toBe(649_888_457);
  });

  it("C-4 반전 — 건물분 기준시가는 건물일 공시지가(신규 칸)에만 종속되고 토지일 공시지가(기존 칸)는 토지분만 움직인다", async () => {
    // 종전: 토지일 공시지가를 1.2M→1.8M로 바꾸면 건물분이 280M→220M로 움직였다(결함 핀).
    // 수정 후: 건물분은 신규 칸(L2)에만 종속 — 토지일 값이 바뀌어도 건물분 220,000,000 고정, 토지분만 변한다.
    const atL1 = await call(body("estimated", { landPerSqm: L1, landPerSqmAtBuildingAcq: L2 }));
    const atL2 = await call(body("estimated", { landPerSqm: L2, landPerSqmAtBuildingAcq: L2 }));
    expect(atL1.housingPart.buildingStdPriceAtAcq).toBe(220_000_000);
    expect(atL2.housingPart.buildingStdPriceAtAcq).toBe(220_000_000); // 불변
    expect(atL1.housingPart.landStdPriceAtAcq).toBe(120_000_000);
    expect(atL2.housingPart.landStdPriceAtAcq).toBe(180_000_000); // 토지분만 토지일 값을 따른다
    // 반대로 건물일 값을 바꾸면 건물분이 움직인다
    const atBuilding = await call(body("estimated", { landPerSqm: L1, landPerSqmAtBuildingAcq: L1 }));
    expect(atBuilding.housingPart.buildingStdPriceAtAcq).toBe(280_000_000);
  });
});

// ════════════════════════════════════════════════════════════════
// C-5~6 — 함께 취득(두 날짜 같음): 수정 후에도 **값이 같아야** 한다
//   · 두 공시지가는 정의상 같은 값(L2)이다. 신규 필드는 보내지 않는다.
//   · 수정 후에도 통과해야 하는 회귀 방어선 — 「함께 취득은 필드 불요」 계약을 고정한다.
// ════════════════════════════════════════════════════════════════
describe("B0 Pre-Do — 함께 취득(토지=건물 2010-03-15)은 불변", () => {
  it("C-5 환산", async () => {
    const r = await call(body("estimated", { landDate: "2010-03-15", landPerSqm: L2 }));
    const h = r.housingPart;
    expect(h.landStdPriceAtAcq).toBe(180_000_000);
    expect(h.buildingStdPriceAtAcq).toBe(220_000_000); // 4억 − 1.8M×100 — 같은 날짜라 정당
    expect(h.landAcqPrice).toBe(186_206_896);
    expect(h.buildingAcqPrice).toBe(227_586_207);
    expect(h.landAppraisalDed + h.buildingAppraisalDed).toBe(12_000_000); // = 4억 × 3% (항등)
    expect(h.incomeAmount).toBe(885_153_104);
    expect(r.commercialPart.incomeAmount).toBe(769_004_691);
    expect(r.total.determinedTax).toBe(677_306_007);
    expect(r.total.totalPayable).toBe(745_036_607);
  });

  it("C-6 실가", async () => {
    const r = await call(body("actual", { landDate: "2010-03-15", landPerSqm: L2 }));
    const h = r.housingPart;
    expect(h.estimatedAcquisitionPrice).toBe(545_454_545);
    expect(h.landAcqPrice).toBe(245_454_545);
    expect(h.buildingAcqPrice).toBe(300_000_000);
    expect(h.incomeAmount).toBe(798_996_866);
    expect(r.total.determinedTax).toBe(612_624_028);
    expect(r.total.totalPayable).toBe(673_886_430);
  });
});

// ════════════════════════════════════════════════════════════════
// S — 수정 후 기대값 (B0 구현 — 엔진 실측으로 확정)
//   신규 필드 후보: acquisitionStandardPrice.landPricePerSqmAtBuildingAcq = L2
//   수정 규칙(최소안 M): 건물분 = 개별주택가격 − L2 × 주택부수토지 / 토지분 = L1 × 주택부수토지(불변)
//   기대값은 위 「손계산」 + 파이썬 재구현(현행 3모드 housingIncome·결정세액이 엔진과 1원 일치 확인 후 적용).
//   ⚠️ 주택:상가 안분 비율(실가·감정)과 상가분 환산은 B0에서 **바꾸지 않는다**(설계서 §4) — 상가 쪽 값은 현행 그대로.
// ════════════════════════════════════════════════════════════════
describe("B0 수정 후 기대값 (건물 취득일 기준 공시지가 L2 입력)", () => {
  // 🔁 환산 분자 정정(2026-10-07): 별개 취득이면 분자도 취득당시 주택가격 P = 4억 × (1.2억+2.2억)/(1.8억+2.2억) = 3.4억
  //    (집행기준 99-164-9 — 분할 기준(토지분·건물분 합)과 같은 값). 종전 분자 4억(건물일 개별주택가격)은 분할 합 3.4억과 어긋났다.
  it("S-1 환산 — 건물분 220,000,000 · 개산공제 3,600,000 + 6,600,000 · 환산 분자 = 취득당시 주택가격 340,000,000", async () => {
    const r = await call(body("estimated", { landPerSqmAtBuildingAcq: L2 }));
    const h = r.housingPart;
    expect(h.landStdPriceAtAcq).toBe(120_000_000);
    expect(h.buildingStdPriceAtAcq).toBe(220_000_000); // 4억 − 1.8M×100
    expect(h.estimatedAcquisitionPrice).toBe(351_724_137); // floor(주택 양도가 1,655,172,413 × 3.4억/16억)
    expect(h.landAcqPrice).toBe(124_137_930); // floor(351,724,137 × 120/340)
    expect(h.buildingAcqPrice).toBe(227_586_207);
    expect(h.landAppraisalDed).toBe(3_600_000);
    expect(h.buildingAppraisalDed).toBe(6_600_000); // 개산공제 합계 −1,800,000 (= 3% × (L2−L1)×100)
    expect(h.incomeAmount).toBe(908_865_932);
    expect(r.commercialPart.incomeAmount).toBe(792_717_519); // 상가분 불변
    expect(r.total.determinedTax).toBe(698_647_552); // 분자 4억 시절 678,734,368
    expect(r.total.localTax).toBe(69_864_755);
    expect(r.total.totalPayable).toBe(768_512_307);
  });

  it("S-2 실가 — 분할 비율 120/340 · 결정세액 −1,725,151", async () => {
    const r = await call(body("actual", { landPerSqmAtBuildingAcq: L2 }));
    const h = r.housingPart;
    expect(h.buildingStdPriceAtAcq).toBe(220_000_000);
    expect(h.estimatedAcquisitionPrice).toBe(600_000_000); // 불변(안분 비율은 B0 비대상)
    expect(h.landAcqPrice).toBe(211_764_705); // floor(600,000,000 × 120/340)
    expect(h.buildingAcqPrice).toBe(388_235_295);
    expect(h.incomeAmount).toBe(739_131_846);
    expect(r.total.determinedTax).toBe(592_430_538); // 현행 594,155,689 대비 −1,725,151
    expect(r.total.localTax).toBe(59_243_053);
    expect(r.total.totalPayable).toBe(651_673_591); // −1,897,666
  });

  it("S-3 감정·매매사례 — 분할 120/340 + 개산공제 6,600,000 · 결정세액 −3,863,551", async () => {
    const r = await call(body("appraisal", { landPerSqmAtBuildingAcq: L2 }));
    const h = r.housingPart;
    expect(h.buildingStdPriceAtAcq).toBe(220_000_000);
    expect(h.landAcqPrice).toBe(211_764_705);
    expect(h.buildingAcqPrice).toBe(388_235_295);
    expect(h.landAppraisalDed).toBe(3_600_000);
    expect(h.buildingAppraisalDed).toBe(6_600_000);
    expect(h.incomeAmount).toBe(731_859_846);
    expect(r.total.determinedTax).toBe(586_944_138); // 현행 590,807,689 대비 −3,863,551
    expect(r.total.localTax).toBe(58_694_413);
    expect(r.total.totalPayable).toBe(645_638_551); // −4,249,906
  });

  it("S-4 별개 취득 + 신규 필드 미입력 → 차단 (토지일 값으로 대체 금지)", async () => {
    const { status, json } = await post(body("estimated")); // 날짜 상이 · landPricePerSqmAtBuildingAcq 없음
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain("landPricePerSqmAtBuildingAcq");
  });
});

// ════════════════════════════════════════════════════════════════
// R — ⑫ refine 격자 (필수 술어와 같은 leaf `isBuildingDayLandPriceRequired`)
// ════════════════════════════════════════════════════════════════
type MutableBody = ReturnType<typeof body> & { mixedUse: Record<string, unknown> & { transferStandardPrice: Record<string, unknown> } };
function mutated(mode: Mode, opts: Parameters<typeof body>[1], mut: (b: MutableBody) => void) {
  const b = body(mode, opts) as MutableBody;
  mut(b);
  return b;
}

describe("B0 ⑫ refine 격자", () => {
  it("R-1 필수인데 0 → 400 (미입력과 같은 차단 — 토지일 값으로 대체 안 함)", async () => {
    const { status, json } = await post(body("estimated", { landPerSqmAtBuildingAcq: 0 }));
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain("landPricePerSqmAtBuildingAcq");
  });

  it("R-2 함께 취득(날짜 같음)이면 신규 값이 와도 무시 — 값 없을 때와 결과 동일", async () => {
    const a = await call(body("estimated", { landDate: "2010-03-15", landPerSqm: L2 }));
    const b = await call(body("estimated", { landDate: "2010-03-15", landPerSqm: L2, landPerSqmAtBuildingAcq: 9_999_999 }));
    expect(b).toEqual(a);
    expect(b.housingPart.buildingStdPriceAtAcq).toBe(220_000_000);
  });

  it("R-3 용도변경 상가→주택은 필수 아님 — 미입력 200", async () => {
    const { status } = await post(
      mutated("estimated", {}, (b) => {
        b.mixedUse.partialUsageChange = { direction: "commercial_to_house" };
      }),
    );
    expect(status).toBe(200);
  });

  it("R-4 용도변경 주택→상가는 필수 유지 — 미입력 400", async () => {
    const { status, json } = await post(
      mutated("estimated", {}, (b) => {
        b.mixedUse.partialUsageChange = { direction: "house_to_commercial" };
      }),
    );
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain("landPricePerSqmAtBuildingAcq");
  });

  it("R-5 양도측 스키마에는 신규 필드가 없다 — 양도시 객체에 실어도 strip되어 결과 불변", async () => {
    const base = await call(body("estimated", { landPerSqmAtBuildingAcq: L2 }));
    const withTransferField = await call(
      mutated("estimated", { landPerSqmAtBuildingAcq: L2 }, (b) => {
        b.mixedUse.transferStandardPrice.landPricePerSqmAtBuildingAcq = 1;
      }),
    );
    expect(withTransferField).toEqual(base);
  });
});
