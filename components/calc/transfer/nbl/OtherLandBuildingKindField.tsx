"use client";

/**
 * 기타토지 철거 행의 «철거된 건축물 종류» — NBL-STATE-HISTORY-E3-③ B (계획서 `docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md` §4.4).
 *
 * 주택에는 재산세 **토지** 구분(별도합산·분리과세·비과세)이 없다 — 철거된 건축물이 주택이었다면 「주택」을 고르고 철거 직전 정착면적을 입력한다(그러면 «철거 직전 재산세 구분»은 읽지 않는다).
 * 화면 «그 밖의 건축물» = 저장 `""`·키 부재(종전 철거 행과 byte-identical — 가정값 채움이 아니라 현행의 문서화된 뜻 · Q-12 (가)). 노출 여부는 호출자가 «기타토지 카드의 철거 행»으로 정한다.
 * 선택은 **onChange 핸들러에서만** 행에 쓴다(`useEffect → store` 미러링 금지). «주택» → «그 밖»으로 되돌려도 저장된 정착면적은 지우지 않는다(④가 주택 행이 아니면 보내지 않는다 — 이력 복원 보존).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

type KindChoice = "house" | "other";

const OPTIONS = (i: number): RadioCardOption<KindChoice>[] => [
  { value: "house", label: "주택", testId: `nbl-other-state-event-${i}-building-kind-house` },
  { value: "other", label: "그 밖의 건축물(상가·공장 등)", testId: `nbl-other-state-event-${i}-building-kind-other` },
];

/** 겸용주택은 이 입력이 받지 않는다(엔진 D-5 · V-17 — 겸용 부수토지 안분 범위 밖). 입력 안내만 — 판정하지 않는다. */
const MIXED_USE_NOTICE = "겸용주택(주택과 상가 등이 함께 있던 건물)을 철거했다면 「주택」으로 고르지 않습니다 — 겸용주택의 부수토지 안분은 이 입력이 지원하지 않으므로 「그 밖의 건축물」로 입력하세요.";

interface Props {
  index: number;
  idKey: string;
  event: NblOtherStateEventInput;
  /** 행 전체를 바꾼다 — 「그 밖」은 종류 키를 **지워** 종전 행과 같게 만든다. */
  onRowChange: (row: NblOtherStateEventInput) => void;
}

export function OtherLandBuildingKindField({ index, idKey, event, onRowChange }: Props) {
  // 표시 fallback: 저장 `""`·키 부재는 «그 밖의 건축물»이 선택된 것으로 보인다(저장·전송·⑧·⑫·엔진 모두 `""` = 주택 아닌 건축물).
  const value: KindChoice = event.buildingKindBefore === "house" ? "house" : "other";
  function change(v: KindChoice) {
    if (v === "house") onRowChange({ ...event, buildingKindBefore: "house" });
    else {
      const { buildingKindBefore: _drop, ...rest } = event;
      void _drop;
      onRowChange(rest);
    }
  }
  return (
    <FieldCard label="철거된 건축물 종류" hint="철거된 건축물이 주택이었는지 고르세요. 주택은 아래에서 철거 직전 정착면적을 입력합니다.">
      <div className="space-y-2">
        <RadioCardGroup
          name={`nblOtherStateBuildingKind-${idKey}-${index}`}
          tone="amber"
          layout="inline"
          options={OPTIONS(index)}
          value={value}
          onChange={change}
          data-field={`nblOtherStateEvents.${index}.buildingKindBefore`}
        />
        <ToneCard tone="amber">
          <div className="space-y-1.5 text-caption leading-snug">
            <p data-testid={`nbl-other-state-event-${index}-building-kind-hint`}>{NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE}</p>
            <p data-testid={`nbl-other-state-event-${index}-building-kind-mixed-use`}>{MIXED_USE_NOTICE}</p>
          </div>
        </ToneCard>
      </div>
    </FieldCard>
  );
}
