/**
 * anchor: 취득세 주택 수 — 기준일 당일 동시 취득의 순서 선택 (계획서 I-7)
 *
 * 지방세법 시행령 §28의4③ (현행 MST 288831 — 2020.8.12. 신설 당시 ②, MST 220923 동문):
 *  「제1항 및 제2항을 적용할 때 주택, 조합원입주권, 주택분양권 또는 오피스텔을 동시에 2개 이상
 *   취득하는 경우에는 납세의무자가 정하는 바에 따라 순차적으로 취득하는 것으로 본다.」
 * ⇒ 순서는 **납세의무자가 정한다**. 취득하는 주택(권리취득일 소급이면 그 권리)과 같은 날 취득한
 *   자산을 「취득하는 주택 뒤에 취득한 것」으로 정하면 그 자산은 산정일 현재 소유 자산이 아니다.
 *
 * 변경 전: 같은 날 취득 자산을 산입하고 안내만 했다(소급 산정 경로만) — 선택 입력이 없었다.
 * 실측(폼 → 빌더 → Zod → 엔진, base b49826f8): 비조정 · 주택 A + 같은 날 취득한 주택 B + 취득 5억
 *   → 3주택 8% 40,000,000
 */

import { describe, it, expect } from "vitest";
import { INITIAL_FORM, createOwnedHouseInfo, type FormState, type OwnedHouseInfo } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { calculateHouseCount } from "@/lib/tax-engine/house-count/index";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";
import type { HouseCountInput } from "@/lib/tax-engine/house-count/types";

function row(id: string, acquisitionDate: string, over: Partial<OwnedHouseInfo> = {}): OwnedHouseInfo {
  return { ...createOwnedHouseInfo(id), standardValue: "300000000", acquisitionDate, isMetropolitanRegion: true, ...over };
}

function baseForm(b: OwnedHouseInfo, over: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    reportedPrice: "500000000",
    standardValue: "500000000",
    isMetropolitanRegion: true,
    houseCountAfter: "3",
    balancePaymentDate: "2024-06-01",
    ownedHouses: [row("A", "2015-01-01"), b],
    ...over,
  } as FormState;
}

function calcViaRoute(form: FormState) {
  const parsed = acquisitionTaxInputSchema.safeParse(buildAcquisitionTaxBody(form));
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("unreachable");
  return calcAcquisitionTax(parsed.data);
}

const reasons = (r: { excludedDetails: { assetId?: string; reason: string }[] }) =>
  r.excludedDetails.map((e) => `${e.assetId}:${e.reason}`);

describe("[I7] 폼 → 빌더 → Zod → 엔진", () => {
  it("[I7-01] 🔴 같은 날 취득한 주택 B를 「취득하는 주택 뒤」로 정함 → 2주택 1% 5,000,000 (종전 3주택 8%)", () => {
    const r = calcViaRoute(baseForm(row("B", "2024-06-01", { sameDayOrderAfterPending: true } as Partial<OwnedHouseInfo>)));
    expect(reasons(r.houseCountDetail!)).toEqual(["B:same_day_ordered_after_pending"]);
    expect(r.houseCountDetail?.excludedDetails[0].legalBasis).toBe(ACQUISITION.HOUSE_COUNT_SIMULTANEOUS_ACQUISITION);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("[I7-02] 긍정 짝 — 선택하지 않으면 산입 + §28의4③ 안내 (3주택 8%)", () => {
    const r = calcViaRoute(baseForm(row("B", "2024-06-01")));
    expect(r.acquisitionTax).toBe(40_000_000);
    expect(r.warnings.some((w) => w.includes("§28의4③"))).toBe(true);
  });

  it("[I7-03] 선택했지만 확정 산정일과 다른 날 → 산입 + 적용하지 않았다는 고지 (잔금일과 같지만 등기일이 더 빠름)", () => {
    const r = calcViaRoute(
      baseForm(row("B", "2024-06-01", { sameDayOrderAfterPending: true } as Partial<OwnedHouseInfo>), { registrationDate: "2024-05-20" })
    );
    expect(r.acquisitionTax).toBe(40_000_000);
    expect(r.warnings.some((w) => w.includes("같은 날 취득한 자산이 아니어서"))).toBe(true);
  });

  it("[I7-03b] 산정일 후보와 다른 날 취득한 행은 칸이 닫혀 있다 — 켜진 값이 남아 있어도 ④가 보내지 않는다", () => {
    const body = buildAcquisitionTaxBody(baseForm(row("B", "2024-05-31", { sameDayOrderAfterPending: true } as Partial<OwnedHouseInfo>)));
    const houses = (body.houseCountInput as { houses: { id?: string; sameDayOrderAfterPending?: boolean }[] }).houses;
    expect(houses.find((h) => h.id === "B")?.sameDayOrderAfterPending).toBeUndefined();
  });

  it("[I7-04] 등기일이 잔금일보다 빠르면 기준일은 등기일(§20) — 등기일과 같은 날 취득 자산만 선택 대상", () => {
    const r = calcViaRoute(
      baseForm(row("B", "2024-05-20", { sameDayOrderAfterPending: true } as Partial<OwnedHouseInfo>), { registrationDate: "2024-05-20" })
    );
    expect(r.acquisitionTax).toBe(5_000_000);
  });
});

describe("[I7] 엔진 — 권리취득일 소급(§28의4① 후단) 기준일", () => {
  const hc = (flag: boolean | undefined): ReturnType<typeof calculateHouseCount> => {
    const input: HouseCountInput = {
      houses: [
        { id: "A", standardValue: 300_000_000, type: "housing", acquisitionDate: "2015-01-01", isMetropolitan: true },
        { id: "B", standardValue: 300_000_000, type: "housing", acquisitionDate: "2022-05-01", isMetropolitan: true, sameDayOrderAfterPending: flag },
      ],
      rights: [],
      offices: [],
      pendingAcquisition: { isMetropolitan: true, acquisitionValue: 500_000_000, acquiredViaRight: true, rightAcquisitionDate: "2022-05-01" },
      referenceDate: "2024-06-01",
    };
    return calculateHouseCount(input);
  };

  it("[I7-05] 🔴 권리취득일과 같은 날 취득한 주택을 뒤로 정함 → 제외 (2)", () => {
    const r = hc(true);
    expect(r.effectiveCount).toBe(2);
    expect(reasons(r)).toEqual(["B:same_day_ordered_after_pending"]);
  });

  it("[I7-06] 긍정 짝 — 선택 없음 → 산입(3) + 안내(종전 B-13과 같음)", () => {
    const r = hc(undefined);
    expect(r.effectiveCount).toBe(3);
    expect(r.warnings.some((w) => w.includes("§28의4③"))).toBe(true);
  });

  it("[I7-07] 입주권·오피스텔 행도 같은 규칙", () => {
    const r = calculateHouseCount({
      houses: [],
      rights: [{ id: "R", type: "subscription_right", rightAcquisitionDate: "2024-06-01", sameDayOrderAfterPending: true }],
      offices: [{ id: "O", standardValue: 300_000_000, acquisitionDate: "2024-06-01", sameDayOrderAfterPending: true }],
      pendingAcquisition: { isMetropolitan: true, acquisitionValue: 500_000_000 },
      referenceDate: "2024-06-01",
    });
    expect(r.effectiveCount).toBe(1);
    expect(reasons(r)).toEqual(["R:same_day_ordered_after_pending", "O:same_day_ordered_after_pending"]);
  });
});
