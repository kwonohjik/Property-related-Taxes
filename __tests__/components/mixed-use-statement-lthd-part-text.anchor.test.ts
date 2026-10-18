/**
 * anchor — 겸용주택 상세명세서 주택분 장특 문구는 토지·건물 공제율이 다르면 **파트별로** 풀어 쓴다.
 *
 * 계획서: docs/02-design/features/transfer-mixed-use-filing-lthd-part-split.plan.md §5 L-1 · §6 Q-3
 *
 * 종전: 문구가 대표 연수·율(건물 기준) 한 줄이었다. 금액은 엔진 합계라 맞지만 산식이 그 금액을 설명하지 못했다 —
 *   B: 「주택분 과세대상 양도차익 × 표2 [보유 3년 12% + 거주 3년 12%] = 70,847,202」(283,119,834 × 24% = 67,948,760)
 *   C: 「주택분 과세대상 양도차익 × 표1 [보유 7년 14%] = 47,365,957」(283,119,834 × 14% = 39,636,776)
 * 파트 금액(14,492,214 · 56,354,988)은 #2247 anchor(`mixed-use-filing-lthd-part-split`)의 정답과 같다.
 *
 * 픽스처: CASE14(토지 1992-01-01 → 보유 34년) · 30억 · 양도 2026-06-01 · mock 세율.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);

function engine(over: Partial<MixedUseAssetInput>) {
  const a = { ...mixedUseCase14(), ...over } as MixedUseAssetInput;
  return calc(3_000_000_000, D("2026-06-01"), a, makeMockRates());
}

function statement(r: MixedUseGainBreakdown) {
  const fd = createDefaultTransferFormData();
  const asset = { ...fd.assets[0], acquisitionDate: "2019-06-01" };
  const items = buildStatementItems(mixedUseToFilingResult(r), { ...fd, transferDate: "2026-06-01", assets: [asset] }, asset, undefined, undefined);
  const get = (k: string) => {
    const x = items.get(k);
    if (!x) throw new Error(`item not found: ${k}`);
    return x;
  };
  return { part: get("ltHousingPart"), hold: get("ltHousingHolding"), res: get("ltHousingResidence") };
}

describe("겸용 상세명세서 주택분 장특 — 파트별 문구", () => {
  it("B 건물 2023·거주 3년 — 토지분 통칙 95-0…1 표1 30% · 건물분 표2 24%", () => {
    const r = engine({ buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    const { part, hold, res } = statement(r);
    // 산식이 금액을 설명한다 — 파트마다 과세 양도차익 × 공제율(원 미만 절사) = 파트 공제액, 합 = 주택분 공제액
    expect(Math.floor((48_307_382 * 30) / 100)).toBe(14_492_214);
    expect(Math.floor((234_812_452 * 24) / 100)).toBe(56_354_988);
    expect(14_492_214 + 56_354_988).toBe(r.housingPart.longTermDeductionAmount);
    expect(part.value).toBe(70_847_202);
    expect(part.formula).toBe(
      "토지분 48,307,382 × 표1 [보유 34년 30%] = 14,492,214 + 건물분 234,812,452 × 표2 [보유 3년 12% + 거주 3년 12%] = 56,354,988 → 70,847,202" +
        " (토지분: 소득세법 기본통칙 95-0…1 — 표1 30%와 표2 24% 중 큰 공제율)",
    );
    expect(part.legalBasis).toBe("소득세법 §95② 표1·표2");
    expect(hold.value).toBe(42_669_708);
    expect(hold.formula).toBe("토지분 보유 30% 14,492,214 + 건물분 보유 12% 28,177,494 = 42,669,708");
    expect(res.value).toBe(28_177_494);
    expect(res.formula).toBe("토지분 0 (표1 — 거주기간 공제 없음) + 건물분 거주 12% 28,177,494 = 28,177,494");
    expect((hold.value as number) + (res.value as number)).toBe(part.value);
  });

  it("C 건물 2019·거주 0 — 표1 토지 34년 30% · 건물 7년 14%", () => {
    const r = engine({ buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 0 });
    const { part, hold, res } = statement(r);
    expect(Math.floor((234_812_452 * 14) / 100)).toBe(32_873_743);
    expect(part.formula).toBe(
      "토지분 48,307,382 × 표1 [보유 34년 30%] = 14,492,214 + 건물분 234,812,452 × 표1 [보유 7년 14%] = 32,873,743 → 47,365,957",
    );
    expect(part.legalBasis).toBe("소득세법 §95② 표1");
    expect(hold.formula).toBe("토지분 보유 30% 14,492,214 + 건물분 보유 14% 32,873,743 = 47,365,957");
    expect(res.value).toBe(0);
    expect(res.formula).toBe("0 (표1 — 거주기간 공제 대상 아님)");
  });

  it("D 토지 2014·건물 2023·거주 3년 — 총 공제율은 같고(24%) 분해만 다르다: 통칙 동률은 표1(전부 보유분)", () => {
    const r = engine({ landAcquisitionDate: D("2014-06-01"), buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    expect(r.housingPart.appurtenantLthd?.table1Applied).toBe(true);
    const { part, hold, res } = statement(r);
    expect(part.formula).toMatch(/^토지분 [\d,]+ × 표1 \[보유 12년 24%\] = [\d,]+ \+ 건물분 [\d,]+ × 표2 \[보유 3년 12% \+ 거주 3년 12%\]/);
    expect(part.formula).toContain("표1 24%와 표2 24% 중 큰 공제율");
    expect(hold.formula).toMatch(/^토지분 보유 24% [\d,]+ \+ 건물분 보유 12% /);
    expect(res.formula).toMatch(/^토지분 0 \(표1 — 거주기간 공제 없음\) \+ 건물분 거주 12% /);
    expect((hold.value as number) + (res.value as number)).toBe(part.value);
  });

  it("A 건물 2019·거주 7년 — 토지·건물 공제율이 같으면(56%) 종전 한 줄 그대로", () => {
    const { part } = statement(engine({ buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 7 }));
    expect(part.formula).toBe("주택분 과세대상 양도차익 × 표2 [보유 7년 28% + 거주 7년 28%] = 158,547,106");
  });

  it("파트 보유연수가 없는 결과(#2247 직후 저장분) — 연수 없이 공제율만", () => {
    const r = engine({ buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 0 });
    delete r.housingPart.partLthd!.land.holdingYears;
    delete r.housingPart.partLthd!.building.holdingYears;
    const { part } = statement(r);
    expect(part.formula).toContain("토지분 48,307,382 × 표1 [보유 30%] = 14,492,214");
    // 건물분은 대표 연수(건물 기준 `holdingYears`)로 채운다
    expect(part.formula).toContain("건물분 234,812,452 × 표1 [보유 7년 14%] = 32,873,743");
  });

  it("파트 echo가 없는 옛 결과 — 종전 한 줄 그대로", () => {
    const r = engine({ buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    delete r.housingPart.partLthd;
    const { part } = statement(r);
    expect(part.formula).toBe("주택분 과세대상 양도차익 × 표2 [보유 3년 12% + 거주 3년 12%] = 70,847,202");
  });
});
