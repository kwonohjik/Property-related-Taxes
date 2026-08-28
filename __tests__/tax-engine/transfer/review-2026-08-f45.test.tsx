/**
 * F45 — §95⑤ 용도변경 산출근거 카드가 **단건 결과뷰에만** 배선돼 일괄(bundled)에서 사라졌다.
 *
 * 엔진은 `usageConversionDetail`을 단건 결과에 담고(`transfer-tax-lthd.ts` → `transfer-tax.ts`),
 * 집계도 `pickReductionDetails`(`transfer-tax-aggregate-pickers.ts`)로 자산별 breakdown에 옮긴다 —
 * 데이터는 도달한다. 그러나 렌더러가 `TransferTaxResultView` 인라인 한 곳뿐이었고,
 * 일괄 결과가 쓰는 공용 `ReductionDetailCards`의 표시 목록에 이 필드가 없었다.
 *
 * ⚠️ 분기만 추가하면 단건에서 **카드가 2번** 렌더된다 → 인라인 렌더를 함께 제거했다.
 *    카드는 다른 감면 상세 카드와 같은 자리(`ReductionDetailCards`)로 이동한다.
 *    §95⑤ 전용 print leaf는 만들지 않는다 — 카드는 감면 상세 묶음 안에 있어야 한다
 *    (아래 단언은 2026-08-28에 「목록 전체 고정」에서 그 불변만 남기도록 완화했다).
 *
 * 세액 불변(표시 갭). 기대값은 엔진(`calculateTransferTax`)을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { flattenPrintSectionIds } from "@/lib/print/transfer-print-sections";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

afterEach(cleanup);

const CARD_TITLE = "비주택 → 주택 용도변경 장기보유특별공제";

/** PDF 사례 30 — 오피스텔 업무용 취득(2018-02-10) → 주거용 전환(2022-11-25) → 양도(2026-01-27) */
function case30() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2026-01-27"),
      acquisitionPrice: 600_000_000,
      acquisitionDate: new Date("2018-02-10"),
      expenses: 7_300_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 36,
      wasRegulatedAtAcquisition: true,
      isRegulatedArea: false,
      isUnregistered: false,
      nonHousingToHousingConversion: {
        residentialUseStartDate: new Date("2022-11-25"),
        residenceMonthsTrimmed: 0,
      },
    }),
    makeMockRates(),
  );
}

describe("F45 — §95⑤ 용도변경 카드가 공용 ReductionDetailCards에 배선된다", () => {
  it("엔진이 usageConversionDetail을 채운다 (전제)", () => {
    const r = case30();
    expect(r.usageConversionDetail).toBeDefined();
    expect(r.usageConversionDetail!.nonHousingYears).toBe(4);
    expect(r.usageConversionDetail!.housingYears).toBe(3);
    expect(r.usageConversionDetail!.table1Pct).toBe(8);
    expect(r.usageConversionDetail!.table2HoldingPct).toBe(12);
    expect(r.longTermHoldingDeduction).toBe(57_132_800);
  });

  it("공용 컴포넌트가 카드를 렌더한다 (종전: 완전 미렌더 — 일괄에서 사라짐)", () => {
    const r = case30();
    const { container } = render(
      <ReductionDetailCards
        result={r}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
        longTermHoldingDeduction={r.longTermHoldingDeduction}
      />,
    );
    expect(container.textContent).toContain(CARD_TITLE);
    // 머리글 금액은 명시 prop(`longTermHoldingDeduction`)에서 온다 — 계약 타입엔 없는 값이다.
    expect(container.textContent).toContain("57,132,800");
  });

  it("단건 결과뷰에서 카드가 정확히 1번만 나온다 (인라인 렌더 중복 방지)", () => {
    const r = case30();
    const { container } = render(
      <TransferTaxResultView result={r} onReset={() => {}} onBack={() => {}} />,
    );
    const count = container.textContent!.split(CARD_TITLE).length - 1;
    expect(count).toBe(1);
  });

  it("계약 25종을 ReductionDetailCards가 모두 렌더 분기한다 (소스 동기화 가드)", () => {
    // ValuationDetailCards 가드(transfer.route.bundled-swallows-special.test.ts)와 같은 방식.
    // ⚠️ 파일 전체를 훑으면 상단 `hasAny` 체크에 걸려 렌더 분기를 지워도 통과한다 →
    //    JSX(`return (` 이후)로 범위를 좁힌다.
    const typeSrc = readFileSync("lib/tax-engine/types/transfer-result.types.ts", "utf8");
    const contract = [
      ...new Set(
        [
          ...typeSrc
            .slice(typeSrc.indexOf("export type TransferReductionDetailSource"))
            .split(">;")[0]
            .matchAll(/"(\w+Detail)"/g),
        ].map((m) => m[1]),
      ),
    ];
    expect(contract).toContain("usageConversionDetail");
    const ui = readFileSync("components/calc/results/transfer/ReductionDetailCards.tsx", "utf8");
    const jsx = ui.slice(ui.lastIndexOf("return ("));
    const missing = contract.filter((f) => !jsx.includes(`result.${f}`));
    expect(missing, "계약에 있으나 컴포넌트가 렌더하지 않는 필드").toEqual([]);
  });

  /**
   * ⚠️ **2026-08-28 완화** — 종전에는 leaf 목록 **전체를 동등 비교**했다. 그 단언이 지키려던
   *   것은 「F45가 §95⑤ 전용 leaf를 만들지 않고 기존 `ReductionDetailCards` 자리로 옮겼다」는
   *   **이 PR의 결정**인데, 전체 동등 비교는 이후의 **정당한 leaf 추가까지 막았다** —
   *   실제로 #062(선택 출력이 안 걸리던 블록을 `allocation`·`detail-cards`로 감싼 작업)에서
   *   이 단언이 빨개졌다. F45의 불변만 남기고 「목록 고정」은 푼다.
   *
   * 📌 leaf 목록의 정본 동기화 지점은 `__tests__/print/transfer-print-sections.test.ts`의
   *   `ALL_LEAVES`다 — 새 leaf는 거기에 등록한다.
   */
  it("F45는 §95⑤ 전용 leaf를 만들지 않았다 (기존 섹션 안으로 이동)", () => {
    const ids = flattenPrintSectionIds();
    // F45 시점의 7종이 **제거되지 않았다** (그 축의 회귀 방어).
    for (const id of [
      "form-table",
      "detailed-statement",
      "calculation",
      "phd",
      "split-detail",
      "gift-filing-form",
      "building-std-report",
    ]) {
      expect(ids, `${id} leaf가 사라졌다`).toContain(id);
    }
    // §95⑤ 용도변경 전용 leaf는 만들지 않는다 — 카드는 감면 상세 묶음 안에 있어야 한다.
    expect(ids).not.toContain("usage-conversion");
  });
});
