/**
 * 공익법인등 출연재산 사후관리 추징 — 상증법 §48②1호 (3년 추징)
 *
 * ## 법령 (KoreanLaw 실측 2026-08-10)
 *
 * · **법 §48②** 본문 — 「그 사유가 발생한 날에 대통령령으로 정하는 가액을 공익법인등이
 *   **증여받은 것으로 보아 즉시 증여세를 부과**」
 * · **법 §48②1호** — 용도 외 사용 / 출연받은 날부터 **3년 이내** 미사용 / **3년 이후** 계속 미사용.
 *   **단서** — 부득이한 사유 **보고** + 사유가 없어진 날부터 **1년 이내** 사용 시 **제외**
 * · **상증령 §40①1호** — 가목 「그 사용한 재산의 가액」 / 나목 「사용하지 아니하거나 미달하게
 *   사용한 재산의 가액」 / 다목 「사용하지 않는 재산의 가액」
 *
 * ## 이 파일이 지키는 두 가지 구조적 판단
 *
 * 1. **marginal 재계산이 아니다** — 영농·가업은 「과세가액에 산입」이라 누진 차액을 구하지만,
 *    §48②는 「증여받은 것으로 보아」이므로 추징 가액 자체에 §56을 적용한다(PI-2).
 * 2. **이자상당액이 없다** — 영농 §18의3⑧·가업 §18의2⑤과 달리 §48②·상증령 §40에 규정이
 *    없다. 근거 없이 가산하지 않는다(PI-3).
 */

import { describe, it, expect } from "vitest";
import { calcPublicInterestPostMgmt } from "@/lib/tax-engine/deductions/public-interest-post-mgmt";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";
import type { PublicInterestPostMgmtInput } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

const DONATED = 2_000_000_000;

function mk(over: Partial<PublicInterestPostMgmtInput> = {}): PublicInterestPostMgmtInput {
  return {
    donatedValue: DONATED,
    donationDate: "2021-03-01",
    assessmentDate: "2025-06-30",
    violation: "unused_within_3y",
    violatedValue: 800_000_000,
    ...over,
  };
}

describe("PI-1 — 3년 경계 판정 (§48②1호)", () => {
  it("출연일 + 3년이 기한이다", () => {
    const r = calcPublicInterestPostMgmt(mk());
    expect(r.threeYearDeadline).toBe("2024-03-01");
    expect(r.isAfterThreeYears).toBe(true);
  });

  it("판정일이 3년 이내면 아직 확정되지 않았다는 경고가 붙는다", () => {
    const r = calcPublicInterestPostMgmt(mk({ assessmentDate: "2023-01-01" }));
    expect(r.isAfterThreeYears).toBe(false);
    expect(r.warnings.some((w) => w.includes("3년 이내"))).toBe(true);
  });
});

describe("PI-2 — 「증여받은 것으로 보아」 독립 계산 (marginal 아님)", () => {
  it("추징 증여세 = 추징 대상 가액에 §56 누진세율을 그대로 적용한 값", () => {
    const r = calcPublicInterestPostMgmt(mk({ violatedValue: 800_000_000 }));
    expect(r.clawbackBase).toBe(800_000_000);
    expect(r.taxBase).toBe(800_000_000);
    // 공익법인은 §53 증여재산공제 대상이 아니므로 과세가액 = 과세표준.
    expect(r.giftTax).toBe(calcInheritanceGiftTax(800_000_000));
  });

  it("🔑 출연가액이 아니라 **위반 가액**이 과세표준이다", () => {
    // 20억을 출연받았어도 8억만 미사용이면 8억이 대상이다(상증령 §40①1호 나목).
    const r = calcPublicInterestPostMgmt(mk({ violatedValue: 800_000_000 }));
    expect(r.taxBase).not.toBe(DONATED);
    expect(r.taxBase).toBe(800_000_000);
  });

  it("위반 가액이 출연가액을 넘으면 출연가액으로 제한된다", () => {
    const r = calcPublicInterestPostMgmt(mk({ violatedValue: DONATED + 1_000_000_000 }));
    expect(r.clawbackBase).toBe(DONATED);
    expect(r.warnings.some((w) => w.includes("초과"))).toBe(true);
  });
});

describe("PI-3 — 이자상당액을 가산하지 않는다", () => {
  it("결과에 이자 항목이 없고 세액이 §56 산출액과 정확히 같다", () => {
    const r = calcPublicInterestPostMgmt(mk({ violatedValue: 500_000_000 }));
    expect(r.giftTax).toBe(calcInheritanceGiftTax(500_000_000));
    // 근거 없는 가산 금지 — 안내로도 그 사실을 남긴다.
    expect(r.warnings.some((w) => w.includes("이자상당액"))).toBe(true);
  });
});

describe("PI-4 — §48②1호 **단서**는 3요건을 모두 갖춰야 한다", () => {
  const base = mk({ violatedValue: 800_000_000 });

  it("보고 + 1년 이내 사용 → 추징 제외", () => {
    const r = calcPublicInterestPostMgmt({
      ...base,
      justifiedException: {
        reported: true,
        reasonEndDate: "2024-06-01",
        usedDate: "2025-05-31",
      },
    });
    expect(r.isClawback).toBe(false);
    expect(r.clawbackBase).toBe(0);
    expect(r.giftTax).toBe(0);
    expect(r.exemptReason).toMatch(/단서/);
  });

  it("❌ 보고를 안 했으면 제외되지 않는다 (「사용만 했다」는 사유가 아니다)", () => {
    const r = calcPublicInterestPostMgmt({
      ...base,
      justifiedException: {
        reported: false,
        reasonEndDate: "2024-06-01",
        usedDate: "2024-07-01",
      },
    });
    expect(r.isClawback).toBe(true);
    expect(r.giftTax).toBeGreaterThan(0);
  });

  it("❌ 1년을 넘겨 사용했으면 제외되지 않는다", () => {
    const r = calcPublicInterestPostMgmt({
      ...base,
      justifiedException: {
        reported: true,
        reasonEndDate: "2024-06-01",
        usedDate: "2025-06-02", // 1년 + 1일
      },
    });
    expect(r.isClawback).toBe(true);
  });

  it("❌ 보고만 하고 사용하지 않았으면 제외되지 않는다", () => {
    const r = calcPublicInterestPostMgmt({
      ...base,
      justifiedException: { reported: true, reasonEndDate: "2024-06-01" },
    });
    expect(r.isClawback).toBe(true);
  });

  it("경계 — 사유 소멸일부터 정확히 1년째 사용은 제외된다(「1년 이내」)", () => {
    const r = calcPublicInterestPostMgmt({
      ...base,
      justifiedException: {
        reported: true,
        reasonEndDate: "2024-06-01",
        usedDate: "2025-06-01",
      },
    });
    expect(r.isClawback).toBe(false);
  });
});

describe("PI-5 — 위반 유형별 라벨이 상증령 §40①1호 각 목과 대응한다", () => {
  it.each([
    ["used_outside_purpose", /가목/],
    ["unused_within_3y", /나목/],
    ["discontinued_after_3y", /다목/],
  ] as const)("%s → %s", (violation, pattern) => {
    const r = calcPublicInterestPostMgmt(mk({ violation }));
    expect(r.steps[0].formula).toMatch(pattern);
  });
});
