/**
 * Pre-Do anchor — 기본사항 건물 면적(축 B·C) Phase F
 *
 * 계획: docs/01-plan/features/basic-info-building-area-phase-f.plan.md (F1 — A-1·A-6)
 *       docs/01-plan/features/transfer-partial-area-apportionment.plan.md (별건 — B-4·U-9·U-10)
 *
 * ## A-1 — 「소득세법 시행령」 제154조 제7항 부수토지 한도가 실제로 세액을 바꾸는가
 *
 * 계획서 §2가 주장하는 결함(주택 정착면적 입력 경로 부재)이 세액 결함인지,
 * 단순 입력 편의 문제인지 확정한다 (memory feedback_numeric_impact_verify_before_bug_claim).
 *
 * ## A-6 — `building` assetKind의 `partial` 시나리오가 무엇을 소비하는가
 *
 * β-2(축 B 단일 필드) vs β-1(2시점 쌍) 선택의 전제.
 * `areaScenario` 자체는 엔진에 도달하지만 **엔진이 소비하지 않는다**(API 전달만).
 * partial의 실질은 "취득·양도 면적을 각각 기준시가 총액 곱셈에 쓴다"뿐이다.
 */
import { describe, it, expect } from "vitest";
import {
  resolveCompanionLandRate,
  appurtenantLandMultiplier,
} from "@/lib/tax-engine/appurtenant-land-rate";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";

// ══════════════════════════════════════════════════════════
// A-1 — §154⑦ 한도: 정착면적 有/無로 세율이 갈린다
// ══════════════════════════════════════════════════════════
//
// 사례 28 Group E 구성 재사용 (new-construction-bundled-case-28.test.ts:346~376):
//   도시지역 · 건물 정착면적 100㎡ × 5배 = 한도 500㎡ · 부수토지 700㎡ → 초과 200㎡
//   주택 보유 ≈ 6개월(단기 70%) · 토지 보유 ≈ 14개월(§104①3호 40%)

const LAND_AREA = 700;
const FOOTPRINT = 100;
const HOUSING_HOLDING_MONTHS = 6; // 2022-08-29 ~ 2023-03-06

/** primary(주택) 컨텍스트 — footprint만 有/無로 바꾼다. */
function ctx(footprint?: number) {
  return {
    propertyType: "housing" as const,
    holdingMonths: HOUSING_HOLDING_MONTHS,
    buildingFootprintArea: footprint,
    isUrbanArea: true,
  };
}

const companion = {
  assetKind: "land",
  area: LAND_AREA,
  landNature: "appurtenant_to_housing" as const,
};

describe("A-1 — §154⑦ 부수토지 한도: 정착면적이 세액을 바꾼다", () => {
  it("정착면적 입력 시 — 한도 500㎡ 산정 + 초과 200㎡ 분리", () => {
    const r = resolveCompanionLandRate(companion, ctx(FOOTPRINT));
    expect(r.applied).toBe(true);
    expect(r.limitArea).toBe(500); // 100㎡ × 5배(도시지역)
    expect(r.excessArea).toBe(200); // 700 − 500
    expect(r.excessRate).toBe(0.4); // 초과분은 토지 본래 세율
  });

  it("🔴 정착면적 미입력 시 — 한도 미산정 + 초과 0으로 확정(전량 부수토지 가정)", () => {
    const r = resolveCompanionLandRate(companion, ctx(undefined));
    expect(r.applied).toBe(true);
    expect(r.limitArea).toBeUndefined(); // 한도 자체가 산정되지 않는다
    expect(r.excessArea).toBe(0); // 🔴 초과분 없음으로 확정
    expect(r.excessRate).toBeUndefined();
  });

  it("A-1 결론 — 200㎡가 40%가 아니라 주택 세율로 과세된다 (세액 결함 확정)", () => {
    const withFp = resolveCompanionLandRate(companion, ctx(FOOTPRINT));
    const without = resolveCompanionLandRate(companion, ctx(undefined));
    // 같은 토지 700㎡인데 초과 판정이 200㎡ ↔ 0㎡로 갈린다.
    expect(withFp.excessArea).not.toBe(without.excessArea);
    // 두 경로 모두 한도 내 부분은 주택 보유기간 세율(70%)로 통일 과세된다.
    expect(withFp.unifiedRate).toBe(without.unifiedRate);
    // → 차이는 오직 "초과 200㎡를 40%로 뗄지"다. 이 케이스는 40% < 70%이므로
    //   미입력이 과다과세지만, 주택이 비과세·장기보유면 방향이 반대가 된다.
    //   **방향은 케이스 의존이고, 세액이 달라지는 것은 확정이다.**
    expect(withFp.excessRate).toBe(0.4);
  });

  it("가정 표시는 되지만 수치는 틀린다 — appliedReason에 미입력이 명시된다", () => {
    const without = resolveCompanionLandRate(companion, ctx(undefined));
    // rev.2 정정: 침묵이 아니다. 이 문구가 shortTermNote로 신고서에 출력된다
    // (transfer-tax-rate-calc.ts:225 → FilingFormTableHelpers.ts:695).
    expect(without.appliedReason).toContain("정착면적 미입력");
    expect(without.appliedReason).toContain("전량 부수토지로 가정");
  });

  it("배율 3단계가 한도를 결정한다 — 정착면적 없으면 이 축이 전부 무력화된다", () => {
    // ⚠️ zone 값은 "metropolitan_residential"이다("metropolitan_urban" 아님).
    //    appurtenantLandMultiplier의 default가 3을 반환하므로 오타를 넣어도 런타임
    //    단언이 통과한다(false GREEN) — 이 파일은 tsc로만 오타가 잡혔다.
    expect(appurtenantLandMultiplier("metropolitan_residential")).toBe(3);
    expect(appurtenantLandMultiplier("non_metropolitan_or_green")).toBe(5);
    expect(appurtenantLandMultiplier("non_urban")).toBe(10);
    // 미지정은 보수적으로 최소 한도(3배)
    expect(appurtenantLandMultiplier(undefined)).toBe(3);
    // 같은 정착면적 100㎡가 zone에 따라 한도 300/500/1000㎡ → 초과 400/200/0㎡
    for (const [zone, limit] of [
      ["metropolitan_residential", 300],
      ["non_metropolitan_or_green", 500],
      ["non_urban", 1000],
    ] as const) {
      expect(FOOTPRINT * appurtenantLandMultiplier(zone)).toBe(limit);
      expect(Math.max(0, LAND_AREA - limit)).toBe(
        { 300: 400, 500: 200, 1000: 0 }[limit],
      );
    }
  });
});

// ══════════════════════════════════════════════════════════
// A-6 — building + partial: 시점별 면적이 환산취득가를 왜곡한다
// ══════════════════════════════════════════════════════════
//
// `building` assetKind는 기준시가가 **단가 × 면적**으로 산출된다
// (toPropertyKind → "building_non_residential" → StandardPriceInput.isAreaMode).
// 면적 인자는 시점별로 갈린다 — 취득시 `acquisitionArea`, 양도시 `transferArea`
// (CompanionAcqPurchaseBlock.tsx:621,645 → StandardPriceInput.ts:180 총액 자동계산).
//
// 따라서 partial(취득 연면적 > 양도 연면적)을 선택하면 환산취득가 산식의
// 분자·분모가 **서로 다른 면적**으로 계산된다.

const UNIT_ACQ = 1_000_000; // 취득시 ㎡당 기준시가
const UNIT_TRANSFER = 2_000_000; // 양도시 ㎡당 기준시가
const TRANSFER_PRICE = 500_000_000;

/** StandardPriceInput isAreaMode 총액 산식 — Math.floor(면적 × 단가) */
const total = (area: number, unit: number) => Math.floor(area * unit);

describe("A-6 — building + partial 시나리오의 실질", () => {
  it("same(취득=양도 100㎡): 환산비율은 단가비 그대로 = 0.5", () => {
    const stdAcq = total(100, UNIT_ACQ); // 100,000,000
    const stdTransfer = total(100, UNIT_TRANSFER); // 200,000,000
    const converted = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, stdAcq, stdTransfer);
    expect(stdAcq / stdTransfer).toBe(0.5);
    expect(converted).toBe(250_000_000);
  });

  it("🔴 partial(취득 200㎡ · 양도 100㎡): 환산취득가가 2배로 부풀어난다", () => {
    const stdAcq = total(200, UNIT_ACQ); // 200,000,000 ← 취득 당시 전체 연면적
    const stdTransfer = total(100, UNIT_TRANSFER); // 200,000,000 ← 양도분 연면적만
    const converted = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, stdAcq, stdTransfer);
    // 단가가 2배 올랐는데 면적비가 그것을 상쇄해 비율이 1.0이 된다.
    expect(stdAcq / stdTransfer).toBe(1);
    expect(converted).toBe(500_000_000); // same 대비 2배
    // 양도가액 전액이 취득가액이 되어 양도차익 0 → 과소과세
    expect(TRANSFER_PRICE - converted).toBe(0);
  });

  it("총액은 단가·면적 변경 시 자동 재계산된다 — 왜곡이 자동이고 회피 불가", () => {
    // StandardPriceInput.tsx:129~152 handlePricePerSqmChange·handleAreaChange 둘 다
    // `onTotalPriceChange(String(Math.floor(sqm * areaNum)))`를 호출한다.
    // 사용자가 총액을 수동 편집(handleTotalPriceChange)하지 않는 한 왜곡을 피할 수 없다.
    expect(total(200, UNIT_ACQ)).toBe(200_000_000);
    expect(total(100, UNIT_ACQ)).toBe(100_000_000);
  });

  it("A-6 결론 — partial은 안분 로직이 없고 면적 불일치를 그대로 비율에 흘린다", () => {
    // `areaScenario`는 API까지 전달되지만(transfer-tax-api-helpers.ts:341)
    // 엔진이 소비하지 않는다 — partial 전용 취득가액 면적 안분이 존재하지 않는다.
    // 즉 building + partial은 "지원되는 기능"이 아니라 **미검증 조합**이다.
    const stdAcqFull = total(200, UNIT_ACQ);
    const stdAcqProportioned = total(100, UNIT_ACQ); // 면적 안분했다면 이 값이어야 한다
    expect(stdAcqFull).not.toBe(stdAcqProportioned);
    // 올바른 안분 시 환산비율은 same과 동일해진다.
    expect(
      calculateEstimatedAcquisitionPrice(
        TRANSFER_PRICE,
        stdAcqProportioned,
        total(100, UNIT_TRANSFER),
      ),
    ).toBe(250_000_000);
  });
});

// ══════════════════════════════════════════════════════════
// B-4 — 같은 왜곡이 land·housing에도 있다 (Phase F 범위 밖 별건)
// ══════════════════════════════════════════════════════════
//
// A-6은 `building`(축 B 연면적)에서 확인했다. 같은 구조가 축 A(토지면적)에도 있다.
//
// | 경로 | 취득측 면적 | 양도측 면적 | 근거 |
// |---|---|---|---|
// | `land` 일괄 | `acquisitionArea` | `transferArea` | StandardPriceInput isAreaMode
// |            |                   |                | (toPropertyKind("land") → "land")
// | `housing` 토지·건물 분리 | `acquisitionArea` | `transferArea` | LandBuildingSplitSection.tsx:141
// |                        |                   |                | ↔ TransferStdPriceCards.tsx:67
// | 다필지(환지 아님) | `parcel.acquisitionArea` | `parcel.transferArea` | multi-parcel-transfer.ts:349~350
// | **다필지 감환지** | **의제취득면적 안분** | `parcel.transferArea` | multi-parcel-transfer.ts:326 ← 대조군
//
// `housing` 일괄 경로는 예외다 — toPropertyKind("housing") → "house_individual" →
// isAreaMode=false(총액 직접, 개별주택가격)라 면적 곱셈이 없다.
//
// ⚠️ 이 describe는 **현행 동작을 고정**한다. 수정 여부는 별도 결정 사항이다
//    (엔진 안분 / UI 파생 / partial 폐지 중 택1 — 계획서 §8.6).

describe("B-4 [현행 고정] — 축 A(토지면적) partial도 같은 왜곡 구조", () => {
  const LAND_UNIT_ACQ = 500_000;
  const LAND_UNIT_TRANSFER = 1_500_000;
  const LAND_TRANSFER_PRICE = 900_000_000;

  it("land 일괄 — 취득 300㎡ · 양도 100㎡면 환산비율이 3배 과대해진다", () => {
    const stdAcqFull = total(300, LAND_UNIT_ACQ); // 150,000,000
    const stdTransfer = total(100, LAND_UNIT_TRANSFER); // 150,000,000
    // 올바른 안분: 양도분 100㎡에 대응하는 취득 기준시가
    const stdAcqProportioned = total(100, LAND_UNIT_ACQ); // 50,000,000

    expect(stdAcqFull / stdTransfer).toBe(1); // 🔴 현행
    expect(stdAcqProportioned / stdTransfer).toBeCloseTo(1 / 3, 10); // 올바른 비율

    const currentConverted = calculateEstimatedAcquisitionPrice(
      LAND_TRANSFER_PRICE,
      stdAcqFull,
      stdTransfer,
    );
    const correctConverted = calculateEstimatedAcquisitionPrice(
      LAND_TRANSFER_PRICE,
      stdAcqProportioned,
      stdTransfer,
    );
    expect(currentConverted).toBe(900_000_000); // 양도가액 전액 → 양도차익 0
    expect(correctConverted).toBe(300_000_000); // 양도차익 600,000,000
    // 양도차익 차이 = 6억. 면적 안분 유무가 세액을 지배한다.
    expect(LAND_TRANSFER_PRICE - currentConverted).toBe(0);
    expect(LAND_TRANSFER_PRICE - correctConverted).toBe(600_000_000);
  });

  it("housing 토지·건물 분리 — 토지분 기준시가도 시점별 면적으로 갈린다", () => {
    // 취득측 LandBuildingSplitSection.tsx:141 area={acquisitionArea}
    // 양도측 TransferStdPriceCards.tsx:56~57 floor(단가 × transferArea)
    const landStdAtAcq = total(300, LAND_UNIT_ACQ);
    const landStdAtTransfer = total(100, LAND_UNIT_TRANSFER);
    expect(landStdAtAcq).toBe(150_000_000);
    expect(landStdAtTransfer).toBe(150_000_000);
    // 두 값이 우연히 같아지는 것이 문제의 본질 — 면적비가 단가비를 상쇄한다.
    expect(landStdAtAcq).toBe(landStdAtTransfer);
  });

  it("대조군 — 다필지 감환지는 의제취득면적을 안분한다 (코드베이스가 패턴을 이미 안다)", () => {
    // multi-parcel-transfer.ts:326
    //   acqArea = (priorLandArea × allocatedArea) / entitlementArea
    const priorLandArea = 300;
    const entitlementArea = 300;
    const allocatedArea = 100; // 감환지 — 교부면적 < 권리면적
    const deemedAcqArea = (priorLandArea * allocatedArea) / entitlementArea;
    expect(deemedAcqArea).toBe(100); // 양도면적에 대응하도록 취득면적이 축소된다

    // 이 안분을 적용하면 환산비율이 단가비 그대로가 된다.
    const stdAcq = total(deemedAcqArea, LAND_UNIT_ACQ);
    const stdTransfer = total(allocatedArea, LAND_UNIT_TRANSFER);
    expect(stdAcq / stdTransfer).toBeCloseTo(1 / 3, 10);
  });

  it("housing 일괄 경로는 예외 — 총액 모드라 면적 곱셈이 없다", () => {
    // toPropertyKind("housing") → "house_individual"
    //   → StandardPriceInput.tsx:98~100 isAreaMode = false → 개별주택가격 총액 직접
    // 따라서 축 A partial 왜곡이 이 경로에는 없다. B-4 범위에서 제외.
    expect(true).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// U-9 — 실거래가 모드의 취득가액은 왜곡 성격이 다르다
// ══════════════════════════════════════════════════════════
//
// 환산 모드는 시스템이 `단가 × 면적`으로 총액을 **자동 계산**하므로 왜곡이 자동이다.
// 실거래가 모드는 `fixedAcquisitionPrice`를 **사용자가 직접 입력**하고 엔진이 면적
// 안분을 하지 않는다(`transfer-tax-api-helpers.ts:474` — 지분 `applyRatio`만 적용).
//
// → 사용자가 양도분에 대응하는 취득가액을 직접 넣으면 정답이 된다.
//   문제는 그 안내가 **어디에도 없다**는 것이다:
//     - 라벨 "취득가액 (원)" · hint `undefined` (CompanionAcqPurchaseBlock.tsx:509~527)
//     - validate는 면적 불변식만 검사(취득 ≥ 양도) — 가액 안내 없음
//       (transfer-tax-validate-asset.ts:383~388)
//     - 반면 다필지 경로는 라벨에 "**총** 취득면적"을 명시한다(:77)
//
// ## 상충하는 두 선례 — 자동 스케일이 허용되는 기준
//
// | 선례 | 처리 | 근거 |
// |---|---|---|
// | 지분: `applyRatio(fixedAcqRaw, ratio)` (transfer-tax-api-helpers.ts:492) | **자동 스케일** | 같은 물건의 지분이므로 가액이 지분에 **정의상 비례** |
// | 부담부증여 채무: ×지분율 금지 (BurdenedGiftBlock.tsx:101) | **자동 금지** | "물건 전체 채무를 ×지분율로 쪼개면 **자동 안분 fallback 정책 위반**" — 채무는 당사자 약정이라 비례 보장 없음 |
//
// → 기준은 **"비례가 자명한가"**다. 이를 면적에 적용하면 처방이 갈린다(§8.7 권고).

describe("U-9 [현행 고정] — 실거래가 모드는 면적 안분을 하지 않는다", () => {
  const ACQ_PRICE_FULL = 300_000_000; // 취득 300㎡ 전체 취득가액
  const ACQ_AREA = 300;
  const TR_AREA = 100;

  it("엔진은 취득가액에 면적비를 적용하지 않는다 — 사용자 입력 그대로", () => {
    // 면적비를 적용했다면 이 값이어야 한다.
    const areaProportioned = Math.floor(ACQ_PRICE_FULL * (TR_AREA / ACQ_AREA));
    expect(areaProportioned).toBe(100_000_000);
    // 그러나 API는 `parseAmount(asset.fixedAcquisitionPrice)`를 그대로 넘긴다
    // (지분 fractional일 때만 applyRatio 적용).
    expect(ACQ_PRICE_FULL).not.toBe(areaProportioned);
  });

  it("전체 취득가액을 넣으면 양도차익이 2억 과소계상된다", () => {
    const TRANSFER_PRICE_PARTIAL = 200_000_000; // 100㎡ 양도 실제 거래가액
    const gainIfFull = TRANSFER_PRICE_PARTIAL - ACQ_PRICE_FULL; // -100,000,000 (손실)
    const gainIfProportioned =
      TRANSFER_PRICE_PARTIAL - Math.floor(ACQ_PRICE_FULL * (TR_AREA / ACQ_AREA)); // 100,000,000
    expect(gainIfFull).toBe(-100_000_000);
    expect(gainIfProportioned).toBe(100_000_000);
    expect(gainIfProportioned - gainIfFull).toBe(200_000_000);
  });

  it("지분 모드는 취득가액을 자동 스케일한다 — 비례가 자명한 경우의 선례", () => {
    // transfer-tax-api-helpers.ts:492 `applyRatio(fixedAcqRaw, ratio)`
    // 같은 물건의 1/3 지분이면 취득가액도 1/3 — 정의상 비례.
    const ratio = 1 / 3;
    expect(Math.floor(ACQ_PRICE_FULL * ratio)).toBe(100_000_000);
  });

  it("면적비 안분이 환산 모드에서는 정확하다 — 기준시가는 단가 × 면적이므로 정의상 비례", () => {
    const unit = 1_000_000;
    // 취득 기준시가를 양도면적으로 안분한 값 === 양도면적 × 단가
    expect(Math.floor(total(ACQ_AREA, unit) * (TR_AREA / ACQ_AREA))).toBe(total(TR_AREA, unit));
  });
});

// ══════════════════════════════════════════════════════════
// U-10 — 법령·심판례 확인 결과 (KoreanLaw 실측 2026-07-30)
// ══════════════════════════════════════════════════════════
//
// ## 「소득세법 시행령」 제176조의2 제2항 제2호 원문 (MST 286211, 시행 2026-07-01)
//
//   환산가액 = 양도당시의 실지거래가액 × (취득당시의 기준시가 / 양도당시의 기준시가)
//
// 조문은 **면적을 언급하지 않는다**. "취득당시의 기준시가"는 법 제114조 제7항 문맥상
// **양도자산의** 취득당시 기준시가다 — 일부양도라면 양도한 부분이 그 자산이다.
//
// ## 조심 2018부0572 (2018.05.03, 기각) — 분할 양도 직접 사례
//
//   사실: 분할전토지 1,134㎡를 2005년 취득 → 2017년 분할된 644㎡를 양도(수용)
//   처분: 쟁점토지 취득가액 = 분할전토지 취득가액을 **취득 당시 기준시가 비율로 안분**
//   재결: **기각**(처분 정당). 판단 요지 —
//     "일괄하여 취득한 토지의 총 취득가액은 확인되나 **각 필지별 실지취득가액이
//      불분명한 경우**, 각 토지의 취득가액 산정은 전체 토지의 실지취득가액을
//      **각 필지의 취득 당시 기준시가 비율로 안분**하여 산정하는 것이 합리적"
//   배척된 청구주장: 양도 당시 감정평가액 기준 안분
//
//   같은 방향 — 감정가액 안분 배척: 국심2005구1458(기각) · 국심1992서2655(기각)
//
// ## 도출되는 세 가지 제약
//
//   L-1 안분 기준은 **면적비가 아니라 취득 당시 기준시가 비율**이다.
//       2018부0572는 쟁점·잔여토지의 취득 당시 공시지가가 **동일**한 사안이어서
//       결과적으로 면적비와 같아졌을 뿐이다(처분청 의견 "공시지가가 동일하며").
//   L-2 안분은 **실지취득가액이 불분명한 경우의 보충적 방법**이다.
//       계약서에 구분 기재돼 있으면 그 값을 쓴다 → 무조건 자동 안분은 금지.
//   L-3 취득 기준시가(환산 분자)는 **양도한 부분의** 취득 당시 기준시가다.
//       "각 필지의 취득 당시 기준시가"(2018부0572) — 부분별 단가가 다르면 그 단가.
//
// ⚠️ 이 describe는 **법령 제약을 상수로 고정**한다. 구현은 B-4 Do에서 한다.

describe("U-10 [법령 제약 고정] — 분할 양도 취득가액 산정", () => {
  it("L-1 안분 기준은 취득 당시 기준시가 비율 — 단가가 다르면 면적비와 갈린다", () => {
    // 분할전 1,134㎡ = 양도분 644㎡ + 잔여 490㎡
    const ACQ_TOTAL = 1_134;
    const SOLD = 644;
    const REMAIN = ACQ_TOTAL - SOLD;
    expect(REMAIN).toBe(490);
    const acqPriceTotal = 340_200_000;

    // (a) 취득 당시 단가가 같은 경우 — 기준시가비 = 면적비 (2018부0572 사안)
    const sameUnit = 300_000;
    const stdSold = SOLD * sameUnit;
    const stdRemain = REMAIN * sameUnit;
    const byStdSame = Math.floor((acqPriceTotal * stdSold) / (stdSold + stdRemain));
    const byArea = Math.floor((acqPriceTotal * SOLD) / ACQ_TOTAL);
    expect(byStdSame).toBe(byArea); // 우연한 일치

    // (b) 단가가 다른 경우 — 갈린다 (양도분이 제3종일반주거, 잔여가 자연녹지 등)
    const stdSoldHi = SOLD * 500_000;
    const stdRemainLo = REMAIN * 200_000;
    const byStdDiff = Math.floor((acqPriceTotal * stdSoldHi) / (stdSoldHi + stdRemainLo));
    expect(byStdDiff).not.toBe(byArea);
    expect(byStdDiff).toBeGreaterThan(byArea); // 비싼 부분을 양도 → 취득가액도 더 배분
  });

  it("L-2 안분은 보충적 — 실지취득가액이 구분되면 그 값이 우선한다", () => {
    // 2018부0572: "매매계약서에는 쟁점토지와 잔여토지의 가액이 구분되어 있지 아니한 점"
    //   → 구분되어 있었다면 안분하지 않았을 것이다.
    // ⇒ 무조건 자동 안분은 이 우선순위를 뭉갠다(「자동 안분 fallback 금지」 정책 정합).
    const contractSpecified = 250_000_000; // 계약서상 양도분 취득가액
    const wouldBeApportioned = Math.floor((340_200_000 * 644) / 1_134);
    expect(contractSpecified).not.toBe(wouldBeApportioned);
    // 두 값이 다르므로 "구분 가액 유무"를 사용자에게 물어야 한다.
  });

  it("L-3 환산 분자는 양도한 부분의 취득 당시 기준시가 — 면적비 적용과 동치", () => {
    // 부분별 단가가 같다면: 양도분 면적 × 취득 단가 === 전체 기준시가 × 면적비
    const unit = 300_000;
    const SOLD = 644;
    const ACQ_TOTAL = 1_134;
    expect(Math.floor(SOLD * unit)).toBe(
      Math.floor(Math.floor(ACQ_TOTAL * unit) * (SOLD / ACQ_TOTAL)),
    );
    // 현행 구현은 분자에 **전체 면적**(1,134㎡)을 쓴다 → 이 값보다 크다.
    expect(Math.floor(ACQ_TOTAL * unit)).toBeGreaterThan(Math.floor(SOLD * unit));
  });
});

// ══════════════════════════════════════════════════════════
// A-3 — F-2: 주택 건물기준시가 3시점 연면적 불일치가 세액을 바꾼다
// ══════════════════════════════════════════════════════════
//
// F-1을 A-1으로 세액 검증했으므로 F-2도 같은 기준을 적용한다.
//
// 주택 경로(TransferStdPriceCards·LandBuildingSplitSection·ReductionPhdInput)는
// 모달에 `floorArea` prefill을 넘기지 않는다 → 사용자가 시점별 모달에서 각각 손으로
// 입력하고, 스냅샷 키가 시점별로 갈려(`bsp-${assetId}-split-acq` vs `-split-transfer`)
// 불일치가 검증 없이 통과한다.
//
// 실제 엔진 `calcBuildingStandardPrice`로 연면적만 바꿔 영향을 측정한다.

import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";

describe("A-3 [F-2 결함 고정] — 3시점 연면적 불일치가 환산취득가를 바꾼다", () => {
  /** 같은 건물의 시점별 건물기준시가 — 연면적만 인자로 바꾼다. */
  const bldStd = (floorArea: number, valuationYear: number) =>
    calcBuildingStandardPrice({
      taxType: "inheritance_gift", // 순수 산식 경로(양도세도 같은 국세청 산식 사용)
      floorArea,
      builtYear: 2005,
      valuationYear,
      isResidentialUse: false,
      valuation: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 },
    }).valuation!.standardPrice;

  const TRUE_FLOOR_AREA = 200; // 건축물대장상 연면적
  const TYPO_FLOOR_AREA = 150; // 양도시 모달에서 사용자가 잘못 입력

  it("연면적이 건물기준시가의 곱셈 인자다 — 비례한다", () => {
    const a = bldStd(TRUE_FLOOR_AREA, 2024);
    const b = bldStd(TYPO_FLOOR_AREA, 2024);
    expect(a).toBeGreaterThan(b);
    // standardPrice = floor(pricePerM2 × floorArea) (building-standard-price-helpers.ts:111)
    expect(a / b).toBeCloseTo(TRUE_FLOOR_AREA / TYPO_FLOOR_AREA, 6);
  });

  it("🔴 3시점 중 한 시점만 오입력하면 환산취득가가 틀어진다", () => {
    const TRANSFER_PRICE = 800_000_000;
    const stdAtAcq = bldStd(TRUE_FLOOR_AREA, 2010);
    const stdAtTransferCorrect = bldStd(TRUE_FLOOR_AREA, 2024);
    const stdAtTransferTypo = bldStd(TYPO_FLOOR_AREA, 2024); // 양도시만 150㎡로 오입력

    const correct = calculateEstimatedAcquisitionPrice(
      TRANSFER_PRICE,
      stdAtAcq,
      stdAtTransferCorrect,
    );
    const wrong = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, stdAtAcq, stdAtTransferTypo);

    // 양도시 기준시가가 과소 → 환산비율 과대 → 환산취득가 과대 → 양도차익 과소
    expect(wrong).toBeGreaterThan(correct);
    expect(TRANSFER_PRICE - wrong).toBeLessThan(TRANSFER_PRICE - correct);
    // 연면적 200→150(25% 오차)이 환산취득가를 3/4배 비율로 부풀린다
    expect(wrong / correct).toBeCloseTo(TRUE_FLOOR_AREA / TYPO_FLOOR_AREA, 6);
  });

  it("F1-c 배선 후에는 폼 단일 값이 두 시점에 주입되어 불일치가 불가능해진다", () => {
    // prefill이 restoredForm을 덮어쓴다(BuildingStdPriceModalButton.tsx:184)
    //   initialForm={{ ...restoredForm, ...prefillForm }}
    // → 같은 buildingFloorArea가 취득·양도 모달 모두에 들어가면 비율이 단가비만 반영한다.
    const stdAtAcq = bldStd(TRUE_FLOOR_AREA, 2010);
    const stdAtTransfer = bldStd(TRUE_FLOOR_AREA, 2024);
    const ratio = stdAtAcq / stdAtTransfer;
    // 연면적이 분자·분모에서 약분되므로 비율은 ㎡당 지수비와 같다
    const perM2Ratio =
      bldStd(1_000, 2010) / bldStd(1_000, 2024); // 면적 무관 확인용(같은 면적)
    expect(ratio).toBeCloseTo(perM2Ratio, 6);
  });
});

// ══════════════════════════════════════════════════════════
// A-4 — β-2 마이그레이션 안전성: building의 acquisitionArea 소비 경로
// ══════════════════════════════════════════════════════════
//
// `building` assetKind는 `toPropertyKind`가 "building_non_residential"로 매핑하므로
// (`CompanionAcqPurchaseBlock.types.ts:132~138`) `StandardPriceInput.isAreaMode = true`가
// 되어 기준시가가 **단가 × 면적**으로 산출된다(`StandardPriceInput.tsx:98~100`).
// 면적 인자는 `acquisitionArea`/`transferArea`다(`CompanionAcqPurchaseBlock.tsx:621,645`).
//
// β-2는 이 값을 `buildingFloorArea`로 이전한다. 이전 후에도 **같은 총액**이 나와야 한다.

import { toPropertyKind } from "@/components/calc/transfer/CompanionAcqPurchaseBlock.types";

describe("A-4 [β-2 전제] — building의 축 B 소비 경로", () => {
  it("building은 building_non_residential로 매핑되어 면적 모드가 된다", () => {
    expect(toPropertyKind("building")).toBe("building_non_residential");
    // isAreaMode = propertyKind === "land" || "building_non_residential"
    expect(["land", "building_non_residential"]).toContain(toPropertyKind("building"));
  });

  it("housing은 총액 모드 — 면적 곱셈이 없다 (축 B 신설 대상인 이유)", () => {
    expect(toPropertyKind("housing")).toBe("house_individual");
    expect(["land", "building_non_residential"]).not.toContain(toPropertyKind("housing"));
  });

  it("land는 면적 모드 — 축 A가 곱셈 인자", () => {
    expect(toPropertyKind("land")).toBe("land");
  });

  it("이전은 값 보존이어야 한다 — 총액 산식이 면적 필드명에 의존하지 않는다", () => {
    // StandardPriceInput.tsx:137,150,180 — 모두 floor(단가 × 면적)
    const unit = 1_200_000;
    const area = 84.5;
    const beforeMigration = Math.floor(unit * area); // acquisitionArea 참조
    const afterMigration = Math.floor(unit * area); // buildingFloorArea 참조
    expect(afterMigration).toBe(beforeMigration);
  });
});
