/**
 * anchor — 용도변경 주택의 거주요건 경과규정 기준일 (1세대1주택 리뷰 결정 #35 · S02-1)
 *
 * 대통령령 제28293호 부칙 제2조 ②1호 「2017년 8월 2일 이전에 취득한 주택」의 「취득한 날」을, 비주택을 주거용으로 바꾼
 * 주택에서는 **주거용 사용 개시일**로 읽는다(조정대상지역 판정과 같은 날). 종전에는 한 판정 안에서 조정 판정은 주거용 사용일,
 * 경과규정은 원취득일을 써 「취득 당시 조정대상지역 해당」과 「도입 전 취득이라 거주요건 없음」이 함께 나왔다.
 *
 * 사례: 오피스텔 2015-06-01 취득 → 2021-06-01 주거용 전환(김포 4157010100, 지정 기간) → 거주 0 → 2025-06-01 양도.
 *   전: 거주요건 면제(pre_policy) → 비과세 / 후: 거주 2년 미충족 → 과세 + 확인 필요 고지.
 * 보유기간 기산일은 바꾸지 않는다 — 2024-02-29 전 양도분은 원취득일부터(명문 없는 불리 적용 금지).
 * 모든 부정형 단언에 긍정 짝을 둔다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { describeOneHouseHoldingRequirement, describeOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes/transfer";
import { USAGE_CONVERSION_TRANSITION_UNVERIFIED_ID } from "@/lib/tax-engine/one-house/era-undetermined";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const RULES = rates.get("transfer:special:one_house_exemption")!.specialRules as unknown as OneHouseSpecialRulesData;
const d = (s: string) => new Date(s);
const GIMPO = "4157010100"; // 김포 동지역 — 2020-12 지정 → 2022 하반기 해제

function conv(over: Partial<TransferTaxInput> = {}, useStart = "2021-06-01"): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 1_000_000_000,
    acquisitionPrice: 600_000_000,
    acquisitionDate: d("2015-06-01"),
    transferDate: d("2025-06-01"),
    residencePeriodMonths: 0,
    regionCode: GIMPO,
    nonHousingToHousingConversion: { residentialUseStartDate: d(useStart), residenceMonthsTrimmed: 0 },
    ...over,
  } as Partial<TransferTaxInput>);
}
const judge = (i: TransferTaxInput) => judgeOneHouseExemptionFromInput(i as OneHouseJudgeInput, RULES);
const notice = (i: TransferTaxInput) => judge(i).undetermined.find((u) => u.id === USAGE_CONVERSION_TRANSITION_UNVERIFIED_ID);

describe("#35 용도변경 주택 경과규정 기준일 = 주거용 사용일", () => {
  it("[S35-1] ★ 2015 비주택 취득 · 2021 지정 중 전환 · 거주 0 → 거주요건 미충족(unmet) · 과세", () => {
    const i = conv();
    const res = describeOneHouseResidenceRequirement(i, ONE_HOUSE_RESIDENCE);
    expect(res.basis).toBe("unmet");
    expect(res.wasRegulated).toBe(true);
    const r = calculateTransferTax(i, rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("[S35-2] 긍정 짝 — 같은 사실에 거주 24개월이면 충족 · 비과세 · 고지 없음", () => {
    const i = conv({ residencePeriodMonths: 24 });
    expect(describeOneHouseResidenceRequirement(i, ONE_HOUSE_RESIDENCE).basis).toBe("met");
    expect(calculateTransferTax(i, rates).isExempt).toBe(true);
    expect(notice(i)).toBeUndefined();
  });

  it("[S35-3] 긍정 짝 — 용도변경 토글이 없으면 취득일(2015, 김포 비조정) 기준이라 거주요건이 없고 비과세", () => {
    const i = conv({ nonHousingToHousingConversion: undefined });
    expect(describeOneHouseResidenceRequirement(i, ONE_HOUSE_RESIDENCE).basis).toBe("not_regulated");
    expect(calculateTransferTax(i, rates).isExempt).toBe(true);
  });

  it("[S35-4] 긍정 짝 — 주거용 사용일이 2017-08-03 전이면 경과규정 그대로(비과세)", () => {
    const i = conv({}, "2017-08-02");
    expect(calculateTransferTax(i, rates).isExempt).toBe(true);
    expect(notice(i)).toBeUndefined();
  });

  it("[S35-5] 대조 — 원취득일도 2019-06-01(2017.8.3. 이후)이면 종전에도 과세 · 경과규정 고지는 없다", () => {
    const i = conv({ acquisitionDate: d("2019-06-01") });
    expect(calculateTransferTax(i, rates).isExempt).toBe(false);
    expect(notice(i)).toBeUndefined();
  });

  it("[S35-6] 보유기간 기산일은 바꾸지 않는다 — 2024-02-29 전 양도분은 원취득일부터", () => {
    const i = conv({ transferDate: d("2022-12-01") });
    const holding = describeOneHouseHoldingRequirement(i, RULES.one_house_exemption);
    expect(holding.startDate.toISOString().slice(0, 10)).toBe("2015-06-01");
    expect(holding.met).toBe(true);
  });

  it("[S35-7] 이월과세 경로(residenceTransitionAcquisitionDate)는 건드리지 않는다 — 증여 등기일이 우선(#33 대기)", () => {
    const i = conv({ residenceTransitionAcquisitionDate: d("2016-01-01") });
    expect(describeOneHouseResidenceRequirement(i, ONE_HOUSE_RESIDENCE).basis).toBe("pre_policy");
  });

  it("[S35-8] 2017-09-19 전 양도분(부칙상 종전 규정)에는 이 독법을 걸지 않는다", () => {
    const i = conv({ transferDate: d("2017-09-01") }, "2017-08-10");
    expect(describeOneHouseResidenceRequirement(i, ONE_HOUSE_RESIDENCE).basis).not.toBe("unmet");
  });
});

describe("#35 확인 필요 고지 — 거주요건 때문에 막힌 경우에만", () => {
  it("[S35-9] ★ 막힌 단건 — 고지가 뜨고 부칙 ②1호·②2호·5098·0221을 밝힌다 / 계산기 경고에도 같은 문장", () => {
    const i = conv();
    const n = notice(i);
    expect(n).toBeDefined();
    expect(n!.reason).toContain("대통령령 제28293호 부칙 제2조 ②1호");
    expect(n!.reason).toContain("주거용 사용 개시일(2021-06-01)");
    expect(n!.reason).toContain("대통령령 제28293호 부칙 제2조 ②2호");
    expect(n!.reason).toContain("서면-2020-부동산-5098");
    expect(n!.reason).toContain("서면-2020-부동산-0221");
    expect(n!.reason).toContain("확인 필요");
    expect((calculateTransferTax(i, rates).warnings ?? []).join("\n")).toContain(n!.reason);
  });

  it("[S35-10] 긍정 짝 — 거주요건이 결론을 가르지 않는 3주택 세대는 고지하지 않는다", () => {
    const i = conv({ householdHousingCount: 3 });
    expect(notice(i)).toBeUndefined();
  });

  it("[S35-11] 일시적 2주택 종전주택도 같은 술어 — 거주 0이면 의제 비과세가 막히고 고지, 24개월이면 비과세·고지 없음", () => {
    const tt = { previousAcquisitionDate: d("2015-06-01"), newAcquisitionDate: d("2024-06-01") };
    const blocked = conv({ householdHousingCount: 2, temporaryTwoHouse: tt });
    expect(calculateTransferTax(blocked, rates).isExempt).toBe(false);
    expect(notice(blocked)).toBeDefined();
    const ok = conv({ householdHousingCount: 2, temporaryTwoHouse: tt, residencePeriodMonths: 24 });
    expect(calculateTransferTax(ok, rates).isExempt).toBe(true);
    expect(notice(ok)).toBeUndefined();
  });
});
