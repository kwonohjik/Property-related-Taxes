/**
 * A1 — 미등기양도자산(소득세법 §104③) 개산공제율 3/1000 전 경로 적용.
 *
 * ## 결함
 *
 * 소득령 §163⑥은 등기 자산 **3/100**, 미등기양도자산 **3/1000**을 규정한다.
 * 비-split 경로(`transfer-tax-helpers.ts`)와 다필지·일반건물·상가는 이를 지켰으나,
 * **split · PHD(2 + 4부분) · 겸용(주택·상가) · 재개발(토지·주택·인가전) 15곳이 `0.03` 리터럴로
 * 고정**돼 있었다. 미등기 자산의 개산공제가 **10배**로 산출된다.
 *
 * 같은 자산이라도 **분리 계산 경로를 타면 다른 율**이 적용되는 모순이었다 —
 * 토지·건물 취득일이 같으면 0.3%, 다르면(split 진입) 3%.
 *
 * ## 정정
 *
 * `estimatedDeductionRate(isUnregistered)`(`legal-codes/transfer.ts`) 단일 판정점 경유.
 * 리터럴 `0.03` 사용 금지 — 신규 개산공제 지점도 이 함수를 거쳐야 한다.
 *
 * 서브엔진 5종(`PreHousingDisclosureInput` · `MixedUseAssetInput` · `RedevLandContribInput` ·
 * `RedevHousingContribReceiveEstimatedInput` · `RedevelopmentSplitInput`)에 `isUnregistered`를
 * 전파했다 — `ownershipRatio`와 동일 경로다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { calcRedevLandContribEstimated } from "@/lib/tax-engine/redevelopment-land-contribution";
import { calcRedevHousingContribReceiveEstimated } from "@/lib/tax-engine/redevelopment-housing-contribution";
import { estimatedDeductionRate, ESTIMATED_DEDUCTION_RATE } from "@/lib/tax-engine/legal-codes";
import { baseTransferInput } from "../_helpers/mock-rates";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_LAND_HOUSING_AT_ACQ,
  PHD_BLDG_HOUSING_AT_ACQ,
} from "./_helpers/pre-housing-disclosure-fixture";

const UNREG = ESTIMATED_DEDUCTION_RATE.UNREGISTERED; // 0.003
const REG = ESTIMATED_DEDUCTION_RATE.LAND_BUILDING; // 0.03

const LAND_STD = 1_000_001 * 200;
const TOTAL_STD = 500_000_001;
const BLDG_STD = TOTAL_STD - LAND_STD;

const house = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing",
    acquisitionDate: new Date("2018-06-01"),
    landAcquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    transferPrice: 500_000_000,
    saleSplitMode: "actual",
    landTransferPrice: 300_000_000,
    buildingTransferPrice: 200_000_000,
    landAcqMode: "appraisal",
    buildingAcqMode: "appraisal",
    landAcquisitionPrice: 150_000_000,
    buildingAcquisitionPrice: 125_000_000,
    standardPricePerSqmAtAcquisition: 1_000_001,
    acquisitionArea: 200,
    standardPriceAtAcquisition: TOTAL_STD,
    landStandardPriceAtTransfer: 300_000_000,
    buildingStandardPriceAtTransfer: 200_000_000,
    isSeparateAcquisition: true,
    ...over,
  });

// ════════════════════════════════════════════════════════════
// U0 — 단일 판정점
// ════════════════════════════════════════════════════════════
describe("U0: estimatedDeductionRate — §163⑥ 율 단일 판정점", () => {
  it("미등기 → 3/1000, 그 외 → 3/100", () => {
    expect(estimatedDeductionRate(true)).toBe(0.003);
    expect(estimatedDeductionRate(false)).toBe(0.03);
    expect(estimatedDeductionRate(undefined)).toBe(0.03); // 미전달 = 등기
  });

  it("두 율은 정확히 10배 차 — 누락 시 오차 규모를 고정한다", () => {
    expect(REG / UNREG).toBeCloseTo(10, 10);
  });
});

// ════════════════════════════════════════════════════════════
// U1 — split(§166⑥ 토지/건물 분리)
// ════════════════════════════════════════════════════════════
describe("U1: split 경로 미등기", () => {
  it("🔴 정정 — 토지·건물 각각 3/1000", () => {
    const r = calcSplitGain(house({ isUnregistered: true }))!;
    expect(r.land.appraisalDeduction).toBe(Math.floor(LAND_STD * UNREG));
    expect(r.building.appraisalDeduction).toBe(Math.floor(BLDG_STD * UNREG));
  });

  it("등기 자산은 무변경 (회귀 가드)", () => {
    const r = calcSplitGain(house())!;
    expect(r.land.appraisalDeduction).toBe(Math.floor(LAND_STD * REG));
    expect(r.building.appraisalDeduction).toBe(Math.floor(BLDG_STD * REG));
  });

  it("미등기 + 지분 50% — 두 축이 함께 적용된다", () => {
    const r = calcSplitGain(house({ isUnregistered: true, ownershipRatio: 0.5 }))!;
    expect(r.land.appraisalDeduction).toBe(
      Math.floor(Math.floor(LAND_STD * 0.5) * UNREG),
    );
  });

  it("경로 간 모순 해소 — 같은 기준시가면 split·비-split 율이 같다", () => {
    const split = calcSplitGain(house({ isUnregistered: true }))!;
    const sum = split.land.appraisalDeduction + split.building.appraisalDeduction;
    // 비-split은 총액 하나에 율을 곱한다. 성분별 floor라 ±1원 차는 허용하되,
    // **율 자체가 10배 다른 상태**는 허용하지 않는다.
    expect(Math.abs(sum - Math.floor(TOTAL_STD * UNREG))).toBeLessThanOrEqual(2);
  });
});

// ════════════════════════════════════════════════════════════
// U2 — PHD(§164⑤) 2지점
// ════════════════════════════════════════════════════════════
describe("U2: PHD 경로 미등기", () => {
  it("🔴 정정 — 토지·건물 성분 각각 3/1000", () => {
    const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, {
      ...PHD_INPUT,
      isUnregistered: true,
    });
    expect(r.landLumpDeduction).toBe(Math.floor(PHD_LAND_HOUSING_AT_ACQ * UNREG));
    expect(r.buildingLumpDeduction).toBe(Math.floor(PHD_BLDG_HOUSING_AT_ACQ * UNREG));
  });

  it("등기 — Excel 정본값 불변 (회귀 가드)", () => {
    const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(r.landLumpDeduction).toBe(Math.floor(PHD_LAND_HOUSING_AT_ACQ * REG));
    expect(r.buildingLumpDeduction).toBe(Math.floor(PHD_BLDG_HOUSING_AT_ACQ * REG));
  });
});

// ════════════════════════════════════════════════════════════
// U3 — 재개발 토지·주택 출자
// ════════════════════════════════════════════════════════════
describe("U3: 재개발 경로 미등기", () => {
  const land = (over: Record<string, unknown> = {}) => ({
    acquisitionDate: new Date("2005-03-10"),
    approvalDate: new Date("2018-06-20"),
    rightsValue: 400_000_000,
    transferPrice: 900_000_000,
    settlementPaid: 50_000_000,
    landStdPriceAtAcq: 120_000_001,
    landStdPriceAtApproval: 300_000_000,
    postApprovalExpenses: 0,
    ...over,
  });
  const housing = (over: Record<string, unknown> = {}) => ({
    acquisitionDate: new Date("2004-08-01"),
    approvalDate: new Date("2019-03-15"),
    rightsValue: 500_000_000,
    transferPrice: 620_000_000,
    settlementReceived: 30_000_000,
    housingStdPriceAtAcq: 180_000_001,
    housingStdPriceAtApproval: 420_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    ...over,
  });

  it("🔴 정정 — 토지 출자 3/1000", () => {
    expect(calcRedevLandContribEstimated(land({ isUnregistered: true })).estimatedDeduction)
      .toBe(Math.floor(120_000_001 * UNREG));
  });

  it("🔴 정정 — 주택 출자 3/1000", () => {
    expect(
      calcRedevHousingContribReceiveEstimated(housing({ isUnregistered: true }))
        .estimatedDeduction,
    ).toBe(Math.floor(180_000_001 * UNREG));
  });

  it("등기 — 무변경 (회귀 가드)", () => {
    expect(calcRedevLandContribEstimated(land()).estimatedDeduction)
      .toBe(Math.floor(120_000_001 * REG));
    expect(calcRedevHousingContribReceiveEstimated(housing()).estimatedDeduction)
      .toBe(Math.floor(180_000_001 * REG));
  });
});

// ════════════════════════════════════════════════════════════
// U4 — 구조 가드: 고정 율 재유입 차단
//
//   겸용(주택분·상가분)·재개발 인가전은 입력 fixture가 커서 행위 anchor를 두지 않았다.
//   대신 **결함의 형태 자체**(개산공제 율을 미등기 여부와 무관하게 고정)를 소스 수준에서 막는다.
//   이 결함은 "율을 안 넘겨서" 생겼지 "잘못 계산해서"가 아니므로, 이 가드가 원인을 직접 겨눈다.
//
// 🔴 **2026-08-11 확장 — 가드에 사각지대 둘이 있었다.**
//
//   원 가드는 (a) 숫자 **리터럴만** 검사하고 (b) `lib/tax-engine`만 훑었다. 그래서 정정 당시
//   「일반건물·상가는 지켰다」로 오판된 두 경로를 **가드도 함께 놓쳤다**:
//
//     · 상가(`commercial-building-valuation.ts`) — `ESTIMATED_DEDUCTION_RATE.LAND_BUILDING`
//       **상수 참조**라 리터럴 정규식에 걸리지 않았다. (2026-08-11 배선 완료)
//     · 일반건물 — 율을 `lib/calc/transfer-tax-api-gb.ts`가 payload로 **주입**한다.
//       `lib/tax-engine` 밖이라 스캔 범위 자체에 없었다. (Phase C 대기)
//
//   ⇒ (a) 상수 참조도 offender로 본다 — 율 인자는 `estimatedDeductionRate(...)` 호출만 허용.
//      (b) 율이 **주입되는** 경로(`lib/calc`·`app/api/calc/transfer`)의 `estimatedDeductionRate:`
//          프로퍼티 리터럴도 함께 검사한다.
// ════════════════════════════════════════════════════════════
describe("U4: 개산공제 율 고정 금지 (구조 가드)", () => {
  const walkTs = async (dir: string): Promise<string[]> => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const p = join(d, e);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
      });
    return walk(dir);
  };

  /** 괄호 균형으로 `fn(` 부터 대응 `)` 까지를 잘라낸다 (여러 줄 호출 대응). */
  const callsOf = (src: string, fn: string): string[] => {
    const out: string[] = [];
    let idx = src.indexOf(`${fn}(`);
    while (idx !== -1) {
      let depth = 0;
      let end = idx;
      for (let i = idx; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      out.push(src.slice(idx, end + 1));
      idx = src.indexOf(`${fn}(`, end);
    }
    return out;
  };

  it("lib/tax-engine — computeEstimatedDeduction 율 인자는 estimatedDeductionRate() 호출뿐", async () => {
    const { readFileSync } = await import("node:fs");
    const offenders: string[] = [];

    for (const file of await walkTs("lib/tax-engine")) {
      if (file.endsWith("tax-utils.ts")) continue; // 헬퍼 정의부(rate 파라미터 선언)
      const src = readFileSync(file, "utf8");
      for (const call of callsOf(src, "computeEstimatedDeduction")) {
        // 두 번째 인자(율)를 뽑는다 — 첫 인자와 율 사이의 최상위 콤마로 분리.
        const inner = call.slice(call.indexOf("(") + 1, -1);
        const args: string[] = [];
        let depth = 0;
        let cur = "";
        for (const ch of inner) {
          if (ch === "(" || ch === "[" || ch === "{") depth++;
          else if (ch === ")" || ch === "]" || ch === "}") depth--;
          if (ch === "," && depth === 0) { args.push(cur); cur = ""; continue; }
          cur += ch;
        }
        args.push(cur);
        const rateArg = (args[1] ?? "").trim();
        if (!rateArg) continue;
        // 허용: estimatedDeductionRate(...) 호출 / 호출부가 이미 판정해 넘긴 변수(dedRate 등)
        if (rateArg.startsWith("estimatedDeductionRate(")) continue;
        // 금지: 리터럴 0.03·0.003, 그리고 미등기 분기가 없는 상수 직접 참조
        if (/^0\.0{1,2}3$/.test(rateArg) || rateArg.startsWith("ESTIMATED_DEDUCTION_RATE.")) {
          offenders.push(`${file}: 율 인자 = ${rateArg}`);
        }
      }
    }

    expect(
      offenders,
      "율은 estimatedDeductionRate(isUnregistered)로만 결정한다 — 리터럴·상수 직접 참조는 미등기 분기를 조용히 죽인다",
    ).toEqual([]);
  });

  it("lib/calc·app/api — 주입되는 estimatedDeductionRate 값이 고정 리터럴이 아니다", async () => {
    const { readFileSync } = await import("node:fs");
    const offenders: string[] = [];

    for (const dir of ["lib/calc", "app/api/calc/transfer"]) {
      for (const file of await walkTs(dir)) {
        const src = readFileSync(file, "utf8");
        // `estimatedDeductionRate: 0.03` 형태의 payload 주입 — 미등기 분기가 없다.
        const m = src.match(/estimatedDeductionRate:\s*0\.0{1,2}3\b/g);
        if (m) offenders.push(`${file}: ${m.join(" · ")}`);
      }
    }

    expect(
      offenders,
      "율을 주입하는 경로도 미등기 여부로 갈라야 한다 — 고정 주입은 엔진 안에서 분기할 방법을 없앤다",
    ).toEqual([]);
  });
});
