/**
 * anchor — 조특법 §97②·§97의2② 임대주택을 1세대1주택 비과세 판정 주택 수에서 뺀다 (명부 행 ⑥ `special`)
 *
 * 법문(조특법 MST 284389 실독 2026-10-02):
 * - §97② 「「소득세법」 제89조제1항제3호를 적용할 때 임대주택은 그 거주자의 소유주택으로 보지 아니한다.」
 * - §97① 「…국민주택…을 2000년 12월 31일 이전에 임대를 개시하여 5년 이상 임대한 후 양도하는 경우에는
 *   그 주택(이하 "임대주택"이라 한다)…」
 * - §97의2② 「신축임대주택에 관하여는 제97조제2항부터 제4항까지의 규정을 준용한다.」
 *
 * 공통 사실관계(계획서 `one-house-exemption-fix.plan.md` §9.8 실측): 비조정 · 양도 2026-08-01 · 양도가 10억 ·
 * 양도 주택 취득 2019-06-01 · 취득가 3억 · 다른 주택 r 1채.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | R97-0 | 수정 전 재현 — r을 주택 수에 넣으면 2주택 과세 237,435,000 |
 * | R97-1 | §97 요건 충족 행 → 1주택 비과세 0 (계산기 단건 route · Zod 경유) |
 * | R97-2 | 임대개시 경계 — 2000-12-31 비과세 / 2001-01-01 과세 |
 * | R97-3 | 본 요건 확인을 끄면 과세 · 불성립 사유가 결과에 남는다 |
 * | R97-4 | §97의2 경로 · 의제 시점(재산46014-259 「임대를 개시한 때부터」) — 임대 5년 미만이어도 개시 후 양도면 비과세 ·
 * |        | 임대개시 = 양도일 2026-08-01 비과세 / 2026-08-02 과세 |
 * | R97-5 | 축 분리 — 3호(감면대상장기임대주택, 중과 축) 칸만 켜면 비과세 주택 수는 그대로 |
 * | R97-6 | 기존 special 조문(§98의2) 회귀 없음 |
 * | R97-7 | ④ — 임대개시일은 §97·§97의2일 때만 싣는다(조문을 바꾼 뒤 남은 값은 보내지 않는다) |
 * | R97-7l | 옛 선언 안내 줄 — 조문 이름과 임대개시일 |
 * | R97-8 | ⑧ — 임대개시일 미입력은 계산기·판정 메뉴 모두 행 번호로 막는다 |
 * | R97-9 | 판정 메뉴 route — 같은 행이 비과세 · 제외 명세에 행 id |
 * | R97-10 | 다건 route ⑫·⑭ — 임대개시일이 strip되지 않고 엔진까지 간다 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { POST as JUDGE_POST } from "@/app/api/calc/one-house-exemption/route";
import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { countExclusionDeclarationLine } from "@/lib/calc/house-count-exclusion-rows";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

const TAXED = 237_435_000;

const row = (id: string, acquisitionDate: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "non_capital",
    acquisitionDate,
    officialPrice: "150000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

const special = (over: Partial<SpecialHouseExclusionFormItem>): SpecialHouseExclusionFormItem => ({
  article: "rental_97",
  houseAcquisitionDate: "",
  houseContractDate: "",
  isNationalHousing: false,
  houseRentalStartDate: "1999-03-01",
  requirementsConfirmed: true,
  ...over,
});
const rentalRow = (over: Partial<SpecialHouseExclusionFormItem> = {}, acq = "1998-01-01") =>
  row("r", acq, { countExclusion: { kind: "special", special: special(over) } });

const judged = (houses: HouseEntry[]) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      { ...makeDefaultAsset(1), residenceInputMode: "direct", residencePeriods: [], assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2019-06-01" },
    ],
    transferDate: "2026-08-01",
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses,
    presaleRights: [],
  }) as unknown as OneHouseJudgmentFormData;

function calcForm(houses: HouseEntry[]): TransferFormData {
  const f = { ...createDefaultTransferFormData(), ...toTransferFormPatch(judged(houses)) } as TransferFormData;
  return {
    ...f,
    householdHousingCount: String(1 + houses.length),
    assets: f.assets.map((a, i) =>
      i === 0 ? ({ ...a, fixedAcquisitionPrice: "300000000", acquisitionPrice: "300000000" } as AssetForm) : a,
    ),
  };
}

async function captureBody(f: TransferFormData): Promise<Record<string, unknown>> {
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
  return cap.body!;
}

type CalcResult = {
  isExempt?: boolean;
  totalTax?: number;
  specialHouseExclusionDetail?: { excludedCount: number; entries: { article: string; houseId?: string; eligible: boolean; reason?: string }[] };
};

async function runCalc(houses: HouseEntry[]): Promise<CalcResult> {
  const f = calcForm(houses);
  expect(collectStepIssues(1, f).map((i) => i.message)).toEqual([]);
  const res = await CALC_POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result;
}

describe("R97-0·1 계산기 단건 route", () => {
  it("[R97-0] 수정 전 재현 — 다른 주택 r을 주택 수에 넣으면 2주택 과세 237,435,000", async () => {
    const r = await runCalc([row("r", "1998-01-01")]);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(TAXED);
  });

  it("[R97-1] r이 §97 임대주택(1999-03-01 임대개시 · 요건 확인) → 1주택 비과세 0", async () => {
    const r = await runCalc([rentalRow()]);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.specialHouseExclusionDetail?.entries).toEqual([
      expect.objectContaining({ article: "rental_97", houseId: "r", eligible: true }),
    ]);
  });
});

describe("R97-2 §97① 「2000년 12월 31일 이전에 임대를 개시하여」 경계", () => {
  it("[R97-2] 2000-12-31 → 비과세", async () => {
    expect((await runCalc([rentalRow({ houseRentalStartDate: "2000-12-31" })])).totalTax).toBe(0);
  });
  it("[R97-2+] 2001-01-01 → 과세 237,435,000 · 사유", async () => {
    const r = await runCalc([rentalRow({ houseRentalStartDate: "2001-01-01" })]);
    expect(r.totalTax).toBe(TAXED);
    expect(r.specialHouseExclusionDetail?.entries[0]).toEqual(
      expect.objectContaining({ eligible: false, reason: expect.stringContaining("2000.12.31 이전에 임대를 개시") }),
    );
  });
});

describe("R97-3 본 요건(국민주택·5호 이상) 확인", () => {
  it("[R97-3] 확인을 끄면 과세 · 사유에 시행령 §97①", async () => {
    const r = await runCalc([rentalRow({ requirementsConfirmed: false })]);
    expect(r.totalTax).toBe(TAXED);
    expect(r.specialHouseExclusionDetail?.entries[0]?.reason).toContain("시행령 §97①");
  });
});

describe("R97-4 의제 시점 — 임대를 개시한 때부터 (국세청 재산46014-259, 2001.03.10.)", () => {
  const r972 = (start: string) => rentalRow({ article: "rental_97_2", houseRentalStartDate: start }, "2001-06-01");
  it("[R97-4] §97의2 · 임대 1년(2025-08-01 개시) — 5년 미만이어도 비과세", async () => {
    const r = await runCalc([r972("2025-08-01")]);
    expect(r.totalTax).toBe(0);
    expect(r.specialHouseExclusionDetail?.entries[0]).toEqual(
      expect.objectContaining({ article: "rental_97_2", eligible: true }),
    );
  });
  it("[R97-4=] 임대개시 = 양도일(2026-08-01) → 비과세 (「개시한 때부터」 · 령 §97⑤1호 초일 산입)", async () => {
    expect((await runCalc([r972("2026-08-01")])).totalTax).toBe(0);
  });
  it("[R97-4+] 임대개시가 양도일 다음 날(2026-08-02) → 과세 · 사유에 해석례", async () => {
    const r = await runCalc([r972("2026-08-02")]);
    expect(r.totalTax).toBe(TAXED);
    expect(r.specialHouseExclusionDetail?.entries[0]?.reason).toContain("재산46014-259");
  });
});

describe("R97-5 축 분리 — 3호 칩은 비과세 주택 수를 바꾸지 않는다", () => {
  it("[R97-5] 3호(감면대상장기임대주택) 칸만 켠 r → 과세 237,435,000 그대로", async () => {
    const r = await runCalc([
      row("r", "1998-01-01", {
        isTaxIncentiveRental: true,
        isTaxIncentiveRentalPurchase: false,
        rentalPeriodYears: "20",
        isNationalSizeHousing: true,
      } as Partial<HouseEntry>),
    ]);
    expect(r.totalTax).toBe(TAXED);
  });
  it("[R97-5+] 짝 — 같은 r에 ⑥ §97을 지정하면 비과세", async () => {
    const r = await runCalc([
      row("r", "1998-01-01", {
        isTaxIncentiveRental: true,
        rentalPeriodYears: "20",
        isNationalSizeHousing: true,
        countExclusion: { kind: "special", special: special({}) },
      } as Partial<HouseEntry>),
    ]);
    expect(r.totalTax).toBe(0);
  });
});

describe("R97-6 기존 special 조문 회귀 없음", () => {
  it("[R97-6] §98의2(취득 2009-06-01 · 요건 확인) → 비과세 / 취득 2011-01-01 → 과세", async () => {
    const s982 = (acq: string) =>
      row("r", acq, { countExclusion: { kind: "special", special: special({ article: "unsold_98_2", houseRentalStartDate: undefined }) } });
    expect((await runCalc([s982("2009-06-01")])).totalTax).toBe(0);
    expect((await runCalc([s982("2011-01-01")])).totalTax).toBe(TAXED);
  });
});

describe("R97-7 ④ 게이트", () => {
  const sent = async (houses: HouseEntry[]) =>
    ((await captureBody(calcForm(houses))).specialHouseExclusions as Record<string, unknown>[])[0];
  it("[R97-7] §97 행 — 임대개시일과 행 id를 싣는다", async () => {
    expect(await sent([rentalRow()])).toEqual(
      expect.objectContaining({ article: "rental_97", houseId: "r", houseRentalStartDate: "1999-03-01" }),
    );
  });
  it("[R97-7+] 조문을 §98의2로 바꾼 뒤 남은 임대개시일은 보내지 않는다", async () => {
    const e = await sent([rentalRow({ article: "unsold_98_2" })]);
    expect(e.article).toBe("unsold_98_2");
    expect(e).not.toHaveProperty("houseRentalStartDate");
  });
});

describe("R97-7l 옛 선언 안내 줄 — 조문 이름·임대개시일(내부 id 미노출)", () => {
  it("[R97-7l] §97 선언 → 「조특법 §97 장기임대주택 — 임대개시일 1999-03-01」", () => {
    expect(countExclusionDeclarationLine(special({}))).toBe("조특법 §97 장기임대주택 — 임대개시일 1999-03-01");
  });
});

describe("R97-8 ⑧ 임대개시일 필수", () => {
  const MSG = "보유 주택 1: 주택 수 제외 — 임대주택의 임대개시일을 입력하세요.";
  it("[R97-8] 계산기 — 미입력이면 막는다", () => {
    expect(collectStepIssues(1, calcForm([rentalRow({ houseRentalStartDate: "" })])).map((i) => i.message)).toContain(MSG);
  });
  it("[R97-8j] 판정 메뉴 — 같은 문구로 막는다", () => {
    const errs = validateStep2(judged([rentalRow({ houseRentalStartDate: "" })]));
    expect(errs.map((e) => e.message)).toContain(MSG);
  });
  it("[R97-8+] 짝 — 입력하면 둘 다 통과", () => {
    expect(collectStepIssues(1, calcForm([rentalRow()])).map((i) => i.message)).not.toContain(MSG);
    expect(validateStep2(judged([rentalRow()])).map((e) => e.message)).not.toContain(MSG);
  });
});

describe("R97-9 판정 메뉴 route", () => {
  async function judge(houses: HouseEntry[]) {
    const res = await JUDGE_POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(judged(houses))),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    return json.data;
  }
  it("[R97-9] §97 행 → 비과세 · 제외 명세에 r", async () => {
    const d = await judge([rentalRow()]);
    expect(d.judgment.isExempt).toBe(true);
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.houseCount.excluded).toEqual([expect.objectContaining({ houseId: "r" })]);
  });
  it("[R97-9+] 짝 — 임대개시 2001-01-01이면 과세(2주택)", async () => {
    const d = await judge([rentalRow({ houseRentalStartDate: "2001-01-01" })]);
    expect(d.judgment.isExempt).toBe(false);
    expect(d.houseCount.countedForExemption).toBe(2);
  });
});

describe("R97-10 다건 route ⑫·⑭", () => {
  async function multi(rentalStart: string | undefined) {
    const payload = buildPropertyPayload(calcForm([row("r", "1998-01-01")])) as Record<string, unknown>;
    const res = await MULTI_POST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify({
          taxYear: 2026,
          properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }],
          specialHouseExclusions: [
            {
              article: "rental_97",
              houseId: "r",
              ...(rentalStart ? { houseRentalStartDate: rentalStart } : {}),
              requirementsConfirmed: true,
            },
          ],
        }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    return json.data.result?.totalTax ?? json.data.totalTax;
  }
  it("[R97-10] 임대개시일이 엔진까지 가면 비과세 0", async () => {
    expect(await multi("1999-03-01")).toBe(0);
  });
  it("[R97-10+] 짝 — 임대개시일이 없으면(strip과 같은 상태) 과세", async () => {
    expect(await multi(undefined)).toBeGreaterThan(0);
  });
});
