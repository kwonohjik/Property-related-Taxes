/**
 * D2-4a route anchor — 건물 상속·증여 + 토지 매매, 건물 취득일 < 2005-04-30(영 §163⑨ 단서 2호) 단독·다가구주택의 ② max 비교 (2026-10-09)
 *
 * 계획서 §13(사용자 결정: 단독·다가구만) · 엔진 설계 `transfer-acq-cause-mixed-d2-4.engine.design.md` §3·§5(A-1~A-15).
 * 실제 `POST /api/calc/transfer`(⑫ Zod → ⑭ engine-input → 엔진)를 거친다 — leaf 직접 호출은 ⑫를 지나지 않는다.
 *
 * 공통 시드: 주택 양도 12억(토지 7억 / 건물 5억), 양도일 2026-06-30, 별개 취득, 파트 실가, 토지 매매(overlay `purchase`) 2020-01-10 · 3억.
 * 건물 = 상속(피상속인 1990-01-01, 개시 2003-05-01) · ①평가액 30,000,000 · ②36,000,000(= 300M × 30M ÷ (200M + 50M)).
 * 손계산(`makeMockRates()` 실측 규약): 토지 양도차익 4억, 6년 보유 12% = 48,000,000 → 352,000,000.
 * 건물 23년 → 장특 상한 30%. 기본공제 250만. 5억~10억 구간 42% − 35,940,000.
 * ⚠️ 수치는 mock 세율 실측이지 정본 세액이 아니다 — 같은 시드의 상대 비교(② 채택 vs ① 채택)가 본질이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const req = (url: string, b: object) =>
  new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 1_200_000_000,
  transferDate: "2026-06-30",
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
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2020-01-10",
  landAcquisitionPrice: 300_000_000,
};
/** A-1 시드 — 상속 2003-05-01, ①30M, ②36M, 단독·다가구. */
const INH = {
  ...BASE,
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "1990-01-01",
  acquisitionDate: "2003-05-01",
  buildingAcquisitionPrice: 30_000_000,
  buildingSec164Value: 36_000_000,
  buildingHouseKind: "house_individual",
};
/** 증여 2002-09-15 — ①25M, ②29,473,684(= 280M × 20M ÷ (150M + 40M)). */
const GIFT = {
  ...BASE,
  acquisitionCause: "gift",
  acquisitionDate: "2002-09-15",
  buildingAcquisitionPrice: 25_000_000,
  buildingSec164Value: 29_473_684,
  buildingHouseKind: "house_individual",
};

async function post(over: Record<string, unknown>): Promise<{ status: number; body: J; r: J }> {
  const merged: Record<string, unknown> = { ...INH, ...over };
  for (const k of Object.keys(merged)) if (merged[k] === "__DEL__") delete merged[k];
  const res = await POST(req("http://localhost/api/calc/transfer", merged));
  const body = (await res.json()) as J;
  return { status: res.status, body, r: body?.data?.result };
}
/** 증여 시드 — INH 위에 덮어쓰므로 피상속인 취득일은 지운다. */
const postGift = (over: Record<string, unknown>) => post({ ...GIFT, decedentAcquisitionDate: "__DEL__", ...over });
const field = (x: { body: J }, f: string): string => x.body?.error?.fieldErrors?.[f]?.[0] ?? "";

describe("A) 엔진 채택 — ①·②·동점 (A-1~A-3, A-6)", () => {
  it("A-1 상속: ① 30M < ② 36M → 건물 취득가 36M(② 채택) · 결정세액 247,266,000 · 과세표준 674,300,000 · echo", async () => {
    const x = await post({});
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.splitDetail.building.acquisitionPrice).toBe(36_000_000);
    expect(x.r.splitDetail.building.gain).toBe(464_000_000);
    expect(x.r.splitDetail.building.acquisitionBasis).toEqual({ rule: "sec163_9_2", reported: 30_000_000, sec164: 36_000_000, adopted: "sec164" });
    expect(x.r.taxBase).toBe(674_300_000);
    expect(x.r.determinedTax).toBe(247_266_000);
    // 토지 파트에는 단서 1호 echo가 없다(토지는 매매)
    expect(x.r.splitDetail.land.acquisitionBasis).toBeUndefined();
  });

  it("A-2 상속: ① 40M > ② 36M → ① 채택 246,090,000 · 과세표준 671,500,000", async () => {
    const x = await post({ buildingAcquisitionPrice: 40_000_000 });
    expect(x.status).toBe(200);
    expect(x.r.splitDetail.building.acquisitionPrice).toBe(40_000_000);
    expect(x.r.splitDetail.building.acquisitionBasis).toEqual({ rule: "sec163_9_2", reported: 40_000_000, sec164: 36_000_000, adopted: "reported" });
    expect(x.r.taxBase).toBe(671_500_000);
    expect(x.r.determinedTax).toBe(246_090_000);
  });

  it("A-3 동점(① = ② = 36M) → 평가액(reported) 채택 · 세액은 A-1과 같다", async () => {
    const x = await post({ buildingAcquisitionPrice: 36_000_000 });
    expect(x.status).toBe(200);
    expect(x.r.splitDetail.building.acquisitionBasis.adopted).toBe("reported");
    expect(x.r.determinedTax).toBe(247_266_000);
  });

  it("A-6 증여 2002-09-15: ① 25M < ② 29,473,684 → ② 채택 · 249,184,737 · 과세표준 678,868,422 · 지방소득세 24,918,473", async () => {
    const x = await postGift({});
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.splitDetail.building.acquisitionPrice).toBe(29_473_684);
    expect(x.r.splitDetail.building.acquisitionBasis).toEqual({ rule: "sec163_9_2", reported: 25_000_000, sec164: 29_473_684, adopted: "sec164" });
    expect(x.r.splitDetail.building.longTermDeduction).toBe(141_157_894);
    expect(x.r.taxBase).toBe(678_868_422);
    expect(x.r.determinedTax).toBe(249_184_737);
    expect(x.r.localIncomeTax).toBe(24_918_473);
  });

  it("A-7 대조군: 증여 ②를 빼고 ①만이면 250,500,000이 되는 시드다(② 채택분 −1,315,263) — 이 값과 A-6이 달라야 ②가 쓰인 것", async () => {
    // ② 없이는 400이라 대조값은 ① = ②로 맞춰 얻는다(② 채택 가액 = 25M일 때의 세액).
    const x = await postGift({ buildingSec164Value: 25_000_000 });
    expect(x.status).toBe(200);
    expect(x.r.determinedTax).toBe(250_500_000);
    expect(250_500_000 - 249_184_737).toBe(1_315_263);
  });

  it("A-8 의제취득일(1985.1.1.) 전 상속 1984-06-01은 A-1과 세액이 같다(엔진에 의제 보정 없음 — 라벨만 UI)", async () => {
    const x = await post({ acquisitionDate: "1984-06-01", decedentAcquisitionDate: "1970-01-01" });
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.determinedTax).toBe(247_266_000);
    expect(x.r.splitDetail.building.acquisitionBasis.adopted).toBe("sec164");
  });
});

describe("B) 경계일 2005-04-30 (A-9) — 엄격 `<`", () => {
  const near = { decedentAcquisitionDate: "1990-01-01", landAcquisitionDate: "2005-01-10" };

  it("2005-04-29: 구간 안 → ② 없으면 400 field buildingSec164Value · ② 있으면 200 + echo", async () => {
    const no = await post({ ...near, acquisitionDate: "2005-04-29", buildingSec164Value: "__DEL__" });
    expect(no.status).toBe(400);
    expect(field(no, "buildingSec164Value")).toContain("buildingSec164Value");
    const yes = await post({ ...near, acquisitionDate: "2005-04-29" });
    expect(yes.status, JSON.stringify(yes.body)).toBe(200);
    expect(yes.r.splitDetail.building.acquisitionBasis.rule).toBe("sec163_9_2");
  });

  it("2005-04-30: 구간 밖 → ② 없이 200 · echo 없음 · ②가 와도 무시(① 단독) — 긍정 짝", async () => {
    const out = await post({ ...near, acquisitionDate: "2005-04-30", buildingSec164Value: "__DEL__" });
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    expect(out.r.splitDetail.building.acquisitionBasis).toBeUndefined();
    expect(out.r.splitDetail.building.acquisitionPrice).toBe(30_000_000);
    const withValue = await post({ ...near, acquisitionDate: "2005-04-30", buildingSec164Value: 99_000_000 });
    expect(withValue.status).toBe(200);
    expect(withValue.r.splitDetail.building.acquisitionPrice).toBe(30_000_000);
    expect(withValue.r.splitDetail.building.acquisitionBasis).toBeUndefined();
  });
});

describe("C) 차단 규칙 (A-4·A-5·A-10·A-11 · 주택 구분)", () => {
  it("A-4 ② 없음 → 400 field buildingSec164Value", async () => {
    const x = await post({ buildingSec164Value: "__DEL__" });
    expect(x.status).toBe(400);
    expect(field(x, "buildingSec164Value")).toContain("제164조 제7항 가액의 건물 몫");
  });

  it("A-5 ① 없음 + ② 있음 → 400 buildingAcquisitionPrice (②만으로 채우지 않는다)", async () => {
    const x = await post({ buildingAcquisitionPrice: "__DEL__" });
    expect(x.status).toBe(400);
    expect(field(x, "buildingAcquisitionPrice")).toContain("건물 취득가액");
  });

  it("A-10 비주택 일반건물(`building`) → 400 field acquisitionDate (종전 Y4 문구) · ②가 와도 열리지 않는다", async () => {
    const x = await post({ propertyType: "building" });
    expect(x.status).toBe(400);
    expect(field(x, "acquisitionDate")).toContain("기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전");
  });

  it("A-11 일부 양도 → 400 (⑫ 경로 field isPartialAreaTransfer) · 일부 양도 아님(false)은 200", async () => {
    const x = await post({ isPartialAreaTransfer: true });
    expect(x.status).toBe(400);
    expect(field(x, "isPartialAreaTransfer")).toContain("일부 양도");
    expect((await post({ isPartialAreaTransfer: false })).status).toBe(200);
  });

  it("공동주택(house_apart) → 400 field acquisitionDate · ②가 있어도 열리지 않는다(공동주택은 영 §164⑥·⑦ 중 적용 조문이 갈린다)", async () => {
    const x = await post({ buildingHouseKind: "house_apart" });
    expect(x.status).toBe(400);
    expect(field(x, "acquisitionDate")).toContain("단독·다가구주택으로 확인된 주택만 지원합니다");
    expect(field(x, "acquisitionDate")).toContain("같은 영 제164조 제6항·제7항");
  });

  it("주택 구분 사실 없음(모름) → 공동주택과 같이 400 — 모름 = 불성립", async () => {
    const x = await post({ buildingHouseKind: "__DEL__" });
    expect(x.status).toBe(400);
    expect(field(x, "acquisitionDate")).toContain("단독·다가구주택으로 확인되지 않으면(공동주택 포함)");
  });

  it("buildingHouseKind 값 오류는 ⑫ enum 400 — 침묵 strip이 아니다", async () => {
    const x = await post({ buildingHouseKind: "villa" });
    expect(x.status).toBe(400);
  });

  it("A-15 Y7: 경계일 전 + 자산 단위 inheritedHouseValuation 동봉 → 400 유지(자산 단위 경로와 이중 적용 금지)", async () => {
    const x = await post({
      inheritedHouseValuation: {
        inheritanceDate: "2003-05-01", transferDate: "2026-06-30", landArea: 200, landPricePerSqmAtTransfer: 2_000_000,
        landPricePerSqmAtFirstDisclosure: 1_000_000, housePriceAtTransfer: 500_000_000, housePriceAtFirstDisclosure: 300_000_000,
        buildingStdPriceAtFirstDisclosure: 50_000_000, buildingStdPriceAtInheritance: 30_000_000, firstDisclosureDate: "2005-04-30",
      },
    });
    expect(x.status).toBe(400);
    expect(field(x, "inheritedAcquisition")).toContain("자산 단위 상속 취득가액 의제");
  });

  it("overlay 부재(landAcquisitionCause 없음) + ② → 400 Y8 — ②는 overlay `purchase`에서만 읽는다", async () => {
    const x = await post({ landAcquisitionCause: "__DEL__" });
    expect(x.status).toBe(400);
  });

  it("별개 취득이 아니면(isSeparateAcquisition false) 같은 날 규칙이 아니라 비교·echo가 없다 — 엔진 직접 단위 테스트가 고정(split-acq-price.d2-4)", async () => {
    // 같은 날(토지일 = 건물일)은 ⑧ 전용 차단이고 ⑫는 통과한다. 경계일 전 + 같은 날 + ② 있음 → 200이어도 echo가 없어야 한다.
    const x = await post({ landAcquisitionDate: "2003-05-01", isSeparateAcquisition: false, landAcquisitionPrice: 300_000_000 });
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.splitDetail?.building?.acquisitionBasis).toBeUndefined();
  });
});

describe("D) 결과 고지 — 비교가 돈 경우에만 1줄", () => {
  const NOTICE = "건물 몫은 같은 영 제164조 제7항으로 환산한 취득당시 주택가격을 토지·건물의 취득당시 기준시가 비율로 안분한 값";

  it("② 채택·① 채택 모두 같은 고지(어느 쪽이 채택됐는지 말하지 않는다 — 세액 중립) · 방법(재산세과-1702)과 한계(정면 해석례 없음 — 확인 필요)", async () => {
    for (const buildingAcquisitionPrice of [30_000_000, 40_000_000]) {
      const x = await post({ buildingAcquisitionPrice });
      const notices = (x.r.warnings as string[]).filter((w) => w.includes(NOTICE));
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain("「소득세법 시행령」 제163조 제9항 단서 제2호");
      expect(notices[0]).toContain("재산세과-1702");
      expect(notices[0]).toContain("정면 해석례는 확인하지 못했습니다");
      expect(notices[0]).toContain("확인 필요");
      expect(notices[0]).not.toMatch(/유리|불리|절감/);
    }
  });

  it("비교가 안 돈 경우(2005-04-30 당일 · 건물 매매 대조군)는 고지가 없다 — 부정형 짝", async () => {
    const out = await post({ decedentAcquisitionDate: "1990-01-01", landAcquisitionDate: "2005-01-10", acquisitionDate: "2005-04-30", buildingSec164Value: "__DEL__" });
    expect(out.status).toBe(200);
    expect(((out.r.warnings ?? []) as string[]).some((w) => w.includes(NOTICE))).toBe(false);
  });
});

describe("E) 지분 스케일 — ① ratioed · ② applyRatio가 같은 축", () => {
  it("엔진은 재스케일하지 않는다: 지분 50% 입력(① 15M · ② 18M)이면 건물 취득가 18M(② 채택)", async () => {
    const x = await post({ buildingAcquisitionPrice: 15_000_000, buildingSec164Value: 18_000_000 });
    expect(x.status).toBe(200);
    expect(x.r.splitDetail.building.acquisitionPrice).toBe(18_000_000);
    expect(x.r.splitDetail.building.acquisitionBasis).toMatchObject({ reported: 15_000_000, sec164: 18_000_000, adopted: "sec164" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 클라이언트 ④ → ⑫ → ⑭ 연결 (단건·다건·컴패니언 일괄양도) — body 바이트 동일 + 세액 동일
// ─────────────────────────────────────────────────────────────────────────────────────────────
type Form = ReturnType<typeof createDefaultTransferFormData>;

/** D2 토글 ON + 단독·다가구 + 경계일 전 상속(2003-05-01). ② 입력 4칸 + 면적(acquisitionArea)은 store의 기존 키. */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01",
    decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    inheritanceAssetKind: "house_individual", acquisitionArea: "200",
    inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
    inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
    ...over,
  } as AssetForm;
}
function form(assets: AssetForm[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-06-30";
  f.contractTotalPrice = "1,200,000,000";
  f.householdHousingCount = "2";
  f.assets = assets as never;
  return Object.assign(f, over);
}
async function bodyOf(send: () => Promise<unknown>) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as J;
}
async function single(f: Form) {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await POST(req("http://l/api/calc/transfer", body));
  const j = (await res.json()) as J;
  return { status: res.status, body: j, r: j?.data?.result, sent: body };
}
async function multi(f: Form) {
  const m = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() => callMultiTransferTaxAPI(m, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]));
  const res = await MULTI(req("http://l/api/calc/transfer/multi", body));
  return { status: res.status, body: (await res.json()) as J, sent: body };
}

describe("F) ④ → ⑫ → ⑭ 단건 — 클라이언트 body가 route를 통과해 ② 채택 값이 나온다", () => {
  it("F-1 ④가 buildingSec164Value 36,000,000 + buildingHouseKind를 싣고 route 결과가 A-1(247,266,000)과 같다", async () => {
    const s = await single(form([asset()]));
    expect(s.sent.buildingSec164Value).toBe(36_000_000);
    expect(s.sent.buildingHouseKind).toBe("house_individual");
    expect(s.sent.landAcquisitionCause).toBe("purchase");
    expect(s.sent.inheritedHouseValuation).toBeUndefined(); // Y7 — 자산 단위 payload는 계속 싣지 않는다
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.r.splitDetail.building.acquisitionBasis).toMatchObject({ rule: "sec163_9_2", adopted: "sec164", sec164: 36_000_000, reported: 30_000_000 });
    expect(s.r.determinedTax).toBe(247_266_000);
  });

  it("F-2 증여: 280M/150M(750,000×200)/40M/20M → ② 29,473,684 (floor 1회) · ①25M", async () => {
    const s = await single(
      form([asset({
        acquisitionCause: "gift", landCauseHost: "gift" as never, acquisitionDate: "2002-09-15", decedentAcquisitionDate: "", buildingAcquisitionPrice: "25,000,000",
        inhHouseValHousePriceAtFirst: "280,000,000", inhHouseValLandPricePerSqmAtFirst: "750,000",
        inhHouseValBuildingStdPriceAtFirst: "40,000,000", inhHouseValBuildingStdPriceAtInheritance: "20,000,000",
      })]),
    );
    expect(s.sent.buildingSec164Value).toBe(29_473_684);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.r.determinedTax).toBe(249_184_737);
  });

  it("F-3 공동주택(동·호 있음 → house_apart): ②를 보내지 않고 kind만 보낸다 → route 400", async () => {
    const s = await single(form([asset({ inheritanceAssetKind: "house_apart" })]));
    expect(s.sent.buildingHouseKind).toBe("house_apart");
    expect(s.sent.buildingSec164Value).toBeUndefined();
    expect(s.status).toBe(400);
  });

  it("F-4 구간 밖(2005-04-30)이면 kind·② 모두 보내지 않는다 — 범위 밖 잔재 차단 (스토어 4칸 값이 남아 있어도)", async () => {
    const s = await single(form([asset({ acquisitionDate: "2005-04-30", inheritanceStartDate: "2005-04-30", inheritanceDate: "2005-04-30", landAcquisitionDate: "2005-01-10" })]));
    expect(s.sent.buildingSec164Value).toBeUndefined();
    expect(s.sent.buildingHouseKind).toBeUndefined();
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.r.splitDetail.building.acquisitionBasis).toBeUndefined();
  });

  it("F-5 5입력 중 하나라도 비면 ②를 보내지 않는다 → route 400 field buildingSec164Value (자동 안분·① 단독 계산 없음)", async () => {
    for (const k of ["inhHouseValHousePriceAtFirst", "inhHouseValLandPricePerSqmAtFirst", "inhHouseValBuildingStdPriceAtFirst", "inhHouseValBuildingStdPriceAtInheritance", "acquisitionArea"] as const) {
      const s = await single(form([asset({ [k]: "" } as Partial<AssetForm>)]));
      expect(s.sent.buildingSec164Value, k).toBeUndefined();
      expect(s.status, k).toBe(400);
      expect(s.body.error.fieldErrors.buildingSec164Value?.[0], k).toBeTruthy();
    }
  });

  it("F-6 일부 양도(areaScenario partial)면 isPartialAreaTransfer를 보내고 route 400", async () => {
    const s = await single(form([asset({ areaScenario: "partial", transferArea: "100" })]));
    expect(s.sent.isPartialAreaTransfer).toBe(true);
    expect(s.status).toBe(400);
  });

  it("F-7 지분 50%: ②는 applyRatio(36,000,000, 0.5) = 18,000,000 · ①은 ratioed 15,000,000 → ② 채택, 취득가 18,000,000", async () => {
    const a = asset({ ownershipNumerator: "50", ownershipDenominator: "100" });
    const s = await single(form([a], { contractTotalPrice: "1,200,000,000" }));
    expect(s.sent.buildingSec164Value).toBe(18_000_000);
    expect(s.sent.buildingAcquisitionPrice).toBe(15_000_000);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.r.splitDetail.building.acquisitionBasis).toMatchObject({ reported: 15_000_000, sec164: 18_000_000, adopted: "sec164" });
  });

  it("F-8 면적 콤마(stale 「1,200」)를 지우고 파싱한다 — 콤마 있는 면적과 없는 면적의 ②가 같다", async () => {
    const a = await single(form([asset({ acquisitionArea: "1,200", inhHouseValLandPricePerSqmAtFirst: "166,666" })]));
    const b = await single(form([asset({ acquisitionArea: "1200", inhHouseValLandPricePerSqmAtFirst: "166,666" })]));
    expect(a.sent.buildingSec164Value).toBeGreaterThan(0);
    expect(a.sent.buildingSec164Value).toBe(b.sent.buildingSec164Value);
  });
});

describe("G) 다건 합산 route — 단건과 같은 세액 (A-14)", () => {
  it("G-1 ② 채택 시드: multi route 200 · totalTax가 단건과 같고 body에 ②·kind가 실린다 (⑭ multi/route.ts)", async () => {
    const f = form([asset()]);
    const s = await single(f);
    const m = await multi(f);
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(JSON.stringify(m.sent)).toContain("\"buildingSec164Value\":36000000");
    expect(JSON.stringify(m.sent)).toContain("\"buildingHouseKind\":\"house_individual\"");
    expect(m.body.data.totalTax).toBe(s.r.totalTax);
  });

  it("G-2 ②를 비우면 multi도 400 (⑫ 다건 스키마가 같은 leaf를 거친다)", async () => {
    expect((await multi(form([asset({ inhHouseValHousePriceAtFirst: "" })]))).status).toBe(400);
  });
});

describe("H) 컴패니언 일괄양도 (A-13) — ④ buildAssetPayload · ⑫ 컴패니언 스키마 · ⑭ bundled-split-helpers", () => {
  function bundled(companion: AssetForm): Form {
    const land = { ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000" } as AssetForm;
    return form([land, { ...companion, assetId: "c1" } as AssetForm], { contractTotalPrice: "1,500,000,000", bundledSaleMode: "actual" as never } as never);
  }

  it("H-1 컴패니언 D2-4: body에 ②·kind가 실리고(⑬ buildAssetPayload) route가 200 · 건물 echo sec163_9_2 · 파트 합 우선(36M + 300M = 336M)", async () => {
    const s = await single(bundled(asset()));
    expect(s.sent.companionAssets[0].buildingSec164Value).toBe(36_000_000);
    expect(s.sent.companionAssets[0].buildingHouseKind).toBe("house_individual");
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const c1 = s.body.data.aggregated.properties.find((p: J) => p.propertyId === "c1");
    expect(c1.splitDetail.building.acquisitionBasis).toMatchObject({ rule: "sec163_9_2", adopted: "sec164", sec164: 36_000_000 });
    expect(c1.splitDetail.building.acquisitionPrice).toBe(36_000_000);
    expect(c1.acquisitionPrice).toBe(336_000_000); // 파트 합(건물 ② 채택 36M + 토지 300M)이 일괄양도 안분 단계의 0을 이긴다
  });

  it("H-2 컴패니언에서 ②를 body에서 지우면 ⑫ 400 (companionAssets.0.buildingSec164Value) · kind를 지우면 400(모름)", async () => {
    const s = await single(bundled(asset()));
    const noSec = JSON.parse(JSON.stringify(s.sent));
    delete noSec.companionAssets[0].buildingSec164Value;
    const r1 = await POST(req("http://l/api/calc/transfer", noSec));
    expect(r1.status).toBe(400);
    expect(JSON.stringify(await r1.json())).toContain("companionAssets");
    const noKind = JSON.parse(JSON.stringify(s.sent));
    delete noKind.companionAssets[0].buildingHouseKind;
    expect((await POST(req("http://l/api/calc/transfer", noKind))).status).toBe(400);
  });
});
