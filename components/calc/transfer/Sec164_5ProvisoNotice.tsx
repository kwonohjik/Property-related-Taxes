"use client";

/**
 * Sec164_5ProvisoNotice — 소득세법 시행령 §164⑥ 단서 안내 + 준용 산정 확인 토글.
 *
 * > §164⑥ … 이 경우 해당 자산에 대하여 국세청장이 최초로 고시한 기준시가 고시당시 또는
 * > 취득당시의 **법 제99조제1항제1호나목의 가액이 없는 경우**에는 **제5항을 준용**하여 계산한 가액에 따른다.
 *
 * 취득연도 ≤2000은 건물 기준시가(나목)가 고시되기 전이라 그 가액이 없다.
 * §164⑤ 준용 산정에는 **신축연도·구조·용도**가 필요한데 `AssetForm`에 없고 건물 기준시가 모달에서만
 * 입력되므로 **엔진이 자동 산정할 수 없다** → 모달로 유도하고 사용자의 명시적 확인을 남긴다.
 *
 * 환산·상속 두 배치가 같은 문구·같은 판정을 쓰도록 공용 컴포넌트로 둔다.
 * 계획서: docs/01-plan/features/commercial-164-6-proviso-164-5-application.plan.md
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface Props {
  /** 취득일(상속은 상속개시일) — 연도 표시용 */
  acquisitionDate?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  /** 취득 시점 라벨 — 상속 배치는 "취득당시(상속개시일)" */
  timePointLabel?: string;
}

export function Sec164_5ProvisoNotice({
  acquisitionDate,
  checked,
  onCheckedChange,
  timePointLabel = "취득당시",
}: Props) {
  const year = acquisitionDate?.slice(0, 4);

  return (
    <ToneCard tone="amber" noDark>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §164 ⑥" label="§164⑥ 단서" />
        <LawArticleModal legalBasis="소득세법 시행령 §164 ⑤" label="§164⑤" />
      </div>
      <p className="text-xs text-amber-800">
        {timePointLabel}
        {year ? `(${year}년)` : ""} 건물 기준시가는 <b>국세청 고시 전이라 존재하지 않습니다</b>. §164⑥
        단서에 따라 <b>§164⑤을 준용</b>해 산정해야 합니다 — 2001년 지수표 금액에 「취득당시 건물기준시가
        산정기준율」을 적용합니다.
      </p>
      <p className="text-caption text-amber-700">
        아래 <b>[건물 기준시가 계산]</b> 버튼으로 산정하면 준용이 자동 적용됩니다(신축연도·구조·용도
        입력 필요). 모달이 지원하지 않는 구조는 직접 산정한 금액을 입력하세요.
      </p>
      <ToggleCard
        tone="amber"
        variant="chip"
        checked={checked}
        onCheckedChange={onCheckedChange}
        title="§164⑤ 준용으로 산정한 금액입니다"
        description="확인해야 계산이 진행됩니다"
      />
    </ToneCard>
  );
}
