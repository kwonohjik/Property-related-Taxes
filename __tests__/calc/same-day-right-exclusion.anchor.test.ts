/**
 * anchor — 코드 리뷰 결정 #1: 양도일 당일·이후에 취득한 분양권·조합원입주권은 「양도일 현재 보유」가 아니다.
 *
 * 종전에는 분양권·입주권을 양도일과 비교하지 않아, 양도 후(또는 같은 날) 산 권리 하나로 §89②·§89①4호 판정이 과세로 뒤집히고
 * §104⑦ 중과 주택 수에도 산입됐다(주택 명부는 D2로 같은 날 취득분을 이미 뺀다 — `isOwnedAtTransfer`).
 * 이제 주택과 **같은 단일 술어**를 판정 메뉴·단건 계산기(④⑤⑭)가 함께 쓴다.
 *
 * 같은 날 취득분은 순서 규칙(재정경제부 재산세제과-836(2004.7.7.)·서면인터넷방문상담4팀-1697(2004.10.22.))을 권리에
 * 유추한 것이라, 그 제외가 **결론을 가를 때만** 「확인 필요」를 고지한다. 양도일 다음 날 이후 취득분은 문언만으로 보유가 아니라 고지가 없다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | SD-1 | 입주권 양도 + 분양권 | 양도 전 → 과세 / 같은 날 → 비과세 + 고지 / 양도 후 → 비과세(고지 없음) — 판정 메뉴·계산기 |
 * | SD-2 | 입주권 양도 + 두 번째 입주권 | 「1개 보유」 — 같은 날·양도 후는 세지 않는다 · 본문 householdRightCount가 같은 술어(3중 패턴) |
 * | SD-3 | 주택 양도(§89②) | 주택 + 권리 1 + 다른 권리 — 양도 전이면 2권리 배제 / 같은 날은 제외 + 고지 / 양도 후 제외 |
 * | SD-4 | §104⑦ 중과 | 같은 날·양도 후 분양권은 중과 주택 수에 넣지 않는다 — 세액 감소 + 같은 날만 고지 |
 * | SD-5 | 고지 조건 | 같은 날 권리를 넣어도 결론이 같으면 고지하지 않는다 |
 * | SD-6 | #1992 보존 | 입력한 권리가 모두 양도 이후 취득이면 「없음」 확인을 다시 요구하지 않는다 · 목록이 비면 확인이 여전히 필요 |
 * | SD-8 | 다건 route | 같은 매퍼(⑭)라 다건도 같은 술어로 양도일 이후 권리를 중과 주택 수에서 뺀다 |
 * | SD-7 | leaf | 입주권 수 도출(④·⑤·판정 요약) · ⑭ 매퍼 분리 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { POST as JPOST } from "@/app/api/calc/one-house-exemption/route";
import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { resolveHouseholdRightCount, rightsOwnedAtTransfer } from "@/lib/calc/household-house-count";
import {
  householdNoPresaleRightsConfirmedAtTransfer,
  splitPresaleRightsAtTransfer,
} from "@/lib/api/transfer-route-multi-house";
import {
  createInitialOneHouseJudgmentForm,
  deriveJudgmentRightCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { SAME_DAY_RIGHT_NOTICE, SAME_DAY_RIGHT_UNVERIFIED_ID } from "@/lib/tax-engine/one-house/same-day-right";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { makeHouse } from "./one-house-rulings/harness";

type Right = TransferFormData["presaleRights"][number];
const rdev = (id: string, d: string): Right =>
  ({ id, type: "redevelopment_right", acquisitionDate: d, region: "capital", memberOrigin: "successor" }) as unknown as Right;
const presale = (id: string, d: string): Right =>
  ({ id, type: "presale_right", acquisitionDate: d, region: "capital" }) as unknown as Right;

const BEFORE = "전";
const SAME = "같은 날";
const AFTER = "후";
/** 양도일 2024-06-01 기준 / 2026-06-01 기준 취득일 */
const RIGHT_SALE_DATES = { [BEFORE]: "2024-05-01", [SAME]: "2024-06-01", [AFTER]: "2024-08-01" } as const;
const HOUSING_DATES = { [BEFORE]: "2026-04-01", [SAME]: "2026-06-01", [AFTER]: "2026-07-01" } as const;

/** 판정 메뉴 — 조합원입주권 양도(2010 취득 · 인가 2023-05-15 · 인가일 요건 선언 · 9억 · 다른 주택 없음). */
function rightSaleForm(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    assets: [
      {
        ...f.assets[0],
        assetKind: "right_to_move_in",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-04-09",
        redevExemptionEligibleAtApproval: "yes",
        redevApprovalDate: "2023-05-15",
      },
    ],
    ...over,
  };
}
/** 판정 메뉴 — 주택 양도(2015 취득 · 10억 · 2026-06-01 양도). */
function housingSaleForm(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01" }],
    ...over,
  };
}

async function judge(form: OneHouseJudgmentFormData) {
  const res = await JPOST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(form)),
    }),
  );
  const j = await res.json();
  expect(res.status, JSON.stringify(j?.error ?? "").slice(0, 300)).toBe(200);
  const judgment = j.data.judgment as { isExempt: boolean; undetermined: { id: string; reason: string }[] };
  return { isExempt: judgment.isExempt, notice: judgment.undetermined.find((u) => u.id === SAME_DAY_RIGHT_UNVERIFIED_ID) };
}

type CalcResult = { isExempt: boolean; totalTax: number; warnings?: string[] };
async function calc(form: TransferFormData) {
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
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(cap.body),
    }),
  );
  const json = (await res.json()) as { data?: { result?: CalcResult }; error?: unknown };
  expect(res.status, JSON.stringify(json.error ?? "").slice(0, 300)).toBe(200);
  const result = json.data!.result!;
  return { body: cap.body!, result, notice: (result.warnings ?? []).includes(SAME_DAY_RIGHT_NOTICE) };
}

/** 판정 폼 → 전달 → 계산기 폼. 입주권 양도는 §166 산식 입력(판정 메뉴가 묻지 않는 값)을 채운다. */
function calcFormFrom(jf: OneHouseJudgmentFormData, over: Partial<TransferFormData> = {}): TransferFormData {
  const f = { ...createDefaultTransferFormData(), ...toTransferFormPatch(jf), ...over } as TransferFormData;
  const a0 = f.assets[0];
  return {
    ...f,
    assets: [
      a0.assetKind === "right_to_move_in"
        ? {
            ...a0,
            fixedAcquisitionPrice: "300,000,000",
            redevSubject: "right",
            redevApprovalDate: "2023-05-15",
            redevApprovalLawBasis: "urban_renovation_art_74",
            redevRightsValue: "500,000,000",
            redevSettlementDirection: "pay",
            redevSettlementAmount: "50,000,000",
            redevOriginalAssetType: "housing",
          }
        : { ...a0, fixedAcquisitionPrice: "300,000,000" },
    ],
  } as TransferFormData;
}

describe("SD-1 입주권 양도 + 분양권 (가목 「다른 주택 또는 분양권」)", () => {
  const form = (when: keyof typeof RIGHT_SALE_DATES) =>
    rightSaleForm({ presaleRights: [presale("p1", RIGHT_SALE_DATES[when])] });

  it("[SD-1a] 양도 전 취득 분양권 — 판정·계산기 모두 과세(보유로 센다), 고지 없음", async () => {
    const j = await judge(form(BEFORE));
    expect(j.isExempt).toBe(false);
    expect(j.notice).toBeUndefined();
    const c = await calc(calcFormFrom(form(BEFORE)));
    expect(c.result.isExempt).toBe(false);
    expect(c.result.totalTax).toBe(291_951_000);
    expect(c.notice).toBe(false);
  });

  it("[SD-1b] 같은 날 취득 분양권 — 판정·계산기 비과세 + 확인 필요 고지(결론이 갈리므로)", async () => {
    const j = await judge(form(SAME));
    expect(j.isExempt).toBe(true);
    expect(j.notice?.reason).toBe(SAME_DAY_RIGHT_NOTICE);
    const c = await calc(calcFormFrom(form(SAME)));
    expect(c.result.isExempt).toBe(true);
    expect(c.result.totalTax).toBe(0);
    expect(c.notice).toBe(true);
  });

  it("[SD-1c] 양도 다음 날 이후 취득 분양권 — 판정·계산기 비과세, 고지 없음(문언만으로 보유가 아니다)", async () => {
    const j = await judge(form(AFTER));
    expect(j.isExempt).toBe(true);
    expect(j.notice).toBeUndefined();
    const c = await calc(calcFormFrom(form(AFTER)));
    expect(c.result.isExempt).toBe(true);
    expect(c.result.totalTax).toBe(0);
    expect(c.notice).toBe(false);
  });

  it("[SD-1d] 대조 — 분양권이 없으면(목록 없음 · 확인) 비과세, 고지 없음", async () => {
    const j = await judge(rightSaleForm());
    expect(j.isExempt).toBe(true);
    expect(j.notice).toBeUndefined();
    const c = await calc(calcFormFrom(rightSaleForm()));
    expect(c.result.totalTax).toBe(0);
    expect(c.notice).toBe(false);
  });
});

describe("SD-2 입주권 양도 + 두 번째 입주권 (본문 「조합원입주권을 1개 보유한 1세대」)", () => {
  const form = (when: keyof typeof RIGHT_SALE_DATES) =>
    rightSaleForm({ presaleRights: [rdev("r2", RIGHT_SALE_DATES[when])] });

  it("[SD-2] 양도 전 → 입주권 2개 과세 / 같은 날 → 1개 비과세 + 고지 / 양도 후 → 1개 비과세", async () => {
    const results = {} as Record<string, { j: Awaited<ReturnType<typeof judge>>; c: Awaited<ReturnType<typeof calc>> }>;
    for (const when of [BEFORE, SAME, AFTER] as const) {
      results[when] = { j: await judge(form(when)), c: await calc(calcFormFrom(form(when))) };
    }
    expect(results[BEFORE].j.isExempt).toBe(false);
    expect(results[BEFORE].c.result.isExempt).toBe(false);
    expect(results[BEFORE].c.body.householdRightCount).toBe(2);
    expect(results[SAME].j.isExempt).toBe(true);
    expect(results[SAME].j.notice).toBeDefined();
    expect(results[SAME].c.result.isExempt).toBe(true);
    expect(results[SAME].c.body.householdRightCount).toBe(1); // ④가 같은 술어로 도출한다(3중 패턴)
    expect(results[SAME].c.notice).toBe(true);
    expect(results[AFTER].j.isExempt).toBe(true);
    expect(results[AFTER].j.notice).toBeUndefined();
    expect(results[AFTER].c.result.isExempt).toBe(true);
    expect(results[AFTER].c.body.householdRightCount).toBe(1);
    expect(results[AFTER].c.notice).toBe(false);
  });
});

describe("SD-3 주택 양도 — 「주택 + 권리 1개」 + 다른 권리 (§89②)", () => {
  const form = (when: keyof typeof HOUSING_DATES) =>
    housingSaleForm({ presaleRights: [rdev("r1", "2025-03-01"), rdev("r2", HOUSING_DATES[when])] });

  it("[SD-3a] 양도 전 취득 → 권리 2개라 §89② 배제(과세) · 고지 없음", async () => {
    expect((await judge(form(BEFORE))).isExempt).toBe(false);
    const c = await calc(calcFormFrom(form(BEFORE)));
    expect(c.result.isExempt).toBe(false);
    expect(c.result.totalTax).toBe(211_563_000);
    expect(c.notice).toBe(false);
  });
  it("[SD-3b] 같은 날 취득 → 권리 1개로 보아 비과세 + 고지", async () => {
    const j = await judge(form(SAME));
    expect(j.isExempt).toBe(true);
    expect(j.notice).toBeDefined();
    const c = await calc(calcFormFrom(form(SAME)));
    expect(c.result.isExempt).toBe(true);
    expect(c.result.totalTax).toBe(0);
    expect(c.notice).toBe(true);
  });
  it("[SD-3c] 양도 후 취득 → 권리 1개로 보아 비과세 · 고지 없음", async () => {
    const j = await judge(form(AFTER));
    expect(j.isExempt).toBe(true);
    expect(j.notice).toBeUndefined();
    const c = await calc(calcFormFrom(form(AFTER)));
    expect(c.result.totalTax).toBe(0);
    expect(c.notice).toBe(false);
  });
});

describe("SD-4 §104⑦ 중과 주택 수 (주택 + 다른 주택 1채 + 분양권)", () => {
  async function total(when: keyof typeof HOUSING_DATES) {
    const jf = housingSaleForm({
      houses: [makeHouse("h1", { acquisitionDate: "2018-01-01", region: "capital" })],
      presaleRights: [presale("p1", HOUSING_DATES[when])],
    });
    return calc(calcFormFrom(jf, { isRegulatedArea: true, isRegulatedAreaTouched: true }));
  }
  it("[SD-4] 양도 전 분양권은 3주택 중과 512,886,000 · 같은 날·양도 후는 2주택 436,161,000 · 같은 날만 고지", async () => {
    const before = await total(BEFORE);
    const same = await total(SAME);
    const after = await total(AFTER);
    expect(before.result.totalTax).toBe(512_886_000);
    expect(before.notice).toBe(false);
    expect(same.result.totalTax).toBe(436_161_000);
    expect(same.notice).toBe(true);
    expect(after.result.totalTax).toBe(436_161_000);
    expect(after.notice).toBe(false);
  });
});

describe("SD-5 결론을 가르지 않으면 고지하지 않는다", () => {
  it("[SD-5] 주택 + 같은 날 권리 1개 — 보유로 세어도(§156의2③ 예외) 비과세라 결론이 같다 → 고지 없음", async () => {
    const jf = housingSaleForm({ presaleRights: [rdev("r1", HOUSING_DATES[SAME])] });
    const j = await judge(jf);
    expect(j.isExempt).toBe(true);
    expect(j.notice).toBeUndefined();
    const c = await calc(calcFormFrom(jf));
    expect(c.result.totalTax).toBe(0);
    expect(c.notice).toBe(false);
  });
  it("[SD-5+] 짝 — 같은 날 권리가 아닌 일반 보유 권리만 있으면 고지 없음(같은 날 목록이 비었다)", async () => {
    const jf = housingSaleForm({ presaleRights: [rdev("r1", "2025-03-01")] });
    expect((await judge(jf)).notice).toBeUndefined();
    expect((await calc(calcFormFrom(jf))).notice).toBe(false);
  });
});

describe("SD-6 #1992 — 「없음」 확인은 목록이 비었을 때만 본다", () => {
  const rightSale = (rights: Right[]) => calcFormFrom(rightSaleForm({ presaleRights: rights }));

  it("[SD-6a] 입력한 권리가 모두 양도 이후 취득 → 본문 확인은 false여도 비과세(막다른 길 없음)", async () => {
    const c = await calc(rightSale([presale("p1", RIGHT_SALE_DATES[AFTER])]));
    expect(c.body.householdNoPresaleRightsConfirmed).toBe(false);
    expect(c.result.isExempt).toBe(true);
  });
  it("[SD-6b] 짝 — 목록이 비었는데 확인이 false → 가목 판정 불가(과세), 확인 true → 비과세", async () => {
    const empty = rightSale([]);
    const unconfirmed = await calc({ ...empty, householdNoPresaleRightsConfirmed: false });
    expect(unconfirmed.result.isExempt).toBe(false);
    const confirmed = await calc({ ...empty, householdNoPresaleRightsConfirmed: true });
    expect(confirmed.result.isExempt).toBe(true);
  });
});

describe("SD-7 leaf", () => {
  const rights = [
    { id: "a", type: "redevelopment_right" as const, acquisitionDate: "2024-05-01", region: "capital" as const },
    { id: "b", type: "redevelopment_right" as const, acquisitionDate: "2024-06-01", region: "capital" as const },
    { id: "c", type: "redevelopment_right" as const, acquisitionDate: "2024-07-01", region: "capital" as const },
  ];

  it("[SD-7a] 입주권 수 — 양도일 이전 취득분만 센다(④ · ⑤ · 판정 요약이 같은 술어)", () => {
    expect(rightsOwnedAtTransfer(rights, "2024-06-01").map((r) => r.id)).toEqual(["a"]);
    expect(resolveHouseholdRightCount("right_to_move_in", rights, "2024-06-01")).toBe(2); // 양도 대상 1 + 보유 1
    expect(resolveHouseholdRightCount("housing", rights, "2024-06-01")).toBe(1);
    expect(deriveJudgmentRightCount({ ...rightSaleForm({ presaleRights: rights as never }) })).toBe(2);
    // 양도일이 없으면 거르지 않는다(주택 명부와 같은 규약)
    expect(resolveHouseholdRightCount("right_to_move_in", rights, undefined)).toBe(4);
  });

  it("[SD-7b] ⑭ 매퍼 — 양도일 이전·같은 날·이후를 가르고, 이후 취득분은 어디에도 싣지 않는다", () => {
    const { held, sameDay } = splitPresaleRightsAtTransfer(rights, "2024-06-01");
    expect(held.map((r) => r.id)).toEqual(["a"]);
    expect(sameDay.map((r) => r.id)).toEqual(["b"]);
    expect(splitPresaleRightsAtTransfer(rights, undefined).held).toHaveLength(3);
  });

  it("[SD-7c] 확인 echo — 입력한 권리가 모두 이후 취득분이면 true, 목록이 비면 원값 그대로", () => {
    expect(householdNoPresaleRightsConfirmedAtTransfer([rights[1], rights[2]], "2024-06-01", false)).toBe(true);
    expect(householdNoPresaleRightsConfirmedAtTransfer(rights, "2024-06-01", false)).toBe(false);
    expect(householdNoPresaleRightsConfirmedAtTransfer([], "2024-06-01", false)).toBe(false);
    expect(householdNoPresaleRightsConfirmedAtTransfer(undefined, "2024-06-01", undefined)).toBeUndefined();
  });
});

describe("SD-8 다건 route ⑭ — 같은 매퍼", () => {
  async function multi(when: keyof typeof HOUSING_DATES) {
    const jf = housingSaleForm({
      houses: [makeHouse("h1", { acquisitionDate: "2018-01-01", region: "capital" })],
      presaleRights: [presale("p1", HOUSING_DATES[when])],
    });
    const payload = buildPropertyPayload(calcFormFrom(jf, { isRegulatedArea: true, isRegulatedAreaTouched: true })) as Record<string, unknown>;
    const res = await MULTI_POST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify({ taxYear: 2026, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }] }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    const data = json.data.result ?? json.data;
    return { total: data.totalTax as number, notice: ((data.warnings ?? []) as string[]).includes(SAME_DAY_RIGHT_NOTICE) };
  }
  it("[SD-8] 양도 전 분양권은 3주택 중과(단건과 같은 512,886,000) · 같은 날·양도 후는 2주택(436,161,000) · 같은 날만 고지", async () => {
    expect(await multi(BEFORE)).toEqual({ total: 512_886_000, notice: false });
    expect(await multi(SAME)).toEqual({ total: 436_161_000, notice: true });
    expect(await multi(AFTER)).toEqual({ total: 436_161_000, notice: false });
  });
});
