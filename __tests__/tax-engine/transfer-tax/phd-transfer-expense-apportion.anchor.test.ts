/**
 * anchor: **A06 — PHD(§164⑦) split 경로의 자산 단위 양도비 안분**
 *
 * ── 무엇을 고쳤나 ──────────────────────────────────────────────────────────
 * 종전에는 PHD split 경로가 `input.transferExpense`를 **읽지 않아 통째로 유실**됐다.
 * 비-PHD split 경로(`calcSplitGain` ③-b)는 이미 같은 안분을 하고 있어 두 경로가 어긋나 있었다.
 *
 * ── 근거 ────────────────────────────────────────────────────────────────
 * 「소득세법」 §100② **후문**(verbatim, 2026-09-03 조문 확인):
 *   「이 경우 **공통되는 취득가액과 양도비용**은 해당 자산의 가액에 비례하여 안분계산한다.」
 * ⇒ 양도비는 **명문 열거**에 있다.
 *
 * ⛔ **자본적지출은 그 열거에 없다** — 그래서 이 수정의 범위에서 제외한다(A06-4가 고정).
 *    자산 단위 자본적지출은 `transfer-tax-validate-split.ts`가 파트 칸으로 안내한다.
 *    국세청 예규 **법인46012-2439**도 같은 순서다 — 「자본적지출액이 어느 하나의 개별필지에
 *    귀속되는 것이 분명한 경우에는 해당필지에 가산하고, 그 귀속이 불분명한 경우에는 … 안분」.
 *
 * ── 왜 큰 금액이라야 관측되나 ──────────────────────────────────────────────
 * §97②2호는 가목(환산취득가 + 개산공제) ↔ 나목(자본적지출 + 양도비) **택일**이다.
 * PHD는 항상 환산 모드라 나목이 가목을 넘어야 swap이 발동한다. 그 전까지는 양도비를
 * 제대로 읽어도 세액이 움직이지 않는다 — **「변화 없음」이 곧 「미배선」이 아니다.**
 * 그래서 A06-1은 swap이 실제로 뒤집히는 구간에서 단언한다.
 *
 * 픽스처는 Excel 정본(`pre-housing-disclosure-fixture`)을 그대로 쓴다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
} from "./_helpers/pre-housing-disclosure-fixture";

function phdInput(over: Record<string, unknown> = {}) {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: PHD_TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2014-09-14"),
    landAcquisitionDate: new Date("2013-06-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    landSplitMode: "apportioned",
    preHousingDisclosure: PHD_INPUT,
    ...over,
  });
}

/** 실측 기준선 — 양도비 미입력 시 Excel 정본 값 */
const BASE_LAND_GAIN = 139_089_851;
const BASE_BLDG_GAIN = 8_490_962;
/** 파트별 양도가액 (안분 분모·분자) */
const LAND_TRANSFER_PRICE = 532_721_324;
const BLDG_TRANSFER_PRICE = 182_278_676;

describe("[A06] PHD split — 자산 단위 양도비를 파트에 안분한다 (§100② 후문)", () => {
  it("A06-1: 양도비 6억 → 토지분 swap 발동 · 양도차익 139,089,851 → 85,682,451", () => {
    const r = calcSplitGain(phdInput({ transferExpense: 600_000_000 }))!;

    // 종전에는 transferExpense를 아예 읽지 않아 기준선 그대로였다.
    expect(r.land.gain).not.toBe(BASE_LAND_GAIN);
    expect(r.land.gain).toBe(85_682_451);
    expect(r.land.swapApplied).toBe(true);
    // 나목 채택분 = 안분된 토지분 양도비
    expect(r.land.directExpenses).toBe(447_038_873);

    // 건물분은 이 금액대에서 아직 가목이 크다 — 파트별로 독립 판정된다.
    expect(r.building.swapApplied).toBe(false);
    expect(r.building.gain).toBe(BASE_BLDG_GAIN);
  });

  it("A06-2: 안분 합계가 보존된다 — 잔액은 건물분이 흡수 (Σ == transferExpense)", () => {
    const TOTAL = 900_000_000;
    const r = calcSplitGain(phdInput({ transferExpense: TOTAL }))!;

    // 양쪽 다 나목 채택 → 두 directExpenses의 합이 곧 안분 결과다.
    expect(r.land.swapApplied).toBe(true);
    expect(r.building.swapApplied).toBe(true);
    expect(r.land.directExpenses).toBe(670_558_309);
    expect(r.building.directExpenses).toBe(229_441_691);
    expect(r.land.directExpenses + r.building.directExpenses).toBe(TOTAL);
  });

  it("A06-3(회귀): 양도비 미입력이면 Excel 정본 기준선이 불변이다", () => {
    const r = calcSplitGain(phdInput())!;
    expect(r.land.gain).toBe(BASE_LAND_GAIN);
    expect(r.building.gain).toBe(BASE_BLDG_GAIN);
    expect(r.land.directExpenses).toBe(0);
    expect(r.building.directExpenses).toBe(0);
    expect(r.land.swapApplied).toBe(false);
    expect(r.building.swapApplied).toBe(false);
  });

  it("A06-4(범위 고정): 자산 단위 **자본적지출**은 안분하지 않는다 — §100② 후문 미열거", () => {
    // 같은 6억을 자본적지출로 넣으면 PHD 경로는 움직이지 않아야 한다.
    // (파트 칸 `landDirectExpenses`/`buildingDirectExpenses`로 귀속을 명시하는 것이 정답 —
    //  `transfer-tax-validate-split.ts`가 그렇게 안내한다.)
    const r = calcSplitGain(phdInput({ capitalExpenditure: 600_000_000 }))!;
    expect(r.land.gain).toBe(BASE_LAND_GAIN);
    expect(r.building.gain).toBe(BASE_BLDG_GAIN);
    expect(r.land.directExpenses).toBe(0);
    expect(r.building.directExpenses).toBe(0);
  });

  it("A06-5: 안분 기준은 **양도가액 비례**다 — 파트 양도가액 비율과 일치", () => {
    const TOTAL = 900_000_000;
    const r = calcSplitGain(phdInput({ transferExpense: TOTAL }))!;

    // 분모·분자가 파트별 양도가액이라는 것을 값으로 고정한다.
    expect(r.land.transferPrice).toBe(LAND_TRANSFER_PRICE);
    expect(r.building.transferPrice).toBe(BLDG_TRANSFER_PRICE);

    // 토지분은 비례 배분(floor), 건물분이 잔액을 흡수 — 비-PHD 경로와 같은 규약.
    const expectedLand = Math.floor(
      (TOTAL * LAND_TRANSFER_PRICE) / (LAND_TRANSFER_PRICE + BLDG_TRANSFER_PRICE),
    );
    // applyRate의 절사 규약상 1원 이내에서 일치한다.
    expect(Math.abs(r.land.directExpenses - expectedLand)).toBeLessThanOrEqual(1);
    expect(r.building.directExpenses).toBe(TOTAL - r.land.directExpenses);
  });
});
