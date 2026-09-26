/**
 * anchor — OH-01 A2b · 「소득세법 시행령」 §155①2호 (조정대상지역 일시적 2주택) 새 입력 축
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.1 · §6.1 Q-3 / 리뷰 OH-01(병합: 조정 판정 대상·시점).
 * 본문·부칙은 법제처 DRF 실독(2026-09-26):
 *
 * | 축 | 원문 | 근거 |
 * |---|---|---|
 * | 판정 대상·시점 | 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」 | §155① 괄호(MST 204914)·2호(MST 218373·242735) |
 * | 공고 전 계약 제외 | 「조정대상지역의 공고가 있은 날 이전에 … 매매계약을 체결하고 계약금을 지급한 사실이 … 확인되는 경우는 제외」 | 같은 괄호 |
 * | 계약일 경과조치 | 「2018년 9월 13일(2019년 12월 16일) 이전에 … 매매계약을 체결하고 계약금을 지급한 사실이 증빙서류에 의하여 확인되는 경우」 → 종전의 규정 | 대통령령 제29242호 부칙 제2조②2호 · 제30395호 부칙 제15조②2호 |
 * | 가목 전입 | 「신규 주택의 취득일로부터 1년 이내에 그 주택으로 세대전원이 이사 … 전입신고를 마친 경우」 | MST 218373 §155①2호 가목 |
 * | 단서 임차인 | 「… 임대차기간이 끝나는 날이 신규 주택의 취득일부터 1년 후인 경우에는 다음 각 목의 기간을 전 소유자와 임차인간의 임대차계약 종료일까지로 하되, 신규 주택의 취득일부터 최대 2년을 한도」 | 같은 호 단서 |
 *
 * 조정대상지역 픽스처(`regulated-areas-data.ts` 실측 2026-09-26):
 *   부산 해운대구 2635010100 — 2017-08-03~2019-11-07 · 2020-11-20~2022-09-25 지정
 *   인천 서구     2826010100 — 2020-06-19~2022-11-13 지정
 *   서울 강남구   1168010100 — 2017-08-03~ 지정
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { resolveTemporaryTwoHouseDeadlineEra } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import { resolveRegulatedAtNewAcquisition } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const rules = parseRatesFromMap(mockRates).oneHouseSpecialRules;
const d = (s: string) => new Date(s);
const iso = (x: Date | undefined) => x?.toISOString().slice(0, 10);

const HAEUNDAE = "2635010100";
const SEO_GU = "2826010100";
const GANGNAM = "1168010100";

type TT = NonNullable<TransferTaxInput["temporaryTwoHouse"]>;

/** 종전 2015-01-01 취득(당시 미지정 — 거주요건 없음) · 5억 · 2주택. 조정 여부는 케이스가 정한다. */
function tt(
  newAcq: string,
  transfer: string,
  extra: Partial<TT> = {},
  over: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    householdHousingCount: 2,
    acquisitionDate: d("2015-01-01"),
    transferDate: d(transfer),
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: d("2015-01-01"),
      newAcquisitionDate: d(newAcq),
      ...extra,
    },
    ...over,
  });
}
/** 두 주택 모두 조정대상지역이라고 선언(코드 없음) */
const bothDeclared: Partial<TT> = {
  previousHouseRegulatedAtNewAcquisition: true,
  newHouseRegulatedAtAcquisition: true,
};
const exempt = (i: TransferTaxInput) => calculateTransferTax(i, mockRates).isExempt;
const judge = (i: TransferTaxInput) => checkExemption(i as OneHouseJudgeInput, rules, d("2026-09-26"));
const undeterminedIds = (i: TransferTaxInput) => judge(i).undetermined.map((u) => u.id);

describe("A2b-L leaf — 계약일 경과조치 · 가목 전입 · 단서 임차인 (±1일)", () => {
  const era = (p: Partial<Parameters<typeof resolveTemporaryTwoHouseDeadlineEra>[0]> & { n: string; t: string }) =>
    resolveTemporaryTwoHouseDeadlineEra({
      bothRegulated: true,
      baseDeadlineYears: 3,
      newAcquisitionDate: d(p.n),
      transferDate: d(p.t),
      ...p,
    });

  it("L1 제29242호 부칙 제2조②2호 — 계약 2018-09-13 → 3년 / 2018-09-14 → 2년 (취득 2018-10-01)", () => {
    expect(era({ n: "2018-10-01", t: "2019-06-01", newContractDate: d("2018-09-13") }).years).toBe(3);
    expect(era({ n: "2018-10-01", t: "2019-06-01", newContractDate: d("2018-09-14") }).years).toBe(2);
    // 계약일 없음 — 취득일만으로 판정(종전 동작)
    expect(era({ n: "2018-10-01", t: "2019-06-01" }).years).toBe(2);
  });

  it("L2 제30395호 부칙 제15조②2호 — 계약 2019-12-16 → 2년 / 2019-12-17 → 1년 (취득 2020-01-10)", () => {
    expect(era({ n: "2020-01-10", t: "2020-06-01", newContractDate: d("2019-12-16") }).years).toBe(2);
    expect(era({ n: "2020-01-10", t: "2020-06-01", newContractDate: d("2019-12-17") }).years).toBe(1);
  });

  it("L3 가목 — 전입 2021-06-01(1년 기한 말일) 충족 / 2021-06-02 미충족 (취득 2020-06-01)", () => {
    const met = era({ n: "2020-06-01", t: "2021-03-01", moveInDate: d("2021-06-01") });
    expect(met).toEqual({ years: 1, moveInRequirementPending: false, moveInMet: true });
    expect(era({ n: "2020-06-01", t: "2021-03-01", moveInDate: d("2021-06-02") }).moveInMet).toBe(false);
    // 전입일 없음 → 미판정 고지(종전 A2a 동작 유지)
    expect(era({ n: "2020-06-01", t: "2021-03-01" })).toEqual({ years: 1, moveInRequirementPending: true });
  });

  it("L4 단서 — 종료일이 1년 기한 말일(2021-06-01)이면 연장 없음 / 2021-06-02면 그 날까지", () => {
    expect(era({ n: "2020-06-01", t: "2021-03-01", existingTenantLeaseEndDate: d("2021-06-01") }).deadlineDate).toBeUndefined();
    expect(iso(era({ n: "2020-06-01", t: "2021-03-01", existingTenantLeaseEndDate: d("2021-06-02") }).deadlineDate)).toBe(
      "2021-06-02",
    );
  });

  it("L5 단서 2년 한도 — 종료일 2022-06-01 그대로 / 2022-06-02는 2022-06-01로 잘린다", () => {
    expect(iso(era({ n: "2020-06-01", t: "2021-03-01", existingTenantLeaseEndDate: d("2022-06-01") }).deadlineDate)).toBe(
      "2022-06-01",
    );
    expect(iso(era({ n: "2020-06-01", t: "2021-03-01", existingTenantLeaseEndDate: d("2022-06-02") }).deadlineDate)).toBe(
      "2022-06-01",
    );
  });

  it("L6 단서는 가목 기한도 늘린다 — 종료 2021-12-31: 전입 2021-12-31 충족 / 2022-01-01 미충족", () => {
    const lease = { existingTenantLeaseEndDate: d("2021-12-31") };
    expect(era({ n: "2020-06-01", t: "2021-03-01", ...lease, moveInDate: d("2021-12-31") }).moveInMet).toBe(true);
    expect(era({ n: "2020-06-01", t: "2021-03-01", ...lease, moveInDate: d("2022-01-01") }).moveInMet).toBe(false);
  });

  it("L7 체제 밖(신규 2019-12-16 · 양도 2022-05-10)에서는 전입·임차인 입력이 기한을 바꾸지 않는다", () => {
    const extra = { moveInDate: d("2030-01-01"), existingTenantLeaseEndDate: d("2021-12-31") };
    expect(era({ n: "2019-12-16", t: "2021-06-01", ...extra })).toEqual({ years: 2, moveInRequirementPending: false });
    expect(era({ n: "2020-06-01", t: "2022-05-10", ...extra })).toEqual({ years: 2, moveInRequirementPending: false });
  });
});

describe("A2b-R 조정 판정 대상·시점 — 신규 취득일 기준 두 주택 모두", () => {
  it("R1 ★ 종전 해운대(신규 취득 2020-06-01 당시 해제) → 3년 비과세 / 양도일(재지정)만 보던 대리 지표는 1년 과세", () => {
    const i = tt("2020-06-01", "2021-08-01", { newHouseRegionCode: GANGNAM }, { regionCode: HAEUNDAE });
    expect(resolveRegulatedAtNewAcquisition(i)).toMatchObject({ previous: false, next: true, determined: true });
    expect(exempt(i)).toBe(true);
  });
  it("R1 긍정 짝 — 종전 강남(취득 당시 조정) → 조정→조정 1년 → 과세", () => {
    expect(exempt(tt("2020-06-01", "2021-08-01", { newHouseRegionCode: GANGNAM }, { regionCode: GANGNAM }))).toBe(false);
  });

  it("R2 신규 인천 서구 — 지정 전날 2020-06-18 취득 → 3년 비과세 / 2020-06-19 취득 → 1년 과세", () => {
    const at = (n: string) => tt(n, "2021-08-01", { newHouseRegionCode: SEO_GU }, { regionCode: GANGNAM });
    expect(exempt(at("2020-06-18"))).toBe(true);
    expect(exempt(at("2020-06-19"))).toBe(false);
  });

  it("R3 §155①2호 괄호 — 공고 전(2020-06-18) 계약·계약금 → 조정 취득 아님 → 비과세 / 2020-06-19 계약 → 과세", () => {
    const at = (c: string) =>
      tt("2020-07-15", "2021-08-01", { newHouseRegionCode: SEO_GU, newHouseContractDate: d(c) }, { regionCode: GANGNAM });
    expect(exempt(at("2020-06-18"))).toBe(true);
    expect(exempt(at("2020-06-19"))).toBe(false);
  });

  it("R4 ★ 역방향(과세 쪽 정정) — 종전 인천 서구가 양도일(2023-01-05)엔 해제됐어도 신규 취득(2020-12-01) 당시 조정이면 2년 → 과세", () => {
    const i = tt("2020-12-01", "2023-01-05", { newHouseRegionCode: GANGNAM }, { regionCode: SEO_GU });
    expect(resolveRegulatedAtNewAcquisition(i)).toMatchObject({ previous: true, next: true, determined: true });
    expect(exempt(i)).toBe(false);
  });
  it("R4 긍정 짝 — 같은 날짜, 신규 주택이 취득 당시 비조정(선언 false)이면 한쪽만 조정 → 3년 비과세", () => {
    expect(
      exempt(tt("2020-12-01", "2023-01-05", { newHouseRegulatedAtAcquisition: false }, { regionCode: SEO_GU })),
    ).toBe(true);
  });

  it("R5 코드 없음 — 선언이 판정한다: 신규 false → 3년 비과세 / 둘 다 true → 1년 과세", () => {
    const base = { isRegulatedArea: true };
    expect(
      exempt(tt("2020-06-01", "2021-08-01", { previousHouseRegulatedAtNewAcquisition: true, newHouseRegulatedAtAcquisition: false }, base)),
    ).toBe(true);
    expect(exempt(tt("2020-06-01", "2021-08-01", bothDeclared, base))).toBe(false);
  });

  it("R6 코드가 선언을 이긴다 — 신규 코드(강남=조정)가 있으면 선언 false는 무시", () => {
    const i = tt(
      "2020-06-01",
      "2021-08-01",
      { newHouseRegionCode: GANGNAM, newHouseRegulatedAtAcquisition: false },
      { regionCode: GANGNAM },
    );
    expect(exempt(i)).toBe(false);
  });

  it("R7 미입력 → 종전 대리 지표(양도일 기준 양도주택)로 계산 + 판정 보류 고지 / 입력하면 고지 없음", () => {
    const ID = "155-1-regulated-at-new-acquisition-unverified";
    const legacy = tt("2020-06-01", "2021-08-01", {}, { isRegulatedArea: true });
    expect(exempt(legacy)).toBe(false); // 저장 당시와 같은 결론(1년 도과)
    expect(undeterminedIds(legacy)).toContain(ID);
    expect(calculateTransferTax(legacy, mockRates).warnings?.some((w) => w.includes("신규주택 취득일 기준"))).toBe(true);
    expect(undeterminedIds(tt("2020-06-01", "2021-08-01", bothDeclared, { isRegulatedArea: true }))).not.toContain(ID);
  });
  it("R7 부정 짝 — 결론을 바꾸지 않는 양도 시기(2023-01-12 이후)면 미입력이어도 고지 없음", () => {
    expect(
      undeterminedIds(tt("2021-06-01", "2023-06-01", {}, { isRegulatedArea: true })),
    ).not.toContain("155-1-regulated-at-new-acquisition-unverified");
  });
});

describe("A2b-M 2019-12-17 체제 통합 — 가목 전입 · 단서 임차인 · 계약일", () => {
  it("M1 전입 2021-06-01 → 비과세 / 2021-06-02 → 과세 (신규 2020-06-01 · 양도 2021-03-01)", () => {
    expect(exempt(tt("2020-06-01", "2021-03-01", { ...bothDeclared, wholeHouseholdMoveInDate: d("2021-06-01") }))).toBe(true);
    expect(exempt(tt("2020-06-01", "2021-03-01", { ...bothDeclared, wholeHouseholdMoveInDate: d("2021-06-02") }))).toBe(false);
  });

  it("M2 전입일 미입력 → 비과세 유지 + 미판정 고지 / 입력하면 고지 없음", () => {
    const ID = "155-1-move-in-requirement-unverified";
    const none = tt("2020-06-01", "2021-03-01", bothDeclared);
    expect(exempt(none)).toBe(true);
    expect(undeterminedIds(none)).toContain(ID);
    expect(
      undeterminedIds(tt("2020-06-01", "2021-03-01", { ...bothDeclared, wholeHouseholdMoveInDate: d("2020-07-01") })),
    ).not.toContain(ID);
  });

  it("M3 단서 — 임대차 종료 2021-12-31: 양도 2021-12-31 비과세 / 2022-01-01 과세 / 단서 없으면 2021-12-31도 과세", () => {
    const lease = { ...bothDeclared, existingTenantLeaseEndDate: d("2021-12-31"), wholeHouseholdMoveInDate: d("2021-12-30") };
    expect(exempt(tt("2020-06-01", "2021-12-31", lease))).toBe(true);
    expect(exempt(tt("2020-06-01", "2022-01-01", lease))).toBe(false);
    expect(
      exempt(tt("2020-06-01", "2021-12-31", { ...bothDeclared, wholeHouseholdMoveInDate: d("2021-05-30") })),
    ).toBe(false);
  });

  it("M4 단서 2년 한도 — 종료 2022-07-01·양도 2022-05-09: 전입 2022-06-01 비과세 / 2022-06-02 과세", () => {
    const lease = { ...bothDeclared, existingTenantLeaseEndDate: d("2022-07-01") };
    expect(exempt(tt("2020-06-01", "2022-05-09", { ...lease, wholeHouseholdMoveInDate: d("2022-06-01") }))).toBe(true);
    expect(exempt(tt("2020-06-01", "2022-05-09", { ...lease, wholeHouseholdMoveInDate: d("2022-06-02") }))).toBe(false);
  });

  it("M5 계약일 경과조치 — 취득 2018-10-01 · 양도 2021-06-01: 계약 2018-09-13 비과세(3년) / 2018-09-14 과세(2년)", () => {
    const at = (c: string) => tt("2018-10-01", "2021-06-01", { ...bothDeclared, newHouseContractDate: d(c) });
    expect(exempt(at("2018-09-13"))).toBe(true);
    expect(exempt(at("2018-09-14"))).toBe(false);
  });

  it("M6 pending 기한 — 단서로 늘어난 기한(2021-12-31)을 안내 / 전입 미충족이면 기한을 약속하지 않는다", () => {
    const lease = { ...bothDeclared, existingTenantLeaseEndDate: d("2021-12-31") };
    const over = judge(tt("2020-06-01", "2022-01-15", { ...lease, wholeHouseholdMoveInDate: d("2021-07-01") }));
    expect(over.isExempt).toBe(false);
    expect(over.pending.map((p) => [p.id, iso(p.deadline)])).toContainEqual(["155-1-disposal-deadline", "2021-12-31"]);
    const moveInFailed = judge(tt("2020-06-01", "2022-01-15", { ...lease, wholeHouseholdMoveInDate: d("2022-01-02") }));
    expect(moveInFailed.pending.map((p) => p.id)).not.toContain("155-1-disposal-deadline");
  });
});
