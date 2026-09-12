/**
 * 과점주주 §13① 버킷 — ④ 변환 · ⑧ validation · ⑫ Zod · ⑥ 사이드바 anchor [AT-HQ-API]
 *
 * §13①은 **과점주주 물건별 버킷으로만** 도달한다. 그 경로가 5단(폼 → ④ → Zod → Route →
 * 엔진) 어디에서도 끊기지 않는지 고정한다.
 *
 * 🔴 **⑫가 가장 위험한 자리였다.** 종전 Zod는 `z.enum(["none","luxury"])`를 **손으로** 적어
 *    두고 「엔진과 같은 값 집합이어야 한다」는 주석으로만 묶여 있었다. 엔진만 넓히면 Zod가
 *    `hq_factory`를 **조용히 strip** 한다 — 화면에서 6%를 골랐는데 엔진에는 2%가 도착한다.
 *    ⇒ `DEEMED_PROVISO_VALUES`를 그대로 `z.enum`에 넣어 손 동기화 자리를 없앴다.
 *
 * ⚠️ §13①은 **법인 중과 플래그(`isHeadquarterNewBuild` 등)와 다른 경로**다. 그 플래그들은
 *    간주취득에서 ④가 통째로 strip 하며(PR #1607 — Step 4 미도달 stale 누수), 이번 변경도
 *    그 차단을 건드리지 않는다. §4가 그 분리를 고정한다.
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
    deemedMajorUseBuckets: true,
    ...patch,
  };
}

const HQ_ROWS: FormState["deemedMajorAssetBuckets"] = [
  { id: "a", label: "본점 사옥", bookValue: "300000000", proviso: "hq_factory", luxuryType: "" },
  { id: "b", label: "임대용 토지", bookValue: "700000000", proviso: "none", luxuryType: "" },
];

type Body = {
  deemedInput: { majorShareholder: { assetBuckets: Record<string, unknown>[] } };
  isHeadquarterNewBuild?: boolean;
  isMetropolitanCongestion?: boolean;
};

describe("[AT-HQ-API] §1 ④ 변환", () => {
  it("[AT-HQ-API-01] hq_factory 행이 그대로 실려 간다 · luxuryType은 붙지 않는다", () => {
    const body = buildAcquisitionTaxBody(
      form({ deemedMajorAssetBuckets: HQ_ROWS }),
    ) as unknown as Body;
    expect(body.deemedInput.majorShareholder.assetBuckets).toEqual([
      { label: "본점 사옥", bookValue: 300_000_000, proviso: "hq_factory" },
      { label: "임대용 토지", bookValue: 700_000_000, proviso: "none" },
    ]);
  });
});

describe("[AT-HQ-API] §2 ⑫ Zod — strip 되지 않는다", () => {
  it("[AT-HQ-API-10] hq_factory 를 통과시킨다", () => {
    const body = buildAcquisitionTaxBody(form({ deemedMajorAssetBuckets: HQ_ROWS }));
    const parsed = acquisitionTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it("[AT-HQ-API-11] 파싱 결과에 hq_factory 가 **남아 있다** — 통과만으로는 부족하다", () => {
    const body = buildAcquisitionTaxBody(form({ deemedMajorAssetBuckets: HQ_ROWS }));
    const parsed = acquisitionTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const rows = parsed.data.deemedInput?.majorShareholder?.assetBuckets ?? [];
    expect(rows.map((r) => r.proviso)).toEqual(["hq_factory", "none"]);
  });

  it("[AT-HQ-API-12] 〔역방향〕 값 집합 밖은 여전히 거부한다", () => {
    const parsed = acquisitionTaxInputSchema.safeParse({
      propertyType: "land",
      acquisitionCause: "deemed_major_shareholder",
      reportedPrice: 0,
      acquiredBy: "individual",
      deemedInput: {
        majorShareholder: {
          corporateAssetValue: 0,
          prevShareRatio: 0,
          newShareRatio: 1,
          isListed: false,
          assetBuckets: [{ bookValue: 1, proviso: "headquarters" }],
        },
      },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("[AT-HQ-API] §3 ⑧ validation · ⑥ 사이드바", () => {
  it("[AT-HQ-API-20] hq_factory 행에 사치성 유형을 요구하지 않는다", () => {
    expect(validateStep(1, form({ deemedMajorAssetBuckets: HQ_ROWS }))).toBeNull();
  });

  it("[AT-HQ-API-21] 〔역방향〕 luxury 행은 여전히 유형이 필수다", () => {
    expect(
      validateStep(
        1,
        form({
          deemedMajorAssetBuckets: [
            { id: "x", label: "", bookValue: "100000000", proviso: "luxury", luxuryType: "" },
          ],
        }),
      ),
    ).toMatch(/사치성 유형/);
  });

  it("[AT-HQ-API-22] 사이드바 합계가 6%를 반영한다 — 1,800만 + 1,400만", () => {
    const s = computeAcquisitionSummary(form({ deemedMajorAssetBuckets: HQ_ROWS }));
    expect(s.deemedTax).toBe(18_000_000 + 14_000_000);
  });
});

describe("[AT-HQ-API] §4 법인 중과 플래그 차단은 그대로다 (PR #1607)", () => {
  it("[AT-HQ-API-30] §13① 버킷을 써도 isHeadquarterNewBuild 는 전송되지 않는다", () => {
    const body = buildAcquisitionTaxBody(
      form({
        deemedMajorAssetBuckets: HQ_ROWS,
        isHeadquarterNewBuild: true,
        isMetropolitanCongestion: true,
      }),
    ) as unknown as Body;
    expect(body.isHeadquarterNewBuild).toBeUndefined();
    expect(body.isMetropolitanCongestion).toBeUndefined();
  });
});
