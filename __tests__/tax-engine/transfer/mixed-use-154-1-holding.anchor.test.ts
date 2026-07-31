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

function run(over: { land?: Date; building?: Date; oneHouse?: boolean }) {
  return calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    TRANSFER_DATE,
    {
      ...mixedUseCase14(),
      ...(over.land ? { landAcquisitionDate: over.land } : {}),
      ...(over.building ? { buildingAcquisitionDate: over.building } : {}),
      ...(over.oneHouse === undefined ? {} : { isOneHouseExempt: over.oneHouse }),
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

  // B-17·B-18은 **§154① 판정 자체**만 고정한다(주택분이 과세로 들어오는가).
  // 최종 세액은 P3b(단기세율)가 다시 바꾸므로 B-11·B-12가 따로 고정한다 —
  // 한 anchor가 두 가지를 주장하면 어느 Phase가 깨졌는지 구분되지 않는다.
  it("B-17: 보유 1년 미만 → §154① 미충족 → 주택분이 과세로 들어온다", () => {
    const r = run({ land: D("2021-03-01"), building: D("2021-03-01") });
    // 종전에는 주택분을 비과세 처리해 상가분만 과세했다(주택 소득금액 0).
    expect(r.housingPart?.incomeAmount).toBe(1_158_835_741);
    expect(r.total?.taxBase).toBe(1_826_380_936);
  });

  it("B-18: 보유 1~2년 → 여전히 미충족", () => {
    const r = run({ land: D("2020-06-01"), building: D("2020-06-01") });
    expect(r.housingPart?.incomeAmount).toBe(1_158_835_741);
    expect(r.total?.taxBase).toBe(1_826_380_936);
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

/**
 * P3b (D-2) — 겸용주택 **단기세율**(「소득세법」 제104조 제1항 제2·3호) + §104⑤ 비교과세.
 *
 * 계획서 §4.2. 겸용 엔진의 세율 적용점은 `calculateProgressiveTax` **한 곳뿐**이었다
 * (`transfer-tax-mixed-use-totals.ts:51`) — 보유 1년 미만이어도 §55① 누진세율을 물렸다.
 *
 * [법령 근거]
 *  · §104①3호 — 1년 미만 50%(**주택**은 70%). 2호 — 1~2년 40%(주택 60%).
 *    주택 괄호("이에 딸린 토지…포함, 이하 이 항에서 같다")로 주택분 **부수토지도 주택 세율**.
 *  · §104⑤ — MAX(1호 합산누진, 2호 자산별 합). 2호 **단서**는 동일 호·동일세율일 때만 합산
 *    (P1과 같은 규칙 — 세율이 갈리면 본문인 자산별 합계).
 *
 * ⚠️ **범위 — `nonBizIncome === 0`인 겸용만**이다. 배율 초과 비사업용 토지가 있으면 현행
 *   「합산 누진 + 10%p 가산」(모델 A)을 유지한다 — §104⑤ MAX를 도입하는 순간 D-8(세액 모델
 *   통일)을 건드리게 되는데 그건 세무 판단 대기이기 때문이다(계획서 §4.2 · P6).
 *
 * 세율 기산(연수):
 *  · 주택분 = `min(토지, 건물)` — 부수토지를 나중에 취득하면 그 시점 기준(선행 계획서 G-3의
 *    `max(취득일)` 규칙과 같은 것을 연수로 뒤집은 표현).
 *  · 상가분 = 토지·건물 **각각**. 같은 파일의 장특 정본이 이미 파트별이다
 *    (`transfer-tax-mixed-use-helpers.ts:565-566`).
 */
describe("P3b (D-2) 겸용주택 단기세율 + §104⑤ 비교과세", () => {
  it("B-13(회귀): 보유 2년 이상이면 누진세율 — 종전과 같다", () => {
    expect(run({}).total?.transferTax).toBe(160_672_654);
  });

  it("B-11: 1년 미만 — 주택 70% / 상가 50%, §104⑤ 2호 채택", () => {
    const r = run({ land: D("2021-03-01"), building: D("2021-03-01") });
    // P3a로 주택분이 과세로 들어온 뒤(755,931,421 = 1호 합산누진)
    // 기본공제 250만은 최고세율(주택 70%)에 전액 귀속 → 주택 과세표준 1,156,335,741
    //   2호 = 1,156,335,741×70% 809,435,018 + 670,045,195×50% 335,022,597 = 1,144,457,615
    //   1호 = 755,931,421 → MAX = 2호
    expect(r.total?.transferTax).toBe(1_144_457_615);
  });

  it("B-12: 1~2년 — 주택 60% / 상가 40%", () => {
    const r = run({ land: D("2020-06-01"), building: D("2020-06-01") });
    //   2호 = 1,156,335,741×60% 693,801,444 + 670,045,195×40% 268,018,078 = 961,819,522
    expect(r.total?.transferTax).toBe(961_819_522);
  });

  it("B-21: 주택분 세율 기산은 토지·건물 중 **늦은 취득**(= 짧은 보유)", () => {
    // CASE14 주택분은 12억 이하 비과세라 세율이 세액에 드러나지 않는다 —
    // 다주택자(isOneHouseExempt=false)로 두어 주택분을 과세시켜야 기산 규칙이 관측된다.
    // 건물 1997(24년) + 토지 2021-03(1년 미만) → 주택분(주택+부수토지 **일체**)은 §104①3호 70%.
    const late = run({ land: D("2021-03-01"), oneHouse: false }).total?.transferTax ?? 0;
    // 둘 다 장기 → 누진
    const both = run({ oneHouse: false }).total?.transferTax ?? 0;
    expect(late).toBeGreaterThan(both);
    // 상가 토지분도 1년 미만이 되므로 상가는 50% — 주택 70%와 **다른 세율**이라
    // §104⑤2호 단서가 아니라 본문(자산별 합)으로 간다(P1과 같은 규칙).
    expect(both).toBe(run({ oneHouse: false }).total?.transferTax);
  });
});

/**
 * P4 (D-3) — 겸용주택 **미등기양도자산**: 4개 조문이 전부 미적용이었다.
 *
 * 계획서 §D-3. `isUnregistered`는 겸용 엔진에서 **개산공제율**(§163⑥ 3% → 0.3%)에만 쓰였고
 * (`transfer-tax-mixed-use-commercial.ts:166` · `-housing.ts:193` — grep 전수 3곳),
 * 세율·장특·기본공제·비과세에는 전혀 반영되지 않았다.
 *
 * [법령 근거 — 4개 조문, 2026-07-31 법제처 원문 확인]
 *  · §104①10호  — 양도소득 과세표준의 **70%** 단일세율
 *  · §95②       — 장기보유특별공제 **배제**("…자산(§104③에 따른 미등기양도자산…은 제외한다)")
 *  · §103①1호 단서 — 양도소득기본공제 **배제**
 *  · §91①       — 비과세 규정 **배제**("미등기양도자산에 대하여는 … 비과세에 관한 규정을 적용하지 아니한다")
 */
describe("P4 (D-3) 겸용주택 미등기양도자산", () => {
  const unreg = (over: { land?: Date; building?: Date } = {}) =>
    calcMixedUseTransferTax(
      CASE14_TRANSFER_PRICE,
      TRANSFER_DATE,
      {
        ...mixedUseCase14(),
        isUnregistered: true,
        ...(over.land ? { landAcquisitionDate: over.land } : {}),
        ...(over.building ? { buildingAcquisitionDate: over.building } : {}),
      },
      makeMockRates(),
    );

  it("B-14: 4개 조문 적용 — 종전 163,273,425 → 1,288,354,126", () => {
    const r = unreg();
    // §91① 비과세 배제 → 주택분이 과세로 들어온다(종전 소득금액 0)
    expect(r.housingPart?.transferGain).toBe(1_161_172_235);
    // §95② 장특 배제 → 양도소득금액 = 양도차익
    expect(r.housingPart?.longTermDeductionAmount).toBe(0);
    expect(r.commercialPart?.longTermDeductionAmount).toBe(0);
    expect(r.housingPart?.incomeAmount).toBe(1_161_172_235);
    expect(r.commercialPart?.incomeAmount).toBe(679_333_660);
    // §103①1호 단서 기본공제 배제 → 과세표준 = 양도소득금액 합
    expect(r.total?.basicDeduction).toBe(0);
    expect(r.total?.taxBase).toBe(1_840_505_895);
    // §104①10호 70% 단일세율
    expect(r.total?.appliedRate).toBe(0.7);
    expect(r.total?.transferTax).toBe(1_288_354_126); // floor(1,840,505,895 × 70%)
  });

  it("B-14b: 미등기는 §104⑤ 단기세율 혼합이 아니라 **전체 70%** — P3b 경로와 구분된다", () => {
    // 등기 단기(P3b)라면 주택 70% + 상가 50% 혼합이라 「과세표준 전체 × 70%」와 다르다.
    // 미등기는 §104①10호 단일세율이므로 전체에 70%가 걸리고 기본공제도 0이다.
    const r = unreg({ land: D("2021-03-01"), building: D("2021-03-01") });
    expect(r.total?.basicDeduction).toBe(0);
    expect(r.total?.transferTax).toBe(Math.floor((r.total?.taxBase ?? 0) * 0.7));
  });

  it("B-15(회귀): 미등기가 아니면 종전과 같다", () => {
    expect(run({}).total?.transferTax).toBe(160_672_654);
    expect(run({}).total?.basicDeduction).toBe(2_500_000);
  });
});
