/**
 * anchor(④) — 명부 기준 주택 수가 **실제로 엔진까지 간다** (Q-8 · P7-2)
 *
 * ## 왜 별도 파일인가 — 라이브러리 anchor는 배선을 증명하지 않는다
 *
 * `household-house-count.anchor.test.ts`는 `resolveHouseholdHousingCount`를 **직접** 부른다.
 * 그 함수가 옳아도 ④가 그것을 부르지 않으면 엔진에는 종전 스칼라가 간다 —
 * memory `feedback_library_anchor_does_not_prove_component_uses_it` · `feedback_fixed_layer_vs_consumed_layer`.
 *
 * 여기서는 `callTransferTaxAPI`의 **request body를 가로채** 확인한다(저장소의 `axis-b-*` 전례).
 *
 * ## 🔑 시료는 **두 값이 갈리게** 만든다
 *
 * 스칼라와 명부가 같은 시료만 쓰면 **구별력이 0**이라 배선을 끊어도 초록이다
 * (memory `feedback_mutation_zero_discrimination_is_not_proof`). 그래서 전 케이스에서
 * `householdHousingCount`(스칼라)와 명부 행 수를 **일부러 어긋나게** 둔다.
 *
 * | # | 주장 |
 * |---|---|
 * | HW-1 | 스칼라 1 + 명부 1행 → 엔진에 **2**가 간다 (§155 특례 게이트가 열리는 값) |
 * | HW-2 | 명부가 비면 스칼라 그대로 — D-4 간이 입력 회귀 없음 |
 * | HW-3 | 주택 양도가 아니면 스칼라 그대로 (F1) |
 * | HW-4 | 취득일 없는 행은 세지 않는다 — ④도 같은 규칙 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const asset = (over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-06-01",
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "400000000",
    useEstimatedAcquisition: false,
    standardPriceAtTransfer: "500000000",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  }) as AssetForm;

const houseRow = (id: string, acquisitionDate?: string) => ({
  id,
  region: "capital",
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
});

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets: [asset()],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "900000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    ...over,
  } as unknown as TransferFormData;
}

/** ④가 서버로 보내는 body를 가로챈다. */
async function sentBody(f: TransferFormData): Promise<Record<string, unknown>> {
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
  return cap.body ?? {};
}

beforeEach(() => vi.clearAllMocks());

describe("HW-1 명부가 엔진 입력을 결정한다", () => {
  /**
   * 🔴 **이 PR의 존재 이유.** §155⑥⑦⑧이 요구하는 「2채」가 행 추가만으로 성립해야
   *    D-6(사실을 행으로 이관)이 성립한다. 배선이 끊기면 특례가 조용히 불성립한다.
   */
  it("[HW-1] 스칼라 1 + 명부 1행 → 엔진에 2", async () => {
    const body = await sentBody(form({ houses: [houseRow("h1", "2018-01-01")] } as Partial<TransferFormData>));
    expect(body.householdHousingCount).toBe(2);
  });

  it("[HW-1b] 스칼라 5 + 명부 1행 → 엔진에 2 (명부가 이긴다)", async () => {
    const body = await sentBody(
      form({ householdHousingCount: "5", houses: [houseRow("h1", "2018-01-01")] } as Partial<TransferFormData>),
    );
    expect(body.householdHousingCount).toBe(2);
  });
});

describe("HW-2 명부가 비면 스칼라 — D-4 회귀 없음", () => {
  /** 🔑 HW-1의 **긍정 짝**. 없으면 「항상 2를 보낸다」와 구별되지 않는다. */
  it("[HW-2] 스칼라 3 + 명부 0행 → 엔진에 3", async () => {
    const body = await sentBody(form({ householdHousingCount: "3" }));
    expect(body.householdHousingCount).toBe(3);
  });
});

describe("HW-3 F1 게이트 — 주택 양도만", () => {
  it("[HW-3] 입주권 양도 + 명부 1행 → 스칼라 유지", async () => {
    const body = await sentBody(
      form({
        householdHousingCount: "4",
        assets: [asset({ assetKind: "right_to_move_in" })],
        houses: [houseRow("h1", "2018-01-01")],
      } as Partial<TransferFormData>),
    );
    expect(body.householdHousingCount).toBe(4);
  });
});

describe("HW-4 취득일 없는 행은 세지 않는다", () => {
  it("[HW-4] 명부 2행 중 1행만 취득일 → 엔진에 2", async () => {
    const body = await sentBody(
      form({
        houses: [houseRow("h1", "2018-01-01"), houseRow("h2", undefined)],
      } as Partial<TransferFormData>),
    );
    expect(body.householdHousingCount).toBe(2); // 1 + 1
  });
});
