/**
 * A3 — 다필지 모드 지분 스케일: 필지 **금액 필드** 누수 정정.
 *
 * 계획서: docs/02-design/features/transfer-fractional-lump-sum-deduction.plan.md (rev.2) §10 별건
 *
 * ## 결함
 *
 * `AssetForm` 규약상 **UI 입력은 전부 100% 기준값**이고 API 변환이 × 지분율을 적용한다.
 * 자산-수준 `transferPrice`는 그렇게 처리되는데(`transfer-tax-api.ts` `applyRatio(totalContractPrice, ratio)`)
 * **필지 금액 필드는 전부 raw**로 새어나갔다 — 한 body 안에 100% 스케일과 지분 스케일이 섞인다.
 *
 * 결과는 **양도가액 지분분 − 취득가액 100%** = 양도차익 과소 = **세액 과소**다.
 * 실측(지분 50%, 물건 전체 양도가 10억·취득가 4억·경비 2천만):
 *
 * | | 양도차익 |
 * |---|---|
 * | 물건 전체 | 580,000,000 |
 * | **현행(누수)** | **80,000,000** |
 * | 정본 | 280,000,000 |
 *
 * → **2억 과소**, 정본의 3.5배 차. §97② 단서 swap 비교(자본적지출+양도비 vs 환산+개산공제)도
 * 한쪽만 스케일되면 판정이 뒤집힌다.
 *
 * P3(PR #843)가 split 파트 필드에서 고친 것과 **동형**이며, 그때 "별건"으로 남겨둔 항목이다.
 *
 * ## 스케일 대상 / 비대상
 *
 * - **대상(금액)**: `acquisitionPrice` · `expenses` · `capitalExpenditure` · `transferExpense`
 * - **비대상**: 면적(필지 간 안분 비율의 분자·분모로 상쇄) ·
 *   기준시가 단가·보상 단가(환산 산식에서 분자·분모로 상쇄) — §163⑥ 지분 작업의 결론과 동일 원리
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type Parcel = Record<string, unknown>;

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

/** 필지 2개(실가·환산). 모든 입력은 100% 기준값. */
function makeForm(over: Record<string, unknown> = {}) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "land" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2010-01-01",
    parcelMode: true,
    ownershipNumerator: "50",
    ownershipDenominator: "100",
    actualSalePrice: "1000000000",
    parcels: [
      {
        id: "p1",
        acquisitionDate: "2010-01-01",
        acquisitionMethod: "actual",
        acquisitionArea: "300",
        transferArea: "300",
        acquisitionPrice: "400000000",
        expenses: "20000000",
        capitalExpenditure: "30000000",
        transferExpense: "10000000",
      },
      {
        id: "p2",
        acquisitionDate: "2005-04-10",
        acquisitionMethod: "estimated",
        acquisitionArea: "200",
        transferArea: "200",
        standardPricePerSqmAtAcq: "100000",
        standardPricePerSqmAtTransfer: "500000",
      },
    ] as Parcel[],
    ...over,
  };
  return {
    transferDate: "2024-05-01",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

const parcelsOf = (b?: Record<string, unknown>) => (b?.parcels ?? []) as Parcel[];

afterEach(() => vi.unstubAllGlobals());

// ════════════════════════════════════════════════════════════
// P1 — 금액 필드가 지분 스케일된다
// ════════════════════════════════════════════════════════════
describe("P1: 지분 50% — 필지 금액 필드", () => {
  it("🔴 취득가액·필요경비 — 자산-수준 transferPrice와 같은 스케일", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    expect(cap.body?.transferPrice, "자산-수준은 이미 지분분이었다").toBe(500_000_000);
    const [p1] = parcelsOf(cap.body);
    expect(p1.acquisitionPrice, "이 값이 100%로 남으면 양도차익 2억 과소").toBe(200_000_000);
    expect(p1.expenses).toBe(10_000_000);
  });

  it("🔴 자본적지출·양도비 — §97② swap 비교 대상이라 함께 스케일돼야 판정이 보존된다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    const [p1] = parcelsOf(cap.body);
    expect(p1.capitalExpenditure).toBe(15_000_000);
    expect(p1.transferExpense).toBe(5_000_000);
  });
});

// ════════════════════════════════════════════════════════════
// P2 — 면적·단가는 100% 유지 (스케일하면 오히려 틀린다)
// ════════════════════════════════════════════════════════════
describe("P2: 면적·기준시가 단가는 raw 유지", () => {
  it("면적 — 필지 간 안분 비율의 분자·분모로 상쇄되므로 스케일 금지", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    const [p1, p2] = parcelsOf(cap.body);
    expect(p1.acquisitionArea).toBe(300);
    expect(p1.transferArea).toBe(300);
    expect(p2.transferArea).toBe(200);
  });

  it("기준시가 ㎡당 단가 — 환산 산식에서 분자·분모로 상쇄되므로 스케일 금지", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    const [, p2] = parcelsOf(cap.body);
    expect(p2.standardPricePerSqmAtAcq).toBe(100_000);
    expect(p2.standardPricePerSqmAtTransfer).toBe(500_000);
  });
});

// ════════════════════════════════════════════════════════════
// P3 — 단독소유 회귀 가드
// ════════════════════════════════════════════════════════════
describe("P3: 단독소유 100% — 무변경", () => {
  it("지분 미설정이면 모든 필지 금액이 입력값 그대로", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ ownershipNumerator: "100", ownershipDenominator: "100" }),
    );
    expect(cap.body?.transferPrice).toBe(1_000_000_000);
    const [p1] = parcelsOf(cap.body);
    expect(p1.acquisitionPrice).toBe(400_000_000);
    expect(p1.expenses).toBe(20_000_000);
    expect(p1.capitalExpenditure).toBe(30_000_000);
    expect(p1.transferExpense).toBe(10_000_000);
  });
});

// ════════════════════════════════════════════════════════════
// P4 — 0 보존 (undefined 규약 회귀 가드)
//   `makeRatioed`(ratioed)는 0을 undefined로 바꾼다. 필지 필드는 각자 고유한
//   undefined 의미(모드별 미전송)를 갖고 있어 그 규약을 깨면 Zod·엔진 분기가 흔들린다.
// ════════════════════════════════════════════════════════════
describe("P4: 금액 0은 0으로 전송된다 (undefined로 바뀌지 않는다)", () => {
  it("expenses=0 — actual 모드이므로 0이 전송돼야 한다", async () => {
    const cap = captureBody();
    const form = makeForm();
    const asset = (form as unknown as { assets: { parcels: Parcel[] }[] }).assets[0];
    asset.parcels[0].expenses = "0";
    await callTransferTaxAPI(form);
    const [p1] = parcelsOf(cap.body);
    expect(p1.expenses).toBe(0);
  });
});
