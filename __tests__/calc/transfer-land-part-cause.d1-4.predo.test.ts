/**
 * D1-4 Pre-Do anchor (UI·클라이언트 ④⑥⑧) — 「토지 상속·증여 + 건물 신축·매매」에서 토지 취득일이 1990-08-30 전일 때
 * 영 §163⑨ 단서 1호(max(평가액, 영 §164④ 가액)) 입력 경로를 열기 **전** 현행 동작 고정 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1-4.ui.design.md §1~§8 · §10
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §6 Q-7 · §10.1 U-1 · §10.3 D1-4
 *
 * ## 이 파일이 하는 일
 * 1. **현행 Q-7 차단을 활성 테스트로 고정**한다 — 이름에 `[D1-4b 전환]`이 붙은 테스트는 D1-4 Do가 일부러 깨뜨린다.
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
import { landSec164Applies } from "@/lib/calc/transfer-pre1990-housing-land-bridge";
import { summarizeSplitGain, splitAcqBasisView, splitAcqBasisFormula } from "@/lib/tax-engine/transfer-tax-split-display";
import { splitAcqFormulaText } from "@/components/calc/results/transfer/split-acq-text";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
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
// A. D1-4b — ⑧ 완화: 「무조건 차단」(Q-7) → 「② 입력 완결 요구」 (종전 pin이 뒤집힌 자리)
// ─────────────────────────────────────────────────────────────────────────────
describe("A. ⑧ 완화 — 단서 구간(1990.8.30. 전 상속·증여 토지)은 ②(영 §164④ 가액) 입력 완결을 요구한다", () => {
  const hosts: [string, (o?: Partial<AssetForm>) => AssetForm][] = [
    ["신축", newConstruction],
    ["매매", purchase],
  ];
  /** 면적 → 현재등급 → 직전등급 → 취득시등급 → 1990 공시지가 (설계 §6 이동 순서) */
  const ORDER: [Partial<AssetForm>, string, string][] = [
    [{ acquisitionArea: "" }, "acquisitionArea", "토지 면적 칸을 입력하세요"],
    [{ pre1990Grade_current: "" }, "pre1990Grade_current", "1990.8.30. 현재 토지등급 칸을 입력하세요"],
    [{ pre1990Grade_prev: "" }, "pre1990Grade_prev", "1990.8.30. 직전 토지등급 칸을 입력하세요"],
    [{ pre1990Grade_atAcq: "" }, "pre1990Grade_atAcq", "취득시 토지등급 칸을 입력하세요"],
    [{ pre1990PricePerSqm_1990: "" }, "pre1990PricePerSqm_1990", "1990.1.1. 개별공시지가 칸을 입력하세요"],
  ];

  for (const [name, make] of hosts) {
    it(`A1 ${name} 호스트 + 토지 상속 1984-05-01: ② 완결이면 ⑧ 통과 / 미완이면 첫 미완 칸으로 이동(순서 고정) / 전부 비면 면적 칸`, () => {
      expect(v8(make(SEC164_FILLED)).result).toBeNull();
      for (const [blank, field, msg] of ORDER) {
        const r = v8(make({ ...SEC164_FILLED, ...blank }));
        expect(r.result, field).toContain(msg);
        expect(r.result).toContain("1990.8.30.");
        expect(r.result).not.toContain("landSec164Value");
        expect(r.fieldOf(r.result!), field).toBe(field);
      }
      // 순서: 여러 칸이 비면 먼저 오는 칸
      const r = v8(make({ ...SEC164_FILLED, pre1990Grade_prev: "", pre1990PricePerSqm_1990: "" }));
      expect(r.fieldOf(r.result!)).toBe("pre1990Grade_prev");
      expect(v8(make()).fieldOf(v8(make()).result!)).toBe("acquisitionArea");
    });

    it(`A2 ${name} 호스트: 증여 1988-12-31도 같은 규칙 (§163⑨ 단서 1호는 증여 포함)`, () => {
      const gift = { landAcquisitionCause: "gift" as const, landAcquisitionDate: "1988-12-31", landDecedentAcquisitionDate: "" };
      expect(v8(make({ ...SEC164_FILLED, ...gift })).result).toBeNull();
      const r = v8(make({ ...SEC164_FILLED, ...gift, pre1990Grade_atAcq: "" }));
      expect(r.fieldOf(r.result!)).toBe("pre1990Grade_atAcq");
    });

    it(`A3 ${name} 호스트 경계: 1990-08-29는 ② 요구, 1990-08-30 당일은 ② 없이 통과 (당일은 「고시되기 전」이 아니다)`, () => {
      const hit = v8(make({ landAcquisitionDate: "1990-08-29", landDecedentAcquisitionDate: "1960-01-01" }));
      expect(hit.result).toContain("1990.8.30.");
      expect(hit.fieldOf(hit.result!)).toBe("acquisitionArea");
      expect(v8(make({ landAcquisitionDate: SEC_163_9_LAND_FIRST_DISCLOSURE, landDecedentAcquisitionDate: "1960-01-01" })).result).toBeNull();
    });

    it(`A3′ ${name} 호스트: 면적 방식 「일부 양도」는 areaScenario 칸으로 차단 — ② 5칸이 차 있어도`, () => {
      const r = v8(make({ ...SEC164_FILLED, areaScenario: "partial" }));
      expect(r.result).toContain("일부만 양도");
      expect(r.fieldOf(r.result!)).toBe("areaScenario");
    });

    it(`A3″ ${name} 호스트: 등급번호 모드에서 1 미만(0.5)은 계산 불가 — 불량 등급 칸으로 이동`, () => {
      const r = v8(make({ ...SEC164_FILLED, pre1990GradeMode: "number", pre1990Grade_current: "0.5", pre1990Grade_prev: "10", pre1990Grade_atAcq: "10" }));
      expect(r.result).toContain("계산할 수 없습니다");
      expect(r.fieldOf(r.result!)).toBe("pre1990Grade_current"); // 첫 불량 칸(취득시가 아니다)
    });
  }

  it("A4 ⑧ ≡ ⑫ 정확 일치 격자: 호스트 2 × 원인 2 × 날짜 4 × 입력 상태 8 = 128셀 — ⑧ 통과 ⇔ ⑫ 200, ⑧ 차단 ⇔ ⑫ 400 (Q-4 같은 날 제외)", async () => {
    const dates = ["1984-05-01", "1990-08-29", "1990-08-30", "1991-01-01"];
    const states: [string, Partial<AssetForm>][] = [
      ["완결", {}],
      ["면적 없음", { acquisitionArea: "", transferArea: "" }],
      ["현재등급 없음", { pre1990Grade_current: "" }],
      ["직전등급 없음", { pre1990Grade_prev: "" }],
      ["취득시등급 없음", { pre1990Grade_atAcq: "" }],
      ["1990가 없음", { pre1990PricePerSqm_1990: "" }],
      ["불량 등급", { pre1990GradeMode: "number", pre1990Grade_current: "10", pre1990Grade_prev: "10", pre1990Grade_atAcq: "0.5" }],
      ["일부 양도", { areaScenario: "partial" }],
    ];
    let cells = 0;
    let pass8 = 0;
    for (const [, make] of [["신축", newConstruction], ["매매", purchase]] as const) {
      for (const cause of ["inheritance", "gift"] as const) {
        for (const d of dates) {
          for (const [state, over] of states) {
            const a = make({
              ...SEC164_FILLED,
              landAcquisitionCause: cause,
              landAcquisitionDate: d,
              landDecedentAcquisitionDate: cause === "inheritance" ? "1960-01-01" : "",
              ...over,
            });
            const ok8 = v8(a).result === null;
            const status = (await run(a)).status;
            expect(ok8 ? 200 : 400, `${a.acquisitionCause}/${cause}/${d}/${state}`).toBe(status);
            cells += 1;
            if (ok8) pass8 += 1;
          }
        }
      }
    }
    expect(cells).toBe(128);
    // 통과 셀이 0이면 격자가 공허하다 — 완결 셀과 1990 이후 셀이 있어야 한다
    expect(pass8).toBeGreaterThan(20);
  });

  it("A5 ⑤ 날짜 안내: 1990 전이어도 차단 문구를 내지 않는다(카드가 대체) — Q-4 같은 날 안내는 그대로", () => {
    expect(landPartCauseDateNotice({ ...purchase(SEC164_FILLED) })).toBeNull();
    expect(landPartCauseDateNotice({ ...purchase({ landAcquisitionDate: "2018-03-02" }) })).toContain("취득일이 같으면");
  });

  it("A6 ⑥ 사이드바: 단서 구간이면 pending(결과 도착 전 합계 숨김), 단서 밖(1990-08-30·1991)은 종전 확정값", () => {
    expect(separateAcqPartsSum(purchase(SEC164_FILLED)).pending).toBe(true);
    expect(separateAcqPartsSum(newConstruction(SEC164_FILLED)).pending).toBe(true);
    expect(separateAcqPartsSum(purchase({ ...SEC164_FILLED, landAcquisitionDate: "1990-08-30" }))).toEqual({ sum: 650_000_000, pending: false });
    expect(separateAcqPartsSum(newConstruction({ ...SEC164_FILLED, landAcquisitionDate: "1991-01-01" }))).toEqual({ sum: 700_000_000, pending: false });
    // 토지를 소유하지 않는 파트 구성(건물만 소유)이면 토지 단서 비교는 합계 대상이 아니다 — 건물가만으로 확정
    expect(separateAcqPartsSum(purchase({ ...SEC164_FILLED, selfOwns: "building_only" }))).toEqual({ sum: 350_000_000, pending: false });
    // 호스트 이탈(유효 원인 없음)이면 단서 구간이 아니다 — 평가액 + 건물 가액 확정(긍정 짝)
    expect(separateAcqPartsSum(purchase({ ...SEC164_FILLED, landCauseHost: "" })).pending).toBe(false);
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
// D. 게이트·④ 3경로·래치 비의존
// ─────────────────────────────────────────────────────────────────────────────
describe("D. 게이트 · ④ 3경로 · 래치 비의존", () => {
  const hosts: [string, (o?: Partial<AssetForm>) => AssetForm][] = [["신축", newConstruction], ["매매", purchase]];

  for (const [name, make] of hosts) {
    it(`D1·D2 ${name}: 게이트 landSec164Applies는 유효 원인 ∧ < 1990-08-30 — 래치 pre1990Enabled와 무관`, () => {
      for (const latch of [true, false]) {
        expect(landSec164Applies(make({ pre1990Enabled: latch })), `latch=${latch}`).toBe(true);
        expect(landSec164Applies(make({ pre1990Enabled: latch, landAcquisitionDate: "1990-08-30" }))).toBe(false);
      }
      expect(landSec164Applies(make({ landCauseHost: "" }))).toBe(false);
      expect(landSec164Applies(make({ landAcquisitionCause: "" }))).toBe(false);
    });

    it(`D7 ${name}: ④ 3경로가 완결이면 같은 landSec164Value를, 단서 밖·미완·토글 OFF면 싣지 않는다 (stale 5칸 누수 0)`, async () => {
      const get = async (a: AssetForm) => {
        const single = await bodyOf(a);
        const multi = buildPropertyPayload(form(a)) as Record<string, unknown>;
        const comp = buildAssetPayload(a, "apportioned", TRANSFER_DATE) as Record<string, unknown>;
        return [single.landSec164Value, multi.landSec164Value, comp.landSec164Value];
      };
      const full = await get(make(SEC164_FILLED));
      expect(full[0]).toBeGreaterThan(0);
      expect(full[1]).toBe(full[0]);
      expect(full[2]).toBe(full[0]);
      for (const a of [
        make({ ...SEC164_FILLED, landAcquisitionDate: "1990-08-30" }),
        make({ ...SEC164_FILLED, pre1990Grade_prev: "" }),
        make({ ...SEC164_FILLED, landAcquisitionCause: "", landCauseHost: "" }),
      ]) {
        expect(await get(a)).toEqual([undefined, undefined, undefined]);
      }
    });
  }

  it("D8 ⑧ 날짜 = ④ 날짜: ⑧ 브리지 입력(landDateSent)과 ④ 직독 날짜가 유효 원인에서 같다 — 소유자 분리는 구조 규칙이 먼저 막아 어긋나지 않는다", () => {
    const a = purchase({ ...SEC164_FILLED, selfOwns: "building_only" });
    const r = v8(a);
    expect(r.fieldOf(r.result!)).toBe("landAcquisitionCause"); // 구조 규칙(R-X4)이 ② 규칙보다 앞
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. 엔진 echo → 4뷰 공통 leaf (summarizeSplitGain)
// ─────────────────────────────────────────────────────────────────────────────
describe("E. 결과 echo — summarizeSplitGain · 파트 태그 · 산식 문구", () => {
  const sd = (adopted: "reported" | "sec164", cause: "inheritance" | "gift" = "inheritance") =>
    ({
      selfOwns: "both",
      land: {
        transferPrice: 700_000_000, acquisitionPrice: adopted === "reported" ? 300_000_000 : 400_000_000, directExpenses: 0,
        appraisalDeduction: 0, gain: 0, holdingYears: 40, longTermRate: 0.3, longTermDeduction: 0, acqMode: "actual",
        acquisitionCause: cause,
        acquisitionBasis: { rule: "sec163_9_1", reported: 300_000_000, sec164: 400_000_000 - (adopted === "reported" ? 200_000_000 : 0), adopted },
      },
      building: {
        transferPrice: 500_000_000, acquisitionPrice: 350_000_000, directExpenses: 0, appraisalDeduction: 0, gain: 0,
        holdingYears: 8, longTermRate: 0.16, longTermDeduction: 0, acqMode: "actual", acquisitionCause: "purchase",
      },
    }) as unknown as SplitGainResult;

  it("E1 채택이 ②면 파트 태그 「토지(영 §164④ 가액)」, ①이면 「토지(상속개시일 평가액)」·증여는 「증여 신고가액」 — 거짓 라벨 방지", () => {
    expect(splitAcqFormulaText(sd("sec164"))).toContain("토지(영 §164④ 가액) 400,000,000");
    expect(splitAcqFormulaText(sd("reported"))).toContain("토지(상속개시일 평가액) 300,000,000");
    expect(splitAcqFormulaText(sd("reported", "gift"))).toContain("토지(증여 신고가액) 300,000,000");
  });

  it("E2 summarize는 echo를 그대로 통과 — 채택 금액은 adopted가 가리키는 쪽(동점도 echo 따름), echo 없으면 undefined(구 이력 종전 화면)", () => {
    const part = summarizeSplitGain(sd("sec164")).parts[0];
    const v = splitAcqBasisView(part)!;
    expect(v).toMatchObject({ reported: 300_000_000, sec164: 400_000_000, adopted: "sec164", adoptedLabel: "영 §164④ 가액", adoptedValue: 400_000_000 });
    expect(splitAcqBasisFormula(v)).toBe("토지 취득가액 = 많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 400,000,000) = 400,000,000");
    const old = sd("sec164");
    delete (old.land as unknown as Record<string, unknown>).acquisitionBasis;
    expect(splitAcqBasisView(summarizeSplitGain(old).parts[0])).toBeUndefined();
    expect(splitAcqFormulaText(old)).toContain("토지(상속개시일 평가액)"); // mixedCause 구 이력은 D1-3 종전 라벨
    expect(splitAcqFormulaText(old)).not.toContain("많은 금액");
  });

  it("E3 산식 문구는 숫자 `/`·`÷`를 쓰지 않는다(분수 치환 방지)", () => {
    expect(splitAcqBasisFormula(splitAcqBasisView(summarizeSplitGain(sd("sec164")).parts[0])!)).not.toMatch(/[/÷]/);
  });
});
