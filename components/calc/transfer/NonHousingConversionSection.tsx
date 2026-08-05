"use client";

/**
 * 건물 전체를 주택으로 용도변경 (fuchsia)
 *
 * 「소득세법」 제95조 제5항·제6항 — 주택이 아닌 건물을 취득해 보유하다 주택으로 용도변경한 뒤
 * 양도하는 경우, 장기보유특별공제를 **비주택 기간(표1) + 주택 기간(표2)**으로 나누어 계산한다.
 * 「소득세법 시행령」 제154조 제5항 단서 — 비과세 보유기간도 주택으로 사용한 날부터 기산한다.
 *
 * 미리보기는 **엔진 헬퍼를 직접 호출**한다(`calcUsagePeriodInfo`·`calcConversionHoldingPct`).
 * 여기서 산식을 다시 쓰면 화면과 계산이 갈린다(dual truth).
 *
 * **배치는 겸용주택(`MixedUseSection`)과 같은 2분할 패턴**을 따른다:
 *   - `NonHousingConversionToggleRow` → ① 기본정보 (겸용주택 토글 아래·전체폭)
 *   - `NonHousingConversionExpandedPanel` → ③ 취득정보 (취득일 뒤)
 *
 * 토글만 ①로 올린 이유: 겸용주택과 **배타**라(`transfer-tax-validate-usage-conversion.ts`가 차단)
 * 「건물 전체가 주택이 됐나 / 일부만인가」를 한 자리에서 골라야 하는데, 주택은 ③이 기본 접힘이라
 * (`ACQUISITION_AUTO_OPEN_KINDS`에 housing 없음) 토글 자체가 발견되지 않았다.
 * 날짜·미리보기를 함께 올리지 않은 이유: 미리보기가 `acquisitionDate`(③ 입력)를 읽으므로
 * ①에 두면 취득일을 넣기 전에는 항상 빈 화면이 된다 — UI 순서 = 로직 순서.
 *
 * 형제: `GeneralBuildingConversionSection`(주택 → 상가, 반대 방향).
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";
import { DateInput } from "@/components/ui/date-input";
import { calcUsagePeriodInfo } from "@/lib/tax-engine/usage-period-info";
import { calcConversionHoldingPct } from "@/lib/tax-engine/conversion-holding-pct";
import { calculateHoldingPeriod, LTHD_CONVERSION_95_5_CUTOFF } from "@/lib/tax-engine/tax-utils";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 기간 분해 미리보기에 사용 */
  transferDate?: string;
}

/** 「N년 M개월」 — 미리보기 표시용 */
function periodLabel(from: Date, to: Date): string {
  const { years, months } = calculateHoldingPeriod(from, to);
  return `${years}년 ${months}개월`;
}

/**
 * 토글 행 — ① 기본정보의 겸용주택 토글 바로 아래에 **전체폭**으로 배치.
 * 확장 입력(주거용 사용 개시일·미리보기)은 `NonHousingConversionExpandedPanel`이 ③에서 렌더한다.
 *
 * 겸용주택 ON이면 잠근다 — 배타 조합을 계산 버튼까지 끌고 가지 않고 입력 시점에 차단한다
 * (「보유 중 일부 용도변경」이 겸용주택에 종속되는 것과 같은 방식).
 */
export function NonHousingConversionToggleRow({ asset, onChange }: Pick<Props, "asset" | "onChange">) {
  const blockedByMixedUse = asset.isMixedUseHouse === true;

  return (
    <div className="mt-2">
      <ToggleCard
        tone="fuchsia"
        title="건물 전체를 주택으로 용도변경"
        description="오피스텔·근린생활시설 등 주택이 아닌 건물을 취득한 뒤 건물 전부를 주거용으로 사용하거나 주택으로 용도변경한 경우 ON. 건물 일부만 주택이 된 경우는 위 「겸용주택 분리계산」을 쓰세요."
        checked={asset.hasNonHousingConversion ?? false}
        disabled={blockedByMixedUse}
        disabledReason="겸용주택 분리계산과 함께 사용할 수 없습니다 — 일부만 주택이 된 경우는 「보유 중 일부 용도변경」을 쓰세요."
        onCheckedChange={(v) => onChange({ hasNonHousingConversion: v })}
        trailing={<LawArticleModal legalBasis="소득세법 §95 ⑤" label="§95⑤ 혼합 공제율" />}
      />
    </div>
  );
}

/**
 * 확장 패널 — ③ 취득정보(취득일·취득가액 뒤)에 배치. 토글 OFF면 null 반환.
 * 미리보기가 취득일에 의존하므로 취득일 **뒤**여야 한다.
 */
export function NonHousingConversionExpandedPanel({ asset, onChange, transferDate }: Props) {
  // 접근부 가드 — stale sessionStorage·IndexedDB 이력에서 undefined로 도달할 수 있다.
  const enabled = asset.hasNonHousingConversion ?? false;
  const startDate = asset.residentialUseStartDate ?? "";

  /** §95⑤ 적용 개시 — 부칙 제19933호 제7조. 이 날 이전 양도는 종전 방식이다. */
  const beforeCutoff = useMemo(() => {
    if (!transferDate) return false;
    return new Date(transferDate) < LTHD_CONVERSION_95_5_CUTOFF;
  }, [transferDate]);

  /**
   * 기간 분해 + 공제율 미리보기 — **엔진 헬퍼 위임**. useMemo 순수(store 미러링 금지).
   * 날짜가 취득일 이전·양도일 이후면 `calcUsagePeriodInfo`가 null을 주고 표시를 보류한다.
   */
  const preview = useMemo(() => {
    if (!enabled || !startDate || !transferDate || !asset.acquisitionDate) return null;
    const acq = new Date(asset.acquisitionDate);
    const start = new Date(startDate);
    const transfer = new Date(transferDate);
    if ([acq, start, transfer].some((d) => Number.isNaN(d.getTime()))) return null;

    const info = calcUsagePeriodInfo(acq, start, transfer);
    if (!info) return null;

    const { table1Pct, table2HoldingPct, holdingPct, capped } = calcConversionHoldingPct(
      info.t1HoldingYears,
      info.t2HoldingYears,
    );
    return {
      total: periodLabel(acq, transfer),
      nonHousing: periodLabel(acq, start),
      housing: periodLabel(start, transfer),
      table1Pct,
      table2HoldingPct,
      holdingPct,
      capped,
    };
  }, [enabled, startDate, transferDate, asset.acquisitionDate]);

  if (!enabled) return null;

  return (
    <div className="space-y-3 rounded-lg border border-fuchsia-300 bg-fuchsia-50/70 p-3 dark:border-fuchsia-700/60 dark:bg-fuchsia-950/30">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">
          건물 전체를 주택으로 용도변경
        </p>
        <LawArticleModal legalBasis="소득세법 §95 ⑤" label="§95⑤ 혼합 공제율" />
      </div>

      <FieldCard
        label="사실상 주거용 사용 개시일"
        hint="사실상 주거용으로 사용한 날. 불분명하면 건축물대장상 용도변경일을 입력하세요. 취득일 이후, 양도일 이전이어야 합니다."
        trailing={
          <PrecedentArticleModal
            citation="서면-2020-부동산-5098"
            label="거주요건 기준시점"
            kind="interpretation"
            summary={
              "[부동산납세과-1247]\n\n주택이 아닌 건물을 취득하여 주택으로 용도변경한 경우\n1세대 1주택 비과세 거주요건 적용 여부는 그 자산을 주택으로 사용한 날(주택 취득시점)을 기준으로 판단한다.\n\n⇒ 취득 당시 조정대상지역이었더라도 용도변경 당시 해제되었다면 거주요건이 적용되지 않으며,\n   그 반대의 경우에는 거주요건이 적용된다."
            }
          />
        }
      >
        <DateInput
          value={startDate}
          onChange={(v) => onChange({ residentialUseStartDate: v })}
        />
      </FieldCard>

      {/* 양도일이 시행일 전이면 §95⑤이 적용되지 않는다 — 미리보기 대신 안내를 띄운다. */}
      {beforeCutoff && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="font-semibold">2025년 1월 1일 이후 양도분부터 적용됩니다</p>
          <p className="mt-1">
            「소득세법」 제95조 제5항·제6항은 부칙(법률 제19933호) 제7조에 따라 2025년 1월 1일 이후
            양도분부터 적용됩니다. 이 양도일에는 장기보유특별공제가 종전 방식으로 계산됩니다.
            (비과세 보유기간 기산은 2024년 3월 1일 이후 양도분부터 별도로 적용됩니다.)
          </p>
        </div>
      )}

      {/* 자동 도출 — 엔진 헬퍼가 낸 값 그대로. 정적 fuchsia 클래스(ToneCard는 fuchsia 미지원) */}
      {!beforeCutoff && preview && (
        <div className="space-y-1 rounded border border-fuchsia-300 bg-fuchsia-100/60 px-3 py-2 text-xs text-fuchsia-800 dark:border-fuchsia-800/60 dark:bg-fuchsia-950/40 dark:text-fuchsia-200">
          <div className="flex justify-between">
            <span>총 보유기간</span>
            <span className="font-semibold" data-testid="conversion-total-holding">
              {preview.total}
            </span>
          </div>
          <div className="flex justify-between">
            <span>비주택 보유기간</span>
            <span className="font-semibold" data-testid="conversion-nonhousing-holding">
              {preview.nonHousing} → 표1 {preview.table1Pct}%
            </span>
          </div>
          <div className="flex justify-between">
            <span>주택 보유기간</span>
            <span className="font-semibold" data-testid="conversion-housing-holding">
              {preview.housing} → 표2 {preview.table2HoldingPct}%
            </span>
          </div>
          <div className="flex justify-between border-t border-fuchsia-200 pt-1 dark:border-fuchsia-800/60">
            <span>보유기간 공제율 합계</span>
            <span className="font-semibold" data-testid="conversion-holding-rate">
              {preview.holdingPct}%
            </span>
          </div>
          {preview.capped && (
            <p className="text-caption" data-testid="conversion-rate-capped">
              합계가 40%를 넘어 40%로 적용됩니다 (§95⑤1호 단서).
            </p>
          )}
          <p className="text-caption">
            거주기간 공제율(연 4%, 40% 한도)은 별도로 더해집니다. 거주기간은 「보유 상황」 단계에서 입력하세요.
          </p>
        </div>
      )}
    </div>
  );
}
