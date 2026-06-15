"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { useState } from "react";
import {
  OBJECT_TYPE_LABELS,
  BUILDING_TYPE_LABELS,
  FIRE_HAZARD_OPTIONS,
  type FormState,
  type OwnershipType,
  type CoOwnerItem,
} from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
  onReset: () => void;
  /** 공시가격 총액 (원) */
  publishedPrice: string;
  onPublishedPriceChange: (v: string) => void;
  /** 토지 단가 (원/㎡) */
  publishedPricePerSqm?: string;
  onPublishedPricePerSqmChange?: (v: string) => void;
  jibun?: string;
  referenceDate?: string;
}

/** form.objectType → StandardPriceInput propertyKind 변환 */
function toPropertyKind(objectType: string): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (objectType === "housing") return "house_apart";
  if (objectType === "land") return "land";
  return "building_non_residential";
}

export function Step0({
  form,
  onChange,
  onReset,
  publishedPrice,
  onPublishedPriceChange,
  publishedPricePerSqm,
  onPublishedPricePerSqmChange,
  jibun,
  referenceDate,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">기본 정보</h2>
        <div className="flex items-center gap-2">
          <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
          <ResetButton onReset={onReset} />
        </div>
      </div>

      {/* 물건 유형 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">물건 유형</label>
        <RadioCardGroup
          name="objectType"
          tone="violet"
          layout="inline"
          options={OBJECT_TYPE_LABELS.map(([value, label]) => ({ value, label }))}
          value={form.objectType}
          onChange={(v) => onChange({ objectType: v })}
        />
      </div>

      {/* 소재지 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          물건 소재지 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </label>
        <AddressSearch
          value={{ road: form.road, jibun: form.jibun, building: form.building, detail: "", lng: "", lat: "" } satisfies AddressValue}
          onChange={(v) => onChange({ jibun: v.jibun, road: v.road, building: v.building })}
        />
      </div>

      {/* 공시가격 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">공시가격</label>
        <p className="text-xs text-muted-foreground">
          주택: 주택공시가격 / 토지: 개별공시지가 합계 / 건축물: 기준시가
        </p>
        {form.objectType !== "building" ? (
          <StandardPriceInput
            propertyKind={toPropertyKind(form.objectType)}
            totalPrice={publishedPrice}
            onTotalPriceChange={onPublishedPriceChange}
            pricePerSqm={publishedPricePerSqm}
            onPricePerSqmChange={onPublishedPricePerSqmChange}
            jibun={jibun ?? form.jibun}
            referenceDate={referenceDate}
            label=""
            enableLookup={true}
          />
        ) : (
          <>
            <CurrencyInput
              label=""
              value={publishedPrice}
              onChange={onPublishedPriceChange}
              placeholder="금액 입력 (원)"
            />
            <p className="text-xs text-amber-700">
              ※ 건축물 기준시가는 국세청 홈택스에서 직접 확인 후 입력하세요.
            </p>
          </>
        )}
      </div>

      {/* 직전연도 공시가격 — 과세표준상한제 §110③ (주택 전용·선택) */}
      {form.objectType === "housing" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            직전연도 공시가격{" "}
            <span className="text-muted-foreground font-normal text-xs">(선택)</span>
          </label>
          <p className="text-xs text-muted-foreground">
            입력 시 과세표준 급등분에 과세표준상한(지방세법 §110③: 직전연도 과세표준 + 5%)이 적용됩니다.
            미입력 시 상한 미적용.
          </p>
          <CurrencyInput
            label=""
            value={form.priorYearPublishedPrice}
            onChange={(v) => onChange({ priorYearPublishedPrice: v })}
            placeholder="금액 입력 (원)"
          />
        </div>
      )}

      {/* 주택 건축물 부분 시가표준액 — 건물분 소방분 §146④ 단서 (주택 전용·선택) */}
      {form.objectType === "housing" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            주택 건축물 부분 시가표준액{" "}
            <span className="text-muted-foreground font-normal text-xs">(선택)</span>
          </label>
          <p className="text-xs text-muted-foreground">
            재산세 고지서·주택가격 공시의 건물분 가액. 입력 시 건물분 소방분(지역자원시설세, 지방세법 §146④ 단서)이
            산출됩니다. 미입력 시 미산출.
          </p>
          <CurrencyInput
            label=""
            value={form.housingBuildingValue}
            onChange={(v) => onChange({ housingBuildingValue: v })}
            placeholder="금액 입력 (원)"
          />
        </div>
      )}

      {/* 1세대1주택 (주택 전용) */}
      {form.objectType === "housing" && (
        <ToggleCard
          tone="violet"
          title="1세대 1주택 특례 신청"
          description="공시가격 9억 이하 시 적용"
          checked={form.isOneHousehold}
          onCheckedChange={(v) => onChange({ isOneHousehold: v })}
        />
      )}

      {/* 건축물 유형 (건축물 전용) */}
      {form.objectType === "building" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">건축물 유형</label>
          <RadioCardGroup
            name="buildingType"
            tone="sky"
            layout="inline"
            options={BUILDING_TYPE_LABELS.map(([value, label]) => ({ value, label }))}
            value={form.buildingType}
            onChange={(v) => onChange({ buildingType: v })}
          />
        </div>
      )}

      {/* 화재위험 등급 (건축물 전용) — 소방분 중과 §146③2호·2의2호 */}
      {form.objectType === "building" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">화재위험 등급 (소방분 지역자원시설세 중과)</label>
          <RadioCardGroup
            name="fireHazardClass"
            tone="rose"
            layout="stack"
            options={FIRE_HAZARD_OPTIONS}
            value={form.fireHazardClass}
            onChange={(v) => onChange({ fireHazardClass: v })}
          />
        </div>
      )}

      {/* 도시지역 여부 */}
      <ToggleCard
        tone="rose"
        title="도시지역 내 소재"
        description="도시지역분 0.14% 추가 과세"
        checked={form.isUrbanArea}
        onCheckedChange={(v) => onChange({ isUrbanArea: v })}
      />

      {/* 소유 형태 (선택) — 납세의무자 판정(지방세법 §107) */}
      <OwnershipSection form={form} onChange={onChange} />
    </div>
  );
}

// ============================================================
// 소유 형태 섹션 — 접이식 (선택 입력)
// ============================================================

const OWNERSHIP_OPTIONS: { value: OwnershipType; label: string; description: string }[] = [
  { value: "co",      label: "공유",        description: "§107①1호 — 각 공유자가 지분별 납세의무" },
  { value: "trust",   label: "신탁",        description: "§107②5호 — 위탁자가 납세의무자 (2020.12.29 개정)" },
  { value: "inherit", label: "상속 미등기", description: "§107②2호 — 주된 상속인이 납세의무자" },
];

function OwnershipSection({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}) {
  const [open, setOpen] = useState(false);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) {
      // 섹션 닫으면 납세의무자 입력 초기화 (taxpayerInfo 미전송)
      onChange({
        ownershipType: undefined,
        registeredOwner: "",
        actualOwner: "",
        settlor: "",
        coOwners: undefined,
        heirsText: "",
      });
    }
  }

  return (
    <ToggleCard
      tone="sky"
      title="소유 형태"
      description="단독 소유 외 공유·신탁·상속 미등기 시 납세의무자 판정 (지방세법 §107)"
      checked={open}
      onCheckedChange={handleOpen}
    >
      <div className="space-y-4 pt-1">
        {/* 소유 형태 선택 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-sky-700">특수 소유 형태</label>
          <RadioCardGroup
            name="ownershipType"
            tone="sky"
            layout="stack"
            options={OWNERSHIP_OPTIONS}
            value={form.ownershipType ?? ""}
            onChange={(v) => onChange({ ownershipType: v as OwnershipType })}
          />
        </div>

        {/* 공부상 소유자 — 모든 소유형태 공통 */}
        {form.ownershipType && (
          <FieldCard
            label="공부상 소유자"
            hint="등기부·과세대장 기재 소유자 성명 또는 식별자"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.registeredOwner}
              onChange={(e) => onChange({ registeredOwner: e.target.value })}
              placeholder="성명 또는 식별자"
            />
          </FieldCard>
        )}

        {/* 공유 — coOwners 배열 입력 */}
        {form.ownershipType === "co" && (
          <CoOwnerList
            coOwners={form.coOwners}
            onChange={(coOwners) => onChange({ coOwners })}
          />
        )}

        {/* 신탁 — 위탁자 입력 */}
        {form.ownershipType === "trust" && (
          <FieldCard
            label="위탁자 (신탁 설정자)"
            hint="§107②5호 — 신탁재산의 납세의무자. 성명 또는 식별자"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.settlor}
              onChange={(e) => onChange({ settlor: e.target.value })}
              placeholder="위탁자 성명 또는 식별자"
            />
          </FieldCard>
        )}

        {/* 상속 미등기 — 상속인 목록 */}
        {form.ownershipType === "inherit" && (
          <FieldCard
            label="상속인 목록"
            hint="쉼표로 구분 입력 (예: 홍길동, 홍길순). §107②2호 — 주된 상속인(지분 최대자)을 납세의무자로 설정"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.heirsText}
              onChange={(e) => onChange({ heirsText: e.target.value })}
              placeholder="홍길동, 홍길순"
            />
          </FieldCard>
        )}

        {/* 사실상 소유자 — 단독·공유 모드에서 공부와 다를 때 입력 (§107①본문) */}
        {(form.ownershipType === "co" || form.ownershipType === "inherit") && (
          <FieldCard
            label="사실상 소유자 (선택)"
            hint="공부상 소유자와 다를 때만 입력. §107①본문 — 사실상 소유자가 납세의무자 원칙"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.actualOwner}
              onChange={(e) => onChange({ actualOwner: e.target.value })}
              placeholder="사실상 소유자 성명 (공부와 동일하면 비워두세요)"
            />
          </FieldCard>
        )}
      </div>
    </ToggleCard>
  );
}

// ============================================================
// 공유자 목록 서브 컴포넌트
// ============================================================

function CoOwnerList({
  coOwners,
  onChange,
}: {
  coOwners: CoOwnerItem[] | undefined;
  onChange: (v: CoOwnerItem[] | undefined) => void;
}) {
  const list = coOwners ?? [];

  function addRow() {
    const next = [...list, { id: "", ratio: "" }];
    onChange(next);
  }

  function updateRow(idx: number, patch: Partial<CoOwnerItem>) {
    const next = list.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  }

  function removeRow(idx: number) {
    const next = list.filter((_, i) => i !== idx);
    // 빈 배열이 되면 undefined(OFF)가 아닌 [](ON빈) 유지 — 3-state 정책
    onChange(next);
  }

  // 지분 합계 표시
  const totalRatio = list.reduce((s, c) => {
    const r = parseFloat(c.ratio);
    return s + (isNaN(r) ? 0 : r);
  }, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-sky-700">
          공유자 목록 <span className="text-muted-foreground font-normal">(지분율 합계: {(totalRatio * 100).toFixed(1)}%)</span>
        </label>
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-sky-700 hover:text-sky-900 font-medium border border-sky-300 rounded px-2 py-0.5"
        >
          + 공유자 추가
        </button>
      </div>
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground">공유자를 추가하세요.</p>
      )}
      {list.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
            value={row.id}
            onChange={(e) => updateRow(idx, { id: e.target.value })}
            placeholder="공유자 성명/식별자"
            aria-label={`공유자 ${idx + 1} 식별자`}
          />
          <input
            type="text"
            className="w-24 rounded border border-input bg-background px-2 py-1.5 text-sm text-right"
            value={row.ratio}
            onChange={(e) => updateRow(idx, { ratio: e.target.value })}
            placeholder="지분율 (0~1)"
            aria-label={`공유자 ${idx + 1} 지분율`}
          />
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="text-xs text-muted-foreground hover:text-destructive"
            aria-label={`공유자 ${idx + 1} 삭제`}
          >
            ✕
          </button>
        </div>
      ))}
      {totalRatio > 1 + 1e-9 && (
        <p className="text-xs text-red-600">지분율 합계가 100%를 초과합니다.</p>
      )}
    </div>
  );
}
