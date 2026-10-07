/**
 * anchor — 토지·건물 별개 취득 결과 표시 · **소유자 분리(selfOwns ≠ both) 항등식** (Phase C Check 지적 · 표시 전용, 세액 불변)
 *
 * 종전: 다건 집계 `PerPropertyBreakdown.transferPrice`가 **일괄 총액**(`singleInput.transferPrice`)이라, 소유 파트만 센 취득가액·필요경비
 *       echo와 한 줄에 놓이면 `양도가 − 취득 − 필요경비 = 양도차익`이 깨졌다(land_only: 900,000,000 − 200,000,000 − 0 ≠ 475,000,000).
 *       전액 비과세 단건·집계의 `exemptGrossGain`도 양 파트 gross(소유자 분리에서 본인 신고분이 아닌 값)였다.
 *
 *   OS-1  selfOwns 3종(both · land_only · building_only) × 시나리오 3종(N 과세 · H 부분 비과세 · X 전액 비과세) × 6조합
 *         집계 breakdown: 양도가액 = 소유 파트 양도가 합 · 취득 · 필요경비 = 독립 산식 · `양도가 − 취득 − 필요경비 = 양도차익(gross)`
 *   OS-2  단건 전액 비과세 `exemptGrossGain` = 소유 파트 양도차익(비과세가 아닌 경로의 `ownerRawGain`과 같은 축)
 *   OS-3  `selfOwns = both`는 값이 변하지 않는다(두 파트 합 = 일괄 총액)
 *
 * 기대값은 `_helpers/split-acq-display-fixture.ts`의 독립 산식(BigInt 정수 나눗셈)이다 — 엔진 출력 복사가 아니다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import { D, rates, SCN_N, SCN_H, SCN_X, COMBOS, ownedModel, run, toInput, type Scn } from "./_helpers/split-acq-display-fixture";

const SCNS = { N: SCN_N, H: SCN_H, X: SCN_X } as const;
const OWNS = ["both", "land_only", "building_only"] as const;

const plainLand = () =>
  ({
    ...baseTransferInput({
      propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 100_000_000, expenses: 0,
      transferDate: D("2026-07-01"), acquisitionDate: D("2015-01-01"), isOneHousehold: false, householdHousingCount: 2,
    }),
    propertyId: "P",
    propertyLabel: "P",
  }) as unknown as TransferTaxItemInput;
const splitItem = (s: Scn, c: (typeof COMBOS)[string], over: Partial<TransferTaxInput>) =>
  ({ ...(toInput(s, c, over) as unknown as TransferTaxItemInput), propertyId: "S", propertyLabel: "S" }) as TransferTaxItemInput;
const aggregate = (items: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: 2026, annualBasicDeductionUsed: 0, properties: items }, rates);

const owned = ownedModel;

describe("OS-1 다건 집계 — 소유자 분리 3종 × 시나리오 3종 × 6조합: 양도가 − 취득 − 필요경비 = 양도차익", () => {
  for (const [sk, scn] of Object.entries(SCNS)) {
    for (const [ck, combo] of Object.entries(COMBOS)) {
      for (const own of OWNS) {
        it(`${sk}:${ck}:${own}`, () => {
          const e = owned(scn, combo, own);
          const agg = aggregate([splitItem(scn, combo, { selfOwns: own }), plainLand()]);
          const p = agg.properties.find((x) => x.propertyId === "S")!;
          expect(p.transferPrice, "양도가액 = 소유 파트 양도가 합").toBe(e.price);
          expect(p.acquisitionPrice, "취득가액").toBe(e.acq);
          expect(p.necessaryExpense, "필요경비").toBe(e.exp);
          // 신고서·명세서·요약 카드가 쓰는 「전체 양도차익」 정본 — 비과세면 gross echo, 아니면 transferGain
          const gross = p.isExempt ? p.exemptGrossGain : p.transferGain;
          expect(gross, "전체 양도차익(gross)").toBe(e.gain);
          expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense, "항등식").toBe(gross);
          // 시나리오 가정 확인 — X는 전액 비과세, N은 비-비과세
          if (sk === "X") expect(p.isExempt).toBe(true);
          if (sk === "N") expect(p.isExempt).toBe(false);
          // 평범한 자산은 종전 축 그대로
          const plain = agg.properties.find((x) => x.propertyId === "P")!;
          expect(plain.transferPrice).toBe(300_000_000);
          expect(plain.transferPrice - plain.acquisitionPrice - plain.necessaryExpense).toBe(plain.transferGain);
        });
      }
    }
  }
});

describe("OS-2 단건 전액 비과세 — exemptGrossGain은 본인 소유 파트의 양도차익이다", () => {
  for (const [ck, combo] of Object.entries(COMBOS)) {
    for (const own of OWNS) {
      it(`X:${ck}:${own}`, () => {
        const r = run(SCN_X, combo, { selfOwns: own });
        expect(r.isExempt).toBe(true);
        expect(r.exemptGrossGain).toBe(owned(SCN_X, combo, own).gain);
        // 비과세 결과의 세액은 0 그대로 — echo 정정이 판정·세액을 건드리지 않는다
        expect(r.determinedTax).toBe(0);
        expect(r.totalTax).toBe(0);
        expect(r.transferGain).toBe(0);
      });
    }
  }

  it("land_only 실가/환산: gross 550,000,000 (종전: 양 파트 673,500,000 — 비소유 건물분이 섞였다)", () => {
    expect(run(SCN_X, COMBOS.AE, { selfOwns: "land_only" }).exemptGrossGain).toBe(550_000_000);
    expect(run(SCN_X, COMBOS.AE, { selfOwns: "both" }).exemptGrossGain).toBe(673_500_000);
  });
});

describe("OS-3 selfOwns = both — 두 파트 합 = 일괄 총액이라 양도가액이 변하지 않는다", () => {
  for (const [sk, scn] of Object.entries(SCNS)) {
    for (const [ck, combo] of Object.entries(COMBOS)) {
      it(`${sk}:${ck}`, () => {
        const agg = aggregate([splitItem(scn, combo, {}), plainLand()]);
        const p = agg.properties.find((x) => x.propertyId === "S")!;
        expect(p.transferPrice).toBe(scn.price);
      });
    }
  }
});
