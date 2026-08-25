/**
 * characterization — `isPresaleRightCounted`의 **type 미판별 취득일 게이트** (C1-02 · 🟠 미결)
 *
 * ## 이 파일은 「옳은 동작」을 단언하지 않는다
 *
 * 현행 동작을 **있는 그대로 고정**해, 근거를 확정하기 전에 조용히 바뀌는 것을 막는다.
 * 고칠 때는 이 파일의 단언이 함께 실패해야 한다 — 그때 아래 「착수 조건」이 눈에 들어온다.
 *
 * ## 확인된 것 (법령 본문 실독 · 2026-08-25)
 *
 * · 「소득세법 시행령」 §167의11②1호(현행 · MST 286211) — 산입 제외는 「수도권·광역시·특별자치시
 *   … 외의 지역에 소재하는 주택, **조합원입주권 또는 분양권**으로서 … 3억원을 초과하지 않는」 것뿐.
 *   **취득시기 요건이 없다.**
 * · 「소득세법」 §104⑦2호·4호 **2020-08-28 시행본**(제16568호 · MST 210323) —
 *   「1세대가 주택과 **조합원입주권을 각각 1개씩** 보유한 경우」/「주택과 **조합원입주권**을 보유한
 *   경우로서 그 수의 합이 3 이상」. 즉 **조합원입주권은 2021-01-01 이전부터 산입 요소**였다.
 * · 현행 2호·4호의 「**또는 분양권**」은 §88 10호 「분양권」 정의 신설(2021-01-01 시행)과 함께 들어왔다.
 *
 * ⇒ 코드의 2021-01-01은 **분양권 신설의 적용례**다. `type`을 보지 않으므로 조합원입주권에도
 *   걸리고, 그 결과 §104⑦4호(+30%p) 사안이 2호(+20%p)로 계산된다(리뷰 실측 Δ 109,725,000원 ·
 *   **과소과세**).
 *
 * ## 확인하지 못한 것 — 착수 조건
 *
 * 정정은 납세자에게 **불리한** 방향이고 옳은 대체 게이트가 둘로 갈린다:
 *   (a) 조합원입주권에는 취득일 게이트 **없음**
 *   (b) §104⑦ 신설 개정(법률 **제15225호** · 시행 2018-04-01) **부칙 적용례**가 정한 날
 *
 * (b)를 배제하려면 제15225호 부칙 본문을 읽어야 한다. 법제처 DRF 부칙 조회에는 `KOREAN_LAW_OC`가
 * 필요한데 이 저장소 `.env.local`에 없고, MCP `applicable_law`의 부칙 발췌는 **최근 6건**만
 * 반환해 2018년까지 닿지 않는다. ⇒ **부칙 본문 실독 전에는 바꾸지 않는다**
 * (memory `feedback_unverified_authority_blocks_tax_change` ·
 *  `feedback_no_unfavorable_application_without_legal_basis` · 재시도는
 *  `feedback_env_blocker_retry_periodically`).
 */
import { describe, it, expect } from "vitest";
import { isPresaleRightCounted } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

/** 시딩 기본값 — `lib/tax-engine/data/transfer-rate-seed.ts:182`. */
const START = new Date("2021-01-01");

const right = (over: Partial<PresaleRight>): PresaleRight =>
  ({
    id: "r1",
    type: "presale_right",
    acquisitionDate: new Date("2022-02-01"),
    region: "capital",
    regionCriteria: "REGION",
    ...over,
  }) as PresaleRight;

describe("C1-02 characterization · 분양권·입주권 주택 수 산입 게이트", () => {
  it("C1-02-01: 분양권 — 기산일 이후 취득은 산입한다", () => {
    expect(isPresaleRightCounted(right({ acquisitionDate: new Date("2021-06-01") }), START)).toBe(
      true,
    );
  });

  it("C1-02-02: 분양권 — 기산일 전 취득은 산입하지 않는다 (§88 10호 신설 적용례)", () => {
    expect(isPresaleRightCounted(right({ acquisitionDate: new Date("2020-12-31") }), START)).toBe(
      false,
    );
  });

  it("C1-02-03: 🟠 조합원입주권도 **똑같이** 기산일에 걸린다 — type을 보지 않는다 (현행 고정)", () => {
    const before = right({ type: "redevelopment_right", acquisitionDate: new Date("2019-05-01") });
    const after = right({ type: "redevelopment_right", acquisitionDate: new Date("2021-06-01") });
    // 🟠 §104⑦2호·4호는 2020-08-28 시행본에도 조합원입주권을 담고 있었고 §167의11②1호에는
    //    취득시기 요건이 없다 ⇒ 아래 `false`는 **근거 없는 미산입**일 가능성이 높다.
    //    제15225호 부칙 적용례를 읽기 전에는 바꾸지 않는다.
    expect(isPresaleRightCounted(before, START)).toBe(false);
    expect(isPresaleRightCounted(after, START)).toBe(true);
  });

  it("C1-02-04: 🟠 같은 취득일이면 분양권과 조합원입주권의 판정이 완전히 같다 (type 미판별 확증)", () => {
    for (const d of ["2019-05-01", "2020-12-31", "2021-01-01", "2022-02-01"]) {
      const presale = isPresaleRightCounted(
        right({ type: "presale_right", acquisitionDate: new Date(d) }),
        START,
      );
      const redev = isPresaleRightCounted(
        right({ type: "redevelopment_right", acquisitionDate: new Date(d) }),
        START,
      );
      expect(redev, `취득일 ${d}`).toBe(presale);
    }
  });

  it("C1-02-05: VALUE지역 3억 이하 배제는 조문 근거가 있다 (§167의11②1호 · 회귀 가드)", () => {
    const cheap = right({
      acquisitionDate: new Date("2022-02-01"),
      region: "non_capital",
      regionCriteria: "VALUE",
      rightValue: 300_000_000,
    });
    const pricey = { ...cheap, rightValue: 300_000_001 };
    expect(isPresaleRightCounted(cheap, START)).toBe(false);
    expect(isPresaleRightCounted(pricey, START)).toBe(true);
  });
});
