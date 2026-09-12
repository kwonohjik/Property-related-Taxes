/**
 * 간주취득 농특세 §5⑤ · 세율 경합 §16⑤ — 근거 조문 anchor [AT-RST] · [AT-16-5]
 *
 * 두 건 다 **세액은 이미 맞고 근거만 미확정**이던 항목이다
 * (`acquisition-deemed-15-2-proviso.plan.md` §9.5 U-3 · 별건).
 * 실측으로 조문을 확정했으므로, 그 「맞음」이 우연이 아니라 조문의 귀결임을 고정한다.
 *
 * ## §1 [AT-RST] 간주취득 농특세 — 「농어촌특별세법」 §5⑤
 *
 * 계획서 U-3의 의문은 「§5①6호는 §11·§12의 **표준세율**을 2%로 적용한 취득세액을
 * 과세표준으로 하는데, §15② 취득에는 그 표준세율이 없다」였다. **§5⑤이 바로 그 경우를
 * 위한 규정이다**(MST 285905, 시행 2026-05-12):
 *
 * > ⑤ 제1항제6호에도 불구하고 「지방세법」 **제15조제2항에 해당하는 경우에는 같은 항에 따라
 * >   계산한 취득세액**을 제1항제6호의 과세표준으로 본다.
 *
 * ⇒ 간주취득의 농특세 = **(§15②로 계산한 취득세액) × 10%**.
 *
 * ⚠️ 코드는 §5⑤ 전용 분기를 두지 않고 §5①6호 경로(표준세율 2% 치환 + 중과분 보존)로
 *    계산하는데, 간주취득에서는 `basicRate`가 곧 중과기준세율이라 **두 식이 항등**이다:
 *      `2% + (적용세율 − 2%) = 적용세율`
 *    즉 지금 맞는 것은 **우연한 항등** 위에 서 있다. 어느 한쪽이 바뀌면 조용히 어긋나므로
 *    여기서 항등을 고정한다 (`feedback_algebraic_identity_makes_wrong_path_look_right`).
 *
 * **역방향 짝이 핵심이다** — 비간주(매매 등)에서는 이 항등이 **성립하지 않는다**.
 * §5①6호가 표준세율을 2%로 치환하므로 취득세 4%여도 농특세는 0.2%다. 그 짝이 없으면
 * §1이 「농특세 = 취득세액 × 10%」를 **전역 규칙으로 오독**시킨다.
 *
 * ## §2 [AT-16-5] 세율 경합 — 「지방세법」 §16⑤
 *
 * `acquisition-tax-rate-special.ts`는 §13①(본점·공장 중과) 대상이면 §15 세율특례를 배제하며
 * 「§15 본문 단서: §13① 중과세율이 적용되는 경우에는 그 중과세율 적용」이라 적었다.
 * **§15① 단서에 §13①은 없다** — §13②뿐이다(§15② 단서에만 §13①이 있고, 그건 간주취득 조항이다).
 *
 * 실제 근거는 **§16⑤**: 「같은 취득물건에 대하여 **둘 이상의 세율이 해당되는 경우에는
 * 그중 높은 세율**을 적용한다」. 동작(높은 쪽 채택)은 맞았고 인용만 틀렸다.
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { applySpecialRate } from "@/lib/tax-engine/acquisition-tax-rate-special";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

const BASE = 1_000_000_000;

function deemed(cause: string, deemedInput: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return calcAcquisitionTax({
    propertyType: "land",
    acquisitionCause: cause,
    reportedPrice: 0,
    standardValue: 0,
    acquiredBy: "individual",
    balancePaymentDate: "2025-06-01",
    deemedInput,
    ...extra,
  } as unknown as AcquisitionTaxInput);
}

const LAND = { landCategory: { prevCategory: "전", newCategory: "대", prevStandardValue: 0, newStandardValue: BASE } };
const RENO = { renovation: { renovationType: "major_repair", prevStandardValue: 0, newStandardValue: BASE } };
const SHARE = {
  majorShareholder: { corporateAssetValue: BASE, prevShareRatio: 0, newShareRatio: 1, isListed: false },
};

describe("[AT-RST] §1 간주취득 농특세 = §15② 취득세액 × 10% (농특세법 §5⑤)", () => {
  it("[AT-RST-01] 지목변경 — 본문 2%", () => {
    const r = deemed("deemed_land_category", LAND);
    expect(r.acquisitionTax).toBe(20_000_000); // 10억 × 2%
    expect(r.ruralSpecialTax).toBe(Math.floor(r.acquisitionTax * 0.1));
    expect(r.ruralSpecialTax).toBe(2_000_000);
  });

  it("[AT-RST-02] 개수 — 본문 2%", () => {
    const r = deemed("deemed_renovation", RENO);
    expect(r.acquisitionTax).toBe(20_000_000);
    expect(r.ruralSpecialTax).toBe(Math.floor(r.acquisitionTax * 0.1));
  });

  it("[AT-RST-03] 과점주주 — 본문 2%", () => {
    const r = deemed("deemed_major_shareholder", SHARE);
    expect(r.acquisitionTax).toBe(20_000_000);
    expect(r.ruralSpecialTax).toBe(Math.floor(r.acquisitionTax * 0.1));
  });

  it("[AT-RST-04] 단서 10%(§13⑤ 사치성)에서도 항등이 성립한다", () => {
    const r = deemed("deemed_land_category", LAND, {
      isLuxuryProperty: true,
      luxuryType: "golf_course",
    });
    expect(r.acquisitionTax).toBe(100_000_000); // 10억 × 10%
    expect(r.ruralSpecialTax).toBe(Math.floor(r.acquisitionTax * 0.1));
    expect(r.ruralSpecialTax).toBe(10_000_000);
  });

  it("[AT-RST-05] 〔역방향〕 비간주에는 이 항등이 **성립하지 않는다** — §5①6호는 표준세율을 2%로 치환한다", () => {
    const r = calcAcquisitionTax({
      propertyType: "land",
      acquisitionCause: "merger",
      reportedPrice: BASE,
      standardValue: BASE,
      acquiredBy: "corporation",
      balancePaymentDate: "2025-06-01",
    } as unknown as AcquisitionTaxInput);
    expect(r.acquisitionTax).toBe(40_000_000); // 10억 × 4%
    // 농특세는 2% 기준 → 0.2% = 200만. 취득세액의 10%(400만)가 **아니다**.
    expect(r.ruralSpecialTax).toBe(2_000_000);
    expect(r.ruralSpecialTax).not.toBe(Math.floor(r.acquisitionTax * 0.1));
  });
});

describe("[AT-16-5] §2 세율 경합 — 둘 이상이면 높은 세율 (지방세법 §16⑤)", () => {
  function corpLand(extra: Record<string, unknown>) {
    return calcAcquisitionTax({
      propertyType: "land",
      acquisitionCause: "merger",
      reportedPrice: BASE,
      standardValue: BASE,
      acquiredBy: "corporation",
      balancePaymentDate: "2025-06-01",
      ...extra,
    } as unknown as AcquisitionTaxInput);
  }

  it("[AT-16-5-01] §15①3호 합병특례 단독 → 2% (표준 4% − 중과기준 2%)", () => {
    expect(corpLand({ specialRateType: "corp_merger" }).appliedRate).toBe(0.02);
  });

  it("[AT-16-5-02] §13① 본점신축(과밀억제) 단독 → 8%", () => {
    expect(
      corpLand({ isHeadquarterNewBuild: true, isMetropolitanCongestion: true }).appliedRate,
    ).toBe(0.08);
  });

  it("[AT-16-5-03] 둘 다 해당 → **높은 쪽 8%** (특례 2%도, 표준 4%도 아니다)", () => {
    const r = corpLand({
      specialRateType: "corp_merger",
      isHeadquarterNewBuild: true,
      isMetropolitanCongestion: true,
    });
    expect(r.appliedRate).toBe(0.08);
    expect(r.acquisitionTax).toBe(80_000_000);
  });

  it("[AT-16-5-04] 근거는 §16⑤다 — §15① 단서에는 §13①이 없다", () => {
    const msg = applySpecialRate(0.04, "corp_merger", {
      isCorpMetro: false,
      isHeadquarterOrFactorySurcharge: true,
    }).message;
    expect(msg).toContain(ACQUISITION.RATE_APPLICATION_HIGHEST);
    expect(ACQUISITION.RATE_APPLICATION_HIGHEST).toBe("지방세법 §16⑤");
    // 종전 오기 — 「§15 단서」가 §13① 배제의 근거라는 주장은 법문에 없다
    expect(msg).not.toMatch(/§15\s*단서/);
  });

  it("[AT-16-5-05] 〔역방향〕 §13②(대도시 법인) 동시적용의 근거는 §15① 단서가 맞다", () => {
    const r = applySpecialRate(0.04, "corp_merger", {
      isCorpMetro: true,
      isHeadquarterOrFactorySurcharge: false,
    });
    expect(r.isApplied).toBe(true);
    expect(r.legalBasis).toContain("지방세법 §15① 단서");
    expect(r.appliedRate).toBe(0.06); // (4% − 2%) × 300%
  });
});
