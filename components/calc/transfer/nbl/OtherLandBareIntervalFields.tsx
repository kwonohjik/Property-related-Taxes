"use client";

/**
 * 기타토지 사건 행의 «나대지 구간 선언» 입력 — NBL-STATE-HISTORY-E3-1b (계획서 `docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.ui.plan.md` §5).
 *
 * 나대지(건축물 없는) 구간을 닫는 사건 행 — 신축 행 · 직전 건축물이 없는 재산세 과세 구분 변경 행(leaf `eventClosesBareInterval`) — 에서
 * 그 나대지 기간의 «재산세 구분 → 근거 → (공지상태) 면적한도»를 받는다. 노출 여부는 호출자가 같은 leaf 술어로 정한다.
 *
 * 판정은 하지 않는다 — 근거 선택지(`eventBasisOptions`)·접힘 여부(`resolveBareDeclaration`)·고지 문구는 엔진 leaf·상수를 읽는다(⑤ = ④ 전송형 = ⑭ 매퍼 = 엔진).
 * 표시 fallback: 신축 행 구분 `""` = 「종합합산」이 선택된 것으로 보인다(선언 없음 · 고지 없음) · 구분 변경 행 `""` = 「모름」(종합합산 + 확인 필요).
 * 구분을 바꾸면 근거·면적한도·(E3f-2) «철거ㆍ멸실» 사실 칸 4개를 함께 리셋한다 — **onChange 핸들러에서만**(`useEffect → store` 미러링 금지).
 * E3f-2 — 철거 행 뒤 나대지 구간(`offersDemolished`)은 근거 «철거ㆍ멸실»을 받고 `OtherLandDemolishedFactsField`가 사실 칸을 그린다(U-3).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { DemolishedRowView } from "@/lib/calc/nbl-demolished-row-scope";
import type { StateHistoryPreviewRow } from "@/lib/calc/nbl-other-state-history-preview";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { AreaWithinLimit } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { eventBasisOptions } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { resolveBareDeclaration } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
import { OtherLandDemolishedFactsField } from "./OtherLandDemolishedFactsField";
import { PropertyTaxBasisRadio } from "./PropertyTaxBasisRadio";

/** «직전 재산세 구분» 선택지 — 라벨은 `PROPERTY_TAX_TYPE_LABEL` 단일 소스(enum 이름과 라벨이 직관과 다르다: separate=별도합산 · special_sum=분리과세). 순서: 비과세·면제 / 분리과세 / 별도합산 / 종합합산 (/ 모름). */
const PTAX_ORDER = ["exempt", "special_sum", "separate", "comprehensive"] as const satisfies readonly PropertyTaxType[];
export type PtaxChoice = PropertyTaxType | "unknown";

/** `withUnknown` = 「모름」 선택지 포함(철거 · 구분 변경 행 — `""` = 모름). 신축 행은 «선언 없음 = 종합합산»이라 모름이 없다. */
export function ptaxOptions(i: number, withUnknown: boolean): RadioCardOption<PtaxChoice>[] {
  return [
    ...PTAX_ORDER.map((v) => ({ value: v as PtaxChoice, label: PROPERTY_TAX_TYPE_LABEL[v], testId: `nbl-other-state-event-${i}-ptax-${v}` })),
    ...(withUnknown ? [{ value: "unknown" as PtaxChoice, label: STATE_PROPERTY_TAX_TYPE_LABEL.unknown, testId: `nbl-other-state-event-${i}-ptax-unknown` }] : []),
  ];
}

/**
 * 근거 hint의 «철거 후 한시» 문장 — 철거 행 뒤 나대지 구간은 근거 «철거ㆍ멸실»을 받고(아래 사실 칸), 그 밖(취득 전 철거로 첫 구간이 나대지 등 — 철거일 출처가 없다)은 종전대로 근거로 받지 않고 9호 유예기간으로 입력한다(UQ-9).
 * 건축 중 기간은 어느 쪽이든 근거로 받지 않는다(유예 5호).
 */
const DEMOLISHED_BASIS_HINT = {
  offered: "철거 후 한시 별도합산은 근거 「철거ㆍ멸실」을 고르고 아래 사실 칸을 답하세요. 건축 중 기간은 근거로 받지 않고 「부득이한 사유 유예기간」으로 입력합니다.",
  notOffered: "철거 후 한시 별도합산·건축 중 기간은 근거로 받지 않고 「부득이한 사유 유예기간」으로 입력합니다.",
} as const;

const RESET_DEMOLISHED_FACTS = {
  demolishedPermitBefore: undefined,
  demolishedOtherUseBefore: undefined,
  demolishedVacantHouseBefore: undefined,
  demolishedFloorAreaBefore: undefined,
} as const;

const LIMIT_OPTIONS = (i: number): RadioCardOption<Exclude<AreaWithinLimit, "">>[] => [
  { value: "within", label: "토지 전체가 호별 면적한도 이내입니다", testId: `nbl-other-state-event-${i}-limit-within` },
  { value: "exceeded", label: "일부가 면적한도를 초과합니다", testId: `nbl-other-state-event-${i}-limit-exceeded` },
  { value: "unknown", label: "모름", testId: `nbl-other-state-event-${i}-limit-unknown` },
];

interface Props {
  index: number;
  idKey: string;
  /** 구분 변경 행인가(아니면 신축 행). 라벨·`""`의 뜻이 갈린다. */
  taxChange: boolean;
  /** 저장값 그대로의 행(표시 fallback은 이 컴포넌트가 정한다). */
  event: NblOtherStateEventInput;
  /** ④ 전송형 행 — 근거·면적한도 중 «실제로 보내지는 값»(선택지에 없는 stale 값은 비워져 있다). 접힘·고지 판정은 이 행으로 한다. */
  wire: NblOtherStateEventInput;
  patchEvent: (patch: Partial<NblOtherStateEventInput>) => void;
  /**
   * 이 행이 **철거 행 뒤 나대지 구간을 닫는가**(엔진 `eventOffersDemolished`) — 근거 선택지에 «철거ㆍ멸실»을 여는 술어. 호출자가 엔진 술어로 정한다(자체 판정 금지).
   * 철거 행 앞 구간(취득 전 철거로 첫 구간이 나대지)은 철거일 출처가 없어 거짓 — 9호 유예기간 안내가 남는다(UQ-9).
   */
  offersDemolished: boolean;
  /** 근거 «철거ㆍ멸실»의 사실 칸 뷰(`demolishedRowViewOf`) — 근거가 «철거ㆍ멸실»이고 **엔진이 이력을 읽을 때만** 호출자가 넘긴다(UQ-8 (가) — 읽지 않으면 4칸 모두 그리지 않는다). */
  demolishedView?: DemolishedRowView;
  /** 이 행이 닫은 구간의 미리보기 행(표시 전용 — 인정 창·접힘 사유는 엔진 구간 해석을 읽는다). */
  closedRow?: StateHistoryPreviewRow;
}

export function OtherLandBareIntervalFields({ index: i, idKey, taxChange, event: ev, wire, patchEvent, offersDemolished, demolishedView, closedRow }: Props) {
  const before = wire.propertyTaxTypeBefore;
  const basisOptions = before ? eventBasisOptions(before, offersDemolished) : [];
  const decl = resolveBareDeclaration({
    kind: taxChange ? "tax_type_changed" : "building_built",
    propertyTaxTypeBefore: before,
    propertyTaxBasisBefore: wire.propertyTaxBasisBefore,
    areaWithinLimitBefore: wire.areaWithinLimitBefore,
  });
  const showLimit = wire.propertyTaxBasisBefore === "vacant_state";
  const demolished = wire.propertyTaxBasisBefore === "demolished";
  const areaFold = decl.foldReason === "area_exceeded" || decl.foldReason === "area_unknown";

  return (
    <div className="space-y-3" data-testid={`nbl-other-state-event-${i}-bare`}>
      <FieldCard
        label={taxChange ? "변경 직전 나대지 기간의 재산세 구분" : "신축 직전 나대지 기간의 재산세 구분"}
        hint={
          taxChange
            ? "건축물이 없던 기간 중 이 날짜 직전의 재산세 과세 구분입니다. 재산세 납세고지서(과세구분)에서 확인할 수 있습니다. 종합합산이었다면 «종합합산»을 고르고, 별도합산·분리과세·비과세였다면 선택한 뒤 아래에서 근거를 고르세요."
            : "건축물이 없던 기간(소유 시작 또는 직전 철거 이후 ~ 신축일 전날)의 재산세 납세고지서 과세구분입니다. 종합합산이었거나 모르면 그대로 두세요 — 종합합산으로 판정합니다. 별도합산·분리과세·비과세였다면 선택하고 아래에서 근거를 고르세요."
        }
      >
        <div className="space-y-2">
          <RadioCardGroup
            name={`nblOtherStatePtax-${idKey}-${i}`}
            tone="amber"
            layout="inline"
            options={ptaxOptions(i, taxChange)}
            // 표시 fallback — 구분 변경 행: 저장값 `""` = «모름»(종합합산 + 확인 필요) · 신축 행: `""` = 선언 없음 = «종합합산»(고지 없음). 저장·④ 전송·⑫·엔진이 같은 뜻으로 읽는다.
            value={ev.propertyTaxTypeBefore || (taxChange ? "unknown" : "comprehensive")}
            onChange={(v) =>
              patchEvent({
                propertyTaxTypeBefore: v === "unknown" || (!taxChange && v === "comprehensive") ? "" : v,
                // 구분이 바뀌면 근거·면적한도는 다른 구분의 값이라 리셋한다(이벤트 시점 쓰기).
                propertyTaxBasisBefore: "",
                areaWithinLimitBefore: "",
                // E3f-2 — 사실 칸 4개도 같이 리셋한다(키를 지운다 — 부모 `patchEvent`가 `undefined` 값을 키째 제거해 종전 행과 byte-identical). 근거만 바뀔 때는 지우지 않는다(숨은 값 보존).
                ...RESET_DEMOLISHED_FACTS,
              })
            }
            data-field={`nblOtherStateEvents.${i}.propertyTaxTypeBefore`}
          />
          {taxChange && !ev.propertyTaxTypeBefore && (
            <ToneCard tone="amber">
              <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-ptax-unknown-notice`}>
                {NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE}
              </p>
            </ToneCard>
          )}
        </div>
      </FieldCard>

      {basisOptions.length > 0 && before && (
        <FieldCard
          label="그 구분의 근거"
          hint={`건축물이 없던 기간에 「${PROPERTY_TAX_TYPE_LABEL[before]}」이 부과된 근거입니다. 재산세 과세내역(고지서)에서 확인해 고르세요 — 모르면 「모름」을 고르면 됩니다. ${DEMOLISHED_BASIS_HINT[offersDemolished ? "offered" : "notOffered"]}`}
        >
          <PropertyTaxBasisRadio
            name={`nblOtherStateBasis-${idKey}-${i}`}
            tone="amber"
            options={basisOptions}
            value={wire.propertyTaxBasisBefore ?? ""}
            onChange={(v) => patchEvent({ propertyTaxBasisBefore: v, areaWithinLimitBefore: "" })}
            testIdOf={(b) => `nbl-other-state-event-${i}-basis-${b}`}
            data-field={`nblOtherStateEvents.${i}.propertyTaxBasisBefore`}
          />
        </FieldCard>
      )}

      {showLimit && (
        <FieldCard
          label="공지상태 별도합산의 호별 면적한도"
          hint="공지상태 별도합산은 사업 시설별로 정해진 면적한도 이내인 부분만 인정합니다. 이 계산은 한도를 판정하지 않으므로 직접 고르세요 — 전체가 한도 이내가 아니거나 모르면 그 기간 전체를 종합합산으로 보고 확인 필요로 표시합니다."
        >
          <RadioCardGroup
            name={`nblOtherStateLimit-${idKey}-${i}`}
            tone="amber"
            layout="inline"
            options={LIMIT_OPTIONS(i)}
            value={wire.areaWithinLimitBefore ?? ""}
            onChange={(v) => patchEvent({ areaWithinLimitBefore: v })}
            data-field={`nblOtherStateEvents.${i}.areaWithinLimitBefore`}
          />
        </FieldCard>
      )}

      {/* E3f-2 — 근거 «철거ㆍ멸실»: 사실 칸 + 인정 창·접힘 미리보기. 엔진이 이력을 읽지 않으면(`demolishedView` 없음) 4칸 모두 그리지 않고 부모의 의제·부분 면적 안내가 말한다. */}
      {demolishedView && <OtherLandDemolishedFactsField index={i} idKey={idKey} event={ev} view={demolishedView} closedRow={closedRow} patchEvent={patchEvent} />}

      {/* 접힘·수용 고지 — 엔진 해석(`resolveBareDeclaration`)이 정하고 문구는 결과 경고와 같은 상수다. 근거 «철거ㆍ멸실»은 맥락(철거일·구간)이 필요해 위 블록이 구간 해석(미리보기 행)을 읽는다. */}
      {!demolished && decl.basisOutcome === "unconfirmed" && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-${areaFold ? "bare-area-notice" : "bare-unconfirmed-notice"}`}>
            {areaFold ? NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE : NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE}
          </p>
        </ToneCard>
      )}
      {!demolished && decl.basisOutcome === "accepted" && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-bare-accepted-notice`}>
            {NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE}
          </p>
        </ToneCard>
      )}
    </div>
  );
}
