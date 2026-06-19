"use client";

/**
 * CulturalHeritageSection — §74 지정문화유산 등 징수유예 자산-수준 토글.
 *
 * ToggleCard(emerald) + 4개호 RadioCardGroup. ON 시 culturalHeritageType 설정(기본 designated),
 * OFF 시 undefined. 3·4호 선택 시 담보 면제(§74⑤) 안내.
 * 징수유예세액은 엔진(calcCulturalHeritageDeferral)이 산정 — UI 자체 계산 없음.
 *
 * 정책: onUpdate 단방향(useEffect→store 미러링 0). 설계: inheritance-cultural-heritage-tax-deferral.ui.design.md
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

type HeritageType = NonNullable<EstateItem["culturalHeritageType"]>;

const HERITAGE_OPTIONS: { value: HeritageType; label: string; description: string }[] = [
  {
    value: "heritage_data",
    label: "1호 — 문화유산자료등",
    description: "문화유산자료·국가등록문화유산·보호구역 토지",
  },
  {
    value: "museum",
    label: "2호 — 박물관자료등",
    description: "박물관·미술관에 전시·보존 중인 재산 (사립은 공익법인등만)",
  },
  {
    value: "designated",
    label: "3호 — 국가지정문화유산등",
    description: "국가·시도지정문화유산·보호구역 토지 (담보 면제 가능)",
  },
  {
    value: "natural_monument",
    label: "4호 — 천연기념물등",
    description: "자연유산법 지정 천연기념물·보호구역 토지 (담보 면제 가능)",
  },
];

export interface CulturalHeritageSectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

export function CulturalHeritageSection({ item, onUpdate }: CulturalHeritageSectionProps) {
  const type = item.culturalHeritageType;
  const isCollateralExemptible = type === "designated" || type === "natural_monument";

  return (
    <ToggleCard
      lawLinks="상증법"
      tone="emerald"
      title="지정문화유산 등 (§74 징수유예 대상)"
      description="문화재보호법·자연유산법에 지정된 재산 — 상속세 징수가 유예됩니다 (상증법 §74)."
      checked={type !== undefined}
      onCheckedChange={(v) =>
        onUpdate({ ...item, culturalHeritageType: v ? "designated" : undefined })
      }
    >
      <p className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
        §74① 해당 호 <LawArticleModal legalBasis="상증법 §74" label="§74" />
      </p>
      <RadioCardGroup<HeritageType>
        name={`cultural-heritage-${item.id}`}
        layout="stack"
        tone="emerald"
        value={type ?? ""}
        onChange={(v) => onUpdate({ ...item, culturalHeritageType: v })}
        options={HERITAGE_OPTIONS}
      />
      {isCollateralExemptible && (
        <div className="mt-2 rounded-md border border-sky-200 bg-sky-50/70 p-2 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          3·4호 재산은 담보 제공이 면제될 수 있습니다 (상증법 §74⑤). 세무서에 신청 시 확인하세요.
        </div>
      )}
    </ToggleCard>
  );
}
