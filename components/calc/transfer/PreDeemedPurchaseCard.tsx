"use client";

/**
 * ⑤ 의제취득일(1985.1.1.) 전 «매수» — 영 §176조의2④ 「많은 것」 입력 카드
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §4.2 (Q-1 B · Q-2 a · Q-5 a · Q-7)
 *
 * 게이트·전송·검증은 `lib/calc/transfer-pre-deemed-purchase-form.ts` 한 곳이다(④⑤⑧ 같은 술어). 주식 카드
 * (`components/calc/stock-transfer/PreDeemedAcquisitionCard.tsx`)와 같은 입력 모델 — 모드 라디오가 ①의 방식이다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  isPreDeemedPurchaseAsset,
  preDeemedOriginalDate,
  preDeemedPurchaseNotCompared,
  preDeemedPurchaseUsesCompareActual,
  preDeemedSplitPart,
} from "@/lib/calc/transfer-pre-deemed-purchase-form";
import { isRedevelopmentSec166Asset } from "@/lib/calc/redev-acquisition-price-source";
import { isBeforePpiSeries, ppiMonthlyX100 } from "@/lib/tax-engine/producer-price-ratio";

/** 취득월 지수가 1984.12.보다 높은가 — 배율 < 1(1984.9.·10.) 안내(Q-5 a 하한 없음) */
function ratioBelowOne(date: string): boolean {
  const [y, m] = date.split("-").map(Number);
  const acq = y && m ? ppiMonthlyX100(y, m) : undefined;
  const prev = ppiMonthlyX100(1984, 12);
  return acq !== undefined && prev !== undefined && acq > prev;
}

export function PreDeemedPurchaseCard({
  asset,
  onAssetChange,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  if (preDeemedPurchaseNotCompared(asset)) {
    return (
      <div data-testid="pre-deemed-purchase-gb-not-compared">
        <ToneCard tone="amber" title="의제취득일 전 매수 (소득세법 시행령 §176조의2④)" bodyClassName="space-y-2">
          <p className="text-xs text-amber-800 leading-relaxed dark:text-amber-200">
            {asset.assetKind === "general_building" && !(asset.landAcquisitionDate === "1985-01-01" && asset.acquisitionDate === "1985-01-01" && asset.hasSeperateLandAcquisitionDate) ? (
              <>일반건물은 취득가액 산정 방식이 실지거래가액일 때만 ② 취득 당시 실지거래가액 + 생산자물가상승분을 계산합니다. 이 방식의 계산에는 ①·② 비교를 반영하지 않습니다 —
              취득 당시 실지거래가액을 알면 산정 방식을 실지거래가액으로 바꿔 ②로 계산해 보세요.</>
            ) : (
              <>토지와 건물을 모두 1985.1.1. 전에 따로 매수한 경우의 ① 의제취득일 현재 가액과 ② 취득 당시 실지거래가액 + 생산자물가상승분 비교는 계산에 반영하지 않습니다 — 확인 필요.</>
            )}
          </p>
        </ToneCard>
      </div>
    );
  }
  if (!isPreDeemedPurchaseAsset(asset)) return null;
  const original = preDeemedOriginalDate(asset);
  const part = preDeemedSplitPart(asset);
  const partLabel = part === "land" ? "토지 " : part === "building" ? "건물 " : "";
  const compare = preDeemedPurchaseUsesCompareActual(asset);
  const isPre = !!original && original < "1985-01-01";
  const isRedev = isRedevelopmentSec166Asset(asset);

  return (
    <div data-testid="pre-deemed-purchase-card">
      <ToneCard tone="amber" title="의제취득일 전 매수 — 「많은 것」 (소득세법 시행령 §176조의2④)" bodyClassName="space-y-3">
        <p className="text-xs text-amber-800 leading-relaxed dark:text-amber-200">
          1985.1.1. 전에 매수한 자산은 취득일을 의제취득일(1985.1.1.)로 보고, 취득가액은 ① 의제취득일 현재{" "}
          {isRedev ? "§166③ 환산취득가액" : "매매사례가액·감정가액·환산취득가액"}과
          ② 취득 당시 실지거래가액에 취득일부터 1984.12.31.까지의 <strong>생산자물가상승분</strong>을 더한 금액 중 <strong>많은 것</strong>입니다 (
          <LawArticleModal legalBasis="소득세법 시행령 §176의2" label="영 §176조의2④" />
          {" · "}
          <LawArticleModal legalBasis="소득세법 시행규칙 §85의2" label="규칙 §85의2" />
          ). ②를 채택하면 필요경비는 개산공제가 아니라 실제 지출액(자본적지출·양도비)입니다.
        </p>

        <FieldCard
          label={`${partLabel}실제 취득일`}
          required
          hint="위 취득일 칸은 의제취득일로 바뀌었습니다 — 매매계약서상 실제 취득일(잔금일 등)을 확인하세요. 생산자물가상승분은 이 날짜가 속한 달부터 계산합니다."
        >
          <DateInput
            value={original}
            onChange={(v) => onAssetChange(part === "land" ? { preDeemedOriginalLandAcquisitionDate: v } : { preDeemedOriginalAcquisitionDate: v })}
            data-field={part === "land" ? "preDeemedOriginalLandAcquisitionDate" : "preDeemedOriginalAcquisitionDate"}
            data-testid="pre-deemed-purchase-original-date"
          />
        </FieldCard>

        {compare ? (
          <CurrencyInput
            label={`${partLabel}취득 당시 실지거래가액 (선택)`}
            hint="알고 있으면 입력하세요(물건 전체 금액 — 지분이면 시스템이 지분율을 적용합니다). ② 실가 + 생산자물가상승분과 위 ①을 견줍니다. 비우면 ①만 계산합니다."
            value={asset.preDeemedActualPrice}
            onChange={(v) => onAssetChange({ preDeemedActualPrice: v })}
            data-field="preDeemedActualPrice"
            data-testid="pre-deemed-purchase-actual-price"
          />
        ) : (
          <p className="text-xs text-amber-800 leading-relaxed dark:text-amber-200" data-testid="pre-deemed-purchase-actual-note">
            {isRedev ? (
              <>위 ⑤에 입력한 실거래가 취득가액으로 ②를 계산합니다. ①과 견주려면 ⑤에서 환산을 고르고 §166③ 칸과 취득 당시 실지거래가액을 함께 입력하세요.</>
            ) : (
              <>위에 입력한 {partLabel}취득가액(실지거래가액)으로 ②를 계산합니다. ①과 견주려면 취득가액 산정 방식에서 「환산취득가」·「감정가액」·「매매사례가액」을
              고르고 취득 당시 실지거래가액을 함께 입력하세요.</>
            )}
          </p>
        )}

        {isPre && isBeforePpiSeries(original) && (
          <FieldCard
            label="생산자물가상승 배율 (직접 입력)"
            required
            hint="실제 취득월이 생산자물가지수 계열(1965.01.~) 전이라 자동 산정할 수 없습니다. 배율은 1984.12. 지수를 취득월 지수로 나눈 비율입니다(한국은행 조사 지수)."
          >
            <DecimalInput
              value={asset.preDeemedPpiRatio}
              onChange={(v) => onAssetChange({ preDeemedPpiRatio: v })}
              data-field="preDeemedPpiRatio"
              data-testid="pre-deemed-purchase-ppi-ratio"
            />
          </FieldCard>
        )}

        {isPre && ratioBelowOne(original) && (
          <p className="text-xs text-amber-800 leading-relaxed dark:text-amber-200" data-testid="pre-deemed-purchase-ratio-below-one">
            이 달의 생산자물가지수가 1984.12.보다 높아 ②가 실지거래가액보다 작게 계산됩니다(상승률이 음수 — 법문대로 그대로 적용합니다).
          </p>
        )}
      </ToneCard>
    </div>
  );
}
