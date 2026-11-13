/**
 * @vitest-environment jsdom
 *
 * anchor — §155① 일시적 2주택 리뷰(2026-11-12) Low 묶음 C: 화면·판정 카드가 ④와 같은 사실을 말한다.
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | C-3 | 계산기 「넘겨받은 사실」 카드 — §155①2호 행(조정 여부·계약일·전입일)은 ④가 `temporaryTwoHouse`를 보낼 때만 |
 * | C-4 | 권리 유래 신규 주택이면 카드의 계약일 행 = ④ `newHouseContractDate`(행의 권리 취득일) |
 * | C-5 | 판정 메뉴 §155① 카드 — ④가 단서 사유를 버리는 맥락(mode null)에서는 1년 요건을 면제하지 않는다 |
 * | C-6 | 계산기 ⑧ — 넘겨받은 계약일이 명부의 신규 주택 취득일보다 늦으면 막는다(사용자 결정 2026-11-13 「오류로 막기」) |
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ImportedOneHouseFactsCard } from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";
import { judgmentProvisoMode } from "@/lib/calc/one-house-judgment-section-scope";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TemporaryTwoHouseDates } from "@/lib/calc/household-house-count";
import { newForm, hrow } from "./_one-house-pr3a-calc-route";

afterEach(cleanup);

type Specials = NonNullable<Parameters<typeof ImportedOneHouseFactsCard>[0]["specials"]>;
const specials = {
  prevHouseRegulatedAtNewAcquisition: "yes",
  newHouseRegulatedAtAcquisition: "yes",
  newHouseContractDate: "2017-01-01",
  newHouseMoveInDate: "2018-01-01",
} as unknown as Specials;
const cardText = () => screen.queryByTestId("imported-one-house-facts")?.textContent ?? "";

describe("C-3 넘겨받은 사실 카드 — §155①2호 행은 ④가 보낼 때만", () => {
  it("§155①이 도출되지 않으면(④가 temporaryTwoHouse를 만들지 않음) 조정 여부·계약일·전입일 행을 그리지 않는다", () => {
    render(<ImportedOneHouseFactsCard facts={undefined} specials={specials} temporaryTwoHouse={undefined} />);
    const t = cardText();
    expect(t).not.toContain("신규 주택 매매계약·계약금 지급일");
    expect(t).not.toContain("세대전원 전입일");
    expect(t).not.toContain("신규 주택 취득 당시 종전 주택");
  });
  it("짝: 도출되면 그린다", () => {
    const tt: TemporaryTwoHouseDates = { previousAcquisitionDate: "2015-01-01", newAcquisitionDate: "2017-03-01", source: "roster" };
    render(<ImportedOneHouseFactsCard facts={undefined} specials={specials} temporaryTwoHouse={tt} />);
    const t = cardText();
    expect(t).toContain("신규 주택 매매계약·계약금 지급일2017-01-01");
    expect(t).toContain("세대전원 전입일 (§155①2호 가목)2018-01-01");
    expect(t).toContain("신규 주택 취득 당시 종전 주택");
  });
});

describe("C-4 권리 유래 신규 주택 — 카드 계약일 = ④", () => {
  it("분양권 유래(권리 취득일 2016-05-01) · 폼 계약일 2017-01-01 → 카드는 권리 취득일을 보여 준다", () => {
    const tt: TemporaryTwoHouseDates = {
      previousAcquisitionDate: "2015-01-01",
      newAcquisitionDate: "2019-03-01",
      source: "roster",
      newHouseOrigin: { kind: "presale", rightAcquisitionDate: "2016-05-01" },
    };
    render(<ImportedOneHouseFactsCard facts={undefined} specials={specials} temporaryTwoHouse={tt} />);
    const t = cardText();
    expect(t).toContain("신규 주택을 취득할 수 있는 권리의 취득일2016-05-01");
    expect(t).not.toContain("2017-01-01");
  });
});

describe("C-5 판정 메뉴 §155① 카드 — ④와 같은 유효 단서 사유", () => {
  const house = (id: string, d: string) => ({ id, acquisitionOrigin: "general", region: "non_capital", acquisitionDate: d, officialPrice: "100000000" });
  // 종전 2015-01-01 → 신규 2015-06-01(1년 미만) · 1호 임대주택 거주 5년 단서
  const form = (houses: unknown[]) =>
    ({
      ...createInitialOneHouseJudgmentForm(),
      isOneHousehold: true,
      transferDate: "2017-01-01",
      contractTotalPrice: "500000000",
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01" }],
      houses,
      provisoReason: "rental_5yr_residence",
      provisoRentalLeaseResidenceMonths: "60",
    }) as unknown as OneHouseJudgmentFormData;

  it("3주택(단서 카드 맥락 없음 — ④가 사유를 버림) → 카드도 1년 요건을 면제하지 않는다", () => {
    const f = form([house("n", "2015-06-01"), house("o", "2010-01-01")]);
    expect(judgmentProvisoMode(f)).toBeNull();
    expect((buildOneHouseExemptionApiBody(f) as Record<string, unknown>).oneHouseExemptionProviso).toBeUndefined();
    const v = judgmentTempTwoHouseVerdict(f) as { status: string; oneYearWaived: boolean };
    expect(v.oneYearWaived).toBe(false);
    expect(v.status).toBe("ineligible");
  });
  it("짝: 2주택(④가 사유를 싣는 맥락) → 면제", () => {
    const f = form([house("n", "2015-06-01")]);
    expect(judgmentProvisoMode(f)).toBe("temporary_two_house");
    const v = judgmentTempTwoHouseVerdict(f) as { status: string; oneYearWaived: boolean };
    expect(v.oneYearWaived).toBe(true);
    expect(v.status).toBe("eligible");
  });
});

describe("C-6 계산기 ⑧ — 넘겨받은 계약일 > 명부 신규 주택 취득일", () => {
  const calc = (contract: string) => {
    const f = newForm();
    f.isOneHousehold = true;
    Object.assign(f.assets[0], {
      assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: "300,000,000", addressJibun: "테스트 주소 1",
      residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
    });
    return Object.assign(f, {
      transferDate: "2019-06-01", contractTotalPrice: "800,000,000", residencePeriodMonths: "0",
      householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: false, householdHousingCount: "2",
      houses: [hrow({ id: "n", acquisitionDate: "2018-03-01", officialPrice: "300000000" })],
      newHouseContractDate: contract,
    });
  };
  const contractIssue = (f: ReturnType<typeof calc>) =>
    collectStep1Issues(f).filter((i) => i.message.includes("매매계약 체결·계약금 지급일은 신규 주택 취득일보다 늦을 수 없습니다"));

  it("계약일 2018-04-01 > 취득일 2018-03-01 → 신규 주택 행을 가리키며 막는다", () => {
    const issues = contractIssue(calc("2018-04-01"));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("판정 메뉴에서 계약일을 고쳐 다시 가져오세요");
  });
  it("짝: 계약일 2018-01-15 ≤ 취득일 → 막지 않는다", () => {
    expect(contractIssue(calc("2018-01-15"))).toEqual([]);
  });
});
