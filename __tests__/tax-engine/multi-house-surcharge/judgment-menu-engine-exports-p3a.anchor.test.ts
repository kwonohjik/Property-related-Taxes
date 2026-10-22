/**
 * anchor — 다주택 중과 판정 메뉴 P3a: 결과 불변 엔진 export (계획서 §4.3·§4.4 · MH-P7 일부).
 *
 * - `classifyRegionCriteriaDetail` — 영 §167의3①1호 지역기준·가액기준의 **이유**. 기존 `classifyRegionCriteriaByCode`는 그 `criteria`다.
 *   동치는 착수 시 실측했다: 변경 전 함수로 시군구 코드 2,153개(전국 256개 × 동·읍·면 접미 7종 + 옛 코드·경계 코드)를 분류한
 *   스냅샷과 변경 후 결과가 **전부 같았다**.
 * - `presaleRightCountReason` — `isPresaleRightCounted`의 사유(표 ③).
 * - `assembleSurchargeHouseSet` · `linkSurchargeHousesForSelling` — STEP 0.5가 쓰는 주택 집합(행별 판정이 재사용 — F-5).
 */
import { describe, it, expect } from "vitest";
import {
  classifyRegionCriteriaByCode,
  classifyRegionCriteriaDetail,
  isPresaleRightCounted,
  presaleRightCountReason,
} from "@/lib/tax-engine/multi-house-surcharge-count";
import { assembleSurchargeHouseSet } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

describe("classifyRegionCriteriaDetail — 이유", () => {
  const cases: [string, "REGION" | "VALUE", string][] = [
    ["", "VALUE", "no_code"],
    ["1168010100", "REGION", "seoul"], // 강남 역삼동
    ["4113510100", "REGION", "capital_city"], // 성남 분당
    ["4122025621", "VALUE", "eup_myeon"], // 평택 포승읍 — 수도권 시의 읍
    ["41820", "VALUE", "capital_county"], // 가평군(5자리)
    ["2635010100", "REGION", "metro_district"], // 부산 해운대
    ["26710", "VALUE", "metro_county"], // 부산 기장군(5자리)
    ["3611010100", "REGION", "sejong"], // 세종 반곡동
    ["3611025021", "VALUE", "eup_myeon"], // 세종 조치원읍
    ["1221010100", "REGION", "metro_district"], // 전남광주통합특별시 동구
    ["4420010100", "VALUE", "province"], // 아산
  ];
  for (const [code, criteria, reason] of cases) {
    it(`[RC] ${code || "(빈 코드)"} → ${criteria} · ${reason}`, () => {
      expect(classifyRegionCriteriaDetail(code)).toEqual({ criteria, reason });
      expect(classifyRegionCriteriaByCode(code)).toBe(criteria);
    });
  }
});

describe("presaleRightCountReason — 권리 산입 사유", () => {
  const START = new Date("2021-01-01");
  const right = (over: Partial<PresaleRight>): PresaleRight => ({
    id: "r1",
    type: "presale_right",
    acquisitionDate: new Date("2022-01-01"),
    region: "capital",
    regionCode: "1168010100",
    rightValue: 500_000_000,
    ...over,
  });
  it("[PR-1] 2021.1.1. 전 취득 분양권 → presale_before_start(불산입)", () => {
    const r = right({ acquisitionDate: new Date("2020-12-31") });
    expect(presaleRightCountReason(r, START)).toBe("presale_before_start");
    expect(isPresaleRightCounted(r, START)).toBe(false);
  });
  it("[PR-2] 가액기준 지역 3억 이하 → low_value_local(불산입) · 조합원입주권은 취득일 무관", () => {
    const r = right({ type: "redevelopment_right", acquisitionDate: new Date("2015-01-01"), regionCode: "4420010100", region: "non_capital", rightValue: 300_000_000 });
    expect(presaleRightCountReason(r, START)).toBe("low_value_local");
  });
  it("[PR-3] 그 밖 → counted", () => {
    expect(presaleRightCountReason(right({}), START)).toBe("counted");
    expect(isPresaleRightCounted(right({}), START)).toBe(true);
  });
});

describe("assembleSurchargeHouseSet — STEP 0.5 주택 집합", () => {
  const rates = parseRatesFromMap(loadFallbackTransferRates(new Date("2026-09-18")));
  const house = (id: string) => ({
    id, acquisitionDate: new Date("2015-01-01"), officialPrice: 300_000_000, region: "capital", regionCode: "1168010100",
    isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
  });
  const input = (over: Partial<TransferTaxInput>) =>
    baseTransferInput({ transferDate: new Date("2026-09-18"), isOneHousehold: false, ...over } as Partial<TransferTaxInput>);

  it("[HS-1] 명부가 있으면 그 명부가 집합이다", () => {
    const houses = [house("selling"), house("h2")] as TransferTaxInput["houses"];
    const set = assembleSurchargeHouseSet(input({ houses, sellingHouseId: "selling" }), rates);
    expect(set?.rawHouses.map((h) => h.id)).toEqual(["selling", "h2"]);
    expect(set?.fromTwoHouseDeeming).toBe(false);
  });
  it("[HS-2] 명부도 의제 사실도 없으면 집합이 없다(정밀 판정 없음 → 술어 fallback)", () => {
    expect(assembleSurchargeHouseSet(input({ householdHousingCount: 2, isRegulatedArea: true }), rates)).toBeUndefined();
  });
});
