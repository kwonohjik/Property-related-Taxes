/**
 * anchor: 증여 §163⑨1호·2호 ②(§164④~⑦) **입력 UI 도달** (U-3 · 계획서 §5 Phase 3).
 *
 * PR #1097(Phase 1)이 API payload 트리거를 「상속 또는 증여」로 열었지만, ② 산출에 필요한
 * 입력 UI가 전부 `acquisitionCause === "inheritance"`로 잠겨 있어 증여에서는 트리거 필드가
 * 0으로 남는다 ⇒ payload가 생성되지 않아 **API만 열어서는 세액이 달라지지 않는다**.
 *
 *   · 상가 §164⑥  — `CommercialInheritanceStdPriceSection`이 `!== "inheritance"`에서 return null
 *   · 주택 §164⑤~⑦ — `HouseValuationSection`이 `CompanionAcqInheritanceBlock` 안에만 마운트
 *
 * ⚠️ 증여의 ①은 이미 「증여 신고가액」(`fixedAcquisitionPrice`)에 있으므로 상속 섹션을 통째로
 *    재사용하면 ① 입력이 두 곳이 된다. 여기서 요구하는 것은 **② 산출 입력만**이다.
 *
 * 계획서: docs/02-design/features/gift-163-9-clause-1-2-max.plan.md §5 Phase 3 · §7 U-3
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CommercialInheritanceStdPriceSection } from "../../components/calc/transfer/CommercialInheritanceStdPriceSection";
import { CompanionAcquisitionCauseSection } from "../../components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 상가 §164⑥ 섹션 식별 — ToneCard title (취득원인 문구는 분기되므로 조문번호로 잡는다) */
const SEC_164_6 = /§164⑥ 취득당시 기준시가/;
/** 주택 §164⑤~⑦ 3시점 환산 보조 섹션 식별 */
const SEC_164_HOUSE = /개별주택가격 미공시/;

function commercialAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionCause: "gift",
    acquisitionDate: "1998-07-01", // 상가 기준시가 최초고시(2005-01-01) 前
    ...overrides,
  };
}

function houseAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: "1998-07-01", // 개별주택가격 최초공시(2005-04-30) 前
    inheritanceAssetKind: "house_individual",
    ...overrides,
  };
}

describe("증여 §163⑨2호 — ② 입력 UI 도달 (상가 §164⑥)", () => {
  it("G2-A: 증여 + 상가 + 최초고시(2005) 前 → §164⑥ 취득당시 기준시가 입력 노출", () => {
    render(
      <CommercialInheritanceStdPriceSection
        asset={commercialAsset()}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(SEC_164_6).length).toBeGreaterThan(0);
  });

  it("G2-A neg: 증여 + 상가 + 최초고시(2005) 이후 → 미노출", () => {
    render(
      <CommercialInheritanceStdPriceSection
        asset={commercialAsset({ acquisitionDate: "2010-03-01" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryByText(SEC_164_6)).toBeNull();
  });

  it("R-1(회귀): 상속 + 상가 + 2005 前 → 종전대로 노출", () => {
    render(
      <CommercialInheritanceStdPriceSection
        asset={commercialAsset({ acquisitionCause: "inheritance", inheritanceStartDate: "1998-07-01" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(SEC_164_6).length).toBeGreaterThan(0);
  });

  it("R-2(경계): 이월과세(carryover_gift)는 §97의2 승계 경로 → 미노출", () => {
    render(
      <CommercialInheritanceStdPriceSection
        asset={commercialAsset({ acquisitionCause: "carryover_gift" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryByText(SEC_164_6)).toBeNull();
  });

  it("R-3(경계): 매매 취득은 §163⑨ 대상 아님 → 미노출", () => {
    render(
      <CommercialInheritanceStdPriceSection
        asset={commercialAsset({ acquisitionCause: "purchase" })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryByText(SEC_164_6)).toBeNull();
  });
});

describe("증여 §163⑨2호 — ② 입력 UI 도달 (주택 §164⑤~⑦)", () => {
  it("G2-B: 증여 + 주택 + 개별주택가격 최초공시(2005-04-30) 前 → 3시점 환산 보조 입력 노출", () => {
    render(
      <CompanionAcquisitionCauseSection
        asset={houseAsset()}
        onChange={() => {}}
        transferDate="2024-01-01"
        isNewConstruction={false}
      />,
    );
    expect(screen.queryAllByText(SEC_164_HOUSE).length).toBeGreaterThan(0);
  });

  it("G2-B neg: 증여 + 주택 + 공시 이후 취득 → 미노출", () => {
    render(
      <CompanionAcquisitionCauseSection
        asset={houseAsset({ acquisitionDate: "2010-05-01" })}
        onChange={() => {}}
        transferDate="2024-01-01"
        isNewConstruction={false}
      />,
    );
    expect(screen.queryByText(SEC_164_HOUSE)).toBeNull();
  });

  it("R-4(회귀): 매매 취득 주택 → 미노출 (§163⑨ 대상 아님)", () => {
    render(
      <CompanionAcquisitionCauseSection
        asset={houseAsset({ acquisitionCause: "purchase" })}
        onChange={() => {}}
        transferDate="2024-01-01"
        isNewConstruction={false}
      />,
    );
    expect(screen.queryByText(SEC_164_HOUSE)).toBeNull();
  });
});

// ─── G-1: 증여 토지 §163⑨1호 ②(§164④) ────────────────────────────────
// 종전에 토지등급 입력은 「환산취득가 모드」 안(CompanionAcqPurchaseBlock)과 상속 PreDeemedInputs에만
// 있었다. 증여는 어느 쪽도 아니어서 ②를 산정할 화면이 없었다(계획서 §10).

/** 증여 토지 §164④ 섹션 식별 */
const SEC_164_4 = /§164④ 취득당시 기준시가/;

function landAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "gift",
    acquisitionDate: "1987-05-01", // 개별공시지가 최초고시(1990-08-30) 前
    inheritanceAssetKind: "land",
    ...overrides,
  };
}

describe("증여 §163⑨1호 — ② 입력 UI 도달 (토지 §164④)", () => {
  it("G1-UI: 증여 + 토지 + 최초고시(1990.8.30.) 前 → §164④ 토지등급 입력 노출", () => {
    render(
      <CompanionAcquisitionCauseSection
        asset={landAsset()}
        onChange={() => {}}
        transferDate="2024-01-01"
        isNewConstruction={false}
      />,
    );
    expect(screen.queryAllByText(SEC_164_4).length).toBeGreaterThan(0);
  });

  it("G1-UI neg: 증여 + 토지 + 최초고시 이후 → 미노출", () => {
    render(
      <CompanionAcquisitionCauseSection
        asset={landAsset({ acquisitionDate: "1995-03-01" })}
        onChange={() => {}}
        transferDate="2024-01-01"
        isNewConstruction={false}
      />,
    );
    expect(screen.queryByText(SEC_164_4)).toBeNull();
  });

  it("R-5(회귀): 매매 취득 토지 → 미노출 (환산 모드 경로는 그대로)", () => {
    render(
      <CompanionAcquisitionCauseSection
        asset={landAsset({ acquisitionCause: "purchase" })}
        onChange={() => {}}
        transferDate="2024-01-01"
        isNewConstruction={false}
      />,
    );
    expect(screen.queryByText(SEC_164_4)).toBeNull();
  });

  it("R-6(경계): 이월과세 토지 → 미노출 (§97의2 승계)", () => {
    render(
      <CompanionAcquisitionCauseSection
        asset={landAsset({ acquisitionCause: "carryover_gift" })}
        onChange={() => {}}
        transferDate="2024-01-01"
        isNewConstruction={false}
      />,
    );
    expect(screen.queryByText(SEC_164_4)).toBeNull();
  });
});
