/**
 * 주식 다종목 합산신고 — 스토어·API 배선 anchor (Phase 5a)
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md
 *
 * ## 「편집기 + 목록」 구조
 *
 * `StockTransferFormData`는 240개 넘는 필드가 **한 종목**을 서술한다. 종목별로 쪼개면 38개
 * Block 컴포넌트의 props를 전부 바꿔야 하므로, `formData`를 **편집 중인 종목**으로 두고
 * 확정한 종목을 `savedItems`에 쌓는다. 계산 시 `[...savedItems, formData]`를 items로 보낸다.
 *
 * ## 이 파일이 고정하는 것
 *
 * · 신고 단위 7필드는 종목을 확정해도 **승계**된다 (종목마다 다른 신고일은 성립하지 않는다)
 * · 종목 구성이 바뀌면 **이전 결과가 무효화**된다 (stale 세액 표시 방지)
 * · 편집 전환 시 **편집 중이던 종목을 잃지 않는다**
 * · 국외전출세는 합산 배열에 **들어가지 못한다** (route if-체인 함정)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import { callStockTransferTaxAggregateAPI } from "@/lib/calc/stock-transfer-tax-api";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function resetStore() {
  useStockTransferStore.getState().reset();
}

/** 최소 식별 가능한 종목 폼 */
function item(name: string, over: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: name,
    marketType: "unlisted",
    ...over,
  };
}

describe("MI-1 commitCurrentItem — 종목 확정", () => {
  beforeEach(resetStore);

  it("MI-1-1 편집 중인 종목이 목록으로 가고 편집기는 비워진다", () => {
    const s = useStockTransferStore.getState();
    s.updateFormData({ securityName: "삼성전자", marketType: "kospi" });
    useStockTransferStore.getState().commitCurrentItem();

    const after = useStockTransferStore.getState();
    expect(after.savedItems).toHaveLength(1);
    expect(after.savedItems[0].securityName).toBe("삼성전자");
    expect(after.formData.securityName).toBe("");
  });

  it("MI-1-2 🔑 신고 단위 8필드는 **승계**된다 — 종목마다 다른 신고일은 성립하지 않는다", () => {
    useStockTransferStore.getState().updateFormData({
      securityName: "A",
      filingType: "final",
      filingDate: "2025-05-31",
      isElectronicFiling: true,
      filingViolation: "under_report",
      isFraudulent: true,
      isInternationalTransaction: true,
      realEstateGroupBasicDeductionUsed: "2500000",
      foreignTaxMethod: "expense",
    });
    useStockTransferStore.getState().commitCurrentItem();

    const f = useStockTransferStore.getState().formData;
    expect(f.filingType).toBe("final");
    expect(f.filingDate).toBe("2025-05-31");
    expect(f.isElectronicFiling).toBe(true);
    expect(f.filingViolation).toBe("under_report");
    expect(f.isFraudulent).toBe(true);
    expect(f.isInternationalTransaction).toBe(true);
    expect(f.realEstateGroupBasicDeductionUsed).toBe("2500000");
    // 🆕 2026-09-01 — §118의6①은 **과세기간 단위 택일**이라 종목마다 다르게 고를 수 없다(계획서 §4.2).
    expect(f.foreignTaxMethod).toBe("expense");
  });

  it("MI-1-3 [음성 대조군] 종목 축 필드는 승계되지 **않는다**", () => {
    useStockTransferStore.getState().updateFormData({
      securityName: "A",
      marketType: "kospi",
      shareCount: "1000",
      perShareTransferPrice: "50000",
    });
    useStockTransferStore.getState().commitCurrentItem();

    const f = useStockTransferStore.getState().formData;
    expect(f.securityName).toBe("");
    expect(f.shareCount).toBe("");
    expect(f.perShareTransferPrice).toBe("");
    // marketType은 초기값("")으로 돌아간다 — 종목마다 시장이 다를 수 있다.
    expect(f.marketType).toBe(createInitialStockFormData().marketType);
  });

  it("MI-1-4 종목 구성이 바뀌면 이전 결과가 무효화된다 — stale 세액 표시 방지", () => {
    const st = useStockTransferStore.getState();
    st.setResult({ calculatedTax: 999 } as never);
    st.setAggregateResult({ totalFinalTax: 999 } as never);
    useStockTransferStore.getState().commitCurrentItem();

    expect(useStockTransferStore.getState().result).toBeNull();
    expect(useStockTransferStore.getState().aggregateResult).toBeNull();
  });
});

describe("MI-2 editSavedItem — 목록 ↔ 편집기 전환", () => {
  beforeEach(resetStore);

  it("MI-2-1 🔑 편집 중이던 종목을 **잃지 않는다** — 목록 끝으로 확정된다", () => {
    const st = useStockTransferStore.getState();
    st.updateFormData({ securityName: "A" });
    useStockTransferStore.getState().commitCurrentItem();      // savedItems = [A]
    useStockTransferStore.getState().updateFormData({ securityName: "B" }); // 편집 중 = B

    useStockTransferStore.getState().editSavedItem(0);          // A를 편집기로

    const after = useStockTransferStore.getState();
    expect(after.formData.securityName).toBe("A");
    expect(after.savedItems.map((x) => x.securityName)).toEqual(["B"]);
  });

  it("MI-2-2 범위 밖 인덱스는 아무것도 바꾸지 않는다", () => {
    useStockTransferStore.getState().updateFormData({ securityName: "B" });
    useStockTransferStore.getState().editSavedItem(5);
    expect(useStockTransferStore.getState().formData.securityName).toBe("B");
    expect(useStockTransferStore.getState().savedItems).toHaveLength(0);
  });
});

describe("MI-3 removeSavedItem", () => {
  beforeEach(resetStore);

  it("MI-3-1 해당 종목만 빠지고 순서가 유지된다", () => {
    for (const n of ["A", "B", "C"]) {
      useStockTransferStore.getState().updateFormData({ securityName: n });
      useStockTransferStore.getState().commitCurrentItem();
    }
    useStockTransferStore.getState().removeSavedItem(1);
    expect(
      useStockTransferStore.getState().savedItems.map((x) => x.securityName),
    ).toEqual(["A", "C"]);
  });
});

describe("MI-4 ⑬ 다종목 API — items 배열 전송", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("MI-4-1 body가 `{ items: [...], deductionMode: 'aggregate' }` 형태다", async () => {
    let captured: unknown = null;
    global.fetch = (async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({ result: { totalFinalTax: 0 } }),
      };
    }) as unknown as typeof fetch;

    await callStockTransferTaxAggregateAPI([item("A"), item("B")]);
    global.fetch = originalFetch;

    const body = captured as { items: unknown[]; deductionMode: string };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(body.deductionMode).toBe("aggregate");
  });

  it("MI-4-2 국외주식과 국내주식이 **한 배열**에 섞인다 (§102①2호·§103①2호 공동 그룹)", async () => {
    let captured: { items: Array<{ marketType: string }> } | null = null;
    global.fetch = (async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return { ok: true, json: async () => ({ result: {} }) };
    }) as unknown as typeof fetch;

    await callStockTransferTaxAggregateAPI([
      item("국내", { marketType: "unlisted" }),
      item("해외", { marketType: "foreign_stock" }),
    ]);
    global.fetch = originalFetch;

    expect(captured!.items.map((i) => i.marketType)).toEqual([
      "unlisted",
      "foreign_stock",
    ]);
  });

  it("MI-4-3 🔑 국외전출세는 합산 배열에 들어가면 **차단**된다 — route if-체인 함정", async () => {
    // `items` 분기가 `exit_tax` 분기보다 **먼저**라, 넣으면 국외전출세 계산에 도달하지 못한 채
    // aggregate로 흘러간다. 조용히 통과시키지 않고 던진다.
    await expect(
      callStockTransferTaxAggregateAPI([item("A"), item("출국", { marketType: "exit_tax" })]),
    ).rejects.toThrow(/국외전출세/);
  });
});
