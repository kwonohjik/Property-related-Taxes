/**
 * anchor — `isPresaleRightCounted`의 취득일 게이트는 **분양권 전용**이다 (C1-02 · 종결)
 *
 * ## 무엇이 틀렸나
 *
 * 이 술어는 `presaleRights[]` **전 항목**에 「취득일 < 2021-01-01이면 주택 수에 산입하지
 * 않는다」를 적용했다. 그런데 그 배열은 분양권(`presale_right`)과 **조합원입주권**
 * (`redevelopment_right`)을 함께 담고, 함수는 `type`을 보지 않았다.
 *
 * 2021-01-01은 §88 10호 「**분양권**」 정의 신설의 적용례이지 조합원입주권의 기산일이 아니다.
 * 조합원입주권은 그 이전부터 §104⑦2호·4호의 산입 요소였다 — 2020-08-28 시행본(제16568호 ·
 * MST 210323) 실독: 2호 「1세대가 주택과 **조합원입주권을 각각 1개씩** 보유한 경우」,
 * 4호 「주택과 **조합원입주권**을 보유한 경우로서 그 수의 합이 3 이상」.
 *
 * ## ✅ 착수 조건이 닫혔다 — 법률 제15225호 부칙 실독 (2026-08-26)
 *
 * 리뷰는 대체 게이트를 둘로 갈라 두었다: (a) 조합원입주권에는 취득일 게이트 **없음** /
 * (b) §104⑦ 신설 개정의 **부칙 적용례**가 정한 날. (b)를 배제하려면 부칙 본문이 필요했고,
 * 법제처 DRF 부칙 조회가 막혀 보류돼 있었다. 그 본문을 읽었다:
 *
 * > **부칙 <제15225호, 2017.12.19> 제1조(시행일)** 이 법은 2018년 1월 1일부터 시행한다. 다만,
 * > 다음 각 호의 개정규정은 각 호의 구분에 따른 날부터 시행한다.
 * >   1. … **제104조제4항제1호 및 제2호, 같은 조 제5항제2호, 같은 조 제7항·제8항** 및
 * >      제104조의2제2항의 개정규정: **2018년 4월 1일**
 * >
 * > **제2조(일반적 적용례)** ② 이 법 중 양도소득에 관한 개정규정은 이 법 시행 이후
 * > **양도하는 자산**으로부터 발생하는 소득분부터 적용한다.
 *
 * 제3조~제14조의 개별 적용례에 **§104⑦은 없다**. ⇒ 일반적 적용례만 적용되고 그 기준은
 * **양도일**이다. **취득시기 요건은 부칙에도 없다** ⇒ 가설 (b) 기각, (a) 확정.
 *
 * (시행령 §167의4②1호·§167의11②1호도 같다 — 산입 제외는 「수도권·광역시·특별자치시 외 지역 +
 *  가액 3억 이하」뿐이고 취득시기 요건이 없다. 조합원입주권과 분양권을 나란히 열거한다.)
 *
 * ## 🔑 §104⑦ 자체의 시행일 게이트는 **다른 층에 이미 있다**
 *
 * 2018-04-01 이전 양도에는 §104⑦이 아예 적용되지 않는데, 그 판정은 세율 층
 * (`MULTI_HOUSE_SURCHARGE_START_DATE` · `resolveSurchargeAddonRate`)이 이미 담당한다.
 * 이 술어에 양도일 조건을 또 넣으면 진실이 둘이 된다 — 넣지 않는다.
 *
 * ## 방향
 *
 * 정정은 **납세자에게 불리**하다(리뷰 실측 Δ 109,725,000원 · 종전이 **과소과세**).
 * 근거가 확정됐으므로 적용한다.
 *
 * 🔴 이 파일은 종전 `presale-right-type-date-gate.characterization.test.ts`를 대체한다.
 *    그 파일은 근거 확정 전까지 현행 동작을 고정하는 트립와이어였고, 예정대로 울렸다.
 */
import { describe, it, expect } from "vitest";
import { isPresaleRightCounted } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

/** 시딩 기본값 — `lib/tax-engine/data/transfer-rate-seed.ts`. */
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

describe("C1-02 · 취득일 게이트는 분양권 전용", () => {
  it("분양권 — 기산일 이후 취득은 산입한다", () => {
    expect(isPresaleRightCounted(right({ acquisitionDate: new Date("2021-06-01") }), START)).toBe(
      true,
    );
  });

  it("분양권 — 기산일 전 취득은 산입하지 않는다 (§88 10호 신설 적용례)", () => {
    expect(isPresaleRightCounted(right({ acquisitionDate: new Date("2020-12-31") }), START)).toBe(
      false,
    );
  });

  it("★ 조합원입주권 — 취득일과 무관하게 산입한다 (부칙 실독으로 확정)", () => {
    for (const d of ["1998-05-01", "2017-12-31", "2019-05-01", "2020-12-31", "2021-06-01"]) {
      const r = right({ type: "redevelopment_right", acquisitionDate: new Date(d) });
      expect(isPresaleRightCounted(r, START), `취득일 ${d}`).toBe(true);
    }
  });

  it("★ 같은 취득일에서 두 type의 판정이 **갈린다** (type 판별 확증)", () => {
    // 종전에는 두 값이 항상 같았다 — 그것이 결함의 확증이었다.
    const d = new Date("2019-05-01");
    expect(isPresaleRightCounted(right({ type: "presale_right", acquisitionDate: d }), START)).toBe(
      false,
    );
    expect(
      isPresaleRightCounted(right({ type: "redevelopment_right", acquisitionDate: d }), START),
    ).toBe(true);
  });

  it("🔑 3억 배제는 두 type에 **똑같이** 적용된다 (§167의11②1호가 나란히 열거)", () => {
    // ⚠️ 취득일은 두 type 모두 게이트를 통과하는 값이어야 3억 규칙만 분리해 볼 수 있다.
    for (const type of ["presale_right", "redevelopment_right"] as const) {
      const cheap = right({
        type,
        acquisitionDate: new Date("2022-02-01"),
        region: "non_capital",
        regionCriteria: "VALUE",
        rightValue: 300_000_000,
      });
      expect(isPresaleRightCounted(cheap, START), `${type} 3억 이하`).toBe(false);
      expect(
        isPresaleRightCounted({ ...cheap, rightValue: 300_000_001 }, START),
        `${type} 3억 초과`,
      ).toBe(true);
    }
  });

  it("🔑 REGION 지역은 가액과 무관하게 산입한다 (3억 배제는 VALUE 전용)", () => {
    const r = right({
      type: "redevelopment_right",
      acquisitionDate: new Date("2019-05-01"),
      regionCriteria: "REGION",
      rightValue: 100_000_000,
    });
    expect(isPresaleRightCounted(r, START)).toBe(true);
  });
});
