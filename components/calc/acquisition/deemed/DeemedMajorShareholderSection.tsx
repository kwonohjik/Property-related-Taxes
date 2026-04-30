/**
 * 간주취득 — 과점주주 패널 (Step 1-D-A)
 * 지방세법 §7의2①
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import type { FormState } from "../shared";

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

export function DeemedMajorShareholderSection({ form, set }: Props) {
  const isListed = form.deemedMajorIsListed ?? false;

  // 과세 미리보기 계산
  const corpVal = parseAmount(form.deemedMajorCorporateAssetValue ?? "") ?? 0;
  const prevR   = parseFloat(form.deemedMajorPrevShareRatio ?? "0") || 0;
  const newR    = parseFloat(form.deemedMajorNewShareRatio  ?? "0") || 0;
  const taxableRatioPct = Math.max(0, newR - prevR);
  const deemedBase = corpVal > 0 && taxableRatioPct > 0
    ? Math.floor(corpVal * taxableRatioPct / 100)
    : 0;
  const showPreview = !isListed && corpVal > 0 && newR > prevR;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-amber-700">과점주주 간주취득 상세</p>
        <TaxHelp
          title="과점주주 간주취득 (지방세법 §7의2①)"
          summary="법인 주식·지분을 취득해 과점주주(50% 초과)가 되면, 법인 보유 자산 취득으로 간주 과세"
          details={`## 개요
주주 1인 + 특수관계인 지분 합계 50% 초과 → 과점주주 성립

## 과세 요건
① 과점주주 도달 (50% 초과)
② 지분 증가분에 과세 (이미 과점주주였으면 증가분만)
③ 법인이 과세대상 자산 보유 (부동산·차량·기계장비 등)

## 비과세 (§9①)
- 상장법인(유가증권시장·코스닥·코넥스)의 과점주주는 과세 제외

## 과세표준
법인 보유 과세대상 자산 시가표준액 × 과세 지분율(증가분)`}
          legalBasis="지방세법 제7조의2 제1항"
        />
      </div>

      {/* 상장법인 여부 */}
      <ToggleCard
        tone="rose"
        title="상장법인 여부"
        description="유가증권시장·코스닥·코넥스 상장법인은 과세 제외 (§7의2① 단서)"
        checked={isListed}
        onCheckedChange={(v) => set("deemedMajorIsListed", v)}
      >
        <div className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-800">
          상장법인의 과점주주는 취득세 과세 대상이 아닙니다.
          계산 없이 비과세로 처리됩니다.
        </div>
      </ToggleCard>

      {/* 법인 보유 자산 시가표준액 */}
      <div>
        <CurrencyInput
          label="법인 보유 자산 시가표준액 합계"
          value={form.deemedMajorCorporateAssetValue ?? ""}
          onChange={(v) => set("deemedMajorCorporateAssetValue", v)}
          placeholder="예: 1,000,000,000"
          disabled={isListed}
        />
        <p className="text-xs text-muted-foreground mt-1">
          법인이 보유한 토지·건물 등 과세대상 자산의 시가표준액 합계 (§7의2① 본문)
        </p>
      </div>

      {/* 취득 전 지분율 */}
      <div>
        <p className="text-sm font-medium mb-1">취득 전 지분율</p>
        <DecimalInput
          value={form.deemedMajorPrevShareRatio ?? ""}
          onChange={(v) => set("deemedMajorPrevShareRatio", v)}
          placeholder="0 ~ 100 (신규 진입이면 0)"
          unit="%"
          disabled={isListed}
        />
        <p className="text-xs text-muted-foreground mt-1">
          이미 보유 중인 지분 비율. 신규 진입이면 0 입력
        </p>
      </div>

      {/* 취득 후 지분율 */}
      <div>
        <p className="text-sm font-medium mb-1">취득 후 지분율</p>
        <DecimalInput
          value={form.deemedMajorNewShareRatio ?? ""}
          onChange={(v) => set("deemedMajorNewShareRatio", v)}
          placeholder="50 초과여야 과점주주"
          unit="%"
          disabled={isListed}
        />
        <p className="text-xs text-muted-foreground mt-1">
          과점주주 요건: 주주 1인 + 특수관계인 지분 합계 50% 초과 (§7의2①)
        </p>
      </div>

      {/* 과점주주 도달일 */}
      <div>
        <p className="text-sm font-medium mb-1">
          과점주주 도달일 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </p>
        <DateInput
          value={form.deemedMajorShareholderDate ?? ""}
          onChange={(v) => set("deemedMajorShareholderDate", v)}
          disabled={isListed}
        />
        <p className="text-xs text-muted-foreground mt-1">
          주식·지분 취득으로 과점주주 기준(50% 초과)에 달한 날
        </p>
      </div>

      {/* 과세 미리보기 */}
      {showPreview && (
        <div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
          <p className="font-medium text-amber-800">과세 미리보기</p>
          <p className="text-amber-700">
            과세 지분율 = {prevR}% → {newR}% (증가 {taxableRatioPct.toFixed(2)}%p)
          </p>
          <p className="text-amber-700">
            간주취득 과세표준 = {formatKRW(corpVal)} × {taxableRatioPct.toFixed(2)}% = {formatKRW(deemedBase)}
          </p>
          <p className="font-medium text-amber-800">
            예상 취득세 = {formatKRW(deemedBase)} × 2% = {formatKRW(Math.floor(deemedBase * 0.02))}
          </p>
          <p className="text-xs text-amber-600">* 농어촌특별세·지방교육세 별도</p>
        </div>
      )}
    </div>
  );
}
