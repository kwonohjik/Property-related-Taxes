"use client";

/**
 * 나대지 구간 근거 «철거ㆍ멸실» — 빈집정비 철거 빈집 부속토지의 국가 등 공용·공공용 사용 예외(「지방세법 시행령」 §103의2 2호 단서) 하위 4칸
 * (NBL-STATE-HISTORY-E3-⑤ E3f-3 · U-4 · 계획서 `…e3-5d-vacant-public-use.ui.plan.md` §3).
 *
 * `OtherLandDemolishedFactsField`가 빈집정비 칸 바로 뒤에 그린다. 화면 순서 = ⑧ 첫 빈칸 순서: ① 공용·공공용 사용 → ② 유료·유상이전 약정(법 §109② 단서) → ③ 사용 개시일 → ④ 사용 종료일.
 * 어느 칸이 보이는가는 엔진 `demolishedPublicUseAsked`(= ④ 전송 = ⑧ 차단 = ⑫′ 400 — 노출 ≡ 필수) 한 함수다. UI는 날짜·시행본·답을 비교하지 않는다.
 * 선택지 값 `""`은 «미선택»(가정값 없음) — 노출된 칸의 미선택·날짜 빈칸은 ⑧이 막는다. 명시 «아니오»·«모름»은 막지 않고 엔진이 `demolished_other_use`로 접는다(확인 필요).
 * 종료일 빈칸을 «구간 끝까지»로 읽지 않는다(사용자 결정 2026-11-24). 하위 칸이 사라져도 저장값은 지우지 않는다(숨은 값 보존 — ④가 보내지 않는다).
 * `useEffect → store` 미러링이 없다(전부 렌더 파생 · 쓰기는 onChange).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import type { DemolishedRowView } from "@/lib/calc/nbl-demolished-row-scope";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { demolishedPublicUseAsked } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import type { DemolishedFact } from "@/lib/tax-engine/non-business-land/land-usage.types";

type Answer = Exclude<DemolishedFact, "">;

const LABELS = { yes: "예", no: "아니오", unknown: "모름" } as const satisfies Record<Answer, string>;
const ORDER: readonly Answer[] = ["yes", "no", "unknown"];

function options(i: number, key: string): RadioCardOption<Answer>[] {
  return ORDER.map((v) => ({ value: v, label: LABELS[v], testId: `nbl-other-state-event-${i}-demolished-${key}-${v}` }));
}

interface Props {
  /** 사건 행 번호(0부터). */
  index: number;
  idKey: string;
  /** 저장값 그대로의 행 — 답 의존 사슬은 저장값으로 평가한다(④·⑧·⑫′와 같은 함수). */
  event: NblOtherStateEventInput;
  view: DemolishedRowView;
  patchEvent: (patch: Partial<NblOtherStateEventInput>) => void;
}

export function OtherLandDemolishedPublicUseField({ index: i, idKey, event: ev, view, patchEvent }: Props) {
  const asked = demolishedPublicUseAsked(view.need, ev);
  if (!asked.publicUse) return null;

  return (
    <ToneCard tone="amber" title="국가 등 공공용 사용 예외(「지방세법 시행령」 §103의2 2호 단서)">
      <div className="space-y-3" data-testid={`nbl-other-state-event-${i}-demolished-publicuse`}>
        <CollapsibleHintCard tone="amber" summary="예외의 요건과 이 계산기의 처리">
          <ul className="list-disc space-y-1 pl-4 leading-snug">
            <li>건축을 위한 용도 외로 쓴 부속토지는 원래 한시 별도합산에서 제외되지만, 빈집정비사업으로 철거한 빈집의 부속토지는 국가·지방자치단체·지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용하고 「지방세법」 §109② 단서에 따라 재산세가 부과되면 그 사용 기간 동안 포함됩니다.</li>
            <li>일부만 사용했으면 «아니오»입니다 — 이 계산기는 면적을 안분하지 않습니다.</li>
            <li>지방자치단체의 철거비 지원 등이 대가에 해당하는지, 공용·공공용 사용에 해당하는지는 과세권자가 판단합니다.</li>
          </ul>
        </CollapsibleHintCard>

        <FieldCard
          label="그 부속토지를 국가·지방자치단체·지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용했습니까?"
          required
          hint="1년 이상 사용할 것이 계약서 등으로 입증되면 «예»입니다. 그 구간의 토지 전부를 사용한 경우만 «예»이고, 아니오·모름은 인정하지 않고 확인 필요로 표시합니다."
        >
          <RadioCardGroup
            name={`nblOtherStateDemolishedPublicUse-${idKey}-${i}`}
            tone="amber"
            layout="inline"
            options={options(i, "publicuse")}
            value={ev.demolishedPublicUseBefore ?? ""}
            onChange={(v) => patchEvent({ demolishedPublicUseBefore: v })}
            data-field={`nblOtherStateEvents.${i}.demolishedPublicUseBefore`}
          />
        </FieldCard>

        {asked.paid && (
          <FieldCard
            label="그 사용이 유료이거나, 소유권 유상이전을 약정하고 취득 전에 미리 사용한 경우였습니까?"
            required
            hint="무상 사용이면 재산세가 비과세라 «아니오»입니다 — 그때는 해당 기간의 재산세 구분을 따로 입력하고 근거로 「비과세·면제 토지」를 고르세요(자동 전환 없음). 재산세 과세내역(고지서)으로 확인하세요."
          >
            <RadioCardGroup
              name={`nblOtherStateDemolishedPublicUsePaid-${idKey}-${i}`}
              tone="amber"
              layout="inline"
              options={options(i, "publicusepaid")}
              value={ev.demolishedPublicUsePaidBefore ?? ""}
              onChange={(v) => patchEvent({ demolishedPublicUsePaidBefore: v })}
              data-field={`nblOtherStateEvents.${i}.demolishedPublicUsePaidBefore`}
            />
          </FieldCard>
        )}

        {asked.dates && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldCard
              stacked
              field={`nblOtherStateEvents.${i}.demolishedPublicUseFromBefore`}
              label="공용·공공용 사용 시작일"
              required
              hint="국가 등이 그 부속토지를 쓰기 시작한 날입니다(계약서 등으로 1년 이상 사용하기로 한 경우는 사용 개시일)."
            >
              <DateInput
                value={ev.demolishedPublicUseFromBefore ?? ""}
                onChange={(v) => patchEvent({ demolishedPublicUseFromBefore: v })}
                data-testid={`nbl-other-state-event-${i}-demolished-publicuse-from`}
              />
            </FieldCard>
            <FieldCard
              stacked
              field={`nblOtherStateEvents.${i}.demolishedPublicUseToBefore`}
              label="공용·공공용 사용 종료일"
              required
              hint="사용이 끝난 날입니다(그날 포함). 지금도 사용 중이면 이 나대지 구간이 끝나는 날 이후의 날짜를 직접 입력하세요 — 종료일 빈칸은 구간 끝으로 읽지 않습니다."
            >
              <DateInput
                value={ev.demolishedPublicUseToBefore ?? ""}
                onChange={(v) => patchEvent({ demolishedPublicUseToBefore: v })}
                data-testid={`nbl-other-state-event-${i}-demolished-publicuse-to`}
              />
            </FieldCard>
          </div>
        )}
      </div>
    </ToneCard>
  );
}
