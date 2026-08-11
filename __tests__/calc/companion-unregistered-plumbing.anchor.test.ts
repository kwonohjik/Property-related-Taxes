/**
 * anchor — 컴패니언(2번째 이후) 자산의 §104③ 미등기양도 배관 (Phase D).
 *
 * 계획서: docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md §4 Phase D
 *
 * 🔴 갭: ⑫Zod(`transfer-tax-schema-sub.ts:319`)와 ⑭엔진 매핑(`bundled-split-helpers.ts:246`)은
 *    **이미 `isUnregistered`를 받고 있었는데**, ⑬payload 빌더(`buildAssetPayload`)가 그 값을
 *    싣지 않았다. 그래서 컴패니언 자산의 미등기는 **항상 false**였다 — 입력 UI도 없었으므로
 *    「트리거만 열려 있고 입력 경로가 없는」 상태였다(memory `feedback_api_trigger_without_input_path_is_noop`).
 *
 * 일괄양도는 물건마다 등기 여부가 다를 수 있다(한 물건은 등기·다른 물건은 미등기).
 * 주 자산은 폼-전역 `isUnregistered`(Step4 ⑤)를 쓰고, 컴패니언은 자산-수준 값을 쓴다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}

/** 주 자산 1건 + 컴패니언 1건(일괄양도). 컴패니언의 미등기 여부만 바꿔 가며 본다. */
function makeForm(opts: { primaryUnregistered: boolean; companionUnregistered: boolean }) {
  const base = {
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2010-03-01",
    fixedAcquisitionPrice: "400,000,000",
  };
  return {
    transferDate: "2026-02-16",
    isUnregistered: opts.primaryUnregistered, // 폼-전역 = 주 자산 축
    assets: [
      { ...makeDefaultAsset(1), assetKind: "land" as const, ...base, actualSalePrice: "600,000,000" },
      {
        ...makeDefaultAsset(2),
        assetKind: "building" as const,
        ...base,
        actualSalePrice: "400,000,000",
        isUnregistered: opts.companionUnregistered, // 자산-수준 = 컴패니언 축
      },
    ],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1,000,000,000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

const companionsOf = (body: Record<string, unknown> | undefined) =>
  (body?.companionAssets ?? []) as Array<Record<string, unknown>>;

afterEach(() => vi.unstubAllGlobals());

describe("컴패니언 자산 §104③ 미등기 — ⑬ payload 배관", () => {
  it("D-1: 컴패니언 미등기 ON → companionAssets[0].isUnregistered === true", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ primaryUnregistered: false, companionUnregistered: true }));

    const companions = companionsOf(cap.body);
    // 대조군 — 컴패니언이 실제로 실려야 아래 단언이 의미를 갖는다(빈 배열 통과 방지).
    expect(companions).toHaveLength(1);
    expect(companions[0].isUnregistered).toBe(true);
  });

  it("D-2: 컴패니언 미등기 OFF → false (종전 동작)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ primaryUnregistered: false, companionUnregistered: false }));
    expect(companionsOf(cap.body)[0].isUnregistered).toBe(false);
  });

  it("D-3: 두 축은 **독립**이다 — 주 자산만 미등기여도 컴패니언은 false", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ primaryUnregistered: true, companionUnregistered: false }));

    // 폼-전역(주 자산 축)은 top-level로 간다.
    expect(cap.body?.isUnregistered).toBe(true);
    // 컴패니언이 그 값을 따라가면(공유 축으로 오구현) 여기가 true가 되어 깨진다.
    expect(companionsOf(cap.body)[0].isUnregistered).toBe(false);
  });

  it("D-4: 반대 방향도 독립 — 컴패니언만 미등기", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ primaryUnregistered: false, companionUnregistered: true }));
    expect(cap.body?.isUnregistered).toBe(false);
    expect(companionsOf(cap.body)[0].isUnregistered).toBe(true);
  });
});
