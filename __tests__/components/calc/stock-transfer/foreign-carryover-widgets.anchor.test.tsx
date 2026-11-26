/**
 * @vitest-environment jsdom
 *
 * 국외주식 §97의2① 이월과세 — **입력 위젯 anchor** (⑤)
 *
 * 계획서: docs/02-design/features/foreign-stock-carryover-97-2.ui.plan.md §4 · §8.1 (컴포넌트)
 *
 * GATE  1단계 — 토글 OFF엔 증여자 칸이 없고 ON이면 나타난다(긍정·부정 짝) · 취득일이 「수증일」이 된다
 * PRICE 2단계 — 증여자 취득가액(외화+환율)은 ON일 때만, 원화 환산 미리보기
 * EXP   3단계 — 증여자 자본적지출(지출일 환율은 금액>0일 때만) · 증여세 3종 · 세율 보유기간 문장 부재
 * LEAF  국내 `AcquisitionInfoBlock`은 같은 leaf를 쓰되 「세율 보유기간」 문장이 그대로 남는다(국내 불변)
 */
import "fake-indexeddb/auto";
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { AcquisitionInfoBlock } from "@/components/calc/stock-transfer/AcquisitionInfoBlock";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

const foreign = (o: Partial<StockTransferFormData> = {}): StockTransferFormData => ({
  ...createInitialStockFormData(),
  securityName: "Example Corp",
  marketType: "foreign_stock",
  yearsResidentInKorea: "7",
  fgCountryCode: "US",
  acquisitionDate: "2026-01-05",
  transferDate: "2026-12-02",
  shareCount: "100",
  ...o,
});

const text = () => document.body.textContent ?? "";

/** 게이트 토글의 Switch — 안쪽 「사망」 토글(ON일 때만)이 아니라 바깥 것(첫 번째) */
const gateSwitch = () => within(screen.getByTestId("fg-carryover-toggle")).getAllByRole("switch")[0];

/** 상태를 실제로 들고 있는 래퍼 — onChange 패치가 폼에 반영되는지까지 본다 */
function Harness({
  initial,
  step,
  spy,
}: {
  initial: StockTransferFormData;
  step: 1 | 2 | 3;
  spy?: (f: StockTransferFormData) => void;
}) {
  const [f, setF] = useState(initial);
  spy?.(f);
  const onChange = (p: Partial<StockTransferFormData>) => setF((prev) => ({ ...prev, ...p }));
  if (step === 1) return <Step1 form={f} onChange={onChange} />;
  if (step === 2) return <Step2 form={f} onChange={onChange} />;
  return <Step3 form={f} onChange={onChange} />;
}

describe("GATE — 1단계 게이트 토글", () => {
  it("GATE-1 OFF: 토글은 있고(존재 인지) 증여자 칸·수증일 라벨은 없다", () => {
    render(<Step1 form={foreign()} onChange={() => {}} />);
    expect(screen.getByTestId("fg-carryover-toggle")).toBeTruthy();
    expect(screen.queryByText("증여자 취득일")).toBeNull();
    expect(screen.queryByText("증여자와의 관계 (§97의2① 본문)")).toBeNull();
    expect(screen.queryByText("수증일")).toBeNull();
    expect(screen.getAllByText("취득일").length).toBeGreaterThan(0);
  });

  it("GATE-1b OFF에도 tone 배경을 유지한다 (회색 OFF 금지)", () => {
    render(<Step1 form={foreign()} onChange={() => {}} />);
    const card = screen.getByTestId("fg-carryover-toggle");
    expect(card.className).toContain("bg-amber-50/70");
  });

  it("GATE-2 ON: 증여자 취득일·관계·사망과 안내가 나타나고 취득일이 「수증일」이 된다 (긍정 짝)", () => {
    render(<Step1 form={foreign({ acquisitionCause: "carryover_gift" })} onChange={() => {}} />);
    expect(screen.getByText("증여자 취득일")).toBeTruthy();
    expect(screen.getByText("증여자와의 관계 (§97의2① 본문)")).toBeTruthy();
    expect(screen.getByText("사망으로 혼인관계가 소멸")).toBeTruthy();
    expect(screen.getByText("수증일")).toBeTruthy();
    expect(text()).toContain("1년");
    // 국내 의제취득일 안내(영 §162⑦)는 국외 leaf에 넣지 않는다
    expect(screen.queryByTestId("deemed-acquisition-notice")).toBeNull();
  });

  it("GATE-3 토글은 acquisitionCause를 carryover_gift ↔ purchase로 쓰고 입력값은 지우지 않는다", () => {
    let latest!: StockTransferFormData;
    render(
      <Harness
        step={1}
        initial={foreign({ donorAcquisitionDate: "2025-08-01", donorRelation: "spouse" })}
        spy={(f) => (latest = f)}
      />,
    );
    expect(latest.acquisitionCause).toBe("purchase");
    fireEvent.click(gateSwitch());
    expect(latest.acquisitionCause).toBe("carryover_gift");
    expect(screen.getByText("증여자 취득일")).toBeTruthy();
    fireEvent.click(gateSwitch());
    expect(latest.acquisitionCause).toBe("purchase");
    // 값은 남는다 — ④ 술어가 막는 것이지 store를 지우지 않는다(useEffect 미러링 금지)
    expect(latest.donorAcquisitionDate).toBe("2025-08-01");
    expect(latest.donorRelation).toBe("spouse");
    expect(screen.queryByText("증여자 취득일")).toBeNull();
  });

  it("GATE-4 술어는 raw acquisitionCause — 국내 split 잔존값이 있어도 화면은 ON이다", () => {
    render(<Step1 form={foreign({ acquisitionCause: "carryover_gift", lotsMode: "split" })} onChange={() => {}} />);
    expect(screen.getByText("증여자 취득일")).toBeTruthy();
  });

  it("GATE-5 국내에서 상속을 고른 채 해외로 전환하면 토글은 OFF로 보인다", () => {
    render(<Step1 form={foreign({ acquisitionCause: "inheritance" })} onChange={() => {}} />);
    expect(screen.queryByText("증여자 취득일")).toBeNull();
    expect(gateSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("GATE-6 토글 설명이 2·3단계에도 입력이 있다고 알린다 (Q-10)", () => {
    render(<Step1 form={foreign()} onChange={() => {}} />);
    const t = screen.getByTestId("fg-carryover-toggle").textContent ?? "";
    expect(t).toContain("2단계");
    expect(t).toContain("3단계");
  });
});

describe("PRICE — 2단계 증여자 취득가액", () => {
  it("PRICE-1 OFF: 증여자 취득가액 섹션이 없다", () => {
    render(<Step2 form={foreign()} onChange={() => {}} />);
    expect(text()).not.toContain("증여자 취득가액");
  });

  it("PRICE-2 ON: 산정 방식·통화·환율·1주당 취득가액이 있고 원화 환산 미리보기가 계산된다", () => {
    render(
      <Step2
        form={foreign({
          acquisitionCause: "carryover_gift",
          donorPerShareAcquisitionPriceForeign: "400",
          donorAcquisitionExchangeRate: "1250",
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("증여자 취득가액 산정 방식")).toBeTruthy();
    expect(screen.getByText("증여자 취득 통화")).toBeTruthy();
    expect(screen.getByText("증여자 취득일 기준환율")).toBeTruthy();
    expect(screen.getByText("1주당 증여자 취득가액 (외화)")).toBeTruthy();
    // 400 × 100주 × 1,250 = 50,000,000
    expect(text()).toContain("증여자 취득가액(원화 환산 참고): 50,000,000");
    // 환율 근거 안내 + 위 「취득가액」이 증여일 평가액임을 알린다
    expect(text()).toContain("증여받은 날의 평가액");
  });

  it("PRICE-3 시가 모드: 라벨이 시가로 바뀌고 안내가 나온다", () => {
    render(
      <Step2
        form={foreign({ acquisitionCause: "carryover_gift", donorAcquisitionModeFS: "market_price" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("1주당 증여자 취득가액 — 시가 (외화)")).toBeTruthy();
    expect(text()).toContain("영 §178의3 시가");
  });

  it("PRICE-4 미입력이면 환산 미리보기를 보이지 않는다 (0원 표시·자동 안분 금지)", () => {
    render(<Step2 form={foreign({ acquisitionCause: "carryover_gift" })} onChange={() => {}} />);
    expect(text()).not.toContain("증여자 취득가액(원화 환산 참고)");
  });

  it("PRICE-5 국내 시장에서는 증여자 취득가액(외화) 섹션이 없다", () => {
    render(
      <Step2
        form={foreign({ marketType: "unlisted", acquisitionCause: "carryover_gift" })}
        onChange={() => {}}
      />,
    );
    expect(text()).not.toContain("1주당 증여자 취득가액 (외화)");
  });
});

describe("EXP — 3단계 증여자 필요경비", () => {
  it("EXP-1 OFF: 섹션이 없다", () => {
    render(<Step3 form={foreign()} onChange={() => {}} />);
    expect(text()).not.toContain("증여자 자본적지출");
    expect(text()).not.toContain("증여세 산출세액");
  });

  it("EXP-2 ON: 자본적지출(외화)·증여세 3칸이 있고 지출일 환율은 금액을 넣기 전엔 없다", () => {
    render(<Step3 form={foreign({ acquisitionCause: "carryover_gift" })} onChange={() => {}} />);
    expect(screen.getByText("증여자 자본적지출액 (외화)")).toBeTruthy();
    expect(screen.queryByText("증여자 자본적지출 지출일 기준환율")).toBeNull();
    expect(screen.getByText("증여세 산출세액 (§97의2①3호)")).toBeTruthy();
    expect(screen.getByText("양도한 해당 자산가액 (영 §163의2②2호)")).toBeTruthy();
    expect(screen.getByText("증여세 과세가액 (영 §163의2②3호)")).toBeTruthy();
  });

  it("EXP-3 금액>0이면 지출일 환율이 나타나고 양도일 환율로 대신하지 않는다고 말한다", () => {
    render(
      <Step3
        form={foreign({ acquisitionCause: "carryover_gift", donorCapitalExpenditureForeign: "10" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("증여자 자본적지출 지출일 기준환율")).toBeTruthy();
    expect(text()).toContain("양도일 환율로 대신하지 않습니다");
  });

  it("EXP-4 국외 증여세 안내에는 「세율 보유기간」 문장이 없다 (단일세율)", () => {
    render(<Step3 form={foreign({ acquisitionCause: "carryover_gift" })} onChange={() => {}} />);
    expect(text()).toContain("§97의2②3호");
    expect(text()).not.toContain("세율 보유기간");
  });
});

describe("LEAF — 국내 AcquisitionInfoBlock은 같은 leaf를 쓰되 출력이 그대로다", () => {
  it("LEAF-1 국내 이월과세 카드는 「세율 보유기간」 문장을 유지한다 (긍정 짝)", () => {
    render(
      <AcquisitionInfoBlock
        form={{ ...createInitialStockFormData(), marketType: "unlisted", acquisitionCause: "carryover_gift" }}
        onChange={() => {}}
      />,
    );
    expect(text()).toContain("그때는 세율 보유기간도 수증일 기산으로 돌아갑니다.");
    expect(screen.getByText("증여자 취득일 (§104②2)")).toBeTruthy();
  });
});
