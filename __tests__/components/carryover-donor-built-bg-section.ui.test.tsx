/**
 * ⑤ 렌더 — 부담부증여 이월과세 블록의 «당초 증여자가 신축·증축한 건물입니까?» 토글 (PR-4, 소득세법 §114조의2)
 *
 * 불변식:
 *  · K-5 환산·K-7 감정일 때만 «당초 증여자 취득 입력» 다음에 나온다 — K-4 실지·기준시가·매매사례가액에는 없다(`donorBuiltBgApplicable` 하나로 ④·⑧과 같다)
 *  · 일체 주택 안분 입력은 없다 — §159 가 토지·건물을 자산별로 따로 구한다
 *  · 증축이면 K-5 는 증축 부분 기준시가, K-7 은 증축 부분 감정가액 칸 — 서로 다른 칸이 하나씩만 열린다
 *  · 신축일은 증여자 취득일로 자동 채우지 않는다 — 토글은 donorBuilt:true 만 올린다
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { BurdenedGiftCarryoverBlock } from "@/components/calc/transfer/BurdenedGiftCarryoverBlock";
import { bgAsset } from "../calc/_helpers/carryover-donor-built-bg-form";
import { radioValues } from "./_helpers/radio-values";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function mount(a: AssetForm, bundled = false) {
  const onChange = vi.fn();
  const view = render(<BurdenedGiftCarryoverBlock asset={a} onChange={onChange} coDonorNeedsStdPrice bundled={bundled} />);
  return { ...view, onChange };
}

describe("노출 — 렌더와 술어가 일치한다", () => {
  it.each([
    ["K-5 환산", "converted", {}, true],
    ["K-7 감정", "appraisal", {}, true],
    ["K-4 실지", "converted", { bgAcquisitionMethod: "actual" as const }, false],
    ["K-6 매매사례가액", "appraisal", { bgAcquisitionMethod: "salesCase" as const }, false],
    ["기준시가 모드", "converted", { bgValuationMode: "sangjeungbeop_standard" as const }, false],
    ["토지", "converted", { assetKind: "land" as const }, false],
    ["겸용주택", "converted", { isMixedUseHouse: true }, false],
  ])("%s → 토글 %s", (_l, method, over, shown) => {
    mount(bgAsset(method as "converted" | "appraisal", { donorBuilt: false }, over));
    expect(screen.queryByTestId("donor-built-toggle") !== null).toBe(shown);
  });
});

describe("토글·구분·일자·증축", () => {
  it("토글을 켜면 donorBuilt:true 만 올린다 — 구분·일자·금액을 지어내지 않는다", () => {
    const { onChange } = mount(bgAsset("converted", { donorBuilt: false, donorBuiltType: "", donorBuiltDate: "" }));
    fireEvent.click(within(screen.getByTestId("donor-built-toggle")).getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const carry = (onChange.mock.calls[0][0] as { carryover: Record<string, unknown> }).carryover;
    expect(carry).toMatchObject({ donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" });
  });
  it("ON 이면 구분 라디오(new·extension) · 일체 주택 안분 칸은 없다", () => {
    const { container } = mount(bgAsset("converted"));
    expect(radioValues(container, "donorBuiltType-")).toEqual(["new", "extension"]);
    expect(screen.queryByTestId("donor-built-housing")).toBeNull();
    expect(screen.getByTestId("donor-built-toggle").textContent).toContain("양도인 본인이 신축한 건물과는 다른 질문입니다");
  });
  it("증축: K-5 는 증축 부분 기준시가 칸 · K-7 은 증축 부분 감정가액 칸이 하나씩만 열린다", () => {
    mount(bgAsset("converted", { donorBuiltType: "extension" }));
    expect(screen.getByTestId("donor-built-ext-area")).toBeTruthy();
    expect(screen.getByTestId("donor-built-ext-std")).toBeTruthy();
    expect(screen.queryByTestId("donor-built-ext-appraisal")).toBeNull();
    cleanup();
    mount(bgAsset("appraisal", { donorBuiltType: "extension" }));
    expect(screen.getByTestId("donor-built-ext-area")).toBeTruthy();
    expect(screen.getByTestId("donor-built-ext-appraisal")).toBeTruthy();
    expect(screen.queryByTestId("donor-built-ext-std")).toBeNull();
  });
  it("K-7 증축 감정가액은 자산 수준 칸(bgPresumedExtensionAppraisal)으로 올라간다", () => {
    const { onChange } = mount(bgAsset("appraisal", { donorBuiltType: "extension" }));
    fireEvent.change(screen.getByTestId("donor-built-ext-appraisal"), { target: { value: "80000000" } });
    expect(onChange).toHaveBeenCalledWith({ bgPresumedExtensionAppraisal: "80000000" });
  });
});

describe("지분 분할 취득·함께 부담부증여 묶음 — 토글을 새로 보이지 않는다 (⑫·⑧ 범위 밖)", () => {
  it("묶음 + 토글 OFF → 토글 자체가 없다 (보여 주고 다시 막지 않는다)", () => {
    mount(bgAsset("converted", { donorBuilt: false }), true);
    expect(screen.queryByTestId("donor-built-toggle")).toBeNull();
  });
  it("묶음 + 이미 ON(묶음으로 바꾸기 전 입력) → 끄기 전용 토글만 남는다 — 입력 칸 없음, 끄면 donorBuilt:false (⑧ 차단을 풀 입력 경로 유지)", () => {
    const { onChange } = mount(bgAsset("converted"), true);
    const toggle = screen.getByTestId("donor-built-toggle");
    expect(toggle.textContent).toContain("묶음에서는");
    expect(screen.queryByTestId("donor-built-fields")).toBeNull();
    fireEvent.click(within(toggle).getByRole("switch"));
    expect((onChange.mock.calls[0][0] as { carryover: Record<string, unknown> }).carryover).toMatchObject({ donorBuilt: false });
  });
  it("묶음이 아니면 종전 그대로 (회귀 0)", () => {
    mount(bgAsset("converted", { donorBuilt: false }), false);
    expect(screen.getByTestId("donor-built-toggle")).toBeTruthy();
  });
  it("BurdenedGiftBlock 가 isFractionalSplit·isCompanionBundle 을 묶음으로 넘긴다 — OFF 면 토글 없음 / 평소(둘 다 아님)에는 있다", () => {
    const off = bgAsset("converted", { donorBuilt: false });
    const blk = (extra: { isFractionalSplit?: boolean; isCompanionBundle?: boolean }) =>
      render(<BurdenedGiftBlock asset={off} onChange={vi.fn()} transferDate="2026-02-16" {...extra} />);
    blk({});
    expect(screen.getByTestId("donor-built-toggle")).toBeTruthy();
    cleanup();
    blk({ isFractionalSplit: true });
    expect(screen.queryByTestId("donor-built-toggle")).toBeNull();
    cleanup();
    blk({ isCompanionBundle: true });
    expect(screen.queryByTestId("donor-built-toggle")).toBeNull();
  });
});
