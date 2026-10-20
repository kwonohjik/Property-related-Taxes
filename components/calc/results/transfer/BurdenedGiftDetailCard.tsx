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

import type {
  TransferBurdenedGiftAcquisitionMethodUsed,
  TransferBurdenedGiftBreakdown,
} from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { BurdenedGiftGiftTaxRows } from "@/components/calc/results/transfer/BurdenedGiftGiftTaxRows";

const SELECTED_LABEL: Record<string, string> = {
  supplementary: "보충적평가 (상증법 §61)",
  mortgage: "담보평가 (상증법 §66)",
  rental: "임대평가 (상증법 §61⑤ · 시행령 §50⑦)",
};

// `satisfies`로 키 커버리지를 가둔다 — 방식 union에 값이 늘 때 여기서 컴파일 오류가 나야 「기준시가 안분」으로 조용히 떨어지지 않는다.
const ACQ_METHOD_LABEL = {
  standard_price: "기준시가 안분 · 소령 §159①1호",
  actual: "실지취득가액 안분 · §97①1호가목",
  converted: "환산취득가액 · 시행령 §176의2②2호",
  salesCase: "매매사례가액 안분 · §97①1호나목 · 시행령 §176의2③1호",
  appraisal: "감정가액 안분 · §97①1호나목 · 시행령 §176의2③2호",
} satisfies Record<TransferBurdenedGiftAcquisitionMethodUsed, string>;

/** 매매사례가액·감정가액(K-6/K-7) 입력값 라벨 — 취득가액 행의 변수명. */
const PRESUMED_LABEL = { salesCase: "매매사례가액", appraisal: "감정가액" } as const;

interface Props {
  breakdown: TransferBurdenedGiftBreakdown;
  /** Phase 2: propertyType 라벨 + cross-cutting 안내용 */
  propertyType?: "housing" | "land" | "building" | "general_building" | string;
  /** Phase 2: 엔진 result.warnings — 다주택 중과 비스코프 등 정보성 경고 */
  warnings?: string[];
  /**
   * 재개발 완공 아파트 × 환산(K-5) — 엔진이 §159 명세의 일반 환산(§176의2②2호) 대신 §166③으로 계산한 값(채무비율 안분 후).
   * 있으면 환산 행을 이것으로 바꾼다 — 명세의 일반 환산값은 계산에 쓰이지 않는다(`transfer-tax-burdened-gift-step.ts` `redevSec166Conversion`).
   */
  redevSec166?: { acquisition: number; lumpDeduction: number };
}

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  housing: "주택",
  land: "단순토지(나대지,농지,임야)",
  building: "건물(토지 제외)",
  general_building: "일반건물(토지+건물 일괄)",
  commercial_building: "상업용건물·오피스텔",
  // 2026-09-08 편입 — 없으면 `ptLabel`이 undefined가 되어 **헤더 자산 라벨이 사라진다**.
  // 라벨 문자열은 `components/calc/transfer/asset-labels.ts`의 `ASSET_KIND_LABELS`와 같게 둔다.
  redevelopment_apt: "재개발/재건축 APT",
  right_to_move_in: "입주권",
};

export function BurdenedGiftDetailCard({ breakdown: bg, propertyType, warnings, redevSec166 }: Props) {
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const rowSelected = (mode: string) =>
    bg.sangjeungbeopValuation.selectedMode === mode
      ? "font-semibold bg-fuchsia-100/70 dark:bg-fuchsia-900/40"
      : "";
  const ptLabel = propertyType ? PROPERTY_TYPE_LABEL[propertyType] : undefined;

  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4 space-y-2 print:break-inside-avoid dark:bg-fuchsia-950/40">
      {/* Phase 2: warnings[] 상단 amber/rose 배너 — 8개 동기화 지점 ⑦ */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-semibold">⚠️ 안내</p>
          {warnings.map((w, idx) => (
            <p key={idx}>{w}</p>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">
          부담부증여 평가 명세 (소득세법 시행령 §159)
          {ptLabel && (
            <span className="ml-2 text-xs font-normal text-fuchsia-700 dark:text-fuchsia-300">— {ptLabel}</span>
          )}
        </p>
        <span className="text-xs text-fuchsia-700 px-2 py-0.5 rounded-full bg-fuchsia-100 border border-fuchsia-300">
          양도세 납세의무자: 증여자
        </span>
      </div>
      <table className="w-full text-xs border-collapse">
        <tbody>
          {bg.ownershipRatio !== undefined && (
            <tr>
              <td colSpan={2} className="py-1 pr-2 text-caption text-fuchsia-800 dark:text-fuchsia-200">
                공유지분 {(bg.ownershipRatio * 100).toFixed(4).replace(/\.?0+$/, "")}% 적용 —
                아래 평가액은 <b>지분 해당분</b>입니다(소령 §159의 A·C). 인수 채무는 입력한
                실제 인수액 그대로입니다.{" "}
                {bg.fractionalHighValueDenominator !== undefined &&
                bg.fractionalHighValueDenominator !== bg.wholePropertySupplementary ? (
                  <>
                    고가주택 판정 가액으로는 {bg.sangjeungbeopValuation.selectedMode === "rental" ? "임대평가" : "담보평가"}가 이긴 지분 증여가액을
                    지분율로 나눈 <span className="font-mono tabular-nums">{fmt(bg.fractionalHighValueDenominator)}</span>
                    을 사용합니다(소령 §156①).
                  </>
                ) : (
                  <>
                    고가주택 판정 분모로는 물건 전체
                    보충적평가액 <span className="font-mono tabular-nums">{fmt(bg.wholePropertySupplementary)}</span>
                    을 별도 사용합니다.
                  </>
                )}
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={2} className="py-1 pr-2 text-caption font-semibold text-fuchsia-700 dark:text-fuchsia-300">
              양도세 보충적평가 (자산별 양도가액 안분 분모)
            </td>
          </tr>
          <tr className={rowSelected("supplementary")}>
            <td className="py-1 pr-2">
              {bg.assetKind === "right_to_move_in"
                ? "① 보충적평가 (상증법 §61③ — 조합원입주권)"
                : "① 보충적평가 (양도세 §99)"}
            </td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.sangjeungbeopValuation.supplementary)}</td>
          </tr>
          {/* 조합원입주권 평가 3항 구성 (상증령 §51② · 상증칙 §16③) — 합계는 ①과 같다. */}
          {bg.rightValuationDetail && (
            <>
              <tr>
                <td className="py-1 pr-2 pl-4 text-caption text-fuchsia-700 dark:text-fuchsia-300">· 조합원권리가액 (상증법 시행규칙 §16③)</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap text-caption">{fmt(bg.rightValuationDetail.memberRightsValue)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-4 text-caption text-fuchsia-700 dark:text-fuchsia-300">· 증여일까지 납입한 계약금·중도금</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap text-caption">{fmt(bg.rightValuationDetail.paidInstallments)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-4 text-caption text-fuchsia-700 dark:text-fuchsia-300">· 증여일 현재 프리미엄</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap text-caption">{fmt(bg.rightValuationDetail.premium)}</td>
              </tr>
            </>
          )}
          <tr className={rowSelected("mortgage")}>
            <td className="py-1 pr-2">② 담보평가</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.sangjeungbeopValuation.mortgage)}</td>
          </tr>
          <tr className={rowSelected("rental")}>
            <td className="py-1 pr-2">③ 임대평가</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.sangjeungbeopValuation.rental)}</td>
          </tr>
          <tr className="border-t border-fuchsia-300 font-semibold">
            <td className="py-1 pr-2">Max 채택 (양도세): {SELECTED_LABEL[bg.sangjeungbeopValuation.selectedMode]}</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.sangjeungbeopValuation.max)}</td>
          </tr>
          {bg.giftValuation && bg.giftValuation.max !== bg.sangjeungbeopValuation.max && (
            <>
              <tr>
                <td colSpan={2} className="py-1 pr-2 pt-2 text-caption font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                  증여재산 평가 (취득가액 안분·채무비율 분모 — 상증법 §61 층별 가감율 적용)
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-2">증여세 보충적평가 (§61)</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.giftValuation.supplementary)}</td>
              </tr>
              <tr className="border-t border-fuchsia-300 font-semibold">
                <td className="py-1 pr-2">Max 채택 (증여세): {SELECTED_LABEL[bg.giftValuation.selectedMode]}</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.giftValuation.max)}</td>
              </tr>
            </>
          )}
          <tr>
            <td className="py-1 pr-2">인수 채무액 (= 양도가액)</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.assumedDebtAmount)}</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">채무비율 = <Frac top="채무액" bottom="증여재산 평가액" /></td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap">{(bg.debtRatio * 100).toFixed(4)}%</td>
          </tr>
          {/* 자산별 취득가액 산식 (소령 §159①1호) — 3경로 분기 (8개 동기화 지점 ⑦) */}
          <tr className="border-t border-fuchsia-300">
            <td colSpan={2} className="py-1 pr-2 pt-2 text-caption font-semibold text-fuchsia-700 dark:text-fuchsia-300">
              자산별 취득가액 ({redevSec166 && bg.acquisitionMethodUsed === "converted" ? "환산취득가액 · 시행령 §166③" : (ACQ_METHOD_LABEL[bg.acquisitionMethodUsed] ?? bg.acquisitionMethodUsed)})
            </td>
          </tr>
          {bg.acquisitionMethodUsed === "converted" && redevSec166 ? (
            <>
              <tr>
                <td className="py-1 pr-2 pl-3" data-testid="bg-redev-sec166-acquisition">
                  종전 부동산 취득가액 = 평가액 × 채무비율 × <Frac top="취득일 기준시가" bottom="관리처분계획 인가일 기준시가" />{" "}
                  (시행령 §166③ — 재개발·재건축 상세 참조)
                </td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(redevSec166.acquisition)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">인가전 분 개산공제 = 취득일 기준시가 × 채무비율 × 3% (시행령 §163⑥)</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(redevSec166.lumpDeduction)}</td>
              </tr>
            </>
          ) : bg.acquisitionMethodUsed === "converted" ? (
            <>
              {bg.perAsset.land.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    토지 환산취득가 = 양도가액 {fmt(bg.perAsset.land.transferPrice)} ×{" "}
                    <Frac
                      top={`취득기준시가 ${fmt(bg.perAsset.land.stdPriceAtAcquisition)}`}
                      bottom={`양도기준시가 ${fmt(bg.perAsset.land.stdPriceAtTransfer)}`}
                    />
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.land.acquisitionPrice)}</td>
                </tr>
              )}
              {bg.perAsset.building.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 환산취득가 = 양도가액 {fmt(bg.perAsset.building.transferPrice)} ×{" "}
                    <Frac
                      top={`취득기준시가 ${fmt(bg.perAsset.building.stdPriceAtAcquisition)}`}
                      bottom={`양도기준시가 ${fmt(bg.perAsset.building.stdPriceAtTransfer)}`}
                    />
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.building.acquisitionPrice)}</td>
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
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.land.acquisitionPrice)}</td>
                </tr>
              )}
              {bg.perAsset.building.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 취득가 = 실지취득가 {fmt(bg.perAsset.building.actualAcquisition ?? 0)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.building.acquisitionPrice)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2} className="py-1 pr-2 pl-3 text-caption text-fuchsia-600 dark:text-fuchsia-400">
                  ※ 실지취득가 모드 — 개산공제(§163⑥) 미적용, 자본적지출·양도비를 채무비율 안분하여 필요경비 반영
                </td>
              </tr>
            </>
          ) : bg.acquisitionMethodUsed === "salesCase" || bg.acquisitionMethodUsed === "appraisal" ? (
            <>
              {bg.perAsset.land.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    토지 취득가 = {PRESUMED_LABEL[bg.acquisitionMethodUsed]} {fmt(bg.perAsset.land.presumedAcquisition ?? 0)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.land.acquisitionPrice)}</td>
                </tr>
              )}
              {bg.perAsset.building.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 취득가 = {PRESUMED_LABEL[bg.acquisitionMethodUsed]} {fmt(bg.perAsset.building.presumedAcquisition ?? 0)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.building.acquisitionPrice)}</td>
                </tr>
              )}
              {/* 필요경비는 개산공제뿐이다 — 적힌 산식이 적힌 값을 만들도록 엔진 echo(율·취득시 기준시가)로 적는다 */}
              {bg.perAsset.land.estimatedDeductionRate !== undefined && bg.perAsset.land.estimatedDeduction > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    토지 개산공제 = 취득시 기준시가 {fmt(bg.perAsset.land.stdPriceAtAcquisition)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}% × 개산공제율 {(bg.perAsset.land.estimatedDeductionRate * 100).toFixed(1).replace(/\.0$/, "")}%
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.land.estimatedDeduction)}</td>
                </tr>
              )}
              {bg.perAsset.building.estimatedDeductionRate !== undefined && bg.perAsset.building.estimatedDeduction > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 개산공제 = 취득시 기준시가 {fmt(bg.perAsset.building.stdPriceAtAcquisition)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}% × 개산공제율 {(bg.perAsset.building.estimatedDeductionRate * 100).toFixed(1).replace(/\.0$/, "")}%
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.building.estimatedDeduction)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2} className="py-1 pr-2 pl-3 text-caption text-fuchsia-600 dark:text-fuchsia-400">
                  ※ {PRESUMED_LABEL[bg.acquisitionMethodUsed]} 경로 — 필요경비는 개산공제(소령 §163⑥)만 인정하며 자본적지출·양도비는 공제하지 않습니다
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
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.land.acquisitionPrice)}</td>
                </tr>
              )}
              {bg.perAsset.building.acquisitionPrice > 0 && (
                <tr>
                  <td className="py-1 pr-2 pl-3">
                    건물 취득가 = 취득기준시가 {fmt(bg.perAsset.building.stdPriceAtAcquisition)} × 채무비율{" "}
                    {(bg.debtRatio * 100).toFixed(4)}%
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(bg.perAsset.building.acquisitionPrice)}</td>
                </tr>
              )}
            </>
          )}
          <tr>
            <td className="py-1 pr-2 text-fuchsia-700 dark:text-fuchsia-300">무상이전분 (증여세 과세 가액)</td>
            <td className="text-right font-mono tabular-nums whitespace-nowrap text-fuchsia-700 dark:text-fuchsia-300">{fmt(bg.gratuitousPortion)}</td>
          </tr>
          {bg.giftTax && <BurdenedGiftGiftTaxRows giftTax={bg.giftTax} />}
        </tbody>
      </table>
      <p className="text-xs text-fuchsia-600 mt-2 dark:text-fuchsia-400">
        ※ 자산별 양도가액·취득가액은 위 Max 평가액을 분모로 채무비율 안분 (소령 §159 ① 1호·2호).
        증여세는 무상이전분에 대해 수증자가 별도 신고.
      </p>
    </div>
  );
}
