/**
 * UM — §155④⑤ 합가 특례 **불성립 사유 안내**(`judgment.unmetExceptions`).
 *
 * ## 계기 (2026-09-22 제보)
 *
 * 혼인합가일 2017-03-11 · 양도주택 취득일 2017-08-31 · 3주택 · 「먼저 양도」 선언 ON ·
 * 「일시적 2주택 특례 해당」 OFF로 판정했더니 **「과세」만 뜨고 사유가 없었다**.
 * `pending`은 기한 초과만, `undetermined`는 자료 부재만 담아 구조적 탈락은 어디에도 안 남았다.
 *
 * 실측(수정 전): `isExempt=false · pending=[] · undetermined=[]` — 화면에 단서 0건.
 *
 * ## 이 파일이 고정하는 것
 *
 * 1. 제보 사례가 **두 사유**를 낸다(합가 후 취득 · 3주택인데 일시적 2주택 미선언)
 * 2. 각 탈락 지점이 **제 사유**를 낸다(구별력 — 한 사유가 모든 경우를 덮지 않는다)
 * 3. **드리프트 가드** — 정본(`resolveMergeDeeming`/`resolveMergeOverlapDeeming`)이 성립시킨
 *    경우에는 사유가 **절대 나오지 않는다**. 둘이 어긋나면 「비과세인데 불성립 사유가 뜨는」 모순.
 * 4. 선언하지 않은 특례는 **말하지 않는다**(합가일 미입력 → 빈 배열)
 * 5. 기한 초과는 `pending`이 담당 — `unmetExceptions`에 **중복해서 넣지 않는다**
 */
import { describe, it, expect } from "vitest";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";

/** mock-rates의 `transfer:special:one_house_exemption`과 같은 값(seed parity는 그쪽이 지킨다). */
const RULES = {
  one_house_exemption: {
    minHoldingYears: 2,
    regulatedAreaMinResidenceYears: 2,
    prePolicyDate: "2017-08-03",
    prePolicyExemptResidence: true,
  },
  temporary_two_house: {
    disposalDeadlineYears: 3,
    regulatedAreaDeadlineYears: 2,
    regulatedAreaRelaxDate: "2022-05-10",
    regulatedAreaRelaxDeadlineYears: 3,
  },
} as unknown as OneHouseSpecialRulesData;

const house = (id: string, acq: string) => ({
  id,
  acquisitionDate: new Date(acq),
  officialPrice: 300_000_000,
  region: "capital" as const,
  regionCode: "11680",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/** 제보 화면 그대로 — 3주택 · 혼인합가 2017-03-11 · 양도주택 2017-08-31 취득 · 일시적2주택 OFF */
const reported = (extra: Partial<OneHouseJudgeInput> = {}): OneHouseJudgeInput =>
  ({
    propertyType: "housing",
    isOneHousehold: true,
    acquisitionDate: new Date("2017-08-31"),
    transferDate: new Date("2026-09-30"),
    transferPrice: 1_200_000_000,
    householdHousingCount: 3,
    houses: [
      house("selling", "2017-08-31"),
      house("h2", "2024-05-30"),
      house("h3", "2016-08-21"),
    ],
    sellingHouseId: "selling",
    marriageMerge: { marriageDate: new Date("2017-03-11") },
    isFirstTransferredInMerge: true,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 102,
    ...extra,
  }) as unknown as OneHouseJudgeInput;

/** 제보 사례에서 「합가 후 취득」만 고친 성립 케이스 — 드리프트 가드의 대조군 */
const TEMP_TWO = {
  previousAcquisitionDate: new Date("2016-01-01"),
  newAcquisitionDate: new Date("2024-05-30"),
};
const eligible = (extra: Partial<OneHouseJudgeInput> = {}): OneHouseJudgeInput =>
  reported({
    acquisitionDate: new Date("2016-01-01"),
    houses: [
      house("selling", "2016-01-01"),
      house("h2", "2024-05-30"),
      house("h3", "2016-08-21"),
    ],
    temporaryTwoHouse: TEMP_TWO,
    ...extra,
  } as Partial<OneHouseJudgeInput>);

const judge = (input: OneHouseJudgeInput) => judgeOneHouseExemptionFromInput(input, RULES);
const reasonsOf = (input: OneHouseJudgeInput) =>
  judge(input).unmetExceptions.flatMap((u) => u.reasons);

describe("UM — §155④⑤ 합가 불성립 사유", () => {
  /**
   * ⚠️ 이 시료(`temporaryTwoHouse` 없는 3주택)는 2026-09-22 이후 **명부에서 신규주택을
   *    특정할 수 없는** 경우를 뜻한다(나중 취득 행이 0채이거나 2채 이상). 제보 당시처럼
   *    「토글을 안 켰다」로는 더 이상 도달하지 않는다 — §155①은 이제 자동 도출된다.
   */
  it("UM-1 신규주택 미특정 3주택 — 과세이면서 사유 2건을 낸다(종전에는 0건)", () => {
    const r = judge(reported());
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);

    expect(r.unmetExceptions).toHaveLength(1);
    const [unmet] = r.unmetExceptions;
    expect(unmet.id).toBe("155-5-marriage-merge");
    expect(unmet.label).toBe("혼인 합가");
    expect(unmet.legalBasis).toBe("소득세법 시행령 §155⑤");

    // ① 합가 후 취득 — 날짜를 **둘 다** 문장에 담아야 사용자가 대조할 수 있다
    expect(unmet.reasons.some((x) => x.includes("2017-03-11") && x.includes("2017-08-31"))).toBe(
      true,
    );
    // ② 3주택인데 일시적 2주택 미선언
    expect(unmet.reasons.some((x) => x.includes("3채") && x.includes("일시적 2주택"))).toBe(true);
    expect(unmet.reasons).toHaveLength(2);
  });

  it("UM-2 「먼저 양도」 미선언 — 그 사유를 낸다", () => {
    const rs = reasonsOf(reported({ isFirstTransferredInMerge: false }));
    expect(rs.some((x) => x.includes("먼저 양도"))).toBe(true);
  });

  it("UM-3 양도일이 합가일보다 빠름 — 그 사유를 낸다", () => {
    const rs = reasonsOf(
      reported({
        marriageMerge: { marriageDate: new Date("2027-01-01") },
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs.some((x) => x.includes("빠릅니다"))).toBe(true);
  });

  it("UM-4 4주택 — 「2주택(중첩 시 3주택)까지」 사유를 낸다", () => {
    const rs = reasonsOf(
      reported({
        householdHousingCount: 4,
        houses: [
          house("selling", "2016-01-01"),
          house("h2", "2024-05-30"),
          house("h3", "2016-08-21"),
          house("h4", "2015-01-01"),
        ],
        acquisitionDate: new Date("2016-01-01"),
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs.some((x) => x.includes("4채"))).toBe(true);
  });

  it("UM-5 3주택 + 일시적2주택 ON이지만 기간 미충족 — 중첩 기간 사유를 낸다", () => {
    // 신규주택 취득(2024-05-30)일부터 3년을 넘겨 양도 → timing.overall 실패
    const rs = reasonsOf(
      eligible({
        transferDate: new Date("2028-01-01"),
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs.some((x) => x.includes("기간 요건"))).toBe(true);
  });

  it("UM-6 §154① 보유·거주만 미충족 — 다른 사유가 없을 때 그것을 낸다", () => {
    /**
     * 취득 당시 조정대상지역 + 거주 0개월 → 거주 2년 미충족. 합가 창·주택 수는 전부 통과.
     *
     * ⚠️ 취득일을 **`prePolicyDate`(2017-08-03) 이후**로 둔다. 그 전 취득은
     *    `prePolicyExemptResidence`로 거주요건이 **면제**되어 비과세가 나고, 그러면 이 anchor가
     *    겨냥한 축(§154① 미충족)을 아예 관측하지 못한다(처음 2016-01-01로 썼다가 실측으로 정정).
     */
    const rs = reasonsOf(
      eligible({
        marriageMerge: { marriageDate: new Date("2020-01-01") },
        acquisitionDate: new Date("2018-01-01"),
        houses: [
          house("selling", "2018-01-01"),
          house("h2", "2024-05-30"),
          house("h3", "2016-08-21"),
        ],
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2018-01-01"),
          newAcquisitionDate: new Date("2024-05-30"),
        },
        wasRegulatedAtAcquisition: true,
        residencePeriodMonths: 0,
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("§154");
  });

  it("UM-7 🔴 드리프트 가드 — 정본이 성립시킨 경우 사유는 0건", () => {
    const r = judge(eligible());
    expect(r.isExempt).toBe(true);
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UM-8 선언하지 않은 특례는 말하지 않는다 — 합가일 미입력이면 빈 배열", () => {
    const r = judge(
      reported({
        marriageMerge: undefined,
        parentalCareMerge: undefined,
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.isExempt).toBe(false);
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UM-9 기한 초과는 pending이 담당 — unmet에 중복해 넣지 않는다", () => {
    // 혼인 2013-01-01 → 10년 기한 2023-01-01 초과. 그 외 요건은 전부 충족.
    const input = eligible({
      marriageMerge: { marriageDate: new Date("2013-01-01") },
      acquisitionDate: new Date("2012-01-01"),
      houses: [
        house("selling", "2012-01-01"),
        house("h2", "2024-05-30"),
        house("h3", "2011-08-21"),
      ],
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2012-01-01"),
        newAcquisitionDate: new Date("2024-05-30"),
      },
    } as Partial<OneHouseJudgeInput>);
    const r = judge(input);

    expect(r.isExempt).toBe(false);
    // 기한 축은 pending이 날짜와 함께 낸다
    expect(r.pending.some((p) => p.id === "155-5-marriage-merge")).toBe(true);
    // 같은 사실을 unmet이 되풀이하지 않는다
    expect(r.unmetExceptions.flatMap((u) => u.reasons).some((x) => x.includes("10년"))).toBe(false);
  });

  it("UM-10 동거봉양 합가도 같은 구조로 사유를 낸다", () => {
    const r = judge(
      reported({
        marriageMerge: undefined,
        parentalCareMerge: { mergeDate: new Date("2017-03-11") },
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.unmetExceptions).toHaveLength(1);
    expect(r.unmetExceptions[0].id).toBe("155-4-parental-care-merge");
    expect(r.unmetExceptions[0].label).toBe("동거봉양 합가");
    expect(r.unmetExceptions[0].legalBasis).toBe("소득세법 시행령 §155④");
    expect(r.unmetExceptions[0].reasons.some((x) => x.includes("합친 날"))).toBe(true);
  });

  /**
   * UM-12 — §154① 사유는 **다른 사유가 없을 때만** 낸다.
   *
   * 합가 창에서 이미 탈락했는데 「보유·거주도 모자란다」를 덧붙이면, 사용자는 그것까지 고쳐야
   * 하는 줄 읽는다. 실제로는 창 조건을 고치는 순간 §154①은 볼 필요도 없다.
   * (뮤테이션 M5 — `reasons.length === 0` 전제를 지우면 이 단언이 깨진다.)
   */
  it("UM-12 창 탈락 사유가 있으면 §154① 사유를 덧붙이지 않는다", () => {
    const rs = reasonsOf(
      reported({
        wasRegulatedAtAcquisition: true,
        residencePeriodMonths: 0,
      } as Partial<OneHouseJudgeInput>),
    );
    // 합가 후 취득 · 3주택 미선언 — 딱 둘
    expect(rs).toHaveLength(2);
    expect(rs.some((x) => x.includes("§154"))).toBe(false);
  });

  /**
   * UM-13 🔴 — §89② 배제로 과세인 경우 **사유를 내지 않는다**.
   *
   * 본체 판정(`coreWouldPass`)은 통과했고 다른 조문이 결론을 뒤집은 것이다. 그때 「합가가
   * 적용되지 않았다」고 말하면 **거짓**이다 — 합가는 볼 필요조차 없었다.
   * (뮤테이션 M3 — `settled || coreWouldPass`를 `settled`로 좁히면 이 단언이 깨진다.)
   */
  it("UM-13 §89② 배제로 과세 — 본체가 통과했으므로 사유 0건", () => {
    const input = reported({
      // 1주택 + 분양권 → §89②이 §89①3호를 끈다. 합가는 「먼저 양도」 미선언이라 불성립 상태.
      householdHousingCount: 1,
      houses: [house("selling", "2016-01-01")],
      acquisitionDate: new Date("2016-01-01"),
      transferPrice: 800_000_000,
      isFirstTransferredInMerge: false,
      /**
       * §89②의 합가 축(§156의2⑧⑨)을 **판정 보류로 남기지 않기 위해** 선언한다.
       * 미선언이면 `resolveMergedHouseholdVerdict`가 `not_declared`로 조문을 열어
       * 배제가 `undetermined`가 되고(실측), 이 anchor가 겨냥한 `excluded` 경로에 닿지 못한다.
       * `isFirstTransferredInMerge: false`라 그 축은 곧바로 `unmet`으로 닫힌다.
       */
      mergedHouseholdFirstHouse: "own_before_merge",
      /**
       * §156의3③(3년 초과 예외)도 **선언해 닫는다**. 미선언이면 그 축이 열려 배제가
       * `undetermined`로 남는다(실측 openArticles: §156의3③ · 소칙 §75①).
       * 이사·거주를 충족하지 않는 선언이므로 예외는 불성립 → 배제 확정.
       */
      rightThreeYearException: {
        kind: "new_house",
        completionDate: new Date("2025-01-01"),
        movedInWithin3Years: false,
        residedOneYearOrMore: false,
      },
      presaleRights: [
        {
          id: "pr1",
          type: "presale_right",
          acquisitionDate: new Date("2023-05-01"),
          region: "capital",
        },
      ],
    } as unknown as Partial<OneHouseJudgeInput>);

    const r = judgeOneHouseExemptionFromInput(input, RULES, new Date("2021-01-01"));
    expect(r.article89Clause2?.status).toBe("excluded");
    expect(r.isExempt).toBe(false);
    expect(r.unmetExceptions).toEqual([]);
  });

  /**
   * UM-14 🔴 — 입주권 양도에는 사유를 내지 않는다.
   *
   * §155④⑤는 주택 양도 특례다. 입주권은 §89①4호가 판정하고 route가 `applyOneRightVerdict`로
   * 비과세를 **켜는데**, 그 함수는 `...judgment` spread라 사유가 그대로 실려 나간다
   * ⇒ 막지 않으면 「비과세인데 합가 요건 미충족」이 함께 뜬다.
   */
  it("UM-14 주택이 아닌 자산(입주권) 양도 — 사유 0건", () => {
    const r = judge(
      reported({ propertyType: "redevelopment_right" } as unknown as Partial<OneHouseJudgeInput>),
    );
    expect(r.isExempt).toBe(false);
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UM-15 1세대가 아니면 사유 0건 — 합가 특례를 물을 축이 아니다", () => {
    const r = judge(reported({ isOneHousehold: false } as Partial<OneHouseJudgeInput>));
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UM-11 비과세로 결론난 단순 1주택 — 사유를 내지 않는다", () => {
    const r = judge(
      reported({
        householdHousingCount: 1,
        houses: [house("selling", "2016-01-01")],
        acquisitionDate: new Date("2016-01-01"),
        transferPrice: 800_000_000,
        marriageMerge: undefined,
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.isExempt).toBe(true);
    expect(r.unmetExceptions).toEqual([]);
  });
});
