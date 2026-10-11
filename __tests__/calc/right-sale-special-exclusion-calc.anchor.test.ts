/**
 * anchor — 코드 리뷰 결정 #2: 입주권 양도의 조특 보유 감면주택 제외를 **계산기(단건·다건)에도** 적용한다.
 *
 * 종전에는 제외가 판정 메뉴 route 전처리에만 있어, 같은 명부 행을 넘겨받은 계산기는 그 주택을 「다른 주택」으로 세어
 * 경고 없이 과세했다(G049-current 245,751,000 · G065-era 138,160,000 — 판정 메뉴는 가목 비과세).
 * 해석례(원문 확인 2026-10-11): 사전-2018-법령해석재산-0143(§98의2·§98의5) · 서일46014-11681(§98, 구 영 §155⑯ 구조) ·
 * 조특령 §98②·⑥ — 입주권 양도의 가목 「다른 주택」에서 제외. §98의3·§99의2는 이번 결정의 4개 조문에 없다(별도 결정 대기).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | RS-1 | 단건 ④→⑫→⑭→엔진 | 판정 메뉴에서 넘겨받은 행(G049 §98 · G065 §98의2) → 계산기도 비과세 0 · 선언을 지우면 종전 과세(짝) |
 * | RS-2 | 단건 | 4개 조문 밖(§98의3)은 계산기도 빼지 않는다(음성) |
 * | RS-3 | 단건 ⑭ | 어느 주택인지 모르는 선언(행 id 없음)은 엔진이 빼지 않는다(명부 밖 주택 제외 방지) |
 * | RS-4 | 다건 | 같은 행이 다건 route에서도 같다 |
 * | RS-5 | 12억 초과 | 안분 과세 · 장기보유특별공제율 표는 제외 전과 같다(G3-7 결정 전 세액이 늘지 않는다) |
 * | RS-6 | 결과 | 계산기 결과에 제외 명세가 실린다 · 4개 조문 밖은 싣지 않는다 |
 * | RS-8 | 판정 메뉴 명세 | 「주택 수 제외」 명세도 판정과 같은 4개 조문 목록으로 만든다(S03-6) |
 * | RS-7 | ⑧ | 입주권 양도 — 행 필수값은 4개 조문 행만, 폼 전역 옛 선언은 막는다 |
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { POST as JUDGE_POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { collectCountExclusionIssues, UNLINKED_COUNT_EXCLUSION_MESSAGE } from "@/lib/calc/transfer-tax-validate-count-exclusion";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, observeCase, type RulingCase } from "./one-house-rulings/harness";

const CASES = path.join(__dirname, "one-house-rulings", "cases");
const load = (file: string, id: string) =>
  (JSON.parse(fs.readFileSync(path.join(CASES, file), "utf8")) as RulingCase[]).find((c) => c.id === id)!;
const G049 = load("G049.json", "G049-current");
const G065 = load("G065.json", "G065-era");

const withoutDeclaration = (c: RulingCase): RulingCase =>
  ({ ...c, form: { ...c.form, houses: c.form!.houses!.map((h) => ({ ...h, countExclusion: undefined })) } }) as RulingCase;
const withArticle = (c: RulingCase, article: string): RulingCase =>
  ({
    ...c,
    form: {
      ...c.form,
      houses: c.form!.houses!.map((h) => {
        const ce = h.countExclusion as { kind: "special"; special: object };
        return { ...h, countExclusion: { ...ce, special: { ...ce.special, article } } };
      }),
    },
  }) as RulingCase;
const withPrice = (c: RulingCase, price: string): RulingCase =>
  ({ ...c, form: { ...c.form, contractTotalPrice: price } }) as RulingCase;

/** 판정 메뉴 폼 → 전달 → 계산기 폼. 판정 메뉴가 묻지 않는 §166 산식 입력만 채운다(핸드오프 R-6과 같다). */
function calcFormFrom(c: RulingCase, rightsValue = "500,000,000"): TransferFormData {
  const f = { ...createDefaultTransferFormData(), ...toTransferFormPatch(buildCaseForm(c)) } as TransferFormData;
  return {
    ...f,
    assets: [
      {
        ...f.assets[0],
        fixedAcquisitionPrice: "300,000,000",
        redevSubject: "right",
        redevApprovalDate: c.form!.asset!.redevApprovalDate as string,
        redevApprovalLawBasis: "urban_renovation_art_74",
        redevRightsValue: rightsValue,
        redevSettlementDirection: "pay",
        redevSettlementAmount: "50,000,000",
        redevOriginalAssetType: "housing",
      },
    ],
  } as TransferFormData;
}

async function captureBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } finally {
    vi.unstubAllGlobals();
  }
  return cap.body!;
}

type CalcResult = {
  isExempt?: boolean;
  isPartialExempt?: boolean;
  totalTax?: number;
  longTermHoldingDeduction?: number;
  specialHouseExclusionDetail?: { entries: { article: string; houseId?: string; eligible: boolean }[] };
};

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { result?: CalcResult }; error?: unknown };
  expect(res.status, JSON.stringify(json.error ?? "").slice(0, 300)).toBe(200);
  return json.data!.result!;
}
const calc = async (form: TransferFormData) => post(await captureBody(form));

describe("RS-1 단건 — 판정 메뉴 결론이 계산기에도 같다", () => {
  it("[RS-1a] G049-current(§98) — 판정 비과세 · 계산기 비과세 0", async () => {
    expect((await observeCase(G049)).isExempt).toBe(true);
    const r = await calc(calcFormFrom(G049));
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("[RS-1a+] 짝 — 행의 제외 선언만 지우면 계산기는 종전대로 과세 245,751,000", async () => {
    expect((await observeCase(withoutDeclaration(G049))).isExempt).toBe(false);
    const r = await calc(calcFormFrom(withoutDeclaration(G049)));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(245_751_000);
  });
  it("[RS-1b] G065-era(§98의2) — 판정 비과세 · 계산기 비과세 0", async () => {
    expect((await observeCase(G065)).isExempt).toBe(true);
    const r = await calc(calcFormFrom(G065));
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("[RS-1b+] 짝 — 선언을 지우면 과세 138,160,000", async () => {
    const r = await calc(calcFormFrom(withoutDeclaration(G065)));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(138_160_000);
  });
});

describe("RS-2 해석례 미확보 조문은 계산기도 빼지 않는다", () => {
  it("[RS-2] §98의3 행 — 판정 과세 · 계산기 과세(선언을 싣지도 않는다)", async () => {
    const c = withArticle(G065, "unsold_98_3");
    expect((await observeCase(c)).isExempt).toBe(false);
    const form = calcFormFrom(c);
    const body = await captureBody(form);
    expect(body.specialHouseExclusions ?? []).toEqual([]);
    const r = await post(body);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(138_160_000);
  });
});

describe("RS-3 ⑭ 행 id 없는 선언은 엔진도 빼지 않는다", () => {
  it("[RS-3] API 직접 호출 — houseId를 뺀 선언 → 과세(명부 밖 주택 제외 방지) · 짝: houseId가 있으면 비과세", async () => {
    const body = await captureBody(calcFormFrom(G065));
    const declared = (body.specialHouseExclusions as Record<string, unknown>[])[0];
    expect(declared.houseId).toBe("B");
    const linked = await post(body);
    expect(linked.totalTax).toBe(0);
    const { houseId: _drop, ...unlinked } = declared;
    void _drop;
    const r = await post({ ...body, specialHouseExclusions: [unlinked] });
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(138_160_000);
  });
});

describe("RS-5 12억 초과 — 안분 과세 · 공제율 표 불변(G3-7 결정 전)", () => {
  it("[RS-5] G049 20억: 판정 부분과세 · 계산기 부분과세 · 인가전 분 장기보유공제율 26%는 제외 전과 같다", async () => {
    const c = withPrice(G049, "2000000000");
    const j = await observeCase(c);
    expect(j.isPartialExempt).toBe(true);
    const r = await calc(calcFormFrom(c, "2,000,000,000"));
    expect(r.isPartialExempt).toBe(true);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(209_715_000);
    // 제외 전(선언을 인식하지 못한 종전 세액 634,078,500)에도 공제율은 인가전 분 양도차익의 26%였다 — 표를 바꾸지 않았다.
    expect(r.longTermHoldingDeduction).toBe(208_000_000);
    expect((r.longTermHoldingDeduction! * 100) / 800_000_000).toBe(26);
  });
  it("[RS-5+] 짝 — 선언이 없으면 같은 20억도 안분 없이 전부 과세 634,078,500(종전)", async () => {
    const r = await calc(calcFormFrom(withoutDeclaration(withPrice(G049, "2000000000")), "2,000,000,000"));
    expect(r.isPartialExempt).toBe(false);
    expect(r.totalTax).toBe(634_078_500);
    expect((r.longTermHoldingDeduction! * 100) / 2_000_000_000).toBe(26);
  });
});

describe("RS-6 결과에 제외 명세가 실린다", () => {
  it("[RS-6] G065 — 보유 감면주택 명세(§98의2 · 행 B · 적격)가 있다", async () => {
    const r = await calc(calcFormFrom(G065));
    expect(r.specialHouseExclusionDetail?.entries).toEqual([
      expect.objectContaining({ article: "unsold_98_2", houseId: "B", eligible: true }),
    ]);
  });
  it("[RS-6+] 짝 — 4개 조문 밖(§98의3)은 명세에도 싣지 않는다", async () => {
    const r = await calc(calcFormFrom(withArticle(G065, "unsold_98_3")));
    expect(r.specialHouseExclusionDetail).toBeUndefined();
  });
});

describe("RS-7 ⑧ 검증", () => {
  const issues = (c: RulingCase, patch: Partial<TransferFormData> = {}) =>
    collectCountExclusionIssues({ ...calcFormFrom(c), ...patch });

  it("[RS-7a] 판정 메뉴에서 넘어온 행(4개 조문) — 통과", () => {
    expect(issues(G065)).toEqual([]);
  });
  it("[RS-7b] 입주권 양도는 쓰지 않는 조문 행(§97 임대주택, 임대개시일 없음)의 필수값을 요구하지 않는다 · 짝: 주택 양도는 요구한다", () => {
    const base = calcFormFrom(G065);
    const rental = {
      ...base.houses[0],
      countExclusion: {
        kind: "special",
        special: { article: "rental_97", houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: true },
      },
    } as never;
    const asKind = (assetKind: string): TransferFormData =>
      ({ ...base, houses: [rental], assets: [{ ...base.assets[0], assetKind }] }) as TransferFormData;
    const dateMsg = (f: TransferFormData) => collectCountExclusionIssues(f).some((m) => m.includes("임대개시일"));
    expect(dateMsg(asKind("right_to_move_in"))).toBe(false);
    expect(dateMsg(asKind("housing"))).toBe(true);
  });
  it("[RS-7c] 행 id 없는 폼 전역 옛 선언 → 막는다(삭제 안내) · 짝: 없으면 통과", () => {
    const legacy = {
      article: "unsold_98",
      houseAcquisitionDate: "1997-06-15",
      houseContractDate: "",
      isNationalHousing: false,
      requirementsConfirmed: true,
    };
    expect(issues(G049, { specialHouseExclusions: [legacy] as never })).toContain(UNLINKED_COUNT_EXCLUSION_MESSAGE(1));
    expect(issues(G049)).toEqual([]);
  });
});

describe("RS-8 판정 메뉴 명세 — 판정과 같은 제외 목록 (S03-6)", () => {
  async function houseCount(extra: Record<string, unknown>) {
    const body = { ...(buildOneHouseExemptionApiBody(buildCaseForm(G065)) as Record<string, unknown>), ...extra };
    const res = await JUDGE_POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json?.error ?? "").slice(0, 300)).toBe(200);
    return json.data.houseCount as { excluded: { houseId?: string }[]; countedForExemption: number };
  }
  const specials = (body: Record<string, unknown>) => body.specialHouseExclusions as Record<string, unknown>[];

  it("[RS-8] 4개 조문 행 B만 제외 명세에 있다 — 판정이 쓰지 않는 §98의6(기간 창이 없어 늘 적격으로 평가되는 조문) 선언·§99의4 선언은 명세에도 없다", async () => {
    const base = buildOneHouseExemptionApiBody(buildCaseForm(G065)) as Record<string, unknown>;
    expect((await houseCount({})).excluded.map((x) => x.houseId)).toEqual(["B"]);
    const withUnused = await houseCount({
      specialHouseExclusions: [...specials(base), { ...specials(base)[0], article: "unsold_98_6", houseId: "B2" }],
      reductions: [
        {
          type: "new_99_4_rural",
          houseId: "B",
          ruralHouseAcquisitionDate: "2010-12-15",
          ruralHouseStdPrice: 100_000_000,
          isRegisteredHanok: false,
          isAdjacentArea: false,
          meetsLocationRequirement: true,
          meetsHometownRequirement: false,
        },
      ],
    });
    expect(withUnused.excluded.map((x) => x.houseId)).toEqual(["B"]);
  });
});
