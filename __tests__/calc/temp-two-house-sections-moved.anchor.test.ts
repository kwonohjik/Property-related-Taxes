/**
 * anchor(⑤·⑧) — ③ 특례 입력·검증의 **판정 메뉴 이관** (P6-b)
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 | 왜 필요한가 |
 * |---|---|---|
 * | TM-1 | 계산기 ⑧이 §155①·§156의2⑤ 필수값을 **더 이상 요구하지 않는다** | 화면에 칸이 없는데 요구하면 **영구 차단**이다 |
 * | TM-2·3 | 판정 메뉴 ⑧이 **대신 요구한다** | TM-1은 부정형이다 — 짝이 없으면 「검증이 통째로 사라진 것」과 구별되지 않는다 |
 * | TM-4 | 판정 메뉴 게이트가 닫히면(1채) 요구하지 않는다 | 이관한 쪽에서 같은 영구 차단을 재현하지 않는다 |
 * | TM-5 | 계산기 ⑧이 §155⑧·합가는 **여전히** 다룬다 | 이 둘은 이관 대상이 아니다 — 함께 지워지면 중과 입력 경로가 끊긴다 |
 * | TM-6 | ④ 전송 payload가 **바뀌지 않는다** | 위젯만 없앴다. 값이 함께 사라지면 저장된 이력의 세액이 달라진다(OH-21) |
 * | TM-7 | §154① 단서는 **옮길 것이 없다** | 이관했다가 무효과로 되돌린 축 — 근거가 없으면 죽은 코드가 다시 들어온다 |
 *
 * ## 🔑 왜 §155⑧·합가는 남았나 — 중과 배제의 **근거 조문이 다르다**
 *
 * 영 §167의10①**15호**는 「§155 … §154①이 적용되는 주택으로서 **같은 항의 요건을 모두 충족**」
 * 이라는 2요소다 ⇒ 비과세 판정을 반드시 경유한다. 반면 **4호**(§155⑧)와 **§167의3⑨**(혼인
 * 합가 배우자 주택 차감)는 §154①을 요구하지 않는다 — 비과세를 주장할 수 없는 세대가 그
 * 입력을 필요로 한다. 라우트 실측(2026-09-21, 양쪽 모두 `isExempt: false`):
 *
 * - §167의3⑨ — 3주택 · 혼인일 유무: **907,185,000 → 377,970,000**
 * - §167의10①4호 — 2주택 · 거주 0개월 · §155⑧ 유무: **777,435,000 → 131,140,000**
 */
import { describe, it, expect } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { buildReplacementHousePayload } from "@/lib/calc/transfer-tax-api-helpers";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { TEMP_TWO_HOUSE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import { readFileSync } from "node:fs";

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-03-01",
    acquisitionPrice: "600000000",
    actualSalePrice: "2000000000",
    ...over,
  }) as AssetForm;

const form = (over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [asset()],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "2000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: true,
    residencePeriodMonths: "36",
    ...over,
  }) as unknown as TransferFormData;

/** ④ 전송 body를 그대로 본다 — `marriageMerge`는 본문 조립 안에서 붙어 leaf가 따로 없다. */
async function captureBody(f: TransferFormData): Promise<Record<string, unknown>> {
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
  return (captured ?? {}) as Record<string, unknown>;
}

/** ③ 섹션은 계산기 4단계(내부 step 1)에서 검증된다. */
const calcMsgs = (f: TransferFormData) => collectStepIssues(1, f).map((i) => i.message);

/**
 * 🔑 판정 메뉴는 주택 수를 **명부에서 파생**한다(`deriveJudgmentHouseCount` = 양도 대상 1 +
 *    `houses.length`). `householdHousingCount`를 직접 적으면 덮어써진다 — P6-a에서 이
 *    시료가 그렇게 한 번 빨개졌다.
 */
const HOUSE = {
  id: "h1",
  region: "capital" as const,
  acquisitionDate: "2018-01-01",
  officialPrice: "300000000",
  isInherited: false,
};

const judgmentForm = (over: Record<string, unknown> = {}): OneHouseJudgmentFormData =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset()],
    transferDate: "2024-03-01",
    isOneHousehold: true,
    houses: [HOUSE],
    ...over,
  }) as unknown as OneHouseJudgmentFormData;

const judgeMsgs = (f: OneHouseJudgmentFormData) => validateStep2(f).map((e) => e.message);

describe("TM-1·5 계산기 ⑧ — 옮긴 것만 빠지고 남긴 것은 그대로다", () => {
  it("[TM-1a] 일시적 2주택 ON + 신규 취득일 미입력 → 계산기는 막지 않는다", () => {
    const f = form({ temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "" });
    expect(calcMsgs(f).filter((m) => m.startsWith("일시적 2주택:"))).toHaveLength(0);
  });

  it("[TM-1b] 대체주택 ON + 4필드 미입력 → 계산기는 막지 않는다", () => {
    const f = form({ replacementHouseSpecial: true });
    expect(calcMsgs(f).filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(0);
  });

  /**
   * 🔴 **TM-1의 짝이자 이 PR의 안전선.** 계산기가 §155⑧·합가까지 함께 잃으면 비과세를
   *    주장할 수 없는 세대의 중과 입력 경로가 끊긴다(헤더의 두 실측).
   */
  it("[TM-5] 계산기 ⑧이 §155⑧·합가 값을 **삼키지 않는다** — 전송 body가 그것을 담는다", async () => {
    const f = form({
      unavoidableOutsideCapitalSpecial: true,
      unavoidableOutsideCapitalReason: "work",
      unavoidableOutsideCapitalResolvedDate: "2023-06-01",
      marriageDate: "2022-06-01",
      isFirstTransferredInMerge: true,
    });
    // 계산기가 이 두 축을 차단하지 않는다(입력 칸이 화면에 그대로 있다).
    expect(calcMsgs(f).filter((m) => m.includes("수도권 밖"))).toHaveLength(0);
    const payload = buildHouseholdSpecialPayload(f, f.assets[0]) as Record<string, unknown>;
    expect(payload.unavoidableOutsideCapitalHouse).toBeTruthy();
    const body = await captureBody(f);
    expect(body.marriageMerge).toBeTruthy();
    expect(body.isFirstTransferredInMerge).toBe(true);
  });
});

describe("TM-2·3·4 판정 메뉴 ⑧ — **긍정 짝**", () => {
  it("[TM-2] 일시적 2주택 ON + 신규 취득일 미입력 → 판정 메뉴가 막는다", () => {
    const msgs = judgeMsgs(judgmentForm({ temporaryTwoHouseSpecial: true }));
    expect(msgs).toContain("일시적 2주택: 신규 주택 취득일을 입력하세요.");
  });

  it("[TM-3] 대체주택 ON → 4필드를 전부 막는다 (자동 fallback 금지)", () => {
    const msgs = judgeMsgs(judgmentForm({ replacementHouseSpecial: true }));
    expect(msgs.filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(4);
  });

  it("[TM-3b] 날짜를 채우면 통과한다 — 요건 미달 판정은 엔진 몫이다", () => {
    const msgs = judgeMsgs(
      judgmentForm({ temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2023-06-01" }),
    );
    expect(msgs.filter((m) => m.startsWith("일시적 2주택:"))).toHaveLength(0);
  });

  /** 🔑 이관한 쪽에서 「화면엔 칸이 없는데 ⑧이 요구」를 재현하지 않는다. */
  it("[TM-4] 명부가 비어 1주택이면 섹션이 없으므로 stale 플래그도 막지 않는다", () => {
    const msgs = judgeMsgs(
      judgmentForm({ houses: [], temporaryTwoHouseSpecial: true, replacementHouseSpecial: true }),
    );
    expect(msgs.filter((m) => m.startsWith("일시적 2주택:"))).toHaveLength(0);
    expect(msgs.filter((m) => m.startsWith("대체주택 특례:"))).toHaveLength(0);
  });
});

describe("TM-6 ④ 전송 — 위젯만 없앴고 값은 그대로 간다", () => {
  it("[TM-6] ③ 특례 값이 payload에 그대로 실린다", () => {
    const f = form({
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "2023-06-01",
      culturalHeritageHouseSpecial: true,
      replacementHouseSpecial: true,
      replBusinessApprovalDate: "2021-01-01",
      replCompletionDate: "2023-01-01",
      replResidenceMonths: "14",
      replWillResideNewHouse: true,
    });
    const payload = buildHouseholdSpecialPayload(f, f.assets[0]) as Record<string, unknown>;
    expect(payload.temporaryTwoHouse).toBeTruthy();
    expect(payload.culturalHeritageHouse).toBe(true);
    // §156의2⑤는 leaf가 따로다(`buildReplacementHousePayload`) — 한 빌더로 착각하면 조용히 샌다.
    expect((buildReplacementHousePayload(f) as Record<string, unknown>).replacementHouse).toBeTruthy();
  });
});

describe("TM-7 §154① 단서 — **옮길 것이 없다**(무효과 확인)", () => {
  /**
   * 🔴 이 PR에서 처음에 판정 메뉴로 「이관」했다가 되돌린 축이다. 근거를 남기지 않으면
   *    다음 사람이 「검증이 빠졌다」고 읽고 죽은 코드를 다시 넣는다.
   *
   * `TEMP_TWO_HOUSE_PROVISO_REASONS` = §154①**1호·2호가목·3호**(§155① 본문이 인용하는 세 호).
   * 단서 검증 2건이 요구하는 사유는 2호나·다목(`overseas_*`)과 5호(`pre_designation_contract`)로
   * **전부 그 밖**이라, `temporary_two_house` 맥락에서는 정규화가 ""로 만들어 한 건도 안 뜬다.
   */
  it("[TM-7a] 화이트리스트가 단서 검증 2건의 사유를 **전부 배제**한다", () => {
    for (const r of ["overseas_migration", "overseas_residence", "pre_designation_contract"]) {
      expect(TEMP_TWO_HOUSE_PROVISO_REASONS.has(r), r).toBe(false);
    }
    // 화이트리스트가 비어 있지 않음을 함께 본다 — 전건 false가 공허해지지 않게.
    expect(TEMP_TWO_HOUSE_PROVISO_REASONS.has("expropriation")).toBe(true);
  });

  it("[TM-7b] 그래서 일시적 2주택 맥락에서는 계산기도 판정 메뉴도 단서를 막지 않는다", () => {
    const over = {
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "2023-06-01",
      provisoReason: "overseas_migration",
      provisoDepartureDate: "",
    };
    expect(calcMsgs(form(over)).some((m) => m.includes("출국일을 입력하세요"))).toBe(false);
    expect(judgeMsgs(judgmentForm(over)).some((m) => m.includes("출국일을 입력하세요"))).toBe(false);
  });

  /** 🔑 긍정 짝 — 1주택 맥락에서는 **여전히** 막는다(축을 죽인 게 아니다). */
  it("[TM-7c] 1주택 맥락은 계산기가 그대로 막는다", () => {
    const one = form({
      householdHousingCount: "1",
      provisoReason: "overseas_migration",
      provisoDepartureDate: "",
    });
    expect(calcMsgs(one).some((m) => m.includes("출국일을 입력하세요"))).toBe(true);
  });
});

describe("TM-8 소스 — 계산기는 `calc` 모드로만 이 섹션을 쓴다", () => {
  /**
   * ⚠️ 소스 스캔은 **대리 지표**다(`feedback_guard_uses_proxy_not_the_claim`). 실제 렌더는
   *    `__tests__/components/temp-two-house-calc-mode.test.tsx`가 마운트해서 본다 —
   *    P6-a의 RM-6이 `{false && (`로 SURVIVED 된 전례가 그 이유다.
   */
  it("[TM-8] Step4는 mode=\"calc\", 판정 메뉴 Step2는 기본(full)", () => {
    const step4 = readFileSync("app/calc/transfer-tax/steps/Step4.tsx", "utf8");
    expect(step4).toContain('mode="calc"');
    const judge = readFileSync("app/calc/one-house-exemption/steps/Step2.tsx", "utf8");
    expect(judge).toContain("<TemporaryTwoHouseSection");
    expect(judge).not.toContain('mode="calc"');
  });
});
