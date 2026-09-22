/**
 * UMX — §155②(상속주택) · §155⑥1호(문화유산) · §155⑦(농어촌주택) · §155⑧(수도권 밖 부득이한 사유)
 * **불성립 사유 안내**.
 *
 * ## 계기
 *
 * 합가 축(§155④⑤)만 `unmetExceptions`를 채우고 있었다(`merge-unmet-reasons.anchor.test.ts`).
 * 나머지 축은 선언해도 적용되지 않으면 화면에 **단서가 0건**이었다 — 「과세」만 뜬다.
 * §155②는 특히 심했다: 부적격 카운트를 `buildInheritedExclusionSteps`가 **계산기 산식 step**으로만
 * 냈고, 판정 화면이 읽는 `buildOneHouseCountBreakdown`은 **제외에 성공한 행만** 담는다
 * ⇒ 판정 메뉴에서는 상속주택이 조용히 빠지지 않은 채 과세만 나왔다.
 *
 * ## 이 파일이 고정하는 것
 *
 * 1. 각 탈락 지점이 **제 사유**를 낸다(구별력 — 한 사유가 모든 경우를 덮지 않는다)
 * 2. **드리프트 가드** — 정본이 성립시킨 경우 사유는 **절대 0건**
 *    (`qualifiesRuralHouse` · `qualifiesUnavoidableOutsideCapital` · `resolveInheritedHouseExclusionFromInput`)
 * 3. 선언하지 않은 특례는 **말하지 않는다**
 * 4. 기한 축(§155⑧ 3년 · §155⑦3호 5년)은 `pending`이 **날짜와 함께** 담당 —
 *    `unmetExceptions`에 **중복해서 넣지 않는다**
 * 5. §155⑧ **해소일 미입력은 사유가 아니다** — 정본이 기한을 기산하지 않고 통과시키는 자리이고,
 *    그 사실은 `collectUndetermined`가 판정 보류로 밝힌다
 */
import { describe, it, expect } from "vitest";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";

/** mock-rates의 `transfer:special:one_house_exemption`과 같은 값. */
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

const house = (id: string, acq: string, extra: Record<string, unknown> = {}) => ({
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
  ...extra,
});

/**
 * 2주택 · §154①(보유 2년) **충족** · 12억 이하 — 특례가 성립하면 곧바로 비과세가 되는 바닥.
 *
 * 🔑 취득 2016-01-01이라 `prePolicyDate`(2017-08-03) 이전이고 비조정지역이므로 거주요건이 면제된다.
 *    그래서 「§154① 미충족」 사유는 **일부러 만들지 않는 한** 끼어들지 않는다 — 축별 구별력이 흐려지지 않는다.
 */
const base = (extra: Partial<OneHouseJudgeInput> = {}): OneHouseJudgeInput =>
  ({
    propertyType: "housing",
    isOneHousehold: true,
    acquisitionDate: new Date("2016-01-01"),
    transferDate: new Date("2026-09-30"),
    transferPrice: 800_000_000,
    householdHousingCount: 2,
    houses: [house("selling", "2016-01-01"), house("h2", "2018-03-01")],
    sellingHouseId: "selling",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 0,
    ...extra,
  }) as unknown as OneHouseJudgeInput;

const judge = (input: OneHouseJudgeInput) => judgeOneHouseExemptionFromInput(input, RULES);
const unmetOf = (input: OneHouseJudgeInput) => judge(input).unmetExceptions;
const reasonsOf = (input: OneHouseJudgeInput) => unmetOf(input).flatMap((u) => u.reasons);

// ──────────────────────────────────────────────────────────────────────────
// §155⑧ 수도권 밖 부득이한 사유 주택
// ──────────────────────────────────────────────────────────────────────────
describe("UMX §155⑧ — 수도권 밖 부득이한 사유 주택", () => {
  const declared = { unavoidableOutsideCapitalHouse: { reason: "work" as const } };

  it("UMX-1 🔴 드리프트 가드 — 정본이 성립시키면 사유 0건", () => {
    const r = judge(base(declared as Partial<OneHouseJudgeInput>));
    expect(r.isExempt).toBe(true); // 해소일 미입력 = 기한 미기산 → 정본 통과
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UMX-2 3주택 — 「각각 1개씩(2주택)」 요건 미충족을 사유로 낸다", () => {
    const input = base({
      ...declared,
      householdHousingCount: 3,
      houses: [house("selling", "2016-01-01"), house("h2", "2018-03-01"), house("h3", "2019-03-01")],
    } as Partial<OneHouseJudgeInput>);
    const r = judge(input);
    expect(r.isExempt).toBe(false);

    expect(r.unmetExceptions).toHaveLength(1);
    const [u] = r.unmetExceptions;
    expect(u.id).toBe("155-8-unavoidable:work");
    expect(u.label).toContain("수도권 밖 부득이한 사유 주택");
    expect(u.legalBasis).toContain("155");
    expect(u.reasons).toHaveLength(1);
    expect(u.reasons[0]).toContain("3채");
    expect(u.reasons[0]).toContain("각각 1개씩");
  });

  it("UMX-3 §154① 보유 2년 미달 — 주택 수는 맞는데 §154①만 걸린 경우", () => {
    const rs = reasonsOf(
      base({
        ...declared,
        acquisitionDate: new Date("2025-06-01"), // 보유 1년 4개월
        houses: [house("selling", "2025-06-01"), house("h2", "2018-03-01")],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("§154");
    expect(rs[0]).toContain("보유 2년");
  });

  it("UMX-4 3년 기한 초과는 pending이 담당 — unmet에 중복해 넣지 않는다", () => {
    // 해소 2020-01-01 → 기한 2023-01-01. 양도 2026-09-30은 초과. §154①·주택수는 충족.
    const input = base({
      ...declared,
      unavoidableOutsideCapitalHouse: { reason: "work" as const, resolvedDate: new Date("2020-01-01") },
    } as unknown as Partial<OneHouseJudgeInput>);
    const r = judge(input);
    expect(r.isExempt).toBe(false); // 기한 초과로 정본 탈락

    expect(r.pending.map((p) => p.id)).toContain("155-8-unavoidable-resolved");
    expect(r.unmetExceptions).toEqual([]); // 같은 사실을 두 카드가 말하지 않는다
  });

  it("UMX-5 해소일 미입력은 사유가 아니다 — 판정 보류로만 밝힌다", () => {
    // 3주택으로 만들어 카드는 뜨게 하되, 「해소일」을 사유로 들먹이지 않는지 본다.
    const r = judge(
      base({
        ...declared,
        householdHousingCount: 3,
        houses: [house("selling", "2016-01-01"), house("h2", "2018-03-01"), house("h3", "2019-03-01")],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.unmetExceptions.flatMap((u) => u.reasons).some((x) => x.includes("해소"))).toBe(false);
    expect(r.undetermined.map((u) => u.id)).toContain("155-8-resolved-date-missing");
  });

  it("UMX-6 선언하지 않으면 말하지 않는다", () => {
    const r = judge(base({ householdHousingCount: 3 } as Partial<OneHouseJudgeInput>));
    expect(r.isExempt).toBe(false);
    expect(r.unmetExceptions).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// §155⑥1호 문화유산 주택
// ──────────────────────────────────────────────────────────────────────────
describe("UMX §155⑥1호 — 문화유산 주택", () => {
  const declared = { culturalHeritageHouse: true } as Partial<OneHouseJudgeInput>;

  it("UMX-30 🔴 드리프트 가드 — 2주택 + §154① 충족이면 비과세이고 사유 0건", () => {
    const r = judge(base(declared));
    expect(r.isExempt).toBe(true);
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UMX-31 3주택 — 「각각 1개씩(2주택)」 요건 미충족", () => {
    const r = judge(
      base({
        ...declared,
        householdHousingCount: 3,
        houses: [house("selling", "2016-01-01"), house("h2", "2018-03-01"), house("h3", "2019-03-01")],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.isExempt).toBe(false);
    expect(r.unmetExceptions).toHaveLength(1);
    const [u] = r.unmetExceptions;
    expect(u.id).toBe("155-6-1ho-cultural-heritage");
    expect(u.label).toBe("문화유산 주택");
    expect(u.legalBasis).toBe("소득세법 시행령 §155⑥1호");
    expect(u.reasons).toHaveLength(1);
    expect(u.reasons[0]).toContain("3채");
    expect(u.reasons[0]).toContain("문화유산 주택");
  });

  it("UMX-32 §154① 보유 2년 미달 — 주택 수는 맞는데 §154①만 걸린 경우", () => {
    const rs = reasonsOf(
      base({
        ...declared,
        acquisitionDate: new Date("2025-06-01"),
        houses: [house("selling", "2025-06-01"), house("h2", "2018-03-01")],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("§154");
  });

  it("UMX-33 선언하지 않으면 말하지 않는다", () => {
    const r = judge(base({ householdHousingCount: 3 } as Partial<OneHouseJudgeInput>));
    expect(r.isExempt).toBe(false);
    expect(r.unmetExceptions).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// §155⑦ 농어촌주택
// ──────────────────────────────────────────────────────────────────────────
describe("UMX §155⑦ — 농어촌주택", () => {
  const rural = (over: Record<string, unknown>) =>
    ({ ruralHouse: { isOutsideCapitalEupMyeon: true, ...over } }) as Partial<OneHouseJudgeInput>;

  it("UMX-7 🔴 드리프트 가드 — 1호 상속(피상속인 거주 5년) 성립 시 사유 0건", () => {
    const r = judge(base(rural({ kind: "inherited", decedentResidenceYears: 5 })));
    expect(r.isExempt).toBe(true);
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UMX-8 1호 — 피상속인 거주 5년 미달을 그 수치와 함께 낸다", () => {
    const r = judge(base(rural({ kind: "inherited", decedentResidenceYears: 2 })));
    expect(r.isExempt).toBe(false);
    expect(r.unmetExceptions).toHaveLength(1);
    const [u] = r.unmetExceptions;
    expect(u.id).toBe("155-7-rural:inherited");
    expect(u.label).toContain("농어촌주택");
    expect(u.reasons).toHaveLength(1);
    expect(u.reasons[0]).toContain("피상속인");
    expect(u.reasons[0]).toContain("2년");
  });

  it("UMX-9 2호 — 이농인 거주 5년 미달(1호 문구가 아니라 2호 문구)", () => {
    const rs = reasonsOf(base(rural({ kind: "farm_exit", ownerResidenceYears: 1 })));
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("이농인");
    expect(rs[0]).not.toContain("피상속인");
  });

  it("UMX-10 소재 요건(수도권 밖 읍·면)은 유형 불문 공통 — 1호 요건과 함께 2건", () => {
    const rs = reasonsOf(
      base({
        ruralHouse: {
          isOutsideCapitalEupMyeon: false,
          kind: "inherited",
          decedentResidenceYears: 1,
        },
      } as unknown as Partial<OneHouseJudgeInput>),
    );
    expect(rs).toHaveLength(2);
    expect(rs.some((x) => x.includes("읍(도시지역 제외)·면"))).toBe(true);
    expect(rs.some((x) => x.includes("피상속인"))).toBe(true);
  });

  it("UMX-11 3호 귀농 — ⑩ 각 호가 **각각** 제 사유를 낸다(고가·면적·세대전원)", () => {
    const rs = reasonsOf(
      base(
        rural({
          kind: "return_to_farm",
          acquisitionDate: new Date("2024-01-01"),
          isHighPriceAtAcquisition: true,
          landAreaSqm: 700,
          wholeHouseholdMoved: false,
        }),
      ),
    );
    expect(rs).toHaveLength(3);
    expect(rs.some((x) => x.includes("고가주택"))).toBe(true);
    expect(rs.some((x) => x.includes("700㎡") && x.includes("660㎡"))).toBe(true);
    expect(rs.some((x) => x.includes("세대전원"))).toBe(true);
  });

  it("UMX-12 3호 귀농 — 660㎡ 이내면 면적 사유를 내지 않는다(구별력)", () => {
    const rs = reasonsOf(
      base(
        rural({
          kind: "return_to_farm",
          acquisitionDate: new Date("2024-01-01"),
          landAreaSqm: 660,
          wholeHouseholdMoved: false,
        }),
      ),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("세대전원");
  });

  it("UMX-13 3호 귀농 — 대지면적 미입력은 「확인할 수 없다」로 구분한다", () => {
    const rs = reasonsOf(
      base(rural({ kind: "return_to_farm", acquisitionDate: new Date("2024-01-01"), wholeHouseholdMoved: true })),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("확인할 수 없습니다");
    expect(rs[0]).not.toContain("초과");
  });

  it("UMX-14 3호 귀농 — 취득일 미입력은 ⑦ 단서를 확인할 수 없다고 밝힌다", () => {
    const rs = reasonsOf(
      base(rural({ kind: "return_to_farm", landAreaSqm: 300, wholeHouseholdMoved: true })),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("취득일");
    expect(rs[0]).toContain("5년");
  });

  it("UMX-15 3호 귀농 5년 기한 초과는 pending이 담당 — unmet에 중복해 넣지 않는다", () => {
    // 귀농 취득 2019-01-01 → 기한 2024-01-01. 양도 2026-09-30은 초과. 나머지 ⑩ 요건은 충족.
    const input = base(
      rural({
        kind: "return_to_farm",
        acquisitionDate: new Date("2019-01-01"),
        landAreaSqm: 300,
        wholeHouseholdMoved: true,
      }),
    );
    const r = judge(input);
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).toContain("155-7-3ho-return-to-farm");
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UMX-16 선언하지 않으면 말하지 않는다", () => {
    expect(unmetOf(base())).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// §155②③ 상속주택 — 주택 수 제외 축
// ──────────────────────────────────────────────────────────────────────────
describe("UMX §155②③ — 상속주택 주택 수 제외", () => {
  /** 상속 1채가 **적격**이라 제외되는 세대(제외 후 2주택이라 여전히 과세) — 드리프트 가드의 대조군 */
  const eligibleRoster = [
    house("selling", "2016-01-01"),
    house("inh", "2020-01-01", { isInherited: true }),
    house("h3", "2018-03-01"),
  ];

  it("UMX-17 🔴 드리프트 가드 — 정본이 제외에 성공하면 사유 0건", () => {
    const r = judge(base({ householdHousingCount: 2, houses: eligibleRoster } as Partial<OneHouseJudgeInput>));
    expect(r.isExempt).toBe(false); // 제외 후에도 2주택이라 과세
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UMX-18 §155② 단서 — 상속개시 당시 동일세대였던 상속주택", () => {
    const r = judge(
      base({
        householdHousingCount: 3,
        houses: [
          house("selling", "2016-01-01"),
          house("inh", "2020-01-01", { isInherited: true, decedentSameHouseholdAtInheritance: true }),
          house("h3", "2018-03-01"),
        ],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.unmetExceptions).toHaveLength(1);
    const [u] = r.unmetExceptions;
    expect(u.id).toBe("155-2-inherited-house");
    expect(u.reasons).toHaveLength(1);
    expect(u.reasons[0]).toContain("동일세대");
    expect(u.reasons[0]).toContain("동거봉양");
  });

  it("UMX-19 동거봉양 합가 전 보유분은 예외 — 사유를 내지 않는다(구별력)", () => {
    const r = judge(
      base({
        householdHousingCount: 2,
        houses: [
          house("selling", "2016-01-01"),
          house("inh", "2020-01-01", {
            isInherited: true,
            decedentSameHouseholdAtInheritance: true,
            parentalCareMergeInheritedHouse: true,
          }),
          house("h3", "2018-03-01"),
        ],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UMX-20 §155②1~4호 순위 부적격", () => {
    const rs = reasonsOf(
      base({
        householdHousingCount: 3,
        houses: [
          house("selling", "2016-01-01"),
          house("inh", "2020-01-01", { isInherited: true, isRankingDisqualifiedInheritedHouse: true }),
          house("h3", "2018-03-01"),
        ],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("순위");
  });

  it("UMX-21 🔴 적격 2채 — 「해당 없음」이 아니라 「선순위 특정 불가」라고 말한다", () => {
    const rs = reasonsOf(
      base({
        householdHousingCount: 3,
        houses: [
          house("selling", "2016-01-01"),
          house("inh1", "2020-01-01", { isInherited: true }),
          house("inh2", "2021-01-01", { isInherited: true }),
        ],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("2채");
    expect(rs[0]).toContain("특정할 수 없습니다");
  });

  it("UMX-22 공동상속(소수지분) 적격 2채도 같은 방식으로 밝힌다", () => {
    const rs = reasonsOf(
      base({
        householdHousingCount: 3,
        houses: [
          house("selling", "2016-01-01"),
          house("inh1", "2020-01-01", { isInherited: true, isCoInherited: true }),
          house("inh2", "2021-01-01", { isInherited: true, isCoInherited: true }),
        ],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toContain("공동상속주택(소수지분)");
  });

  it("UMX-23 상속개시 2년 내 피상속인 증여분 — §155② 전체 게이트-오프", () => {
    const rs = reasonsOf(
      base({
        householdHousingCount: 3,
        houses: eligibleRoster,
        generalHouseGiftedFromDecedentWithin2yr: true,
      } as Partial<OneHouseJudgeInput>),
    );
    expect(rs.some((x) => x.includes("2년 이내에 피상속인으로부터 증여"))).toBe(true);
  });

  it("UMX-24 명부에 상속주택이 없으면 말하지 않는다", () => {
    const r = judge(base({ householdHousingCount: 3 } as Partial<OneHouseJudgeInput>));
    expect(r.unmetExceptions).toEqual([]);
  });

  /**
   * 🔴 `sellingHouseId` 미입력 시 **첫 행**으로 폴백하는 규칙(`resolveInheritedSellingHouseId`)이
   *    정본과 안내에서 **같아야** 한다. 어긋나면 후보 집합이 갈려 「정본은 제외했는데 안내는
   *    불성립이라고 말하는」 모순이 난다. 판정 route는 `sellingHouseId: "selling"`을 고정으로
   *    싣지만(`one-house-exemption-api.ts`), 계산기·API 직접 호출 경로는 비워 둘 수 있다.
   */
  it("UMX-29 sellingHouseId 미입력 — 첫 행을 양도주택으로 보아 후보에서 뺀다", () => {
    /**
     * 시료 설계: 상속 표시가 **두 행**(첫 행 = 양도주택)이다.
     *  - 폴백 **있음**(정본): 후보 = `inh` 1채 → 적격 1채 → 제외 성공 → 사유 0건
     *  - 폴백 **없음**(뮤턴트): 후보 = 2채 → 적격 2채 → 「선순위 특정 불가」 사유가 **생긴다**
     * ⇒ 빈 배열 단언이 폴백을 실제로 고정한다. 긍정 짝은 UMX-21(적격 2채 → 사유).
     */
    const r = judge(
      base({
        householdHousingCount: 3,
        sellingHouseId: undefined,
        houses: [
          house("selling", "2016-01-01", { isInherited: true }), // 첫 행 = 양도주택 폴백
          house("inh", "2020-01-01", { isInherited: true }),
        ],
      } as unknown as Partial<OneHouseJudgeInput>),
    );
    expect(r.isExempt).toBe(false); // 과세라 수집기가 실제로 돈다(공회전 아님)
    expect(r.unmetExceptions).toEqual([]);
  });

  it("UMX-25 양도 대상 자신이 상속주택이면 제외 후보가 아니다 — 사유 0건", () => {
    const r = judge(
      base({
        householdHousingCount: 3,
        houses: [house("selling", "2016-01-01", { isInherited: true }), house("h2", "2018-03-01")],
      } as Partial<OneHouseJudgeInput>),
    );
    expect(r.unmetExceptions).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 공통 게이트
// ──────────────────────────────────────────────────────────────────────────
describe("UMX 공통 — 자산·세대 게이트는 신규 축에도 걸린다", () => {
  const declaredAll = {
    unavoidableOutsideCapitalHouse: { reason: "work" as const },
    ruralHouse: { kind: "inherited" as const, isOutsideCapitalEupMyeon: false },
    culturalHeritageHouse: true,
    householdHousingCount: 3,
    houses: [
      house("selling", "2016-01-01"),
      house("inh", "2020-01-01", { isInherited: true, isRankingDisqualifiedInheritedHouse: true }),
      house("h3", "2018-03-01"),
    ],
  };

  it("UMX-26 네 축이 동시에 불성립이면 **네 장**의 항목을 낸다(축이 서로를 삼키지 않는다)", () => {
    const u = unmetOf(base(declaredAll as unknown as Partial<OneHouseJudgeInput>));
    expect(u.map((x) => x.id).sort()).toEqual([
      "155-2-inherited-house",
      "155-6-1ho-cultural-heritage",
      "155-7-rural:inherited",
      "155-8-unavoidable:work",
    ]);
  });

  it("UMX-27 🔴 입주권 양도에는 사유를 내지 않는다(자산 게이트)", () => {
    const u = unmetOf(
      base({
        ...declaredAll,
        propertyType: "redevelopment_right",
      } as unknown as Partial<OneHouseJudgeInput>),
    );
    expect(u).toEqual([]);
  });

  it("UMX-28 🔴 1세대가 아니면 사유를 내지 않는다(세대 게이트)", () => {
    const u = unmetOf(
      base({ ...declaredAll, isOneHousehold: false } as unknown as Partial<OneHouseJudgeInput>),
    );
    expect(u).toEqual([]);
  });
});
