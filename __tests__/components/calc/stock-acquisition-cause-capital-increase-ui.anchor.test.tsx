/**
 * @vitest-environment jsdom
 *
 * 취득원인 유상증자·무상증자 — UI (PR-2 · 계획서 `stock-split-lots-ui-bugfix.plan.md` F-1)
 *
 *   UI-1  매수 lot 카드 라벨: 유상증자 · 무상증자(과세분) · 무상증자(비과세분) — 드롭다운에 보인다(제보 1)
 *   UI-2  과세 무상주 lot — 단가 칸 안내가 액면가액(소령 §27①1호 가목)
 *   UI-3  비과세 무상주 lot — 자본조정 안내(alert)
 *   UI-4  단건 취득원인 라디오에 세 선택지 · 비과세분이면 안내
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AcquisitionLotCard, ACQ_CAUSE_LABEL } from "@/components/calc/stock-transfer/AcquisitionLotCard";
import { AcquisitionInfoBlock } from "@/components/calc/stock-transfer/AcquisitionInfoBlock";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

const lot = (acquisitionCause: AcquisitionLotForm["acquisitionCause"]): AcquisitionLotForm => ({
  id: "a1",
  acquisitionDate: "2025-01-10",
  shareCount: "100",
  perShareAcquisitionPrice: "500",
  acquisitionCause,
});

function renderLot(cause: AcquisitionLotForm["acquisitionCause"]) {
  return render(
    <AcquisitionLotCard lot={lot(cause)} idx={0} onUpdate={() => {}} onDelete={() => {}} radioNamePrefix="t" />,
  );
}

describe("매수 lot 카드", () => {
  it("UI-1 드롭다운 라벨에 유상증자·무상증자 2종이 있다", () => {
    expect(ACQ_CAUSE_LABEL.rights_issue).toBe("유상증자");
    expect(ACQ_CAUSE_LABEL.bonus_taxed).toContain("과세분");
    expect(ACQ_CAUSE_LABEL.bonus_untaxed).toContain("비과세분");
    renderLot("rights_issue");
    expect(screen.getByText("유상증자")).toBeTruthy();
    expect(screen.getByText("신주 인수대금을 납입한 날 — 소득세법 §98 대금청산일")).toBeTruthy();
  });

  it("UI-2 과세 무상주 — 단가 안내가 액면가액", () => {
    renderLot("bonus_taxed");
    expect(screen.getByText(/1주당 액면가액 — 의제배당으로 과세된 금액/)).toBeTruthy();
    expect(screen.queryByTestId("lot-bonus-untaxed-notice")).toBeNull();
  });

  it("UI-3 비과세 무상주 — 자본조정 안내", () => {
    renderLot("bonus_untaxed");
    expect(screen.getByTestId("lot-bonus-untaxed-notice").textContent).toContain("자본조정");
  });
});

describe("단건 취득 정보", () => {
  it("UI-4 라디오 세 선택지 · 비과세분이면 안내", () => {
    render(
      <AcquisitionInfoBlock
        form={{ ...createInitialStockFormData(), acquisitionCause: "bonus_untaxed" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("유상증자")).toBeTruthy();
    expect(screen.getByText("무상증자 (의제배당 과세분)")).toBeTruthy();
    expect(screen.getByText("무상증자 (의제배당 비과세분)")).toBeTruthy();
    expect(screen.getByTestId("single-bonus-untaxed-notice").textContent).toContain("원주 취득 건으로 입력");
  });
});
