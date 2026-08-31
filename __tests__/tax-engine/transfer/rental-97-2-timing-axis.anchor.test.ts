/**
 * anchor — §97의2 시한은 **호마다 축이 다르다** (D1-10)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97의2①** — 「대통령령으로 정하는 거주자가 다음 각 호의 어느 하나에 해당하는
 * 국민주택…을 5년 이상 임대한 후 양도하는 경우에는 그 주택…을 양도함으로써 발생하는 소득에
 * 대한 양도소득세를 면제한다.
 *
 *   **1. 민간임대주택법 또는 공공주택 특별법에 따른 건설임대주택**
 *      가. **1999년 8월 20일부터 2001년 12월 31일까지의 기간 중에 신축된 주택**
 *      나. **1999년 8월 19일 이전에 신축된 공동주택**으로서 1999년 8월 20일 현재 입주된
 *          사실이 없는 주택
 *   **2. …매입임대주택 중 1999년 8월 20일 이후 취득(1999년 8월 20일부터 2001년 12월 31일까지의
 *      기간 중에 매매계약을 체결하고 계약금을 지급한 경우만 해당한다) 및 임대를 개시한 임대주택**
 *      (취득 당시 입주된 사실이 없는 주택만 해당한다)」
 *
 * ⇒ **1호 = 신축일 축 / 2호 = 매매계약일 축**. 한 fallback 체인으로 합칠 수 없다.
 *
 * ## 결함 — 1호 나목이 구조적으로 배제됐다
 * 종전 술어는 `within(target, 1999-08-20, 2001-12-31)` 하나였다.
 * 나목은 「1999.8.19 **이전** 신축」이므로 **어떤 입력으로도 통과할 수 없었다**(납세자 불리).
 *
 * ## 만들지 않은 것 — 신축일 전용 필드
 * 자산-수준 `usageApprovalDate` 소스가 저장소에 없어 넣어도 항상 undefined인 dead prop이 된다
 * (memory `feedback_api_trigger_without_input_path_is_noop`).
 * 건설임대는 신축이 곧 취득이므로 `acquisitionDate`를 쓴다.
 * 나목의 「1999.8.20 현재 미입주」 요건도 자기확인 필드가 없어 판정하지 않는다 —
 * 시한 게이트만 열고, 없는 입력을 추정해 판정하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/**
 * ⚠️ `period-check.ts`의 경계 상수는 `new Date("YYYY-MM-DD")`(**UTC 자정**)이다.
 *    테스트에서 로컬 자정(`T00:00:00`)을 쓰면 KST 기준 9시간 앞서 경계일이 밀려
 *    「1999.8.20이 가목에 안 들어간다」는 **없는 결함**이 만들어진다.
 *    같은 방식으로 만들어 비교한다.
 */
const D = (s: string) => new Date(s);
const check = (ctx: Record<string, unknown>) =>
  checkReductionPeriod("rental_97_2", ctx as Any).inPeriod;

describe("1호 건설임대 — 신축일 축", () => {
  it("가목: 1999.8.20~2001.12.31 신축 → 통과", () => {
    expect(check({ rental972Type: "construction", acquisitionDate: D("2000-06-01") })).toBe(true);
  });

  it("🔴 나목: 1999.8.19 이전 신축 공동주택 → 통과해야 한다", () => {
    expect(
      check({ rental972Type: "construction", acquisitionDate: D("1998-03-01") }),
      "하한을 걸면 나목이 어떤 입력으로도 통과할 수 없다",
    ).toBe(true);
  });

  it("경계 — 1999.8.19는 나목(이전)에 포함된다", () => {
    expect(check({ rental972Type: "construction", acquisitionDate: D("1999-08-19") })).toBe(true);
  });

  it("2001.12.31 후 신축은 가·나 어느 목에도 없다 → 배제", () => {
    expect(check({ rental972Type: "construction", acquisitionDate: D("2002-01-01") })).toBe(false);
  });

  it("가·나목 사이 공백이 없다 — 1999.8.20도 통과", () => {
    expect(check({ rental972Type: "construction", acquisitionDate: D("1999-08-20") })).toBe(true);
  });
});

describe("2호 매입임대 — 매매계약일 축", () => {
  it("계약 2000-06-01 → 통과", () => {
    expect(check({ rental972Type: "purchase", contractDate: D("2000-06-01") })).toBe(true);
  });

  it("🔴 계약 1998년(시한 전)은 배제 — 1호 나목 하한 완화가 2호로 새면 안 된다", () => {
    expect(
      check({ rental972Type: "purchase", contractDate: D("1998-03-01") }),
      "2호에는 「1999.8.19 이전」 갈래가 없다",
    ).toBe(false);
  });

  it("계약일이 없으면 취득일로 대체한다 (종전 동작 보존)", () => {
    expect(check({ rental972Type: "purchase", acquisitionDate: D("2000-06-01") })).toBe(true);
  });
});

describe("구별력 — 같은 날짜가 호에 따라 갈린다", () => {
  it("1998-03-01: 1호는 통과(나목), 2호는 배제", () => {
    const c = check({ rental972Type: "construction", acquisitionDate: D("1998-03-01") });
    const p = check({ rental972Type: "purchase", acquisitionDate: D("1998-03-01") });
    expect(c).toBe(true);
    expect(p).toBe(false);
    expect(c).not.toBe(p);
  });
});
