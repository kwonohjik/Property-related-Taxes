/**
 * anchor — 양도세 결과뷰 리뷰(2026-11-21) c02 MINOR 묶음: 겸용주택 결과 카드 표시.
 *
 *  - R-c02-06 ④ 비사업용토지 배율 산식이 「소득세법 시행령」 §168의12 각 호·목 구분을 그대로 적는다
 *    (종전 「수도권 주거지역 3배 / 녹지·외곽 5배 / 도시 외 10배」 — 상업·공업지역 누락·「외곽」은 법령에 없는 말).
 *    2022.1.1. 전 양도분은 종전 규정(도시지역 안 일률 5배 — 2020.2.11. 대통령령 제30395호 부칙 §39)이라 그 구분을 적는다.
 *    근거 머리말은 법률 §104의3 + 시행령 §168의12로 층위를 밝힌다(종전 「시행령 §168의12 + §104의3」).
 *  - R-c02-07 다주택 중과로 주택분 장특이 배제되면 비과세 배너도 «배제»를 말한다(종전 「전액 과세 + 표1 공제」 — 아래 행과 반대).
 *  - R-c02-08 공용 Row 금액 칸이 `font-mono tabular-nums whitespace-nowrap text-right`다(components/calc/CLAUDE.md 금액 칸 정렬).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14, mixedUseExcessLand, CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE } from "../tax-engine/_helpers/mixed-use-fixture";
import { MixedUseCalculationSections } from "@/components/calc/results/mixed-use/MixedUseCalculationSections";
import { MixedUseNblSection } from "@/components/calc/results/mixed-use/MixedUseNblSection";
import { Row } from "@/components/calc/results/mixed-use/MixedUseResultCardParts";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const OPEN = { apportion: true, housing: true, commercial: true, nbl: true, total: true };
const draw = (b: MixedUseGainBreakdown) =>
  render(
    <MixedUseCalculationSections
      breakdown={b} selectedPrintIds={new Set()} openSections={OPEN}
      toggleSection={() => {}} allSectionsOpen setAllSections={() => {}}
    />,
  ).container;

// ───────────────────────────────── R-c02-06 ─────────────────────────────────
describe("R-c02-06 ④ 배율 산식 — 영 §168의12 구분 그대로 · 양도일 연혁", () => {
  const b = calc(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, mixedUseExcessLand(), makeMockRates());
  const nb = b.nonBusinessLandPart!;
  const drawNbl = (transferDate?: string) =>
    render(
      <MixedUseNblSection
        nb={nb} landTransferGain={b.housingPart.landTransferGain} nonBusinessTransferRatio={b.housingPart.nonBusinessTransferRatio}
        transferDate={transferDate} open onToggle={() => {}}
      />,
    ).container.textContent ?? "";

  it("시료 전제 — 배율 초과분이 있다(2022.2.16. 양도)", () => {
    expect(nb).toBeDefined();
    expect(nb.appliedMultiplier).toBe(3);
  });

  it("2022.1.1. 이후 양도 — 수도권 주거·상업·공업지역 3배 / 녹지 5배 / 수도권 밖 5배 / 그 밖 10배, 「외곽」 없음", () => {
    const t = drawNbl("2022-02-16");
    expect(t).toContain("도시지역 안: 수도권 주거·상업·공업지역 3배 / 수도권 녹지지역 5배 / 수도권 밖 5배 · 그 밖의 토지 10배");
    expect(t).not.toContain("외곽");
    expect(t).not.toContain("종전 규정");
  });

  it("근거 머리말 — 법률 §104의3 + 시행령 §168의12 (층위 표기)", () => {
    expect(drawNbl("2022-02-16")).toContain("소득세법 §104조의3 + 소득세법 시행령 §168의12");
  });

  it("2022.1.1. 전 양도 — 종전 규정(도시지역 안 5배 / 그 밖 10배)을 적는다", () => {
    const t = drawNbl("2021-12-31");
    expect(t).toContain("도시지역 안의 토지 5배 / 그 밖의 토지 10배 (2022.1.1. 전 양도 — 종전 규정)");
    expect(t).not.toContain("수도권 주거·상업·공업지역");
  });

  it("양도일이 없으면(구 결과·폼 없음) 현행 구분", () => {
    expect(drawNbl(undefined)).toContain("수도권 주거·상업·공업지역 3배");
  });

  it("카드 경로 — formData 양도일이 ④ 섹션까지 내려간다", () => {
    const c = render(
      <MixedUseCalculationSections
        breakdown={b} formData={{ transferDate: "2021-06-01" } as never} selectedPrintIds={new Set()} openSections={OPEN}
        toggleSection={() => {}} allSectionsOpen setAllSections={() => {}}
      />,
    ).container;
    expect(c.textContent).toContain("(2022.1.1. 전 양도 — 종전 규정)");
  });
});

// ───────────────────────────────── R-c02-07 ─────────────────────────────────
describe("R-c02-07 다주택 중과 장특 배제 — 비과세 배너가 아래 장특 행과 같은 말을 한다", () => {
  const run = (over: Partial<MixedUseAssetInput>) =>
    calc(3_000_000_000, new Date("2026-06-01"), { ...mixedUseCase14(), isOneHouseExempt: false, ...over }, makeMockRatesWithHouseEngine());

  it("중과 배제(fallback 2주택 조정대상지역) — 「주택분 장기보유특별공제 배제」, 「표1 공제」 없음", () => {
    const b = run({ surchargeFallback: { isRegulatedArea: true, householdHousingCount: 2 } });
    expect(b.calculationRoute.highValueRule, "시료 전제").toBe("non_one_house_full_taxation");
    expect(b.surchargeLthdExclusion, "시료 전제 — 엔진 배제 echo").toBeDefined();
    const t = draw(b).textContent ?? "";
    expect(t).toContain("1세대 1주택 비과세: 미적용 (전액 과세 · 다주택 중과 대상 — 주택분 장기보유특별공제 배제)");
    expect(t).not.toContain("전액 과세 + 표1 공제");
  });

  it("대조 — 배제가 없으면 종전 「전액 과세 + 표1 공제」", () => {
    const b = run({ surchargeFallback: { isRegulatedArea: false, householdHousingCount: 2 } });
    expect(b.surchargeLthdExclusion).toBeUndefined();
    expect(draw(b).textContent).toContain("1세대 1주택 비과세: 미적용 (전액 과세 + 표1 공제)");
  });
});

// ───────────────────────────────── R-c02-08 ─────────────────────────────────
describe("R-c02-08 공용 Row 금액 칸 정렬 클래스", () => {
  it("값 span — font-mono tabular-nums whitespace-nowrap text-right", () => {
    const c = render(<Row label="양도가액" value="1,234,567,890원" />).container;
    const value = [...c.querySelectorAll("span")].find((s) => s.textContent === "1,234,567,890원")!;
    for (const cls of ["font-mono", "tabular-nums", "whitespace-nowrap", "text-right"]) expect(value.className).toContain(cls);
  });
});
