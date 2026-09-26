/**
 * anchor(④·⑧·route) — 1세대1주택 판정 메뉴 **입력 경로·전송** 결함 (리뷰 C2 레인)
 *
 * `docs/reviews/one-house-exemption-review-2026-09.md`의 OH-18 · OH-28 + C1 후속(OH-05 계산기 경로).
 * 화면(⑤) 축은 `one-house-judgment-c2-display.ui.test.tsx`가 본다.
 *
 * | # | 결함 | 무엇을 고정하나 |
 * |---|---|---|
 * | OH-18 | §154⑧3호 동일세대 상속 통산을 판정 메뉴가 받지도 보내지도 않는다 | ④가 4필드를 싣고 route가 통산해 비과세·정확한 기한을 낸다 |
 * | OH-28 | 판정 메뉴가 `reductions: []` 고정 → 조특법 §99의4·§98의9 주택 수 제외가 닿지 않는다 | ④가 선언을 싣고 route가 주택 수를 줄인다 · 불성립 사유가 명세에 남는다 |
 * | OH-05(계산기) | 계산기 ④가 숨은 대체주택 토글을 게이트 없이 보낸다 | 입주권 없는 1주택이면 보내지 않는다 |
 *
 * 법문(KoreanLaw MCP 실독 2026-09-26):
 *  - 「소득세법 시행령」 §154⑧3호(MST 286211) — 「상속받은 주택으로서 상속인과 피상속인이 상속개시
 *    당시 동일세대인 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간」을
 *    제1항의 거주기간·보유기간에 통산한다.
 *  - 「조세특례제한법」 §99의4①(MST 284389) — 「그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로
 *    보아 「소득세법」 제89조제1항제3호를 적용한다」 · ④ 3년 보유 전 양도에도 적용.
 *  - 「조세특례제한법」 §98의9① — 「그 준공후미분양주택을 해당 1세대의 소유주택이 아닌 것으로 보아
 *    같은 법 제89조제1항제3호를 적용한다」.
 *
 * 모든 부정형 단언에 긍정 짝을 둔다(`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { validateStep2, validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { POST } from "@/app/api/calc/one-house-exemption/route";

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    ...over,
  }) as AssetForm;

const jForm = (over: Record<string, unknown> = {}, assetOver: Partial<AssetForm> = {}) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset(assetOver)],
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
    ...over,
  }) as unknown as OneHouseJudgmentFormData;

const errs2 = (f: OneHouseJudgmentFormData) =>
  validateStep2(f).filter((e) => e.severity === "error").map((e) => e.message);
const errs3 = (f: OneHouseJudgmentFormData) =>
  validateStep3(f).filter((e) => e.severity === "error").map((e) => e.message);

/** 판정 메뉴의 실제 배관 — ④ 본문 → route. */
async function judgeForm(f: OneHouseJudgmentFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  return json.data;
}

// ── OH-18 ───────────────────────────────────────────────────────────
/**
 * 리뷰 실패 시나리오: 자녀가 2010년부터 부모와 같은 세대로 거주하다 2023-12-01 상속 →
 * 양도 예정 2024-06-01 · 9억 · 비조정. §154⑧3호 통산으로 보유 2년 충족 → 전액 비과세.
 */
const SAME_HOUSEHOLD: Partial<AssetForm> = {
  acquisitionDate: "2023-12-01",
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "2005-01-01",
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationHoldingStartDate: "2010-01-01",
  decedentCohabitationResidenceMonths: "150",
};

describe("OH-18 §154⑧3호 동일세대 상속 통산 — 판정 메뉴 ④ → route", () => {
  it("[C2-18a] ④가 통산 4필드를 싣는다", () => {
    const body = buildOneHouseExemptionApiBody(jForm({}, SAME_HOUSEHOLD));
    expect(body.acquisitionCause).toBe("inheritance");
    expect(body.decedentSameHouseholdBeforeInheritance).toBe(true);
    expect(body.decedentCohabitationHoldingStartDate).toBe("2010-01-01");
    expect(body.decedentCohabitationResidenceMonths).toBe(150);
  });

  it("[C2-18b] 동일세대 상속 통산 → 지금 양도해도 비과세 · 기한 안내 없음", async () => {
    const d = await judgeForm(jForm({}, SAME_HOUSEHOLD));
    expect(d.judgment.isExempt).toBe(true);
    expect(d.judgment.pending).toEqual([]);
    // ⑦ 결과 화면이 읽는 통산 명세 — 엔진 정본이 낸 기산일·거주 개월
    expect(d.inheritedPeriodConsolidation).toEqual({ holdingStartDate: "2010-01-01", residenceMonths: 150 });
  });

  it("[C2-18b+] 짝 — 동일세대가 아니면 상속개시일부터 센다: 과세 · 보유 기한 2025-11-30", async () => {
    const d = await judgeForm(
      jForm({}, { ...SAME_HOUSEHOLD, decedentSameHouseholdBeforeInheritance: false }),
    );
    expect(d.judgment.isExempt).toBe(false);
    expect(d.judgment.pending.map((p: { id: string }) => p.id)).toEqual(["154-1-holding-years"]);
    expect(String(d.judgment.pending[0].deadline).slice(0, 10)).toBe("2025-11-30");
    expect(d.inheritedPeriodConsolidation).toBeUndefined();
  });

  it("[C2-18b2] 통산해도 2년이 안 되면 기한은 **통산 기산일**부터 — 2023-01-01 개시 → 2024-12-31", async () => {
    const d = await judgeForm(
      jForm({}, { ...SAME_HOUSEHOLD, decedentCohabitationHoldingStartDate: "2023-01-01" }),
    );
    expect(d.judgment.isExempt).toBe(false);
    expect(d.judgment.pending.map((p: { id: string }) => p.id)).toEqual(["154-1-holding-years"]);
    expect(String(d.judgment.pending[0].deadline).slice(0, 10)).toBe("2024-12-31");
  });

  /**
   * 거주 통산 축 — 취득 당시 조정대상지역이면 거주 2년이 필요하다. 상속 후 실거주 6개월 +
   * 통산 18개월 = 24개월이면 충족, 통산 12개월이면 18개월로 미충족. 개월 필드가 실제로 닿는지를 가른다.
   */
  it("[C2-18c] 조정 취득 · 상속 후 거주 6개월 + 통산 18개월 → 거주 2년 충족 → 비과세", async () => {
    const f = (months: string) =>
      jForm(
        { wasRegulatedAtAcquisition: true },
        {
          ...SAME_HOUSEHOLD,
          decedentCohabitationResidenceMonths: months,
          residenceInputMode: "direct",
          residencePeriodMonthsAsset: "6",
        } as Partial<AssetForm>,
      );
    expect((await judgeForm(f("18"))).judgment.isExempt).toBe(true);
    expect((await judgeForm(f("12"))).judgment.isExempt).toBe(false);
  });

  it("[C2-18d] 3중 패턴 — 양도 대상이 조합원입주권이면 ⑤가 칸을 숨기므로 ④도 싣지 않고 ⑧도 요구하지 않는다", () => {
    const f = jForm(
      {},
      {
        ...SAME_HOUSEHOLD,
        assetKind: "right_to_move_in",
        decedentCohabitationHoldingStartDate: "",
      } as Partial<AssetForm>,
    );
    const body = buildOneHouseExemptionApiBody(f);
    expect(body.acquisitionCause).toBeUndefined();
    expect(body.decedentSameHouseholdBeforeInheritance).toBeUndefined();
    expect(errs3(f).filter((m) => m.includes("§154⑧3호"))).toEqual([]);
  });

  it("[C2-18e] ⑧ — 동일세대 선언 · 개시일 미입력은 막는다(④가 보유 기산을 옮기지 못한다)", () => {
    const f = jForm({}, { ...SAME_HOUSEHOLD, decedentCohabitationHoldingStartDate: "" });
    expect(errs3(f).some((m) => m.includes("§154⑧3호"))).toBe(true);
  });

  it("[C2-18e+] 긍정 짝 — 개시일이 있으면 막지 않는다 · 동일세대가 아니면 묻지 않는다", () => {
    expect(errs3(jForm({}, SAME_HOUSEHOLD)).filter((m) => m.includes("§154⑧3호"))).toEqual([]);
    expect(
      errs3(
        jForm({}, { ...SAME_HOUSEHOLD, decedentSameHouseholdBeforeInheritance: false, decedentCohabitationHoldingStartDate: "" }),
      ).filter((m) => m.includes("§154⑧3호")),
    ).toEqual([]);
  });

  it("[C2-18f] 개시일이 상속개시일 이후면 막는다 — 엔진은 그 값을 조용히 버린다", () => {
    const f = jForm({}, { ...SAME_HOUSEHOLD, decedentCohabitationHoldingStartDate: "2024-01-01" });
    expect(errs3(f).some((m) => m.includes("상속개시일"))).toBe(true);
  });

  it("[C2-18g] 개시일이 피상속인 취득일보다 빠르면 막는다(취득 전 보유는 있을 수 없다)", () => {
    const f = jForm({}, { ...SAME_HOUSEHOLD, decedentCohabitationHoldingStartDate: "2003-01-01" });
    expect(errs3(f).some((m) => m.includes("피상속인 취득일보다 빠릅니다"))).toBe(true);
  });

  it("[C2-18h] 상속이면 피상속인 취득일 필수(⑫ refine과 같은 계약) · 입력하면 통과", () => {
    const f = jForm({}, { ...SAME_HOUSEHOLD, decedentAcquisitionDate: "" });
    expect(errs3(f)).toContain("상속받은 주택이면 피상속인 취득일을 입력하세요.");
    expect(errs3(jForm({}, SAME_HOUSEHOLD))).toEqual([]);
    expect(buildOneHouseExemptionApiBody(jForm({}, SAME_HOUSEHOLD)).decedentAcquisitionDate).toBe("2005-01-01");
  });
});

// ── OH-28 ───────────────────────────────────────────────────────────
/** 명부 행 = 조특법 특례 주택(다른 보유 주택). 판정 주택 수는 양도 대상 1 + 명부. */
const ROW = { id: "h1", region: "non_capital", acquisitionDate: "2021-01-01", officialPrice: "150000000", isInherited: false, isLongTermRental: false };

const RURAL_994 = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "2021-01-01",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
} as AssetReductionForm;

const UNSOLD_989 = {
  type: "unsold_98_9",
  unsoldHouseAcquisitionDate: "2024-03-01",
  unsoldHouseAcquisitionPrice: "500000000",
  unsoldHouseExclusiveArea: "84",
  isNonCapitalRegion: true,
  wasOneHouseholdAtAcquisition: true,
  meetsSellerAndContractRequirement: true,
} as AssetReductionForm;

describe("OH-28 조특법 §99의4·§98의9 주택 수 제외 — 판정 메뉴 ④ → route", () => {
  it("[C2-28a] §99의4 농어촌주택 선언 → ④가 싣고 route가 2채 → 1채로 보아 비과세", async () => {
    const f = jForm({ houses: [ROW] }, { reductions: [RURAL_994] });
    const body = buildOneHouseExemptionApiBody(f);
    expect((body.reductions as { type: string }[]).map((r) => r.type)).toEqual(["new_99_4_rural"]);
    const d = await judgeForm(f);
    expect(d.houseCount.total).toBe(2);
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.judgment.isExempt).toBe(true);
  });

  it("[C2-28a+] 짝 — 선언이 없으면 2채 그대로 과세", async () => {
    const d = await judgeForm(jForm({ houses: [ROW] }));
    expect(d.houseCount.countedForExemption).toBe(2);
    expect(d.judgment.isExempt).toBe(false);
  });

  it("[C2-28b] §98의9 준공후미분양 선언 → 1채로 보아 비과세", async () => {
    const row = { ...ROW, acquisitionDate: "2024-03-01" };
    const d = await judgeForm(jForm({ houses: [row] }, { reductions: [UNSOLD_989] }));
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.judgment.isExempt).toBe(true);
  });

  it("[C2-28c] 요건 미달 선언(기준시가 4억 > 3억) → 제외하지 않고, 그 사유를 명세에 남긴다", async () => {
    const rural = { ...RURAL_994, ruralHouseStdPrice: "400000000" } as AssetReductionForm;
    const d = await judgeForm(jForm({ houses: [ROW] }, { reductions: [rural] }));
    expect(d.houseCount.countedForExemption).toBe(2);
    expect(d.judgment.isExempt).toBe(false);
    const notApplied = d.houseCount.notApplied as { label: string; reasons: string[] }[];
    expect(notApplied).toHaveLength(1);
    expect(notApplied[0].reasons.join(" ")).toContain("3억");
  });

  it("[C2-28c+] 짝 — 성립하면 불성립 명세는 없다", async () => {
    const d = await judgeForm(jForm({ houses: [ROW] }, { reductions: [RURAL_994] }));
    expect(d.houseCount.notApplied).toBeUndefined();
  });

  it("[C2-28d] ④는 주택 수 제외 축만 싣는다 — 판정과 무관한 감면 선언은 보내지 않는다", () => {
    const other = { type: "self_farming", farmingYears: "8" } as unknown as AssetReductionForm;
    const body = buildOneHouseExemptionApiBody(jForm({ houses: [ROW] }, { reductions: [other, RURAL_994] }));
    expect((body.reductions as { type: string }[]).map((r) => r.type)).toEqual(["new_99_4_rural"]);
  });

  it("[C2-28e] 3중 패턴 — 양도 대상이 조합원입주권이면 ⑤가 칸을 숨기므로 ④도 보내지 않고 ⑧도 요구하지 않는다", () => {
    const blank = { ...RURAL_994, ruralHouseAcquisitionDate: "" } as AssetReductionForm;
    const f = jForm({ houses: [ROW] }, { assetKind: "right_to_move_in", reductions: [blank] } as Partial<AssetForm>);
    expect(buildOneHouseExemptionApiBody(f).reductions).toEqual([]);
    expect(errs2(f).filter((m) => m.includes("§99의4"))).toEqual([]);
  });

  it("[C2-28f] ⑧ — §99의4 취득일·기준시가 · §98의9 취득일·취득가·면적 필수", () => {
    const r994 = { ...RURAL_994, ruralHouseAcquisitionDate: "", ruralHouseStdPrice: "" } as AssetReductionForm;
    const r989 = { ...UNSOLD_989, unsoldHouseExclusiveArea: "" } as AssetReductionForm;
    const m = errs2(jForm({ houses: [ROW] }, { reductions: [r994, r989] }));
    expect(m.filter((x) => x.includes("§99의4"))).toHaveLength(2);
    expect(m.filter((x) => x.includes("§98의9"))).toHaveLength(1);
  });

  it("[C2-28f+] 긍정 짝 — 채우면 막지 않는다", () => {
    const m = errs2(jForm({ houses: [ROW] }, { reductions: [RURAL_994, UNSOLD_989] }));
    expect(m.filter((x) => x.includes("§99의4") || x.includes("§98의9"))).toEqual([]);
  });
});

// ── OH-05 계산기 경로 (C1 후속) ────────────────────────────────────
const REPL = {
  replacementHouseSpecial: true,
  replBusinessApprovalDate: "2020-01-01",
  replCompletionDate: "2026-12-31",
  replResidenceMonths: "14",
  replWillResideNewHouse: true,
};

const cForm = (over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets: [
      asset({ acquisitionDate: "2023-09-01", acquisitionPrice: "600000000", actualSalePrice: "900000000" } as Partial<AssetForm>),
    ],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "900000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "0",
    ...REPL,
    ...over,
  }) as unknown as TransferFormData;

async function captureCalcBody(f: TransferFormData): Promise<Record<string, unknown>> {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  return captured as Record<string, unknown>;
}

const REDEV_RIGHT = { id: "r1", type: "redevelopment_right", acquisitionDate: "2012-01-01", region: "capital" };

describe("OH-05 계산기 ④ — 대체주택 게이트(판정 메뉴와 같은 조건)", () => {
  it("[C2-05a] 입주권 없는 1주택 — 넘겨받은 stale 대체주택 선언을 단건 ④가 보내지 않는다", async () => {
    expect((await captureCalcBody(cForm())).replacementHouse).toBeUndefined();
  });

  it("[C2-05b] 다건 ④도 같다", () => {
    expect((buildPropertyPayload(cForm()) as Record<string, unknown>).replacementHouse).toBeUndefined();
  });

  it("[C2-05c] 긍정 짝 — 1주택 + 조합원입주권(법령 기본 사례)이면 단건·다건 모두 보낸다", async () => {
    const f = cForm({ presaleRights: [REDEV_RIGHT] });
    expect((await captureCalcBody(f)).replacementHouse).toBeTruthy();
    expect((buildPropertyPayload(f) as Record<string, unknown>).replacementHouse).toBeTruthy();
  });

  it("[C2-05d] 긍정 짝 — 2주택이면 보낸다", async () => {
    expect((await captureCalcBody(cForm({ householdHousingCount: "2" }))).replacementHouse).toBeTruthy();
  });
});
