/**
 * F-04 Pre-Do anchor — ㎡당 금액의 잔가율·조정률 곱이 IEEE754 float라 1,000원 절사가 한 칸 내려간다.
 *
 * ## 결함
 * `lib/tax-engine/building-standard-price-helpers.ts:156-163`
 * ```
 *   const indexProduct = safeMultiply(safeMultiply(safeMultiply(basePrice, structureIndex), usageIndex), locationIndex);
 *   const perM2Base = indexProduct / 1_000_000;          // ← 여기서 정수를 벗어난다
 *   const raw = perM2Base * residualRate * adjustmentRate; // ← float × float × float
 *   const { pricePerM2, standardPrice } = stdPriceFromPerM2(raw, floorArea);
 * ```
 * `stdPriceFromPerM2`(:106-112)는 `truncateToThousand(rawPerM2)` = `Math.floor(x/1000)*1000`이므로,
 * float 곱이 정확값보다 1 ulp라도 아래로 떨어지면 **1,000원이 통째로 사라지고 연면적만큼 배가된다**.
 * 소스 주석의 "정수곱(부동소수 누적 회피)"는 **지수 3개까지만** 적용되어 있다 — 잔가율·조정률은 float다.
 *
 * ## 정확값(정수 분수)
 * ```
 *   ㎡당(절사 전) = indexProduct × R × N ÷ (10^6 × 10^4 × 100^k)
 *     indexProduct = 신축가격기준액 × 구조지수 × 용도지수 × 위치지수   (정수)
 *     R            = 잔가율 × 10,000                                  (정수 — 아래 근거)
 *     N ÷ 100^k    = 조정률                                            (정수 분자 ÷ 100^k)
 *   pricePerM2 = floor(indexProduct × R × N ÷ (10^13 × 100^k)) × 1,000
 * ```
 * - **R이 정수인 근거**: `data/building-standard-price/residual-rate.ts:101-110`
 *   `calcResidualRateByDurable`가 `Math.round(max(1−e·step, min) × 10000) / 10000`로 **소수 4자리 양자화**한다.
 * - **N/100^k이 정수 분수인 근거**: `building-standard-price-helpers.ts:645-653`
 *   `calcSpecialAdjustmentRate` = `sel.reduce((acc,s) => acc*s.rate, 1) / 100 ** sel.length`.
 *   직접입력 경로는 `building-standard-price.ts:268` `manualAdjustmentRate / 100`(k=1).
 * - **BigInt가 필요한 이유**: indexProduct 최대 6,339,060,000,000 × R(≤11,800) × N(≤1.13e14) ≈ **8.5e30**
 *   ≫ `Number.MAX_SAFE_INTEGER`(9.007e15). 기대값을 float로 계산하면 anchor가 같은 결함을 타므로 금지.
 *
 * ## ⚠️ 이 파일은 F-04 수정 전에는 실패한다 — 의도된 Pre-Do anchor다.
 * §1 재현 5건과 §2 격자 정확성은 **지금 실패**하고, §2 단방향성과 §3 역방향 가드는 **지금 통과**한다.
 * 실측(2026-08-26): 조정률 미적용 전수격자 36,621,016셀 중 **286셀 발산, 전건 −1,000원 단방향**
 * (`exact − engine` 값집합 = {1000}, 역방향 0건).
 *
 * ## 법령·고시
 * 위임근거는 소득세법 시행령 제164조 제5항·제8항 및 상속세 및 증여세법 제61조 제1항 제2호이고,
 * ㎡당 금액 산식과 1,000원 미만 절사는 국세청 「건물 기준시가 계산방법」 고시가 정한다.
 * **고시 본문 미확인** — 이번 리뷰에서 고시 원문을 확보하지 못했다. 따라서 이 anchor가 단언하는 것은
 * 「고시가 명한 정확값」이 아니라 **저장소가 이미 채택한 정수 규약의 일관 적용**이다:
 *   - CLAUDE.md 「정수 연산: 세율 × 금액 직후 `Math.floor()`. `Math.round()` 금지」
 *   - `building-standard-price-helpers.ts:156` 주석 「정수곱(부동소수 누적 회피)」
 *   - 선례 `same-adjustment-period-std-price.ts:195-201` 「`Math.floor(first * rate)`는 부동소수 곱이라
 *     **1원 적게** 나올 수 있다」 → `applyRateFraction(first, Math.round(rate*1e8), 1e8)`
 * 고시가 중간 단계 반올림을 별도로 규정한다면 §1·§2의 기대값을 재검토해야 한다.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
} from "@/lib/tax-engine/building-standard-price";
import {
  resolveNewBuildingBasePrice,
  listStructureOptions,
  listUsageOptions,
  resolveLocationIndex,
  resolveResidualGroupForYear,
  durableForGroup,
} from "@/lib/tax-engine/data/building-standard-price";

// ────────────────────────────────────────────────────────────────
// 독립 오라클 — BigInt 정수 분수 (엔진 산식 재구현이 아니라 정의 그대로)
// ────────────────────────────────────────────────────────────────
/**
 * pricePerM2 = floor(indexProduct × R × adjNumer ÷ (10^13 × adjDenom)) × 1,000
 * (10^13 = 10^6 지수분모 × 10^4 잔가율분모 × 10^3 절사단위)
 */
function exactPricePerM2(indexProduct: bigint, R: bigint, adjNumer = 1n, adjDenom = 1n): number {
  return Number((indexProduct * R * adjNumer) / (10n ** 13n * adjDenom)) * 1_000;
}

describe("F-04 ㎡당 금액 float 절사 — §1 재현 사례 (수정 전 실패)", () => {
  // ── C-1 ──────────────────────────────────────────────────────
  // 양도 · 취득시 2001 · 목구조 · 용도1 · 개별공시지가 504,027 · 신축1980 · 500㎡
  // 고시 산식: 400,000(신축가격기준액) × 100(구조) × 100(용도) × 100(위치) × 0.58(잔가율)
  //   indexProduct = 400,000 × 100 × 100 × 100 = 400,000,000,000
  //   ㎡당(절사 전) = 400,000,000,000 × 5,800 ÷ 10^10 = 232,000  ← 정확히 정수
  //   → 1,000원 절사 = 232,000 / 기준시가 = 232,000 × 500 = 116,000,000
  // 현행: float raw = 400,000 × 0.58 = 231,999.99999999997 → 231,000 / 115,500,000 (500,000 과소)
  // 잔가율 0.58 근거: 2001년은 3그룹 era(≤2002) — I그룹 내용연수 40년·잔존율 0.20 → step 0.02,
  //   경과 21년(2001−1980) → 1 − 21×0.02 = 0.58.
  it("C-1 양도 2001·목구조·용도1 (조정률 미적용) → ㎡당 232,000 / 기준시가 116,000,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 500,
      builtYear: 1980,
      singleTimePoint: "acquisition",
      acquisitionYear: 2001,
      acquisition: { structureKey: "wood_frame", usageNo: 1, landPricePerM2: 504_027 },
    };
    const b = calcBuildingStandardPrice(input).acquisition;
    // 지수·잔가율 echo — 위 주석의 산식이 실제 데이터와 일치함을 고정(데이터 개정 드리프트 감지)
    expect([b?.basePrice, b?.structureIndex, b?.usageIndex, b?.locationIndex, b?.residualRate]).toEqual([
      400_000, 100, 100, 100, 0.58,
    ]);
    expect(exactPricePerM2(400_000_000_000n, 5_800n)).toBe(232_000); // 오라클 자기검증
    expect(b?.pricePerM2).toBe(232_000);
    expect(b?.standardPrice).toBe(116_000_000);
  });

  // ── C-2 ──────────────────────────────────────────────────────
  // 상속·증여 · 평가 2025 · 철근콘크리트 · 용도49 · 공시지가 650,000 · 신축2015 · 300㎡
  // 고시 산식: 850,000 × 100 × 300 × 100 × 0.82
  //   indexProduct = 2,550,000,000,000 → × 8,200 ÷ 10^10 = 2,091,000
  //   기준시가 = 2,091,000 × 300 = 627,300,000
  // 현행: 2,090,000 / 627,000,000 (300,000 과소)
  // 잔가율 0.82: 2025 I그룹 내용연수 50년·잔존율 0.10 → step 0.018, 경과 10년 → 1 − 0.18 = 0.82.
  it("C-2 상증 2025·철근콘크리트·용도49 (비주거 → 구분 II 연면적 자동) → ㎡당 1,881,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 300,
      builtYear: 2015,
      valuationYear: 2025,
      valuation: { structureKey: "rc", usageNo: 49, landPricePerM2: 650_000 },
    };
    const b = calcBuildingStandardPrice(input).valuation;
    expect([b?.basePrice, b?.structureIndex, b?.usageIndex, b?.locationIndex, b?.residualRate]).toEqual([
      850_000, 100, 300, 100, 0.82,
    ]);
    // 조정률 전(前) ㎡당 — float 절사 축의 검증 대상은 이 값이다.
    expect(exactPricePerM2(2_550_000_000_000n, 8_200n)).toBe(2_091_000);
    // ⚠️ 비주거라 **구분 II 연면적(#9 90)이 자동 적용**된다(F-09, 고시 제11조 — 적용범위에
    //    용도 제한이 없다). 종전에는 `specialFeatures` 미제공을 「조정률 미적용」으로 읽었다.
    expect(b?.adjustmentRate).toBe(0.9);
    expect(b?.pricePerM2).toBe(1_881_000);
    expect(b?.standardPrice).toBe(564_300_000);
  });

  // ── C-3 ── 실측 최대 오차(연면적 1,000㎡ → 기준시가 1,000,000원 과소) ─────────
  // 양도 · 취득시 2014 · 철근콘크리트 · 용도47 · 공시지가 10,000 · 신축1999 · 1,000㎡
  // 고시 산식: 640,000 × 100 × 300 × 75 × 0.70
  //   indexProduct = 1,440,000,000,000 → × 7,000 ÷ 10^10 = 1,008,000
  //   기준시가 = 1,008,000 × 1,000 = 1,008,000,000
  // 현행: 1,007,000 / 1,007,000,000 (1,000,000 과소)
  // 잔가율 0.70: 2014 II그룹 내용연수 40년·잔존율 0.20(2016년 전) → step 0.02, 경과 15년 → 0.70.
  it("C-3 양도 2014·철근콘크리트·용도47 (1,000㎡ — 최대 오차) → ㎡당 1,008,000 / 기준시가 1,008,000,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 1_000,
      builtYear: 1999,
      singleTimePoint: "acquisition",
      acquisitionYear: 2014,
      acquisition: { structureKey: "rc", usageNo: 47, landPricePerM2: 10_000 },
    };
    const b = calcBuildingStandardPrice(input).acquisition;
    expect([b?.basePrice, b?.structureIndex, b?.usageIndex, b?.locationIndex, b?.residualRate]).toEqual([
      640_000, 100, 300, 75, 0.7,
    ]);
    expect(exactPricePerM2(1_440_000_000_000n, 7_000n)).toBe(1_008_000);
    expect(b?.pricePerM2).toBe(1_008_000);
    expect(b?.standardPrice).toBe(1_008_000_000);
  });

  // ── C-4 ── 조정률 생산자 ① `manualAdjustmentRate`(building-standard-price.ts:268 `ratePercent/100`) ──
  // 상속·증여 · 평가 2001 · 목구조 · 용도1 · 공시지가 500,000 · 신축2001 · 300㎡ · 조정률 58%
  // 고시 산식: 400,000 × 100 × 100 × 100 × 1.00(잔가율·경과0) × 0.58(조정률)
  //   ㎡당 = 400,000,000,000 × 10,000 × 58 ÷ (10^10 × 100) = 232,000
  //   기준시가 = 232,000 × 300 = 69,600,000
  // 현행: 231,000 / 69,300,000 (300,000 과소)
  it("C-4 상증 조정률 직접입력 58% → ㎡당 232,000 / 기준시가 69,600,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 300,
      builtYear: 2001,
      valuationYear: 2001,
      valuation: { structureKey: "wood_frame", usageNo: 1, landPricePerM2: 500_000 },
      manualAdjustmentRate: 58,
    };
    const b = calcBuildingStandardPrice(input).valuation;
    expect([b?.basePrice, b?.structureIndex, b?.usageIndex, b?.locationIndex, b?.residualRate]).toEqual([
      400_000, 100, 100, 100, 1,
    ]);
    expect(b?.adjustmentRate).toBe(0.58);
    expect(exactPricePerM2(400_000_000_000n, 10_000n, 58n, 100n)).toBe(232_000);
    expect(b?.pricePerM2).toBe(232_000);
    expect(b?.standardPrice).toBe(69_600_000);
  });

  // ── C-5 ── 조정률 생산자 ② `calcSpecialAdjustmentRate`(helpers.ts:648-653, k=2 → 분모 100²) ──
  // 상속·증여 · 평가 2015 · 목구조 · 용도2 · 공시지가 650,000 · 신축2015 · 300㎡
  //   조정률 특성 = 9. 연면적 1천㎡ 미만(90) & 37. 화재·멸실 정상사용면적비율 0.32(→32)
  //   → 조정률 = 90 × 32 ÷ 100² = 2,880 ÷ 10,000 = 0.288
  // 고시 산식: 650,000 × 125 × 100 × 100 × 1.00 × 0.288
  //   indexProduct = 812,500,000,000 → × 10,000 × 2,880 ÷ (10^10 × 10,000) = 234,000
  //   기준시가 = 234,000 × 300 = 70,200,000
  // 현행: 233,000 / 69,900,000 (300,000 과소)
  it("C-5 상증 조정률 특성(9 × 37 = 0.288) → ㎡당 234,000 / 기준시가 70,200,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 300,
      builtYear: 2015,
      valuationYear: 2015,
      // ⚠️ 용도번호는 **비주거**여야 한다 — 주거용(#1~2)이면 구분 II 가 통째로 빠져
      //    「9 × 37」 축 자체가 가려진다(F-09, 고시 제11조 구분 II 단서).
      valuation: { structureKey: "wood_frame", usageNo: 42, landPricePerM2: 650_000 }, // 근생(2015 체계, 용도지수 100)
      specialFeatures: { normalUseRatio: 0.32 },
    };
    const b = calcBuildingStandardPrice(input).valuation;
    expect([b?.basePrice, b?.structureIndex, b?.usageIndex, b?.locationIndex, b?.residualRate]).toEqual([
      650_000, 125, 100, 100, 1,
    ]);
    expect(b?.adjustmentRate).toBe(0.288);
    expect(exactPricePerM2(812_500_000_000n, 10_000n, 2_880n, 10_000n)).toBe(234_000);
    expect(b?.pricePerM2).toBe(234_000);
    expect(b?.standardPrice).toBe(70_200_000);
  });
});

// ────────────────────────────────────────────────────────────────
// §2 격자 — 단방향성 + 전 표본 정확성
// ────────────────────────────────────────────────────────────────
/**
 * 표본 격자 (전수 36,621,016셀 중 **2,460,322셀**, 실행 약 1.3초):
 *   평가연도 5종 × 구조 `listStructureOptions(year)` 전건 × 용도 `listUsageOptions(year)` 전건
 *   × 개별공시지가 13종(위치지수 구간 중복 제거) × 경과연수 0..내용연수 전건
 *
 * **표본에 실제 발산 조합이 들어 있다** — 전수 스캔 286건 중 **203건**이 이 표본 안에 있고,
 * 그중 5건은 아래 `KNOWN_DIVERGENT`로 못 박아 「격자를 줄여서 통과시키는」 회피를 차단한다.
 * (1차 리뷰가 연도 2015~2024·용도 1~20으로 격자를 좁혀 「발산 0건」이라 오판한 실패의 재발 방지.)
 *
 * 연도 선정 근거 — 잔가율 era를 모두 태운다:
 *   2001 = 3그룹 era(≤2002, 내용연수 40/30/20·잔존율 0.20) · 2005 = 4그룹 era 초기(50년·잔존율 0.20)
 *   2014 = 잔존율 0.20 후기 · 2016 = 50/40년 잔존율 0.10 전환 · 2025 = 현행
 * 공시지가에 0을 쓰지 않는 이유: 진입점 `validatePoint`(building-standard-price.ts:58)가
 *   `landPricePerM2 > 0`을 요구한다 — 0은 공개 경로로 도달 불가. 최저 구간은 1원으로 관측한다.
 */
const GRID_YEARS = [2001, 2005, 2014, 2016, 2025] as const;
const GRID_LAND_PRICES = [
  1, 50_000, 150_000, 500_000, 650_000, 800_000, 1_200_000,
  2_500_000, 5_000_000, 7_000_000, 10_000_000, 30_000_000, 60_000_000,
] as const;

/** 실측으로 확인된 발산 조합 — 표본이 이들을 실제로 방문했는지 검증한다(격자 축소 방지). */
const KNOWN_DIVERGENT = [
  { year: 2001, structureKey: "wood_frame", usageNo: 1, landPricePerM2: 500_000, builtYear: 1980 },
  { year: 2001, structureKey: "stone", usageNo: 2, landPricePerM2: 500_000, builtYear: 1986 },
  { year: 2014, structureKey: "ramen", usageNo: 20, landPricePerM2: 800_000, builtYear: 1993 },
  { year: 2016, structureKey: "prefab_panel", usageNo: 10, landPricePerM2: 650_000, builtYear: 2006 },
  { year: 2025, structureKey: "rc", usageNo: 49, landPricePerM2: 650_000, builtYear: 2015 },
] as const;

interface GridScan {
  cells: number;
  /** 엔진 결과 > 정확값 (역방향 — 항상 0이어야 한다) */
  overCount: number;
  overSamples: string[];
  /** 엔진 결과 ≠ 정확값 (수정 후 0) */
  divergedCount: number;
  divergedSamples: string[];
  /** 방문한 KNOWN_DIVERGENT 인덱스 */
  visitedKnown: number[];
}

function scanGrid(): GridScan {
  const out: GridScan = {
    cells: 0,
    overCount: 0,
    overSamples: [],
    divergedCount: 0,
    divergedSamples: [],
    visitedKnown: [],
  };
  const visited = new Set<number>();

  for (const year of GRID_YEARS) {
    const basePrice = resolveNewBuildingBasePrice(year);
    if (basePrice === undefined) throw new Error(`신축가격기준액 미수록 연도 ${year}`);
    // 위치지수 구간 중복 제거(같은 지수를 주는 공시지가는 1개만)
    const locations: { price: number; index: number }[] = [];
    const seenIndex = new Set<number>();
    for (const price of GRID_LAND_PRICES) {
      const index = resolveLocationIndex(year, price);
      if (index === undefined || seenIndex.has(index)) continue;
      seenIndex.add(index);
      locations.push({ price, index });
    }

    for (const structure of listStructureOptions(year)) {
      const durable = durableForGroup(resolveResidualGroupForYear(structure.key, year), year);
      for (const usage of listUsageOptions(year)) {
        for (const loc of locations) {
          const indexProduct = BigInt(basePrice) * BigInt(structure.index) * BigInt(usage.index) * BigInt(loc.index);
          const watch = KNOWN_DIVERGENT.map((k, i) => ({ k, i })).filter(
            ({ k }) =>
              k.year === year &&
              k.structureKey === structure.key &&
              k.usageNo === usage.no &&
              k.landPricePerM2 === loc.price,
          );

          for (let elapsed = 0; elapsed <= durable; elapsed++) {
            const builtYear = year - elapsed;
            out.cells++;
            for (const { k, i } of watch) if (k.builtYear === builtYear) visited.add(i);

            const b = calcBuildingStandardPrice({
              taxType: "transfer",
              floorArea: 100,
              builtYear,
              singleTimePoint: "acquisition",
              acquisitionYear: year,
              acquisition: { structureKey: structure.key, usageNo: usage.no, landPricePerM2: loc.price },
            }).acquisition;
            if (!b) throw new Error("취득시 breakdown 미반환");
            // 일반 건물은 항상 ㎡당 금액이 있다(없는 것은 기계식주차 전용 — 이 격자에 없음)
            const got = b.pricePerM2;
            if (got === undefined) throw new Error("취득시 ㎡당 금액 미반환");

            // 잔가율은 residual-rate.ts에서 소수 4자리로 양자화되어 있다(round-trip 무손실 — 실측 184종 0건 손실)
            const R = BigInt(Math.round(b.residualRate * 10_000));
            const exact = exactPricePerM2(indexProduct, R);
            const where = `${year}·${structure.key}·용도${usage.no}·지가${loc.price}·신축${builtYear}`;

            if (got > exact) {
              out.overCount++;
              if (out.overSamples.length < 10) out.overSamples.push(`${where}: 엔진 ${got} > 정확 ${exact}`);
            }
            if (got !== exact) {
              out.divergedCount++;
              if (out.divergedSamples.length < 10) out.divergedSamples.push(`${where}: 엔진 ${got} ≠ 정확 ${exact}`);
            }
          }
        }
      }
    }
  }
  out.visitedKnown = [...visited].sort((a, b) => a - b);
  return out;
}

describe("F-04 ㎡당 금액 float 절사 — §2 격자(단방향성 + 정확성)", () => {
  let grid: GridScan;
  // 2,460,322셀 × (엔진 BigInt 산술 + 정수분수 정확값) — 기본 hook 타임아웃 10초를 넘는다.
  // 격자를 줄이면 아래 「규모 가드」가 깨지므로 타임아웃을 올리는 것이 정답이다.
  beforeAll(() => {
    grid = scanGrid();
  }, 60_000);

  it("격자 규모·구성 가드 — 표본을 줄여서 통과시킬 수 없다", () => {
    // 실측 2,460,322셀. 축소되면 「발산 0건」이 무의미해지므로 하한을 못 박는다.
    expect(grid.cells).toBeGreaterThan(2_400_000);
    // 실측으로 발산이 확인된 5개 조합이 실제로 격자 안에서 관측됐는지
    expect(grid.visitedKnown).toEqual([0, 1, 2, 3, 4]);
  });

  it("단방향성 — 어떤 조합에서도 엔진 결과가 정확값보다 크지 않다 (수정 전에도 통과)", () => {
    expect(grid.overSamples).toEqual([]);
    expect(grid.overCount).toBe(0);
  });

  it("정확성 — 전 표본에서 엔진 ㎡당 금액 === 정수분수 정확값 (수정 전 실패: 203건)", () => {
    expect(grid.divergedSamples).toEqual([]);
    expect(grid.divergedCount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────
// §3 역방향 가드 — 국세청 공식 계산사례가 수정 후에도 그대로여야 한다
// ────────────────────────────────────────────────────────────────
/**
 * 아래 2건은 `__tests__/tax-engine/building-standard-price/nts-cases.test.ts`
 * (국세청 「2026년 건물 기준시가 계산방법 해설 — 계산사례」)가 이미 고정한 값이다.
 * **그 파일은 건드리지 않는다** — 여기서 다시 단언해, F-04 수정이 공식 사례를 깨면 이 파일에서도 즉시 드러나게 한다.
 * 두 사례 모두 **현재 정확값과 일치**한다(아래 BigInt 오라클로 확인) — 즉 수정은 이 값들을 바꾸면 안 된다.
 * 조정률 미적용 1건 + 조정률 적용(k=2) 1건으로 두 경로를 모두 덮는다.
 */
describe("F-04 ㎡당 금액 float 절사 — §3 역방향 가드(NTS 공식 계산사례, 수정 후에도 불변)", () => {
  // 직업훈련소 — 조정률 미적용 · 비정수 연면적 518.82㎡(면적 곱 경로도 함께 고정)
  // 860,000 × 90 × 102 × 120 = 947,376,000,000 → × 3,700 ÷ 10^10 = 350,529.12 → 절사 350,000
  // 기준시가 = 350,000 × 518.82 = 181,587,000
  it("NTS 직업훈련소(2026): ㎡당 350,000 / 기준시가 181,587,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 518.82,
      builtYear: 1998,
      valuationYear: 2026,
      valuation: { structureKey: "cement_brick", usageNo: 33, landPricePerM2: 3_500_000 },
      // 원본(2026 계산사례 1-나)은 **양도** 사례다 — 「양도 개시일 2026.1.1」·조정률 「-(양도세
      // 계산시 미적용)」. 종전에는 `specialFeatures` 생략으로 암묵 처리했는데, 구분 II 는 특성
      // 선택과 무관하게 자동 적용되므로(F-09) 생략만으로는 1.0 이 되지 않는다 — 명시로 남긴다.
      manualAdjustmentRate: 100,
    };
    const b = calcBuildingStandardPrice(input).valuation;
    expect(exactPricePerM2(947_376_000_000n, 3_700n)).toBe(350_000); // 정확값과 동일 → 수정이 바꾸면 안 된다
    expect(b?.pricePerM2).toBe(350_000);
    expect(b?.standardPrice).toBe(181_587_000);
  });

  // 단독주택(경량철골) — 조정률 특성 2개(1. 지붕 100 & 16. 단독주택 264~331㎡ 120) → 12,000 ÷ 100² = 1.20
  // 860,000 × 79 × 100 × 102 = 692,988,000,000 → × 3,100 × 12,000 ÷ (10^10 × 10,000) = 257,791.536 → 257,000
  // 기준시가 = 257,000 × 265 = 68,105,000
  it("NTS 단독주택(경량철골, 2026): 조정률 1.20 / ㎡당 257,000 / 기준시가 68,105,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 265,
      builtYear: 2003,
      valuationYear: 2026,
      valuation: { structureKey: "light_steel_frame", usageNo: 2, landPricePerM2: 960_700 },
      specialFeatures: { roofMaterial: 1, houseTypeTier: 16 },
      isResidentialUse: true,
    };
    const b = calcBuildingStandardPrice(input).valuation;
    expect(b?.adjustmentRate).toBe(1.2);
    expect(exactPricePerM2(692_988_000_000n, 3_100n, 12_000n, 10_000n)).toBe(257_000);
    expect(b?.pricePerM2).toBe(257_000);
    expect(b?.standardPrice).toBe(68_105_000);
  });
});
