"use client";

/**
 * 개별건물 특성 조정률 모달 (상증 전용, 7구분). shadcn Dialog. 실시간 조정률 미리보기.
 * 조정률 = 각 구분 (지수/100) 곱(적용요령 2). 미선택 = 1.0. 엔진 calcSpecialAdjustmentRate 단일 진실.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { calcSpecialAdjustmentRate } from "@/lib/tax-engine/building-standard-price-helpers";
import type { SpecialAdjustmentFeatures } from "@/lib/tax-engine/types/building-standard-price.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 평가시점 구조지수(I 지붕재료 적용 판정용, <100) */
  structureIndex: number;
  /** 연면적(II 연면적 구간) */
  floorArea: number;
  isResidential: boolean;
  isApartment: boolean;
  initial: SpecialAdjustmentFeatures | null;
  onApply: (features: SpecialAdjustmentFeatures) => void;
}

type LabeledSelect = { value: string; label: string };

const HOUSE_OPTS: LabeledSelect[] = [
  { value: "", label: "해당없음" },
  { value: "16", label: "단독 264~331㎡ (120)" },
  { value: "17", label: "단독 331㎡↑ (140)" },
  { value: "18", label: "공동 149~215㎡ (120)" },
  { value: "19", label: "공동 215㎡↑ (140)" },
];
const COMMERCIAL_OPTS: LabeledSelect[] = [
  { value: "", label: "해당없음" },
  { value: "20", label: "상가 1층 (120)" },
  { value: "21", label: "상가 2층 (105)" },
  { value: "22", label: "5층이하 건물 지하1층 (80)" },
  { value: "23", label: "5층이하 건물 지하2층↓ (70)" },
];
const ANCILLARY_OPTS: LabeledSelect[] = [
  { value: "", label: "해당없음" },
  { value: "24", label: "주차장·기계실·옥탑 등 (60)" },
  { value: "25", label: "주택 간이부속(창고 등) (50)" },
];
const SAFETY_OPTS: LabeledSelect[] = [
  { value: "", label: "해당없음" },
  { value: "31", label: "B급 보조부재 경미결함 (90)" },
  { value: "32", label: "C급 보조부재 손상 (80)" },
  { value: "33", label: "D급 주요부재 손상 (60)" },
  { value: "34", label: "E급 주요부재 심각결함 (30)" },
  { value: "35", label: "철거대상·사용 (30)" },
  { value: "36", label: "철거대상·미사용 (0)" },
];

function LabeledSelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: LabeledSelect[];
  placeholder: string;
}) {
  const sel = options.find((o) => o.value === value);
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : (v ?? ""))}>
      <SelectTrigger className="h-9 w-full">
        <span className={sel && sel.value ? "" : "text-muted-foreground"}>{sel ? sel.label : placeholder}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || "none"} value={o.value || "none"}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AdjustmentRateModal({
  open,
  onOpenChange,
  structureIndex,
  floorArea,
  isResidential,
  isApartment,
  initial,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<SpecialAdjustmentFeatures>(initial ?? {});

  // 모달 열릴 때 initial 동기화(닫혀 있던 사이 변경 반영) — open 토글마다 reset
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setDraft(initial ?? {});
  }

  const roofActive = structureIndex > 0 && structureIndex < 100;

  const set = <K extends keyof SpecialAdjustmentFeatures>(key: K, raw: string) =>
    setDraft((d) => {
      const next = { ...d };
      if (raw === "" || raw === "none") delete next[key];
      else (next[key] as number) = Number(raw);
      return next;
    });

  const previewRate = useMemo(
    () => calcSpecialAdjustmentRate(draft, structureIndex || 100, floorArea, { isResidential, isApartment }),
    [draft, structureIndex, floorArea, isResidential, isApartment],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>개별건물 특성 조정률</DialogTitle>
          <DialogDescription>
            해당 구분만 선택하세요. 여러 구분 해당 시 각 조정률을 곱합니다(미선택 구분 = 영향 없음).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <FieldCard label="I 지붕재료" hint={roofActive ? "구조지수 100 미만일 때만 적용" : "구조지수 100 이상 — 미적용"}>
            <RadioCardGroup
              name="roof"
              tone="violet"
              layout="inline"
              value={draft.roofMaterial ? String(draft.roofMaterial) : ""}
              onChange={(v) => set("roofMaterial", v)}
              options={[
                { value: "", label: "해당없음", disabled: !roofActive },
                { value: "1", label: "슬레이트·기와 등 (100)", disabled: !roofActive },
                { value: "2", label: "패널 등 (80)", disabled: !roofActive },
                { value: "3", label: "함석·초가 등 (60)", disabled: !roofActive },
              ]}
            />
          </FieldCard>

          <FieldCard label="II 최고층수" hint="지하·옥탑 제외 실제 최고층수(주거용은 아파트만 적용)">
            <DecimalInput
              value={draft.maxFloors !== undefined ? String(draft.maxFloors) : ""}
              onChange={(v) => set("maxFloors", v)}
              unit="층"
              placeholder="예: 16"
            />
          </FieldCard>

          <FieldCard label="II 지능형건축물">
            <RadioCardGroup
              name="intel"
              tone="violet"
              layout="inline"
              value={draft.intelligentBuildingGrade ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, intelligentBuildingGrade: v ? (v as "1-2" | "3-4") : undefined }))}
              options={[
                { value: "", label: "없음" },
                { value: "3-4", label: "3·4등급 (110)" },
                { value: "1-2", label: "1·2등급 (120)" },
              ]}
            />
          </FieldCard>

          <FieldCard label="III 주택유형">
            <LabeledSelectField
              value={draft.houseTypeTier ? String(draft.houseTypeTier) : ""}
              onChange={(v) => set("houseTypeTier", v)}
              options={HOUSE_OPTS}
              placeholder="해당없음"
            />
          </FieldCard>

          <FieldCard label="IV 상가층" hint="상가층·부속 동시 해당 시 60 적용">
            <LabeledSelectField
              value={draft.commercialFloor ? String(draft.commercialFloor) : ""}
              onChange={(v) => set("commercialFloor", v)}
              options={COMMERCIAL_OPTS}
              placeholder="해당없음"
            />
          </FieldCard>

          <FieldCard label="IV 부속·주차">
            <LabeledSelectField
              value={draft.ancillaryParking ? String(draft.ancillaryParking) : ""}
              onChange={(v) => set("ancillaryParking", v)}
              options={ANCILLARY_OPTS}
              placeholder="해당없음"
            />
          </FieldCard>

          <FieldCard label="V 개축(일부)" hint="전부개축은 신축연도를 재설정하세요">
            <RadioCardGroup
              name="remodel"
              tone="violet"
              layout="inline"
              value={draft.remodelCount ? String(draft.remodelCount) : ""}
              onChange={(v) => set("remodelCount", v)}
              options={[
                { value: "", label: "없음" },
                { value: "26", label: "1회 (110)" },
                { value: "27", label: "2회↑ (120)" },
              ]}
            />
          </FieldCard>

          <FieldCard label="VI 무벽건물" hint="무벽면적비율(0~1, 납세자 입증). 1/4 초과부터 적용">
            <DecimalInput
              value={draft.wallessRatio !== undefined ? String(draft.wallessRatio) : ""}
              onChange={(v) => set("wallessRatio", v)}
              placeholder="예: 0.5"
            />
          </FieldCard>

          <FieldCard label="VII 구조진단·철거" hint="입증 시. 가장 낮은 지수 적용">
            <LabeledSelectField
              value={draft.structuralSafety ? String(draft.structuralSafety) : ""}
              onChange={(v) => set("structuralSafety", v)}
              options={SAFETY_OPTS}
              placeholder="해당없음"
            />
          </FieldCard>

          <FieldCard label="VII 화재·멸실" hint="정상 사용 면적비율(0~1)">
            <DecimalInput
              value={draft.normalUseRatio !== undefined ? String(draft.normalUseRatio) : ""}
              onChange={(v) => set("normalUseRatio", v)}
              placeholder="예: 0.7"
            />
          </FieldCard>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-sm font-semibold text-violet-700">
            예상 조정률: {(previewRate * 100).toFixed(1)}%
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
            >
              적용
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
