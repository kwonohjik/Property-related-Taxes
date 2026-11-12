/**
 * anchor — §155⑯ 지역 요건의 판정 단위는 **시·군**이다(구가 아니다) — 2026-11-12 리뷰 E-1.
 *
 * 「소득세법 시행령」 §155⑯(MST 290841 실독): 「해당 공공기관 또는 법인이 이전한 시(특별자치시ㆍ광역시 및 … 행정시를
 * 포함한다. 이하 이 항에서 같다)ㆍ군 또는 이와 연접한 시ㆍ군의 지역」. 광역시는 전체가 한 「시」, 일반구는 소속 시다.
 *
 * 종전 구현은 구 단위 코드를 그대로 비교해 같은 광역시 안의 다른 구(대구 동구 → 달서구)가 「연접하지 않음」이 되고
 * 사용자 선언(true)을 뒤집어 5년 기한·1년 요건 면제를 함께 없앴다.
 */
import { describe, it, expect } from "vitest";
import { meetsPublicInstitutionRelocationRegion } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { judgeRelocationRegion } from "@/lib/calc/relocation-region-verdict";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const DAEGU_DONG = "2714000000";
const DAEGU_DALSEO = "2729000000";
const GORYEONG = "4783000000"; // 달서구와 경계(대구 단위의 연접 군)
const POHANG_BUK = "4711300000"; // 대구와 경계 없음
const CHANGWON_UICHANG = "4812100000";
const CHANGWON_JINHAE = "4812900000"; // 의창구와 구 단위로는 경계 없음 — 같은 창원시
// 전남광주통합특별시(2026.7.1.) — 나주시는 옛 광주 남구·광산구와 경계, 북구와는 경계 없음. 여수시와도 경계 없음.
const NAJU = "1217000000";
const GWANGJU_BUK = "1230000000";
const YEOSU = "1213000000";

const meets = (from: string, to: string) =>
  meetsPublicInstitutionRelocationRegion({
    previousAcquisitionDate: new Date("2019-01-01"),
    newAcquisitionDate: new Date("2019-06-01"),
    publicInstitutionRelocation: true,
    relocatedSigunguCode: from,
    newHouseSigunguCode: to,
  } as NonNullable<TransferTaxInput["temporaryTwoHouse"]>);

const screen = (from: string, to: string) =>
  judgeRelocationRegion({ publicInstitutionRelocation: true, relocatedSigunguCode: from, newHouseSigunguCode: to })?.ok;

describe("§155⑯ 판정 단위 — 광역시 전체·일반구의 소속 시 (E-1)", () => {
  it("같은 광역시 안의 다른 구(대구 동구 → 달서구) — 「이전한 시」 충족", () => {
    expect(meets(DAEGU_DONG, DAEGU_DALSEO)).toBe(true);
    expect(screen(DAEGU_DONG, DAEGU_DALSEO)).toBe(true);
  });

  it("광역시와 연접한 군(대구 동구 → 고령군) — 동구와 직접 경계가 없어도 대구 단위로 연접", () => {
    expect(meets(DAEGU_DONG, GORYEONG)).toBe(true);
    expect(screen(DAEGU_DONG, GORYEONG)).toBe(true);
  });

  it("같은 일반시의 다른 구(창원 의창구 → 진해구) — 「이전한 시」 충족", () => {
    expect(meets(CHANGWON_UICHANG, CHANGWON_JINHAE)).toBe(true);
    expect(screen(CHANGWON_UICHANG, CHANGWON_JINHAE)).toBe(true);
  });

  it("부정 짝: 연접하지 않는 시(대구 동구 → 포항시) — 미충족", () => {
    expect(meets(DAEGU_DONG, POHANG_BUK)).toBe(false);
    expect(screen(DAEGU_DONG, POHANG_BUK)).toBe(false);
  });
});

describe("§155⑯ × 전남광주통합특별시 — 옛 광주 5개 자치구를 한 시로 (사용자 결정 2026-11-12)", () => {
  it("나주 → 옛 광주 북구: 광주 단위가 나주와 연접 → 충족 (구 단위였으면 미충족)", () => {
    expect(meets(NAJU, GWANGJU_BUK)).toBe(true);
    expect(screen(NAJU, GWANGJU_BUK)).toBe(true);
  });

  it("나주 → 여수: 옛 전남 시·군은 각각 단위 — 연접 아님 → 미충족", () => {
    expect(meets(NAJU, YEOSU)).toBe(false);
    expect(screen(NAJU, YEOSU)).toBe(false);
  });

  const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
  /** 종전 2019-01-01 · 신규(옛 광주 북구) 2022-03-02 → 3년 지남 · 5년 안 — ⑯ 지역 요건이 결론을 가른다. */
  const judge = (transferDate: string, newHouseSigunguCode = GWANGJU_BUK) =>
    checkExemption(
      baseTransferInput({
        acquisitionDate: new Date("2019-01-01"),
        transferDate: new Date(transferDate),
        householdHousingCount: 2,
        wasRegulatedAtAcquisition: false,
        isRegulatedArea: false,
        residencePeriodMonths: 0,
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2019-01-01"),
          newAcquisitionDate: new Date("2022-03-02"),
          publicInstitutionRelocation: true,
          relocatedSigunguCode: NAJU,
          newHouseSigunguCode,
        },
      }) as OneHouseJudgeInput,
      rules,
      new Date("2021-01-01"),
    );
  const NOTICE = "155-16-merged-special-city-unit";

  it("2026.7.1. 이후 양도 · 읽기에 따라 결론이 갈림 → 비과세 + 확인 필요 고지", () => {
    const r = judge("2026-08-03");
    expect(r.isExempt).toBe(true);
    expect(r.undetermined.map((u) => u.id)).toContain(NOTICE);
  });

  it("2026.7.1. 전 양도 → 광역시 그대로라 고지 없음", () => {
    const r = judge("2026-06-01");
    expect(r.isExempt).toBe(true);
    expect(r.undetermined.map((u) => u.id)).not.toContain(NOTICE);
  });

  it("나주 → 여수(2026.7.1. 이후): 미충족이지만 통합특별시 전체로 읽으면 충족 → 과세 + 고지", () => {
    const r = judge("2026-08-03", YEOSU);
    expect(r.isExempt).toBe(false);
    expect(r.undetermined.map((u) => u.id)).toContain(NOTICE);
  });
});
