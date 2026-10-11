/**
 * G3-4 anchor — **토지만 출자한 원조합원**의 완공APT: §154① 보유기간은 **사용승인일**부터 센다.
 *
 * ## 결함 (수정 전 실측 — 엔진 직접)
 * 비과세 판정 보유 기산일(`judgeRedevAptOneHouseExemption`)이 「승계조합원 + 준공일」일 때만 준공일이었고, 그 밖에는
 * §166 산식용 **토지 취득일**이었다. 토지만 출자한 원조합원이 준공 후 약 1년 4개월 만에 양도해도 토지 취득일부터
 * 15년 넘게 센 보유기간으로 전액 비과세(totalTax 0)가 났다. 같은 날짜의 승계조합원 대조는 과세(520,410,000).
 *
 * ## 법령 (KoreanLaw MCP — 「소득세법 시행령」 MST 290841 원문 확인)
 * - 제154조제5항: 보유기간은 법 제95조제4항 「취득일부터 양도일까지」에 따른다.
 * - 제162조제1항제4호: 「자기가 건설한 건축물에 있어서는 「건축법」 제22조제2항에 따른 사용승인서 교부일」.
 * - 제154조제8항제1호: 통산 대상은 「멸실되어 재건축한 주택인 경우에는 그 멸실된 주택과 재건축한 주택」 —
 *   토지만 출자했으면 멸실된 주택이 없어 통산할 대상이 없다.
 * - 서면-2022-부동산-1616(2023.09.14. — 반박 검토자 taxlaw.nts 원문 실독): 「토지를 소유한 조합원이 재개발로
 *   취득한 주택의 보유기간 계산은 사용검사필증교부일부터 양도일까지로 하는 것임」.
 *
 * ## 범위 — 보유 기산일만. 거주요건 판정 기준일은 **사용자 결정 대기**라 현행(토지 취득일)을 유지한다
 * 「취득 당시」 조정대상지역·2017.8.3. 경과규정 판정일은 이 변경으로 움직이지 않는다 — 아래 마지막 describe가
 * **현행 유지를 고정**한다(결정이 나면 그 단언을 의도적으로 뒤집는다 · 서면-2022-법규재산-4321이 경과규정을
 * 입주권 전환 시점으로 판단해 사용승인일/인가일 중 어느 쪽인지 갈린다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 토지(2007-02-01 취득)만 출자한 원조합원 · 인가 2014-01-23 · 청산금 1.36억 납부 · 1세대1주택 · 거주 60개월 */
function landApt(over: Partial<TransferTaxInput> = {}, rOver: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: D("2024-05-20"),
    acquisitionDate: D("2007-02-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2014-01-23"),
      rightsValue: 250_000_000,
      settlementDirection: "pay",
      settlementAmount: 136_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "land",
      ...rOver,
    } as RedevelopmentInfo,
    ...over,
  });
}

describe("G3-4 — 토지 출자 원조합원 완공APT의 §154① 보유 기산일 = 사용승인일", () => {
  it("🔑 준공 2023-01-15 · 양도 2024-05-20(약 1년 4개월) — 보유 2년 미달: 비과세 아님 (수정 전: 전액 비과세 · 세액 0)", () => {
    const r = calculateTransferTax(landApt({}, { completionDate: D("2023-01-15") }), rates);
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("긍정 짝 — 준공 2020-01-01 · 양도 2024-05-20(보유 2년 이상): 같은 사실에서 전액 비과세", () => {
    const r = calculateTransferTax(landApt({}, { completionDate: D("2020-01-01") }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("경계 — 보유기간은 사용승인일을 산입한다(§95④): 준공 2022-05-20 → 양도 2024-05-18은 미달, 05-19(만 2년 도달)는 충족", () => {
    const before = calculateTransferTax(
      landApt({ transferDate: D("2024-05-18") }, { completionDate: D("2022-05-20") }),
      rates,
    );
    const after = calculateTransferTax(
      landApt({ transferDate: D("2024-05-19") }, { completionDate: D("2022-05-20") }),
      rates,
    );
    expect(before.isExempt).toBe(false);
    expect(after.isExempt).toBe(true);
  });

  it("준공일 미입력(API 직접 호출) — 종전 동작(취득일 기산)을 유지한다 — ⑧·⑫가 입력 경로에서 필수로 막는다", () => {
    const r = calculateTransferTax(landApt(), rates);
    expect(r.isExempt).toBe(true);
  });

  it("대조군 — 주택을 출자한 원조합원은 §154⑧1호 통산으로 종전주택 취득일부터 센다(같은 준공일에서도 비과세)", () => {
    const r = calculateTransferTax(
      landApt({ acquisitionDate: D("2007-02-01") }, { completionDate: D("2023-01-15"), originalAssetType: "housing" }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("대조군 — 같은 날짜의 승계조합원은 준공일 기산이라 과세(종전부터 그랬다)", () => {
    const r = calculateTransferTax(
      landApt(
        { acquisitionDate: D("2016-12-01"), acquisitionPrice: 400_000_000 },
        { completionDate: D("2023-01-15"), originalAssetType: "land", isSuccessorMember: true },
      ),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });
});

describe("G3-4 — 범위 밖 고정: 거주요건 판정 기준일(사용자 결정 대기)은 현행(토지 취득일) 유지", () => {
  const GANGNAM = "1168010100";
  it("취득 당시(토지 취득 2007) 비조정 → 사용승인 시점이 조정지역이어도 거주요건이 붙지 않는다 — 결정 후 의도적으로 갱신", () => {
    // 보유는 준공일 기산(2020-01-01 → 양도 2024-05-20 ≥ 2년)이라 충족, 거주 0개월.
    // 「취득 당시」 조정지역 여부·경과규정은 여전히 토지 취득일(2007-02-01) 기준 → 거주요건 없음 → 비과세.
    const r = calculateTransferTax(
      landApt({ regionCode: GANGNAM, residencePeriodMonths: 0, wasRegulatedAtAcquisition: false }, { completionDate: D("2020-01-01") }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });
});
