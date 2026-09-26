/**
 * P4-1 앵커 — 판정 결과 확장: `pending[]` · `undetermined[]` · `appliedExceptions[]` · `legalBasis[]`
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` G-3 ·
 * 엔진 설계 「6. pending[] 생성」 · `lib/tax-engine/one-house/pending.ts`.
 *
 * ## 🔴 이 파일이 지키는 계약 — 「틀린 약속을 하지 않는다」
 *
 * `pending`은 「이 날짜까지 ~하면 비과세」다. **기한이 남은 그 요건 하나만 미충족일 때만** 참이다.
 * 보유 2년도 못 채운 세대에게 「기한 내 양도하면 비과세」라고 하면 거짓말이므로, 각 축마다
 * **부정 짝(다른 요건도 미충족 → pending 없음)** 을 함께 둔다
 * (`feedback_negative_anchor_needs_positive_twin`의 역방향 — 여기서는 긍정 단언에 부정 짝을 붙인다).
 *
 * ## 🔑 날짜는 **정확값**으로 고정한다
 *
 * 「기한이 있다」만 보면 기산일을 잘못 잡아도 통과한다. 지정값 단언은 범위가 아니라
 * ±1일 동등성으로(`feedback_range_assertion_misses_spec_violation`) — 여기서는 ISO 문자열 일치.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** §88 10호 분양권 정의 시행일 — 조합원입주권 축만 쓰는 테스트에도 실제 경로와 같게 넘긴다. */
const PRESALE_START = D("2021-01-01");

const judge = (over: Partial<TransferTaxInput>) =>
  checkExemption(baseTransferInput(over) as OneHouseJudgeInput, rules, PRESALE_START);

const pendingIds = (over: Partial<TransferTaxInput>) => judge(over).pending.map((p) => p.id);
const undeterminedIds = (over: Partial<TransferTaxInput>) => judge(over).undetermined.map((u) => u.id);

/** 취득 당시 조정지역 + 거주 0 — §154① 거주요건이 **실제로 걸리는** 시료. */
const RESIDENCE_BINDS = { wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 } as const;
/** 거주요건이 걸리지 않는 시료(취득 당시 비조정) — 보유요건만 남긴다. */
const RESIDENCE_FREE = { wasRegulatedAtAcquisition: false, residencePeriodMonths: 0 } as const;

describe("P4-1 pending — §155① 일시적 2주택 처분기한", () => {
  /**
   * 종전 2019-06-01 취득 · 신규 **2020-07-01** 취득 · 비조정 ⇒ 기한 2023-07-01.
   * 양도 2024-06-01 = 도과.
   *
   * ⚠️ 신규취득일은 **종전 취득 + 1년 이후**여야 한다(§155① 요건 A). 2020-01-01로 두면
   *    요건 A가 먼저 깨져 「처분기한만 미충족」이라는 이 블록의 전제가 성립하지 않는다
   *    (초안이 실제로 그랬고 PD-1이 RED였다).
   */
  const OVER_DEADLINE: Partial<TransferTaxInput> = {
    householdHousingCount: 2,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2019-06-01"),
      newAcquisitionDate: D("2020-07-01"),
    } as TransferTaxInput["temporaryTwoHouse"],
    ...RESIDENCE_FREE,
  };

  it("[PD-1] 처분기한만 미충족이면 그 기한을 낸다 — 날짜는 신규취득일 + 3년", () => {
    const r = judge(OVER_DEADLINE);
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).toEqual(["155-1-disposal-deadline"]);
    expect(iso(r.pending[0].deadline)).toBe("2023-07-01");
  });

  it("[PD-2] 긍정 짝 — 기한 내면 비과세이고 pending은 비어 있다", () => {
    const r = judge({
      ...OVER_DEADLINE,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2019-06-01"),
        newAcquisitionDate: D("2023-01-01"),
      } as TransferTaxInput["temporaryTwoHouse"],
    });
    expect(r.isExempt).toBe(true);
    expect(r.pending).toEqual([]);
  });

  it("[PD-3] 🔴 틀린 약속 방지 — §154① 거주요건도 미충족이면 기한을 내지 않는다", () => {
    /**
     * 「기한 도과 + **보유** 2년 미달 + 요건 A 충족」은 이 양도일에서 **구성 자체가 불가능**하다:
     * 기한 도과 ⇒ 신규취득 ≤ 2021-06-01, 요건 A ⇒ 종전취득 ≤ 2020-06-01 ⇒ 보유 4년 이상.
     * ⇒ 두 번째 미충족 요건은 **거주**로 잡는다(취득 당시 조정지역 + 거주 0).
     */
    expect(pendingIds({ ...OVER_DEADLINE, ...RESIDENCE_BINDS })).toEqual([]);
  });

  it("[PD-4] 🔴 요건 A(1년)는 치유할 수 없으므로 pending 대상이 아니다", () => {
    // 신규주택을 종전 취득 6개월 뒤에 샀다 ⇒ 요건 A 미충족. 기한(요건 B)은 충족.
    expect(
      pendingIds({
        ...OVER_DEADLINE,
        temporaryTwoHouse: {
          previousAcquisitionDate: D("2019-06-01"),
          newAcquisitionDate: D("2019-12-01"),
        } as TransferTaxInput["temporaryTwoHouse"],
        transferDate: D("2022-01-01"),
      }),
    ).toEqual([]);
  });
});

describe("P4-1 pending — §155④⑤ 합가 10년", () => {
  it("[PD-5] 혼인 합가 10년 초과 — 기한은 혼인일 + 10년", () => {
    const r = judge({
      householdHousingCount: 2,
      marriageMerge: { marriageDate: D("2010-01-01") },
      isFirstTransferredInMerge: true,
      ...RESIDENCE_FREE,
    });
    expect(r.pending.map((p) => p.id)).toEqual(["155-5-marriage-merge"]);
    expect(iso(r.pending[0].deadline)).toBe("2020-01-01");
  });

  it("[PD-6] 긍정 짝 — 10년 내면 비과세 · pending 없음", () => {
    const r = judge({
      householdHousingCount: 2,
      marriageMerge: { marriageDate: D("2020-01-01") },
      isFirstTransferredInMerge: true,
      ...RESIDENCE_FREE,
    });
    expect(r.isExempt).toBe(true);
    expect(r.pending).toEqual([]);
  });

  it("[PD-7] 동거봉양 합가도 같은 축 — 기한은 합친 날 + 10년", () => {
    const r = judge({
      householdHousingCount: 2,
      parentalCareMerge: { mergeDate: D("2012-03-15") },
      isFirstTransferredInMerge: true,
      ...RESIDENCE_FREE,
    });
    expect(r.pending.map((p) => p.id)).toEqual(["155-4-parental-care-merge"]);
    expect(iso(r.pending[0].deadline)).toBe("2022-03-15");
  });

  it("[PD-8] 「먼저 양도하는 주택」 선언이 없으면 기한 안내를 하지 않는다", () => {
    expect(
      pendingIds({
        householdHousingCount: 2,
        marriageMerge: { marriageDate: D("2010-01-01") },
        isFirstTransferredInMerge: false,
        ...RESIDENCE_FREE,
      }),
    ).toEqual([]);
  });
});

describe("P4-1 pending — §155⑦3호 귀농 · §155⑧ 부득이", () => {
  const RURAL = (acq: string) =>
    ({
      kind: "return_to_farm",
      isOutsideCapitalEupMyeon: true,
      acquisitionDate: D(acq),
      isHighPriceAtAcquisition: false,
      landAreaSqm: 300,
      wholeHouseholdMoved: true,
    }) as TransferTaxInput["ruralHouse"];

  it("[PD-9] 귀농주택 5년 초과 — 기한은 귀농주택 취득일 + 5년", () => {
    const r = judge({ householdHousingCount: 2, ruralHouse: RURAL("2015-01-01"), ...RESIDENCE_FREE });
    expect(r.pending.map((p) => p.id)).toEqual(["155-7-3ho-return-to-farm"]);
    expect(iso(r.pending[0].deadline)).toBe("2020-01-01");
  });

  it("[PD-10] 긍정 짝 — 5년 내면 비과세 · pending 없음", () => {
    const r = judge({ householdHousingCount: 2, ruralHouse: RURAL("2022-01-01"), ...RESIDENCE_FREE });
    expect(r.isExempt).toBe(true);
    expect(r.pending).toEqual([]);
  });

  it("[PD-11] §155⑧ 해소일 3년 초과 — 기한은 해소일 + 3년", () => {
    const r = judge({
      householdHousingCount: 2,
      unavoidableOutsideCapitalHouse: {
        reason: "work",
        resolvedDate: D("2018-01-01"),
      } as TransferTaxInput["unavoidableOutsideCapitalHouse"],
      ...RESIDENCE_FREE,
    });
    expect(r.pending.map((p) => p.id)).toEqual(["155-8-unavoidable-resolved"]);
    expect(iso(r.pending[0].deadline)).toBe("2021-01-01");
  });

  it("[PD-12] 🔴 §155⑧ 해소일 미입력 — 기한을 지어내지 않고 **판정 보류**로 남긴다", () => {
    const over: Partial<TransferTaxInput> = {
      householdHousingCount: 2,
      unavoidableOutsideCapitalHouse: {
        reason: "work",
      } as TransferTaxInput["unavoidableOutsideCapitalHouse"],
      ...RESIDENCE_FREE,
    };
    expect(pendingIds(over)).toEqual([]);
    expect(undeterminedIds(over)).toContain("155-8-resolved-date-missing");
  });
});

describe("P4-1 pending — §154① 보유 2년", () => {
  it("[PD-13] 보유만 미달(거주요건은 비구속) — 기한은 취득일 + 2년의 전날(§95④ 초일 산입)", () => {
    const r = judge({ acquisitionDate: D("2023-06-01"), ...RESIDENCE_FREE });
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).toEqual(["154-1-holding-years"]);
    // §95④ 초일 산입 — 2년은 응당일(2025-06-01)의 전날 만료(holding-period-first-day-inclusion.anchor)
    expect(iso(r.pending[0].deadline)).toBe("2025-05-31");
    // 🔑 과세이지만 **거주는 충족**이다 ⇒ 거주 판정보류 행이 서면 안 된다.
    //    이 단언이 없으면 「거주 미충족」 조건을 지워도 아무 테스트가 울지 않는다(뮤테이션 M9).
    expect(r.undetermined).toEqual([]);
  });

  it("[PD-14] 긍정 짝 — 보유 2년을 채우면 비과세 · pending 없음", () => {
    const r = judge({ acquisitionDate: D("2019-06-01"), ...RESIDENCE_FREE });
    expect(r.isExempt).toBe(true);
    expect(r.pending).toEqual([]);
  });

  it("[PD-14b] 윤일 취득 — 2년 만료는 §160③ 월말(2022-02-28): 기한 안내와 비과세 판정이 같은 날에 맞물린다", () => {
    const acq = { acquisitionDate: D("2020-02-29"), ...RESIDENCE_FREE };
    const before = judge({ ...acq, transferDate: D("2022-01-15") });
    expect(before.pending.map((p) => p.id)).toEqual(["154-1-holding-years"]);
    expect(iso(before.pending[0].deadline)).toBe("2022-02-28");
    // 짝: 안내된 기한 당일 양도는 비과세, 그 전날은 과세
    expect(judge({ ...acq, transferDate: D("2022-02-28") }).isExempt).toBe(true);
    expect(judge({ ...acq, transferDate: D("2022-02-27") }).isExempt).toBe(false);
  });

  it("[PD-15] 🔴 거주요건도 미달이면 보유 기한을 내지 않는다 — 대신 판정 보류", () => {
    const over: Partial<TransferTaxInput> = { acquisitionDate: D("2023-06-01"), ...RESIDENCE_BINDS };
    expect(pendingIds(over)).toEqual([]);
    expect(undeterminedIds(over)).toContain("154-1-residence-deadline-unavailable");
  });

  it("[PD-16] 거주요건이 충족되면 판정 보류 행도 서지 않는다", () => {
    expect(
      undeterminedIds({ acquisitionDate: D("2019-06-01"), wasRegulatedAtAcquisition: true, residencePeriodMonths: 30 }),
    ).not.toContain("154-1-residence-deadline-unavailable");
  });
});

describe("P4-1 pending — §89② 권리 3년", () => {
  const RIGHT = (acq: string) =>
    [{ id: "r1", type: "redevelopment_right" as const, acquisitionDate: D(acq) }] as TransferTaxInput["presaleRights"];

  /**
   * 종전주택 2019-06-01 취득 → 권리 **2020-07-01** 취득(1년 경과 ✓) ⇒ 기한 2023-07-01.
   * 양도 2024-06-01 도과. 권리를 2020-01-01로 두면 §156의2③의 **1년 요건**이 먼저 깨져
   * 기한 축에 도달하지 못한다(초안이 그랬다).
   */
  const OVER: Partial<TransferTaxInput> = {
    presaleRights: RIGHT("2020-07-01"),
    rightThreeYearException: { kind: "none" },
    ...RESIDENCE_FREE,
  };

  it("[PD-17] 3년 초과로 배제됐고 나머지는 충족 — 기한은 권리 취득일 + 3년", () => {
    const r = judge(OVER);
    expect(r.article89Clause2?.status).toBe("excluded");
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).toEqual(["156-2-3-right-three-year"]);
    expect(iso(r.pending[0].deadline)).toBe("2023-07-01");
  });

  it("[PD-18] 🔴 §89②만 아니었다면 어차피 과세인 경우(보유 미달) — 기한을 내지 않는다", () => {
    // 취득일을 늦추면 §156의2③의 1년 요건이 먼저 깨져 축이 달라진다 ⇒ 거주요건으로 막는다.
    expect(pendingIds({ ...OVER, ...RESIDENCE_BINDS })).toEqual([]);
  });

  it("[PD-19] 3년 이내면 예외 충족 — 배제되지 않고 pending도 없다", () => {
    const r = judge({ ...OVER, presaleRights: RIGHT("2022-06-01"), rightThreeYearException: undefined });
    expect(r.article89Clause2?.status).toBe("exception_met");
    expect(r.pending).toEqual([]);
  });

  it("[PD-20] 판정 불가(예외 미선언)는 `undetermined`로 나오고 조문을 그대로 담는다", () => {
    const r = judge({ presaleRights: RIGHT("2020-07-01"), ...RESIDENCE_FREE });
    expect(r.article89Clause2?.status).toBe("undetermined");
    expect(r.undetermined.some((u) => u.id.startsWith("89-2-open:"))).toBe(true);
  });
});

describe("P4-1 appliedExceptions · legalBasis", () => {
  it("[PD-21] 일시적 2주택 비과세 — 적용 특례가 구조화돼 나온다", () => {
    const r = judge({
      householdHousingCount: 2,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2019-06-01"),
        newAcquisitionDate: D("2023-01-01"),
      } as TransferTaxInput["temporaryTwoHouse"],
      ...RESIDENCE_FREE,
    });
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions.map((e) => e.id)).toEqual(["155-1-temporary-two-house"]);
    expect(r.legalBasis).toEqual(["소득세법 시행령 §155"]);
  });

  it("[PD-22] §155⑱ 처분지연 사유가 붙으면 행이 하나 더 선다", () => {
    const r = judge({
      householdHousingCount: 2,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2019-06-01"),
        newAcquisitionDate: D("2020-07-01"),
        disposalDelayReason: "kamco",
      } as TransferTaxInput["temporaryTwoHouse"],
      ...RESIDENCE_FREE,
    });
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions.map((e) => e.id)).toEqual([
      "155-1-temporary-two-house",
      "155-18-disposal-delay:kamco",
    ]);
  });

  it("[PD-23] 본칙 1주택 비과세는 특례 행을 만들지 않는다 — 배지가 이미 말한다", () => {
    const r = judge({ acquisitionDate: D("2019-06-01"), ...RESIDENCE_FREE });
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions).toEqual([]);
    expect(r.legalBasis).toEqual([]);
  });

  it("[PD-24] §155의3 상생임대 — 거주요건 면제가 특례 행으로 드러난다", () => {
    const r = judge({
      acquisitionDate: D("2019-06-01"),
      ...RESIDENCE_BINDS,
      winWinRentalHouse: {
        winWinContractDate: D("2022-03-01"),
        increaseRatePct: 5,
        priorLeaseMonths: 18,
        winWinLeaseMonths: 24,
      },
    });
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions.map((e) => e.id)).toEqual(["155-3-1-win-win-rental"]);
    expect(r.legalBasis).toEqual(["소득세법 시행령 §155의3 ①"]);
  });

  it("[PD-25] 합가 중첩이면 두 조문이 **각각** 행으로 선다", () => {
    const r = judge({
      householdHousingCount: 3,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2019-06-01"),
        newAcquisitionDate: D("2023-01-01"),
      } as TransferTaxInput["temporaryTwoHouse"],
      marriageMerge: { marriageDate: D("2022-01-01") },
      isFirstTransferredInMerge: true,
      ...RESIDENCE_FREE,
    });
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions.map((e) => e.id)).toEqual([
      "155-1-temporary-two-house",
      "155-5-marriage-merge",
    ]);
    expect(r.legalBasis).toEqual(["소득세법 시행령 §155", "소득세법 시행령 §155⑤"]);
  });
});

describe("P4-1 — 기한으로 치유되지 않는 축", () => {
  it("[PD-26] 미등기(§91①)는 pending도 undetermined도 만들지 않는다", () => {
    /**
     * 🔑 시료는 **가드가 없으면 실제로 pending이 서는** 조건이어야 한다 —
     *    보유 1년(2023-06-01 취득) + 거주요건 비구속. 거주 미충족 시료로 두면
     *    미등기 가드를 지워도 pending이 비어 있어 구별력이 0이다(뮤테이션 M14).
     */
    const r = judge({ isUnregistered: true, acquisitionDate: D("2023-06-01"), ...RESIDENCE_FREE });
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]);
    expect(r.undetermined).toEqual([]);
  });

  /**
   * 🔴 **실측으로 드러난 결함의 회귀**(P4-1 뮤테이션 M13).
   *
   * 초안은 `pending.ts`가 판정 본체의 선행 게이트를 복제하지 않아, 1세대 비해당 **선언**에도
   * 토지에도 「§155① 종전주택 처분기한」이 떴다. 시료는 **가드가 없으면 실제로 pending이 서는**
   * 조합(일시적 2주택 + 요건 A 충족 + 기한 도과 + 거주 비구속)이어야 한다.
   */
  const TEMP_TWO_HOUSE_OVER_DEADLINE: Partial<TransferTaxInput> = {
    householdHousingCount: 2,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2019-06-01"),
      newAcquisitionDate: D("2020-07-01"),
    } as TransferTaxInput["temporaryTwoHouse"],
    ...RESIDENCE_FREE,
  };

  it("[PD-27] 1세대 비해당 선언은 판정 대상 자체가 아니다 — 기한 안내도 없다", () => {
    const r = judge({ ...TEMP_TWO_HOUSE_OVER_DEADLINE, isOneHousehold: false });
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]);
    expect(r.undetermined).toEqual([]);
  });

  it("[PD-27b] 주택이 아니면(토지) §155① 기한 안내를 하지 않는다", () => {
    const r = judge({ ...TEMP_TWO_HOUSE_OVER_DEADLINE, propertyType: "land" });
    expect(r.isExempt).toBe(false);
    expect(r.pending).toEqual([]);
  });

  it("[PD-27c] 부수토지 카드는 짝 주택의 판정을 따를 뿐 자체 기한이 없다", () => {
    const r = judge({
      ...TEMP_TWO_HOUSE_OVER_DEADLINE,
      oneHouseUnitRole: "appurtenant_land",
      appurtenantHouseVerdict: {
        isExempt: false,
        isPartialExempt: false,
        houseAcquisitionDate: D("2019-06-01"),
      } as TransferTaxInput["appurtenantHouseVerdict"],
    });
    expect(r.pending).toEqual([]);
  });

  it("[PD-28b] 🔴 대체주택 특례는 보유 2년 없이 비과세된다 — 그래도 pending은 비어 있어야 한다", () => {
    /**
     * §156의2⑤는 §154① 보유·거주 요건을 **면제**하고 비과세를 준다. 그래서 「보유 2년 미달」이
     * 참인 채로 비과세가 난다 — `settled` 단락이 없으면 비과세 결과에 「2025-06-01까지 보유하라」는
     * pending이 함께 붙는다(뮤테이션 M12가 노린 자리).
     */
    const r = judge({
      acquisitionDate: D("2023-06-01"),
      ...RESIDENCE_FREE,
      replacementHouse: {
        businessApprovalDate: D("2023-01-01"),
        replacementResidenceMonths: 12,
        completionDate: D("2024-01-01"),
        willResideNewHouse: true,
      } as TransferTaxInput["replacementHouse"],
    });
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions.map((e) => e.id)).toEqual(["156-2-5-replacement-house"]);
    expect(r.pending).toEqual([]);
  });

  it("[PD-28] 비과세·부분과세면 pending은 항상 비어 있다 — 고가주택도 마찬가지", () => {
    const r = judge({ transferPrice: 2_000_000_000, acquisitionDate: D("2019-06-01"), ...RESIDENCE_FREE });
    expect(r.isPartialExempt).toBe(true);
    expect(r.pending).toEqual([]);
  });
});
