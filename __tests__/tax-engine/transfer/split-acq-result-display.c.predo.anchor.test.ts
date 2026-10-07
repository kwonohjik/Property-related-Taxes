/**
 * Pre-Do anchor — **토지·건물 별개 취득(split) 엔진 단계 문구(steps) 정합** (Phase C · H-2)
 *
 * 설계: `docs/02-design/features/transfer-split-acq-result-display.engine.design.md`
 * 계획: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.1 H-2 · §6
 *
 * ## 이 파일이 고정하는 것 (Do 완료 후 — Pre-Do 표식은 반전·해제했다)
 *
 *   R   현행 **금액** 회귀선 — Phase C는 문구만 바꾼다. 금액 6종(파트 양도차익·파트 장특공제·양도차익·
 *       장특공제 합·과세표준)이 하나라도 달라지면 이 그룹이 깬다. 기대값은 BigInt 정수 나눗셈으로 낸
 *       **독립 산식**이다(엔진 출력 복사 아님).
 *   S   수정 후 문구·금액(설계서 §4) — skip을 해제했다. 「양도가 − 취득가 − 경비」 문구를 글자 그대로 계산하면
 *       단계 amount가 나온다(`evalGainFormula`). 종전 결함 표식(D-0 그룹: `취득가(0)`·`× 0%`)은 반전돼 삭제했다.
 *   F-1 LTHD 「공제율 → 공제액」 부동소수 1원 과소 — **세액이 바뀐 유일한 변경**(별 커밋).
 *   (신규 echo·leaf·집계 echo anchor는 `split-acq-result-display.c.echo.anchor.test.ts`, 공용 fixture는
 *    `_helpers/split-acq-display-fixture.ts`.)
 *
 * ## 실측 출처 (2026-10-07, 워크트리 `-c`, master `bf789b0d0`)
 *
 * 같은 입력을 폼 → ④(`callTransferTaxAPI`) → Route(`POST`) 전 구간으로도 돌려 body가
 * `useEstimatedAcquisition:false`·`acquisitionPrice:0`·`expenses:0`임을 확인했다. R-9가 그 대응을 고정한다.
 *
 * ⚠️ 수치는 mock 세율표 기준이고 fixture는 가상(실제 신고 사례 아님)이다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calcLongTermHoldingDeduction, parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import {
  D, won, mulDiv, rates, SCN_N, SCN_H, COMBOS, model, run, step,
  type Mode, type Model, type Combo,
} from "./_helpers/split-acq-display-fixture";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_TOTAL_EST_ACQ,
  PHD_TOTAL_GAIN,
  PHD_LAND_TRANSFER_PRICE,
  PHD_BLDG_TRANSFER_PRICE,
} from "../transfer-tax/_helpers/pre-housing-disclosure-fixture";

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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);


// ═══════════════════════════════════════════════════════════════════════
// R — 현행 금액 회귀선 (활성 · Phase C 전후 불변)
// ═══════════════════════════════════════════════════════════════════════
describe("R 금액 회귀선 — 문구만 바꾸고 금액은 그대로", () => {
  for (const [scnKey, scn] of [["N", SCN_N], ["H", SCN_H]] as const) {
    for (const [key, combo] of Object.entries(COMBOS)) {
      it(`R-1 ${scnKey}:${key} 파트 양도차익·장특공제 · 합계 · 과세표준이 독립 산식과 일치`, () => {
        const m = model(scn, combo);
        const r = run(scn, combo);
        const sd = r.splitDetail!;
        expect(sd.land.gain, "토지 양도차익").toBe(m.land.gain);
        expect(sd.building.gain, "건물 양도차익").toBe(m.building.gain);
        expect(sd.land.acquisitionPrice, "토지 취득가액 echo").toBe(m.land.acquisition);
        expect(sd.building.acquisitionPrice, "건물 취득가액 echo").toBe(m.building.acquisition);
        expect(sd.land.appraisalDeduction, "토지 개산공제").toBe(m.land.deduction);
        expect(sd.building.appraisalDeduction, "건물 개산공제").toBe(m.building.deduction);
        expect(sd.land.longTermDeduction, "토지 장특").toBe(m.land.ltd);
        expect(sd.building.longTermDeduction, "건물 장특").toBe(m.building.ltd);
        expect(r.transferGain).toBe(m.transferGain);
        expect(r.longTermHoldingDeduction).toBe(m.ltd);
        expect(r.taxBase).toBe(m.taxBase);
      });
    }
  }

  it("R-2 파트 양도차익 합 = 단건 transferGain 단 하나 — 문구 합계의 정본이 된다", () => {
    for (const combo of Object.values(COMBOS)) {
      const r = run(SCN_N, combo);
      expect(r.splitDetail!.land.gain + r.splitDetail!.building.gain).toBe(r.transferGain);
    }
  });

  it("R-3 파트 양도가 합 = 양도가액 (문구 「양도가」 합계의 정본)", () => {
    const r = run(SCN_N, COMBOS.AE);
    expect(r.splitDetail!.land.transferPrice + r.splitDetail!.building.transferPrice).toBe(SCN_N.price);
  });

  it("R-4 결과 단일 플래그는 파트 모드를 따르지 않는다 — usedEstimatedAcquisition=false · expenses=0 · longTermHoldingRate=0", () => {
    // 이 사실이 H-2의 근원이다. Phase C는 이 플래그의 의미를 **바꾸지 않는다**(신고서·명세서 소비처 다수 — 설계서 Q-C5).
    const r = run(SCN_N, COMBOS.EE);
    expect(r.usedEstimatedAcquisition).toBe(false);
    expect(r.expenses).toBe(0);
    expect(r.longTermHoldingRate).toBe(0);
    // 그런데도 파트별 개산공제는 실재한다 — 문구는 이 echo를 읽어야 한다.
    expect(r.splitDetail!.building.appraisalDeduction).toBe(1_500_000);
  });

  it("R-5 표2 sub-step 계약 — 표2(H)에서만 보유·거주 sub-step이 나오고 거주분 amount > 0 (isTable2Applied 신호)", () => {
    const h = run(SCN_H, COMBOS.AE);
    expect(step(h, "보유 기간분 장특"), "표2는 sub-step을 낸다").toBeDefined();
    expect(step(h, "거주 기간분 장특")!.amount, "거주분 > 0이 표2 판정 신호다").toBeGreaterThan(0);
    const n = run(SCN_N, COMBOS.AE);
    expect(step(n, "보유 기간분 장특"), "표1은 sub-step이 없다").toBeUndefined();
    expect(step(n, "거주 기간분 장특")).toBeUndefined();
  });

  it("R-6 sub-step 두 값의 합 = 장특공제 총액 — 불변식(금액 배분은 바뀌어도 이 합은 유지)", () => {
    for (const combo of Object.values(COMBOS)) {
      const r = run(SCN_H, combo);
      expect(step(r, "보유 기간분 장특")!.amount + step(r, "거주 기간분 장특")!.amount).toBe(r.longTermHoldingDeduction);
    }
  });

  it("R-7 단계 순서·라벨 — 「양도차익 계산」 → (과세 양도차익) → 「장기보유특별공제」 — findStepByLabel first-match 의존", () => {
    const labels = run(SCN_H, COMBOS.AE).steps.map((x) => x.label);
    const iGain = labels.indexOf("양도차익 계산");
    const iProrate = labels.findIndex((l) => /^과세 양도차익 \(\d+억 초과분\)$/.test(l));
    const iLthd = labels.indexOf("장기보유특별공제");
    expect(iGain).toBeGreaterThanOrEqual(0);
    expect(iProrate).toBeGreaterThan(iGain);
    expect(iLthd).toBeGreaterThan(iProrate);
    // 「양도차익」·「장기보유」 부분일치 first-match가 본 step이어야 한다 — 앞에 같은 단어 step이 끼면 상세명세서가 엉뚱한 문구를 읽는다.
    expect(labels.find((l) => l.includes("양도차익"))).toBe("양도차익 계산");
    expect(labels.find((l) => l.includes("장기보유"))).toBe("장기보유특별공제");
  });

  it("R-8 12억 안분 문구는 합계 기준으로 이미 정합하다 (Phase C 대상 아님)", () => {
    const m = model(SCN_H, COMBOS.AE);
    const r = run(SCN_H, COMBOS.AE);
    const s = r.steps.find((x) => /^과세 양도차익 \(12억 초과분\)$/.test(x.label))!;
    expect(s.amount).toBe(m.taxableGain);
    expect(s.formula).toBe(
      `${won(m.transferGain)} × (양도가 ${won(SCN_H.price)} - 12억) / (양도가 ${won(SCN_H.price)})`,
    );
  });
});

describe("R-10 파트 과세 양도차익의 합은 taxableGain과 1원 다를 수 있다 — 문구가 「합 = taxableGain」을 단정하면 안 된다", () => {
  it("R-10 양도 1,500,000,001 (12억 초과 안분을 파트별로 floor) — Σ 파트 229,999,999 ≠ 전체 230,000,000", () => {
    const P = 1_500_000_001;
    const landT = mulDiv(P, 450_000_000, 600_000_000);
    const bldT = P - landT;
    const landGain = landT - 200_000_001;
    const bldGain = bldT - 150_000_003;
    const landTaxable = mulDiv(landGain, P - 1_200_000_000, P);
    const bldTaxable = mulDiv(bldGain, P - 1_200_000_000, P);
    const wholeTaxable = mulDiv(landGain + bldGain, P - 1_200_000_000, P);
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: P, transferDate: D("2026-07-01"),
        acquisitionDate: D("2019-06-01"), landAcquisitionDate: D("2011-06-01"), acquisitionPrice: 0,
        isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 84,
        isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
        landAcquisitionPrice: 200_000_001, buildingAcquisitionPrice: 150_000_003,
        landStandardPriceAtTransfer: 450_000_000, buildingStandardPriceAtTransfer: 150_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(landTaxable + bldTaxable).toBe(229_999_999);
    expect(wholeTaxable).toBe(230_000_000);
    expect(r.taxableGain).toBe(wholeTaxable);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(landTaxable);
    expect(r.splitDetail!.building.taxableGainAfterProration).toBe(bldTaxable);
    // 장특공제는 **파트 값 기준**이다 — 합산 기준 재계산과 1원 어긋날 수 있다(이 값이 정본)
    expect(r.longTermHoldingDeduction).toBe(
      mulDiv(landTaxable, 68, 100) + mulDiv(bldTaxable, 56, 100),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// R-9 — 폼 → ④ → Route 전 구간이 같은 금액·같은 현행 문구를 낸다 (⑫ Zod 경유)
// ═══════════════════════════════════════════════════════════════════════
function gForm(over: Record<string, unknown>): TransferFormData {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-06-01",
    landAcquisitionDate: "2011-06-01",
    hasSeperateLandAcquisitionDate: true,
    saleSplitMode: "apportioned",
    actualSalePrice: "900,000,000",
    landStandardPriceAtTransfer: "300,000,000",
    buildingStandardPriceAtTransfer: "100,000,000",
    // ㎡당 단가 칸은 쉼표 없는 raw 숫자다(`parseFloat` 사용 — `transfer-tax-api-split.ts:249-250`)
    standardPricePerSqmAtAcq: "1000000",
    acquisitionArea: "150",
    buildingStandardPriceAtAcq: "50,000,000",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  } as unknown as AssetForm;
  return {
    transferDate: "2026-07-01",
    filingDate: "2026-09-30",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "900,000,000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  } as unknown as TransferFormData;
}

async function viaRoute(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        isNonBusinessLand: false, annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: { result?: TransferTaxResult }; error?: unknown };
  return { status: res.status, body: cap.body!, result: json.data?.result, error: json.error };
}

describe("R-9 폼 → ④ → Route 전 구간 (⑫ Zod 경유) — 직접 호출 fixture와 같은 금액", () => {
  for (const [key, over] of [
    ["AE", { landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "200,000,000" }],
    ["EE", { landAcqMode: "estimated", buildingAcqMode: "estimated" }],
  ] as const) {
    it(`R-9 ${key}`, async () => {
      const r = await viaRoute(gForm(over));
      expect(r.status, JSON.stringify(r.error)).toBe(200);
      // body 실측 — 파트 모드가 환산이어도 자산 단위 플래그·취득가·경비는 이 값이다
      expect(r.body.useEstimatedAcquisition).toBe(false);
      expect(r.body.acquisitionPrice).toBe(0);
      expect(r.body.expenses).toBe(0);
      const m = model(SCN_N, COMBOS[key]);
      expect(r.result!.transferGain).toBe(m.transferGain);
      expect(r.result!.longTermHoldingDeduction).toBe(m.ltd);
      expect(r.result!.taxBase).toBe(m.taxBase);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 양도차익 문구 평가기 — 「양도가(…) - 취득가(…) - 경비(…)」를 글자 그대로 계산한다
// ═══════════════════════════════════════════════════════════════════════
/**
 * 「양도가(…) - 취득가(…) - 경비(…)」 문구를 **글자 그대로 계산**한다. 괄호 안의 금액(쉼표 있는 수 또는 단독 0)을
 * 더해 양도가 − 취득가 − 경비를 낸다. 조문 번호(§97②2호)·연수(15년)처럼 쉼표 없는 숫자는 줍지 않는다.
 */
function evalGainFormula(formula: string): number | null {
  const grab = (head: string): number | null => {
    const m = formula.match(new RegExp(`${head}\\(([^)]*)\\)`));
    if (!m) return null;
    const nums = m[1].match(/(?<![§\d②,])\d{1,3}(?:,\d{3})+(?![\d,])|(?<![§\d②,])0(?![\d,])/g) ?? [];
    return nums.reduce((s, x) => s + Number(x.replace(/,/g, "")), 0);
  };
  const t = grab("양도가");
  const a = grab("취득가");
  const e = grab("경비");
  return t == null || a == null || e == null ? null : t - a - e;
}

// ═══════════════════════════════════════════════════════════════════════
// S — 수정 후 기대 (skip) — 설계서 §4 문구 규격. Do(C)에서 skip 해제.
// ═══════════════════════════════════════════════════════════════════════
// 결정 9 — 입력 화면 라디오 어휘(실거래가·환산취득가·감정가액·매매사례가액)로 전 뷰 통일
const TAG: Record<Mode, string> = {
  actual: "실거래가",
  estimated: "환산취득가",
  appraisal: "감정가액",
  salesCase: "매매사례가액",
};

/** 설계서 §4.1 규격 — 독립 조립(엔진 출력을 읽지 않는다). swap이 없는 조합 전용. */
function expectedGainFormula(m: Model, c: Combo, owned: { land: boolean; building: boolean } = { land: true, building: true }): string {
  const parts = [
    owned.land ? { name: "토지", p: m.land, mode: c.land } : null,
    owned.building ? { name: "건물", p: m.building, mode: c.building } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const join = (xs: string[]) => (xs.length ? xs.join(" + ") : "0");
  const tp = join(parts.map((x) => `${x.name} ${won(x.p.transferPrice)}`));
  const acq = join(parts.map((x) => `${x.name} ${TAG[x.mode]} ${won(x.p.acquisition)}`));
  const exp = join(parts.filter((x) => x.p.deduction > 0).map((x) => `${x.name} 개산공제 ${won(x.p.deduction)}`));
  return `양도가(${tp}) - 취득가(${acq}) - 경비(${exp})`;
}

describe("S 수정 후 기대 — 양도차익 문구 (H-2 · 설계서 §4.1)", () => {
  for (const key of Object.keys(COMBOS)) {
    it(`S-1 N:${key} 문구가 파트 합 기준이고 값이 금액을 만든다`, () => {
      const m = model(SCN_N, COMBOS[key]);
      const r = run(SCN_N, COMBOS[key]);
      const s = step(r, "양도차익 계산")!;
      expect(s.formula).toBe(expectedGainFormula(m, COMBOS[key]));
      expect(evalGainFormula(s.formula), "문구를 계산한 값 = 금액").toBe(s.amount);
      expect(s.amount).toBe(m.transferGain);
    });
  }

  it("S-2 실가 파트 자본적지출 5,000,000 + 건물 환산 — 경비는 두 갈래 합이다 (D-0c 반전)", () => {
    const r = run(SCN_N, COMBOS.AE, { landDirectExpenses: 5_000_000 });
    const s = step(r, "양도차익 계산")!;
    expect(s.formula).toBe(
      `양도가(토지 ${won(675_000_000)} + 건물 ${won(225_000_000)}) - 취득가(토지 실거래가 ${won(200_000_000)} + 건물 환산취득가 ${won(112_500_000)}) - 경비(토지 자본적지출·양도비 ${won(5_000_000)} + 건물 개산공제 ${won(1_500_000)})`,
    );
    expect(evalGainFormula(s.formula)).toBe(s.amount);
  });

  it("S-3 소유자 분리 land_only — 소유 파트만 적는다 (D-0d 반전)", () => {
    const r = run(SCN_N, COMBOS.AE, { selfOwns: "land_only" });
    const s = step(r, "양도차익 계산")!;
    expect(s.formula).toBe(`양도가(토지 ${won(675_000_000)}) - 취득가(토지 실거래가 ${won(200_000_000)}) - 경비(0)`);
    expect(evalGainFormula(s.formula)).toBe(s.amount);
    expect(s.amount).toBe(475_000_000);
  });

  it("S-4 §97②2호 단서(swap) — swap 파트는 취득가를 차감하지 않고 필요경비로 대체한다 (D-0e 반전, 조문 번호는 문구에 넣지 않는다)", () => {
    const r = run(SCN_N, COMBOS.AE, { buildingDirectExpenses: 150_000_000 });
    const s = step(r, "양도차익 계산")!;
    // 취득가는 토지 실거래가만, 경비는 건물 자본적지출·양도비 150,000,000 (환산취득가·개산공제 대신)
    expect(s.formula).toBe(
      `양도가(토지 ${won(675_000_000)} + 건물 ${won(225_000_000)}) - 취득가(토지 실거래가 ${won(200_000_000)}) - 경비(건물 자본적지출·양도비 ${won(150_000_000)} — 환산취득가액·개산공제 대신 적용)`,
    );
    expect(evalGainFormula(s.formula)).toBe(s.amount);
    expect(s.amount).toBe(550_000_000);
  });

  it("S-5 PHD — 경비에 파트별 개산공제가 실린다 (D-0f 반전)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: PHD_TRANSFER_PRICE, transferDate: D("2023-02-16"),
        acquisitionDate: D("2014-09-14"), landAcquisitionDate: D("2013-06-01"), acquisitionPrice: 0,
        useEstimatedAcquisition: true, acquisitionMethod: "estimated", expenses: 0,
        isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
        landSplitMode: "apportioned", preHousingDisclosure: PHD_INPUT,
      } as Partial<TransferTaxInput>),
      rates,
    );
    const s = step(r, "양도차익 계산")!;
    // 양도가는 Excel 정본 파트값, 취득가 합은 정본 총 환산취득가, 경비 합은 항등식 값 — 파트 분해값은 형식만 본다
    expect(s.formula).toMatch(
      new RegExp(
        `^양도가\\(토지 ${won(PHD_LAND_TRANSFER_PRICE)} \\+ 건물 ${won(PHD_BLDG_TRANSFER_PRICE)}\\) - 취득가\\(토지 환산취득가 [\\d,]+ \\+ 건물 환산취득가 [\\d,]+\\) - 경비\\(토지 개산공제 [\\d,]+ \\+ 건물 개산공제 [\\d,]+\\)$`,
      ),
    );
    expect(evalGainFormula(s.formula)).toBe(PHD_TOTAL_GAIN);
    const nums = (head: string) =>
      (s.formula.match(new RegExp(`${head}\\(([^)]*)\\)`))![1].match(/\d{1,3}(?:,\d{3})+/g) ?? []).map((x) => Number(x.replace(/,/g, "")));
    expect(nums("취득가").reduce((a, b) => a + b, 0)).toBe(PHD_TOTAL_EST_ACQ);
    expect(nums("경비").reduce((a, b) => a + b, 0)).toBe(PHD_TRANSFER_PRICE - PHD_TOTAL_EST_ACQ - PHD_TOTAL_GAIN);
  });

  it("S-6 전액 과세 12억 초과(H) — 양도차익 문구도 같은 규격 (안분 step은 R-8로 불변)", () => {
    const m = model(SCN_H, COMBOS.AE);
    const r = run(SCN_H, COMBOS.AE);
    const s = step(r, "양도차익 계산")!;
    expect(s.formula).toBe(expectedGainFormula(m, COMBOS.AE));
    expect(evalGainFormula(s.formula)).toBe(s.amount);
  });
});

describe("S 수정 후 기대 — 장기보유특별공제 문구·sub-step (H-2 · 설계서 §4.2~§4.3)", () => {
  it("S-7 표1(N:AE) — 파트별 과세 양도차익 × 파트별 공제율 = 파트별 공제액의 합", () => {
    const m = model(SCN_N, COMBOS.AE);
    const r = run(SCN_N, COMBOS.AE);
    const s = step(r, "장기보유특별공제")!;
    expect(s.amount).toBe(m.ltd);
    expect(s.formula).toBe(
      `토지분 ${won(m.land.taxableGain)} × 30% = ${won(m.land.ltd)} (보유 15년×2% = 30%, 30% 한도)`
        + ` + 건물분 ${won(m.building.taxableGain)} × 14% = ${won(m.building.ltd)} (보유 7년×2% = 14%, 30% 한도)`,
    );
    expect(m.land.ltd + m.building.ltd).toBe(s.amount);
    expect(s.formula, "공제율 0% · 건물 보유연수 단독 설명 문구가 사라진다").not.toContain("× 0%");
  });

  it("S-8 표2(H:AE) — 파트별 보유율+거주율 · 합 = 장특공제", () => {
    const m = model(SCN_H, COMBOS.AE);
    const r = run(SCN_H, COMBOS.AE);
    const s = step(r, "장기보유특별공제")!;
    expect(s.amount).toBe(m.ltd); // 153,632,000
    expect(s.formula).toBe(
      `토지분 ${won(m.land.taxableGain)} × 68% = ${won(m.land.ltd)} (보유 15년×4%=40% + 거주 7년×4%=28%)`
        + ` + 건물분 ${won(m.building.taxableGain)} × 56% = ${won(m.building.ltd)} (보유 7년×4%=28% + 거주 7년×4%=28%)`,
    );
  });

  for (const key of Object.keys(COMBOS)) {
    it(`S-9 표2 H:${key} — sub-step 금액이 파트 합 (보유분 + 거주분 = 총액, 신고서 split-2col과 같은 값)`, () => {
      const m = model(SCN_H, COMBOS[key]);
      const r = run(SCN_H, COMBOS[key]);
      const hold = step(r, "보유 기간분 장특")!;
      const res = step(r, "거주 기간분 장특")!;
      expect(hold.amount).toBe(m.holdTotal);
      expect(res.amount).toBe(m.resTotal);
      expect(hold.amount + res.amount).toBe(r.longTermHoldingDeduction);
      expect(hold.sub).toBe(true);
      expect(res.sub).toBe(true);
      // 문구에 값 두 개가 모두 있고 합이 금액이다 (곱셈 등식을 주장하지 않는다 — 1원 잔액 흡수 때문)
      const nums = (f: string) => (f.match(/\d{1,3}(?:,\d{3})+/g) ?? []).map((x) => Number(x.replace(/,/g, "")));
      expect(nums(hold.formula)).toContain(m.land.holdAmt);
      expect(nums(hold.formula)).toContain(m.building.holdAmt);
      expect(nums(res.formula)).toContain(m.land.resAmt);
      expect(nums(res.formula)).toContain(m.building.resAmt);
    });
  }

  it("S-10 sub-step 라벨·존재 계약 불변 — isTable2Applied가 읽는 신호 (R-5와 같다)", () => {
    const h = run(SCN_H, COMBOS.AE);
    expect(h.steps.some((x) => x.label === "보유 기간분 장특" && x.sub)).toBe(true);
    expect(h.steps.some((x) => x.label === "거주 기간분 장특" && x.sub && x.amount > 0)).toBe(true);
    const n = run(SCN_N, COMBOS.AE);
    expect(n.steps.some((x) => x.label === "보유 기간분 장특")).toBe(false);
  });

  it("S-11 소유 파트만 — land_only(N)는 토지분만 적는다", () => {
    const m = model(SCN_N, COMBOS.AE);
    const r = run(SCN_N, COMBOS.AE, { selfOwns: "land_only" });
    const s = step(r, "장기보유특별공제")!;
    expect(s.amount).toBe(m.land.ltd);
    expect(s.formula).toBe(`토지분 ${won(m.land.taxableGain)} × 30% = ${won(m.land.ltd)} (보유 15년×2% = 30%, 30% 한도)`);
    expect(s.formula).not.toContain("건물분");
  });

  it("S-12 보유 3년 미만 파트 — 공제율 0%임을 문구가 말한다 (건물 2년)", () => {
    // 건물 취득 2024-08-01 → 보유 1년 11개월(2년 미만) · 토지 15년
    const r = run(SCN_N, COMBOS.AE, { acquisitionDate: D("2024-08-01") });
    const s = step(r, "장기보유특별공제")!;
    expect(s.formula).toContain("건물분");
    expect(s.formula).toMatch(/건물분 [\d,]+ × 0% = 0 \(보유 1년 — 3년 미만은 공제 없음\)/);
  });
});

describe("F-1 LTHD 「공제율 → 공제액」의 부동소수 1원 과소 — split · 가업상속 후단 · 장기임대 §97의3 (설계서 F-1)", () => {
  /**
   * 🔴 실측(2026-10-07, 실엔진): 1세대1주택 · 토지 2017-06-01 · 건물 2017-07-01(둘 다 보유 9년) · 거주 96개월 · 양도 30억.
   * 파트 공제율 = 보유 9년×4%(36%) + 거주 8년×4%(32%) = 0.6799999999999999(double).
   * `transfer-tax-lthd.ts` split 분기가 `applyRate`(= Math.floor(금액 × 율))를 써서 토지 652,799,999 · 건물 448,799,999
   * (정확값 652,800,000 · 448,800,000)를 냈다. 같은 파일의 다른 지점은 D10-06(77e627537)에서 `applyLthdRate`
   * (정수 분수)로 바꿨으나 이 분기와 아래 두 분기는 빠졌다 — 커밋 메시지는 「6곳」만 열거하고 제외 근거를 적지 않았다.
   */
  it("F-1 split 파트 공제액 = 정수 분수연산 정확값 (토지 652,800,000 · 건물 448,800,000)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 3_000_000_000, transferDate: D("2026-07-01"),
        acquisitionDate: D("2017-07-01"), landAcquisitionDate: D("2017-06-01"), acquisitionPrice: 0,
        isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 96,
        isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
        landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
        landStandardPriceAtTransfer: 600_000_000, buildingStandardPriceAtTransfer: 400_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    const sd = r.splitDetail!;
    const landTaxable = mulDiv(1_600_000_000, 3_000_000_000 - 1_200_000_000, 3_000_000_000); // 960,000,000
    const bldTaxable = mulDiv(1_100_000_000, 3_000_000_000 - 1_200_000_000, 3_000_000_000); // 660,000,000
    expect(sd.land.taxableGainAfterProration).toBe(landTaxable);
    expect(sd.land.longTermRate, "공제율 자체는 double 합산 그대로(고친 것은 적용이다)").toBe(0.6799999999999999);
    expect(sd.land.longTermDeduction).toBe(mulDiv(landTaxable, 68, 100)); // 652,800,000
    expect(sd.building.longTermDeduction).toBe(mulDiv(bldTaxable, 68, 100)); // 448,800,000
    expect(r.longTermHoldingDeduction).toBe(1_101_600_000);
  });

  const rateTable = parseRatesFromMap(makeMockRates());
  it("F-1b 가업상속 §95④ 후단 — 거주분 율(율 − 보유분 율의 double 뺄셈 0.07999999999999999)도 정확값", () => {
    // 상속인 보유 4년(16%) + 거주 2년(8%) · 피상속인 취득일 기산 26년(40%) · 가업상속공제적용률 50%
    const input = baseTransferInput({
      transferPrice: 3_000_000_000, transferDate: D("2026-07-01"), acquisitionPrice: 500_000_000,
      acquisitionDate: D("2022-03-01"), isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 24,
      fbLthdLatter: { appliedRate: 0.5, decedentAcquisitionDate: D("2000-01-01") },
    } as Partial<TransferTaxInput>);
    const r = calcLongTermHoldingDeduction(1_000_000_000, input, rateTable.longTermHoldingRules, false, false);
    // 피상속인분 5억 × 40% + 상속인분 5억 × 16% + 전체 10억 × 8% = 2억 + 0.8억 + 0.8억
    expect(200_000_000 + 80_000_000 + 80_000_000).toBe(360_000_000);
    expect(r.deduction).toBe(360_000_000);
  });

  it("F-1c 장기임대 §97의3 — 임대분 70% 적용도 정수 분수연산 (양도차익 167,796,000 × 70% = 117,457,200)", () => {
    const input = baseTransferInput({
      transferPrice: 1_500_000_000, transferDate: D("2026-07-01"), acquisitionPrice: 500_000_000,
      acquisitionDate: D("2013-01-01"), isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000,
      reductions: [{
        type: "rental_97_3", registrationDate: D("2013-01-01"), rentalStartDate: D("2013-01-01"),
        isTaxRegistered: true, isNationalHousingScale: true, officialPriceAtStart: 300_000_000, region: "capital",
        isPrivateConstructionRental: true, rentalContinuesToTransfer: true,
      }],
    } as Partial<TransferTaxInput>);
    const r = calcLongTermHoldingDeduction(167_796_000, input, rateTable.longTermHoldingRules, false, false);
    expect((r.rental97LthdDetail as { rentalGainRatio?: number } | undefined)?.rentalGainRatio, "임대분 비율 1 — 전액 70%").toBe(1);
    expect(mulDiv(167_796_000, 70, 100)).toBe(117_457_200);
    expect(r.deduction).toBe(117_457_200);
  });
});
