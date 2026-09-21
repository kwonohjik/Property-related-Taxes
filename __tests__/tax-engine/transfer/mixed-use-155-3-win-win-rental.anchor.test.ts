/**
 * anchor: 겸용주택 × §155의3 **상생임대주택** — 거주기간 제한 면제 (P5-c)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §16.5 · §29.
 *
 * ## 🔴 한 필드가 **두 지점**을 연다 — 하나만 고치면 축이 어긋난다
 *
 * 법문(시행령 MST 286211 실독) §155의3①: 「국내에 1주택 … 을 소유한 1세대가 … 상생임대주택을
 * 양도하는 경우에는 **제154조제1항, 제155조제20항제1호 및 제159조의4**를 적용할 때 해당 규정에
 * 따른 **거주기간의 제한을 받지 않는다**」.
 *
 * | 지점 | 조문 | 겸용 경로 소비처 | 이 파일 |
 * |---|---|---|---|
 * | 비과세 거주요건 | §154① | `exemptionReqInput` → `meetsOneHouseHoldingResidence` | MX-3·MX-4 |
 * | 장특 표2 게이트 | §159의4 | `buildHousingPart` → `meetsTable2ResidenceRequirement` | MX-1·MX-2 |
 * | 표시 사유 문구 | — | `buildCalculationRoute` | MX-7 |
 *
 * 종전에는 **셋 다** 죽어 있었다. 겸용 경로가 `winWinRentalHouse`를 아예 받지 않았기 때문이다
 * (`MixedUseAssetInput`에 필드 부재 · 표2 게이트는 `table2ResidenceYears >= 2` 손비교).
 *
 * ## 🔑 관측 지점을 먼저 갈랐다 — 안 그러면 **구별력 0**이다
 *
 * 둘 다 「거주요건 **면제**」라 시료를 잘못 잡으면 면제를 지워도 세액이 그대로다. 두 함정:
 *
 *   ① **2017-08-03 이전 취득**이면 §154① 부칙 경과규정이 거주요건을 **이미 면제**한다
 *      (`mixed-use-154-1-residence.anchor` B-A0). CASE14 원본 건물취득일 1997-09-12가 그것이라
 *      그대로 쓰면 아무것도 관측되지 않는다 ⇒ `POST_POLICY_ACQ`로 덮는다.
 *   ② **비조정대상지역**이면 §154① 거주요건이 **애초에 없다** ⇒ 비과세 축은 안 갈리고 표2만 갈린다.
 *      표2를 관측할 때는 이것이 **장점**이다(축이 하나만 움직인다). 반대로 비과세 축을 보려면
 *      조정대상지역을 켜야 한다. ⇒ MX-1·MX-2는 비조정, MX-3·MX-4는 조정으로 **갈라 세운다**.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const TRANSFER_DATE = D("2026-06-01");
const PRICE = 3_000_000_000;
/** §154① 부칙 경과규정(2017-08-03 이전 취득 면제)을 피해 거주요건이 **실제로 걸리게** 한다. */
const POST_POLICY_ACQ = D("2018-06-01");

/** §155의3① 1~3호를 모두 충족하는 값. */
const WIN_WIN_OK = {
  winWinContractDate: D("2022-05-01"),
  increaseRatePct: 5,
  priorLeaseMonths: 18,
  winWinLeaseMonths: 24,
} as const;

function run(over: Partial<MixedUseAssetInput> = {}) {
  return calcMixedUseTransferTax(
    PRICE,
    TRANSFER_DATE,
    {
      ...mixedUseCase14(),
      residencePeriodYears: 0,
      buildingAcquisitionDate: POST_POLICY_ACQ,
      ...over,
    },
    makeMockRates(),
  );
}

describe("P5-c ① 장특 표2 게이트 (§159의4)", () => {
  /**
   * 🔴 **핵심 시료.** 비조정이라 §154① 거주요건이 없어 비과세는 양쪽 다 선다 —
   *    갈리는 것은 **표2 게이트 하나뿐**이다(단건 경로 OH-12와 같은 관측 설계).
   */
  it("[MX-1] 거주 0년이어도 상생임대주택이면 표2가 열린다", () => {
    const base = { wasRegulatedAtAcquisition: false } as const;
    const without = run(base);
    const withWinWin = run({ ...base, winWinRentalHouse: { ...WIN_WIN_OK } });

    expect(without.housingPart.longTermDeductionTable).toBe(1);
    expect(withWinWin.housingPart.longTermDeductionTable).toBe(2);
    // 표2 보유분(4%)이 표1(2%)보다 크므로 공제가 늘고 세액이 준다.
    expect(withWinWin.housingPart.longTermDeductionRate).toBeGreaterThan(
      without.housingPart.longTermDeductionRate,
    );
    expect(withWinWin.total.transferTax).toBeLessThan(without.total.transferTax);
  });

  /**
   * 🔑 **부정 짝** — 요건을 하나라도 깨면 되돌아온다. 이것이 없으면 「항상 표2」로 바꿔도 초록이다.
   *    네 요건을 각각 깨 본다(`qualifiesWinWinRental`의 조건 4개 전건).
   */
  it.each([
    ["증가율 5% 초과", { increaseRatePct: 5.1 }],
    ["직전임대 18개월 미만", { priorLeaseMonths: 17 }],
    ["상생임대 24개월 미만", { winWinLeaseMonths: 23 }],
    ["계약일이 2021-12-20 이전", { winWinContractDate: D("2021-12-19") }],
    ["계약일이 2026-12-31 이후", { winWinContractDate: D("2027-01-01") }],
  ])("[MX-2] 요건 미달(%s)이면 표2가 열리지 않는다", (_label, broken) => {
    const r = run({
      wasRegulatedAtAcquisition: false,
      winWinRentalHouse: { ...WIN_WIN_OK, ...broken },
    });
    expect(r.housingPart.longTermDeductionTable).toBe(1);
  });
});

describe("P5-c ② 비과세 거주요건 (§154①)", () => {
  /**
   * 🔴 **같은 필드가 여는 두 번째 지점.** 조정대상지역이라 거주 2년이 요구되는데, 상생임대주택은
   *    그 제한을 받지 않는다. 종전에는 겸용만 이 면제를 못 받아 **비과세가 통째로 배제**됐다
   *    (과다과세). 표2만 고치고 여기를 빠뜨리면 「표2는 열리는데 비과세는 안 되는」 상태가 된다.
   */
  it("[MX-3] 조정대상지역 + 거주 0년이어도 상생임대주택이면 비과세가 선다", () => {
    const base = { wasRegulatedAtAcquisition: true } as const;
    const without = run(base);
    const withWinWin = run({ ...base, winWinRentalHouse: { ...WIN_WIN_OK } });

    // 비과세 배제 → 12억 안분이 없어 양도차익 전액이 과세대상이 된다.
    expect(without.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    // 면제 → 고가주택 안분 경로로 돌아온다.
    expect(withWinWin.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(withWinWin.total.transferTax).toBeLessThan(without.total.transferTax);
  });

  /** 부정 짝 — 요건 미달이면 비과세도 되돌아온다. */
  it("[MX-4] 요건 미달이면 조정대상지역 거주요건이 그대로 걸린다", () => {
    const r = run({
      wasRegulatedAtAcquisition: true,
      winWinRentalHouse: { ...WIN_WIN_OK, priorLeaseMonths: 17 },
    });
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
  });
});

describe("P5-c ③ 회귀·경계", () => {
  /** 🔑 입력이 없으면 **아무것도 바뀌지 않는다** — 기존 겸용 세액 전건이 불변이어야 한다. */
  it("[MX-5] 상생임대 입력이 없으면 종전과 같다", () => {
    const a = run({ wasRegulatedAtAcquisition: false });
    const b = run({ wasRegulatedAtAcquisition: false, winWinRentalHouse: undefined });
    expect(b.total.transferTax).toBe(a.total.transferTax);
    expect(b.housingPart.longTermDeductionTable).toBe(1);
  });

  /**
   * 🔑 **거주 2년을 이미 채웠으면 면제가 아무것도 더하지 않는다** — 면제는 요건을 «면제»할 뿐
   *    공제율을 올리지 않는다. 이것이 깨지면 상생임대가 거주분 공제까지 준 것이다.
   */
  it("[MX-6] 거주 2년을 채운 경우 상생임대가 세액을 바꾸지 않는다", () => {
    const base = { wasRegulatedAtAcquisition: false, residencePeriodYears: 2 } as const;
    const without = run(base);
    const withWinWin = run({ ...base, winWinRentalHouse: { ...WIN_WIN_OK } });
    expect(withWinWin.total.transferTax).toBe(without.total.transferTax);
    expect(without.housingPart.longTermDeductionTable).toBe(2);
  });

  /**
   * 🔴 **화면이 거짓말하지 않는다.** 상생임대로 표2가 열리면 거주 연수는 0인데, 종전 문구는
   *    「거주(통산) 0년 ≥ 2년 → 표2」를 그대로 출력했다 — 공제율은 맞고 **설명이 틀린** 상태다
   *    (`feedback_engine_result_display_drift`).
   */
  it("[MX-7] 표2 사유 문구가 상생임대를 근거로 말한다", () => {
    const r = run({
      wasRegulatedAtAcquisition: false,
      winWinRentalHouse: { ...WIN_WIN_OK },
    });
    const reason = r.calculationRoute.housingDeductionTableReason;
    expect(reason).toContain("상생임대주택");
    expect(reason).toContain("§155의3");
    // 거짓 명제가 남아 있으면 안 된다.
    expect(reason).not.toContain("0년 ≥ 2년");
  });

  /** 연수로 표2가 열린 경우에는 종전 문구가 그대로다 — 새 분기가 기존 설명을 먹지 않는다. */
  it("[MX-8] 거주 연수로 표2가 열리면 문구는 종전 그대로다", () => {
    const reason = run({ wasRegulatedAtAcquisition: false, residencePeriodYears: 3 })
      .calculationRoute.housingDeductionTableReason;
    expect(reason).toContain("거주(통산) 3년 ≥ 2년");
    expect(reason).not.toContain("상생임대");
  });
});
