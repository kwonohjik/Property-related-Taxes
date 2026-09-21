/**
 * P5-a 앵커 — 판정 메뉴 → 계산기 **사실 전달**
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §5.3 · D-3 · OH-18.
 *
 * ## 왜 본문만 보지 않고 **route까지 통과**시키는가
 *
 * 「본문에 키가 있다」는 도달을 증명하지 않는다. Zod가 모르는 키는 **침묵 strip**되고
 * ⑭ 매핑이 없으면 엔진에 닿지 않는다(`feedback_leaf_anchor_skips_zod_layer`).
 * ⇒ H-4·H-5·H-6은 `callTransferTaxAPI`가 만든 본문을 그대로 **계산기 route에 POST**해
 *   비과세 판정이 실제로 뒤집히는지로 관측한다.
 *
 * ## 🔴 이 PR의 핵심 주장은 **H-5·H-6 짝**이다
 *
 * 「사실을 안 넘기면 과세 / 넘기면 비과세」가 같은 폼에서 갈려야 전달이 세액을 실제로 움직인
 * 것이다. 한쪽만 두면 「넘겨도 아무 일 없음」이 초록으로 지나간다
 * (`feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import {
  pickOneHouseExtraFacts,
  toTransferFormPatch,
} from "@/lib/calc/one-house-judgment-handoff";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

/**
 * §155의3 상생임대 **성립** 사실. 엔진 anchor(`one-house-155-2-155-3-special.anchor.test.ts`)가
 * 쓰는 것과 같은 축: 직전 18개월 이상 · 상생 24개월 이상 · 증액 5% 이하.
 */
const WIN_WIN_OK = {
  winWinRentalSpecial: true,
  winWinRentalContractDate: "2022-03-01",
  winWinRentalIncreaseRatePct: "4",
  winWinRentalPriorLeaseMonths: "18",
  winWinRentalLeaseMonths: "24",
} as const;

/**
 * 조정대상지역에서 취득했고 **거주 0개월**인 1주택.
 * §154① 본문대로면 거주 2년 미충족으로 **과세**, §155의3①이 성립하면 거주요건이 면제돼 **비과세**.
 */
function judgmentForm(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-06-01",
    // 🔑 양도가액의 정본은 **폼-전역 `contractTotalPrice`** 다 — 자산에는 그 필드가 없다
    //    (④ 변환이 계약 총액을 지분율로 안분해 `transferPrice`를 만든다).
    contractTotalPrice: "900000000",
    assets: [
      {
        ...f.assets[0],
        assetKind: "housing",
        acquisitionDate: "2021-03-01",
        fixedAcquisitionPrice: "500000000",
        residencePeriodMonthsAsset: "0",
      },
    ],
    residencePeriodMonths: "0",
    wasRegulatedAtAcquisition: true,
    ...over,
  };
}

/** 계산기 폼 — 판정 메뉴 폼과 **같은 사실**에서 출발시킨다(전달 유무만 갈린다). */
function calcForm(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  return {
    ...f,
    isOneHousehold: true,
    householdHousingCount: "1",
    transferDate: "2026-06-01",
    // 🔑 양도가액의 정본은 **폼-전역 `contractTotalPrice`** 다 — 자산에는 그 필드가 없다
    //    (④ 변환이 계약 총액을 지분율로 안분해 `transferPrice`를 만든다).
    contractTotalPrice: "900000000",
    assets: [
      {
        ...f.assets[0],
        assetKind: "housing",
        acquisitionDate: "2021-03-01",
        fixedAcquisitionPrice: "500000000",
        residencePeriodMonthsAsset: "0",
      },
    ],
    residencePeriodMonths: "0",
    wasRegulatedAtAcquisition: true,
    ...over,
  };
}

/** ④ 본문을 가로채고, 그 본문을 그대로 계산기 route에 통과시킨다. */
async function run(form: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();

  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(cap.body),
    }),
  );
  const json = (await res.json()) as {
    data?: { result?: { isExempt?: boolean; exemptReason?: string } };
  };
  return { status: res.status, body: cap.body!, result: json.data?.result };
}

describe("P5-a 전달 leaf — 무엇을 떼어 내는가", () => {
  it("[H-1] 추가 13필드만 떼어 내고 나머지는 계산기 폼에 그대로 붓는다", () => {
    const form = judgmentForm(WIN_WIN_OK);
    const patch = toTransferFormPatch(form);

    // 운반 상자에는 13필드가 들어가고
    expect(patch.importedOneHouseFacts?.winWinRentalSpecial).toBe(true);
    expect(patch.importedOneHouseFacts?.winWinRentalLeaseMonths).toBe("24");
    // 계산기 폼 최상위에는 **평평하게 남지 않는다**
    expect(patch).not.toHaveProperty("winWinRentalSpecial");
    expect(patch).not.toHaveProperty("longTermMortgageContractDate");
    // 공유 필드는 그대로 넘어간다
    expect(patch.isOneHousehold).toBe(true);
    expect(patch.transferDate).toBe("2026-06-01");
  });

  /**
   * 🔴 **주택 수는 파생값으로 확정된다.** 판정 메뉴는 이 스칼라를 store에 쓰지 않고 명부에서
   *    파생하지만(G-1), 계산기는 ⑤·⑧·④가 전부 이 스칼라를 직접 읽는다. 초기값 그대로 넘기면
   *    명부가 2채인데 계산기는 1주택으로 계산한다.
   */
  it("[H-2] 주택 수를 명부에서 파생해 확정한다 (초기값을 그대로 넘기지 않는다)", () => {
    const houses = [{ id: "h1" }, { id: "h2" }] as unknown as HouseEntry[];
    const patch = toTransferFormPatch(judgmentForm({ houses }));
    // 양도 대상 1 + 명부 2 = 3
    expect(patch.householdHousingCount).toBe("3");
  });

  /**
   * 🔑 키 목록을 손으로 적지 않았다는 것을 고정한다. 필드가 하나 늘었을 때 전달이 **조용히**
   *    그것을 빠뜨리면 세액이 달라지는데도 TypeScript는 아무 말도 하지 않는다.
   */
  it("[H-3] 운반 상자는 기본값과 **키 집합이 같다** (손 목록이 아니다)", () => {
    const picked = pickOneHouseExtraFacts(judgmentForm(WIN_WIN_OK));
    expect(Object.keys(picked).sort()).toEqual(
      Object.keys(oneHouseJudgmentExtraDefaults).sort(),
    );
  });

  it("[H-3b] 출처 id는 넘겼을 때만 실린다", () => {
    expect(toTransferFormPatch(judgmentForm()).sourceJudgmentId).toBeUndefined();
    expect(toTransferFormPatch(judgmentForm(), "rec-1").sourceJudgmentId).toBe("rec-1");
  });
});

describe("P5-a 배관 — ④ 본문 → ⑫ Zod → ⑭ 엔진", () => {
  it("[H-4] 넘겨받은 사실이 nested 두 키로 펴져 본문에 실린다", async () => {
    const { body } = await run(
      calcForm({ importedOneHouseFacts: pickOneHouseExtraFacts(judgmentForm(WIN_WIN_OK)) }),
    );
    const w = body.winWinRentalHouse as Record<string, unknown>;
    expect(w).toBeDefined();
    expect(w.winWinContractDate).toBe("2022-03-01");
    expect(w.increaseRatePct).toBe(4);
    expect(w.priorLeaseMonths).toBe(18);
    expect(w.winWinLeaseMonths).toBe(24);
    // 🔑 운반 상자·출처 id는 **전송하지 않는다** — UI 메타다.
    expect(body).not.toHaveProperty("importedOneHouseFacts");
    expect(body).not.toHaveProperty("sourceJudgmentId");
  });

  /** 🔴 H-6의 **부정 짝**. 이것 없이 H-6만 두면 「원래부터 비과세였다」를 구별하지 못한다. */
  it("[H-5] 사실을 넘기지 않으면 조정지역 취득·거주 0년은 **과세**다", async () => {
    const { status, result } = await run(calcForm());
    expect(status).toBe(200);
    expect(result?.isExempt).toBe(false);
  });

  /** 🔴 H-5의 **긍정 짝**. 전달이 실제로 판정을 움직인다. */
  it("[H-6] 같은 폼에 §155의3 사실을 넘기면 거주요건이 면제돼 **비과세**가 된다", async () => {
    const { status, result } = await run(
      calcForm({ importedOneHouseFacts: pickOneHouseExtraFacts(judgmentForm(WIN_WIN_OK)) }),
    );
    expect(status).toBe(200);
    expect(result?.isExempt).toBe(true);
  });

  /**
   * 🔑 **미전달이면 본문이 종전과 똑같아야 한다** — 판정 메뉴를 거치지 않은 사용자의 세액이
   *    이 PR로 바뀌면 안 된다(회귀 0).
   */
  it("[H-7] 판정 메뉴를 거치지 않으면 두 키가 아예 실리지 않는다", async () => {
    const { body } = await run(calcForm());
    expect(body).not.toHaveProperty("winWinRentalHouse");
    expect(body).not.toHaveProperty("longTermMortgageHouse");
  });

  /**
   * 🔑 「전달됐으나 토글 OFF」도 두 키를 보내지 않는다 — 빈 nested를 보내면 Zod가 필수 필드
   *    누락으로 400을 내거나, 통과하더라도 엔진이 0개월 상생임대로 읽는다.
   */
  it("[H-8] 전달됐지만 두 특례가 OFF면 키를 보내지 않는다", async () => {
    const { status, body } = await run(
      calcForm({ importedOneHouseFacts: { ...oneHouseJudgmentExtraDefaults } }),
    );
    expect(status).toBe(200);
    expect(body).not.toHaveProperty("winWinRentalHouse");
    expect(body).not.toHaveProperty("longTermMortgageHouse");
  });

  /**
   * 🔴 **토글이 게이트다 — 날짜가 채워져 있어도 OFF면 보내지 않는다.**
   *
   * H-8은 날짜도 **함께** 비어 있어서, 날짜 검사만 남겨도 통과한다(뮤테이션 M4가 살아남았다).
   * 사용자가 상생임대 날짜를 넣었다가 특례 선언을 끄는 것은 흔한 경로이고, 그때 사실이 조용히
   * 전송되면 **끈 특례로 비과세가 난다**. 이 시료가 그 축을 단독으로 고정한다.
   */
  it("[H-8b] 날짜가 채워져 있어도 **토글이 OFF면** 보내지 않는다", async () => {
    const { status, body } = await run(
      calcForm({
        importedOneHouseFacts: {
          ...oneHouseJudgmentExtraDefaults,
          ...WIN_WIN_OK,
          winWinRentalSpecial: false, // ← 날짜·개월은 그대로, 선언만 OFF
        },
      }),
    );
    expect(status).toBe(200);
    expect(body).not.toHaveProperty("winWinRentalHouse");
  });

  /** §155의2도 같은 축 — 한쪽만 고치고 다른 쪽을 두면 조용히 갈린다. */
  it("[H-8c] §155의2도 토글이 게이트다", async () => {
    const { body } = await run(
      calcForm({
        importedOneHouseFacts: {
          ...oneHouseJudgmentExtraDefaults,
          longTermMortgageSpecial: false,
          longTermMortgageContractDate: "2015-04-01",
          longTermMortgageBorrowerAge: "62",
          longTermMortgageContractYears: "15",
        },
      }),
    );
    expect(body).not.toHaveProperty("longTermMortgageHouse");
  });
});
