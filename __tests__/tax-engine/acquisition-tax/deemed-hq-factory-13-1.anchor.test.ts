/**
 * 과점주주 간주취득 × §13①(본점·공장) — §15② 단서 ×300% anchor [AT-HQ]
 *
 * 「지방세법」 §15② 단서(MST 282559):
 * > 다만, 취득물건이 **제13조제1항**에 해당하는 경우에는 **중과기준세율의 100분의 300**을,
 * > 같은 조 제5항에 해당하는 경우에는 중과기준세율의 100분의 500을 각각 적용한다.
 *
 * ## 왜 이제야 여는가 — 계획서 U-1이 닫혔다
 *
 * §13①은 「신축하거나 증축하는」·「공장을 신설하거나 증설하기 위하여」라는 **행위** 요건이라
 * 「취득**물건이** 해당하는가」로 옮기는 근거가 없었다. **조세심판원 재결례가 그 답을 준다**:
 *
 * - **조심 1998-0145**(1998.03.25 · **기각 = 중과 적법**) — 법인이 **1993.11.2. 이미
 *   중과세율로 신고납부한** 본점 사업용 부동산을, 과점주주가 된 자가 취득한 것으로 보아
 *   **중과세한 처분은 적법**. 전체 중 **본점 사업용 부분만** 골라 장부가액 × 지분율로 과세.
 * - **조심 1999-0026**(1999.01.27 · 기각) 같은 취지.
 * - **조심2011지0312**(2012.06.04) — 판정 기준은 「**사실상 법인의 본점으로서 기능을 수행하는
 *   장소로 사용되는지**」.
 *
 * ⚠️ 앞 두 건은 **구 지방세법**(§105⑥·§112③) 기준이라 세율 산식이 다르다. 다만 현행은
 *    §15② 단서에 §13①이 **명문**이므로 근거가 더 강하다.
 *
 * ## §1 — 6%가 나온다 〔변경 전 red〕
 * ## §2 — 물건별로 갈린다 (재결례가 「부분만」 골랐다)
 * ## §3 — 농특세는 §5⑤ 항등을 지킨다
 *
 * 🔴 `isSurcharged`를 `=== "luxury"`로 좁히면 §13① 버킷의 농특세가 0.6%가 아니라 **0.2%로
 *    조용히 과소**된다. 취득세만 보는 anchor는 이것을 못 잡으므로 §3을 따로 둔다.
 *
 * ## §4 — 지목변경·개수에는 열리지 않는다 (역방향 가드)
 *
 * 그 두 유형에는 직접 자료가 없어 **의도적으로 닫아 뒀다**. 이 짝이 없으면 누군가
 * `provisoFromLuxuryFlag`를 3값으로 넓혀도 red 가 되지 않는다.
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import {
  deemedProvisoRate,
  deemedRateLegalBasis,
  provisoFromLuxuryFlag,
  DEEMED_PROVISO_VALUES,
} from "@/lib/tax-engine/acquisition-deemed-proviso";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

const BOOK = 1_000_000_000; // 장부가액 10억

function majorShareholder(buckets: Record<string, unknown>[]) {
  return calcAcquisitionTax({
    propertyType: "land",
    acquisitionCause: "deemed_major_shareholder",
    reportedPrice: 0,
    standardValue: 0,
    acquiredBy: "individual",
    balancePaymentDate: "2025-06-01",
    deemedInput: {
      majorShareholder: {
        corporateAssetValue: BOOK,
        prevShareRatio: 0,
        newShareRatio: 1, // 지분 100% → 과세 지분율 1
        isListed: false,
        assetBuckets: buckets,
      },
    },
  } as unknown as AcquisitionTaxInput);
}

describe("[AT-HQ] §1 §13① 버킷 → 중과기준세율 × 300% = 6%", () => {
  it("[AT-HQ-01] leaf 세율 — 2% × 3", () => {
    expect(deemedProvisoRate("hq_factory")).toBeCloseTo(0.06, 10);
    expect(deemedProvisoRate("hq_factory")).toBeCloseTo(deemedProvisoRate("none") * 3, 10);
  });

  it("[AT-HQ-02] 근거는 §15② **단서**다 (본문 아님)", () => {
    expect(deemedRateLegalBasis("hq_factory")).toBe(ACQUISITION.DEEMED_RATE_PROVISO);
    expect(deemedRateLegalBasis("hq_factory")).not.toBe(ACQUISITION.DEEMED_RATE);
  });

  it("[AT-HQ-03] 세액 — 장부 10억 · 지분 100% → 6,000만", () => {
    const r = majorShareholder([{ label: "본점 신축 사옥", bookValue: BOOK, proviso: "hq_factory" }]);
    expect(r.acquisitionTax).toBe(60_000_000);
  });

  it("[AT-HQ-04] 〔대조군〕 같은 물건을 일반으로 두면 2,000만 — 세 값이 전부 다르다", () => {
    expect(majorShareholder([{ bookValue: BOOK, proviso: "none" }]).acquisitionTax).toBe(20_000_000);
    expect(
      majorShareholder([{ bookValue: BOOK, proviso: "luxury", luxuryType: "golf_course" }])
        .acquisitionTax,
    ).toBe(100_000_000);
  });
});

describe("[AT-HQ] §2 물건별로 갈린다 — 재결례가 「부분만」 골랐다", () => {
  it("[AT-HQ-10] 본점 3억(6%) + 일반 7억(2%) = 1,800만 + 1,400만 = 3,200만", () => {
    const r = majorShareholder([
      { label: "본점 사옥", bookValue: 300_000_000, proviso: "hq_factory" },
      { label: "임대용 토지", bookValue: 700_000_000, proviso: "none" },
    ]);
    expect(r.acquisitionTax).toBe(18_000_000 + 14_000_000);
    // 「전부 6%」(6,000만)도 「전부 2%」(2,000만)도 아니다 — 물건별 판정의 요지
    expect(r.acquisitionTax).not.toBe(60_000_000);
    expect(r.acquisitionTax).not.toBe(20_000_000);
  });

  it("[AT-HQ-11] 세 구분이 한 법인에 섞여도 각자 세율로 합산된다", () => {
    const r = majorShareholder([
      { bookValue: 200_000_000, proviso: "hq_factory" }, // 1,200만
      { bookValue: 300_000_000, proviso: "luxury", luxuryType: "golf_course" }, // 3,000만
      { bookValue: 500_000_000, proviso: "none" }, // 1,000만
    ]);
    expect(r.acquisitionTax).toBe(12_000_000 + 30_000_000 + 10_000_000);
  });
});

describe("[AT-HQ] §3 농특세 — 농특세법 §5⑤ 항등 유지", () => {
  it("[AT-HQ-20] §13① 버킷: 농특세 = 취득세액 × 10% (0.2%가 아니다)", () => {
    const r = majorShareholder([{ bookValue: BOOK, proviso: "hq_factory" }]);
    expect(r.acquisitionTax).toBe(60_000_000);
    expect(r.ruralSpecialTax).toBe(Math.floor(r.acquisitionTax * 0.1));
    expect(r.ruralSpecialTax).toBe(6_000_000);
    // 중과분을 안 얹으면 2% 기준 200만이 된다 — 그 과소 계산을 배제한다
    expect(r.ruralSpecialTax).not.toBe(2_000_000);
  });

  it("[AT-HQ-21] 〔대조군〕 일반 버킷은 0.2% 그대로", () => {
    const r = majorShareholder([{ bookValue: BOOK, proviso: "none" }]);
    expect(r.ruralSpecialTax).toBe(2_000_000);
    expect(r.ruralSpecialTax).toBe(Math.floor(r.acquisitionTax * 0.1));
  });

  it("[AT-HQ-22] 지방교육세는 여전히 0 (§151①1 본문 괄호)", () => {
    expect(majorShareholder([{ bookValue: BOOK, proviso: "hq_factory" }]).localEducationTax).toBe(0);
  });
});

describe("[AT-HQ] §4 〔역방향〕 지목변경·개수에는 열지 않는다", () => {
  it("[AT-HQ-30] 단일 물건 경로는 none/luxury 2값뿐 — 사치성 플래그로 §13①이 나오지 않는다", () => {
    expect(provisoFromLuxuryFlag(true)).toBe("luxury");
    expect(provisoFromLuxuryFlag(false)).toBe("none");
    expect(provisoFromLuxuryFlag(undefined)).toBe("none");
  });

  it("[AT-HQ-31] 지목변경은 사치성을 켜도 10%지 6%가 아니다", () => {
    const r = calcAcquisitionTax({
      propertyType: "land",
      acquisitionCause: "deemed_land_category",
      reportedPrice: 0,
      standardValue: 0,
      acquiredBy: "individual",
      balancePaymentDate: "2025-06-01",
      isLuxuryProperty: true,
      luxuryType: "golf_course",
      deemedInput: {
        landCategory: {
          prevCategory: "전",
          newCategory: "대",
          prevStandardValue: 0,
          newStandardValue: BOOK,
        },
      },
    } as unknown as AcquisitionTaxInput);
    expect(r.appliedRate).toBe(0.1);
    expect(r.appliedRate).not.toBe(0.06);
  });
});

describe("[AT-HQ] §5 ⑫ Zod가 같은 값 집합을 쓴다", () => {
  it("[AT-HQ-40] leaf 배열이 단일 소스다 — 세 값", () => {
    expect([...DEEMED_PROVISO_VALUES]).toEqual(["none", "hq_factory", "luxury"]);
  });
});
