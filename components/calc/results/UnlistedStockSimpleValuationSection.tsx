"use client";

/**
 * UnlistedStockSimpleValuationSection — 간편평가(보충적) 비상장주식 요약 평가조서.
 *
 * 정책:
 *   - 출력 전용 연결 (엔진·타입·API·validate 변경 0). estateItems만 받는 순수 섹션.
 *   - 간편평가(unlistedStockData) 자산만 대상 — 정식평가 V2(별지4 부표3)는 별도 섹션.
 *   - 계산 단일소스 = calcUnlistedStockPerShareValue (엔진과 동일 함수, dual-truth 0).
 *   - 상속세·증여세 결과뷰 공용.
 *   - 기본 접힘 + 펼치기(다른 섹션 통일). 인쇄 시 CSS 자동 펼침.
 */

import { useState } from "react";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { isSimpleModeUnlisted } from "@/lib/calc/unlisted-valuation-mode";
import { calcUnlistedStockPerShareValue } from "@/lib/tax-engine/property-valuation-stock";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ExpandToggleButton } from "./shared/ExpandToggleButton";

export interface UnlistedStockSimpleValuationSectionProps {
  estateItems: EstateItem[];
}

const AMT = "py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap";
const LBL = "py-1.5 px-2 text-left";

export function UnlistedStockSimpleValuationSection({
  estateItems,
}: UnlistedStockSimpleValuationSectionProps) {
  const [open, setOpen] = useState(false);

  const simpleItems = estateItems.filter(isSimpleModeUnlisted);
  if (simpleItems.length === 0) return null;

  return (
    <section
      className="border border-border rounded-xl overflow-hidden"
      data-testid="unlisted-simple-valuation-section"
    >
      <div className="px-4 py-3 bg-muted/30 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">
          비상장주식 평가조서 (간편) — {simpleItems.length}건
        </h4>
        <ExpandToggleButton open={open} onClick={() => setOpen((v) => !v)} tone="slate" />
      </div>

      <div className={open ? "block" : "hidden print:block"}>
        {simpleItems.map((it, i) => {
          const data = it.unlistedStockData!;
          const v = calcUnlistedStockPerShareValue(
            data,
            data.isRealEstateHeavy ?? false,
          );
          const ownedValue = v.perShareFinalValue * data.ownedShares;
          const weightLabel = data.isRealEstateHeavy
            ? "순손익 2 : 순자산 3 (부동산과다보유법인)"
            : "순손익 3 : 순자산 2";
          return (
            <div
              key={it.id ?? i}
              className="p-3 border-t border-border first:border-t-0"
              data-testid={`unlisted-simple-item-${i}`}
            >
              <p className="text-xs font-semibold mb-2 text-muted-foreground">
                {it.name?.trim() || `비상장법인 ${i + 1}`}
              </p>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr className="border-b border-border/60">
                    <th className={`${LBL} font-medium text-muted-foreground`}>
                      발행주식총수
                    </th>
                    <td className={AMT}>{data.totalShares.toLocaleString("ko-KR")} 주</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <th className={`${LBL} font-medium text-muted-foreground`}>
                      보유주식수
                    </th>
                    <td className={AMT}>{data.ownedShares.toLocaleString("ko-KR")} 주</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <th className={LBL}>1주당 순손익가치 (§56)</th>
                    <td className={AMT}>{formatKRW(v.perShareIncomeValue)}</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <th className={LBL}>1주당 순자산가치 (§55)</th>
                    <td className={AMT}>{formatKRW(v.perShareAssetValue)}</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <th className={LBL}>가중평균 1주당 ({weightLabel})</th>
                    <td className={AMT}>{formatKRW(v.perShareWeightedValue)}</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <th className={LBL}>순자산가치 80% 하한 (§54①)</th>
                    <td className={AMT}>{formatKRW(v.perShareMinValue)}</td>
                  </tr>
                  <tr className="border-b border-border font-semibold">
                    <th className={LBL}>1주당 평가액</th>
                    <td className={AMT}>{formatKRW(v.perShareFinalValue)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <th className={LBL}>보유주식 평가액 (1주당 × 보유주식수)</th>
                    <td className={AMT}>{formatKRW(ownedValue)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                ※ 시행령 §54 보충적 평가(간편). 최대주주 할증(§63③)·최종 평가액은 재산
                평가 내역을 확인하세요.
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
