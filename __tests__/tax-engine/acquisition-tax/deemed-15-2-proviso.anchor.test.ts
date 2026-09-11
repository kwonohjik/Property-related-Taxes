/**
 * 간주취득 세율 §15② 본문·단서 anchor — [AT-D15]
 *
 * 「지방세법」 §15②(MST 282559, 시행 2026-01-01):
 * > 다음 각 호의 어느 하나에 해당하는 취득에 대한 취득세는 **중과기준세율을 적용**하여 계산한
 * > 금액을 그 세액으로 한다. **다만, 취득물건이 제13조제1항에 해당하는 경우에는 중과기준세율의
 * > 100분의 300을, 같은 조 제5항에 해당하는 경우에는 중과기준세율의 100분의 500을 각각 적용한다.**
 * > 1. 개수로 인한 취득 … 2. §7④ … 토지의 가액 증가 … 3. §7⑤ 과점주주의 취득 …
 *
 * ## §1 — 본문/단서 세율을 3유형 모두에 고정한다
 *
 * ⚠️ **이 절은 pre-Do red 가 아니다.** 변경 전에도 통과했다 — `assessSurcharge`의 §13⑤ 분기가
 *    대수적으로 같은 수를 냈기 때문이다:
 *      `중과기준세율 + 중과기준세율×400%` (§13⑤) `= 중과기준세율×500%` (§15② 단서)
 *    간주취득에서는 `basicRate`가 곧 중과기준세율이라 두 식이 항등이다.
 *    ⇒ 이 절의 역할은 **그 항등을 고정**하는 것이다. §13⑤ 산식이나 간주취득 basicRate 중
 *    한쪽이 바뀌면 여기가 red 가 되어 「우연히 맞던 것」이 조용히 어긋나지 않는다.
 *
 * ## §2 — 버킷(물건별 구분)은 새 경로다 (변경 전 red)
 *
 * §15② 단서의 기준이 「취득**물건이**」라 물건마다 갈린다. 조심 1998-0634이 골프장 안
 * 부동산 중 수영장만 중과 대상으로 보고 테니스장·게이트볼장·골프연습장을 제외해 경정했다.
 *
 * ## §3 — 역방향 가드
 *
 * 단서에 **없는** §13②를 켜도 2%여야 한다. 이 짝이 없으면 §1이 「10%가 나온다」만 말하고
 * 「10%가 **아무 때나** 나오지는 않는다」를 말하지 못한다.
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { deemedProvisoRate } from "@/lib/tax-engine/acquisition-deemed-proviso";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

const BASE = 1_000_000_000;

function majorShareholder(extra: Record<string, unknown> = {}, ms: Record<string, unknown> = {}) {
  return calcAcquisitionTax({
    propertyType: "land",
    acquisitionCause: "deemed_major_shareholder",
    reportedPrice: 0,
    standardValue: 0,
    acquiredBy: "individual",
    balancePaymentDate: "2025-06-01",
    deemedInput: {
      majorShareholder: {
        corporateAssetValue: BASE,
        prevShareRatio: 0,
        newShareRatio: 1,
        isListed: false,
        ...ms,
      },
    },
    ...extra,
  } as unknown as AcquisitionTaxInput);
}

function landCategory(extra: Record<string, unknown> = {}) {
  return calcAcquisitionTax({
    propertyType: "land",
    acquisitionCause: "deemed_land_category",
    reportedPrice: 0,
    standardValue: 0,
    acquiredBy: "individual",
    balancePaymentDate: "2025-06-01",
    deemedInput: {
      landCategory: {
        prevCategory: "임야",
        newCategory: "체육용지",
        prevStandardValue: 500_000_000,
        newStandardValue: 1_500_000_000,
      },
    },
    ...extra,
  } as unknown as AcquisitionTaxInput);
}

function renovation(extra: Record<string, unknown> = {}) {
  return calcAcquisitionTax({
    propertyType: "building",
    acquisitionCause: "deemed_renovation",
    reportedPrice: 0,
    standardValue: 0,
    acquiredBy: "individual",
    balancePaymentDate: "2025-06-01",
    deemedInput: {
      renovation: {
        renovationType: "structural_change",
        prevStandardValue: 500_000_000,
        newStandardValue: 1_500_000_000,
      },
    },
    ...extra,
  } as unknown as AcquisitionTaxInput);
}

const LUXURY = { isLuxuryProperty: true, luxuryType: "golf_course" };

// ============================================================
// §1 본문/단서 세율 — 3유형 (항등 고정)
// ============================================================

describe("[AT-D15] §1 간주취득 세율 — §15② 본문 2% / 단서 10%", () => {
  it("[AT-D15-01] 과점주주 — 본문 2%, 단서(§13⑤) 10%", () => {
    expect(majorShareholder().appliedRate).toBe(0.02);
    expect(majorShareholder().acquisitionTax).toBe(20_000_000);
    expect(majorShareholder(LUXURY).appliedRate).toBe(0.1);
    expect(majorShareholder(LUXURY).acquisitionTax).toBe(100_000_000);
  });

  it("[AT-D15-02] 지목변경 — 본문 2%, 단서 10% (과세표준 10억 = 15억 − 5억)", () => {
    expect(landCategory().taxBase).toBe(BASE);
    expect(landCategory().appliedRate).toBe(0.02);
    expect(landCategory(LUXURY).appliedRate).toBe(0.1);
    expect(landCategory(LUXURY).acquisitionTax).toBe(100_000_000);
  });

  it("[AT-D15-03] 개수 — §15②1호. 본문 2%, 단서 10%", () => {
    // 2.8%가 아니다 — 2.8%는 **면적이 증가하는** 개수의 증가분에만 §11③으로 붙는다.
    expect(renovation().appliedRate).toBe(0.02);
    expect(renovation(LUXURY).appliedRate).toBe(0.1);
  });

  it("[AT-D15-04] 단서 세율은 중과기준세율 × 500%다 (leaf 항등)", () => {
    expect(deemedProvisoRate("none")).toBe(0.02);
    expect(deemedProvisoRate("luxury")).toBe(0.1);
    expect(deemedProvisoRate("luxury")).toBe(deemedProvisoRate("none") * 5);
  });

  it("[AT-D15-05] 세율 근거는 §15②다 — §7(납세의무 근거)이 아니다", () => {
    expect(majorShareholder().deemedDetail?.rateLegalBasis).toBe("지방세법 §15②");
    expect(majorShareholder(LUXURY).deemedDetail?.rateLegalBasis).toBe("지방세법 §15② 단서");
    expect(landCategory(LUXURY).deemedDetail?.rateLegalBasis).toBe("지방세법 §15② 단서");
    expect(renovation().deemedDetail?.rateLegalBasis).toBe("지방세법 §15②");
  });

  it("[AT-D15-06] 지방교육세는 0 — §151①1 본문 괄호(§15② 해당분 제외)", () => {
    expect(majorShareholder().localEducationTax).toBe(0);
    expect(majorShareholder(LUXURY).localEducationTax).toBe(0);
    expect(landCategory(LUXURY).localEducationTax).toBe(0);
    expect(renovation(LUXURY).localEducationTax).toBe(0);
  });
});

// ============================================================
// §2 버킷 — 물건별 구분 (§15② 단서 「취득물건이」)
// ============================================================

describe("[AT-D15] §2 과점주주 물건별 구분 — §15② 단서", () => {
  const MIXED = {
    assetBuckets: [
      { label: "회원제 골프장 구분등록 토지", bookValue: 3_000_000_000, proviso: "luxury", luxuryType: "golf_course" },
      { label: "일반 사업용 토지", bookValue: 7_000_000_000, proviso: "none" },
    ],
  };

  it("[AT-D15-10] 골프장 30억 + 일반 70억 (지분 100%) → 3억 + 1.4억 = 4억 4,000만", () => {
    const r = majorShareholder({}, MIXED);
    expect(r.taxBase).toBe(10_000_000_000);
    expect(r.acquisitionTax).toBe(440_000_000);
    // ★ 「전부 10%」(10억)도 「전부 2%」(2억)도 아니다 — 단일 세율로는 둘 다 틀린다
    expect(r.acquisitionTax).not.toBe(1_000_000_000);
    expect(r.acquisitionTax).not.toBe(200_000_000);
  });

  it("[AT-D15-11] 버킷별 내역이 결과에 실린다 (세율·세액 포함)", () => {
    const b = majorShareholder({}, MIXED).deemedDetail?.buckets ?? [];
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ proviso: "luxury", taxBase: 3_000_000_000, rate: 0.1, tax: 300_000_000 });
    expect(b[1]).toMatchObject({ proviso: "none", taxBase: 7_000_000_000, rate: 0.02, tax: 140_000_000 });
  });

  it("[AT-D15-12] 총가액은 버킷 합계가 단일 진실 — 호출부가 보낸 값으로 덮지 않는다", () => {
    // corporateAssetValue를 엉뚱한 값으로 보내도 버킷 합계(100억)가 이긴다
    const r = majorShareholder({}, { ...MIXED, corporateAssetValue: 1 });
    expect(r.deemedDetail?.corporateAssetValue).toBe(10_000_000_000);
    expect(r.acquisitionTax).toBe(440_000_000);
  });

  it("[AT-D15-13] 농특세도 버킷별로 낸다 — 사치성 1.0% + 일반 0.2%", () => {
    // 버킷1: floor(30억 × 10%) × 10% = 30,000,000 / 버킷2: floor(70억 × 2%) × 10% = 14,000,000
    expect(majorShareholder({}, MIXED).ruralSpecialTax).toBe(44_000_000);
    expect(majorShareholder({}, MIXED).localEducationTax).toBe(0);
  });

  it("[AT-D15-14] 최초 과점주주 지분율이 버킷에도 적용된다 (취득 후 전체 60%)", () => {
    const r = majorShareholder({}, {
      prevShareRatio: 0.3,
      newShareRatio: 0.6,
      assetBuckets: [{ bookValue: 10_000_000_000, proviso: "none" }],
    });
    // 최초 과점주주 → 증가분 30%가 아니라 취득 후 전체 60%
    expect(r.deemedDetail?.taxableRatio).toBe(0.6);
    expect(r.taxBase).toBe(6_000_000_000);
    expect(r.acquisitionTax).toBe(120_000_000);
  });

  it("[AT-D15-15] 두 경로는 같은 수에 착지한다 — 버킷 1건 ≡ 버킷 미사용", () => {
    const single = majorShareholder();
    const bucket = majorShareholder({}, { assetBuckets: [{ bookValue: BASE, proviso: "none" }] });
    expect(bucket.acquisitionTax).toBe(single.acquisitionTax);
    expect(bucket.ruralSpecialTax).toBe(single.ruralSpecialTax);

    const singleLux = majorShareholder(LUXURY);
    const bucketLux = majorShareholder({}, {
      assetBuckets: [{ bookValue: BASE, proviso: "luxury", luxuryType: "golf_course" }],
    });
    expect(bucketLux.acquisitionTax).toBe(singleLux.acquisitionTax);
    expect(bucketLux.ruralSpecialTax).toBe(singleLux.ruralSpecialTax);
  });

  it("[AT-D15-16] 버킷은 안분 조각이 아니다 — 물건마다 따로 **floor** 한다", () => {
    /**
     * 지분 1/3, 장부가액 2원짜리 3건. 세 구현이 **모두 다른 수**를 낸다:
     *   · 버킷별 floor  (현행): floor(2 × 1/3) = 0 씩 → 합 **0**
     *   · 버킷별 round  (오구현): round(0.666…) = 1 씩 → 합 3
     *   · 총액 1회 floor(오구현): floor(6 × 1/3) = 2
     * ⚠️ 처음엔 장부가액 1원으로 썼는데 floor·round가 **둘 다 0**이라 구별력이 0이었다
     *    (뮤테이션 실측 0 failed). 수를 2원으로 바꿔 세 구현을 갈랐다.
     *
     * 잔액 흡수(`residualArea` 류)를 **하지 않는** 것이 옳다 — 버킷은 안분 조각이 아니라
     * 서로 다른 세율을 받는 **별개 물건**이라, 잔액을 옮기면 세율이 다른 칸으로 금액이 간다.
     */
    const r = majorShareholder({}, {
      prevShareRatio: 0.6,
      newShareRatio: 0.6 + 1 / 3,
      assetBuckets: [
        { bookValue: 2, proviso: "none" },
        { bookValue: 2, proviso: "none" },
        { bookValue: 2, proviso: "none" },
      ],
    });
    expect(r.deemedDetail?.buckets?.map((b) => b.taxBase)).toEqual([0, 0, 0]);
    expect(r.taxBase).toBe(0);
    expect(r.taxBase).not.toBe(3); // 버킷별 round 였다면
    expect(r.taxBase).not.toBe(2); // 총액 1회 floor 였다면
  });
});

// ============================================================
// §3 역방향 가드 — 단서에 없는 것은 올리지 않는다
// ============================================================

describe("[AT-D15] §3 역방향 가드", () => {
  it("[AT-D15-20] §13②(대도시 법인)는 §15② 단서에 **없다** → 2% 유지", () => {
    const r = majorShareholder({
      acquiredBy: "corporation",
      isCorpMetroSurcharge: true,
      isWithin5YearsOfEstablishment: true,
      isMetropolitanCongestion: true,
    });
    expect(r.appliedRate).toBe(0.02);
    expect(r.acquisitionTax).toBe(20_000_000);
    expect(r.deemedDetail?.rateLegalBasis).toBe("지방세법 §15②");
  });

  it("[AT-D15-21] 사치성을 켜지 않으면 어떤 유형도 10%가 되지 않는다", () => {
    expect(majorShareholder().appliedRate).not.toBe(0.1);
    expect(landCategory().appliedRate).not.toBe(0.1);
    expect(renovation().appliedRate).not.toBe(0.1);
  });

  it("[AT-D15-22] 별장은 2023-03-14 이후 중과 폐지 — 켜도 2%, 근거도 본문", () => {
    const villa = { isLuxuryProperty: true, luxuryType: "villa" };
    const after = landCategory({ ...villa, balancePaymentDate: "2025-06-01" });
    expect(after.appliedRate).toBe(0.02);
    // ★ 근거는 **실제 세율**에서 역산한다 — 플래그로 판정했다면 여기서 「단서」로 드리프트한다
    expect(after.deemedDetail?.rateLegalBasis).toBe("지방세법 §15②");
  });
});
