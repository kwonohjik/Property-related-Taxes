/**
 * Pre-Do anchor: 「토지 상속·증여 + 건물 매매」(Phase D1) — **현행 동작 고정** (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1.engine.design.md §1·§3·§4·§5·§6
 * 계획: docs/00-pm/transfer-acq-cause-mixed.plan.md §4 D1
 *
 * 이 파일의 **활성 테스트는 변경 전 실측값**이다. D1 구현이 의도적으로 바꾸는 값은 `it.skip`·`it.todo`로 따로 적었다.
 * 활성 테스트가 구현 후 깨지면 (a) 의도한 전환이면 해당 줄을 400 기대로 뒤집고 근거를 남기고,
 * (b) 아니면 회귀다. 뒤집는 줄은 설계 문서 §9의 「전환」 표시와 1:1이다.
 *
 * 공통 시드: 주택, 양도 12억(토지 7억/건물 5억), 양도일 2026-06-30, 별개 취득, 파트 실가(토지 3억·건물 4억), 비과세 아님.
 * 손계산 규약(이 파일 전체): 양도차익 = 토지 4억 + 건물 1억. 장특은 파트별(일반 연 2%·최대 30%, 3년 미만 0).
 * 기본공제 250만원. 산출세액 = 과세표준 × 세율 − 누진공제 (8단계 DB 세율, 40%대 구간 누진공제 25,940,000).
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

/** 건물 2018-03-02 매매 + 토지 2022-01-10 상속(피상속인 2005-01-01). */
const D1_INH = {
  acquisitionCause: "purchase",
  landAcquisitionDate: "2022-01-10",
  landAcquisitionCause: "inheritance",
  landDecedentAcquisitionDate: "2005-01-01",
};

describe("D1-1 엔진은 이 조합을 이미 처리한다 (계획서 「T2·W1 실측」 재확인)", () => {
  it("D1-0 기준: 매매/매매(토지 2008-05-10·건물 2018-03-02) = 118,660,000 — 시드 손계산", async () => {
    // 토지 18년 30% → 120,000,000 · 건물 8년 16% → 16,000,000 · 소득 5억−1.36억=3.64억 −250만 = 361,500,000
    // × 40% − 25,940,000 = 118,660,000
    const { status, r } = await post({});
    expect(status).toBe(200);
    expect(r.determinedTax).toBe(118_660_000);
  });

  it("D1-1 토지 상속(개시 2022-01-10) + 건물 매매 2018 = 153,860,000 — 장특은 상속개시일부터(§95④: 토지 4년 8%), 건물 8년 16%", async () => {
    // 토지 4억×8% = 32,000,000 · 건물 1억×16% = 16,000,000 → 소득 5억−4,800만 = 452,000,000 −250만 = 449,500,000
    // × 40% − 25,940,000 = 153,860,000  (세율은 두 파트 모두 2년 이상 → 기본세율)
    const { status, r } = await post(D1_INH);
    expect(status).toBe(200);
    expect(r.determinedTax).toBe(153_860_000);
    expect(r.taxBase).toBe(449_500_000);
    expect(r.splitDetail.land.holdingYears).toBe(4);
    expect(r.splitDetail.land.longTermRate).toBe(0.08);
    expect(r.splitDetail.land.longTermDeduction).toBe(32_000_000);
    expect(r.splitDetail.building.holdingYears).toBe(8);
    expect(r.splitDetail.building.longTermDeduction).toBe(16_000_000);
    expect(r.splitDetail.land.acqMode).toBe("actual");
    // 상속 파트는 실가 취급 — 개산공제 0
    expect(r.splitDetail.land.appraisalDeduction).toBe(0);
  });

  it("D1-1′ 건물 acquisitionCause 명시 'purchase' = 미지정 — 같은 결과 (모델 컨벤션 Q-2)", async () => {
    const a = await post(D1_INH);
    const b = await post({ ...D1_INH, acquisitionCause: "__DEL__" });
    expect(b.r.determinedTax).toBe(a.r.determinedTax);
  });

  it("D1-1″ 단순 증여(gift)도 같은 금액 — 두 파트 모두 2년 이상이라 통산 유무가 세액에 안 닿는다", async () => {
    const { r } = await post({ ...D1_INH, landAcquisitionCause: "gift", landDecedentAcquisitionDate: "__DEL__" });
    expect(r.determinedTax).toBe(153_860_000);
  });
});

describe("D1-2 세율 기산 — §104②1호 피상속인 통산 / 단순 증여 무통산 (주택: 토지 기산일 = max(법정 기산일, 건물 취득일))", () => {
  const SHORT = { acquisitionCause: "purchase", landAcquisitionDate: "2025-02-01" }; // 토지 보유 1년 5개월

  it("D1-2a 상속(피상속인 2000) → 통산으로 max(2000, 건물 2018)=2018 → 기본세율: 166,660,000", async () => {
    // 소득 5억−건물장특 1,600만(토지 1년 0) = 484,000,000 −250만 = 481,500,000 × 40% − 25,940,000 = 166,660,000
    const { r } = await post({ ...SHORT, landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2000-01-01" });
    expect(r.determinedTax).toBe(166_660_000);
    expect(r.appliedRate).toBe(0.4);
  });

  it("D1-2b 단순 증여 → 통산 없음: 토지 1년 5개월 → 주택 60%. 파트별 비교과세(§104⑤) 252,900,000", async () => {
    // 자산별: 토지 4억−250만(고세율 파트에 배분)=397.5M × 60% = 238,500,000 + 건물 84M×24%−5,760,000 = 14,400,000 → 252,900,000
    // 합산 누진 166,660,000 < 252,900,000 → 큰 쪽
    const { r } = await post({ ...SHORT, landAcquisitionCause: "gift" });
    expect(r.determinedTax).toBe(252_900_000);
    expect(r.appliedRate).toBe(0.6);
  });

  it("D1-2c 원인 미지정(= 건물 원인 매매를 따름)은 증여와 같다", async () => {
    const { r } = await post(SHORT);
    expect(r.determinedTax).toBe(252_900_000);
  });

  it("D1-2d 피상속인 취득일이 토지 상속일보다 늦어 2년 미만이면 통산해도 단기 — 252,900,000", async () => {
    const { r } = await post({ ...SHORT, landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2025-01-01" });
    expect(r.determinedTax).toBe(252_900_000);
  });
});

describe("D1-3 V-7 assetKind building(propertyType building) — 주택 max 규칙이 없다(파트별 세율)", () => {
  const SHORT_B = { propertyType: "building", acquisitionCause: "purchase", landAcquisitionDate: "2025-02-01" };

  it("D1-3a 상속 통산: 토지 기본세율·건물 기본세율 → 166,660,000 (주택과 같은 값)", async () => {
    const { status, r } = await post({ ...SHORT_B, landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2000-01-01" });
    expect(status).toBe(200);
    expect(r.determinedTax).toBe(166_660_000);
  });

  it("D1-3b 단순 증여: 비주택 1~2년 40% — 173,400,000 (주택 60%=252,900,000과 다르다)", async () => {
    // 자산별: 토지 397.5M×40% = 159,000,000 + 건물 14,400,000 = 173,400,000 > 합산 누진 166,660,000
    const { r } = await post({ ...SHORT_B, landAcquisitionCause: "gift" });
    expect(r.determinedTax).toBe(173_400_000);
  });

  it("D1-3c 원인 미지정 = 증여와 같다", async () => {
    const { r } = await post(SHORT_B);
    expect(r.determinedTax).toBe(173_400_000);
  });
});

describe("D1-4 Q-4 같은 날 + 원인 다름 — 엔진에는 영향이 없다", () => {
  const SAME = { acquisitionCause: "purchase", acquisitionDate: "2025-02-01", landAcquisitionDate: "2025-02-01" };
  const CAUSE = { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2000-01-01" };

  it("D1-4a 같은 날 토지 상속(피상속인 2000) = 원인 없음 — 298,500,000·60%. 주택 max 규칙(건물 취득일과 같은 날)이 통산을 무효로 만든다", async () => {
    // 양쪽 1년 5개월 → 장특 0 · 5억−250만 = 497,500,000 × 60% = 298,500,000
    const a = await post({ ...SAME, ...CAUSE });
    const b = await post(SAME);
    expect(a.status).toBe(200);
    expect(a.r.determinedTax).toBe(298_500_000);
    expect(b.r.determinedTax).toBe(298_500_000);
    expect(a.r.appliedRate).toBe(0.6);
  });

  it("D1-4b [전환 D1-1 · G-12] 토지 상속 지정 + 토지 취득일 없음 → 400(landAcquisitionDate) — 종전 200·splitDetail 없음(토지 파트 침묵 탈락)", async () => {
    const body = {
      acquisitionCause: "purchase",
      landAcquisitionDate: "__DEL__",
      isSeparateAcquisition: "__DEL__",
      acquisitionPrice: 700_000_000,
      landAcquisitionPrice: "__DEL__",
      buildingAcquisitionPrice: "__DEL__",
      landAcqMode: "__DEL__",
      buildingAcqMode: "__DEL__",
      saleSplitMode: "__DEL__",
    };
    const a = await post({ ...body, ...CAUSE });
    const b = await post(body);
    expect(a.status).toBe(400);
    expect(messages(a.body)).toContain("토지 상속개시일(증여일)이 필요합니다");
    expect(b.status).toBe(200); // 긍정 짝: 원인이 없으면 총액 모델 그대로
  });
});

describe("D1-5 Q-7 §163⑨ 단서 1호(1990.8.30. 전 상속·증여 토지) — 현행은 평가액 1칸을 그대로 쓴다", () => {
  it("D1-5a [전환 D1-1 · Q-7 A] 1984 상속·1988 상속·1984 증여 토지 → 400 — 종전 200·평가액 3억 그대로(§163⑨ 단서 1호 max 비교 없음)", async () => {
    // 사용자 결정 U-1(계획서 §10): 토지 취득일 < 1990-08-30 인 상속·증여 토지 파트 차단.
    for (const over of [
      { landAcquisitionDate: "1984-05-01", landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1960-01-01" },
      { landAcquisitionDate: "1988-05-01", landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1960-01-01" },
      { landAcquisitionDate: "1984-05-01", landAcquisitionCause: "gift" },
    ]) {
      const { status, body } = await post({ acquisitionCause: "purchase", ...over });
      expect(status).toBe(400);
      expect(messages(body)).toContain("1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지");
    }
  });

  it("D1-5a′ 경계: 1990-08-29 상속 400 · 1990-08-30 당일 200(「고시되기 전」이 아니다)", async () => {
    const at = (d: string) => post({ acquisitionCause: "purchase", landAcquisitionDate: d, landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1960-01-01" });
    expect((await at("1990-08-29")).status).toBe(400);
    expect((await at("1990-08-30")).status).toBe(200);
  });

  it("D1-5a″ 1984 매매 토지는 단서 밖(상속·증여만) — 200", async () => {
    const { status } = await post({ acquisitionCause: "purchase", landAcquisitionDate: "1984-05-01" });
    expect(status).toBe(200);
  });

  it("D1-5b 1991 상속은 단서 밖 — 200 유지(전환 후에도 200이어야 하는 긍정 짝)", async () => {
    const { status } = await post({
      acquisitionCause: "purchase",
      landAcquisitionDate: "1991-05-01",
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "1960-01-01",
    });
    expect(status).toBe(200);
  });

  it("D1-5c 1984 상속 토지 + 환산은 이미 400(D0 G-2) — 일반건물과 같은 「가목 정본」", async () => {
    const { status } = await post({
      acquisitionCause: "purchase",
      landAcquisitionDate: "1984-05-01",
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "1960-01-01",
      landAcqMode: "estimated",
      landAcquisitionPrice: "__DEL__",
      standardPricePerSqmAtAcquisition: 500_000,
      acquisitionArea: 200,
    });
    expect(status).toBe(400);
  });
});

describe("D1-6 결합 제외 — 현행 실측 (설계 §3 표)", () => {
  const OH = {
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 96,
    acquisitionCause: "purchase",
    landAcquisitionDate: "2025-02-01",
  };
  const CAUSE = { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2000-01-01" };

  it("D1-6a 기준: 1세대1주택(건물 8년 거주) + 토지 2025-02 상속 — 건물분 비과세·토지분 과세 133,060,000 / 원인 없으면 238,500,000 (W1)", async () => {
    // 토지분 4억(장특 0) −250만 = 397.5M. 상속 통산 → max(2000,2018) 기본세율 40%: 159,000,000−25,940,000 = 133,060,000
    // 통산 없음 → 토지 1년 5개월 주택 60%: 238,500,000
    const a = await post({ ...OH, ...CAUSE });
    const b = await post(OH);
    expect(a.r.determinedTax).toBe(133_060_000);
    expect(b.r.determinedTax).toBe(238_500_000);
  });

  it("D1-6b 토지 상속 2022(2년 초과) + 건물 8년 + 12억 이하 → 전액 비과세 (W2)", async () => {
    const { r } = await post({ ...OH, landAcquisitionDate: "2022-01-10", landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2005-01-01" });
    expect(r.isExempt).toBe(true);
    expect(r.determinedTax).toBe(0);
  });

  it("D1-6c [무관] 공익수용·비주택→주택 용도변경: 원인은 독립으로 작동 — 133,060,000 그대로(엔진이 두 축을 교차해 읽는 곳 없음)", async () => {
    const ex = await post({ ...OH, ...CAUSE, transferCause: "public_expropriation" });
    const cv = await post({ ...OH, ...CAUSE, nonHousingToHousingConversion: { residentialUseStartDate: "2020-01-01", residenceMonthsTrimmed: 0 } });
    expect(ex.r.determinedTax).toBe(133_060_000);
    expect(cv.r.determinedTax).toBe(133_060_000);
  });

  it("D1-6d [전환 D1-1 · R-X3] 가업상속 입력 + 토지 상속 → 400 — 종전 200·153,860,000(가업상속 입력 침묵 무시)", async () => {
    const fb = { familyBusinessInheritance: { decedentAcquisitionPrice: 100_000_000, inheritanceMarketValue: 300_000_000, fbDeductionAppliedRate: 1, inheritanceDate: "2022-01-10" } };
    const a = await post({ ...D1_INH, ...fb });
    expect(a.status).toBe(400);
    expect(messages(a.body)).toContain("가업상속공제가 적용된 자산");
    // 긍정 짝: 같은 원인에 가업상속 입력만 빼면 계산된다
    expect((await post(D1_INH)).r.determinedTax).toBe(153_860_000);
  });

  it("D1-6e [전환 D1-1 · R-X4] 소유자 분리(land_only·building_only) + 토지 상속 → 400 — 종전 200·238,500,000(원인 침묵 무시, 통산돼야 133,060,000)", async () => {
    for (const selfOwns of ["land_only", "building_only"]) {
      const base = { selfOwns, acquisitionCause: "purchase", landAcquisitionDate: "2025-02-01" };
      const a = await post({ ...base, ...CAUSE });
      expect(a.status).toBe(400);
      expect(messages(a.body)).toContain("한쪽만 소유한 자산에는 토지 취득원인을 따로 지정할 수 없습니다");
      expect((await post(base)).status).toBe(200); // 긍정 짝: 원인 없는 소유자 분리
    }
    expect((await post({ selfOwns: "both", acquisitionCause: "purchase", landAcquisitionDate: "2025-02-01", ...CAUSE })).status).toBe(200);
  });

  it("D1-6f [전환 D1-1 · R-X5] 건물 상속/증여 + 토지 증여/상속 → 400(D2 전까지) — 종전 200(원인 침묵 무시)", async () => {
    const a = await post({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", landAcquisitionDate: "2022-01-10", landAcquisitionCause: "gift" });
    const b = await post({ acquisitionCause: "gift", donorAcquisitionDate: "2000-01-01", landAcquisitionDate: "2022-01-10", landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2005-01-01" });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(messages(a.body)).toContain("건물을 상속·증여·이월과세·부담부증여로 취득한 자산에서 토지 취득원인을");
    // 긍정 짝: 건물 신축 + 토지 상속은 허용(D0 경로)
    expect((await post({ acquisitionCause: "newConstruction", landAcquisitionDate: "2022-01-10", landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2005-01-01" })).status).toBe(200);
  });

  it("D1-6g [기존 결함 — 원인 무관] 부담부증여에 분리 입력(landAcquisitionDate)이 닿으면 §159 총액과 어긋나 양도차손이 난다 — 원인 유무와 같은 값 → ⑫ 차단 대상(전환)", async () => {
    const bg = {
      transferType: "burdened_gift",
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_market", acquisitionMethod: "actual", marketValueAtTransfer: 1_200_000_000,
        actualLandAcquisitionPrice: 300_000_000, actualBuildingAcquisitionPrice: 400_000_000, donorRelation: "lineal_descendant",
        lendingDepositTotal: 0, mortgageDebtAmount: 300_000_000, annualRentTotal: 0,
        landStdPriceAtTransfer: 700_000_000, buildingStdPriceAtTransfer: 500_000_000,
        landStdPriceAtAcquisition: 300_000_000, buildingStdPriceAtAcquisition: 400_000_000,
      },
      acquisitionCause: "purchase",
      landAcquisitionDate: "2025-02-01",
    };
    const a = await post({ ...bg, ...CAUSE });
    const b = await post(bg);
    // 전환 D1-1 · R-X1: 원인이 있으면 400. 원인 없는 분리 입력의 양도차손은 원인 무관 기존 결함 — 별건(설계 §12 R-6)이라 현행 고정.
    expect(a.status).toBe(400);
    expect(messages(a.body)).toContain("부담부증여로 양도하는 자산에는 토지 취득원인을 따로 지정할 수 없습니다");
    expect(b.status).toBe(200);
    expect(b.r.splitDetail.land.gain).toBe(-125_000_000);
    expect(b.r.splitDetail.building.gain).toBe(-275_000_000);
  });

  it("D1-6i [신규 D1-1 · R-X2] PHD(preHousingDisclosure) + 토지 상속 → 400 · 추계 불가 메시지가 아니라 PHD 전용 메시지", async () => {
    const phd = {
      preHousingDisclosure: {
        firstDisclosureDate: "2005-04-30", firstDisclosureHousingPrice: 300_000_000,
        landPricePerSqmAtAcquisition: 100_000, buildingStdPriceAtAcquisition: 50_000_000,
        landPricePerSqmAtFirstDisclosure: 150_000, buildingStdPriceAtFirstDisclosure: 60_000_000,
        transferHousingPrice: 900_000_000, landArea: 200, landPricePerSqmAtTransfer: 2_000_000, buildingStdPriceAtTransfer: 100_000_000,
      },
    };
    const a = await post({ ...D1_INH, ...phd });
    expect(a.status).toBe(400);
    expect(messages(a.body)).toContain("개별주택가격이 공시되기 전에 취득한 주택의 환산");
    expect(messages(a.body)).not.toContain("상속·증여로 취득한 토지는 취득가액을 환산취득가");
  });

  it("D1-6h [무관] 분리 대상이 아닌 propertyType(land)에서는 원인이 읽히지 않는다 — 원인 유무 동일", async () => {
    const base = { propertyType: "land", acquisitionDate: "2018-03-02", landAcquisitionDate: "2022-01-10" };
    const a = await post({ ...base, ...CAUSE });
    const b = await post(base);
    expect(a.status).toBe(200);
    expect(a.r.determinedTax).toBe(b.r.determinedTax);
    expect(a.r.splitDetail).toBeUndefined();
  });
});

/**
 * ⑫ 격자 — 토지 원인(없음/상속+피상속인/상속 피상속인 없음/증여/이월과세) × 건물 원인(매매/신축) × 토지 파트 모드(4종) = 40셀.
 * ⑫ 판정은 D1이 이 격자를 바꾸지 않는다(결합 제외 규칙은 격자 밖 입력 축 — §4.2). 통과 12셀·차단 28셀을 고정한다.
 */
describe("D1-Z ⑫ 격자 40셀 (현행 = D1 후 동일)", () => {
  const GRID_BASE = {
    ...BASE,
    landAcquisitionDate: "2022-01-10",
    standardPricePerSqmAtAcquisition: 500_000,
    acquisitionArea: 200,
  } as Record<string, unknown>;
  const KEYS = ["landAcquisitionCause", "landAcqMode", "landDecedentAcquisitionDate"];
  type LC = "none" | "inh+dec" | "inh-nodec" | "gift" | "carry";
  const LCS: LC[] = ["none", "inh+dec", "inh-nodec", "gift", "carry"];
  const BCS = ["purchase", "newConstruction"] as const;
  const MODES = ["actual", "estimated", "appraisal", "salesCase"] as const;
  const causeOf = (lc: LC) => (lc === "none" ? undefined : lc.startsWith("inh") ? "inheritance" : lc === "gift" ? "gift" : "carryover_gift");

  function body(lc: LC, bc: string, mode: string) {
    const b: Record<string, unknown> = { ...GRID_BASE, acquisitionCause: bc, landAcqMode: mode };
    if (mode === "actual") b.landAcquisitionPrice = 300_000_000;
    else delete b.landAcquisitionPrice;
    const c = causeOf(lc);
    if (c) b.landAcquisitionCause = c;
    if (lc === "inh+dec") b.landDecedentAcquisitionDate = "2005-01-01";
    return b;
  }
  function twelve(lc: LC, bc: string, mode: string): string[] {
    const r = propertySchema.safeParse(body(lc, bc, mode));
    return r.success ? [] : [...new Set(r.error.issues.map((i) => i.path.join(".")).filter((k) => KEYS.includes(k)))];
  }
  function eight(lc: LC, bc: string, mode: (typeof MODES)[number]): "pass" | "block" {
    const c = causeOf(lc);
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: bc,
      acquisitionDate: "2018-03-02",
      landAcquisitionDate: "2022-01-10",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionCause: (c ?? "") as AssetForm["landAcquisitionCause"],
      landCauseHost: bc as AssetForm["landCauseHost"], // 토글을 켠 호스트 = 지금 건물 원인(D1-2)
      landDecedentAcquisitionDate: lc === "inh+dec" ? "2005-01-01" : "",
      landAcqMode: mode,
    } as AssetForm;
    return validateLandPartCause(asset, "x") ? "block" : "pass";
  }

  it("D1-Z1 ⑫: 통과 12셀 = (원인 없음 8) + (상속+피상속인·실가 ×2건물원인) + (증여·실가 ×2) · 나머지 28셀 차단", () => {
    let pass = 0;
    let block = 0;
    for (const lc of LCS)
      for (const bc of BCS)
        for (const mode of MODES) {
          const blocked = twelve(lc, bc, mode).length > 0;
          const expectPass = lc === "none" || ((lc === "inh+dec" || lc === "gift") && mode === "actual");
          expect(!blocked, `${lc}/${bc}/${mode}`).toBe(expectPass);
          if (blocked) block++;
          else pass++;
        }
    expect([pass, block]).toEqual([12, 28]);
  });

  // D1-Z2(종전: 건물 매매 셀은 ⑧이 원인을 「없음」으로 읽어 14셀이 ⑫와 어긋남)는 D1-2 매매 호스트 개방으로 Z3에 흡수.
  it("D1-Z3 [D1-2] ⑧ ≡ ⑫ — 40셀 전수(건물 신축·매매 × 토지 원인 5 × 토지 모드 4)", () => {
    for (const lc of LCS)
      for (const bc of BCS)
        for (const mode of MODES)
          expect(eight(lc, bc, mode) === "block", `${lc}/${bc}/${mode}`).toBe(twelve(lc, bc, mode).length > 0);
  });
});

/** D1 구현이 만드는 값 — 아래는 구현 PR에서 활성화한다(설계 §9 「전환」·「신규」). */
describe("D1 전환·신규 기대값 (구현 PR에서 활성화)", () => {
  it.todo("[신규 echo] splitDetail.land.acquisitionCause='inheritance' · acquisitionDate='2022-01-10' · rateBasisAcquisitionDate='2005-01-01' · rateBasisRule='decedent' · appliedRateBasisDate='2018-03-02'(주택 max)");
  it.todo("[신규 echo] splitDetail.building.acquisitionCause='purchase' · rateBasisRule='own'");
  it.todo("[신규 echo] 단순 증여: land.rateBasisAcquisitionDate = land.acquisitionDate · rateBasisRule='own' (통산 아님)");
  it.todo("[신규 echo] summarizeSplitGain.parts[].acquisitionCause / mixedCause=true");
  it.todo("[신규 warning] 1세대1주택 + 나중 취득 토지(상속) 토지분 비과세 제외 시 「피상속인 보유기간 통산 불가 — 확인 필요」 고지");
});
