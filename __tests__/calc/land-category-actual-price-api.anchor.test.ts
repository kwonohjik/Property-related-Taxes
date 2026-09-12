/**
 * 지목변경 과세표준 §10의6① 본칙 — ④ 변환 · ⑧ validation · ⑫ Zod · ⑥ 사이드바 anchor [AT-LC-API]
 *
 * 축은 **하나**다: 「사실상취득가격을 확인할 수 있는가」.
 * - 확인 가능(본칙) → `actualPrice`만 보낸다. 시가표준액은 **보내지 않는다**.
 * - 확인 불가(보충, 기본값) → 종전대로 시가표준액 2칸만 보낸다.
 *
 * ⚠️ **역방향 짝을 반드시 함께 둔다.** 「본칙이면 시가표준액을 요구하지 않는다」만 있으면
 *    「보충이면 여전히 요구한다」가 깨져도 red 가 되지 않는다
 *    (`feedback_negative_anchor_needs_positive_twin`).
 */

import { describe, it, expect } from "vitest";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { INITIAL_FORM, validateStep, type FormState } from "@/components/calc/acquisition/shared";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { computeAcquisitionSummary } from "@/components/calc/acquisition/AcquisitionSidebar";

const PREV_SV = "100000000";
const NEW_SV = "250000000";
const SV_DIFF = 150_000_000;
const ACTUAL = "300000000";

function form(patch: Partial<FormState>): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "land",
    acquisitionCause: "deemed_land_category",
    acquiredBy: "individual",
    deemedLandPrevCategory: "전",
    deemedLandNewCategory: "대",
    ...patch,
  };
}

type LandBody = {
  deemedInput: {
    landCategory: {
      actualPrice?: number;
      prevStandardValue?: number;
      newStandardValue?: number;
    };
  };
};

describe("[AT-LC-API] §1 ④ 변환 — 한쪽만 보낸다", () => {
  it("[AT-LC-API-01] 본칙 ON: actualPrice 전송 · 시가표준액 **미전송**", () => {
    const body = buildAcquisitionTaxBody(
      form({
        deemedLandActualPriceKnown: true,
        deemedLandActualPrice: ACTUAL,
        // 종전 입력이 남아 있어도 보내지 않는다 (stale 누수 방지)
        deemedLandPrevStandardValue: PREV_SV,
        deemedLandNewStandardValue: NEW_SV,
      }),
    ) as unknown as LandBody;
    const lc = body.deemedInput.landCategory;
    expect(lc.actualPrice).toBe(300_000_000);
    expect(lc.prevStandardValue).toBeUndefined();
    expect(lc.newStandardValue).toBeUndefined();
  });

  it("[AT-LC-API-02] 본칙 OFF(기본값): 종전대로 시가표준액 전송 · actualPrice 미전송", () => {
    const body = buildAcquisitionTaxBody(
      form({
        deemedLandPrevStandardValue: PREV_SV,
        deemedLandNewStandardValue: NEW_SV,
        // 켰다 끈 뒤 남은 값이 새어나가면 안 된다
        deemedLandActualPrice: ACTUAL,
      }),
    ) as unknown as LandBody;
    const lc = body.deemedInput.landCategory;
    expect(lc.actualPrice).toBeUndefined();
    expect(lc.prevStandardValue).toBe(100_000_000);
    expect(lc.newStandardValue).toBe(250_000_000);
  });
});

describe("[AT-LC-API] §2 ⑫ Zod", () => {
  it("[AT-LC-API-10] 본칙 body를 통과시킨다 (시가표준액 없이)", () => {
    const body = buildAcquisitionTaxBody(
      form({ deemedLandActualPriceKnown: true, deemedLandActualPrice: ACTUAL }),
    );
    const parsed = acquisitionTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it("[AT-LC-API-11] 보충 body를 통과시킨다 (actualPrice 없이)", () => {
    const body = buildAcquisitionTaxBody(
      form({ deemedLandPrevStandardValue: PREV_SV, deemedLandNewStandardValue: NEW_SV }),
    );
    expect(acquisitionTaxInputSchema.safeParse(body).success).toBe(true);
  });

  it("[AT-LC-API-12] 둘 다 없는 landCategory는 거부한다 — 조용히 0원 과세 금지", () => {
    const parsed = acquisitionTaxInputSchema.safeParse({
      propertyType: "land",
      acquisitionCause: "deemed_land_category",
      reportedPrice: 0,
      acquiredBy: "individual",
      deemedInput: { landCategory: { prevCategory: "전", newCategory: "대" } },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("[AT-LC-API] §3 ⑧ validation", () => {
  it("[AT-LC-API-20] 본칙 ON + 금액 미입력 → 차단", () => {
    expect(validateStep(1, form({ deemedLandActualPriceKnown: true }))).toMatch(/사실상취득가격/);
  });

  it("[AT-LC-API-21] 본칙 ON이면 시가표준액이 없어도 통과한다", () => {
    expect(
      validateStep(1, form({ deemedLandActualPriceKnown: true, deemedLandActualPrice: ACTUAL })),
    ).toBeNull();
  });

  it("[AT-LC-API-22] 〔역방향〕 본칙 OFF면 시가표준액은 여전히 필수다", () => {
    expect(validateStep(1, form({ deemedLandPrevStandardValue: PREV_SV }))).toMatch(
      /변경 후 시가표준액/,
    );
  });

  it("[AT-LC-API-23] 〔역방향〕 본칙 OFF + 시가표준액 2칸 → 통과 (종전 동작)", () => {
    expect(
      validateStep(
        1,
        form({ deemedLandPrevStandardValue: PREV_SV, deemedLandNewStandardValue: NEW_SV }),
      ),
    ).toBeNull();
  });
});

describe("[AT-LC-API] §4 ⑥ 사이드바", () => {
  it("[AT-LC-API-30] 본칙 ON: 과세표준은 사실상취득가격 (차액 아님)", () => {
    const s = computeAcquisitionSummary(
      form({
        deemedLandActualPriceKnown: true,
        deemedLandActualPrice: ACTUAL,
        deemedLandPrevStandardValue: PREV_SV,
        deemedLandNewStandardValue: NEW_SV,
      }),
    );
    expect(s.deemedTaxBase).toBe(300_000_000);
    expect(s.deemedTaxBase).not.toBe(SV_DIFF);
  });

  it("[AT-LC-API-31] 〔역방향〕 본칙 OFF: 종전대로 차액", () => {
    const s = computeAcquisitionSummary(
      form({ deemedLandPrevStandardValue: PREV_SV, deemedLandNewStandardValue: NEW_SV }),
    );
    expect(s.deemedTaxBase).toBe(SV_DIFF);
  });
});
