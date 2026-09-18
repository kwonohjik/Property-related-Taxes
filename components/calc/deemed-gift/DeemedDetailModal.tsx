"use client";

/**
 * DeemedDetailModal — 증여이익 의제 유형 "② 상세 입력" 모달.
 * 유형 선택 시 자동 오픈. 증여일 + 유형별 상세 필드를 별도 창에서 입력.
 * 폭은 상속세 재산입력 모달과 동일(sm:max-w-[min(50.4rem,…)]).
 */

import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DeemedInputFields,
  DEEMED_TYPE_META,
  type DeemedFormState,
} from "@/components/calc/deemed-gift/shared";

/**
 * 조문이 증여시기를 명문으로 정하는 유형의 날짜 라벨·안내.
 * 나머지 유형은 「증여일」 기본값을 쓴다 — 여기에 없는 유형을 지어내지 않는다.
 */
const GIFT_DATE_LABEL = {
  related_corp: {
    label: "증여시기 — 수혜법인의 사업연도 종료일",
    hint: "상증법 §45의3③ — 증여의제이익은 사업연도 단위로 계산하고 그 종료일이 증여시기입니다 (거래일·신고일 아님)",
  },
  specific_corp: {
    label: "증여시기 — 거래한 날",
    hint: "상증법 §45의5① 「거래한 날을 증여일로 하여」. §43² 소급 1년 합산의 기준일이기도 합니다",
  },
} as const;

export function DeemedDetailModal({
  open,
  onOpenChange,
  form,
  set,
  error,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: DeemedFormState;
  set: (patch: Partial<DeemedFormState>) => void;
  /** D7: 검증 실패로 재오픈 시 모달 내부에 표시 (오버레이 뒤 메인 에러 가림 방지) */
  error?: string | null;
}) {
  const title = form.type
    ? `${DEEMED_TYPE_META[form.type].label} 상세 입력`
    : "상세 입력";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0"
        showCloseButton={false}
      >
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div
          className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3"
          data-testid="deemed-detail-dialog"
        >
          {/* 증여일 — 신탁이익은 원본·수익 증여시기를 폼 내부에서 분리 입력하므로 공통 증여일 숨김(§33·§25①) */}
          {/* ⚠️ 조문이 증여시기를 명문으로 정하는 유형은 라벨을 그 문언으로 바꾼다 —
                 §45의3③은 「사업연도 종료일」, §45의5①은 「거래한 날」이다. 종전에는 두 유형 모두
                 「증여일」로만 물어 사용자가 거래일·신고일을 넣어도 막히지 않았다. */}
          {form.type !== "trust_benefit" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 mb-4">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                {GIFT_DATE_LABEL[form.type as keyof typeof GIFT_DATE_LABEL]?.label ?? "증여일"}
              </label>
              <DateInput value={form.giftDate} onChange={(v) => set({ giftDate: v })} />
              <p className="mt-1 text-xs text-muted-foreground">
                {GIFT_DATE_LABEL[form.type as keyof typeof GIFT_DATE_LABEL]?.hint ??
                  "증여시기·적정이자율 연도 기준"}
              </p>
            </div>
          )}

          {/* ② 상세 입력 (유형별) */}
          {form.type && <DeemedInputFields form={form} set={set} />}

          {error && (
            <p
              className="mt-3 text-sm font-medium text-rose-600"
              data-testid="deemed-detail-error"
            >
              {error}
            </p>
          )}
        </div>
        <div className="border-t px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            data-testid="deemed-detail-confirm"
            className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            확인
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
