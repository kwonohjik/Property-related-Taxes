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
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import {
  calcSpecialAdjustmentRate,
  describeSpecialAdjustment,
} from "@/lib/tax-engine/building-standard-price-helpers";
import {
  resolveGrossAreaNo,
  resolveGrossAreaRate,
  ADJUSTMENT_FEATURE_LABEL,
  pickFeatures,
  BUILDING_WIDE_FEATURE_KEYS,
  PART_FEATURE_KEYS,
} from "@/lib/tax-engine/data/building-standard-price/special-adjustment-rate";
import type { SpecialAdjustmentFeatures } from "@/lib/tax-engine/types/building-standard-price.types";

/** 표시할 조정률 구분 범위 — all(단일) / building(I·II·III) / part(IV·V·VI·VII) */
export type AdjustmentCategoryScope = "all" | "building" | "part";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 평가시점 구조지수(I 지붕재료 적용 판정용, <100) */
  structureIndex: number;
  /** 평가시점 구조키(II 최고층수 통나무조 적용 제외 판정용) */
  structureKey?: string;
  /** 연면적(II 연면적 구간) */
  floorArea: number;
  /** 주거용/아파트 초기 seed — 토글은 모달 내부에서 관리, 적용 시 onApply로 반환 */
  isResidential: boolean;
  isApartment: boolean;
  initial: SpecialAdjustmentFeatures | null;
  onApply: (features: SpecialAdjustmentFeatures, isResidential: boolean, isApartment: boolean) => void;
  /** 표시 구분 범위 — 복합구조: building(건물 전체)·part(부분). 기본 all(단일). */
  categoryScope?: AdjustmentCategoryScope;
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
  structureKey,
  floorArea,
  isResidential,
  isApartment,
  initial,
  onApply,
  categoryScope = "all",
}: Props) {
  const showBuilding = categoryScope !== "part"; // I·II·III·주거용 토글
  const showPart = categoryScope !== "building"; // IV·V·VI·VII
  const scopeKeys =
    categoryScope === "building"
      ? BUILDING_WIDE_FEATURE_KEYS
      : categoryScope === "part"
        ? PART_FEATURE_KEYS
        : null; // all = 필터 없음
  const [draft, setDraft] = useState<SpecialAdjustmentFeatures>(initial ?? {});
  // 주거용/아파트 — 섹션에서 모달 내부로 이동. 열릴 때 props로 seed.
  const [residential, setResidential] = useState(isResidential);
  const [apartment, setApartment] = useState(isApartment);

  // 모달 열릴 때 initial·seed 동기화(닫혀 있던 사이 변경 반영) — open 토글마다 reset
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDraft(initial ?? {});
      setResidential(isResidential);
      setApartment(isApartment);
    }
  }

  const roofActive = structureIndex > 0 && structureIndex < 100;

  const set = <K extends keyof SpecialAdjustmentFeatures>(key: K, raw: string) =>
    setDraft((d) => {
      const next = { ...d };
      if (raw === "" || raw === "none") delete next[key];
      else (next[key] as number) = Number(raw);
      return next;
    });

  const adjCtx = useMemo(
    () => ({ isResidential: residential, isApartment: apartment, structureKey }),
    [residential, apartment, structureKey],
  );
  // 표시 구분만 미리보기·적용에 반영(숨긴 구분 draft 잔존 오염 차단)
  const scopedDraft = useMemo(
    () => (scopeKeys ? (pickFeatures(draft, scopeKeys) ?? {}) : draft),
    [draft, scopeKeys],
  );
  const previewRate = useMemo(
    () => calcSpecialAdjustmentRate(scopedDraft, structureIndex || 100, floorArea, adjCtx),
    [scopedDraft, structureIndex, floorArea, adjCtx],
  );
  // 적용 내역(엔진 단일 출처 — UI 재구현 금지). "11. 11~15층 & 20. 상가 1층" 형식.
  const previewDesc = useMemo(
    () => describeSpecialAdjustment(scopedDraft, structureIndex || 100, floorArea, adjCtx),
    [scopedDraft, structureIndex, floorArea, adjCtx],
  );
  // II 연면적 자동 구간(비주거·면적>0일 때만 — 엔진 조건과 동일).
  const grossAreaNo = !residential && floorArea > 0 ? resolveGrossAreaNo(floorArea) : undefined;
  const grossAreaRate = grossAreaNo !== undefined ? resolveGrossAreaRate(floorArea) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full shadow-2xl ring-2 ring-violet-300 dark:ring-violet-700"
        overlayClassName="bg-black/80"
        forceOverlay
      >
        <DialogHeader>
          <DialogTitle>
            {categoryScope === "building"
              ? "건물 전체 특성 조정률"
              : categoryScope === "part"
                ? "부분 특성 조정률"
                : "개별건물 특성 조정률"}
          </DialogTitle>
          <DialogDescription>
            해당 구분만 선택하세요. 여러 구분 해당 시 각 조정률을 곱합니다(미선택 구분 = 영향 없음).
          </DialogDescription>
        </DialogHeader>

        {showBuilding && (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleCard
              checked={residential}
              onCheckedChange={(v) => {
                setResidential(v);
                if (!v) setApartment(false);
              }}
              title="주거용 건물"
              tone="violet"
              variant="chip"
              size="sm"
            />
            {residential && (
              <ToggleCard
                checked={apartment}
                onCheckedChange={setApartment}
                title="아파트"
                tone="violet"
                variant="chip"
                size="sm"
              />
            )}
          </div>
        )}

        {showBuilding && !residential && floorArea <= 0 && (
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
            연면적이 아직 입력되지 않아 II구분 연면적 구간은 예상 조정률에 반영되지 않습니다. 실제 계산은
            입력된 연면적 기준으로 적용됩니다.
          </p>
        )}

        <div className="space-y-3">
          {showBuilding && (
          <>
          <FieldCard
            label="I 지붕재료"
            hint={
              roofActive
                ? "구조지수 100 미만일 때만 적용"
                : structureIndex > 0
                  ? "구조지수 100 이상 — 미적용"
                  : "건물 구조 선택 후 적용 가능(구조지수 100 미만 전용)"
            }
          >
            <RadioCardGroup
              name="roof"
              tone="violet"
              layout="inline"
              value={draft.roofMaterial ? String(draft.roofMaterial) : ""}
              onChange={(v) => set("roofMaterial", v)}
              options={[
                { value: "", label: "해당없음", disabled: !roofActive },
                { value: "1", label: "슬래브·기와·아스팔트싱글·징크 등 (100)", disabled: !roofActive },
                { value: "2", label: "패널·유리·슬레이트 등 (80)", disabled: !roofActive },
                { value: "3", label: "함석·자연석·천막·초가 등 (60)", disabled: !roofActive },
              ]}
            />
          </FieldCard>

          <FieldCard
            label="II 최고층수"
            hint={
              structureKey === "solid_wood"
                ? "통나무조는 최고층수 미적용(원본 비고)"
                : "지하·옥탑 제외 실제 최고층수(주거용은 아파트만 적용, 통나무조 제외)"
            }
          >
            <DecimalInput
              value={draft.maxFloors !== undefined ? String(draft.maxFloors) : ""}
              onChange={(v) => set("maxFloors", v)}
              unit="층"
              placeholder="지상 최고층수"
            />
          </FieldCard>

          <FieldCard label="II 연면적" hint="연면적은 본 계산 입력값을 자동 적용(주거용 미적용)">
            <div className="rounded-md bg-violet-50/70 px-2.5 py-2 text-xs text-violet-800">
              {residential
                ? "주거용 건물 — 연면적 조정 미적용"
                : floorArea > 0 && grossAreaNo !== undefined
                  ? `${floorArea.toLocaleString("ko-KR")}㎡ → ${ADJUSTMENT_FEATURE_LABEL[grossAreaNo]} (지수 ${grossAreaRate}) 자동 적용`
                  : "연면적 미입력 — 본 단계 입력값 기준 자동 적용"}
            </div>
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
          </>
          )}

          {showPart && (
          <>
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
              placeholder="무벽면적비율"
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
              placeholder="정상 사용 면적비율"
            />
          </FieldCard>
          </>
          )}
        </div>

        <p className="rounded-md bg-violet-50/60 px-2.5 py-1.5 text-[11px] text-violet-700">
          {showBuilding && (
            <>II 구분(최고층수·연면적·지능형)은 <b>가장 높은 지수 1개</b>만 적용됩니다(중복 방지).</>
          )}
          {categoryScope === "building" && (
            <>
              <br />
              지붕은 구조지수 100 미만인 부분에만 적용됩니다(부분별 자동 판정).
            </>
          )}
          {categoryScope === "part" && (
            <>이 부분 특성은 건물 전체 특성과 곱해 최종 적용됩니다.</>
          )}
          {previewDesc && (
            <>
              <br />
              적용 내역: {previewDesc}
            </>
          )}
        </p>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-sm font-semibold text-violet-700">
            {categoryScope === "building" ? "예상 건물 전체 조정률" : categoryScope === "part" ? "예상 부분 조정률" : "예상 조정률"}:{" "}
            {(previewRate * 100).toFixed(1)}%
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onApply(scopedDraft, residential, apartment);
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
