/**
 * anchor — 입력 경로가 없는 연혁 분기의 **판정 보류 고지** (A2a 최소 안전 동작)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.1 · §3.4 · §3.5 · §3.6 · §7-2·3.
 * §7: 「2·3·5는 해당 분기만 경고로 두고 착수」 — 사실을 입력받을 경로가 없으므로 결론을
 * 바꾸지 않고 **「판정하지 않았다」를 숨기지 않는다**(판정 메뉴 `undetermined` + 계산기 경고).
 *
 * - OH-22 §154⑤ 단서(2021-01-01~2022-05-09 양도): 다주택 처분 후 최종 1주택 보유기간 재기산
 *   — 대통령령 제29523호 부칙 제1조3호·제2조② / 제32654호 부칙 제2조①②
 * - OH-38 삭제된 §154①4호(임대사업자 등록 주택 거주요건 면제)의 경과조치
 *   — 대통령령 제30395호 부칙 제38조①② (2019-12-16 이전 등록 신청)
 * - OH-01 §155①2호(신규 2019-12-17 이후 취득·양도 2020-02-11~2022-05-09): 1년 내 세대전원 전입
 *   요건·기존 임차인 단서 — 대통령령 제30395호 부칙 제15조 (A2b에서 입력 경로 신설)
 * - OH-59 §154⑤ 단서(용도변경 보유기간 기산) 시행일 2024-02-29 — 대통령령 제34265호 부칙 제1조
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const RULES = mockRates.get("transfer:special:one_house_exemption")!
  .specialRules as unknown as OneHouseSpecialRulesData;
const d = (s: string) => new Date(s);
const ids = (i: TransferTaxInput) =>
  judgeOneHouseExemptionFromInput(i as OneHouseJudgeInput, RULES).undetermined.map((u) => u.id);
const warn = (i: TransferTaxInput) => (calculateTransferTax(i, mockRates).warnings ?? []).join("\n");

describe("OH-22 §154⑤ 단서 — 최종 1주택 보유기간 재기산 (2021-01-01~2022-05-09 양도)", () => {
  // 조심 2025전0555 사실관계: 쟁점주택 2017-08-28 취득 · 양도 2021-11-10 · 양도 당시 1주택
  const one = (t: string) =>
    baseTransferInput({ acquisitionDate: d("2017-08-28"), transferDate: d(t), residencePeriodMonths: 30 });
  const ID = "154-5-final-one-house-restart-unverified";

  it("★ 조심 2025전0555형 — 비과세로 판정하되 재기산 미판정을 고지한다", () => {
    const i = one("2021-11-10");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(true);
    expect(ids(i)).toContain(ID);
    expect(warn(i)).toContain("1주택 외의 주택을 모두 처분");
  });
  it("경계: 2020-12-31 고지 없음 / 2021-01-01 고지", () => {
    expect(ids(one("2020-12-31"))).not.toContain(ID);
    expect(ids(one("2021-01-01"))).toContain(ID);
  });
  it("경계: 2022-05-09 고지 / 2022-05-10 고지 없음(단서 삭제)", () => {
    expect(ids(one("2022-05-09"))).toContain(ID);
    expect(ids(one("2022-05-10"))).not.toContain(ID);
  });
  it("과세(보유 2년 미달)면 재기산은 결론을 바꾸지 못한다 — 고지 없음", () => {
    const i = baseTransferInput({ acquisitionDate: d("2020-06-01"), transferDate: d("2021-11-10") });
    expect(ids(i)).not.toContain(ID);
  });
});

describe("OH-38 삭제된 §154①4호 경과조치 — 2019-12-16 이전 임대사업자 등록 신청", () => {
  // 서울(조정) 다세대 1주택 2018-03-01 취득 · 거주 0 · 2026-07-01 양도
  const reg = (acq: string, over: Partial<TransferTaxInput> = {}) =>
    baseTransferInput({
      acquisitionDate: d(acq),
      transferDate: d("2026-07-01"),
      residencePeriodMonths: 0,
      wasRegulatedAtAcquisition: true,
      isRegulatedArea: true,
      ...over,
    });
  const ID = "154-1-4ho-rental-registration-unverified";

  it("★ 리뷰 시나리오 — 거주 2년 미충족 과세 + 4호 경과조치 미판정 고지", () => {
    const i = reg("2018-03-01");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(false);
    expect(ids(i)).toContain(ID);
    expect(warn(i)).toContain("2019년 12월 16일 이전");
  });
  it("취득 2019-12-16 고지 / 2019-12-17 고지 없음", () => {
    expect(ids(reg("2019-12-16"))).toContain(ID);
    expect(ids(reg("2019-12-17"))).not.toContain(ID);
  });
  it("취득 당시 비조정(거주요건 없음)이면 고지 없음", () => {
    expect(ids(reg("2018-03-01", { wasRegulatedAtAcquisition: false, isRegulatedArea: false }))).not.toContain(ID);
  });
});

describe("OH-01 §155①2호 2019-12-17 체제 — 전입요건·임차인 단서 미판정 고지", () => {
  const tt = (newAcq: string, t: string) =>
    baseTransferInput({
      householdHousingCount: 2,
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      acquisitionDate: d("2015-01-01"),
      transferDate: d(t),
      residencePeriodMonths: 0,
      temporaryTwoHouse: { previousAcquisitionDate: d("2015-01-01"), newAcquisitionDate: d(newAcq) },
    });
  const ID = "155-1-move-in-requirement-unverified";

  it("신규 2020-06-01 · 양도 2021-03-01(1년 이내) → 비과세 + 전입요건 미판정 고지", () => {
    const i = tt("2020-06-01", "2021-03-01");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(true);
    expect(ids(i)).toContain(ID);
    expect(warn(i)).toContain("세대전원");
  });
  it("신규 2019-12-16(종전 2년 체제)이면 고지 없음", () => {
    expect(ids(tt("2019-12-16", "2021-03-01"))).not.toContain(ID);
  });
  it("양도 2022-05-10(2년 체제)이면 고지 없음", () => {
    expect(ids(tt("2020-06-01", "2022-05-10"))).not.toContain(ID);
  });
});

describe("OH-59 §154⑤ 단서 시행일 — 2024-02-29 (대통령령 제34265호 부칙 제1조)", () => {
  // 비주택 2015-01-01 취득 → 2023-06-01부터 주거용 → 1주택 · 비조정 · 8억
  const conv = (t: string) =>
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionDate: d("2015-01-01"),
      transferDate: d(t),
      residencePeriodMonths: 6,
      nonHousingToHousingConversion: { residentialUseStartDate: d("2023-06-01"), residenceMonthsTrimmed: 0 },
    });
  it("★ 2024-02-29 양도 → 주거용 사용일 기산(약 9개월) → 과세", () => {
    expect(calculateTransferTax(conv("2024-02-29"), mockRates).isExempt).toBe(false);
  });
  it("2024-02-28 양도 → 종전 규정(취득일 기산) → 비과세", () => {
    expect(calculateTransferTax(conv("2024-02-28"), mockRates).isExempt).toBe(true);
  });
});
