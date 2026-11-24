"use client";

/**
 * 기타토지 사건 행의 «나대지 구간 선언» 입력 — NBL-STATE-HISTORY-E3-1b (계획서 `docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.ui.plan.md` §5).
 *
 * 나대지(건축물 없는) 구간을 닫는 사건 행 — 신축 행 · 직전 건축물이 없는 재산세 과세 구분 변경 행(leaf `eventClosesBareInterval`) — 에서
 * 그 나대지 기간의 «재산세 구분 → 근거 → (공지상태) 면적한도»를 받는다. 노출 여부는 호출자가 같은 leaf 술어로 정한다.
 *
 * 판정은 하지 않는다 — 근거 선택지(`eventBasisOptions`)·접힘 여부(`resolveBareDeclaration`)·고지 문구는 엔진 leaf·상수를 읽는다(⑤ = ④ 전송형 = ⑭ 매퍼 = 엔진).
 * 표시 fallback: 신축 행 구분 `""` = 「종합합산」이 선택된 것으로 보인다(선언 없음 · 고지 없음) · 구분 변경 행 `""` = 「모름」(종합합산 + 확인 필요).
 * 구분을 바꾸면 근거·면적한도를 함께 리셋한다 — **onChange 핸들러에서만**(`useEffect → store` 미러링 금지).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_TAIL_ONLY_NOTE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { AreaWithinLimit } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { eventBasisOptions } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { resolveBareDeclaration } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
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
  /** 양도일 현재(꼬리) 칸이 근거 «철거ㆍ멸실»을 선택지로 주는가(`tailOffersDemolishedBasis`) — 그때만 «꼬리 칸과 달리 이 구간은 아직 받지 않는다» 보충을 hint에 붙인다(E3f-2 전 임시). */
  tailOffersDemolished?: boolean;
}

export function OtherLandBareIntervalFields({ index: i, idKey, taxChange, event: ev, wire, patchEvent, tailOffersDemolished = false }: Props) {
  const before = wire.propertyTaxTypeBefore;
  const basisOptions = before ? eventBasisOptions(before) : [];
  const decl = resolveBareDeclaration({
    kind: taxChange ? "tax_type_changed" : "building_built",
    propertyTaxTypeBefore: before,
    propertyTaxBasisBefore: wire.propertyTaxBasisBefore,
    areaWithinLimitBefore: wire.areaWithinLimitBefore,
  });
  const showLimit = wire.propertyTaxBasisBefore === "vacant_state";
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
          hint={`건축물이 없던 기간에 「${PROPERTY_TAX_TYPE_LABEL[before]}」이 부과된 근거입니다. 재산세 과세내역(고지서)에서 확인해 고르세요 — 모르면 「모름」을 고르면 됩니다. 철거 후 한시 별도합산·건축 중 기간은 근거로 받지 않고 「부득이한 사유 유예기간」으로 입력합니다.${tailOffersDemolished ? ` ${NBL_STATE_HISTORY_BARE_DEMOLISHED_TAIL_ONLY_NOTE}` : ""}`}
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

      {/* 접힘·수용 고지 — 엔진 해석(`resolveBareDeclaration`)이 정하고 문구는 결과 경고와 같은 상수다. */}
      {decl.basisOutcome === "unconfirmed" && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-${areaFold ? "bare-area-notice" : "bare-unconfirmed-notice"}`}>
            {areaFold ? NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE : NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE}
          </p>
        </ToneCard>
      )}
      {decl.basisOutcome === "accepted" && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-bare-accepted-notice`}>
            {NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE}
          </p>
        </ToneCard>
      )}
    </div>
  );
}
