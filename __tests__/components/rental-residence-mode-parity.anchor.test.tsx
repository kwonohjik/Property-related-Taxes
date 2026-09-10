/**
 * @vitest-environment jsdom
 *
 * anchor R21 — §155⑳ 특례 섹션의 거주기간 카드가 **자기 자신과 모순되지 않는다**.
 *
 * ## 종전 결함 — 같은 카드가 「0개월」과 「✓ 충족」을 동시에 말했다
 *
 * store 기본값은 `residenceInputMode: "direct"`(`calc-wizard-asset-residence.ts:17`)다.
 * 보유 상황 단계에서 개월 수로 입력한 사용자가 이 카드를 열면:
 *
 * | 같은 카드 안 | 종전 표시 |
 * |---|---|
 * | 구간 에디터(`PeriodRangeEditor`) | 구간 0개 → **「합계 거주기간 0개월」** |
 * | 바로 아래 실시간 판정(`deriveResidencePeriodMonths`) | direct 30개월을 읽어 **「✓ 충족」** |
 *
 * 게다가 구간을 입력하면 `deriveResidencePeriodMonths`가
 * `interval && periods.length > 0`에서 구간 합산으로 갈아타므로 **그 개월 수는 버려진다**
 * (§155⑳ 거주 2년 요건 직결). 안내문 「어디서 입력해도 자동 동기화됩니다」도 사실이 아니었다.
 *
 * ## ⛔ 「토글을 되살린다」는 처방이 아니다 — 재제안 금지
 *
 * `251df37b`(2026-07-26)가 **의도적으로** direct↔interval 활성화 토글을 제거했다:
 * 「임대·거주 기간은 최소 1건 반드시 입력해야 하므로 토글이 불필요·혼란」.
 * Step4 `ResidencePeriodSection`만 자체 토글을 유지한 것도 그때의 명시적 결정이다.
 * ⇒ 상시 표시는 **그대로 두고**, direct 값의 존재와 대체 사실을 **말로 밝힌다**.
 *   개월→날짜 역산은 불가하므로 값을 몰래 옮기지 않는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TRANSFER_DATE = "2024-06-30";
const ECHO = "residence-direct-months-echo";

function makeAsset(over: Partial<AssetForm> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "30",
    rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A" },
    ...over,
  };
}

function renderSection(asset: AssetForm, onChangeResidence = vi.fn()) {
  render(
    <RentalHousingExceptionSection
      rh={asset.rentalHousingException}
      asset={asset}
      acquisitionDate="2018-01-01"
      transferDate={TRANSFER_DATE}
      onChangeResidence={onChangeResidence}
      onChange={vi.fn()}
    />,
  );
  return onChangeResidence;
}

describe("R21 · direct 모드의 거주개월을 화면이 숨기지 않는다", () => {
  it("🔴 direct 모드에 개월 값이 있으면 echo가 뜬다", () => {
    renderSection(makeAsset());
    expect(screen.getByTestId(ECHO)).toBeDefined();
  });

  it("🔴 echo가 실시간 판정과 «같은 값»을 말한다 — 카드 내 모순 해소", () => {
    const asset = makeAsset();
    renderSection(asset);
    expect(deriveResidencePeriodMonths(asset, TRANSFER_DATE, "")).toBe(30);
    expect(screen.getByTestId(ECHO).textContent).toContain("30개월");
  });

  it("🔴 구간 입력이 그 값을 «대체»한다는 사실을 미리 알린다", () => {
    renderSection(makeAsset());
    expect(screen.getByTestId(ECHO).textContent).toContain("대체");
  });

  it("🔑 렌더만으로 store를 건드리지 않는다 — 값을 몰래 옮기지 않는다", () => {
    const onChangeResidence = renderSection(makeAsset());
    expect(onChangeResidence).not.toHaveBeenCalled();
  });
});

describe("⛔ 대조군 — 「상시 표시」 설계(251df37b)는 그대로다", () => {
  it("direct 모드에서도 구간 에디터는 계속 보인다 (토글 부활 아님)", () => {
    renderSection(makeAsset());
    expect(screen.getByTestId("residence-period-editor")).toBeDefined();
  });

  it("direct 모드에 개월 직접입력 칸을 되살리지 않았다", () => {
    renderSection(makeAsset());
    expect(screen.queryByText("거주기간 (개월)")).toBeNull();
  });
});

describe("🔴 대조군 — echo는 필요할 때만 뜬다", () => {
  it("interval 모드면 echo가 없다", () => {
    renderSection(
      makeAsset({
        residenceInputMode: "interval",
        residencePeriods: [{ moveInDate: "2019-01-01", moveOutDate: "2022-01-01" }],
      }),
    );
    expect(screen.queryByTestId(ECHO)).toBeNull();
  });

  it("direct인데 개월이 0이면 echo가 없다 (빈 안내 금지)", () => {
    renderSection(makeAsset({ residencePeriodMonthsAsset: "" }));
    expect(screen.queryByTestId(ECHO)).toBeNull();
  });

  it("interval 구간 합산은 종전대로 36개월", () => {
    const asset = makeAsset({
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2019-01-01", moveOutDate: "2022-01-01" }],
      residencePeriodMonthsAsset: "",
    });
    expect(deriveResidencePeriodMonths(asset, TRANSFER_DATE, "")).toBe(36);
  });
});
