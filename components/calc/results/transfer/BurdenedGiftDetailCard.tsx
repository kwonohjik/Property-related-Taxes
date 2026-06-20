"use client";

/**
 * 부담부증여 평가 명세 + Phase 2 증여세 상세 카드.
 * TransferTaxResultView.tsx 800줄 정책으로 sibling 분리.
 *
 * 표시 항목:
 *  - 상증법 §60~§66 Max 평가 (보충적·담보·임대 + 채택 강조)
 *  - 채무비율·인수채무액·무상이전분
 *  - Phase 2: 증여세 통합 (공제·과표·산출세액·신고세액공제·결정세액)
 */

import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const SELECTED_LABEL: Record<string, string> = {
  supplementary: "보충적평가 (상증법 §61)",
  mortgage: "담보평가 (상증법 §66)",
  rental: "임대평가 (상증법 §61⑤ · 시행령 §50⑦)",
};

const ACQ_METHOD_LABEL: Record<string, string> = {
  standard_price: "기준시가 안분 · 소령 §159①1호",
  actual: "실지취득가액 안분 · §97①1호가목",
  converted: "환산취득가액 · 시행령 §176의2②2호",
};

const RELATION_LABEL: Record<string, string> = {
  spouse: "배우자",
  lineal_descendant: "직계비속(성년 수증자)",
  lineal_ascendant_adult: "직계존속(성년 수증자)",
  lineal_ascendant_minor: "직계존속(미성년 수증자)",
  other_relative: "기타 친족",
};

interface Props {
  breakdown: TransferBurdenedGiftBreakdown;
  /** Phase 2: propertyType 라벨 + cross-cutting 안내용 */
  propertyType?: "housing" | "land" | "building" | "general_building" | string;
  /** Phase 2: 엔진 result.warnings — 다주택 중과 비스코프 등 정보성 경고 */
  warnings?: string[];
}

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  housing: "주택",
  land: "토지·농지",
  building: "건물(토지 외)",
  general_building: "일반건물(토지+건물 일괄)",
  commercial_building: "상업용건물·오피스텔",
};

export function BurdenedGiftDetailCard({ breakdown: bg, propertyType, warnings }: Props) {
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const rowSelected = (mode: string) =>
    bg.sangjeungbeopValuation.selectedMode === mode
      ? "font-semibold bg-fuchsia-100/70"
      : "";
  const ptLabel = propertyType ? PROPERTY_TYPE_LABEL[propertyType] : undefined;

  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4 space-y-2 print:break-inside-avoid">
      {/* Phase 2: warnings[] 상단 amber/rose 배너 — 8개 동기화 지점 ⑦ */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">⚠️ 안내</p>
          {warnings.map((w, idx) => (
            <p key={idx}>{w}</p>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-fuchsia-900">
          부담부증여 평가 명세 (소득세법 시행령 §159)
          {ptLabel && (
            <span className="ml-2 text-xs font-normal text-fuchsia-700">— {ptLabel}</span>
          )}
        </p>
        <span className="text-xs text-fuchsia-700 px-2 py-0.5 rounded-full bg-fuchsia-100 border border-fuchsia-300">
          양도세 납세의무자: 증여자
        </span>
      </div>
      <table className="w-full text-xs border-collapse">
        <tbody>
          <tr>
            <td colSpan={2} className="py-1 pr-2 text-[11px] font-semibold text-fuchsia-700">
              양도세 보충적평가 (자산별 양도가액 안분 분모)
            </td>
          </tr>
          <tr className={rowSelected("supplementary")}>
            <td className="py-1 pr-2">① 보충적평가 (양도세 §99)</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.supplementary)}원</td>
          </tr>
          <tr className={rowSelected("mortgage")}>
            <td className="py-1 pr-2">② 담보평가</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.mortgage)}원</td>
          </tr>
          <tr className={rowSelected("rental")}>
            <td className="py-1 pr-2">③ 임대평가</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.rental)}원</td>
          </tr>
          <tr className="border-t border-fuchsia-300 font-semibold">
            <td className="py-1 pr-2">Max 채택 (양도세): {SELECTED_LABEL[bg.sangjeungbeopValuation.selectedMode]}</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.max)}원</td>
          </tr>
          {bg.giftValuation && bg.giftValuation.max !== bg.sangjeungbeopValuation.max && (
            <>
              <tr>
                <td colSpan={2} className="py-1 pr-2 pt-2 text-[11px] font-semibold text-fuchsia-700">
                  증여재산 평가 (취득가액 안분·채무비율 분모 — 상증법 §61 층별 가감율 적용)
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-2">증여세 보충적평가 (§61)</td>
                <td className="text-right font-mono">{fmt(bg.giftValuation.supplementary)}원</td>
              </tr>
              <tr className="border-t border-fuchsia-300 font-semibold">
                <td className="py-1 pr-2">Max 채택 (증여세): {SELECTED_LABEL[bg.giftValuation.selectedMode]}</td>
                <td className="text-right font-mono">{fmt(bg.giftValuation.max)}원</td>
              </tr>
            </>
          )}
          <tr>
            <td className="py-1 pr-2">인수 채무액 (= 양도가액)</td>
            <td className="text-right font-mono">{fmt(bg.assumedDebtAmount)}원</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">채무비율 = 채무액 ÷ 증여재산 평가액</td>
            <td className="text-right font-mono">{(bg.debtRatio * 100).toFixed(4)}%</td>
          </tr>
          {/* 자산별 취득가액 산식 (소령 §159①1호) — 3경로 분기 (8개 동기화 지점 ⑦) */}
          <tr className="border-t border-fuchsia-300">
            <td colSpan={2} className="py-1 pr-2 pt-2 text-[11px] font-semibold text-fuchsia-700">
              자산별 취득가액 ({ACQ_METHOD_LABEL[bg.acquisitionMethodUsed] ?? bg.acquisitionMethodUsed})
            </td>
          </tr>
          {bg.acquisitionMethodUsed === "converted" ? (
            <>
              {bg.perAsset.land.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    토지 환산취득가 = 양도가액 {fmt(bg.perAsset.land.transferPrice)} × 취득기준시가{" "}
                    {fmt(bg.perAsset.land.stdPriceAtAcquisition)} ÷ 양도기준시가{" "}
                    {fmt(bg.perAsset.land.stdPriceAtTransfer)}
                  </td>
                  <td className="text-right font-mono">{fmt(bg.perAsset.land.acquisitionPrice)}원</td>
                </tr>
              )}
              {bg.perAsset.building.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 환산취득가 = 양도가액 {fmt(bg.perAsset.building.transferPrice)} × 취득기준시가{" "}
                    {fmt(bg.perAsset.building.stdPriceAtAcquisition)} ÷ 양도기준시가{" "}
                    {fmt(bg.perAsset.building.stdPriceAtTransfer)}
                  </td>
                  <td className="text-right font-mono">{fmt(bg.perAsset.building.acquisitionPrice)}원</td>
                </tr>
              )}
            </>
          ) : bg.acquisitionMethodUsed === "actual" ? (
            <>
              {bg.perAsset.land.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    토지 취득가 = 실지취득가 {fmt(bg.perAsset.land.actualAcquisition ?? 0)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono">{fmt(bg.perAsset.land.acquisitionPrice)}원</td>
                </tr>
              )}
              {bg.perAsset.building.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 취득가 = 실지취득가 {fmt(bg.perAsset.building.actualAcquisition ?? 0)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono">{fmt(bg.perAsset.building.acquisitionPrice)}원</td>
                </tr>
              )}
              <tr>
                <td colSpan={2} className="py-1 pr-2 pl-3 text-[11px] text-fuchsia-600">
                  ※ 실지취득가 모드 — 개산공제(§163⑥) 미적용, 자본적지출·양도비를 채무비율 안분하여 필요경비 반영
                </td>
              </tr>
            </>
          ) : (
            <>
              {bg.perAsset.land.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    토지 취득가 = 취득기준시가 {fmt(bg.perAsset.land.stdPriceAtAcquisition)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono">{fmt(bg.perAsset.land.acquisitionPrice)}원</td>
                </tr>
              )}
              {bg.perAsset.building.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 취득가 = 취득기준시가 {fmt(bg.perAsset.building.stdPriceAtAcquisition)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono">{fmt(bg.perAsset.building.acquisitionPrice)}원</td>
                </tr>
              )}
            </>
          )}
          <tr>
            <td className="py-1 pr-2 text-fuchsia-700">무상이전분 (증여세 과세 가액)</td>
            <td className="text-right font-mono text-fuchsia-700">{fmt(bg.gratuitousPortion)}원</td>
          </tr>
          {bg.giftTax && (
            <>
              <tr className="border-t border-fuchsia-300">
                <td className="py-1 pr-2 font-semibold text-fuchsia-900">
                  증여세 (수증자 자진납부) — 상증법 §53·§56·§69
                </td>
                <td />
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">
                  {"  └ 증여재산공제 ("}
                  {RELATION_LABEL[bg.giftTax.donorRelation] ?? "기타"}
                  {")"}
                </td>
                <td className="text-right font-mono">{fmt(bg.giftTax.deduction)}원</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">{"  └ 증여세 과세표준"}</td>
                <td className="text-right font-mono">{fmt(bg.giftTax.taxBase)}원</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">{"  └ 증여세 산출세액"}</td>
                <td className="text-right font-mono">{fmt(bg.giftTax.computedTax)}원</td>
              </tr>
              {bg.giftTax.priorGiftCredit !== undefined &&
                bg.giftTax.priorGiftCredit > 0 && (
                  <tr>
                    <td className="py-1 pr-2 pl-3">{"  └ §58 기납부세액공제"}</td>
                    <td className="text-right font-mono">
                      -{fmt(bg.giftTax.priorGiftCredit)}원
                    </td>
                  </tr>
                )}
              <tr>
                <td className="py-1 pr-2 pl-3">{"  └ 신고세액공제 (3%)"}</td>
                <td className="text-right font-mono">-{fmt(bg.giftTax.filingCredit)}원</td>
              </tr>
              <tr className="font-semibold bg-fuchsia-100/70">
                <td className="py-1 pr-2">증여세 결정세액 (수증자 부담)</td>
                <td className="text-right font-mono">{fmt(bg.giftTax.finalTax)}원</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <p className="text-xs text-fuchsia-600 mt-2">
        ※ 자산별 양도가액·취득가액은 위 Max 평가액을 분모로 채무비율 안분 (소령 §159 ① 1호·2호).
        증여세는 무상이전분에 대해 수증자가 별도 신고.
      </p>
    </div>
  );
}
