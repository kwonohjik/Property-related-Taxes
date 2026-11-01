/**
 * anchor — 의제취득일(1985.1.1.) 전 «매수» 재개발 원조합원 영 §176조의2④ (PR-3 경로 C · Q-4 a)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §12.2
 *
 * ① = 영 §166③ 환산취득가액(재개발 분기가 실제로 쓰는 산식) · ② = 실가 × 1984.12. 지수 ÷ 취득월 지수 · 2자 max(① > ②일 때만 ①).
 * 오라클: ② 금액을 실가로 직접 넣어 돌린 결과와 세액이 같아야 한다(입력 치환 1회).
 * 시료: case44 재개발 정보 · 1984.6. 매수 · 2026.2.16. 양도 525,000,000 · mock 세율표.
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const SEC166_3 = 141_221_534;
const C2_1E = 101_411_574; // floor(1억 × 5029 ÷ 4959)
const C2_3E = 304_234_724;

function make(o: Partial<TransferTaxInput> & { propertyType?: "redevelopment_apt" | "right_to_move_in" } = {}): TransferTaxInput {
  const propertyType = o.propertyType ?? "redevelopment_apt";
  return baseTransferInput({
    acquisitionCause: "purchase",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("1985-01-01"),
    acquisitionPrice: 100_000_000,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: { ...case44RedevelopmentInfo(), subject: propertyType === "redevelopment_apt" ? "apt" : "right" },
    ...o,
    propertyType,
  }) as TransferTaxInput;
}
const ORIG = new Date("1984-06-01");
const run = (i: TransferTaxInput) => calculateTransferTax(i, rates);

describe.each(["redevelopment_apt", "right_to_move_in"] as const)("%s 원조합원", (propertyType) => {
  it("실가 1억 — ② 101,411,574 · ① 미산정 · 세액 = ②를 실가로 넣은 결과", () => {
    const r = run(make({ propertyType, preDeemedPurchase: { originalAcquisitionDate: ORIG } }));
    const d = r.preDeemedPurchaseDetail!;
    expect(d.clause2Amount).toBe(C2_1E);
    expect(d.clause1Amount).toBeUndefined();
    expect(d.selected).toBe("clause2");
    expect(d.expenseBasis).toBe("actual");
    const manual = run(make({ propertyType, acquisitionPrice: C2_1E }));
    expect(r.determinedTax).toBe(manual.determinedTax);
    expect(r.determinedTax).not.toBe(run(make({ propertyType })).determinedTax);
    expect(r.warnings?.join("") ?? "").not.toContain("범위 밖");
  });
  it("환산 + 함께 견줄 실가 3억 — ① §166③ 141,221,534 < ② 304,234,724 → ② · 세액 = 실가 ② 입력과 같음", () => {
    const r = run(make({ propertyType, useEstimatedAcquisition: true, acquisitionPrice: 0, preDeemedPurchase: { originalAcquisitionDate: ORIG, actualPrice: 300_000_000 } }));
    const d = r.preDeemedPurchaseDetail!;
    expect(d.clause1Amount).toBe(SEC166_3);
    expect(d.clause1Method).toBe("redevelopment166_3");
    expect(d.clause2Amount).toBe(C2_3E);
    expect(d.selected).toBe("clause2");
    expect(d.expenseBasis).toBe("actual");
    expect(r.determinedTax).toBe(run(make({ propertyType, acquisitionPrice: C2_3E })).determinedTax);
  });
  it("환산 + 함께 견줄 실가 1억 — ① 141,221,534 > ② → ① · 세액 = 현행 환산 그대로(개산공제)", () => {
    const base = { propertyType, useEstimatedAcquisition: true, acquisitionPrice: 0 };
    const r = run(make({ ...base, preDeemedPurchase: { originalAcquisitionDate: ORIG, actualPrice: 100_000_000 } }));
    const d = r.preDeemedPurchaseDetail!;
    expect(d.clause1Amount).toBe(SEC166_3);
    expect(d.selected).toBe("clause1");
    expect(d.expenseBasis).toBe("estimated");
    expect(r.determinedTax).toBe(run(make(base)).determinedTax);
  });
  it("환산 · 실가 빈칸 — ②의 기준 없음 → no-op · 현행 환산", () => {
    const base = { propertyType, useEstimatedAcquisition: true, acquisitionPrice: 0 };
    const r = run(make({ ...base, preDeemedPurchase: { originalAcquisitionDate: ORIG } }));
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.determinedTax).toBe(run(make(base)).determinedTax);
  });
});

describe("§166③ 산출 불가(칸 비움) — ① 미산정으로 둔다(0원을 ①로 보이지 않는다)", () => {
  it("인가시 기준시가 없음 → ① 없음 · ②만", () => {
    const info = { ...case44RedevelopmentInfo(), managementDisposalHousingPrice: 0 };
    const r = run(make({ redevelopment: info, useEstimatedAcquisition: true, acquisitionPrice: 0, preDeemedPurchase: { originalAcquisitionDate: ORIG, actualPrice: 300_000_000 } }));
    expect(r.preDeemedPurchaseDetail?.clause1Amount).toBeUndefined();
    expect(r.preDeemedPurchaseDetail?.selected).toBe("clause2");
  });
});

describe("숨은 감정·매매사례 플래그 — 재개발 모드는 환산 플래그만 본다", () => {
  it("acquisitionMethod 감정이어도 환산 플래그 없으면 실가 모드(실가가 ②의 기준)", () => {
    const r = run(make({ acquisitionMethod: "appraisal", preDeemedPurchase: { originalAcquisitionDate: ORIG, actualPrice: 300_000_000 } }));
    expect(r.preDeemedPurchaseDetail?.actualBase).toBe(100_000_000);
    expect(r.preDeemedPurchaseDetail?.clause1Amount).toBeUndefined();
  });
});

describe("범위 밖 — 값 불변 + 경고", () => {
  it("재개발 정보 없는 입주권 — 자산 종류로 범위 밖", () => {
    const r = run(make({ propertyType: "right_to_move_in", redevelopment: undefined, preDeemedPurchase: { originalAcquisitionDate: ORIG } }));
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.warnings?.join("")).toContain("범위 밖(자산 종류)");
  });
  it("승계조합원 완공 APT — 비교하지 않는다", () => {
    const info = { ...case44RedevelopmentInfo(), isSuccessorMember: true };
    const base = { redevelopment: info };
    const r = run(make({ ...base, preDeemedPurchase: { originalAcquisitionDate: ORIG } }));
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.warnings?.join("")).toContain("범위 밖");
    expect(r.determinedTax).toBe(run(make(base)).determinedTax);
  });
  it("재개발 정보가 있어도 재개발 대상이 아닌 자산(subject 불일치)은 범위 밖", () => {
    const info = { ...case44RedevelopmentInfo(), subject: "right" as const };
    const r = run(make({ redevelopment: info, preDeemedPurchase: { originalAcquisitionDate: ORIG } }));
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.warnings?.join("")).toContain("범위 밖");
  });
});
