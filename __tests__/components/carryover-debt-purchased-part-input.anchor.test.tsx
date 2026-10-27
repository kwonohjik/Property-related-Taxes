/**
 * anchor ⑤ — E1(주택·토지·상업용건물 이월과세)의 「당초 증여 때 채무를 인수했다」 토글·채무 칸 (계획서 §4.4 · UI 설계서 §2)
 *
 * 노출은 `carryoverPurchasedPartScope` 하나가 정한다 — ④ 전송(`carryoverPurchasedPartDebt`)·⑧ 차단(`validateCarryoverDebt`)과 같은 술어(3중 패턴).
 * 수정 前: E1에는 토글·칸·안내가 없었다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { SplitCarryoverGiftTaxCard } from "@/components/calc/transfer/SplitCarryoverParts";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { carryoverPurchasedPartScope, carryoverPurchasedPartDebt } from "@/lib/calc/carryover-gift-assumed-debt";
import { validateCarryoverDebt } from "@/lib/calc/transfer-tax-validate-carryover-debt";
import { buildCarryoverPayload } from "@/lib/calc/transfer-tax-api-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100000000", giftDateValuation: "1000000000", giftTaxAmount: "0" };
const asset = (over: Record<string, unknown> = {}, co: Record<string, unknown> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift", carryover: { ...CO, ...co }, ...over }) as unknown as AssetForm;
const draw = (a: AssetForm, onChange = vi.fn()) => render(<CarryoverGiftBlock asset={a} transferDate="2026-03-01" onChange={onChange} />);
const toggle = () => screen.queryByTestId("carryover-gift-debt-assumed");
const debtField = () => document.querySelector("[data-field='carryover.giftAssumedDebt']");

describe("⑤ apply — 주택 이월과세(E1)", () => {
  it("I-1 토글 OFF → 토글 보임(data-field 앵커) · 채무 칸 없음", () => {
    draw(asset());
    expect(toggle()).toBeTruthy();
    expect(toggle()?.getAttribute("data-field")).toBe("carryover.giftDebtAssumed");
    expect(debtField()).toBeNull();
    expect(screen.queryByTestId("carryover-debt-unsupported-note")).toBeNull();
  });

  it("I-2 토글 ON → 채무 칸(data-field · testid) · 섹션 번호 5 · 제목", () => {
    draw(asset({}, { giftDebtAssumed: true }));
    expect(debtField()).toBeTruthy();
    expect(screen.getByTestId("carryover-gift-assumed-debt")).toBeTruthy();
    expect(screen.getByText("당초 증여 때 인수한 채무", { selector: "p" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "당초 증여 때 채무를 인수했다" }).getAttribute("aria-checked")).toBe("true");
  });

  it("I-3 토글을 켜면 onChange로 carryover.giftDebtAssumed = true (다른 칸 보존)", () => {
    const onChange = vi.fn();
    draw(asset(), onChange);
    fireEvent.click(screen.getByRole("switch", { name: "당초 증여 때 채무를 인수했다" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].carryover).toMatchObject({ giftDebtAssumed: true, giftDateValuation: "1000000000", donorAcquisitionPrice: "100000000" });
  });

  it("I-4 문구 — 법령 인용 형식 · 「산 것으로 본다」 단정 없음 · 칸 hint에 방법 설명", () => {
    draw(asset({}, { giftDebtAssumed: true }));
    const t = screen.getByTestId("carryover-gift-debt-assumed").textContent ?? "";
    expect(t).toContain("「소득세법」 제88조 제1호 후단");
    expect(t).not.toContain("산 것으로");
    expect(debtField()?.textContent).toContain("「상속세 및 증여세법」 제47조 제1항");
    expect(debtField()?.textContent).toContain("이 계산기가 정한 방법");
  });

  it("I-5 지분(공유) 모드 → 칸 hint에 100% 기준 안내 · 아니면 없음", () => {
    draw(asset({ ownershipNumerator: "50", ownershipDenominator: "100" }, { giftDebtAssumed: true }));
    expect(debtField()?.textContent).toContain("100% 기준");
    cleanup();
    draw(asset({}, { giftDebtAssumed: true }));
    expect(debtField()?.textContent).not.toContain("100% 기준");
  });

  it("I-6 토글 ON ∧ apply → 증여자 취득가액·증여세 상당액·자본적지출 hint에 「증여분에만」 · OFF면 없음", () => {
    draw(asset({}, { giftDebtAssumed: true }));
    for (const f of ["carryover.donorAcquisitionPrice", "carryover.giftTaxAmount", "carryover.donorCapitalExpenditure"])
      expect(document.querySelector(`[data-field='${f}']`)?.textContent, f).toContain("증여분에만");
    cleanup();
    draw(asset());
    for (const f of ["carryover.donorAcquisitionPrice", "carryover.giftTaxAmount", "carryover.donorCapitalExpenditure"])
      expect(document.querySelector(`[data-field='${f}']`)?.textContent, f).not.toContain("증여분에만");
  });
});

describe("⑤ unsupported — 지금 양도도 부담부증여(E4) 주택", () => {
  const bg = (co: Record<string, unknown> = {}) => asset({ transferType: "burdened_gift" }, co);
  it("I-7 OFF → 토글 없음 · 안내(사유 포함)", () => {
    draw(bg());
    expect(toggle()).toBeNull();
    const note = screen.getByTestId("carryover-debt-unsupported-note").textContent ?? "";
    expect(note).toContain("지금 양도하는 자산도 부담부증여입니다");
    expect(note).toContain("증여세 상당액");
  });
  it("I-8 ★ 남은 ON → 토글이 켜진 채 보인다(끌 수 있다) · 채무 칸은 없다", () => {
    draw(bg({ giftDebtAssumed: true, giftAssumedDebt: "400000000" }));
    expect(toggle()).toBeTruthy();
    expect(screen.getByRole("switch", { name: "당초 증여 때 채무를 인수했다" }).getAttribute("aria-checked")).toBe("true");
    expect(debtField()).toBeNull();
    expect(screen.queryByTestId("carryover-debt-unsupported-note")).toBeNull();
  });
});

describe("⑤ numerator_only — 일반건물·파트 이월과세는 기존 위치 토글 그대로", () => {
  it("I-9 일반건물 → E1 섹션(5)을 그리지 않는다 · 기존 ③ 토글 1개 · 분자 전용 안내", () => {
    const gb = asset({ assetKind: "general_building", transferType: "burdened_gift" });
    draw(gb);
    expect(screen.getAllByTestId("carryover-gift-debt-assumed")).toHaveLength(1);
    expect(screen.queryByText("당초 증여 때 인수한 채무", { selector: "p" })).toBeNull();
    expect(screen.getByTestId("carryover-debt-numerator-only-note").textContent).toContain("분자에서만");
  });
  it("I-10 주택 분리 계산 증여세 카드 → 분자 전용 안내", () => {
    render(<SplitCarryoverGiftTaxCard sectionNum={4} value={{ ...CO, giftDebtAssumed: false } as never} onPatch={vi.fn()} anchorPrefix="carryover" partsLabel="토지·건물" giftTaxShareHint="" debtParts={[]} />);
    expect(screen.getByTestId("carryover-debt-numerator-only-note").textContent).toContain("분자에서만");
  });
});

describe("⑤↔④↔⑧ 같은 술어 격자 (3중 패턴)", () => {
  const CASES: [string, Record<string, unknown>, "apply" | "unsupported" | "numerator_only"][] = [
    ["주택", {}, "apply"],
    ["토지", { assetKind: "land" }, "apply"],
    ["상업용건물", { assetKind: "commercial_building" }, "apply"],
    ["겸용주택", { isMixedUseHouse: true }, "unsupported"],
    ["분양권", { assetKind: "presale_right" }, "unsupported"],
    ["주택 부담부증여", { transferType: "burdened_gift" }, "unsupported"],
    ["일반건물", { assetKind: "general_building" }, "numerator_only"],
  ];
  it.each(CASES)("I-11 %s → scope=%s · ⑤ 노출 = ④ 전송 = ⑧ 차단이 같은 kind를 읽는다", (_n, over, kind) => {
    const a = asset(over, { giftDebtAssumed: true, giftAssumedDebt: "400000000" });
    expect(carryoverPurchasedPartScope(a).kind).toBe(kind);
    // ④
    const sent = (buildCarryoverPayload(a, "2026-03-01", 1)?.carryoverTaxation as { giftAssumedDebt?: number } | undefined)?.giftAssumedDebt;
    expect(sent !== undefined).toBe(kind === "apply");
    expect(carryoverPurchasedPartDebt(a) > 0).toBe(kind === "apply");
    // ⑧ — 차단(M3)은 unsupported만
    const err = validateCarryoverDebt(a, "자산 1", "2026-03-01");
    expect(err?.includes("이 자산(") ?? false).toBe(kind === "unsupported");
    // ⑤
    draw(a);
    if (kind === "apply") expect(debtField()).toBeTruthy();
    if (kind === "unsupported") expect(toggle()).toBeTruthy(); // 남은 ON은 켜진 채 보인다
    if (kind !== "apply") expect(debtField() === null || kind === "numerator_only").toBe(true);
    cleanup();
  });
});

describe("Q-2 a — 본인 자본적지출·양도비는 같은 몫으로 나눈다(안내)", () => {
  it("I-12 apply ∧ 토글 ON → 필요경비 칸 아래 안내 · OFF·unsupported면 없음", () => {
    render(<AssetSectionExpense asset={asset({}, { giftDebtAssumed: true })} onChange={vi.fn()} />);
    expect(screen.getByTestId("carryover-debt-expense-split-notice").textContent).toContain("같은 몫");
    cleanup();
    render(<AssetSectionExpense asset={asset({}, { giftDebtAssumed: false })} onChange={vi.fn()} />);
    expect(screen.queryByTestId("carryover-debt-expense-split-notice")).toBeNull();
    cleanup();
    render(<AssetSectionExpense asset={asset({ transferType: "burdened_gift" }, { giftDebtAssumed: true })} onChange={vi.fn()} />);
    expect(screen.queryByTestId("carryover-debt-expense-split-notice")).toBeNull();
  });
});
