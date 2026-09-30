/**
 * anchor — L-7 · 「소득세법 시행령」 §155①2호 괄호 「조정대상지역의 공고가 있은 날 **이전에**」 (당일 포함)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9 L-7.
 *
 * | 근거 | 원문(taxlaw.nts.go.kr 실독 2026-09-30) |
 * |---|---|
 * | 영 §155①2호 괄호(MST 218373·242735 — MST 204914는 §155① 괄호) | 「조정대상지역의 공고가 있은 날 이전에 신규 주택(…)을 취득하거나 신규 주택을 취득하기 위해 매매계약을 체결하고 계약금을 지급한 사실이 증명서류에 의해 확인되는 경우는 제외한다」 |
 * | 서면-2021-법령해석재산-4728 [법령해석과-4509, 2021.12.20.] | 「…종전주택을 보유한 상태에서 신규주택의 매매계약 체결일(매각허가결정일)이 조정대상지역의 공고가 있는 날 이전인 경우「소득세법 시행령」제155조제1항에 따른 일시적 2주택 허용기간은 3년을 적용하는 것입니다」 |
 * | 서면-2021-부동산-3718 [부동산납세과-2395, 2022.8.25.] | 사실관계 「’20. 6.19. 청주지방법원 B주택 매각허가결정 / 조정대상지역 지정 공고(국토교통부공고 제2020-828호)」 · 질의 「신규주택을 취득 계약(매각허가결정일)한 날에 조정대상지역으로 공고된 경우 일시적2주택 처분기한」 → 회신 「기존 해석사례인 “서면-2021-법령해석재산-4728, 2021.12.20.”를 참고하시기 바랍니다」 |
 * | 서면-2021-부동산-0624 [부동산납세과-909, 2022.4.14.] (§154①5호 — 같은 문언의 취득 측) | 「무주택자가 조정대상지역의 공고가 있은 날에 매매계약을 체결하고 계약금을 지급한 경우 거주요건을 적용하지 아니하는 것임」 |
 *
 * 종전(base): `isRegulatedByBjdCode(계약일·취득일)`이 효력일 `designatedDate <= date`라 공고 **당일** 계약·취득을
 * 조정 취득으로 잡았다 → 2018-10-23 ~ 2023-01-11 양도분에서 단축 기한(2년·1년)이 적용됐다.
 *
 * 조정대상지역 픽스처(`regulated-areas-data.ts`):
 *   충북 청주 상당구 동지역 4311110100 — 2020-06-19 ~ 2022-09-25 (공고일 표 2020-06-19 → 2020-06-19)
 *   인천 서구 2826010100 — 2020-06-19 ~ 2022-11-13
 *   서울 강남구 1168010100 — 2017-08-03 ~ (공고일 표 2017-08-03 → **2017-11-10**)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import {
  resolveRegulatedAtNewAcquisition,
  resolveTemporaryTwoHouseDeadline,
} from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { resolveTemporaryTwoHouseDeadlineEra } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const rules = parseRatesFromMap(mockRates).oneHouseSpecialRules;
const twoHouseRule = rules.temporary_two_house!;
const d = (s: string) => new Date(s);

const CJ = "4311110100";
const SEO_GU = "2826010100";
const GANGNAM = "1168010100";

type TT = NonNullable<TransferTaxInput["temporaryTwoHouse"]>;

function tt(
  prevAcq: string,
  newAcq: string,
  transfer: string,
  extra: Partial<TT>,
  over: Partial<TransferTaxInput>,
): TransferTaxInput {
  return baseTransferInput({
    householdHousingCount: 2,
    acquisitionDate: d(prevAcq),
    transferDate: d(transfer),
    residencePeriodMonths: 0,
    temporaryTwoHouse: { previousAcquisitionDate: d(prevAcq), newAcquisitionDate: d(newAcq), ...extra },
    ...over,
  });
}
const exempt = (i: TransferTaxInput) => calculateTransferTax(i, mockRates).isExempt;
const judgeExempt = (i: TransferTaxInput) =>
  checkExemption(i as OneHouseJudgeInput, rules, d("2026-09-30")).isExempt;
const years = (i: TransferTaxInput) => resolveTemporaryTwoHouseDeadline(i, twoHouseRule).years;

/** 서면-2021-부동산-3718 사실관계: A 청주 2019-02-21 취득 · B 청주 계약 `contract` · 잔금 2020-06-30 · A 양도 2022-12-01 */
const case3718 = (contract: string) =>
  tt("2019-02-21", "2020-06-30", "2022-12-01", { newHouseRegionCode: CJ, newHouseContractDate: d(contract) }, { regionCode: CJ });

describe("L-7 ① 서면-2021-부동산-3718 사실관계 — 계약(매각허가결정)일 = 공고일 2020-06-19", () => {
  it("★ 계약 = 공고일 → 조정 취득 아님(한쪽만 조정) → 본문 3년 → 비과세 (단건·판정 같은 결론)", () => {
    const i = case3718("2020-06-19");
    expect(resolveRegulatedAtNewAcquisition(i)).toMatchObject({ previous: true, next: false, determined: true });
    expect(years(i)).toBe(3);
    expect(exempt(i)).toBe(true);
    expect(judgeExempt(i)).toBe(true);
  });

  it("±1 — 계약 2020-06-18 비과세 / 06-19 비과세 / 06-20 과세(조정→조정 2년: 2022-06-30 도과)", () => {
    expect(exempt(case3718("2020-06-18"))).toBe(true);
    expect(exempt(case3718("2020-06-19"))).toBe(true);
    const after = case3718("2020-06-20");
    expect(resolveRegulatedAtNewAcquisition(after)).toMatchObject({ previous: true, next: true, bothRegulated: true });
    expect(years(after)).toBe(2);
    expect(exempt(after)).toBe(false);
    expect(judgeExempt(after)).toBe(false);
  });

  it("계약일 없음(잔금 2020-06-30만) → 조정 취득 → 2년 → 과세 — 계약일이 결론을 가른다", () => {
    const i = tt("2019-02-21", "2020-06-30", "2022-12-01", { newHouseRegionCode: CJ }, { regionCode: CJ });
    expect(exempt(i)).toBe(false);
  });
});

describe("L-7 ② 취득일 = 공고일 (같은 괄호의 「이전에 … 취득」 — 계약일 해석을 옮겨 읽음)", () => {
  const at = (newAcq: string, transfer: string) =>
    tt("2019-02-21", newAcq, transfer, { newHouseRegionCode: CJ }, { regionCode: CJ });

  it("2022 체제(2년) — 취득 2020-06-19 비과세 / 2020-06-20 과세 (양도 2022-12-01)", () => {
    expect(resolveRegulatedAtNewAcquisition(at("2020-06-19", "2022-12-01")).next).toBe(false);
    expect(exempt(at("2020-06-19", "2022-12-01"))).toBe(true);
    expect(exempt(at("2020-06-20", "2022-12-01"))).toBe(false);
  });

  it("2019-12-17 체제(1년) — 취득 2020-06-19 비과세 / 2020-06-20 과세 (양도 2021-08-01)", () => {
    expect(exempt(at("2020-06-19", "2021-08-01"))).toBe(true);
    expect(exempt(at("2020-06-20", "2021-08-01"))).toBe(false);
  });

  it("다른 지역 같은 공고(인천 서구 2020-06-19) — 같은 결론", () => {
    const s = (n: string) => tt("2015-01-01", n, "2021-08-01", { newHouseRegionCode: SEO_GU }, { regionCode: GANGNAM });
    expect(exempt(s("2020-06-19"))).toBe(true);
    expect(exempt(s("2020-06-20"))).toBe(false);
  });

  it("종전 주택에는 괄호가 없다 — 종전 주택 코드가 공고일에 조정이면 그대로 조정(신규 주택만 제외)", () => {
    // 종전 청주(취득일 2020-06-19 기준 지정 당일) · 신규 강남(계속 조정) · 2년 체제
    const i = tt("2019-02-21", "2020-06-19", "2022-12-01", { newHouseRegionCode: GANGNAM }, { regionCode: CJ });
    expect(resolveRegulatedAtNewAcquisition(i)).toMatchObject({ previous: true, next: true });
    expect(exempt(i)).toBe(false);
  });
});

describe("L-7 ③ 2017-08-03 지정(공고일 2017-11-10) — 연혁 leaf가 먼저 3년을 돌려 표가 결론을 바꾸지 않는다", () => {
  const mk = (newAcq: string, contract: string | undefined, transfer: string) =>
    tt(
      "2015-01-01",
      newAcq,
      transfer,
      { newHouseRegionCode: GANGNAM, ...(contract ? { newHouseContractDate: d(contract) } : {}) },
      { regionCode: GANGNAM },
    );

  it("표는 적용된다 — 계약 2017-11-10(효력일 뒤 · 공고일 당일) → next false / 2017-11-11 → next true", () => {
    expect(resolveRegulatedAtNewAcquisition(mk("2018-10-01", "2017-11-10", "2019-06-01")).next).toBe(false);
    expect(resolveRegulatedAtNewAcquisition(mk("2018-10-01", "2017-11-11", "2019-06-01")).next).toBe(true);
  });

  it("그러나 공고일(2017-11-10) 이하의 계약·취득일은 모두 2018-09-13 이전 → 제29242호 부칙 제2조② 종전 3년이라 결론 동일", () => {
    for (const c of ["2017-08-03", "2017-10-01", "2017-11-10"]) {
      const era = (both: boolean) =>
        resolveTemporaryTwoHouseDeadlineEra({
          bothRegulated: both,
          baseDeadlineYears: 3,
          newAcquisitionDate: d("2018-10-01"),
          newContractDate: d(c),
          transferDate: d("2019-06-01"),
        }).years;
      expect(era(true)).toBe(era(false));
    }
    expect(years(mk("2018-10-01", "2017-11-10", "2021-06-01"))).toBe(3);
    // 취득일 자체가 2017-08-03 ~ 2017-11-10이어도 같다
    expect(years(mk("2017-10-01", undefined, "2019-06-01"))).toBe(3);
  });
});

describe("L-7 ④ 판정 메뉴 입력 카드(`judgeTempTwoHouseFromForm`) — 엔진과 같은 결론", () => {
  const card = (contract: string) =>
    judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2019-02-21",
      newHouseAcquisitionDate: "2020-06-30",
      transferDate: "2022-12-01",
      provisoReason: "",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "0",
      regionCode: CJ,
      newHouseRegionCode: CJ,
      eraFields: { newHouseContractDate: contract },
    });

  it("계약 2020-06-19 → eligible · 3년 · 신규 next false / 06-20 → ineligible · 2년", () => {
    const on = card("2020-06-19");
    expect(on).toMatchObject({ status: "eligible", deadlineYears: 3, regulated: { previous: true, next: false } });
    expect(card("2020-06-20")).toMatchObject({ status: "ineligible", deadlineYears: 2 });
  });
});
