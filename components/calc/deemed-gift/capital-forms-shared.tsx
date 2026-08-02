"use client";

/**
 * 자본거래 폼 공용 조각 — `capital-forms.tsx`와 `convertible-stock-form.tsx`가 함께 쓴다.
 * (두 파일이 서로를 import하면 순환이 되므로 공용분만 여기로 분리 — 800줄 정책 분할의 부산물)
 */

import { DateInput } from "@/components/ui/date-input";
import { KiwoomValuationAutoFetchButton } from "@/components/calc/KiwoomValuationAutoFetchButton";
import type { DeemedFormState } from "./shared";

export type SetFn = (patch: Partial<DeemedFormState>) => void;
export type Props = { form: DeemedFormState; set: SetFn };

export const CI_SHARES_LABEL: Record<DeemedFormState["ciSubType"], string> = {
  forfeited_realloc: "배정받은 실권주수",
  third_party: "직접배정 신주수",
  excess: "초과배정 신주수",
  no_realloc: "실권주수",
};

/** §39① 공모 모집 배정 제외 3택 — 증자·전환주식·cap-table 공용 옵션 */
export const ALLOCATION_METHOD_OPTIONS = [
  { value: "normal", label: "일반 배정" },
  { value: "public_offering", label: "공모 배정 (§9⑦ 모집방법)" },
  { value: "deemed_public_offering", label: "간주모집 (자시령 §11③)" },
] as const;

/** 3택 선택 시 화면에 붙는 효과 안내 — 「왜 0인가/왜 과세인가」를 입력 시점에 알려준다 */
export function allocationMethodHint(v: DeemedFormState["ciAllocationMethod"]): string {
  if (v === "public_offering")
    return "주권상장법인이 50인 이상에게 청약을 권유하는 모집방법으로 배정한 경우 — 「상증법」 §39①이 적용되지 않아 증여재산가액이 0이 됩니다.";
  if (v === "deemed_public_offering")
    return "청약권유 인원이 50인 미만이지만 전매기준에 해당해 모집으로 의제된 경우 — 「상증령」 §29③으로 위 제외가 취소되어 일반 배정과 같이 과세됩니다.";
  return "실권주 일부만 공모로 배정했다면 공모분을 뺀 주식수를 「이익 귀속 주식수」에 입력하세요.";
}

/**
 * §63①1가 종가평균 키움 자동조회 블록 — 증자 §39 · 전환주식 §39①3호 공용.
 * 평가기준일은 호출부가 결정한다(상증령 §29① — 상장 주주배정 권리락일 / 전환한 날 / 납입일,
 * 전환주식 발행 시점은 §29②6나의 「발행 당시」로 증여일과 다르다).
 * 자동조회는 기준일 전후 각 2개월 전 구간을 쓴다 — §52의2② 단축 사유가 있으면 직접 산정해야 한다.
 */
export function ListedAvgAutoFetch({
  stockCode,
  onStockCode,
  valuationDate,
  dateLabel,
  onFill,
  testId,
  onValuationDate,
}: {
  stockCode: string;
  onStockCode: (v: string) => void;
  valuationDate: string;
  dateLabel: string;
  onFill: (v: string) => void;
  testId: string;
  /** 기준일이 증여일과 다른 경우(전환주식 발행 당시)만 전달 — 있으면 DateInput을 함께 렌더 */
  onValuationDate?: (v: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
      <p className="text-xs font-semibold text-emerald-700">§63①1가 종가평균 자동조회 (키움, 선택)</p>
      <input
        type="text"
        inputMode="text"
        maxLength={6}
        value={stockCode}
        onChange={(e) => onStockCode(e.target.value.toUpperCase())}
        placeholder="종목코드 6자리"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        aria-label="종목코드"
        data-testid={testId}
      />
      {onValuationDate ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">평가기준일 — {dateLabel}</label>
          <DateInput value={valuationDate} onChange={onValuationDate} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          평가기준일 — {dateLabel}
          {valuationDate ? ` (${valuationDate})` : " (미입력)"}
        </p>
      )}
      <KiwoomValuationAutoFetchButton
        variant="card"
        stockCode={stockCode}
        valuationDate={valuationDate}
        onFill={(patch) => onFill(String(patch.listedStockAvgPrice))}
      />
    </div>
  );
}
