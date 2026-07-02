"use client";

/**
 * ExclusionInfoInput — 합산배제 유형별 조건부 상세 입력 컴포넌트 (T-15)
 *
 * 합산배제 유형에 따라 해당하는 입력 필드만 표시:
 * - 임대주택 (private_xxx/public_xxx): 등록일, 임대개시일, 임대료 등
 * - 미분양주택 (unsold_housing): 모집공고일, 취득일, 최초매각 여부
 * - 가정어린이집 (daycare_housing): 인가증, 실사용 여부
 * - 사원용 주택 (employee_housing): 임대료율
 * - 기타 (cultural_heritage, religious, senior_welfare, developer_unsold): 별도 정보 불필요
 *
 * 종합부동산세법 시행령 §3·§4 기반
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { LawArticleModal } from "@/components/ui/law-article-modal";

// ============================================================
// 임대 등록 유형 레이블
// ============================================================

const RENTAL_REG_TYPE_OPTIONS: [string, string][] = [
  ["private_purchase_long", "민간매입임대 장기일반"],
  ["private_purchase_short", "민간매입임대 단기 구법"],
  ["private_construction", "민간건설임대"],
  ["public_support_construction", "공공지원민간임대 건설형 (§7호, 149㎡ 이하)"],
  ["public_support_purchase", "공공지원민간임대 매입형 (§8호, 면적제한 없음)"],
  ["public_construction", "공공건설임대"],
  ["public_purchase", "공공매입임대"],
  ["existing_rental", "기존임대주택 (2005년 이전 등록, §3호)"],
  ["private_short_term_6y_construction", "민간건설 단기민간임대 (6년)"],
  ["private_short_term_6y_purchase", "민간매입 단기민간임대 (6년)"],
];

// 임대주택 합산배제 유형 집합
const RENTAL_EXCLUSION_TYPES = new Set([
  "private_construction_rental",
  "private_purchase_rental_long",
  "private_purchase_rental_short",
  "public_support_construction_rental",
  "public_support_purchase_rental",
  "public_construction_rental",
  "public_purchase_rental",
  "existing_rental",
  "private_short_term_rental_6y_construction",
  "private_short_term_rental_6y_purchase",
]);

// 기타 합산배제 (별도 상세정보 불필요)
const OTHER_AUTO_EXCLUSION_TYPES = new Set([
  "developer_unsold",
  "cultural_heritage",
  "religious",
  "senior_welfare",
]);

// ============================================================
// Props
// ============================================================

interface Props {
  index: number;
  property: PropertyEntry;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}

// ============================================================
// 임대주택 상세 입력
// ============================================================

function RentalExclusionDetail({
  property,
  onUpdate,
}: {
  property: PropertyEntry;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  // 말소일 입력은 예외 케이스이므로 기본 접힘. 이력 로드로 값이 있으면 펼침.
  const [showRevoke, setShowRevoke] = useState(
    property.registrationRevokedDate !== "",
  );

  return (
    <div className="space-y-4">
      {/* 합산배제 근거 조문 (시행령 §3 임대주택 · §4 사원용주택등) */}
      <div className="flex flex-wrap gap-1.5">
        <LawArticleModal
          legalBasis="종합부동산세법 시행령 §3"
          label="시행령 §3 합산배제 임대주택"
        />
        <LawArticleModal
          legalBasis="종합부동산세법 시행령 §4"
          label="시행령 §4 합산배제 사원용주택등"
        />
      </div>
      {/* 임대등록 유형 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          임대등록 유형 <span className="text-destructive">*</span>
        </label>
        <select
          value={property.rentalRegistrationType}
          onChange={(e) => onUpdate({ rentalRegistrationType: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {RENTAL_REG_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {property.rentalRegistrationType === "private_short_term_6y_construction" && (
          <p className="text-xs text-muted-foreground">
            단기민간임대(건설, §3①10호): 공시가격 6억원 이하 · 전용 149㎡ 이하 · 6년 이상 임대 · 임대료 5% 초과 금지 · 2호 이상
          </p>
        )}
        {property.rentalRegistrationType === "private_short_term_6y_purchase" && (
          <p className="text-xs text-muted-foreground">
            단기민간임대(매입, §3①11호): 공시가격 {property.location === "non_metro" ? "비수도권 2억원" : "수도권 4억원"} 이하 · 6년 이상 임대 · 임대료 5% 금지 · ⚠ 아파트 제외 · 조정대상지역 신규취득 제외(자동판정 안 됨 — 직접 확인)
          </p>
        )}
        {property.rentalRegistrationType === "existing_rental" && (
          <p className="text-xs text-muted-foreground">
            기존임대주택(§3①3호): 2005년 1월 5일 이전 등록 · 공시가격 6억원(수도권) / 3억원(비수도권) 이하 · 5년 이상 임대 · 전용면적 85㎡ 이하 (읍·면 지역은 100㎡ 이하)
          </p>
        )}
      </div>

      {/* 읍·면 지역 여부 — existing_rental(§3①3호) 선택 시만 표시 */}
      {property.rentalRegistrationType === "existing_rental" && (
        <ToggleCard
          tone="rose"
          title="읍·면 지역 소재"
          description="읍·면 지역은 전용면적 100㎡ 이하 / 그 외는 85㎡ 이하 적용 (시행령 §3①3호)"
          checked={property.isEupMyeonArea}
          onCheckedChange={(v) => onUpdate({ isEupMyeonArea: v })}
        />
      )}

      {/* 임대사업자 등록일 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          임대사업자 등록일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={property.rentalRegistrationDate}
          onChange={(v) => onUpdate({ rentalRegistrationDate: v })}
        />
        <p className="text-xs text-muted-foreground">
          지방자치단체 임대사업자 등록일
        </p>
      </div>

      {/* 임대개시일 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          임대개시일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={property.rentalStartDate}
          onChange={(v) => onUpdate({ rentalStartDate: v })}
        />
        <p className="text-xs text-muted-foreground">
          과세기준일(6월 1일) 이전에 임대가 개시되어야 합니다.
        </p>
      </div>

      {/* 실제 임대 경과 연수 (의무임대기간 경고용, 선택) */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">실제 임대 경과 연수 (선택)</label>
        <DecimalInput
          value={property.actualRentalYears}
          onChange={(v) => onUpdate({ actualRentalYears: v })}
          unit="년"
        />
        <p className="text-xs text-muted-foreground">
          임대 기산일부터 과세기준일까지 경과 연수. 미입력 시 의무임대기간 경고 생략.
          상속·합병 승계 임대기간은 합산하여 입력 (시행령 §3⑦).
        </p>
      </div>

      {/* 임대등록 말소 (예외 케이스 — 기본 접힘) */}
      <ToggleCard
        tone="rose"
        title="임대등록 말소"
        description="의무임대기간 중 자진·직권 말소된 경우"
        checked={showRevoke}
        onCheckedChange={(v) => {
          setShowRevoke(v);
          if (!v) onUpdate({ registrationRevokedDate: "" });
        }}
      >
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">말소일</label>
          <DateInput
            value={property.registrationRevokedDate}
            onChange={(v) => onUpdate({ registrationRevokedDate: v })}
          />
          <p className="text-xs text-muted-foreground">
            말소일이 과세기준일(6월 1일) 이전이면 합산배제가 적용되지 않습니다 (
            <LawArticleModal
              legalBasis="종합부동산세법 시행령 §3"
              label="시행령 §3①"
            />
            ).
          </p>
        </div>
      </ToggleCard>

      {/* 최초 계약 여부 */}
      <ToggleCard
        tone="violet"
        title="최초 임대차 계약"
        description="계약 갱신 아님"
        checked={property.isInitialContract}
        onCheckedChange={(v) => onUpdate({ isInitialContract: v })}
      />

      {/* 임대료 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CurrencyInput
          label="현재 임대료 (월)"
          value={property.currentRent}
          onChange={(v) => onUpdate({ currentRent: v })}
          placeholder="0"
          hint="환산 월세 기준"
        />
        {!property.isInitialContract && (
          <CurrencyInput
            label="직전 임대료 (월)"
            value={property.previousRent}
            onChange={(v) => onUpdate({ previousRent: v })}
            placeholder="0"
            hint="임대료 증가율 5% 검증용"
          />
        )}
      </div>

      {/* 임대료 증가율 경고 (갱신 계약 시) */}
      {!property.isInitialContract &&
        property.currentRent &&
        property.previousRent &&
        (() => {
          const current = parseInt(property.currentRent.replace(/,/g, "") || "0");
          const previous = parseInt(property.previousRent.replace(/,/g, "") || "0");
          if (previous > 0 && current > previous * 1.05) {
            return (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-xs text-red-700">
                  ⚠ 임대료 증가율이 5%를 초과합니다. 합산배제 요건을 충족하지 못할 수 있습니다.
                </p>
              </div>
            );
          }
          return null;
        })()}
    </div>
  );
}

// ============================================================
// 미분양주택 상세 입력
// ============================================================

function UnsoldHousingDetail({
  property,
  onUpdate,
}: {
  property: PropertyEntry;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* 최초 매각 여부 */}
      <ToggleCard
        tone="violet"
        title="최초 매각"
        description="주택건설사업자로부터 직접 취득"
        checked={property.isFirstSale}
        onCheckedChange={(v) => onUpdate({ isFirstSale: v })}
      />

      {/* 입주자 모집공고일 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">입주자 모집공고일</label>
        <DateInput
          value={property.recruitmentNoticeDate}
          onChange={(v) => onUpdate({ recruitmentNoticeDate: v })}
        />
      </div>

      {/* 취득일 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          취득일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={property.acquisitionDate}
          onChange={(v) => onUpdate({ acquisitionDate: v })}
        />
        <p className="text-xs text-muted-foreground">
          취득일로부터 5년 이내에만 합산배제 적용 (시행령 §4①1호)
        </p>
      </div>
    </div>
  );
}

// ============================================================
// 가정어린이집 상세 입력
// ============================================================

function DaycareHousingDetail({
  property,
  onUpdate,
}: {
  property: PropertyEntry;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  return (
    <div className="space-y-3">
      <ToggleCard
        tone="violet"
        title="가정어린이집 인가증 보유"
        checked={property.hasDaycarePermit}
        onCheckedChange={(v) => onUpdate({ hasDaycarePermit: v })}
      />

      <ToggleCard
        tone="violet"
        title="실제 가정어린이집으로 사용 중"
        description="과세기준일 현재"
        checked={property.isActuallyUsedAsDaycare}
        onCheckedChange={(v) => onUpdate({ isActuallyUsedAsDaycare: v })}
      />

      {(!property.hasDaycarePermit || !property.isActuallyUsedAsDaycare) && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-700">
            인가증 보유 및 실사용 두 요건 모두 충족해야 합산배제가 적용됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 사원용 주택 상세 입력
// ============================================================

function EmployeeHousingDetail({
  property,
  onUpdate,
}: {
  property: PropertyEntry;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  const feeRate = parseFloat(property.rentalFeeRate || "0");
  const isRateExceeded = feeRate > 0.5;

  return (
    <div className="space-y-4">
      <ToggleCard
        tone="violet"
        title="종업원에게 무상 또는 저가로 제공"
        checked={property.isProvidedToEmployee}
        onCheckedChange={(v) => onUpdate({ isProvidedToEmployee: v })}
      />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          임대료율 (시세 대비 %) <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={property.rentalFeeRate}
            onChange={(e) =>
              onUpdate({ rentalFeeRate: e.target.value.replace(/[^0-9.]/g, "") })
            }
            placeholder="0"
            className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            %
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          시세 대비 임대료율. 50% 이하여야 합산배제 적용 (시행령 §4①3호)
        </p>
        {isRateExceeded && (
          <p className="text-xs text-destructive">
            ⚠ 임대료율이 50%를 초과하여 합산배제 요건을 충족하지 못합니다.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function ExclusionInfoInput({ index, property, onUpdate }: Props) {
  const { exclusionType } = property;

  // 합산배제 미신청 — 이 컴포넌트 표시 안 함
  if (exclusionType === "none") return null;

  // 자동 인정 유형 (추가 정보 불필요)
  if (OTHER_AUTO_EXCLUSION_TYPES.has(exclusionType)) {
    const labels: Record<string, string> = {
      developer_unsold: "주택건설사업자 미분양주택",
      cultural_heritage: "문화재 주택",
      religious: "종교단체 소유 주택",
      senior_welfare: "노인복지주택",
    };
    return (
      <div className="rounded-lg border bg-blue-50/50 border-blue-200 p-4">
        <p className="text-sm text-blue-800">
          <span className="font-medium">주택 {index + 1}</span> — {labels[exclusionType] ?? exclusionType}
        </p>
        <p className="mt-1 text-xs text-blue-600">
          해당 유형은 별도 요건 정보 입력 없이 합산배제가 신청됩니다.
        </p>
      </div>
    );
  }

  const exclusionLabel =
    RENTAL_EXCLUSION_TYPES.has(exclusionType)
      ? "임대주택 합산배제"
      : exclusionType === "unsold_housing"
      ? "미분양주택 합산배제"
      : exclusionType === "daycare_housing"
      ? "가정어린이집 합산배제"
      : exclusionType === "employee_housing"
      ? "사원용 주택 합산배제"
      : "합산배제";

  return (
    <div className="rounded-lg border p-4 space-y-4">
      {/* 헤더 */}
      <div>
        <h4 className="text-sm font-semibold">
          주택 {index + 1} — {exclusionLabel}
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          요건 충족 여부를 자동으로 판정합니다.
        </p>
      </div>

      {/* 유형별 입력 */}
      {RENTAL_EXCLUSION_TYPES.has(exclusionType) && (
        <RentalExclusionDetail property={property} onUpdate={onUpdate} />
      )}
      {exclusionType === "unsold_housing" && (
        <UnsoldHousingDetail property={property} onUpdate={onUpdate} />
      )}
      {exclusionType === "daycare_housing" && (
        <DaycareHousingDetail property={property} onUpdate={onUpdate} />
      )}
      {exclusionType === "employee_housing" && (
        <EmployeeHousingDetail property={property} onUpdate={onUpdate} />
      )}

      {/* 신고 기간 안내 */}
      <div className="rounded-md bg-amber-50 border border-amber-100 p-3">
        <p className="text-xs text-amber-700">
          📅 합산배제 신고 기간: 매년 9월 16일 ~ 9월 30일
        </p>
      </div>
    </div>
  );
}
