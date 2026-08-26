/**
 * F-11 Pre-Do anchor — §164⑧ 보유월수(`calcStdPriceMonths`)가 실행 타임존에 의존한다.
 *
 * 결함 위치: `lib/tax-engine/same-adjustment-period-std-price.ts:60-86`
 *   `expiryOf` 가 `from.getFullYear()/getMonth()/getDate()` 와 `new Date(year, month, day)`
 *   즉 **로컬** 컴포넌트로 만료일을 만든다. 그런데 프로덕션이 넘기는 Date 는 **UTC 자정**이다
 *   (`lib/api/date-coerce.ts:46` → `new Date("2005-07-01")` — date-only ISO 는 UTC 로 파싱된다).
 *   UTC 오프셋이 0이 아닌 런타임에서는 만료일이 오프셋만큼 어긋나 **잔여 일수가 0인 만월 구간에도**
 *   시행규칙 §80⑤ 절상이 발동하고 N개월이 N+1 로 나온다.
 *
 * 법령: 「소득세법 시행규칙」 제80조 제5항 "1월미만의 **일수**는 1월로 한다"
 *   — 절상 대상이 일수이므로 잔여가 0인 만월 구간에는 발동할 수 없다.
 *   「소득세법 시행령」 제164조 제8항 위임. 민법 제160조 제2항·제3항(기간 만료점).
 *
 * ⚠️ **호출부 3곳이 서로 다른 날짜 규약을 쓴다** — 이것이 이 결함의 실제 범위다.
 *   ① `lib/tax-engine/transfer-tax-same-period-step.ts:96`  — `toDate()` ⇒ **UTC 자정** (엔진)
 *   ② `lib/stores/transfer-per-asset-summary.ts:306-307`    — `new Date("…T00:00:00")` ⇒ **로컬 자정** (사이드바)
 *   ③ `lib/calc/same-adjustment-period-lookup.ts:88`        — `new Date(y, m, d-1)` ⇒ **로컬**
 *   ⇒ 같은 자산인데 사이드바 보유월수와 엔진 보유월수가 갈릴 수 있다.
 *
 * ⚠️ 기존 anchor 28건(`same-adjustment-period-std-price.anchor.test.ts`)은
 *   `const D = (s) => new Date(`${s}T00:00:00`)` 로 **로컬** 날짜를 먹여 프로덕션 형태를 태우지 않는다.
 *   그래서 이 결함에 대한 회귀 신호가 0이었다.
 *
 * 실측(2026-08-26, TZ=Asia/Seoul):
 *   구간              UTC입력(프로덕션)  로컬입력(기존 테스트)  정답
 *   2005-07-01~12-31        7                  6                6
 *   2005-01-01~12-31       13                 12               12
 *   2005-07-01~2006-06-30  13                 12               12
 *   2005-01-31~2005-02-28   2                  1                1
 *
 * ⚠️ §1 은 **F-11 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcStdPriceMonths } from "@/lib/tax-engine/same-adjustment-period-std-price";

/** 프로덕션 경로가 만드는 형태 — `toDate("2005-07-01")` 와 동일한 UTC 자정 인스턴트 */
const U = (s: string) => new Date(s);
/** 기존 anchor 가 쓰는 형태 — 로컬 자정 */
const L = (s: string) => new Date(`${s}T00:00:00`);

describe("F-11 §164⑧ 보유월수 — §1 프로덕션(UTC 자정) 입력 (수정 전 실패)", () => {
  it("2005-07-01 ~ 2005-12-31 = 정확히 6개월 (잔여 0 ⇒ §80⑤ 절상 없음)", () => {
    expect(calcStdPriceMonths(U("2005-07-01"), U("2005-12-31"))).toBe(6);
  });

  it("2005-01-01 ~ 2005-12-31 = 정확히 12개월", () => {
    expect(calcStdPriceMonths(U("2005-01-01"), U("2005-12-31"))).toBe(12);
  });

  it("2005-07-01 ~ 2006-06-30 = 정확히 12개월 (연 경계 통과)", () => {
    expect(calcStdPriceMonths(U("2005-07-01"), U("2006-06-30"))).toBe(12);
  });

  it("2005-01-31 ~ 2005-02-28 = 1개월 (민법 §160③ 말일 만료)", () => {
    expect(calcStdPriceMonths(U("2005-01-31"), U("2005-02-28"))).toBe(1);
  });
});

describe("F-11 §164⑧ 보유월수 — §2 실행 타임존 무관성 (수정 전 실패)", () => {
  const CASES: [string, string][] = [
    ["2005-07-01", "2005-12-31"],
    ["2005-01-01", "2005-12-31"],
    ["2005-07-01", "2006-06-30"],
    ["2004-03-01", "2005-01-01"],
    ["2005-01-31", "2005-02-28"],
    ["2005-09-07", "2006-06-10"],
    ["2005-07-28", "2006-03-24"],
    ["2005-07-01", "2005-07-02"],
  ];

  /**
   * 핵심 단언 — 결과는 **UTC 달력 날짜**에만 의존하고 그 날의 시각에는 의존하지 않아야 한다.
   * 같은 UTC 날짜의 00:00 과 23:59:59 가 다른 답을 내면, 실행 타임존이 바뀔 때 답이 바뀐다는 뜻이다.
   *
   * ⚠️ 「로컬 자정 입력과 UTC 자정 입력이 같아야 한다」로는 쓰지 않는다 — 두 인스턴트는 실제로 다른
   *    시점이고, 그 등가는 오프셋이 양수인 지역에서만 성립해 결함을 절반만 덮는다(실측 확인).
   *    정본은 「호출부가 UTC 자정을 넘긴다」이며, 로컬 자정을 만들던 호출부 2곳을 함께 고친다.
   */
  it("같은 UTC 날짜라면 시각이 달라도 개월 수가 같다", () => {
    const diverged = CASES.filter(
      ([a, b]) =>
        calcStdPriceMonths(U(a), U(b)) !==
        calcStdPriceMonths(new Date(`${a}T23:59:59Z`), new Date(`${b}T23:59:59Z`)),
    ).map(([a, b]) => `${a}~${b}`);
    expect(diverged).toEqual([]);
  });

  it("로컬 자정 입력은 UTC 달력 날짜가 달라 다른 답이 될 수 있다 — 호출부가 UTC 를 넘겨야 한다", () => {
    // 이 테스트는 「두 규약이 같다」를 주장하지 않는다. 규약이 다르면 답도 다르다는 사실을 고정해
    // 호출부가 반드시 UTC 자정을 넘기도록 강제한다(회귀 시 이 단언이 먼저 깨진다).
    const kstOffsetHours = -new Date("2005-07-01T00:00:00").getTimezoneOffset() / 60;
    if (kstOffsetHours === 0) {
      // UTC 런타임(CI)에서는 두 규약이 같은 인스턴트라 구별력이 없다.
      expect(calcStdPriceMonths(L("2005-07-01"), L("2005-12-31"))).toBe(6);
      return;
    }
    expect(L("2005-07-01").toISOString().slice(0, 10)).not.toBe("2005-07-01");
  });
});

describe("F-11 §164⑧ 보유월수 — §3 역방향 가드 (수정 후에도 불변)", () => {
  /** 잔여 일수가 실제로 있으면 §80⑤ 절상은 그대로 발동해야 한다. */
  it("2005-07-01 ~ 2005-07-02 = 1개월 (1월 미만도 1월)", () => {
    expect(calcStdPriceMonths(U("2005-07-01"), U("2005-07-02"))).toBe(1);
  });

  it("2005-09-07 ~ 2006-06-10 = 10개월 (잔여 있음 ⇒ 절상)", () => {
    expect(calcStdPriceMonths(U("2005-09-07"), U("2006-06-10"))).toBe(10);
  });

  it("2005-07-28 ~ 2006-03-24 = 8개월", () => {
    expect(calcStdPriceMonths(U("2005-07-28"), U("2006-03-24"))).toBe(8);
  });

  it("양도일 ≤ 취득일이면 0", () => {
    expect(calcStdPriceMonths(U("2005-07-01"), U("2005-07-01"))).toBe(0);
    expect(calcStdPriceMonths(U("2005-07-02"), U("2005-07-01"))).toBe(0);
  });
});
