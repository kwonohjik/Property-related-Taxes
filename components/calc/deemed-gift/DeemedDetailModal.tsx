"use client";

/**
 * DeemedDetailModal — 증여이익 의제 유형 "② 상세 입력" 모달.
 * 유형 선택 시 자동 오픈. 증여일 + 유형별 상세 필드를 별도 창에서 입력.
 * 폭은 상속세 재산입력 모달과 동일(sm:max-w-[min(50.4rem,…)]).
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { forProfitDoneeToggleVisible } from "@/lib/calc/gift-deemed-api";
import { incomeTaxedToggleVisible } from "@/lib/calc/gift-deemed-api";
import { incomeTaxedRosterNotice } from "@/lib/calc/gift-deemed-api";
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
  // 「상증령」§29① — §39 증자는 증여일이 **세 갈래**다. 상장 주주배정은 권리락일이고
  //   나머지는 납입일이며, 실권주를 배정받은 자가 납입일 **전에** 신주인수권증서를 교부받았다면
  //   그 교부일이다(같은 호 괄호 — 이 괄호가 화면 어디에도 없었다).
  // ⚠️ 1호의 모집단은 「유가증권시장 … 또는 코스닥시장에 상장된 주권을 발행한 법인」뿐이다 —
  //    **코넥스는 없다**. 아래 「주권상장법인등」 토글(§28⑤ · 증권시장에서 거래되는 법인)과
  //    모집단이 달라, 코넥스 상장법인은 그 토글을 켜더라도 증여일은 3호(납입일)로 간다.
  capital_increase: {
    label: "증여일 — 권리락일 또는 주식대금 납입일 (§29①)",
    hint: "상증령 §29① — ①유가증권시장·코스닥 상장법인이 **주주에게** 배정하면 권리락일 ②그 밖에는 주식대금 납입일(납입일 전에 실권주를 배정받은 자가 신주인수권증서를 교부받았다면 그 교부일). 코넥스는 1호 모집단이 아니므로 납입일 기준입니다",
  },
  convertible_stock: {
    label: "증여일 — 전환주식을 다른 종류의 주식으로 전환한 날 (§29①2호)",
    hint: "상증령 §29①2호. 차감항인 「발행 당시 이익」의 기준일은 이 날이 아니라 **전환주식 발행일**입니다(§29②6호 나목) — 아래 발행 시점 섹션에서 따로 받습니다",
  },
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
              <DateInput
                value={form.giftDate}
                onChange={(v) => set({ giftDate: v })}
                /* 🔴 종전에는 testid가 없어 E2E가 `dialog.getByLabel("연도")`의 «유일성»에
                   기대고 있었다. 다이얼로그에 날짜 입력이 하나 더 생기는 순간(§45의5
                   사업연도 종료일) 13건이 strict mode violation으로 깨졌다.
                   `DateInput`의 `data-testid`는 문서 주석이 바로 이 용도로 둔 것이다. */
                data-testid="deemed-gift-date"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {GIFT_DATE_LABEL[form.type as keyof typeof GIFT_DATE_LABEL]?.hint ??
                  "증여시기·적정이자율 연도 기준"}
              </p>
            </div>
          )}

          {/* ② 상세 입력 (유형별) */}
          {form.type && <DeemedInputFields form={form} set={set} />}

          {/* 「상증법」§2 9호·§4의2①·③ — §39 밖 단일 수증자 13종(7-12) + 명부형 3종의 단일 모드(7-15).
              노출 판정은 ④와 같은 함수이고 엔진 판정과의 parity를 anchor가 고정한다.
              명부 모드는 수증자가 여럿이라 행별 토글(7-13·7-14)이고, §45의2는 §4의2②가 실제소유자에게
              납세의무를 지우며, §39는 자체 토글이 있다. */}
          {forProfitDoneeToggleVisible(form) && (
            <div className="mt-4">
              <ToggleCard
                lawLinks="상증법"
                tone="violet"
                checked={form.doneeIsForProfitCorp}
                onCheckedChange={(v) => set({ doneeIsForProfitCorp: v })}
                title="수증자가 영리법인 (§2 9호·§4의2①·③)"
                description="영리법인은 증여세 납세의무자가 아닙니다(「상증법」 제2조제9호 「수증자」 정의에 비영리법인만 포함). 산출된 이익은 산출근거에 「제외 전 산출 이익」으로 남습니다."
                data-testid="deemed-donee-for-profit-corp"
              />
            </div>
          )}

          {/* 「상증법」§4의2③ — 수증자 1명(한 묶음) 입력만(7-16). ④와 같은 판정 함수 */}
          {incomeTaxedToggleVisible(form) && (
            <div className="mt-3">
              <ToggleCard
                lawLinks="상증법"
                tone="violet"
                checked={form.doneeIncomeTaxed}
                onCheckedChange={(v) => set({ doneeIncomeTaxed: v })}
                title="수증자에게 소득세·법인세 부과 (§4의2③)"
                description="이 증여재산(이익)에 대하여 수증자에게 「소득세법」에 따른 소득세 또는 「법인세법」에 따른 법인세가 부과되는 경우(비과세·감면되는 경우 포함) 증여세를 부과하지 않습니다. 산출된 이익은 산출근거에 「제외 전 산출 이익」으로 남습니다."
                data-testid="deemed-donee-income-taxed"
              />
            </div>
          )}
          {incomeTaxedRosterNotice(form) && (
            <p className="mt-3 text-xs text-muted-foreground" data-testid="deemed-donee-income-taxed-roster-notice">
              명부 입력에서는 「상증법」 제4조의2제3항(수증자에게 소득세·법인세가 부과되면 증여세 없음)을 반영하지 않습니다.
              소득세·법인세가 부과되는 수증자가 있으면 그 수증자는 이 결과를 그대로 적용할 수 없습니다.
            </p>
          )}

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
