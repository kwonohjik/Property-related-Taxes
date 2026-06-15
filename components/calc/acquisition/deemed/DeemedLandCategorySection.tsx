/**
 * 간주취득 — 지목변경 패널 (Step 1-D-B)
 * 지방세법 §7④
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import { getBasicRate } from "@/lib/tax-engine/acquisition-tax-rate";
import { selectCls } from "../shared";
import { LAND_CATEGORY_OPTIONS } from "../shared";
import type { FormState } from "../shared";

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

// 지목변경 간주취득 세율 — 엔진 단일 진실 (2%)
const DEEMED_RATE = getBasicRate("land", "deemed_land_category", 0).rate;
const DEEMED_RATE_LABEL = `${(DEEMED_RATE * 100).toFixed(1).replace(/\.0$/, "")}%`;

export function DeemedLandCategorySection({ form, set }: Props) {
  const prevSv = parseAmount(form.deemedLandPrevStandardValue ?? "") ?? 0;
  const newSv  = parseAmount(form.deemedLandNewStandardValue  ?? "") ?? 0;
  const diff   = newSv - prevSv;
  const showPreview = prevSv > 0 || newSv > 0;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-sky-700">지목변경 간주취득 상세</p>
        <TaxHelp
          title="지목변경 간주취득 (지방세법 §7④)"
          summary="지목 변경으로 시가표준액이 증가하면, 증가분 가치에 해당하는 취득으로 간주 과세"
          details={`## 개요
공간정보관리법상 지목 변경 + 시가표준액 증가 시 과세

## 비과세·비해당
- 시가표준액이 변경 전과 동일하거나 감소한 경우
- 지목변경 등기 없이 사용 목적만 변경한 경우

## 과세표준
변경 후 시가표준액 - 변경 전 시가표준액 (양수인 경우만)

## 취득 시기 (지방세법 §20)
사실상 지목변경 완료일과 공부 등록일 중 빠른 날`}
          legalBasis="지방세법 제7조의2 제2항"
        />
      </div>

      {/* 변경 전 지목 */}
      <div>
        <p className="text-sm font-medium mb-1">변경 전 지목</p>
        <select
          className={selectCls}
          value={form.deemedLandPrevCategory ?? ""}
          onChange={(e) => set("deemedLandPrevCategory", e.target.value)}
        >
          <option value="">선택...</option>
          {LAND_CATEGORY_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* 변경 후 지목 */}
      <div>
        <p className="text-sm font-medium mb-1">변경 후 지목</p>
        <select
          className={selectCls}
          value={form.deemedLandNewCategory ?? ""}
          onChange={(e) => set("deemedLandNewCategory", e.target.value)}
        >
          <option value="">선택...</option>
          {LAND_CATEGORY_OPTIONS
            .filter(([v]) => v !== form.deemedLandPrevCategory)
            .map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          변경 전 지목과 동일한 지목은 선택 불가
        </p>
      </div>

      {/* 변경 전 시가표준액 */}
      <div>
        <CurrencyInput
          label="변경 전 시가표준액"
          value={form.deemedLandPrevStandardValue ?? ""}
          onChange={(v) => set("deemedLandPrevStandardValue", v)}
          placeholder="지목변경 전 토지 공시가격 기준"
        />
      </div>

      {/* 변경 후 시가표준액 */}
      <div>
        <CurrencyInput
          label="변경 후 시가표준액"
          value={form.deemedLandNewStandardValue ?? ""}
          onChange={(v) => set("deemedLandNewStandardValue", v)}
          placeholder="지목변경 후 토지 공시가격 기준"
        />
      </div>

      {/* 과세 미리보기 */}
      {showPreview && (
        <div className="rounded-md bg-sky-100/60 border border-sky-200 px-3 py-2 text-sm space-y-1">
          <p className="font-medium text-sky-800">과세 미리보기</p>
          {diff > 0 ? (
            <>
              <p className="text-sky-700">
                과세표준 = 변경 후 {formatKRW(newSv)} - 변경 전 {formatKRW(prevSv)} = {formatKRW(diff)}
              </p>
              <p className="font-medium text-sky-800">
                예상 취득세 = {formatKRW(diff)} × {DEEMED_RATE_LABEL} = {formatKRW(Math.floor(diff * DEEMED_RATE))}
              </p>
            </>
          ) : (
            <p className="text-amber-700">
              변경 후 시가표준액이 변경 전 이하 — 과세 대상 없음
            </p>
          )}
          <p className="text-xs text-sky-600">* 농어촌특별세·지방교육세 별도</p>
        </div>
      )}

      {/* 사실상 지목변경 완료일 */}
      <div>
        <p className="text-sm font-medium mb-1">
          사실상 지목변경 완료일 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </p>
        <DateInput
          value={form.deemedLandChangeDate ?? ""}
          onChange={(v) => set("deemedLandChangeDate", v)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          토지의 형질변경 등 사실상 지목이 변경된 날
        </p>
      </div>

      {/* 공부 지목 변경 등록일 */}
      <div>
        <p className="text-sm font-medium mb-1">
          공부(公簿) 지목 변경 등록일 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </p>
        <DateInput
          value={form.deemedLandRegistrationDate ?? ""}
          onChange={(v) => set("deemedLandRegistrationDate", v)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          지적공부상 지목이 변경 등록된 날. 사실상 변경 완료일과 둘 중 빠른 날이
          취득시기이며 신고기한(60일)의 기산점이 됩니다 (지방세법 §20)
        </p>
      </div>
    </div>
  );
}
