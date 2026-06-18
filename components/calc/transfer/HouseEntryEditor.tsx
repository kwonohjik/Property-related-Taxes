"use client";

/**
 * HouseEntryEditor — 다른 보유 주택 상세 편집 모달 내용
 *
 * 섹션 구성:
 *   ① 기본정보 (sky)  — 지역·취득일·공시가격·아파트/오피스텔/미분양
 *   ② 상속 (amber)    — isInherited=true 조건부 → 상속개시일
 *   ③ 장기임대 (violet) — isLongTermRental=true 조건부 → 등록사업자·등록일·사업자등록일·임대기간·말소일
 *
 * 정책:
 *  - useEffect→store 미러링 금지 — onChange 직접 set
 *  - 자동 안분 fallback 금지 — 미입력=validation 단계 차단
 *  - ToggleCard/RadioCardGroup 전용 (native checkbox/radio 금지)
 *  - 날짜=DateInput, 소수=DecimalInput, 금액=CurrencyInput
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import { HouseEntrySpecialExclusionSection } from "@/components/calc/transfer/HouseEntrySpecialExclusionSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

// ============================================================
// 섹션 색상 클래스 (Tailwind 정적 매핑 — feedback_tailwind_static_tone_mapping)
// ============================================================

const SKY_SECTION = "rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2.5";
const SKY_HEADER = "text-xs font-semibold text-sky-700";
const SKY_BADGE = "flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none";

const AMBER_SECTION = "rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2.5";
const AMBER_HEADER = "text-xs font-semibold text-amber-700";
const AMBER_BADGE = "flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none";

const VIOLET_SECTION = "rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2.5";
const VIOLET_HEADER = "text-xs font-semibold text-violet-700";
const VIOLET_BADGE = "flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none";

// ============================================================
// Props
// ============================================================

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
  /** #2a 혼인합가일 입력 시 "배우자 단독 보유" chip 노출 (§167의3⑨) */
  showSpouseOwned?: boolean;
}

// ============================================================
// 섹션 ① 기본정보 (sky)
// ============================================================

function BasicInfoSection({ house, onUpdate, showSpouseOwned }: Props) {
  return (
    <div className={SKY_SECTION}>
      <div className="flex items-center gap-2">
        <span className={SKY_BADGE}>①</span>
        <p className={SKY_HEADER}>기본 정보</p>
      </div>

      {/* 지역 구분 */}
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-foreground font-medium">지역 구분</label>
        <RadioCardGroup
          name={`house-region-${house.id}`}
          layout="inline"
          tone="rose"
          value={house.region}
          onChange={(v) => onUpdate({ region: v as "capital" | "non_capital" })}
          options={[
            { value: "capital", label: "수도권" },
            { value: "non_capital", label: "지방" },
          ]}
        />
      </div>

      {/* 취득일 */}
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-foreground font-medium">취득일</label>
        <DateInput
          value={house.acquisitionDate}
          onChange={(v) => onUpdate({ acquisitionDate: v })}
        />
      </div>

      {/* 공시가격 */}
      <CurrencyInput
        label="공시가격"
        value={house.officialPrice}
        onChange={(v) => onUpdate({ officialPrice: v })}
        hint="취득 시 공동·개별주택가격 (원)"
      />

      {/* 취득가액 (소형신축·준공후미분양 특례 가액 기준) */}
      <CurrencyInput
        label="취득가액"
        placeholder="취득가액 입력"
        value={house.acquisitionPrice ?? ""}
        onChange={(v) => onUpdate({ acquisitionPrice: v })}
        hint="소형신축·준공후미분양 특례 가액 기준 (원)"
      />

      {/* 전용면적 */}
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-foreground font-medium">전용면적 (㎡)</label>
        <DecimalInput
          value={house.exclusiveArea ?? ""}
          onChange={(v) => onUpdate({ exclusiveArea: v })}
          placeholder="전용면적 ㎡"
        />
      </div>

      {/* 준공일 (가목 소형신축 3호) */}
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-foreground font-medium">준공일</label>
        <DateInput
          value={house.completionDate ?? ""}
          onChange={(v) => onUpdate({ completionDate: v })}
        />
        <p className="text-[10px] text-muted-foreground">소형신축 특례 준공일 요건 (2024.1.10~2027.12.31)</p>
      </div>

      {/* 특례 chip */}
      <div className="space-y-1">
        <label className="block text-[11px] text-muted-foreground font-medium">특례 구분</label>
        <div className="flex flex-wrap gap-2">
          <ToggleCard
            variant="chip"
            tone="sky"
            checked={house.isApartment}
            onCheckedChange={(v) => onUpdate({ isApartment: v })}
            title="아파트"
          />
          <ToggleCard
            variant="chip"
            tone="sky"
            checked={house.isOfficetel}
            onCheckedChange={(v) => onUpdate({ isOfficetel: v })}
            title="오피스텔"
          />
          <ToggleCard
            variant="chip"
            tone="sky"
            checked={house.isUnsoldHousing}
            onCheckedChange={(v) => onUpdate({ isUnsoldHousing: v })}
            title="미분양주택"
          />
          <ToggleCard
            variant="chip"
            tone="sky"
            checked={house.isUnsoldNewHouse ?? false}
            onCheckedChange={(v) => onUpdate({ isUnsoldNewHouse: v })}
            title="준공후미분양"
          />
        </div>
      </div>

      {/* #3-B1 신축·준공후미분양 특례 비차단 경고 — 특례 의도(준공후미분양 토글·준공일 입력)인데
          판정 필수필드(취득가액·전용면적) 미입력 시 침묵 미적용 안내 (소령 §167의3①12 가·나목) */}
      {(house.isUnsoldNewHouse || !!house.completionDate) &&
        (!house.acquisitionPrice || !house.exclusiveArea) && (
          <p className="rounded border border-amber-200 bg-amber-50/70 px-2 py-1 text-[11px] text-amber-700">
            신축·준공후미분양 특례 판정에는 취득가액·전용면적 입력이 필요합니다. 미입력 시 특례가 적용되지 않습니다.
          </p>
        )}

      {/* #2a 혼인합가 — 배우자 단독 보유 (혼인합가일 입력 시에만 노출) */}
      {showSpouseOwned && (
        <div className="space-y-1">
          <label className="block text-[11px] text-muted-foreground font-medium">혼인 합가</label>
          <ToggleCard
            variant="chip"
            tone="violet"
            checked={house.isSpouseOwned ?? false}
            onCheckedChange={(v) => onUpdate({ isSpouseOwned: v })}
            title="배우자 단독 보유 주택"
          />
          <p className="text-[10px] text-muted-foreground">
            혼인 전부터 배우자가 보유 — 3주택↑ 혼인 5년내 양도 시 주택 수 차감 (§167의3⑨)
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 섹션 ② 상속 (amber)
// ============================================================

function InheritanceSection({ house, onUpdate }: Props) {
  return (
    <div className={AMBER_SECTION}>
      <div className="flex items-center gap-2">
        <span className={AMBER_BADGE}>②</span>
        <p className={AMBER_HEADER}>상속 정보</p>
      </div>

      {/* 상속주택 여부 토글 */}
      <ToggleCard
        variant="card"
        tone="amber"
        checked={house.isInherited}
        onCheckedChange={(v) => {
          // 상속 OFF 시 상속개시일 초기화 (onChange 직접 set — useEffect 미러링 금지)
          onUpdate({ isInherited: v, inheritedDate: v ? house.inheritedDate : undefined });
        }}
        title="상속주택"
        description="피상속인으로부터 상속받은 주택 (소령 §167의3①7호 — 상속개시일로부터 5년 이내 주택 수 배제)"
      >
        {/* ON 시만 상속개시일 노출 */}
        <div className="space-y-1 pt-1">
          <label className="block text-[11px] text-muted-foreground font-medium">상속개시일</label>
          <DateInput
            value={house.inheritedDate ?? ""}
            onChange={(v) => onUpdate({ inheritedDate: v || undefined })}
          />
          <p className="text-[11px] text-muted-foreground/70">
            상속 후 5년 이내이면 주택 수 산정에서 자동 배제됩니다.
          </p>
        </div>
      </ToggleCard>
    </div>
  );
}

// ============================================================
// 섹션 ③ 장기임대 (violet)
// ============================================================

function LongTermRentalSection({ house, onUpdate }: Props) {
  return (
    <div className={VIOLET_SECTION}>
      <div className="flex items-center gap-2">
        <span className={VIOLET_BADGE}>③</span>
        <p className={VIOLET_HEADER}>장기임대 정보</p>
      </div>

      {/* 장기임대 여부 토글 */}
      <ToggleCard
        variant="card"
        tone="violet"
        checked={house.isLongTermRental}
        onCheckedChange={(v) => {
          // 장기임대 OFF 시 관련 필드 초기화 (onChange 직접 set)
          onUpdate({
            isLongTermRental: v,
            isRegisteredRental: v ? house.isRegisteredRental : undefined,
            rentalRegistrationDate: v ? house.rentalRegistrationDate : undefined,
            businessRegistrationDate: v ? house.businessRegistrationDate : undefined,
            rentalPeriodYears: v ? house.rentalPeriodYears : undefined,
            rentalCancelledDate: v ? house.rentalCancelledDate : undefined,
          });
        }}
        title="장기임대 등록주택"
        description="임대사업자 등록 장기임대주택 — 의무임대기간(5년↑) 충족 시 주택 수 배제 대상"
      >
        {/* ON 시 세부 입력 노출 */}
        <div className="space-y-3 pt-1">
          {/* 등록임대사업자 여부 */}
          <ToggleCard
            variant="card"
            tone="violet"
            checked={house.isRegisteredRental ?? false}
            onCheckedChange={(v) => {
              onUpdate({
                isRegisteredRental: v,
                rentalRegistrationDate: v ? house.rentalRegistrationDate : undefined,
                businessRegistrationDate: v ? house.businessRegistrationDate : undefined,
              });
            }}
            title="임대사업자 정식 등록"
            description="시·군·구청에 임대사업자 등록 완료 여부 (민간임대주택법)"
          >
            <div className="space-y-2 pt-1">
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground font-medium">임대사업자 등록일</label>
                <DateInput
                  value={house.rentalRegistrationDate ?? ""}
                  onChange={(v) => onUpdate({ rentalRegistrationDate: v || undefined })}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground font-medium">사업자 등록일</label>
                <DateInput
                  value={house.businessRegistrationDate ?? ""}
                  onChange={(v) => onUpdate({ businessRegistrationDate: v || undefined })}
                />
              </div>
            </div>
          </ToggleCard>

          {/* 임대기간(년) */}
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground font-medium">임대기간 (년)</label>
            <DecimalInput
              value={house.rentalPeriodYears ?? ""}
              onChange={(v) => onUpdate({ rentalPeriodYears: v || undefined })}
              placeholder="임대기간 입력"
            />
            <p className="text-[11px] text-muted-foreground/70">5년 이상 시 주택 수 배제 대상</p>
          </div>

          {/* 임대사업자 말소일 (optional) */}
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground font-medium">
              임대사업자 말소일{" "}
              <span className="text-muted-foreground/60 font-normal">(양도 전 말소 시 입력)</span>
            </label>
            <DateInput
              value={house.rentalCancelledDate ?? ""}
              onChange={(v) => onUpdate({ rentalCancelledDate: v || undefined })}
            />
            <p className="text-[11px] text-muted-foreground/70">
              양도일 이전 말소된 경우 임대 배제 특례가 해제될 수 있습니다.
            </p>
          </div>

          {/* 9유형(가~자목) 매트릭스 — 유형 선택 시 유형별 요건 정밀 판정 */}
          <HouseEntryRentalTypeSection house={house} onUpdate={onUpdate} />
        </div>
      </ToggleCard>
    </div>
  );
}

// ============================================================
// 메인 에디터 (3섹션 조합)
// ============================================================

export function HouseEntryEditor({ house, onUpdate, showSpouseOwned }: Props) {
  return (
    <div className="space-y-3">
      <BasicInfoSection house={house} onUpdate={onUpdate} showSpouseOwned={showSpouseOwned} />
      <InheritanceSection house={house} onUpdate={onUpdate} />
      <LongTermRentalSection house={house} onUpdate={onUpdate} />
      <HouseEntrySpecialExclusionSection house={house} onUpdate={onUpdate} />
    </div>
  );
}
