/**
 * P4-2b-1 앵커 — 판정 메뉴 **배관**: 폼 → ④ 본문 → ⑫ Zod → ⑭ 엔진
 *
 * 계획서 §20.4 · §20.8 · UI 설계 §10.
 *
 * ## 왜 본문만 보지 않고 **route까지 통과**시키는가
 *
 * 「본문에 키가 있다」는 도달을 증명하지 않는다. Zod가 모르는 키는 **침묵 strip**되고,
 * ⑭ 매핑이 없으면 엔진에 닿지 않는다 — P4-2b-0이 §155의2·§155의3에서 정확히 그 상태를
 * 발견했다. ⇒ 여기 anchor는 대부분 **`POST`를 직접 불러** 판정 결과로 관측한다
 * (`feedback_leaf_anchor_skips_zod_layer`).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import {
  buildOneHouseExemptionApiBody,
  callOneHouseExemptionAPI,
} from "@/lib/calc/one-house-exemption-api";
import {
  createInitialOneHouseJudgmentForm,
  deriveJudgmentHouseCount,
  withDerivedHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import {
  validateStep2,
  validateStep3,
  computeOneHouseJudgmentSummary,
} from "@/lib/calc/one-house-exemption-validate";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

/** 판정이 실제로 나오는 최소 폼 — 각 테스트가 한 축씩만 바꾼다. */
function baseForm(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2024-06-01",
    contractTotalPrice: "1000000000",
    residencePeriodMonths: "60",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2019-06-01" }],
    ...over,
  };
}

/**
 * 명부 1행 — **UI가 실제로 만드는 모양**이다(`HousesListSection.tsx:443-461` `addHouse` 인라인 팩토리).
 *
 * 🔴 손으로 줄여 쓰면 `region`·`isLongTermRental` 누락으로 ⑫가 400을 낸다(실측). 그 상태로
 *    「본문만」 단언하는 테스트를 썼다면 **화면에서는 통과하지 못할 시료**를 고정했을 것이다 —
 *    route까지 통과시키기로 한 이유가 여기서 드러났다.
 */
const house = (id: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "capital",
    acquisitionDate: "2018-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionPrice: "",
    exclusiveArea: "",
    isUnsoldNewHouse: false,
    completionDate: "",
    isSpouseOwned: false,
    isCoInherited: false,
    decedentSameHouseholdAtInheritance: false,
    isRankingDisqualifiedInheritedHouse: false,
    ...over,
  }) as HouseEntry;

async function postForm(form: OneHouseJudgmentFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(form)),
    }),
  );
  return { status: res.status, json: await res.json() };
}

// ── 1. 주택 수 — 명부가 정본 (G-1) ──────────────────────────────────
describe("P4-2b-1 — 명부 파생 주택 수", () => {
  it("[HC-1] 명부가 비면 1채(양도 대상뿐) — 명부는 「다른 보유 주택」이다", () => {
    expect(deriveJudgmentHouseCount(baseForm())).toBe(1);
  });

  it("[HC-2] 명부 1행이면 2채 — 양도 대상 1채를 더한다", () => {
    expect(deriveJudgmentHouseCount(baseForm({ houses: [house("h1")] }))).toBe(2);
    expect(deriveJudgmentHouseCount(baseForm({ houses: [house("h1"), house("h2")] }))).toBe(3);
  });

  it("[HC-3] 분양권·입주권은 더하지 않는다 — §89①3호의 주택 수가 아니다", () => {
    const f = baseForm();
    f.presaleRights = [{ id: "p1", acquisitionDate: "2022-01-01" }] as typeof f.presaleRights;
    expect(deriveJudgmentHouseCount(f)).toBe(1);
  });

  /**
   * 🔴 **이것이 P4-2a와 맞물리는 지점이다.** route는 본문의 스칼라를 믿지 않고
   *    엔진 명부 길이로 **독립 도출**한다. 두 계산이 어긋나면 화면이 말하는 주택 수와
   *    판정에 쓰인 주택 수가 갈린다.
   */
  it("[HC-4] 폼 파생값 == route가 독립 도출한 값 (0·1·2행 전건)", async () => {
    for (const houses of [[], [house("h1")], [house("h1"), house("h2")]]) {
      const form = baseForm({ houses });
      const { json } = await postForm(form);
      expect(json.data.houseCount.total).toBe(deriveJudgmentHouseCount(form));
    }
  });

  it("[HC-5] `withDerivedHouseCount`는 원본을 바꾸지 않는다 — 읽기 전용 파생 뷰", () => {
    const form = baseForm({ houses: [house("h1")] });
    const view = withDerivedHouseCount(form);
    expect(view.householdHousingCount).toBe("2");
    expect(form.householdHousingCount).not.toBe("2");
  });
});

// ── 2. 🔴 provisoGate 함정 — §154① 단서가 조용히 사라지는 자리 ────────
describe("P4-2b-1 — §154① 단서는 파생 주택 수로 게이트된다", () => {
  /**
   * `provisoGate`는 `householdHousingCount` **스칼라**를 인자로 받아 `parseInt`한다.
   * 판정 메뉴는 그 값을 store에 두지 않으므로(Q-8), 어댑터가 파생값을 넣지 않으면
   * `parseInt("") = NaN` → `visible:false` → 사유가 **미전송**된다.
   * 그러면 해외이주로 거주요건이 면제되는 사람이 「거주요건 미충족」 과세 판정을 받는다.
   */
  const OVERSEAS = {
    provisoReason: "overseas_migration" as const,
    provisoDepartureDate: "2023-06-01",
    // 거주요건이 **실제로 걸리는** 시료 — 아니면 단서가 사라져도 결과가 같다(구별력 0).
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: "0",
  };

  it("[PV-1] 본문에 `oneHouseExemptionProviso`가 실린다", () => {
    const body = buildOneHouseExemptionApiBody(baseForm(OVERSEAS));
    expect(body.oneHouseExemptionProviso).toEqual({
      reason: "overseas_migration",
      departureDate: "2023-06-01",
    });
  });

  it("[PV-2] 그 사유가 엔진에 닿아 **비과세**가 된다", async () => {
    const { json } = await postForm(baseForm(OVERSEAS));
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[PV-3] 음성 짝 — 사유가 없으면 같은 시료가 **과세**다", async () => {
    const { json } = await postForm(
      baseForm({ wasRegulatedAtAcquisition: true, residencePeriodMonths: "0" }),
    );
    expect(json.data.judgment.isExempt).toBe(false);
  });

  it("[PV-4] 주택 3채면 단서 카드 자체가 닫히므로 사유를 보내지 않는다 (게이트가 산다)", () => {
    const body = buildOneHouseExemptionApiBody(
      baseForm({ ...OVERSEAS, houses: [house("h1"), house("h2")] }),
    );
    expect(body.oneHouseExemptionProviso).toBeUndefined();
  });
});

// ── 3. 재사용 leaf가 실제로 조립된다 ────────────────────────────────
describe("P4-2b-1 — 계산기 leaf 재사용", () => {
  it("[LF-1] §155① 일시적 2주택 FLAT → nested (`buildHouseholdSpecialPayload`)", async () => {
    const form = baseForm({
      houses: [house("h1")],
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "2020-07-01",
    });
    const body = buildOneHouseExemptionApiBody(form);
    expect(body.temporaryTwoHouse).toEqual({
      previousAcquisitionDate: "2019-06-01",
      newAcquisitionDate: "2020-07-01",
    });
    // 기한 도과 → 조건부·기한이 판정에 실린다(P4-1 축이 배관을 탄다)
    const { json } = await postForm(form);
    expect(json.data.judgment.pending.map((p: { id: string }) => p.id)).toEqual([
      "155-1-disposal-deadline",
    ]);
  });

  it("[LF-2] 명부는 `id:\"selling\"` 행이 앞에 붙어 전송된다", () => {
    const body = buildOneHouseExemptionApiBody(baseForm({ houses: [house("h1")] }));
    const houses = body.houses as Array<{ id: string }>;
    expect(houses[0].id).toBe("selling");
    expect(houses).toHaveLength(2);
    expect(body.sellingHouseId).toBe("selling");
  });

  it("[LF-3] §155② 상속주택이 주택 수에서 빠져 비과세가 된다 (명부 → 제외 → 판정)", async () => {
    const { json } = await postForm(
      baseForm({ houses: [house("h1", { isInherited: true })] }),
    );
    expect(json.data.houseCount.total).toBe(2);
    expect(json.data.houseCount.countedForExemption).toBe(1);
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[LF-4] 중과 전용 `sellingHouseExclusion`은 보내지 않는다 (§3.2-C)", () => {
    const body = buildOneHouseExemptionApiBody(baseForm({ houses: [house("h1")] }));
    const houses = body.houses as Array<Record<string, unknown>>;
    expect(houses[0].isEmployeeHousing).toBeUndefined();
    expect(houses[0].isDayCareCenter).toBeUndefined();
  });
});

// ── 4. §155의2 · §155의3 — 판정 메뉴가 유일한 입력 경로다 ────────────
describe("P4-2b-1 — §155의2·§155의3 FLAT → nested", () => {
  const RESIDENCE_BINDS = { wasRegulatedAtAcquisition: true, residencePeriodMonths: "0" };

  const MORTGAGE_ON = {
    longTermMortgageSpecial: true,
    longTermMortgageContractDate: "2016-01-01",
    longTermMortgageBorrowerAge: "60",
    longTermMortgageContractYears: "10",
    longTermMortgageMaturityLumpSum: true,
  };

  const WIN_WIN_ON = {
    winWinRentalSpecial: true,
    winWinRentalContractDate: "2022-03-01",
    winWinRentalIncreaseRatePct: "5",
    winWinRentalPriorLeaseMonths: "18",
    winWinRentalLeaseMonths: "24",
  };

  it("[MW-1] §155의2 — 문자열 폼값이 number·boolean으로 변환돼 실린다", () => {
    const body = buildOneHouseExemptionApiBody(baseForm(MORTGAGE_ON));
    expect(body.longTermMortgageHouse).toEqual({
      contractDate: "2016-01-01",
      borrowerAgeAtContract: 60,
      contractYears: 10,
      maturityLumpSumRepayment: true,
      transferredBeforeMaturity: false,
      isTransferredHouseMortgaged: true,
    });
  });

  it("[MW-2] §155의2가 엔진에 닿아 거주요건이 면제된다", async () => {
    const { json } = await postForm(baseForm({ ...RESIDENCE_BINDS, ...MORTGAGE_ON }));
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[MW-3] 토글 OFF면 값이 남아 있어도 보내지 않는다", () => {
    const body = buildOneHouseExemptionApiBody(
      buildFormWith({ ...MORTGAGE_ON, longTermMortgageSpecial: false }),
    );
    expect(body.longTermMortgageHouse).toBeUndefined();
  });

  it("[MW-4] §155의3 — 증가율은 **인하(음수)도 통과**한다 (5% 이하 요건)", async () => {
    const body = buildOneHouseExemptionApiBody(
      baseForm({ ...WIN_WIN_ON, winWinRentalIncreaseRatePct: "-3" }),
    );
    expect((body.winWinRentalHouse as { increaseRatePct: number }).increaseRatePct).toBe(-3);
    const { json } = await postForm(baseForm({ ...RESIDENCE_BINDS, ...WIN_WIN_ON }));
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[MW-5] 음성 짝 — 두 특례 없이는 같은 시료가 과세다", async () => {
    const { json } = await postForm(baseForm(RESIDENCE_BINDS));
    expect(json.data.judgment.isExempt).toBe(false);
  });

  function buildFormWith(over: Partial<OneHouseJudgmentFormData>) {
    return baseForm(over);
  }
});

// ── 5. ⑧ validate ↔ ④ 어댑터 fallback 일치 (3중 패턴) ───────────────
describe("P4-2b-1 — validate는 어댑터와 같은 자리에서 막는다", () => {
  it("[VD-1] 예상 양도가액 0은 차단 — Zod `positive()`가 400을 내기 전에 잡는다", async () => {
    const form = baseForm({ contractTotalPrice: "" });
    expect(validateStep3(form).some((e) => e.field === "contractTotalPrice")).toBe(true);
    // 막지 않았다면 route가 400을 냈을 것이라는 증거
    const { status } = await postForm(form);
    expect(status).toBe(400);
  });

  it("[VD-2] 긍정 짝 — 양도가액이 있으면 통과하고 route도 200이다", async () => {
    expect(validateStep3(baseForm()).filter((e) => e.severity === "error")).toEqual([]);
    expect((await postForm(baseForm())).status).toBe(200);
  });

  it("[VD-3] §155의2 토글 ON + 계약일 미입력 = 어댑터가 포기하는 조건 ↔ validate가 막는 조건", () => {
    const form = baseForm({ longTermMortgageSpecial: true });
    expect(buildOneHouseExemptionApiBody(form).longTermMortgageHouse).toBeUndefined();
    expect(validateStep2(form).some((e) => e.field === "longTermMortgageContractDate")).toBe(true);
  });

  it("[VD-4] 1세대 비해당은 **warning**이다 — 사실대로 적을 수 있어야 한다", async () => {
    const form = baseForm({ isOneHousehold: false });
    const { status, json } = await postForm(form);
    expect(status).toBe(200);
    expect(json.data.judgment.isExempt).toBe(false);
  });

  it("[VD-5] 명부 행 취득일 누락은 차단", () => {
    const form = baseForm({ houses: [house("h1", { acquisitionDate: "" })] });
    expect(validateStep2(form).some((e) => e.field === "houses.0.acquisitionDate")).toBe(true);
  });
});

// ── 6. ⑥ 사이드바 요약 ──────────────────────────────────────────────
describe("P4-2b-1 — 사이드바 요약", () => {
  it("[SB-1] 주택 수는 명부 파생 단일 소스를 쓴다", () => {
    const items = computeOneHouseJudgmentSummary(baseForm({ houses: [house("h1")] }));
    expect(items.find((i) => i.label === "세대 보유 주택 수")?.value).toBe("2채");
  });

  it("[SB-2] 선언한 특례만 나열한다 — 성립 여부는 말하지 않는다(엔진 몫)", () => {
    const items = computeOneHouseJudgmentSummary(
      baseForm({ temporaryTwoHouseSpecial: true, winWinRentalSpecial: true }),
    );
    expect(items.find((i) => i.label === "선언한 특례")?.value).toBe("일시적 2주택 · 상생임대주택");
  });

  it("[SB-3] 미입력 금액은 항목 자체를 만들지 않는다 (0원 행 금지)", () => {
    const items = computeOneHouseJudgmentSummary(baseForm({ contractTotalPrice: "" }));
    expect(items.find((i) => i.label === "예상 양도가액")).toBeUndefined();
  });
});

// ── 7. 🔴 응답 envelope — 다른 계산 route와 다르다 (§20.2) ───────────
describe("P4-2b-1 — fetch 래퍼는 판정 route의 envelope를 푼다", () => {
  const origFetch = globalThis.fetch;

  it("[EV-1] 성공은 `data`를 벗겨 낸다 (`result`가 아니다)", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { judgment: { isExempt: true }, houseCount: {} } }), {
        status: 200,
      })) as typeof fetch;
    try {
      const r = await callOneHouseExemptionAPI(baseForm());
      expect(r.judgment.isExempt).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("[EV-2] 실패는 `error.message`를 꺼낸다 — 객체를 그대로 쓰면 `[object Object]`가 된다", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { code: "INVALID_INPUT", message: "입력값이 올바르지 않습니다" } }),
        { status: 400 },
      )) as typeof fetch;
    try {
      await expect(callOneHouseExemptionAPI(baseForm())).rejects.toThrow(
        "입력값이 올바르지 않습니다",
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
