/**
 * @vitest-environment jsdom
 *
 * ⑤ V-11 — 거주 「개월 수 직접 입력」 칸의 안내: 토지를 건물보다 나중에 취득해 토지분 거주기간이 토지 보유기간으로 잘리는 자산에서만 보인다.
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 · V-11
 *
 * **실제 Step4**를 렌더한다 — 게이트는 엔진·④가 쓰는 술어(`landHoldingResidenceDirectHintApplies`)를 그대로 읽는다(재정의 금지).
 * 술어 ≡ ④ 전송 격자는 `land-holding-residence-direct-hint.grid.test.ts`.
 * 구간 입력에서는 직접 입력 칸 자체가 없고, 안내도 없다(④가 겹침을 계산해 보낸다).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const HINT = "residence-land-holding-hint";
const direct = (m = "178"): Partial<AssetForm> => ({ residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: m }) as Partial<AssetForm>;
const interval: Partial<AssetForm> = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2010-06-01", moveOutDate: "2025-01-15" }] } as Partial<AssetForm>;

/** S2 — 일반 주택 분리취득(별개 취득 토글 ON): 건물 2010-03-01 → 토지 2020-03-01 */
const split = (o: Partial<AssetForm> = {}) =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01", landAcquisitionDate: "2020-03-01", hasSeperateLandAcquisitionDate: true, ...direct(), ...o }) as AssetForm;
const mixed = (o: Partial<AssetForm> = {}) =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2010-03-01", landAcquisitionDate: "2020-03-01", ...direct("168"), ...o }) as AssetForm;
const house = (o: Partial<AssetForm> = {}) =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", ...direct("142"), ...o }) as AssetForm;
const card = (o: Partial<AssetForm> = {}) =>
  ({ ...makeDefaultAsset(2), assetKind: "land", landNature: "appurtenant", acquisitionCause: "purchase", acquisitionDate: "2022-06-01", ...o }) as AssetForm;

function form(assets: AssetForm[]): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-02-16",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets,
  };
}
const renderStep = (assets: AssetForm[]) => render(<Step4 form={form(assets)} onChange={() => {}} />);

describe("⑤ Step4 — 직접 입력 칸 안내(실제 화면)", () => {
  it("분리취득 S2 직접 입력: 거주기간(개월) 칸에 안내가 보이고 기존 hint도 그대로다", () => {
    renderStep([split()]);
    const h = screen.getByTestId(HINT).textContent ?? "";
    expect(h).toContain("토지를 건물보다 나중에 취득해 토지분 거주기간은 토지 보유기간 안의 거주만 셉니다");
    expect(h).toContain("개월 수로 입력하면 토지 보유기간을 상한으로 계산");
    expect(h).toContain("입주·퇴거일 구간으로 입력하면 겹친 기간만 셉니다");
    expect(h.length).toBeLessThan(150);
    expect(h).not.toMatch(/\d/); // placeholder·hint에 숫자 예시 금지
    expect(h).not.toMatch(/유리|불리|절감|절세/);
    // 같은 FieldCard의 기존 hint(표2 거주분 공제율 · 구간 입력 안내)는 덮이지 않고 함께 있다
    const field = screen.getByTestId(HINT).closest('[data-field="residencePeriodMonthsAsset"]');
    expect(field?.textContent).toContain("해당 주택에 실제 거주한 총 개월 수 (표2 거주분 공제율)");
    expect(field?.textContent).toContain("위 「거주 기간 입력」 토글을 켜면 입주일·퇴거일 구간으로 입력할 수 있습니다");
  });

  it("겸용주택 직접 입력(토지 나중 취득): 안내가 보인다", () => {
    renderStep([mixed()]);
    expect(screen.queryByTestId(HINT)).not.toBeNull();
  });

  it("함께 양도 부수토지 카드가 주택보다 늦은 경우(주 자산 직접 입력): 안내가 보인다", () => {
    renderStep([house(), card()]);
    expect(screen.queryByTestId(HINT)).not.toBeNull();
  });

  it("구간 입력 모드: 안내 없음(직접 입력 칸도 없다) — 분리취득·겸용·카드 모두", () => {
    for (const assets of [[split(interval)], [mixed(interval)], [house(interval), card()]]) {
      renderStep(assets);
      expect(screen.queryByTestId(HINT)).toBeNull();
      expect(document.querySelector('[data-field="residencePeriodMonthsAsset"]')).toBeNull();
      cleanup();
    }
  });

  it("짝 — 이 규칙이 걸리지 않으면 직접 입력 칸에도 안내가 없다", () => {
    const cases: [string, AssetForm[]][] = [
      ["토지가 먼저 취득", [split({ landAcquisitionDate: "2000-03-01" } as Partial<AssetForm>)]],
      ["같은 날 취득", [split({ landAcquisitionDate: "2010-03-01" } as Partial<AssetForm>)]],
      ["별개 취득 토글 OFF 잔재", [split({ hasSeperateLandAcquisitionDate: false } as Partial<AssetForm>)]],
      ["토지만 본인(소유자 분리)", [split({ selfOwns: "land_only" } as Partial<AssetForm>)]],
      ["겸용 · 토지 먼저", [mixed({ landAcquisitionDate: "2000-03-01" } as Partial<AssetForm>)]],
      ["겸용 · 토지 취득일 빈칸", [mixed({ landAcquisitionDate: "" } as Partial<AssetForm>)]],
      ["일반 주택(분리취득 아님)", [house()]],
      ["카드가 주택과 같은 날", [house(), card({ acquisitionDate: "2014-01-01" } as Partial<AssetForm>)]],
      ["카드가 주택보다 먼저", [house(), card({ acquisitionDate: "2010-01-01" } as Partial<AssetForm>)]],
      ["독립 나대지 카드", [house(), card({ landNature: "standalone" } as Partial<AssetForm>)]],
    ];
    for (const [name, assets] of cases) {
      renderStep(assets);
      expect(screen.queryByTestId(HINT), name).toBeNull();
      // 직접 입력 칸은 보인다 — 안내만 없다(칸 자체가 사라져 통과하는 거짓 음성 방지)
      expect(document.querySelector('[data-field="residencePeriodMonthsAsset"]'), name).not.toBeNull();
      cleanup();
    }
  });
});

describe("⑤ ResidencePeriodSection — prop 계약", () => {
  const section = (props: { landHoldingResidenceHint?: boolean; mode?: "direct" | "interval" }) =>
    render(
      <ResidencePeriodSection
        residenceInputMode={props.mode ?? "direct"}
        residencePeriods={props.mode === "interval" ? [{ moveInDate: "2010-06-01", moveOutDate: "" }] : []}
        residencePeriodMonthsAsset="60"
        transferDate="2026-02-16"
        landHoldingResidenceHint={props.landHoldingResidenceHint}
        onChange={vi.fn()}
      />,
    );

  it("prop이 켜지고 직접 입력일 때만 보인다", () => {
    section({ landHoldingResidenceHint: true });
    expect(screen.queryByTestId(HINT)).not.toBeNull();
  });
  it("prop이 없으면 없다", () => {
    section({});
    expect(screen.queryByTestId(HINT)).toBeNull();
  });
  it("prop이 켜져도 구간 입력이면 없다", () => {
    section({ landHoldingResidenceHint: true, mode: "interval" });
    expect(screen.queryByTestId(HINT)).toBeNull();
  });
});
