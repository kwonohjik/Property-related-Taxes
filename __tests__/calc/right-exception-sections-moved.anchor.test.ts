/**
 * anchor: §89② 권리 예외 3섹션 **이관** — 값·세액 불변 + dead-end 부재 (P6-a)
 *
 * 계획서 §5.4 OH-21 · §31.
 *
 * ## 🔴 이 PR이 위험한 이유는 「값이 사라지는 것」이 아니다
 *
 * 13필드는 `TransferFormData` **flat**이고 ④가 계속 읽는다 — 위젯을 지워도 값은 폼에 남아
 * 세액을 바꾼다. 실제 위험은 **두 가지**이고 둘 다 조용하다:
 *
 *   ① **영구 차단** — 화면엔 칸이 없는데 ⑧이 그 값을 요구하면, 채울 방법도 해제할 방법도
 *      없이 계산이 막힌다. 2026-09-07에 같은 모양으로 4건이 났고 그때 만든 술어가
 *      `rightThreeYearExceptionVisible`이다.
 *   ② **보이지 않는 값이 세액을 바꾸는 상태** — 이력을 다시 열면 값이 살아나 세액을 바꾸는데
 *      화면 어디에도 그 값이 없다. 읽기 전용 요약이 그 방어선이다.
 *
 * ## 🔑 검증은 **이관**이지 삭제가 아니다
 *
 * 필수값 검증은 계산기에서 사라지고 판정 메뉴로 갔다. 양쪽을 **함께** 단언해야
 * 「계산기에서 뺐는데 판정 메뉴에도 없는」 상태를 잡는다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";

/**
 * ④가 실제로 만드는 body를 캡처한다 — 손으로 적으면 ④가 필드를 빠뜨려도 초록이다
 * (`feedback_leaf_anchor_skips_zod_layer` 형제 축).
 */
async function captureBody(form: TransferFormData): Promise<Record<string, unknown>> {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  return (captured ?? {}) as Record<string, unknown>;
}

/** 3년을 넘겨 양도한 세대 — 권리 예외 카드가 열리는 조합. */
function baseForm(over: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0
        ? {
            ...a,
            assetKind: "housing" as const,
            acquisitionDate: "2015-06-01",
            actualSalePrice: "900000000",
            fixedAcquisitionPrice: "500000000",
          }
        : a,
    ),
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    presaleRights: [
      { id: "r1", type: "redevelopment_right" as const, acquisitionDate: "2016-10-01", region: "capital" as const },
    ],
    ...over,
  } as TransferFormData;
}

describe("P6-a ① dead-end 부재 — 계산기가 없는 칸을 요구하지 않는다", () => {
  /**
   * 🔴 **핵심.** 종류만 고르고 필수값이 빈 상태는 이력에서 실제로 복원될 수 있다.
   *    계산기에 그 칸이 없으므로 ⑧이 막으면 사용자는 **아무것도 할 수 없다**.
   */
  it.each([
    ["new_house(완성일 미입력)", { rightThreeYearExceptionKind: "new_house" as const }],
    ["delay(사유 미선택)", { rightThreeYearExceptionKind: "delay" as const }],
  ])("[RM-1] 계산기는 3년 초과 예외 필수값으로 %s를 막지 않는다", (_l, over) => {
    const messages = collectStepIssues(1, baseForm(over)).map((i) => i.message);
    expect(messages.some((m) => /3년 초과 예외/.test(m))).toBe(false);
  });

  /**
   * 🔑 **긍정 짝 — 검증이 사라진 것이 아니라 옮겨갔다.** 이 단언이 없으면 위 RM-1은
   *    「검증을 통째로 지웠다」와 구별되지 않는다(`feedback_negative_anchor_needs_positive_twin`).
   */
  it.each([
    ["new_house", "new_house" as const, /신축주택 완성일/],
    ["delay", "delay" as const, /사유를 선택/],
  ])("[RM-2] 판정 메뉴가 그 필수값을 막는다 — %s", (_l, kind, re) => {
    const jf = {
      ...createInitialOneHouseJudgmentForm(),
      ...baseForm({ rightThreeYearExceptionKind: kind }),
    };
    expect(validateStep2(jf).some((e) => re.test(e.message))).toBe(true);
  });
});

describe("P6-a ② 값 불변 — ④가 계속 읽는다 (OH-21)", () => {
  /**
   * 🔴 **P6 이전 저장 record를 다시 열었을 때 세액이 같아야 한다.** 위젯만 없앴으므로 flat
   *    값은 그대로 body에 실려야 한다 — 실리지 않으면 재계산 세액이 조용히 달라진다.
   */
  it("[RM-3] 권리 예외 값이 여전히 body에 실린다", async () => {
    const body = await captureBody(
      baseForm({
        rightThreeYearExceptionKind: "new_house",
        rightNewHouseCompletionDate: "2020-05-01",
        rightMovedInWithin3Years: true,
        rightResidedOneYearOrMore: true,
        generalHouseHeldAtInheritance: true,
        mergedHouseholdFirstHouseKind: "house_only",
      }),
    );

    expect(body.rightThreeYearException).toBeDefined();
    expect(body.generalHouseHeldAtInheritance).toBe(true);
    expect(body.mergedHouseholdFirstHouse).toMatchObject({ kind: "house_only" });
  });

  /** 🔑 선언이 없으면 키도 없다 — 「선언 안 함」이 「아님」으로 굳지 않는다. */
  it("[RM-4] 선언하지 않으면 키를 만들지 않는다", async () => {
    const body = await captureBody(baseForm());
    expect(body.rightThreeYearException).toBeUndefined();
  });
});

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const STEP4 = "app/calc/transfer-tax/steps/Step4.tsx";
const JUDGE_STEP2 = "app/calc/one-house-exemption/steps/Step2.tsx";

describe("P6-a ③ 배선 — 뺀 곳과 남은 곳", () => {
  it.each([
    "RightThreeYearExceptionSection",
    "InheritedRightExceptionSection",
    "MergedHouseholdRightSection",
  ])("[RM-5] 계산기에서 «%s»가 사라지고 판정 메뉴에 남아 있다", (name) => {
    expect(read(STEP4).includes(`<${name}`), `${STEP4}에 아직 남아 있다`).toBe(false);
    expect(read(JUDGE_STEP2)).toContain(`<${name}`);
  });

  /**
   * 🔴 **보이지 않는 값이 세액을 바꾸는 상태를 막는 유일한 방어선.** 요약 카드가 권리 값을
   *    읽지 않으면, 이력에서 복원된 13필드가 화면 어디에도 없는 채로 세액을 움직인다.
   */
  it("[RM-6] 읽기 전용 요약이 권리 값을 받는다", () => {
    expect(read(STEP4)).toMatch(/<ImportedOneHouseFactsCard[^>]*rights=\{form\}/s);
    expect(read("components/calc/transfer/ImportedOneHouseFactsCard.tsx")).toContain(
      "imported-right-exceptions",
    );
  });
});
