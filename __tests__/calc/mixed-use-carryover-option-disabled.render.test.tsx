/**
 * ⑤ 취득원인 선택지 — 겸용주택은 «이월과세(증여)»를 고를 수 없다 (계획서 mixed-use-4col-separate-acq-bg-carryover.plan.md Q-1 a · ⑧·⑫와 같은 술어).
 *
 *  · CD-1 겸용 매매 → 이월과세 옵션 비활성 + 클릭해도 onChange 없음 · 다른 옵션은 활성
 *  · CD-2 겸용 아닌 주택 → 이월과세 옵션 활성(종전 그대로)
 *  · CD-3 이미 이월과세가 골라진 겸용 → 그 옵션은 막지 않는다(⑧이 이 칸으로 점프시킨다 — 다른 옵션은 눌린다)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionDate: "2010-03-15", ...over }) as AssetForm;
function renderCause(a: AssetForm) {
  const calls: Partial<AssetForm>[] = [];
  render(<CompanionAcquisitionCauseSection asset={a} onChange={(p) => calls.push(p)} transferDate="2025-06-01" isNewConstruction={false} />);
  return calls;
}
const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(name) });
const isDisabled = (el: HTMLElement) =>
  (el as HTMLInputElement).disabled === true || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");

describe("CD 겸용 × 이월과세 선택지", () => {
  it("CD-1 겸용 매매 — 이월과세 비활성 · 클릭해도 값이 안 바뀐다 · 상속은 활성", () => {
    const calls = renderCause(asset({ isMixedUseHouse: true, acquisitionCause: "purchase" }));
    expect(isDisabled(radio("이월과세"))).toBe(true);
    fireEvent.click(radio("이월과세"));
    expect(calls.some((p) => p.acquisitionCause === "carryover_gift")).toBe(false);
    expect(isDisabled(radio("상속"))).toBe(false);
  });

  it("CD-2 겸용 아닌 주택 — 이월과세 활성(종전 그대로)", () => {
    renderCause(asset({ isMixedUseHouse: false, acquisitionCause: "purchase" }));
    expect(isDisabled(radio("이월과세"))).toBe(false);
  });

  it("CD-3 이미 이월과세가 골라진 겸용 — 그 옵션은 막지 않는다", () => {
    renderCause(asset({ isMixedUseHouse: true, acquisitionCause: "carryover_gift" }));
    expect(isDisabled(radio("이월과세"))).toBe(false);
  });
});
