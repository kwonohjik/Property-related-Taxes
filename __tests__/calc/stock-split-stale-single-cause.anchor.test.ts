/**
 * 분할 모드에 남은 «화면 밖» 단건 취득원인 — 막다른 오류 (세션 미결 5번 · 2026-10-06 재현)
 *
 * 경로: 단일 양도에서 「상속」(피상속인 취득일 비움) → 분할 전환(첫 lot 로 이관) → lot 원인을 「매매」로.
 *   폼-전역 `acquisitionCause`는 그대로 「상속」이다. 분할 모드에는 그 칸·보조 칸이 **렌더되지 않는다**.
 *
 * 종전(probe 실측): ⑧이 `decedentAcquisitionDate`·`donorAcquisitionDate`·`donorRelation`·`preMergerAcquisitionDate`
 *   (모두 화면 밖)로 막고 ⑫도 같은 키로 400 — 벗어나려면 단일로 되돌려 입력한 lot 을 버려야 했다.
 *
 * 수정: 분할 모드에서 단건 원인은 입력이 아니다(lot 원인이 정본) → 쓰는 곳에서 「매매」로 파생한다
 *   (`effectiveSingleAcquisitionCause` — 저장값은 바꾸지 않는다: 단일로 되돌릴 때 lot 에서 다시 채운다).
 *
 *   ST-1  상속·이월과세·합병 잔존 → ⑧ 오류 없음 · ⑫ 통과 · 결과 = 잔존값 없는 분할과 동일
 *   ST-2  긍정 짝 — 단일 모드에서는 같은 누락이 종전대로 막힌다
 *   ST-3  이월과세 증여자 기준 환산 술어도 분할 모드에서는 꺼진다
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { validateStep1, validateStep2, validateStep3 } from "@/lib/calc/stock-transfer-tax-validate";
import { isDonorConversionForm } from "@/lib/calc/stock-transfer-tax-api-carryover";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

function runFullStack(form: StockTransferFormData) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
  if (!parsed.success) throw new Error(`blocked: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return calculateStockTransferTax(buildEngineInput(coerced));
}
const errorFields = (f: StockTransferFormData) =>
  [...validateStep1(f), ...validateStep2(f), ...validateStep3(f)].filter((e) => e.severity === "error").map((e) => e.field);

const STALE: Record<string, Partial<StockTransferFormData>> = {
  "상속(피상속인 취득일 비움)": { acquisitionCause: "inheritance", decedentAcquisitionDate: "" },
  "이월과세(증여자 정보 비움)": { acquisitionCause: "carryover_gift" },
  "이월과세(일부 입력 — 증여세 짝 누락)": {
    acquisitionCause: "carryover_gift",
    donorAcquisitionDate: "2010-01-01",
    donorRelation: "lineal",
    giftTaxAmount: "1000000",
  },
  "합병·분할(종전 취득일 비움)": { acquisitionCause: "merger_split", preMergerAcquisitionDate: "" },
};

describe("ST-1 분할 모드 — 화면 밖 단건 원인은 막지도, 계산에 싣지도 않는다", () => {
  const clean = runFullStack(reportedSplitForm());

  it.each(Object.entries(STALE))("%s", (_label, o) => {
    const f = reportedSplitForm(o);
    expect(errorFields(f)).toEqual([]);
    const r = runFullStack(f);
    expect(r.acquisitionPrice).toBe(clean.acquisitionPrice);
    expect(r.calculatedTax).toBe(clean.calculatedTax);
    expect(buildStockTransferApiBody(f).acquisitionCause).toBe("purchase");
  });
});

describe("ST-2 긍정 짝 — 단일 모드는 종전대로 막는다", () => {
  it.each([
    ["상속", { acquisitionCause: "inheritance", decedentAcquisitionDate: "" }, "decedentAcquisitionDate"],
    ["합병·분할", { acquisitionCause: "merger_split", preMergerAcquisitionDate: "" }, "preMergerAcquisitionDate"],
  ] as const)("%s 보조 입력 누락 → 차단", (_l, o, field) => {
    const f = reportedSplitForm({ ...o, lotsMode: "single", acquisitionDate: "2024-01-10", transferDate: "2026-05-10" });
    expect(errorFields(f)).toContain(field);
  });
});

describe("ST-3 이월과세 증여자 기준 환산", () => {
  it("분할 모드에 남은 이월과세 + 증여자 환산 방식 → 술어 꺼짐 / 단일이면 켜짐", () => {
    const o = { acquisitionCause: "carryover_gift", donorAcquisitionMethod: "estimated", acquisitionMode: "actual" } as const;
    expect(isDonorConversionForm(reportedSplitForm(o))).toBe(false);
    expect(isDonorConversionForm(reportedSplitForm({ ...o, lotsMode: "single" }))).toBe(true);
  });
});
