/**
 * Pre-Do anchor: D1-4 「1990.8.30. 전 상속·증여 토지 파트 — §163⑨ 단서 1호 max(평가액, §164④)」 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1-4.engine.design.md
 * 계획: docs/00-pm/transfer-acq-cause-mixed.plan.md §10.1 U-1(후속 D1-4) · §10.2 T-6
 *
 * 구성 (D1-4a 구현 후 — Pre-Do RED 기준 A군은 「② 미입력 차단」으로 전환, D군 todo는 활성)
 *   A. 변경 전 RED 기준 → ② 없음 차단(⑫ 400 · ⑧ 메시지 · 경계). 전환 줄마다 법령 정합 근거를 남겼다.
 *   B. 변경 후 기대 세액의 **손계산 검증**(활성) — 엔진은 D1-4에서 취득가액 입력만 바꾸므로, 같은 값을
 *      1991년(차단 밖) 날짜로 보내 엔진 산식이 손계산과 일치함을 지금 실측한다. 장특이 15년+ 포화(30%)라
 *      1988년이든 1991년이든 세액이 같다(C-3이 그 전제를 잠근다).
 *   C. §164④ ② 파생값 손계산(활성) — `calculatePre1990LandValuation` 직접.
 *   D. 구현 PR에서 활성화할 todo.
 *
 * 공통 시드(d1.predo와 동일): 주택, 양도 12억(토지 7억/건물 5억), 양도일 2026-06-30, 별개 취득,
 * 건물 2018-03-02 매매 4억(8년 16%), 토지는 파트 실가(상속·증여).
 * 손계산 규약: 토지 양도차익 = 7억 − 취득가, 장특 30%. 건물 양도차익 1억·장특 16,000,000. 기본공제 250만.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { validateLandPartCause } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 1_200_000_000,
  transferDate: "2026-06-30",
  acquisitionDate: "2018-03-02",
  landAcquisitionDate: "2008-05-10",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 500_000_000,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 500_000_000,
  landAcquisitionPrice: 300_000_000,
  buildingAcquisitionPrice: 400_000_000,
  acquisitionCause: "purchase",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(over: Record<string, unknown>): Promise<{ status: number; body: any; r: any }> {
  const merged: Record<string, unknown> = { ...BASE, ...over };
  for (const k of Object.keys(merged)) if (merged[k] === "__DEL__") delete merged[k];
  const res = await POST(req(merged));
  const body = await res.json();
  return { status: res.status, body, r: body?.data?.result };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messages = (body: any): string => JSON.stringify(body.error ?? body);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const INH = (date: string, price: number) => ({
  landAcquisitionDate: date,
  landAcquisitionCause: "inheritance",
  landDecedentAcquisitionDate: "1960-01-01",
  landAcquisitionPrice: price,
});
const GIFT = (date: string, price: number) => ({
  landAcquisitionDate: date,
  landAcquisitionCause: "gift",
  landAcquisitionPrice: price,
});

// ───────────────────────────────────────────────────────────────────────────
// A. 변경 전 RED 기준 — D1-4 구현이 뒤집는다 (R-Q7 「무조건 차단」 → 「②(§164④ 가액) 미입력 차단」)
// ───────────────────────────────────────────────────────────────────────────
describe("A. 현행 차단 기준 (D1-4 구현이 ② 입력 유무로 바꾼다)", () => {
  it("A-1 [전환 D1-4a] ⑫: 1984·1988 상속 / 1984 증여 토지 + ② 없음 → 400, field landSec164Value — 영 §163⑨ 단서 1호는 평가액과 §164④ 가액 중 많은 금액이라 비교할 ②가 없을 때만 막는다(종전: 전부 차단)", async () => {
    for (const over of [INH("1984-05-01", 300_000_000), INH("1988-05-01", 300_000_000), GIFT("1984-05-01", 300_000_000)]) {
      const { status, body } = await post(over);
      expect(status).toBe(400);
      expect(messages(body)).toContain("1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지");
      expect(messages(body)).toContain("landSec164Value");
    }
  });

  it("A-2 경계(현행): 1990-08-29 상속 400 · 1990-08-30 당일 200 — D1-4 후에도 1990-08-30은 ② 없이 200(단서 밖)", async () => {
    expect((await post(INH("1990-08-29", 300_000_000))).status).toBe(400);
    expect((await post(INH("1990-08-30", 300_000_000))).status).toBe(200);
  });

  it("A-3 [전환 D1-4a] ⑫ 스키마 직접: ② 없는 요청은 landSec164Value 경로로 실패 · ② 있으면 통과", () => {
    const r = propertySchema.safeParse({ ...BASE, ...INH("1988-05-01", 300_000_000) });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("landSec164Value");
    expect(propertySchema.safeParse({ ...BASE, ...INH("1988-05-01", 300_000_000), landSec164Value: 350_000_000 }).success).toBe(true);
  });

  it("A-4 ⑧ 직접(D1-4a: 화면에 ② 입력 칸이 없어 5칸이 차 있어도 계속 막는다 — 메시지는 화면 사실)", () => {
    for (const host of ["newConstruction", "purchase"] as const) {
      const asset = {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: host,
        acquisitionDate: "2018-03-02",
        landAcquisitionDate: "1988-05-01",
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionCause: "inheritance",
        landCauseHost: host,
        landDecedentAcquisitionDate: "1960-01-01",
        landAcqMode: "actual",
      } as AssetForm;
      const msg = validateLandPartCause(asset, "x");
      expect(msg).toContain("1990.8.30.");
      expect(msg).toContain("이 계산기 화면은");
      // 5칸을 채워도(②가 파생 가능해도) D1-4a ⑧은 풀지 않는다 — 입력 칸이 D1-4b에 생긴다
      const filled = { ...asset, acquisitionArea: "100", pre1990GradeMode: "value", pre1990Grade_current: "50000", pre1990Grade_prev: "40000", pre1990Grade_atAcq: "22500", pre1990PricePerSqm_1990: "7000000" } as AssetForm;
      expect(validateLandPartCause(filled, "x")).toContain("이 계산기 화면은");
    }
  });

  it("A-5 단서 밖 긍정 짝: 1991 상속 200 · 1988 매매 토지 200(상속·증여만 대상)", async () => {
    expect((await post(INH("1991-05-01", 300_000_000))).status).toBe(200);
    expect((await post({ landAcquisitionDate: "1988-05-01" })).status).toBe(200);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// B. 변경 후 기대 세액 손계산 — 1991 날짜로 엔진 산식을 지금 검증(장특 30% 포화 → 날짜 무관)
// ───────────────────────────────────────────────────────────────────────────
describe("B. max(①평가액, ②§164④) 채택 후 기대 세액 (엔진 산식 실측 — D1-4 구현이 같은 값을 1988·1984 날짜로 내야 한다)", () => {
  // ② = 350,000,000 (C-1). 아래 취득가는 max(①,②)의 결과다.
  it("B-1 ② 채택(① 3억 < ② 3.5억 → 3.5억): 토지 차익 3.5억·장특 30% 1.05억 + 건물 1억·1,600만 → 소득 3.29억 −250만 = 326,500,000 × 40% − 25,940,000 = 104,660,000", async () => {
    const { status, r } = await post(INH("1991-05-01", 350_000_000));
    expect(status).toBe(200);
    expect(r.taxBase).toBe(326_500_000);
    expect(r.determinedTax).toBe(104_660_000);
    expect(r.splitDetail.land.acquisitionPrice).toBe(350_000_000);
  });

  it("B-2 ① 채택(① 4억 > ② 3.5억 → 4억): 토지 차익 3억·장특 9천만 + 건물 1,600만 → 소득 2.94억 −250만 = 291,500,000 × 38% − 19,940,000 = 90,830,000", async () => {
    const { r } = await post(INH("1991-05-01", 400_000_000));
    expect(r.taxBase).toBe(291_500_000);
    expect(r.determinedTax).toBe(90_830_000);
  });

  it("B-3 동점(① = ② = 3.5억)은 B-1과 같은 세액 — 채택 표기는 「평가액」(일반건물 `calcPostDeemed` 규약)", async () => {
    const { r } = await post(INH("1991-05-01", 350_000_000));
    expect(r.determinedTax).toBe(104_660_000);
  });

  it("B-4 증여도 같은 단서(「상속 또는 증여받은 토지」) — 증여 토지 3.5억 → 104,660,000 (주택은 토지 세율 기산이 max(증여일, 건물일)=2018 → 기본세율)", async () => {
    const { r } = await post(GIFT("1991-05-01", 350_000_000));
    expect(r.determinedTax).toBe(104_660_000);
  });

  it("B-5 개산공제는 0으로 유지 — ②도 「실지거래가액으로 본다」(영 §163⑨ 가목 의제)", async () => {
    const { r } = await post(INH("1991-05-01", 350_000_000));
    expect(r.splitDetail.land.appraisalDeduction).toBe(0);
    expect(r.splitDetail.land.acqMode).toBe("actual");
  });

  it("B-6 장특 포화 전제(C-3): 상속개시일 1991 vs 1995 → 둘 다 15년+ 30% 이므로 세액 동일 — 1984·1988에도 날짜가 세액을 가르지 않는다", async () => {
    const a = await post(INH("1991-05-01", 350_000_000));
    const b = await post(INH("1995-05-01", 350_000_000));
    expect(a.r.splitDetail.land.longTermRate).toBe(0.3);
    expect(b.r.splitDetail.land.longTermRate).toBe(0.3);
    expect(a.r.determinedTax).toBe(b.r.determinedTax);
  });

  it("B-7 현행(= 구현 전 평가액만) 값과의 차이 — 평가액 3억만 쓰면 118,660,000 이라 14,000,000 과대(②를 반영해야 하는 이유)", async () => {
    const { r } = await post(INH("1991-05-01", 300_000_000));
    expect(r.determinedTax).toBe(118_660_000);
    expect(118_660_000 - 104_660_000).toBe(14_000_000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// C. § 164④ ② 파생 손계산
// ───────────────────────────────────────────────────────────────────────────
describe("C. §164④ 취득당시 기준시가 ② 손계산 (등급가액 직접입력 모드)", () => {
  const input = {
    acquisitionDate: new Date("1988-05-01"),
    transferDate: new Date("2026-06-30"),
    areaSqm: 100,
    pricePerSqm_1990: 7_000_000,
    pricePerSqm_atTransfer: 7_000_000,
    grade_1990_0830: { gradeValue: 50_000 },
    gradePrev_1990_0830: { gradeValue: 40_000 },
    gradeAtAcquisition: { gradeValue: 22_500 },
  };

  it("C-1 분모 = (5만+4만)/2 = 4.5만(현재 5만 이하라 상한 미발동), 비율 = 2.25만/4.5만 = 0.5 → ㎡당 3,500,000 × 100㎡ = 350,000,000", () => {
    const r = calculatePre1990LandValuation(input);
    expect(r.pricePerSqmAtAcquisition).toBe(3_500_000);
    expect(r.standardPriceAtAcquisition).toBe(350_000_000);
  });

  it("C-2 1984년 취득이어도 산식 동일(날짜는 CAP-2 트리거 1990-01-01 이후만 가른다) — 1985 전 상속의 ② 산식 = 1985~1990 사이와 같다", () => {
    const a = calculatePre1990LandValuation({ ...input, acquisitionDate: new Date("1984-05-01") });
    const b = calculatePre1990LandValuation(input);
    expect(a.standardPriceAtAcquisition).toBe(b.standardPriceAtAcquisition);
  });

  it("C-3 CAP-2 경계: 1990-01-01 이후 취득이면 비율 1.0 상한이 걸린다(1989-12-31은 안 걸림) — 1990.1.1~8.29 구간 ② 입력이 게이트와 같은 날짜를 받아야 하는 이유", () => {
    const hi = { ...input, gradeAtAcquisition: { gradeValue: 90_000 } }; // 비율 2.0
    const before = calculatePre1990LandValuation({ ...hi, acquisitionDate: new Date("1989-12-31") });
    const after = calculatePre1990LandValuation({ ...hi, acquisitionDate: new Date("1990-01-01") });
    expect(before.breakdown.ratioCap2Applied).toBe(false);
    expect(after.breakdown.ratioCap2Applied).toBe(true);
    expect(after.standardPriceAtAcquisition).toBeLessThan(before.standardPriceAtAcquisition);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// D. 구현 PR에서 활성화 (설계 문서 §9 「전환」·「신규」와 1:1)
// ───────────────────────────────────────────────────────────────────────────
// 엔진 직접·leaf·컴패니언 ⑫는 `__tests__/tax-engine/transfer/split-part-cause.d1.test.ts`가 층별로 따로 잠근다(겹친 방어가 mutation에서 서로를 가린다).
describe("D. D1-4a 구현 기대값 (Pre-Do todo → 활성)", () => {
  const SEC = (date: string, reported: number, sec164: number) => ({ ...INH(date, reported), landSec164Value: sec164 });

  it("D-1 ⑫: 1988 상속 + ② 3.5억 + 평가액 3억 → 200 · 104,660,000 · 토지 취득가 3.5억 · adopted=sec164 (B-1과 같은 값)", async () => {
    const { status, r } = await post(SEC("1988-05-01", 300_000_000, 350_000_000));
    expect(status).toBe(200);
    expect(r.determinedTax).toBe(104_660_000);
    expect(r.splitDetail.land.acquisitionPrice).toBe(350_000_000);
    expect(r.splitDetail.land.acquisitionBasis).toEqual({ rule: "sec163_9_1", reported: 300_000_000, sec164: 350_000_000, adopted: "sec164" });
    expect(r.splitDetail.land.appraisalDeduction).toBe(0);
    expect(r.splitDetail.building.acquisitionBasis).toBeUndefined();
  });

  it("D-2 평가액 4억 > ② 3.5억 → 90,830,000 · adopted=reported (B-2)", async () => {
    const { r } = await post(SEC("1988-05-01", 400_000_000, 350_000_000));
    expect(r.determinedTax).toBe(90_830_000);
    expect(r.splitDetail.land.acquisitionBasis.adopted).toBe("reported");
  });

  it("D-3 동점 → adopted=reported, 세액은 D-1과 같다 (B-3)", async () => {
    const { r } = await post(SEC("1988-05-01", 350_000_000, 350_000_000));
    expect(r.determinedTax).toBe(104_660_000);
    expect(r.splitDetail.land.acquisitionBasis.adopted).toBe("reported");
  });

  it("D-4 증여 · 1985.1.1. 전(1984)·후(1988) 모두 같은 값 (영 §163⑨ 본문·단서 1호에 의제취득일 조건 없음 — 가목이 정본)", async () => {
    const g84 = await post({ ...GIFT("1984-05-01", 300_000_000), landSec164Value: 350_000_000 });
    const g88 = await post({ ...GIFT("1988-05-01", 300_000_000), landSec164Value: 350_000_000 });
    const i84 = await post(SEC("1984-05-01", 300_000_000, 350_000_000));
    for (const x of [g84, g88, i84]) expect(x.r.determinedTax).toBe(104_660_000);
    // 보유연수 표기는 원 날짜(엔진은 의제취득일 클램프 없음) — 세액은 장특 30% 포화로 동일
    expect(g84.r.splitDetail.land.holdingYears).toBeGreaterThan(g88.r.splitDetail.land.holdingYears);
    expect(g84.r.splitDetail.land.longTermRate).toBe(0.3);
    expect(g88.r.splitDetail.land.longTermRate).toBe(0.3);
  });

  it("D-5 ② 없음/0 → 400 · 1990-08-30 당일은 ② 없이 200 · 부정수는 스키마가 막는다", async () => {
    expect((await post(INH("1988-05-01", 300_000_000))).status).toBe(400);
    expect((await post({ ...INH("1988-05-01", 300_000_000), landSec164Value: 0 })).status).toBe(400);
    expect((await post({ ...INH("1988-05-01", 300_000_000), landSec164Value: -5 })).status).toBe(400);
    expect((await post(INH("1990-08-30", 300_000_000))).status).toBe(200);
  });

  it("D-6 단서 밖(1991)에서 ②를 보내도 비교하지 않는다 — 평가액만 채택, echo 없음", async () => {
    const { status, r } = await post({ ...INH("1991-05-01", 300_000_000), landSec164Value: 900_000_000 });
    expect(status).toBe(200);
    expect(r.determinedTax).toBe(118_660_000);
    expect(r.splitDetail.land.acquisitionPrice).toBe(300_000_000);
    expect(r.splitDetail.land.acquisitionBasis).toBeUndefined();
  });

  it("D14-5 일부 양도 사실 + 단서 구간 → 400(isPartialAreaTransfer 경로), ② 있어도. 구간 밖이면 무영향", async () => {
    const a = await post({ ...SEC("1988-05-01", 300_000_000, 350_000_000), isPartialAreaTransfer: true });
    expect(a.status).toBe(400);
    expect(messages(a.body)).toContain("일부만 양도");
    expect((await post({ ...INH("1991-05-01", 300_000_000), isPartialAreaTransfer: true })).status).toBe(200);
  });

  it("D-8 ⑧ ↔ ⑫ 격자 (D1-4a: ⑧은 ② 입력 칸이 없어 단서 구간을 모두 막는다 = ⑧ ⊇ ⑫) — 호스트 2 × 원인 2 × 토지일 4 × ② {없음, 있음}", () => {
    const hosts = ["newConstruction", "purchase"] as const;
    const causes = ["inheritance", "gift"] as const;
    const dates = ["1984-05-01", "1990-08-29", "1990-08-30", "1991-05-01"] as const;
    let cells = 0;
    for (const host of hosts)
      for (const cause of causes)
        for (const date of dates)
          for (const hasSec of [false, true]) {
            const body = {
              ...BASE,
              acquisitionCause: host,
              landAcquisitionDate: date,
              landAcquisitionCause: cause,
              ...(cause === "inheritance" ? { landDecedentAcquisitionDate: "1960-01-01" } : {}),
              ...(hasSec ? { landSec164Value: 350_000_000 } : {}),
            };
            const r = propertySchema.safeParse(body);
            const twelve = r.success ? [] : r.error.issues.map((i) => i.path.join(".")).filter((k) => k === "landSec164Value");
            const proviso = date < "1990-08-30";
            // ⑫ = 단서 구간 ∧ ② 없음
            expect(twelve.length > 0, `⑫ ${host}/${cause}/${date}/②${hasSec}`).toBe(proviso && !hasSec);
            // ⑧ (D1-4a) = 단서 구간이면 ②와 무관하게 막는다
            const asset = {
              ...makeDefaultAsset(1),
              assetKind: "housing",
              acquisitionCause: host,
              acquisitionDate: "2018-03-02",
              landAcquisitionDate: date,
              hasSeperateLandAcquisitionDate: true,
              landAcquisitionCause: cause,
              landCauseHost: host,
              landDecedentAcquisitionDate: cause === "inheritance" ? "1960-01-01" : "",
              landAcqMode: "actual",
            } as AssetForm;
            const eight = !!validateLandPartCause(asset, "x");
            expect(eight, `⑧ ${host}/${cause}/${date}`).toBe(proviso);
            // 막다른 길 금지: ⑫가 막으면 ⑧도 막는다(⑧ 통과 ↔ ⑫ 400 셀 없음)
            if (twelve.length > 0) expect(eight).toBe(true);
            cells++;
          }
    expect(cells).toBe(32);
  });

  it.todo("D1-4b: summarizeSplitGain 통과 + 4뷰(결과 카드·명세서·신고서·PDF) 「취득가액 산정」 행");
  it.todo("D1-4b: ⑧ 완화 — ②가 파생되면 통과, 5칸 부분입력은 첫 미완 칸으로 이동(⑧ ≡ ⑫ 정확 일치 격자)");
});
