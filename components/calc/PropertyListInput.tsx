"use client";

/**
 * PropertyListInput — 주택 목록 추가/삭제 컴포넌트 (T-14)
 *
 * 기능:
 * - 주택 추가/삭제 버튼
 * - 각 주택: 공시가격(CurrencyInput), 전용면적, 수도권 여부, 합산배제 유형
 * - 합산 공시가격 실시간 표시
 * - SelectOnFocusProvider 전역 적용으로 개별 onFocus 추가 불필요
 */

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { useStandardPriceLookup } from "@/lib/hooks/useStandardPriceLookup";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

// ============================================================
// 합산배제 유형 레이블
// ============================================================

const EXCLUSION_TYPE_OPTIONS: [string, string][] = [
  ["none", "합산배제 미신청"],
  ["private_purchase_rental_long", "민간매입임대 장기일반 (시행령 §3①2호)"],
  ["private_purchase_rental_short", "민간매입임대 단기 구법"],
  ["private_construction_rental", "민간건설임대 (시행령 §3①1호)"],
  ["public_support_rental", "공공지원민간임대 (시행령 §3①3호)"],
  ["public_construction_rental", "공공건설임대 (시행령 §3①4호)"],
  ["public_purchase_rental", "공공매입임대 (시행령 §3①5호)"],
  ["unsold_housing", "미분양주택 (시행령 §4①1호)"],
  ["daycare_housing", "가정어린이집용 (시행령 §4①2호)"],
  ["employee_housing", "사원용 주택 (시행령 §4①3호)"],
  ["developer_unsold", "주택건설사업자 미분양 (시행령 §4①4호)"],
  ["cultural_heritage", "문화재 (시행령 §4①5호)"],
  ["religious", "종교단체 (시행령 §4①6호)"],
  ["senior_welfare", "노인복지주택 (시행령 §4①7호)"],
];

// ============================================================
// Props
// ============================================================

interface Props {
  properties: PropertyEntry[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, data: Partial<PropertyEntry>) => void;
}

// ============================================================
// 개별 주택 카드
// ============================================================

function PropertyCard({
  index,
  property,
  canRemove,
  onRemove,
  onUpdate,
}: {
  index: number;
  property: PropertyEntry;
  canRemove: boolean;
  onRemove: () => void;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  const priceLookup = useStandardPriceLookup();

  const addressValue: AddressValue = {
    road: property.road,
    jibun: property.jibun,
    building: property.building,
    detail: "",
    lng: "",
    lat: "",
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">주택 {index + 1}</h4>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-destructive hover:underline"
          >
            삭제
          </button>
        )}
      </div>

      {/* 소재지 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          소재지 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </label>
        <AddressSearch
          value={addressValue}
          onChange={(v) =>
            onUpdate({ jibun: v.jibun, road: v.road, building: v.building })
          }
        />
      </div>

      {/* 동·호 (공동주택 공시가격 조회용) */}
      {property.jibun && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-xs">동 <span className="text-muted-foreground">(선택)</span></label>
            <input
              type="text"
              value={property.dong}
              onChange={(e) => onUpdate({ dong: e.target.value })}
              placeholder="예: 101동"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-xs">호수 <span className="text-muted-foreground">(선택)</span></label>
            <input
              type="text"
              value={property.ho}
              onChange={(e) => onUpdate({ ho: e.target.value })}
              placeholder="예: 201호"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      )}

      {/* 공시가격 */}
      <div className="space-y-1.5">
        <CurrencyInput
          label="공시가격 (과세기준일 기준)"
          value={property.assessedValue}
          onChange={(v) => onUpdate({ assessedValue: v })}
          placeholder="0"
          required
          hint="주택공시가격 (개별주택 또는 공동주택 공시가격)"
        />
        <button
          type="button"
          onClick={async () => {
            const price = await priceLookup.lookup({
              jibun: property.jibun,
              propertyType: "housing",
              dong: property.dong || undefined,
              ho: property.ho || undefined,
            });
            if (price) onUpdate({ assessedValue: String(price) });
          }}
          disabled={priceLookup.loading}
          className="text-xs text-primary underline disabled:opacity-50 hover:text-primary/80"
        >
          {priceLookup.loading ? "조회중..." : "🔎 Vworld 공시가격 자동 조회"}
        </button>
        {priceLookup.msg && (
          <p className={`text-xs ${priceLookup.msg.kind === "ok" ? "text-emerald-700" : "text-destructive"}`}>
            {priceLookup.msg.text}
          </p>
        )}
      </div>

      {/* 전용면적 + 수도권 여부 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            전용면적 (㎡)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={property.area}
            onChange={(e) => onUpdate({ area: e.target.value.replace(/[^0-9.]/g, "") })}
            placeholder="0.00"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">합산배제 요건 판정에 사용</p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">수도권 여부</label>
          <select
            value={property.location}
            onChange={(e) =>
              onUpdate({ location: e.target.value as "metro" | "non_metro" })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="metro">수도권</option>
            <option value="non_metro">비수도권</option>
          </select>
          <p className="text-xs text-muted-foreground">임대 가격 기준 차이</p>
        </div>
      </div>

      {/* 합산배제 유형 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">합산배제 신청 유형</label>
        <select
          value={property.exclusionType}
          onChange={(e) => onUpdate({ exclusionType: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {EXCLUSION_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {property.exclusionType !== "none" && (
          <p className="text-xs text-amber-600">
            ⚠ 합산배제 신청 시 다음 단계에서 요건 정보를 추가 입력해주세요.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function PropertyListInput({ properties, onAdd, onRemove, onUpdate }: Props) {
  const totalAssessedValue = properties.reduce(
    (sum, p) => sum + parseAmount(p.assessedValue),
    0,
  );

  return (
    <div className="space-y-4">
      {/* 주택 카드 목록 */}
      {properties.map((property, index) => (
        <PropertyCard
          key={property.id}
          index={index}
          property={property}
          canRemove={properties.length > 1}
          onRemove={() => onRemove(property.id)}
          onUpdate={(data) => onUpdate(property.id, data)}
        />
      ))}

      {/* 추가 버튼 */}
      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-md border border-dashed border-muted-foreground/50 px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        + 주택 추가
      </button>

      {/* 합산 공시가격 */}
      {properties.length > 1 && totalAssessedValue > 0 && (
        <div className="rounded-md bg-muted/50 border px-4 py-3 flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            전체 공시가격 합산 ({properties.length}건)
          </span>
          <span className="font-semibold">{formatKRW(totalAssessedValue)}</span>
        </div>
      )}
    </div>
  );
}
