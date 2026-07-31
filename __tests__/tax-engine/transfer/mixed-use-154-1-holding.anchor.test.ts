/**
 * anchor: 겸용주택 1세대1주택 비과세 — 영 §154① **보유 2년 요건** 검증 (P3a · D-9).
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md §D-9
 *
 * 🔴 겸용 엔진은 `asset.isOneHouseExempt`를 호출부 판정으로 **그대로 신뢰**했고
 *   (`transfer-tax-mixed-use.ts:165·181·325`), API 도출식
 *   (`transfer-tax-api-mixed-use.ts:186-189`)에도 보유기간이 없었다. 정본
 *   `meetsOneHouseHoldingResidence`(`transfer-tax-exemption.ts:224`)의 소비처는
 *   일반 단건 엔진 하나뿐이었다.
 *   ⇒ 「1세대 해당」 토글만 켜면 **보유 1일이어도 12억 비과세**가 적용됐다.
 *
 * [법령 근거] 「소득세법」 제89조 제1항 제3호 가목이 위임한 같은 법 시행령 제154조 제1항 본문 —
 *   "1세대가 양도일 현재 국내에 1주택을 보유하고 있는 경우로서 해당 주택의 **보유기간이 2년**
 *    이상인 것"
 *
 * ⚠️ **P3a 범위 — 보유요건만**이다. 조정대상지역 취득 시의 **거주 2년 요건**(같은 항 본문 후단)은
 *   겸용 입력에 조정지역 여부가 없어 판정할 수 없다(계획서 P3c). 단서 각호 면제(수용·해외이주 등)도
 *   입력이 없어 미구현 — 둘 다 **과소과세 방향**의 잔여 갭이다.
 *
 * 기산일은 **건물 취득일**이다. §154①의 보유기간은 「해당 **주택**」의 보유기간이고, 겸용 건물의
 * 주택 부분 취득일이 곧 건물 취득일이기 때문이다(부수토지를 나중에 취득한 경우의 토지분 처리는
 * 선행 계획서 G-3의 별개 논점 — 겸용에는 미적용).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_PRICE } from "../_helpers/mixed-use-fixture";

const D = (s: string) => new Date(s);
const TRANSFER_DATE = D("2022-02-16");

function run(over: { land?: Date; building?: Date }) {
  return calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    TRANSFER_DATE,
    {
      ...mixedUseCase14(),
      ...(over.land ? { landAcquisitionDate: over.land } : {}),
      ...(over.building ? { buildingAcquisitionDate: over.building } : {}),
    },
    makeMockRates(),
  );
}

describe("P3a (D-9) 겸용주택 영 §154① 보유 2년 요건", () => {
  it("B-19(회귀): 보유 2년 이상이면 종전과 같다 — 요건 충족이므로 비과세 유지", () => {
    // CASE14 원본: 토지 1992-01-01 · 건물 1997-09-12 → 24년 보유
    const r = run({});
    expect(r.housingPart?.incomeAmount).toBe(0); // 12억 이하 비과세
    expect(r.total?.transferTax).toBe(160_672_654);
  });

  it("B-17: 보유 1년 미만 → §154① 미충족 → 주택분 과세", () => {
    const r = run({ land: D("2021-03-01"), building: D("2021-03-01") });
    // 종전: 주택분을 비과세 처리해 상가분만 과세 → 244,428,981
    expect(r.housingPart?.incomeAmount).toBe(1_158_835_741);
    expect(r.total?.taxBase).toBe(1_826_380_936);
    expect(r.total?.transferTax).toBe(755_931_421);
  });

  it("B-18: 보유 1~2년 → 여전히 미충족", () => {
    const r = run({ land: D("2020-06-01"), building: D("2020-06-01") });
    expect(r.total?.transferTax).toBe(755_931_421);
  });

  it("B-20: 기산일은 **건물** 취득일 — 토지를 오래 보유해도 건물이 2년 미만이면 미충족", () => {
    // 토지 1992(30년) + 건물 2021-03(1년 미만) → 「해당 주택」의 보유기간은 건물 기준
    const r = run({ building: D("2021-03-01") });
    expect(r.housingPart?.incomeAmount).toBeGreaterThan(0);
  });

  it("B-20b(경계): 보유 2년 — **초일불산입**(민법 §157) 기준으로 하루가 갈린다", () => {
    // `calculateHoldingPeriod`(tax-utils.ts:239)는 취득일 다음날부터 기산한다.
    // 일반 단건 엔진의 §154① 판정과 **같은 함수**를 쓴다(정본 일치).
    //   2020-02-15 취득 → 기산 2020-02-16 → 2022-02-16 = 만 2년 → 충족
    expect(run({ building: D("2020-02-15") }).housingPart?.incomeAmount).toBe(0);
    //   2020-02-16 취득 → 기산 2020-02-17 → 1년 11개월 30일 → 미충족
    expect(run({ building: D("2020-02-16") }).housingPart?.incomeAmount).toBeGreaterThan(0);
  });
});
