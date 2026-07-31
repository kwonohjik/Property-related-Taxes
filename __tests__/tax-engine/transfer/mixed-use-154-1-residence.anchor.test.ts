/**
 * anchor: 겸용주택 1세대1주택 비과세 — 영 §154① **거주요건 + 단서 각호 면제** (Phase A · E-1·E-3).
 *
 * 계획서: docs/02-design/features/transfer-mixed-use-residence-surcharge.plan.md §4
 *
 * 선행 P3a(`mixed-use-154-1-holding.anchor.test.ts`)는 **보유** 2년만 판정했다. 이 파일은 나머지 두 축을 고정한다.
 *
 * [법령 — 「소득세법 시행령」 제154조 제1항, MST 286211 · 시행 2026-07-01 · 2026-07-31 법제처 실측]
 *
 *   본문: "…해당 주택의 보유기간이 2년 이상인 것[**취득 당시에** …**조정대상지역**에 있는 주택의
 *          경우에는 해당 주택의 보유기간이 2년 이상이고 그 보유기간 중 **거주기간이 2년 이상**인 것]"
 *
 *   단서: "다만, … **제1호부터 제3호까지**의 어느 하나에 해당하는 경우에는 그 **보유기간 및
 *          거주기간의 제한을 받지 않으며** 제5호에 해당하는 경우에는 **거주기간의 제한을 받지 않는다.**"
 *          1호 임대주택 세대전원 거주 5년 / 2호 가목 수용 등 / 3호 1년 이상 거주 + 부득이한 사유 /
 *          5호 조정대상지역 공고일 이전 계약 + 계약금 지급 + 무주택
 *
 * 🔴 **E-3 — 이미 배포된 결함(PR #937 P3a)**: P3a의 보유 판정에는 단서가 없어
 *    (`meetsExemptionHolding = years >= minHoldingYears`), 단서 1~3호에 해당하는데도
 *    보유 2년 미만이면 비과세가 배제됐다 → **과다과세**. B-A7이 이를 고정한다.
 *    정본 `meetsOneHouseHoldingResidence`(`transfer-tax-exemption.ts:224-232`)는
 *    `proviso === "both" || holding.years >= …` 로 이미 올바르다.
 *
 * ⚠️ 거주연수 입력은 **연 단위**다(`residencePeriodYears`). API 변환이
 *    `Math.floor(months / 12)`로 이미 절사해 보낸다(`transfer-tax-api-mixed-use.ts:168`).
 *    §154⑧3호 동일세대 상속 통산분은 `table2ResidencePeriodYears`(통산 완료값)에 담긴다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
/** 중과 한시배제(~2026-05-09) 종료 후 — Phase B와 동일 축을 쓰기 위해 통일 */
const TRANSFER_DATE = D("2026-06-01");
const PRICE = 3_000_000_000;

/**
 * ⚠️ **건물 취득일을 2018-06-01로 덮어쓴다.** CASE14 원본은 1997-09-12인데, §154① 거주요건에는
 *   부칙(대통령령 제28293호) 적용례 — **2017-08-03 이전 취득은 조정대상지역이어도 거주요건 면제**
 *   — 가 있어(`transfer-tax-exemption.ts:182-190` · `rule.prePolicyDate`) 원본 날짜로는
 *   거주요건이 **영원히 충족 처리**되어 아무것도 검증하지 못한다. B-A0이 그 경과규정 자체를 고정한다.
 */
const POST_POLICY_ACQ = D("2018-06-01");

function run(over: Partial<MixedUseAssetInput> = {}) {
  return calcMixedUseTransferTax(
    PRICE,
    TRANSFER_DATE,
    {
      ...mixedUseCase14(),
      residencePeriodYears: 0,
      buildingAcquisitionDate: POST_POLICY_ACQ,
      ...over,
    },
    makeMockRates(),
  );
}

/** 비과세 유지 시 주택 소득금액(12억 초과분 안분) — 보유 8년·거주 0년 */
const EXEMPT_HOUSING_INCOME = 257_630_000;
const EXEMPT_TAX = 331_360_256;
/** 비과세 배제 시 주택 소득금액(양도차익 전액 − 장특 14%) */
const TAXED_HOUSING_INCOME = 1_239_354_676;
const TAXED_TAX = 769_372_093;

describe("Phase A — 영 §154① 거주요건 (E-1)", () => {
  it("B-A0: 2017-08-03 **이전** 취득은 조정대상지역이어도 거주요건 면제 (부칙 경과규정)", () => {
    // CASE14 원본 건물 취득일(1997-09-12) — 조정지역·거주 0년인데도 비과세가 유지되어야 한다.
    const r = run({ buildingAcquisitionDate: D("1997-09-12"), wasRegulatedAtAcquisition: true });
    expect(r.housingPart.incomeAmount).toBeLessThan(r.housingPart.transferGain);
    // 조정지역 여부와 무관하게 같은 값이어야 한다 — 경과규정이 거주요건을 통째로 면제하므로.
    expect(r.total.transferTax).toBe(313_306_431);
    expect(run({ buildingAcquisitionDate: D("1997-09-12"), wasRegulatedAtAcquisition: false })
      .total.transferTax).toBe(313_306_431);
  });

  it("B-A1: 취득 당시 조정대상지역 + 거주 0년 → 비과세 배제 (본문 후단)", () => {
    const r = run({ wasRegulatedAtAcquisition: true });
    // 비과세가 배제되면 주택분 양도차익 전액이 과세로 들어온다(12억 안분 없음).
    expect(r.housingPart.incomeAmount).toBe(TAXED_HOUSING_INCOME);
    expect(r.total.transferTax).toBe(TAXED_TAX);
  });

  it("B-A2(회귀): 취득 당시 **비**조정지역 + 거주 0년 → 거주요건 자체가 없다", () => {
    const r = run({ wasRegulatedAtAcquisition: false });
    expect(r.housingPart.incomeAmount).toBe(EXEMPT_HOUSING_INCOME);
    expect(r.total.transferTax).toBe(EXEMPT_TAX);
  });

  it("B-A2b(회귀): 조정지역 입력 **미주입**(undefined) → 비조정과 동일 (fallback 안전)", () => {
    expect(run({}).total.transferTax).toBe(EXEMPT_TAX);
  });

  it("B-A3: 조정대상지역 취득이어도 **실거주** 2년 이상이면 비과세 유지 + 표2 적용", () => {
    const r = run({ wasRegulatedAtAcquisition: true, residencePeriodYears: 2 });
    expect(r.housingPart.longTermDeductionTable).toBe(2);
    expect(r.total.transferTax).toBe(303_648_926);
  });

  it("B-A5: 거주요건은 **§154⑧3호 통산값**(table2ResidencePeriodYears)으로 판정한다", () => {
    // 실거주 0년이지만 동일세대 상속 통산 2년 → 요건 충족. 실거주만 봤다면 배제됐을 것이다.
    // (표2 '거주분 공제율'은 실거주 0년이라 붙지 않는다 — 대상판정/공제율 분리, 사전법령해석재산 2021-202)
    const consolidated = run({ wasRegulatedAtAcquisition: true, table2ResidencePeriodYears: 2 });
    expect(consolidated.housingPart.longTermDeductionTable).toBe(2);
    expect(consolidated.total.transferTax).toBe(314_211_807);

    // 통산이 1년이면 여전히 미충족 — **이중 통산이 없음**을 반증한다
    // (한 번 더 더해졌다면 2년이 되어 충족했을 것이다).
    expect(run({ wasRegulatedAtAcquisition: true, table2ResidencePeriodYears: 1 }).total.transferTax)
      .toBe(TAXED_TAX);
  });

  it("B-A6: 거주 1년 / 2년 경계 — 연 단위 입력에서 양방향 고정", () => {
    expect(run({ wasRegulatedAtAcquisition: true, residencePeriodYears: 1 }).total.transferTax)
      .toBe(TAXED_TAX); // 미충족
    expect(run({ wasRegulatedAtAcquisition: true, residencePeriodYears: 2 }).total.transferTax)
      .toBe(303_648_926); // 충족
  });
});

describe("Phase A — 영 §154① 단서 각호 면제 (E-3)", () => {
  /** 2호 가목 수용 — 수용일부터 5년 이내 양도 */
  const EXPROPRIATION: Partial<MixedUseAssetInput> = {
    oneHouseExemptionProviso: { reason: "expropriation", expropriationDate: D("2024-01-01") },
  };
  /** 보유 1년(= §154① 보유요건 미충족) — 토지·건물 동시 취득 */
  const SHORT_HOLD: Partial<MixedUseAssetInput> = {
    landAcquisitionDate: D("2025-06-01"),
    buildingAcquisitionDate: D("2025-06-01"),
  };
  const SHORT_HOLD_TAXED_TAX = 1_495_427_008;

  it("B-A4: 단서 2호가(수용) → 조정지역 취득·거주 0년이어도 **거주요건 면제**", () => {
    const r = run({ wasRegulatedAtAcquisition: true, ...EXPROPRIATION });
    expect(r.housingPart.incomeAmount).toBe(EXEMPT_HOUSING_INCOME);
    expect(r.total.transferTax).toBe(EXEMPT_TAX);
  });

  it("B-A4b: 수용일 **미입력**이면 단서 미적용 (fail-closed) — 요건을 판정할 수 없으면 특례 없음", () => {
    // transfer-tax-exemption.ts:88 — `if (!p.expropriationDate) return null`
    const r = run({
      wasRegulatedAtAcquisition: true,
      oneHouseExemptionProviso: { reason: "expropriation" },
    });
    expect(r.total.transferTax).toBe(TAXED_TAX);
  });

  it("B-A4c: 수용일부터 5년 **초과** 양도면 단서 미적용", () => {
    const r = run({
      wasRegulatedAtAcquisition: true,
      oneHouseExemptionProviso: { reason: "expropriation", expropriationDate: D("2020-01-01") },
    });
    expect(r.total.transferTax).toBe(TAXED_TAX);
  });

  it("🔴 B-A7 (E-3): 단서 2호가(수용) + **보유 1년** → 비과세 유지 — 단서는 **보유요건도** 면제한다", () => {
    // P3a(PR #937)는 단서를 무시해 이 케이스를 과세했다(과다과세).
    const r = run({ ...SHORT_HOLD, ...EXPROPRIATION });
    expect(r.housingPart.incomeAmount).toBe(314_371_438); // 12억 초과분 안분 — 비과세 살아 있음
    expect(r.total.transferTax).toBe(656_866_515);
    // 단서가 없으면 여전히 전액 과세여야 한다(게이트가 과도하게 열리지 않았음).
    expect(run({ ...SHORT_HOLD }).housingPart.incomeAmount).toBe(1_512_314_999);
  });

  it("B-A8(회귀): 단서 **미입력** + 보유 1년 → 비과세 배제 유지 (P3a 동작 불변)", () => {
    const r = run({ ...SHORT_HOLD });
    expect(r.total.transferTax).toBe(SHORT_HOLD_TAXED_TAX);
    expect(r.warnings.some((w) => w.includes("§154"))).toBe(true);
  });

  it("B-A9: 단서 5호(공고전계약)는 **거주만** 면제 — 보유 1년이면 여전히 배제", () => {
    const PRE_CONTRACT: Partial<MixedUseAssetInput> = {
      oneHouseExemptionProviso: { reason: "pre_designation_contract" },
    };
    // 보유 미충족은 그대로 — 5호는 보유요건을 면제하지 않는다(B-A7과 대비되는 반증).
    expect(run({ ...SHORT_HOLD, ...PRE_CONTRACT }).total.transferTax).toBe(SHORT_HOLD_TAXED_TAX);
    // 보유 충족 + 조정지역 + 거주 0년이면 거주만 면제되어 비과세 유지.
    expect(run({ wasRegulatedAtAcquisition: true, ...PRE_CONTRACT }).total.transferTax)
      .toBe(EXEMPT_TAX);
  });
});
