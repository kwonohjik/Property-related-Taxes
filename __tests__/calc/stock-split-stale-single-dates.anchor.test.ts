/**
 * 분할 모드에 남은 «화면 밖» 단건 양도일·취득일 (근거 확인 4건 재검증 3번 부수 발견 · 2026-10-07)
 *
 * 경로: 단일 양도에서 양도일·취득일 입력 → 분할 전환(첫 lot 로 이관) → lot 일자를 고친다.
 *   폼-전역 `transferDate`·`acquisitionDate` 는 단건 시절 값 그대로다. 분할 모드에는 그 칸이 없다.
 *   ④는 「비었을 때만」 가장 이른 lot 일자로 채웠으므로 그 stale 값이 엔진에 실렸다.
 *
 * 종전(probe 실측, 제보 사례 픽스처 — 매도 lot 2026-05-10):
 *   잔존 양도일 2019-03-01 → 증권거래세 700,000 → 1,000,000(세율 연도) · 대주주 임계 10억 → 15억 기간 ·
 *     보유기간 음수 · 「단기30%」 표시 / 2023-01-10 → 「단기30%」 표시
 *   잔존 취득일 1980-01-01 → 「의제취득일적용」 표시 · 보유기간 484개월
 *   (양도소득세 자체는 lot 별 일자로 재므로 같았다)
 *
 *   SD-1  잔존 양도일 → body 는 가장 이른 매도 lot 일자 · 결과 전체 = 잔존값 없는 분할과 동일
 *   SD-2  잔존 취득일 → body 는 가장 이른 매수 lot 일자 · 결과 전체 동일
 *   SD-3  매도 lot 이 여럿이면 입력 순서와 무관하게 가장 이른 일자
 *   SD-4  긍정 짝 — lots-only(단일 양도 + 취득 lot)는 폼-전역 양도일이 정본이다
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

function runFullStack(form: StockTransferFormData) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
  if (!parsed.success) throw new Error(`blocked: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return JSON.parse(JSON.stringify(calculateStockTransferTax(buildEngineInput(coerced))));
}

const clean = runFullStack(reportedSplitForm());

describe("SD-1 잔존 양도일", () => {
  it.each(["2019-03-01", "2023-01-10", "2026-12-20"])("%s", (transferDate) => {
    const f = reportedSplitForm({ transferDate });
    expect(buildStockTransferApiBody(f).transferDate).toBe("2026-05-10");
    expect(runFullStack(f)).toEqual(clean);
  });
});

describe("SD-2 잔존 취득일", () => {
  it.each(["1980-01-01", "2010-01-01"])("%s", (acquisitionDate) => {
    const f = reportedSplitForm({ acquisitionDate });
    expect(buildStockTransferApiBody(f).acquisitionDate).toBe("2024-01-10");
    expect(runFullStack(f)).toEqual(clean);
  });
});

describe("SD-3 매도 lot 여럿", () => {
  it("입력 순서가 늦은 일자 먼저여도 가장 이른 일자", () => {
    const f = reportedSplitForm({
      transferDate: "2019-03-01",
      transferLots: [
        { id: "t2", transferDate: "2026-08-20", shareCount: "4000", perShareTransferPrice: "21000" },
        { id: "t1", transferDate: "2026-05-10", shareCount: "6000", perShareTransferPrice: "20000" },
      ],
    });
    expect(buildStockTransferApiBody(f).transferDate).toBe("2026-05-10");
  });
});

describe("SD-4 긍정 짝 — lots-only 는 폼-전역 양도일이 정본", () => {
  it("단일 양도 + 취득 lot → body 양도일 = 폼 값(합성 매도 lot 과 같은 날)", () => {
    const f = reportedSplitForm({
      lotsMode: "single",
      acquisitionActualInputMode: "lots",
      transferDate: "2026-06-15",
      shareCount: "10000",
      perShareTransferPrice: "20000",
      transferActualInputMode: "per_share",
    });
    const body = buildStockTransferApiBody(f);
    expect(body.transferDate).toBe("2026-06-15");
    expect((body.transferLots as { transferDate: string }[])[0].transferDate).toBe("2026-06-15");
  });
});
