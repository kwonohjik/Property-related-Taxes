"use client";

/**
 * 결과 화면의 **같은 날 양도 순서 선택** 표시 — 「§154⑨ 선택으로 주택 수에서 뺀 주택」 (결정 #40).
 *
 * 선택으로 뺀 주택이 있으면 근거 조문과 함께 밝힌다 — 세대 주택 수가 입력 목록보다 적게 계산된 이유다. 순서를 고르지 않은 채
 * 결론을 가를 수 있으면 그 고지도 같은 자리에 둔다. 입력(폼)에서 읽기만 한다(엔진 결과에 싣지 않는다 — 4종 결과뷰가 어댑터
 * 화이트리스트로 새 필드를 침묵 strip한다, `OneHouseJudgmentProvenanceLine` 주석과 같은 이유). `PrintSection` 밖에 둔다:
 * 「이 세액이 어떤 사실에 근거하는가」라 선택 출력과 무관하게 인쇄돼야 한다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  SAME_DAY_EXCLUDED_BASIS,
  sameDayExcludedRows,
  sameDayOrderNotice,
  sameDayRowLabel,
} from "@/lib/calc/same-day-transfer-notice";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type FormSlice = {
  houses?: readonly HouseEntry[];
  transferDate?: string;
  assets?: readonly { assetKind?: string }[];
};

export function SameDayOrderLine({
  form,
  label,
}: {
  form: FormSlice | null | undefined;
  /** 다건처럼 여러 건을 한 화면에 그릴 때 어느 건인지 밝힌다. */
  label?: string;
}) {
  if (!form) return null;
  const excluded = sameDayExcludedRows(form.houses, form.transferDate, form.assets?.[0]?.assetKind);
  const notice = sameDayOrderNotice({
    primaryKind: form.assets?.[0]?.assetKind,
    houses: form.houses,
    transferDate: form.transferDate,
  });
  if (excluded.length === 0 && !notice) return null;
  return (
    <div data-testid="same-day-order-line">
      <ToneCard tone={excluded.length > 0 ? "emerald" : "amber"} title={label ? `같은 날 양도 순서 — ${label}` : "같은 날 양도 순서"}>
        {excluded.length > 0 && (
          <p className="text-sm leading-relaxed" data-testid="same-day-excluded">
            {excluded.map(sameDayRowLabel).join(" · ")}을(를) <b>먼저 양도한 것으로 선택</b>해 양도일 현재 주택 수에서 뺐습니다
            ({SAME_DAY_EXCLUDED_BASIS}).
          </p>
        )}
        {notice && (
          <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200" data-testid="same-day-undecided">
            {notice}
          </p>
        )}
      </ToneCard>
    </div>
  );
}
