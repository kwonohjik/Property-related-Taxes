/**
 * Pre-Do anchor — **「양도 당시 조정대상지역」도 소재지(regionCode)로 정밀 판정한다** (F-3).
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §7 F-3.
 *
 * ## 고치기 전 상태 (실측)
 *
 * 「취득 당시」는 이미 `resolveWasRegulatedAtAcquisition`이 `regionCode`를 **우선**한다
 * (`transfer-tax-exemption-requirements.ts:382-390`). 다주택 중과도 그렇다
 * (`multi-house-surcharge.ts:226` — 양도일 기준 `isRegulatedByBjdCode`).
 *
 * 그런데 **§155① 처분기한만** boolean `isRegulatedArea`를 직접 읽었다(`:635`).
 * ⇒ 주소가 있어도 그 축만 토글을 따라, 같은 폼의 세 판정이 **서로 다른 근거**를 썼다.
 *
 * ## 기한 데이터 (seed 실측)
 *
 * | | 기한 |
 * |---|---|
 * | 비조정 | 3년 |
 * | 조정 · 2022-05-10 **이전** 양도 | **2년** |
 * | 조정 · 2022-05-10 이후 양도 | 3년 (완화) |
 *
 * ⇒ 두 근거가 갈리는 것을 관측하려면 **양도일이 2022-05-10 이전**이어야 한다. 이후 날짜는
 *   조정·비조정이 모두 3년이라 **구별력이 0**이다(`feedback_mutation_zero_discrimination_is_not_proof`).
 */
import { describe, it, expect } from "vitest";
import { resolveTemporaryTwoHouseDeadlineYears } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";

/** 서울 강남구 역삼동 — 아래 두 기준일 모두 조정대상지역인 시료(AN-3와 같은 코드). */
const SEOUL_GANGNAM = "1168010100";
/** 완화 시행(2022-05-10) **이전** 양도 — 조정 2년 · 비조정 3년으로 갈리는 유일한 구간. */
const TRANSFER_BEFORE_RELAX = new Date("2021-06-01");

const RULE = {
  disposalDeadlineYears: 3,
  regulatedAreaDeadlineYears: 2,
  regulatedAreaRelaxDate: "2022-05-10",
  regulatedAreaRelaxDeadlineYears: 3,
} as Parameters<typeof resolveTemporaryTwoHouseDeadlineYears>[1];

type Arg0 = Parameters<typeof resolveTemporaryTwoHouseDeadlineYears>[0];

function input(over: Record<string, unknown>): Arg0 {
  return {
    transferDate: TRANSFER_BEFORE_RELAX,
    isRegulatedArea: false,
    temporaryTwoHouse: undefined,
    ...over,
  } as unknown as Arg0;
}

describe("RG-0 (전제) — 시료와 데이터가 실제로 갈린다", () => {
  it("강남 역삼동은 양도일 현재 조정대상지역이다", () => {
    expect(isRegulatedByBjdCode(SEOUL_GANGNAM, "2021-06-01").isRegulated).toBe(true);
  });

  it("boolean 경로는 조정 2년 · 비조정 3년으로 갈린다", () => {
    expect(resolveTemporaryTwoHouseDeadlineYears(input({ isRegulatedArea: true }), RULE)).toBe(2);
    expect(resolveTemporaryTwoHouseDeadlineYears(input({ isRegulatedArea: false }), RULE)).toBe(3);
  });

  /**
   * 🔑 완화 이후 날짜로는 이 축을 **아예 잴 수 없다** — 둘 다 3년이다.
   *    이 단언이 없으면 뒤에 누가 fixture 날짜를 옮겼을 때 조용히 구별력 0이 된다.
   */
  it("완화 시행 이후 양도는 조정·비조정이 모두 3년이라 구별력이 0이다", () => {
    const after = { transferDate: new Date("2026-06-01") };
    expect(
      resolveTemporaryTwoHouseDeadlineYears(input({ ...after, isRegulatedArea: true }), RULE),
    ).toBe(3);
    expect(
      resolveTemporaryTwoHouseDeadlineYears(input({ ...after, isRegulatedArea: false }), RULE),
    ).toBe(3);
  });
});

describe("RG-1 — regionCode가 있으면 그것이 boolean을 이긴다", () => {
  /**
   * 🔴 착수 **전**에는 이 단언이 red였다 — 주소가 조정지역인데도 토글(false)을 따라 3년이었다.
   *    형제 축(`resolveWasRegulatedAtAcquisition`·다주택 중과)은 이미 주소를 우선하고 있었다.
   */
  it("주소가 조정지역이면 토글 OFF여도 2년이다", () => {
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        input({ isRegulatedArea: false, regionCode: SEOUL_GANGNAM }),
        RULE,
      ),
    ).toBe(2);
  });

  /**
   * 음성 짝 — 주소가 **비**조정이면 토글 ON이어도 3년이다.
   * 이 짝이 없으면 「어떤 이유로든 2년」이어도 위 단언이 초록이라 구별력이 0이다.
   */
  it("주소가 비조정이면 토글 ON이어도 3년이다", () => {
    // 조정대상지역으로 지정된 적이 없는 시료. 전제를 먼저 못 박는다.
    const NON_REGULATED = "4713025000"; // 경북 안동시 일직면
    expect(isRegulatedByBjdCode(NON_REGULATED, "2021-06-01").isRegulated).toBe(false);
    expect(
      resolveTemporaryTwoHouseDeadlineYears(
        input({ isRegulatedArea: true, regionCode: NON_REGULATED }),
        RULE,
      ),
    ).toBe(3);
  });

  /** 주소가 없으면 종전대로 boolean이 판정 근거다(회귀 0). */
  it("주소가 없으면 boolean fallback이 그대로 산다", () => {
    expect(resolveTemporaryTwoHouseDeadlineYears(input({ isRegulatedArea: true }), RULE)).toBe(2);
    expect(resolveTemporaryTwoHouseDeadlineYears(input({ isRegulatedArea: false }), RULE)).toBe(3);
  });
});
