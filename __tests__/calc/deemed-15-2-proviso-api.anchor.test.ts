/**
 * 간주취득 §15② 단서 — ④ API 변환 · ⑧ validation anchor [AT-D15-API]
 *
 * ## ④가 이미 열려 있었다는 것이 §2의 요지
 *
 * `buildAcquisitionTaxBody`는 종전에도 `isLuxuryProperty`를 **게이트 없이** 실어 보냈고
 * Zod(⑫)도 이미 받고 있었다. 막혀 있던 것은 ⑤(화면)뿐이었다 — 그래서 결함이
 * **양방향**이었다: 켤 수 없고(10%가 필요한데 2%), 끌 수도 없었다(매매에서 켠 값이 남아 10%).
 *
 * ## 물건별 구분 모드에서는 최상위 플래그를 strip 한다
 *
 * 버킷은 행마다 `proviso`를 들고 있다. 최상위 `isLuxuryProperty`가 함께 가면 §13⑤ 중과가
 * 버킷 세액 위에 **이중 적용**된다.
 */

import { describe, it, expect } from "vitest";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { INITIAL_FORM, validateStep, type FormState } from "@/components/calc/acquisition/shared";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { computeAcquisitionSummary } from "@/components/calc/acquisition/AcquisitionSidebar";

function form(patch: Partial<FormState>): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "land",
    acquisitionCause: "deemed_major_shareholder",
    acquiredBy: "individual",
    deemedMajorPrevShareRatio: "0",
    deemedMajorNewShareRatio: "100",
    ...patch,
  };
}

const BUCKETS: FormState["deemedMajorAssetBuckets"] = [
  { id: "a", label: "골프장", bookValue: "3000000000", proviso: "luxury", luxuryType: "golf_course" },
  { id: "b", label: "일반토지", bookValue: "7000000000", proviso: "none", luxuryType: "" },
];

describe("[AT-D15-API] §1 ④ 변환 — 버킷", () => {
  it("[AT-D15-API-01] 구분 모드: assetBuckets 전송 + isLuxuryProperty **strip**", () => {
    const body = buildAcquisitionTaxBody(
      form({ deemedMajorUseBuckets: true, deemedMajorAssetBuckets: BUCKETS, isLuxuryProperty: true, luxuryType: "golf_course" }),
    ) as Record<string, unknown>;
    expect(body.isLuxuryProperty).toBeUndefined();
    expect(body.luxuryType).toBeUndefined();
    const ms = (body.deemedInput as { majorShareholder: { assetBuckets: unknown[] } }).majorShareholder;
    expect(ms.assetBuckets).toEqual([
      { label: "골프장", bookValue: 3_000_000_000, proviso: "luxury", luxuryType: "golf_course" },
      { label: "일반토지", bookValue: 7_000_000_000, proviso: "none" },
    ]);
  });

  it("[AT-D15-API-02] 구분 모드 OFF: 종전대로 isLuxuryProperty 전송, 버킷 미전송", () => {
    const body = buildAcquisitionTaxBody(
      form({ deemedMajorCorporateAssetValue: "1000000000", isLuxuryProperty: true, luxuryType: "golf_course" }),
    ) as Record<string, unknown>;
    expect(body.isLuxuryProperty).toBe(true);
    expect(body.luxuryType).toBe("golf_course");
    const ms = (body.deemedInput as { majorShareholder: Record<string, unknown> }).majorShareholder;
    expect(ms.assetBuckets).toBeUndefined();
  });

  it("[AT-D15-API-03] 금액 0원 행은 보내지 않는다 (결과 카드 빈 행 방지)", () => {
    const body = buildAcquisitionTaxBody(
      form({
        deemedMajorUseBuckets: true,
        deemedMajorAssetBuckets: [
          ...BUCKETS,
          { id: "c", label: "빈 행", bookValue: "", proviso: "none", luxuryType: "" },
        ],
      }),
    ) as Record<string, unknown>;
    const ms = (body.deemedInput as { majorShareholder: { assetBuckets: unknown[] } }).majorShareholder;
    expect(ms.assetBuckets).toHaveLength(2);
  });

  it("[AT-D15-API-04] ⑫ Zod가 버킷을 strip 하지 않는다 (침묵 소실 방지)", () => {
    const body = buildAcquisitionTaxBody(
      form({ deemedMajorUseBuckets: true, deemedMajorAssetBuckets: BUCKETS }),
    );
    const parsed = acquisitionTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.deemedInput?.majorShareholder?.assetBuckets).toHaveLength(2);
  });

  it("[AT-D15-API-05] 지목변경·개수에서도 사치성이 그대로 전달된다", () => {
    for (const cause of ["deemed_land_category", "deemed_renovation"] as const) {
      const body = buildAcquisitionTaxBody(
        form({ acquisitionCause: cause, isLuxuryProperty: true, luxuryType: "golf_course" }),
      ) as Record<string, unknown>;
      expect(body.isLuxuryProperty).toBe(true);
      expect(body.luxuryType).toBe("golf_course");
    }
  });
});

describe("[AT-D15-API] §2 ⑧ validation", () => {
  it("[AT-D15-API-10] 구분 모드 — 행 0건이면 차단", () => {
    expect(validateStep(1, form({ deemedMajorUseBuckets: true, deemedMajorAssetBuckets: [] })))
      .toContain("물건을 1건 이상 추가하세요");
  });

  it("[AT-D15-API-11] 구분 모드 — 금액 미입력 행이 있으면 차단 (전수 입력 강제)", () => {
    const err = validateStep(1, form({
      deemedMajorUseBuckets: true,
      deemedMajorAssetBuckets: [
        BUCKETS![0],
        { id: "c", label: "", bookValue: "", proviso: "none", luxuryType: "" },
      ],
    }));
    expect(err).toContain("2번 물건의 장부상 가액");
  });

  it("[AT-D15-API-12] 구분 모드 — 사치성 행인데 유형 미선택이면 차단", () => {
    const err = validateStep(1, form({
      deemedMajorUseBuckets: true,
      deemedMajorAssetBuckets: [
        { id: "a", label: "", bookValue: "3000000000", proviso: "luxury", luxuryType: "" },
      ],
    }));
    expect(err).toContain("사치성 유형");
  });

  it("[AT-D15-API-13] 단일 모드 — 사치성 ON인데 유형 미선택이면 3유형 모두 차단", () => {
    for (const cause of [
      "deemed_major_shareholder",
      "deemed_land_category",
      "deemed_renovation",
    ] as const) {
      const f = form({
        acquisitionCause: cause,
        deemedMajorCorporateAssetValue: "1000000000",
        deemedLandPrevCategory: "임야",
        deemedLandNewCategory: "체육용지",
        deemedLandPrevStandardValue: "500000000",
        deemedLandNewStandardValue: "1500000000",
        deemedRenovationType: "structural_change",
        deemedRenovationPrevStandardValue: "500000000",
        deemedRenovationNewStandardValue: "1500000000",
        isLuxuryProperty: true,
        luxuryType: "",
      });
      expect(validateStep(1, f)).toContain("사치성 재산(§13⑤) 유형을 선택하세요");
    }
  });

  it("[AT-D15-API-14] 역방향 — 사치성 OFF면 유형이 비어도 통과한다", () => {
    expect(
      validateStep(1, form({ deemedMajorCorporateAssetValue: "1000000000", isLuxuryProperty: false })),
    ).toBeNull();
  });

  it("[AT-D15-API-15] 역방향 — 구분 모드에서는 단일 장부가액을 요구하지 않는다", () => {
    // ⑤가 그 칸을 감추므로 ⑧이 요구하면 빠져나갈 수 없는 막다른 길이 된다
    expect(
      validateStep(1, form({
        deemedMajorUseBuckets: true,
        deemedMajorAssetBuckets: BUCKETS,
        deemedMajorCorporateAssetValue: "",
      })),
    ).toBeNull();
  });
});

describe("[AT-D15-API] §3 ⑥ 사이드바 — 엔진과 같은 수를 보여준다", () => {
  it("[AT-D15-API-20] 🔴 최초 과점주주는 «취득 후 전체» 지분율이다 (증가분 아님)", () => {
    /**
     * 종전 사이드바는 `Math.max(0, newR − prevR)`를 손으로 적어 §7⑤의 「최초 과점주주는
     * 취득 후 지분율 전체」 규칙이 빠져 있었다. 30%→60%이면 엔진 60% vs 사이드바 30%로
     * **과세표준이 절반으로 표시**됐다. 이제 엔진 leaf(`assessMajorShareholder`)를 부른다.
     */
    const s = computeAcquisitionSummary(
      form({
        deemedMajorCorporateAssetValue: "1000000000",
        deemedMajorPrevShareRatio: "30",
        deemedMajorNewShareRatio: "60",
      }),
    );
    expect(s.deemedTaxBase).toBe(600_000_000);
    expect(s.deemedTaxBase).not.toBe(300_000_000); // 증가분 30%로 계산했다면
  });

  it("[AT-D15-API-21] 사치성을 켜면 사이드바 세율도 10%로 간다", () => {
    const base = {
      deemedMajorCorporateAssetValue: "1000000000",
      deemedMajorPrevShareRatio: "0",
      deemedMajorNewShareRatio: "100",
    };
    expect(computeAcquisitionSummary(form(base)).deemedRate).toBe(0.02);
    expect(
      computeAcquisitionSummary(form({ ...base, isLuxuryProperty: true, luxuryType: "golf_course" }))
        .deemedRate,
    ).toBe(0.1);
  });

  it("[AT-D15-API-22] 구분 모드 — 합계가 엔진 anchor(AT-D15-10)와 같다", () => {
    const s = computeAcquisitionSummary(
      form({ deemedMajorUseBuckets: true, deemedMajorAssetBuckets: BUCKETS }),
    );
    expect(s.deemedTaxBase).toBe(10_000_000_000);
    expect(s.deemedTax).toBe(440_000_000);
    expect(s.deemedRate).toBeUndefined(); // 단일 세율이 없다
  });
});
