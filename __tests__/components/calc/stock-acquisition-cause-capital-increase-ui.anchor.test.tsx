/**
 * @vitest-environment jsdom
 *
 * 취득원인 유상증자·무상증자 — UI (PR-2 · 계획서 `stock-split-lots-ui-bugfix.plan.md` F-1)
 *
 *   UI-1  매수 lot 카드 라벨: 유상증자 · 무상증자(과세분) · 무상증자(비과세분) — 드롭다운에 보인다(제보 1)
 *   UI-2  과세 무상주 lot — 단가 칸 안내가 액면가액(소령 §27①1호 가목)
 *   UI-3  비과세 무상주 lot — 자본조정 안내(alert)
 *   UI-4  단건 취득원인 라디오에 세 선택지 · 비과세분이면 안내
 *   UI-5  과세 무상주 — Step2 추계 모드(환산·매매사례) 비활성 · 라벨 「1주당 액면가액」 · 안내 / 매매는 그대로
 *   UI-6  과세 무상주 lot — 단가 칸 라벨 「1주당 액면가액」
 *   UI-7  의제취득일 전(1980) 과세 무상주 — 추계 모드 열림(영 §176의2④ ①·② 비교) · 카드 ② 칸 「취득 당시 1주당 액면가액」
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AcquisitionLotCard, ACQ_CAUSE_LABEL } from "@/components/calc/stock-transfer/AcquisitionLotCard";
import { AcquisitionInfoBlock } from "@/components/calc/stock-transfer/AcquisitionInfoBlock";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
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

describe("과세 무상주 — 액면가액만", () => {
  /** 취득가액 산정 방식 라디오 (양도가액 쪽에도 「실가」가 있어 name 으로 좁힌다) */
  const radio = (value: "actual" | "estimated" | "sale_case") =>
    document.querySelector(`input[name="acquisitionMode"][value="${value}"]`) as HTMLInputElement;
  const step2 = (cause: "bonus_taxed" | "purchase") =>
    render(
      <Step2
        form={{
          ...createInitialStockFormData(),
          marketType: "unlisted",
          acquisitionCause: cause,
          acquisitionMode: "actual",
          acquisitionActualInputMode: "per_share",
        }}
        onChange={() => {}}
      />,
    );

  it("UI-5 Step2: 환산·매매사례 비활성 · 1주당 액면가액 · 안내", () => {
    step2("bonus_taxed");
    expect(radio("estimated").disabled).toBe(true);
    expect(radio("sale_case").disabled).toBe(true);
    expect(radio("actual").disabled).toBe(false);
    expect(screen.getByText("1주당 액면가액")).toBeTruthy();
    expect(screen.getByTestId("bonus-taxed-face-value-notice")).toBeTruthy();
  });

  it("UI-5b 매매는 그대로 — 추계 모드 열림 · 라벨 1주당 취득가액", () => {
    step2("purchase");
    expect(radio("estimated").disabled).toBe(false);
    expect(radio("sale_case").disabled).toBe(false);
    expect(screen.getByText("1주당 취득가액")).toBeTruthy();
    expect(screen.queryByTestId("bonus-taxed-face-value-notice")).toBeNull();
  });

  it("UI-6 lot 카드 단가 라벨", () => {
    renderLot("bonus_taxed");
    expect(screen.getByText("1주당 액면가액")).toBeTruthy();
    expect(screen.queryByText("1주당 단가")).toBeNull();
  });
});

describe("의제취득일 전 과세 무상주", () => {
  it("UI-7 1980 취득 — 환산·매매사례 열림 · 액면가액 전용 안내 없음 · 카드 ② 칸이 액면가액", () => {
    render(
      <Step2
        form={{
          ...createInitialStockFormData(),
          marketType: "kospi",
          acquisitionDate: "1980-06-01",
          acquisitionCause: "bonus_taxed",
          acquisitionMode: "estimated",
        }}
        onChange={() => {}}
      />,
    );
    const radio = (value: string) =>
      document.querySelector(`input[name="acquisitionMode"][value="${value}"]`) as HTMLInputElement;
    expect(radio("estimated").disabled).toBe(false);
    expect(radio("sale_case").disabled).toBe(false);
    expect(screen.queryByTestId("bonus-taxed-face-value-notice")).toBeNull();
    expect(screen.getByTestId("pre-deemed-acquisition-card")).toBeTruthy();
    expect(screen.getByText("취득 당시 1주당 액면가액")).toBeTruthy();
    expect(screen.queryByText("취득 당시 실지거래가액 (1주당, 선택)")).toBeNull();
  });
});
