"use client";

/**
 * 재산세 별도합산(비철거) — 건축물 허가·사용승인 칸 (PSA-E3 · 「지방세법 시행령」 §101① 단서 — 공장용·그 밖의 건축물 공통).
 *
 * `Step2SeparateAggregate`가 «건축물 철거 완료» 토글 바로 아래에 그린다(PSA-S2 — 모드 토글은 영향 칸 직전 · ⑧ 순서 = 토지 면적 → 허가 → 용도지역 → 바닥면적).
 * 허가 «아니오»·«모름»이면 결과가 확정이라 용도지역·바닥면적 블록(`SeparateAggregateAreaBasis`)은 그려지지 않는다(엔진 사슬 `buildingChainOf().areaInputs`).
 * 칸을 여는 술어는 어댑터 `buildingPermitNeedOf()` 하나다(= ④ 전송 = ⑧ 차단 = ⑫ 400 — 노출 ≡ 필수). 철거 토글이 켜져 있으면 이 칸은 묻지 않는다
 * (철거 경로는 `saDemolishedPermit`이 맡는다 — 호출자가 `saDemolished`로 게이트). UI는 날짜·시행본을 비교하지 않는다.
 * 선택지 `""`은 «미선택» — 기본값 없음(미선택은 ⑧이 막고, 명시 «아니오»·«모름»은 막지 않고 엔진이 종합합산 이관 + 확인 필요로 접는다).
 * `useEffect → store` 미러링 없음: 렌더 파생 + onChange뿐이다. 칸이 숨어도 저장값은 지우지 않는다(④가 보내지 않고 ⑧이 묻지 않는다).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { buildingPermitNeedOf } from "@/lib/calc/property-separate-requirements";
import { PROPERTY_SEPARATE } from "@/lib/tax-engine/legal-codes";
import type { FormState } from "./shared";

type Answer = "yes" | "no" | "unknown";

const OPTIONS: RadioCardOption<Answer>[] = [
  { value: "yes", label: "예", testId: "pt-sa-permit-yes" },
  { value: "no", label: "아니오", testId: "pt-sa-permit-no" },
  { value: "unknown", label: "모름", testId: "pt-sa-permit-unknown" },
];

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function SeparateAggregateBuildingPermit({ form, onChange }: Props) {
  if (form.saDemolished || !buildingPermitNeedOf()) return null;
  return (
    <div className="space-y-2" data-testid="pt-sa-permit">
      <FieldCard
        label="이 건축물은 건축 관계 법령상 허가·사용승인을 받은 것입니까?"
        required
        hint="허가 등을 받았거나 받을 필요가 없고 사용승인도 문제가 없으면 «예», 받아야 하는데 받지 않았으면 «아니오»입니다. 모름은 인정하지 않고 확인 필요로 표시합니다."
      >
        <RadioCardGroup
          name="saBuildingPermit"
          tone="sky"
          layout="inline"
          options={OPTIONS}
          value={form.saBuildingPermit}
          onChange={(v) => onChange({ saBuildingPermit: v })}
          data-field="buildingPermit"
        />
      </FieldCard>
      <CollapsibleHintCard tone="sky" summary="«예»·«아니오»의 뜻과 이 계산기의 처리">
        <ul className="list-disc space-y-1 pl-4 leading-snug">
          <li>
            «예» — 건축 관계 법령에 따라 허가 등을 받았거나 받을 필요가 없고, 사용승인(임시사용승인 포함)도 받았거나 받을 필요가 없거나 아직 사용 중이 아닌 경우입니다.
          </li>
          <li>
            «아니오» — 허가 등을 받아야 하는데 받지 않았거나(사용 여부와 무관), 사용승인을 받아야 하는데 받지 않고 사용 중인 경우입니다. 이 건축물의 부속토지는{" "}
            {PROPERTY_SEPARATE.BUILDING_PERMIT_101}에 따라 별도합산에서 제외되어 종합합산으로 계산합니다.
          </li>
          <li>건축물대장·허가대장으로 확인하세요.</li>
        </ul>
      </CollapsibleHintCard>
    </div>
  );
}
