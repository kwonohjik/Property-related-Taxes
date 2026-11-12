/**
 * @vitest-environment jsdom
 *
 * anchor — 상속 자산은 감면 그룹의 「매매계약일 (분양/매매)」 칸을 숨긴다 (V-11 ⑤ · 사용자 결정 2026-11-12 (a))
 *
 * 세액 쪽(④ 미전송·엔진 무시·화면 시한 판정)은 `__tests__/api/transfer.route.rental-97-inheritance-contract-date.anchor.test.ts`.
 * 증여는 칸을 유지하고 「본인이 맺은」 계약일만 넣으라고 안내한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

const asset = (cause: AssetForm["acquisitionCause"]): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: cause,
    acquisitionDate: "2018-11-01",
    assetContractDate: "2018-09-01",
    reductions: [getReductionDefault("rental_97_5")] as unknown as AssetReductionForm[],
  }) as AssetForm;

const renderPanel = (cause: AssetForm["acquisitionCause"]) =>
  render(<UnifiedReductionPanel asset={asset(cause)} assetIndex={0} transferDate="2029-12-01" onChange={() => {}} />);
const field = () => document.querySelector('[data-field="assetContractDate"]');
const text = () => document.body.textContent ?? "";
const GIFT_NOTE = "매매·분양계약일만 넣으세요";

describe("매매계약일 칸 표시", () => {
  it("매매 → 칸이 있다 · 증여 안내 없음", () => {
    renderPanel("purchase");
    expect(field()).not.toBeNull();
    expect(text()).not.toContain(GIFT_NOTE);
  });
  it("🔴 상속 → 칸이 없다", () => {
    renderPanel("inheritance");
    expect(text()).toContain("장기일반·공공지원 민간임대주택 등록일"); // 그룹은 펼쳐져 있다
    expect(field()).toBeNull();
  });
  it.each(["gift", "carryover_gift"] as const)("%s → 칸 유지 + 본인 계약일 안내", (cause) => {
    renderPanel(cause);
    expect(field()).not.toBeNull();
    expect(text()).toContain(GIFT_NOTE);
  });
  it("🔴 상속 → 남은 계약일 2018-09-01로 부칙 §2② 질문을 숨기지 않는다(⑤ 술어 입력에서 빠진다)", () => {
    renderPanel("inheritance");
    expect(text()).toContain("2018.9.13. 이전 취득·계약");
    cleanup();
    renderPanel("purchase");
    expect(text()).not.toContain("2018.9.13. 이전 취득·계약");
  });
});
