/**
 * anchor(C-13): §164 입력 섹션 4곳의 안내가 **all-or-nothing임을 명시**한다.
 *
 * 종전 문구는 "아래를 **입력한 경우에만** 비교하며"라 **일부만 입력해도 되는 것처럼 읽혔다**.
 * 실제로는 하나라도 비면 payload가 생성되지 않아 ① 단독으로 계산된다 — 안내가 오히려 오해를
 * 부추기고 있었다.
 *
 * ⚠️ 개수는 문구에 하드코딩하지 않는다 — `Sec164FieldStatus.total`에서 받는다. 필드가 늘면
 *    안내가 자동으로 따라와야 하고, 그것이 단일 소스화(P-4)의 목적이다.
 *
 * 계획서: docs/02-design/features/sec164-partial-input-silent-noop.plan.md §5.5 · C-13
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GiftHouseStdPriceSection } from "../../components/calc/transfer/GiftHouseStdPriceSection";
import { GiftLandStdPriceSection } from "../../components/calc/transfer/GiftLandStdPriceSection";
import { CommercialInheritanceStdPriceSection } from "../../components/calc/transfer/CommercialInheritanceStdPriceSection";
import { PostDeemedInputs } from "../../components/calc/transfer/inheritance/PostDeemedInputs";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** all-or-nothing 명시 — 「N개 항목을 모두」 + 「일부만 입력하면」 */
const ALL_OR_NOTHING = /개 항목을 모두/;
const PARTIAL_WARN = /일부만 입력하면/;

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return { ...makeDefaultAsset(1), ...over } as AssetForm;
}

describe("C-13: §164 입력 안내가 all-or-nothing을 명시한다", () => {
  it("증여 주택 §164⑤~⑦", () => {
    render(
      <GiftHouseStdPriceSection
        asset={asset({
          assetKind: "housing",
          acquisitionCause: "gift",
          acquisitionDate: "1998-07-01",
          inheritanceAssetKind: "house_individual",
        })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(ALL_OR_NOTHING).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(PARTIAL_WARN).length).toBeGreaterThan(0);
  });

  it("증여 토지 §164④", () => {
    render(
      <GiftLandStdPriceSection
        asset={asset({
          assetKind: "land",
          acquisitionCause: "gift",
          acquisitionDate: "1987-05-01",
          inheritanceAssetKind: "land",
        })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(ALL_OR_NOTHING).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(PARTIAL_WARN).length).toBeGreaterThan(0);
  });

  it("상가 §164⑥ (상속·증여 공용 섹션)", () => {
    render(
      <CommercialInheritanceStdPriceSection
        asset={asset({
          assetKind: "commercial_building",
          acquisitionCause: "inheritance",
          acquisitionDate: "1998-07-01",
          inheritanceStartDate: "1998-07-01",
        })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(ALL_OR_NOTHING).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(PARTIAL_WARN).length).toBeGreaterThan(0);
  });

  it("상속 주택 §164⑦ (PostDeemedInputs)", () => {
    render(
      <PostDeemedInputs
        asset={asset({
          assetKind: "housing",
          acquisitionCause: "inheritance",
          acquisitionDate: "1998-07-01",
          inheritanceStartDate: "1998-07-01",
          inheritanceAssetKind: "house_individual",
        })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(ALL_OR_NOTHING).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(PARTIAL_WARN).length).toBeGreaterThan(0);
  });

  it("개수는 하드코딩이 아니라 단일 소스에서 온다 — 상가는 8, 토지는 5", () => {
    render(
      <CommercialInheritanceStdPriceSection
        asset={asset({
          assetKind: "commercial_building",
          acquisitionCause: "gift",
          acquisitionDate: "1998-07-01",
        })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(/8개 항목을 모두/).length).toBeGreaterThan(0);
    cleanup();

    render(
      <GiftLandStdPriceSection
        asset={asset({
          assetKind: "land",
          acquisitionCause: "gift",
          acquisitionDate: "1987-05-01",
        })}
        onChange={() => {}}
        transferDate="2024-01-01"
      />,
    );
    expect(screen.queryAllByText(/5개 항목을 모두/).length).toBeGreaterThan(0);
  });
});
