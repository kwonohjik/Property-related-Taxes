"use client";

/**
 * 토지 자산 성격(부수토지/독립 나대지) 선택 블록
 *
 * 사례 28 landNature 명시 입력 정책:
 * - "appurtenant": 주택·건물에 딸린 토지 → §89①3가 일체과세 분기 가능
 * - "standalone":  주택·건물과 무관한 순수 토지 → 일체과세 분기 없음
 * undefined: 미선택 (일괄양도 land+housing 조합 시 validate에서 차단)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";

type LandNatureValue = "appurtenant" | "standalone";

const LAND_NATURE_OPTIONS: RadioCardOption<LandNatureValue>[] = [
  {
    value: "appurtenant",
    label: "부수토지",
  },
  {
    value: "standalone",
    label: "독립 나대지",
  },
];

interface Props {
  landNature: AssetForm["landNature"];
  onChange: (patch: Partial<AssetForm>) => void;
}

/**
 * 토지 자산 성격 선택 위젯.
 * assetKind === "land" 인 자산 카드 면적 입력 직후에 배치.
 */
export function CompanionLandNatureBlock({ landNature, onChange }: Props) {
  return (
    <div className="rounded-lg border border-violet-200/70 bg-violet-50/70 p-3 space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-violet-900">토지 성격</p>
        <p className="text-xs text-muted-foreground">
          이 토지가 주택·건물에 딸린 부수토지인지, 독립적인 나대지인지
          선택하세요. 부수토지는 주택 비과세(§89①3가) 요건 충족 시 주택과 일체
          과세합니다.
        </p>
      </div>
      <RadioCardGroup
        name="landNature"
        options={LAND_NATURE_OPTIONS}
        value={(landNature ?? "") as LandNatureValue | ""}
        onChange={(v) => onChange({ landNature: v as LandNatureValue })}
        tone="violet"
        layout="stack"
        columns={2}
      />
    </div>
  );
}
