/**
 * 증여 겸용주택 — 취득정보의 「증여 신고가액」 칸 대신 주택분·상가분 칸을 가리키는 안내(계획서 `docs/00-pm/mixed-gift-fixed-acq-price.plan.md` Q-1 a).
 *
 * 그 칸은 겸용에서 세액에 쓰이지 않는다(route anchor `transfer.route.mixed-gift-fixed-acq-price`). 종전에는 필수로 표시돼 사용자가 신고가액을
 * 거기에만 넣으면 오류 없이 버려졌다(주택분·상가분 칸 비움 → 취득 당시 기준시가로 계산).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "경남 테스트군 1-1", assetKind: "housing", acquisitionCause: "gift",
    acquisitionDate: "2022-10-01", fixedAcquisitionPrice: "600000000", ...over,
  }) as AssetForm;
const draw = (a: AssetForm) =>
  render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2023-09-18" isNewConstruction={false} />);
const reportedField = () => document.querySelector('[data-field="fixedAcquisitionPrice"]');
const NOTICE = "취득가액 — 겸용주택 증여일 평가액(주택분·상가분)";

describe("증여 겸용 — 「증여 신고가액」 칸", () => {
  it("겸용 증여: 칸이 없고 주택분·상가분 칸을 가리키는 안내가 있다 · 날짜 칸은 그대로", () => {
    draw(asset({ isMixedUseHouse: true }));
    expect(reportedField()).toBeNull();
    expect(screen.queryByText("증여 신고가액 (원)")).toBeNull();
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(document.body.textContent).toContain("“주택 기준시가”·“상가 기준시가” 섹션의 “증여일 신고가액” 칸에 입력합니다");
    expect(document.body.textContent).toMatch(/증여자 취득일/);
  });

  it("🔴 짝: 겸용이 아닌 증여 주택은 칸이 그대로 있다(필수)", () => {
    draw(asset({ isMixedUseHouse: false }));
    expect(reportedField()).not.toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("🔴 짝: 주택이 아닌데 겸용 플래그만 남은 잔재는 칸을 보인다(④·⑫와 같은 술어 — 리뷰 게이트 W-3)", () => {
    draw(asset({ assetKind: "land", isMixedUseHouse: true }));
    expect(reportedField()).not.toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("🔴 짝: 부담부증여 겸용은 종전과 같다(§159 안내 · 겸용 안내 없음)", () => {
    draw(asset({ isMixedUseHouse: true, transferType: "burdened_gift" }));
    expect(reportedField()).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("🔴 짝: 상속 겸용은 종전 안내 그대로", () => {
    draw(asset({ isMixedUseHouse: true, acquisitionCause: "inheritance", inheritanceStartDate: "2022-10-01", fixedAcquisitionPrice: "" }));
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByText("취득가액 — 겸용주택 상속개시일 평가액 자동 적용")).toBeTruthy();
  });
});
