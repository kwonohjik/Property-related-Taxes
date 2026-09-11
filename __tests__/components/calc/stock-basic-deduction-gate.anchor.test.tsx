/**
 * anchor — 주식양도세 Step3 ② 기본공제 두 칸의 **기타자산 그룹 게이트**
 *
 * 계획서: `docs/00-pm/stock-basic-deduction-group-gate.plan.md`
 *
 * ## 무엇을 고정하는가
 *
 * 「같은 해 부동산 그룹에서 이미 사용한 기본공제」와 「같은 해 양도한 부동산 중 비사업용 토지
 * 과세표준」은 **§103①1호 그룹(부동산·기타자산)**에서만 엔진이 소비한다. 주식 그룹(§103①2호)에서
 * 입력하면 세액이 **전혀 변하지 않는** 유령 입력이었다(계획서 §1 V-1 실측).
 *
 * 🔑 게이트는 **「기타자산 선택」보다 한 칸 넓다** — §94②(`stock-classification.ts:349`)가
 *   §94①3호와 4호를 동시 충족하면 4호를 우선하므로, 코스피를 고른 상태라도 과점주주·
 *   부동산과다보유 플래그가 켜지면 그룹이 바뀐다. 그것이 **G-3**이다.
 *
 * 부정형 단언에는 양성 쌍둥이를 붙인다(`feedback_negative_anchor_needs_positive_twin`) —
 * G-1(비노출) ↔ G-2·G-3(노출), G-4(비노출) ↔ G-5(노출).
 */
// Step3 하위가 Dexie(IndexedDB)에 접근한다 — jsdom엔 없어 unhandled rejection이 난다.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

/** 라벨은 화면 문구 그대로 — 문구를 바꾸면 이 anchor가 먼저 깨진다(의도된 결합). */
const FIELD_1 = "같은 해 부동산 그룹에서 이미 사용한 기본공제";
const FIELD_2 = "같은 해 양도한 부동산 중 비사업용 토지 과세표준";

function renderStep3(overrides: Partial<StockTransferFormData> = {}) {
  const form: StockTransferFormData = { ...createInitialStockFormData(), ...overrides };
  render(<Step3 form={form} onChange={vi.fn()} />);
}

describe("Step3 ② 기본공제 — 기타자산 그룹 게이트", () => {
  it("G-1: 코스피(플래그 off) — 두 칸 모두 비노출", () => {
    renderStep3({ marketType: "kospi" });
    expect(screen.queryByText(FIELD_1)).toBeNull();
    expect(screen.queryByText(FIELD_2)).toBeNull();
  });

  it("G-2: 기타자산 — 필드 1 노출 (G-1의 양성 쌍둥이)", () => {
    renderStep3({ marketType: "other_asset" });
    expect(screen.getByText(FIELD_1)).toBeTruthy();
  });

  it("G-3: 코스피 + 과점주주 플래그 — §94② 발동이라 필드 1 노출", () => {
    // 🔑 게이트를 `marketType === "other_asset"` 단독으로 좁히면 **여기서 깨진다**.
    renderStep3({ marketType: "kospi", isQualifyingBlockShareholder: true });
    expect(screen.getByText(FIELD_1)).toBeTruthy();
  });

  it("G-3b: 비상장 + 부동산과다보유(라목) 플래그 — 같은 이유로 필드 1 노출", () => {
    renderStep3({ marketType: "unlisted", isHeavyRealEstateForRate: true });
    expect(screen.getByText(FIELD_1)).toBeTruthy();
  });

  it("G-4: 기타자산 + nbl 미입력 — 필드 2 비노출 (§104①9호 미해당)", () => {
    renderStep3({ marketType: "other_asset", nblRatioOfCorpAssets: "" });
    expect(screen.getByText(FIELD_1)).toBeTruthy(); // 필드 1은 떠 있어야 한다
    expect(screen.queryByText(FIELD_2)).toBeNull();
  });

  it("G-4b: 기타자산 + nbl 49% — 임계 미달이라 필드 2 비노출", () => {
    renderStep3({ marketType: "other_asset", nblRatioOfCorpAssets: "49" });
    expect(screen.queryByText(FIELD_2)).toBeNull();
  });

  it("G-5: 기타자산 + nbl 60% — 필드 2 노출 (G-4의 양성 쌍둥이)", () => {
    renderStep3({ marketType: "other_asset", nblRatioOfCorpAssets: "60" });
    expect(screen.getByText(FIELD_2)).toBeTruthy();
  });

  it("G-5b: 기타자산 + nbl 50% — 임계 경계(50 이상)에서 노출", () => {
    renderStep3({ marketType: "other_asset", nblRatioOfCorpAssets: "50" });
    expect(screen.getByText(FIELD_2)).toBeTruthy();
  });

  it("G-6: 해외주식 — 두 칸 모두 비노출 (엔진 marketType에 없는 축)", () => {
    renderStep3({ marketType: "foreign_stock", isQualifyingBlockShareholder: true });
    expect(screen.queryByText(FIELD_1)).toBeNull();
    expect(screen.queryByText(FIELD_2)).toBeNull();
  });

  it("G-6b: 국외전출세 — 두 칸 모두 비노출", () => {
    renderStep3({ marketType: "exit_tax", isQualifyingBlockShareholder: true });
    expect(screen.queryByText(FIELD_1)).toBeNull();
    expect(screen.queryByText(FIELD_2)).toBeNull();
  });

  it("G-7: 섹션 제목은 §103① — 그룹·한도 근거는 ①이고 ②는 공제 순서 조항이다", () => {
    renderStep3({ marketType: "kospi" });
    expect(screen.getByText("기본공제 (§103①)")).toBeTruthy();
    expect(screen.queryByText("기본공제 (§103②)")).toBeNull();
  });
});
