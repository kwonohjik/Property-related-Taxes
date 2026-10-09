/**
 * D1-4 Pre-Do anchor (UI·클라이언트 ④⑥⑧) — 「토지 상속·증여 + 건물 신축·매매」에서 토지 취득일이 1990-08-30 전일 때
 * 영 §163⑨ 단서 1호(max(평가액, 영 §164④ 가액)) 입력 경로를 열기 **전** 현행 동작 고정 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1-4.ui.design.md §1~§8 · §10
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §6 Q-7 · §10.1 U-1 · §10.3 D1-4
 *
 * ## 이 파일이 하는 일
 * 1. **현행 Q-7 차단을 활성 테스트로 고정**한다 — 이름에 `[D1-4에서 뒤집힘]`이 붙은 테스트는 D1-4 Do가 일부러 깨뜨린다.
 *    깨뜨릴 때 같은 자리에서 기대값을 설계 문서 §8 판정으로 바꾼다(조용히 지나가지 않게 하는 안전망).
 * 2. **공유 키 재사용의 전제**(설계 §2)를 활성 테스트로 고정한다 — `pre1990*`·`acquisitionArea`를 채워 둬도 이 상태(주택·건물
 *    + 매매·신축 호스트)에서는 다른 어떤 읽는 쪽도 그 값을 ④로 흘리지 않는다. 이게 깨지면 새 키가 필요하다.
 * 3. 계산 산식(`calculatePre1990LandValuation`)의 기대 수치를 고정한다 — D1-4 todo가 이 숫자를 쓴다.
 * 4. D1-4 후 기대값은 `it.todo`로 남긴다(설계 §10.3과 1:1).
 *
 * ⚠️ 수치는 `makeMockRates()` 실측값이 아니라 **순수 함수(`calculatePre1990LandValuation`) 값**이다 — 세율과 무관.
 * ⚠️ 상태 시드(`toggleOn`)는 `LandPartCauseBlock`의 토글 ON 패치를 **손으로 재현**한 것이다 — 그 패치가 바뀌면 같이 고친다.
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
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { landPartCauseDateNotice, effectiveLandAcquisitionCause } from "@/lib/calc/transfer-land-part-cause";
import { hasPre1990LandEstimation } from "@/lib/calc/transfer-pre1990-land-gate";
import { isGbLandPre1990Sec163_9, deriveGbPre1990LandPricePerSqmAtAcq } from "@/lib/calc/transfer-pre1990-gb-bridge";
import { sec164HouseStatus, sec164LandStatus } from "@/lib/calc/sec164-required-fields";
import { phdPayloadActive } from "@/lib/calc/phd-toggle-scope";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";
import { SEC_163_9_LAND_FIRST_DISCLOSURE } from "@/lib/tax-engine/transfer-split-part-cause";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2026-06-30";

/** §164④ 5칸 + 면적 — 등급가액 직접입력 모드(`value`): 현재 1000 · 직전 1000 · 취득시 800 → 비율 0.8. */
const SEC164_FILLED: Partial<AssetForm> = {
  acquisitionArea: "200",
  transferArea: "200",
  pre1990GradeMode: "value",
  pre1990Grade_current: "1000",
  pre1990Grade_prev: "1000",
  pre1990Grade_atAcq: "800",
  pre1990PricePerSqm_1990: "100,000",
};

/** 신축(2020-06-01) + 토지 상속 1984-05-01(피상속인 1960-01-01) — 신축 호스트에서 토글을 켠 상태. */
function newConstruction(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "newConstruction",
    acquisitionDate: "2020-06-01",
    occupancyApprovalDate: "2020-06-01",
    landAcquisitionCause: "inheritance",
    landCauseHost: "newConstruction",
    landAcquisitionDate: "1984-05-01",
    landDecedentAcquisitionDate: "1960-01-01",
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

/** 매매(2018-03-02, 건물 3.5억) + 토지 상속 1984-05-01 — 매매 호스트에서 토글을 켠 상태. */
function purchase(over: Partial<AssetForm> = {}): AssetForm {
  return newConstruction({
    acquisitionCause: "purchase",
    occupancyApprovalDate: "",
    acquisitionDate: "2018-03-02",
    landCauseHost: "purchase",
    buildingAcquisitionPrice: "350,000,000",
    ...over,
  });
}

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

const v8 = (a: AssetForm) => collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));

/** 단건 ④로 body를 만든다(검증 미경유 — 화면에서는 ⑧ 통과 상태만 여기 도달하지만, 누수 점검은 ⑧ 이전 payload를 본다). */
async function bodyOf(a: AssetForm): Promise<Record<string, unknown>> {
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
  return cap.body!;
}

/** 위 body를 실제 route(⑫⑭ + 엔진)에 태운다. */
async function run(a: AssetForm) {
  const body = await bodyOf(a);
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
        ...body,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: { result?: { totalTax?: number; splitDetail?: unknown } } };
  return { status: res.status, body, tax: json.data?.result?.totalTax, split: json.data?.result?.splitDetail };
}

/** §164④ 환산 기대 수치 — 순수 함수 직접 호출. */
function valuation(over: { p1990: number; cur: number; prev: number; atAcq: number; area: number; acq?: string }) {
  return calculatePre1990LandValuation({
    acquisitionDate: new Date(over.acq ?? "1984-05-01"),
    transferDate: new Date(TRANSFER_DATE),
    areaSqm: over.area,
    pricePerSqm_1990: over.p1990,
    pricePerSqm_atTransfer: over.p1990,
    grade_1990_0830: { gradeValue: over.cur },
    gradePrev_1990_0830: { gradeValue: over.prev },
    gradeAtAcquisition: { gradeValue: over.atAcq },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A. 현행 Q-7 차단 — D1-4가 일부러 뒤집는다 (설계 §8)
// ─────────────────────────────────────────────────────────────────────────────
describe("A. 현행 Q-7 차단 pin — 「[D1-4에서 뒤집힘]」", () => {
  const hosts: [string, (o?: Partial<AssetForm>) => AssetForm][] = [
    ["신축", newConstruction],
    ["매매", purchase],
  ];

  for (const [name, make] of hosts) {
    it(`A1 [D1-4에서 뒤집힘] ${name} 호스트 + 토지 상속 1984-05-01 → ⑧ 차단(토지 취득일 칸) — §164④ 5칸·면적을 모두 채워도 풀리지 않는다`, () => {
      for (const filled of [false, true]) {
        const a = make(filled ? SEC164_FILLED : {});
        const r = v8(a);
        expect(r.result, `filled=${filled}`).toContain("1990.8.30.");
        expect(r.result).toContain("이 비교는 지원하지 않습니다");
        expect(r.fieldOf(r.result!)).toBe("landAcquisitionDate");
      }
    });

    it(`A2 [D1-4에서 뒤집힘] ${name} 호스트 + 토지 증여 1988-12-31도 같은 차단 (§163⑨ 단서 1호는 증여 포함)`, () => {
      const a = make({ ...SEC164_FILLED, landAcquisitionCause: "gift", landAcquisitionDate: "1988-12-31", landDecedentAcquisitionDate: "" });
      const r = v8(a);
      expect(r.result).toContain("1990.8.30.");
      expect(r.fieldOf(r.result!)).toBe("landAcquisitionDate");
    });

    it(`A3 ${name} 호스트 경계: 1990-08-29는 차단, 1990-08-30 당일은 통과 (당일은 「고시되기 전」이 아니다) — D1-4 후에도 경계는 유지`, () => {
      const hit = v8(make({ landAcquisitionDate: "1990-08-29", landDecedentAcquisitionDate: "1960-01-01" }));
      expect(hit.result).toContain("1990.8.30.");
      const edge = v8(make({ landAcquisitionDate: SEC_163_9_LAND_FIRST_DISCLOSURE, landDecedentAcquisitionDate: "1960-01-01" }));
      expect(edge.result).toBeNull();
    });
  }

  it("A4 [D1-4a에서 뒤집힘] ⑫: 5칸·면적이 찬 body는 ④가 ②(landSec164Value)를 실어 엔진이 max·echo로 계산(200) — 비어 있으면 400. ⑧은 D1-4a에서 계속 막는다(A1)", async () => {
    // 법령 정합: 영 §163⑨ 단서 1호 — 평가액 3억과 §164④ 가액 16,000,000(80,000/㎡ × 200㎡) 중 많은 금액 = 3억(평가액 채택).
    for (const make of [newConstruction, purchase]) {
      const filled = await run(make(SEC164_FILLED));
      expect(filled.status).toBe(200);
      expect(filled.body.landSec164Value).toBe(16_000_000);
      expect(filled.split).toMatchObject({
        land: { acquisitionPrice: 300_000_000, acquisitionBasis: { rule: "sec163_9_1", reported: 300_000_000, sec164: 16_000_000, adopted: "reported" } },
      });
      expect((await run(make({}))).status).toBe(400);
    }
  });

  it("A5 [D1-4에서 뒤집힘] ⑤ 날짜 안내: 1990 전이면 「이 화면에서 계산하지 않습니다」류 차단 문구를 낸다 (D1-4 후 카드로 대체)", () => {
    const n = landPartCauseDateNotice({ ...purchase(SEC164_FILLED) });
    expect(n).toContain("1990.8.30.");
    expect(n).toContain("지원하지 않습니다");
    // 긍정 짝: 1990 이후는 안내 없음
    expect(landPartCauseDateNotice({ ...purchase({ landAcquisitionDate: "2015-03-10" }) })).toBeNull();
  });

  it("A6 [D1-4에서 뒤집힘] ⑥ 사이드바: 1990 전 토지 상속이어도 합계는 평가액 + 건물 가액으로 **확정**(pending=false) — D1-4 후엔 §164④와의 비교가 결과 도착 전엔 미확정이라 pending", () => {
    // 매매 호스트: 토지 평가액 3억 + 건물 3.5억
    expect(separateAcqPartsSum(purchase(SEC164_FILLED))).toEqual({ sum: 650_000_000, pending: false });
    // 신축 호스트: 토지 평가액 3억 + 신축비용 4억(건물 후퇴)
    expect(separateAcqPartsSum(newConstruction(SEC164_FILLED))).toEqual({ sum: 700_000_000, pending: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 공유 키 재사용의 전제 — D1-4 후에도 유지 (설계 §2)
// ─────────────────────────────────────────────────────────────────────────────
describe("B. 공유 키 `pre1990*`·`acquisitionArea` — 이 상태에서 다른 읽는 쪽은 그 값을 ④로 흘리지 않는다", () => {
  /** 일부러 **모든 경쟁 읽는 쪽의 켜짐 신호**를 켠다: 환산 래치 · PHD 플래그 · 취득시 기준시가 직접 입력. */
  const PHD_FILLED: Partial<AssetForm> = {
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "2005-04-30",
    phdFirstDisclosureHousingPrice: "100,000,000", // ④ PHD 블록은 이 두 칸이 있어야 실린다(body-blocks.ts)
  };
  const loaded = (make: (o?: Partial<AssetForm>) => AssetForm) =>
    make({ ...SEC164_FILLED, ...PHD_FILLED, pre1990Enabled: true, standardPricePerSqmAtAcq: "50,000" });

  for (const [name, make] of [["신축", newConstruction], ["매매", purchase]] as const) {
    it(`B1 ${name} 호스트: §164④ 값이 채워져 있어도 ④ body에 pre1990Land · inheritedHouseValuation · preHousingDisclosure가 없다`, async () => {
      const body = await bodyOf(loaded(make));
      expect(body.pre1990Land).toBeUndefined();
      expect(body.inheritedHouseValuation).toBeUndefined();
      expect(body.preHousingDisclosure).toBeUndefined();
      expect(body.pre1990Grade_current).toBeUndefined(); // 폼 키가 그대로 새지도 않는다
    });

    it(`B2 ${name} 호스트: 환산 게이트 3종은 모두 꺼져 있다 — 토지 전용 환산(hasPre1990LandEstimation) · 일반건물 브리지 · 주택 §163⑨2호(sec164HouseStatus)`, () => {
      const a = loaded(make);
      expect(hasPre1990LandEstimation(a)).toBe(false); // assetKind === "land" 전용
      expect(isGbLandPre1990Sec163_9(a)).toBe(false); // general_building 전용 → D1-4는 새 게이트가 필요하다
      expect(deriveGbPre1990LandPricePerSqmAtAcq(a, TRANSFER_DATE)).toBeNull();
      expect(sec164HouseStatus(a)).toBeNull(); // 건물 원인이 상속·증여가 아니라 주택 §164⑤~⑦ 경로 밖
      expect(sec164LandStatus(a)).toBeNull(); // land 전용
    });

    it(`B3 ${name} 호스트: PHD 플래그는 토지 원인이 유효하면 무시된다(D1-2 T-3) — 같은 5칸을 읽는 PHD 브리지가 경쟁하지 않는다`, () => {
      const a = loaded(make);
      expect(effectiveLandAcquisitionCause(a)).toBe("inheritance");
      expect(phdPayloadActive(a)).toBe(false);
    });

    it(`B4 ${name} 호스트: 토글 OFF 후에는 원인·§164④ 어느 쪽도 ④에 실리지 않는다 (저장값은 남고 읽는 쪽이 「없음」으로 읽는다)`, async () => {
      const off = loaded(make);
      const a = { ...off, landAcquisitionCause: "" as const, landCauseHost: "" as const, landAcqMode: "" as const };
      expect(a.pre1990Grade_atAcq).toBe("800"); // 값은 남는다
      const body = await bodyOf(a);
      expect(body.landAcquisitionCause).toBeUndefined();
      expect(body.pre1990Land).toBeUndefined();
    });
  }

  it("B1′ 긍정 짝(B1의 키 이름이 공허하지 않다는 증거): 같은 입력도 토지 원인이 없으면 PHD가, 토지 자산이면 pre1990Land가 실린다", async () => {
    // 토지 원인 없음 + PHD 켜짐 → preHousingDisclosure 전송 (토지 원인이 유효하면 D1-2 T-3이 끈다)
    const noCause = purchase({
      ...SEC164_FILLED,
      ...PHD_FILLED,
      landAcquisitionCause: "",
      landCauseHost: "",
      landAcquisitionDate: "2015-03-10",
      acquisitionDate: "2003-01-01",
    });
    expect((await bodyOf(noCause)).preHousingDisclosure).toBeDefined();
    // 토지 자산(assetKind=land) + 1984 취득 + 환산 래치 → pre1990Land 전송
    const land = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "1984-05-01",
      actualSalePrice: "1,200,000,000",
      pre1990Enabled: true,
      ...SEC164_FILLED,
    } as unknown as AssetForm;
    expect(hasPre1990LandEstimation(land)).toBe(true);
    expect((await bodyOf(land)).pre1990Land).toBeDefined();
    // 주택 §163⑨2호: 건물 자체를 1984 상속으로 취득하면 상태가 생긴다(상속 주택 경로)
    expect(sec164HouseStatus({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "inheritance", inheritanceStartDate: "1984-05-01", acquisitionDate: "1984-05-01" } as unknown as AssetForm)).not.toBeNull();
  });

  it("B5 ④ 3경로(단건·다건·컴패니언)는 같은 원인 키를 싣고, 현재 §164④ 키는 어느 경로에도 없다 — D1-4가 한 곳(buildLandPartCausePayload)에서 열면 3경로가 동시에 바뀐다", async () => {
    const a = purchase({ ...SEC164_FILLED, landAcquisitionDate: "2015-03-10" }); // ⑧ 통과 상태(1990 이후)
    const single = await bodyOf(a);
    const multi = buildPropertyPayload(form(a)) as Record<string, unknown>;
    const comp = buildAssetPayload(a, "apportioned", TRANSFER_DATE) as Record<string, unknown>;
    for (const b of [single, multi, comp]) {
      expect(b.landAcquisitionCause).toBe("inheritance");
      expect(b.landDecedentAcquisitionDate).toBe("1960-01-01");
      expect(b.pre1990Land).toBeUndefined();
      expect(b.landSec164).toBeUndefined();
    }
  });

  it("B6 AssetForm 기본값: §164④ 5칸 + 모드 + 면적이 이미 있다 — D1-4는 신규 폼 키 0 (①②③ 무변경)", () => {
    const d = makeDefaultAsset(1);
    for (const k of [
      "pre1990Enabled",
      "pre1990PricePerSqm_1990",
      "pre1990Grade_current",
      "pre1990Grade_prev",
      "pre1990Grade_atAcq",
      "pre1990GradeMode",
      "acquisitionArea",
    ] as const) {
      expect(d).toHaveProperty(k);
    }
    expect(d.pre1990Enabled).toBe(false);
    expect(d.pre1990GradeMode).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. §164④ 환산·max 기대 수치 (D1-4 todo가 쓰는 앵커)
// ─────────────────────────────────────────────────────────────────────────────
describe("C. 앵커 수치 — 순수 함수 값 (세율 무관)", () => {
  it("C1 평가액이 큰 경우: 1990 공시지가 100,000 × 비율(800/1000) = ㎡당 80,000 × 200㎡ = 16,000,000 < 평가액 300,000,000 → 평가액 채택", () => {
    const r = valuation({ p1990: 100_000, cur: 1000, prev: 1000, atAcq: 800, area: 200 });
    expect(r.pricePerSqmAtAcquisition).toBe(80_000);
    expect(r.standardPriceAtAcquisition).toBe(16_000_000);
    expect(Math.max(300_000_000, r.standardPriceAtAcquisition)).toBe(300_000_000);
  });

  it("C2 §164④ 가액이 큰 경우: 2,000,000 × 비율(1000/1000) = ㎡당 2,000,000 × 200㎡ = 400,000,000 > 평가액 300,000,000 → §164④ 채택", () => {
    const r = valuation({ p1990: 2_000_000, cur: 1000, prev: 1000, atAcq: 1000, area: 200 });
    expect(r.pricePerSqmAtAcquisition).toBe(2_000_000);
    expect(r.standardPriceAtAcquisition).toBe(400_000_000);
    expect(Math.max(300_000_000, r.standardPriceAtAcquisition)).toBe(400_000_000);
  });

  it("C3 일반건물 브리지는 같은 입력에 같은 ㎡당 가액을 낸다 — D1-4 브리지가 맞춰야 할 값 (GB는 환산 래치 pre1990Enabled를 요구한다)", () => {
    const gb = {
      ...makeDefaultAsset(1),
      assetKind: "general_building",
      acquisitionCause: "inheritance",
      acquisitionDate: "1984-05-01",
      landAcquisitionDate: "1984-05-01",
      gbLandArea: "200",
      pre1990Enabled: true,
      pre1990GradeMode: "value",
      pre1990Grade_current: "1000",
      pre1990Grade_prev: "1000",
      pre1990Grade_atAcq: "1000",
      pre1990PricePerSqm_1990: "2,000,000",
    } as unknown as AssetForm;
    expect(isGbLandPre1990Sec163_9(gb)).toBe(true);
    expect(deriveGbPre1990LandPricePerSqmAtAcq(gb, TRANSFER_DATE)).toBe(2_000_000);
    // 래치가 꺼지면 null — 주택 D1-4는 토글 없는 비교 맥락(alwaysOpen)이라 이 래치를 읽으면 안 된다
    expect(deriveGbPre1990LandPricePerSqmAtAcq({ ...gb, pre1990Enabled: false } as AssetForm, TRANSFER_DATE)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. D1-4 후 기대값 (설계 §10.3과 1:1) — 구현 시 todo → 실제 테스트로 전환
// ─────────────────────────────────────────────────────────────────────────────
describe("D. D1-4 기대 (설계 §3~§8)", () => {
  // ⑤ 위젯·게이트
  it.todo("D1 게이트 leaf: 유효 토지 원인 ∧ 토지 취득일 < 1990-08-30 일 때만 §164④ 카드 노출 — 신축·매매 호스트 동일, 1990-08-30 당일은 비노출");
  it.todo("D2 게이트는 pre1990Enabled 래치를 읽지 않는다 — 래치 true/false 모두 같은 결과 (alwaysOpen, 비교는 법이 정한 계산)");
  // ⑧
  it.todo("D3 ⑧ 순서: 토지일 비움(G-12) → 평가액 → 면적(acquisitionArea) → 현재등급 → 직전등급 → 취득시등급 → 1990 공시지가 → 계산 불가 — 각 칸 앵커로 이동");
  it.todo("D4 ⑧ 통과 조건 = ④가 §164④ 페이로드를 싣는 조건 (sec164 상태 isFullyFilled ∧ 계산 성공) — 격자 전수: ⑧ 차단 ⇔ ⑫ 차단");
  it.todo("D5 ⑧ 면적: areaScenario=partial이면 차단 또는 양도분 면적 정책 — 엔진 시니어 결론 후 확정(설계 Q-D14-UI3)");
  it.todo("D6 Q-4 같은 날 · Q-5 소유자 분리 · R-X1~X5 결합 제외는 1990 전 날짜에서도 종전 그대로 (순서: 구조 규칙 → G-12 → Q-7' 입력 완결)");
  // ④
  it.todo("D7 ④ 3경로 동일: 1990 전 + 완결이면 buildLandPartCausePayload가 §164④ 페이로드를 싣고, 1990 이후·토글 OFF·불완전이면 싣지 않는다 (stale 5칸 누수 0)");
  it.todo("D8 ⑫ 직접 호출: 1990 전 + §164④ 페이로드 없음 → 400(메시지에 입력 칸 안내), 있음 → 200 (엔진 설계 B안 기준)");
  // ⑥
  it.todo("D9 ⑥ separateAcqPartsSum: 1990 전 토지 원인이면 pending=true (사이드바는 결과 도착 전 합계를 숨긴다) — 1990 이후는 종전 확정값");
  // ⑦
  it.todo("D10 summarizeSplitGain: 채택 근거(평가액/§164④)·두 값을 echo로 받아 4뷰 공통 — echo 없는 구 이력은 종전 화면(비교 행 미렌더)");
  it.todo("D11 상세명세서 파트 태그: §164④ 채택이면 「토지(영 §164④ 가액)」, 평가액 채택이면 「토지(상속개시일 평가액)」 — 동점은 평가액");
  it.todo("D12 신고서 취득가액 칸 = 채택값 · 각주에 비교 두 값");
  // 회귀
  it.todo("D13 신축 호스트 회귀 0: 토지일 ≥ 1990-08-30 상속 상태의 ④ 원인 payload · ⑥ 합계(700,000,000) · ⑧ 통과 (D1 A1과 동일)");
  it.todo("D14 C1·C2 수치 e2e: 평가액 3억 vs §164④ 16,000,000 → 3억 채택 / 4억 → 4억 채택 (엔진 echo의 adopted 라벨 포함)");
});
