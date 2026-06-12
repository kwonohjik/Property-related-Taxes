"use client";

/**
 * land-payable-sections — 토지 납부할세액 카드의 ②ⓐ ≪지역≫ 블록 · ④나 직전연도 분해.
 * Design: comprehensive-land-payable-calc.ui.design.md §1·§2
 */

import type {
  LandJurisdictionPropertyTax,
  LandPriorJurisdictionTax,
  LandPreviousYearEquivalent,
} from "@/lib/tax-engine/types/comprehensive.types";
import { won, eok, pct, StepLine, Bullet, DashBullet, ParcelDot, JurisdictionHeader } from "./payable-calc-helpers";

/** 필지 공시가격 산식 "200㎡ × 50%(지분율) × 4,300,000원 = 4.3억원" */
function parcelFormula(p: { area: number; shareRatio: number; pricePerSqm: number; officialValue: number }): string {
  const share = p.shareRatio < 1 ? ` × ${pct(p.shareRatio)}(지분율)` : "";
  return `${p.area.toLocaleString("ko-KR")}㎡${share} × ${won(p.pricePerSqm)} = ${eok(p.officialValue)}`;
}

/** ②ⓐ 지자체 블록 (당해연도 — §122 Min 포함) */
export function CurrentJurisdictionBlock({ j }: { j: LandJurisdictionPropertyTax }) {
  const single = j.parcels.length === 1;
  return (
    <div>
      <JurisdictionHeader name={j.jurisdiction} />
      {single ? (
        <DashBullet>공시가격 : {parcelFormula(j.parcels[0])}</DashBullet>
      ) : (
        <>
          <DashBullet>공시가격 : {eok(j.officialValueSum)}</DashBullet>
          {j.parcels.map((p) => (
            <ParcelDot key={p.parcelId}>
              {p.name ?? p.parcelId} : {parcelFormula(p)}
            </ParcelDot>
          ))}
        </>
      )}
      <DashBullet>
        재산세 과세표준 : {eok(j.officialValueSum)} × 70%(재산세 공정시장가액비율) = {eok(j.propertyTaxBase)}
      </DashBullet>
      <DashBullet>
        세부담 상한 적용 전 재산세액 : {eok(j.propertyTaxBase)} × {pct(j.appliedRate)}(세율)
        {j.progressiveDeduction > 0 ? ` − ${won(j.progressiveDeduction)}(누진공제액)` : ""} = {won(j.standardTax)}
      </DashBullet>
      {j.priorStandardTax !== undefined && j.capAmount !== undefined ? (
        <>
          <DashBullet>직전연도 재산세액 : {won(j.priorStandardTax)}</DashBullet>
          <DashBullet>세부담 상한액 : {won(j.priorStandardTax)} × 150% = {won(j.capAmount)}</DashBullet>
          <DashBullet>
            부과된 재산세액 : {won(j.imposedTax)}[= Min({won(j.standardTax)}, {won(j.capAmount)})]
          </DashBullet>
        </>
      ) : (
        <DashBullet>부과된 재산세액 : {won(j.imposedTax)}</DashBullet>
      )}
    </div>
  );
}

/** ④나① 직전연도 지자체 블록 (§122 Min 미적용 — 표준세율 재계산) */
function PriorJurisdictionBlock({ j }: { j: LandPriorJurisdictionTax }) {
  const single = j.parcels.length === 1;
  return (
    <div>
      <JurisdictionHeader name={j.jurisdiction} indent={2} />
      {single ? (
        <DashBullet indent={3}>공시가격 : {parcelFormula(j.parcels[0])}</DashBullet>
      ) : (
        <>
          <DashBullet indent={3}>공시가격 : {eok(j.officialValueSum)}</DashBullet>
          {j.parcels.map((p) => (
            <ParcelDot key={p.parcelId} indent={4}>
              {p.name ?? p.parcelId} : {parcelFormula(p)}
            </ParcelDot>
          ))}
        </>
      )}
      <DashBullet indent={3}>
        재산세 과세표준 : {eok(j.officialValueSum)} × 70%(재산세 공정시장가액비율) = {eok(j.propertyTaxBase)}
      </DashBullet>
      <DashBullet indent={3}>
        표준세율 재산세액 : {eok(j.propertyTaxBase)} × {pct(j.appliedRate)}
        {j.progressiveDeduction > 0 ? ` − ${won(j.progressiveDeduction)}` : ""} = {won(j.standardTax)}
      </DashBullet>
    </div>
  );
}

/** ④나 직전연도 총세액상당액 전체 분해 (자동 서브모드) */
export function LandPriorYearBreakdown({
  pye,
  testPrefix,
}: {
  pye: LandPreviousYearEquivalent;
  testPrefix: string;
}) {
  const dt = pye.detail;
  return (
    <>
      {/* 나의 ① 직전연도 재산세상당액 */}
      <StepLine
        badge="①"
        badgeShape="circle"
        label="직전연도 재산세상당액"
        amount={pye.propertyTaxEquiv}
        indent={2}
        testId={`${testPrefix}-payable-step4-na-1`}
      />
      {dt.perJurisdiction.map((j) => (
        <PriorJurisdictionBlock key={j.jurisdiction} j={j} />
      ))}

      {/* 나의 ② 직전연도 종합부동산세상당액 */}
      <StepLine
        badge="②"
        badgeShape="circle"
        label="직전연도 종합부동산세상당액"
        formula="(ⓐ − ⓑ)"
        amount={pye.comprehensiveTaxEquiv}
        indent={2}
        testId={`${testPrefix}-payable-step4-na-2`}
      />
      <Bullet indent={3}>
        {won(pye.comprehensiveTaxEquiv)}(= {won(dt.calculatedTax)} − {won(dt.creditAmount)})
      </Bullet>

      {/* ⓐ 재산세공제전 종합부동산세액 */}
      <StepLine badge="ⓐ" badgeShape="circle" label="재산세공제전 종합부동산세액" amount={dt.calculatedTax} indent={3} />
      <Bullet indent={4}>
        종합부동산세 과세표준 : ({eok(dt.officialValueSum)} − {eok(dt.basicDeduction)}) ×{" "}
        {pct(dt.fairMarketRatio)}(공정시장가액비율) = {eok(dt.taxBase)}
      </Bullet>
      <Bullet indent={4}>
        종합부동산세액 : {eok(dt.taxBase)} × {pct(dt.appliedRate)}
        {dt.progressiveDeduction > 0 ? ` − ${won(dt.progressiveDeduction)}` : ""} = {won(dt.calculatedTax)}
      </Bullet>

      {/* ⓑ 공제할 재산세액 */}
      <StepLine badge="ⓑ" badgeShape="circle" label="공제할 재산세액" amount={dt.creditAmount} indent={3} />
      <Bullet indent={4}>직전연도 재산세상당액 : {won(pye.propertyTaxEquiv)}</Bullet>
      <Bullet indent={4}>
        종합부동산세 과세표준에 대한 표준세율재산세액 : {won(dt.stdTaxNumerator)}
      </Bullet>
      <Bullet indent={4}>총표준세율재산세액 : {won(dt.stdTaxDenominator)}</Bullet>
      <Bullet indent={4}>
        공제할 재산세액 : {won(pye.propertyTaxEquiv)} × ({won(dt.stdTaxNumerator)} / {won(dt.stdTaxDenominator)}) ={" "}
        {won(dt.creditAmount)}
      </Bullet>
    </>
  );
}
