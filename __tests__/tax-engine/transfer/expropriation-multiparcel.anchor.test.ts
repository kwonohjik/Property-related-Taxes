/**
 * anchor — 다필지 공익수용 §164⑨ 특례 (D7).
 *
 * 계획서: docs/02-design/features/expropriation-valuation-164-9-scope-expansion.plan.md (rev.7 §3-1 · P2)
 *
 * 소득세법 시행령 §164⑨1호: 수용 시 양도당시 기준시가에서
 *   (기준시가 − min[보상액, 보상액 산정 기초 기준시가]) 를 차감
 *   ⇒ 양도당시 기준시가 = min[기준시가, 보상액, 보상기초]
 *
 * **다필지는 필지별로 판정한다** — `multi-parcel-transfer.ts`가 필지마다 다른 개별공시지가
 * (`parcel.standardPricePerSqmAtTransfer`)를 쓰므로, min[] 선택도 필지별로 독립이다.
 *
 * ⚠️ 다필지 환산은 자산-수준 `useEstimatedAcquisition`이 아니라 **필지별 `acquisitionMethod`**로
 *    결정된다. API(`transfer-tax-api.ts:256`)는 `parcelModeActive` 시 자산-수준 플래그를 **false로
 *    강제 송신**하므로, 이 테스트도 그 형태(=false)로 입력해 실제 도달 경로를 재현한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { ParcelInput } from "@/lib/tax-engine/multi-parcel-transfer";

const rates = makeMockRates();

/** 다필지 토지 수용 — API가 실제로 보내는 형태 */
function mpInput(parcels: ParcelInput[], overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    // API :256 — parcelModeActive 시 자산-수준 환산 플래그는 false 강제
    useEstimatedAcquisition: false,
    transferCause: "public_expropriation",
    parcels,
    ...overrides,
  });
}

function parcel(o: Partial<ParcelInput> & { id: string }): ParcelInput {
  return {
    transferArea: 200,
    acquisitionArea: 200,
    acquisitionDate: new Date("2010-06-01"),
    acquisitionMethod: "estimated",
    standardPricePerSqmAtAcq: 1_000_000,
    standardPricePerSqmAtTransfer: 2_500_000,
    ...o,
  };
}

describe("다필지 공익수용 §164⑨ 특례 (D7)", () => {
  it("C-07: 필지별 min[] 적용 — 분모 5억 → 3억, 세액 167,892,000 → 81,107,066", () => {
    const r = calculateTransferTax(
      mpInput([
        parcel({
          id: "p1",
          // min[2,500,000(공시) · 1,500,000(보상) · 2,000,000(보상기초)] = 1,500,000
          compensationPerSqm: 1_500_000,
          compensationBasisStdPrice: 2_000_000,
        }),
      ]),
      rates,
    );

    // 양도당시 기준시가 = 1,500,000 × 200㎡ = 300,000,000 (특례 前 500,000,000)
    // 환산취득가 = 1,000,000,000 × 200,000,000 / 300,000,000 = 666,666,666
    expect(r.transferGain).toBe(327_333_334);
    expect(r.calculatedTax).toBe(81_107_066);
  });

  it("C-07b: 필지별 공시지가 상이 — min 선택이 필지마다 독립", () => {
    const r = calculateTransferTax(
      mpInput([
        // p1: 공시 2,500,000 > 보상 1,500,000 → min = **보상** 1,500,000 (특례 발동)
        //   분모 300,000,000 / 취득기준시가 200,000,000
        //   환산취득가 = floor(500,000,000 × 2억/3억) = 333,333,333, 개산공제 6,000,000
        //   → 양도차익 500,000,000 − 333,333,333 − 6,000,000 = 160,666,667
        parcel({
          id: "p1",
          compensationPerSqm: 1_500_000,
          compensationBasisStdPrice: 2_000_000,
        }),
        // p2: 공시 1,000,000 < 보상 1,500,000 → min = **공시지가 자신** → 차감 0 (§164⑨ `m < A` 미충족)
        //   분모 200,000,000 유지 / 취득기준시가 100,000,000
        //   환산취득가 = floor(500,000,000 × 1억/2억) = 250,000,000, 개산공제 3,000,000
        //   → 양도차익 500,000,000 − 250,000,000 − 3,000,000 = 247,000,000
        parcel({
          id: "p2",
          standardPricePerSqmAtTransfer: 1_000_000,
          standardPricePerSqmAtAcq: 500_000,
          compensationPerSqm: 1_500_000,
          compensationBasisStdPrice: 2_000_000,
        }),
      ]),
      rates,
    );
    // 두 필지가 **서로 다른 후보**를 선택함을 고정 — 자산-수준 단일 보상액이었다면 불가능한 결과.
    expect(r.transferGain).toBe(160_666_667 + 247_000_000);
  });

  it("C-07c: 자산-수준 useEstimatedAcquisition=false(API 형태)여도 필지별 환산이면 적용", () => {
    const r = calculateTransferTax(
      mpInput(
        [parcel({ id: "p1", compensationPerSqm: 1_500_000, compensationBasisStdPrice: 2_000_000 })],
        { useEstimatedAcquisition: false },
      ),
      rates,
    );
    // 자산-수준 플래그가 false라도 필지 acquisitionMethod === "estimated" 이므로 특례 대상
    expect(r.transferGain).toBe(327_333_334);
  });

  it("C-19: 보상 후보 1개라도 0이면 미적용 (게이트 — 현행 총액 유지)", () => {
    const r = calculateTransferTax(
      mpInput([parcel({ id: "p1", compensationPerSqm: 0, compensationBasisStdPrice: 2_000_000 })]),
      rates,
    );
    // 분모 = 공시 2,500,000 × 200 = 500,000,000 (특례 미적용)
    expect(r.transferGain).toBe(594_000_000);
    expect(r.calculatedTax).toBe(167_892_000);
  });

  it("C-19b: 수용이 아니면 미적용", () => {
    const r = calculateTransferTax(
      mpInput(
        [parcel({ id: "p1", compensationPerSqm: 1_500_000, compensationBasisStdPrice: 2_000_000 })],
        { transferCause: "general" },
      ),
      rates,
    );
    expect(r.transferGain).toBe(594_000_000);
  });

  it("C-02: 양도 2009.02.04 이전이면 미적용 (구 문언 미지원 — X3)", () => {
    const r = calculateTransferTax(
      mpInput(
        [
          parcel({
            id: "p1",
            acquisitionDate: new Date("2000-06-01"),
            compensationPerSqm: 1_500_000,
            compensationBasisStdPrice: 2_000_000,
          }),
        ],
        { transferDate: new Date("2009-02-03"), acquisitionDate: new Date("2000-06-01") },
      ),
      rates,
    );
    // 게이트 경계 — 특례 미적용(분모 5억 유지)
    expect(r.transferGain).toBe(594_000_000);
  });

  it("C-20: 면적 소수 — min[] × 300.55 (round2 후 floor)", () => {
    const r = calculateTransferTax(
      mpInput([
        parcel({
          id: "p1",
          transferArea: 300.55,
          acquisitionArea: 300.55,
          compensationPerSqm: 1_500_000,
          compensationBasisStdPrice: 2_000_000,
        }),
      ]),
      rates,
    );
    // 분모 = floor(1,500,000 × 300.55) = 450,825,000
    // 취득기준시가 = floor(1,000,000 × 300.55) = 300,550,000  (∴ 300,550,000/450,825,000 = 정확히 2/3)
    // 환산취득가 = floor(1,000,000,000 × 2/3) = 666,666,666
    // 개산공제 = floor(300,550,000 × 3%) = 9,016,500
    // 양도차익 = 1,000,000,000 − 666,666,666 − 9,016,500 = 324,316,834
    expect(r.transferGain).toBe(324_316_834);
  });

  it("C-12: 필지가 실지취득가(actual)이면 미적용 — 환산 아님", () => {
    const r = calculateTransferTax(
      mpInput([
        parcel({
          id: "p1",
          acquisitionMethod: "actual",
          acquisitionPrice: 300_000_000,
          compensationPerSqm: 1_500_000,
          compensationBasisStdPrice: 2_000_000,
        }),
      ]),
      rates,
    );
    expect(r.transferGain).toBe(700_000_000);
  });
});
