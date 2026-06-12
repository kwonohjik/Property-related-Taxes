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

import { parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

// §8④ 1세대1주택자 의제 특례 유형
type Section8Para4Type =
  | "none"
  | "appurtenant_land_only"
  | "temporary_two_house"
  | "inherited_house"
  | "regional_low_price";

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
  /** 법인 여부 — 법인은 §8④ 의제 비노출 (Step1 매트릭스와 동일 정책) */
  isCorporate?: boolean;
  /** 과세기준일(`${과세연도}-06-01`) — 공시가격 조회 연도 자동 매핑용 */
  referenceDate?: string;
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
  isCorporate,
  referenceDate,
  onRemove,
  onUpdate,
}: {
  index: number;
  property: PropertyEntry;
  canRemove: boolean;
  isCorporate: boolean;
  referenceDate?: string;
  onRemove: () => void;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  const addressValue: AddressValue = {
    road: property.road,
    jibun: property.jibun,
    building: property.building,
    detail: [property.dong, property.ho].filter(Boolean).join(" "),
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
          onChange={(v) => {
            // detail = "101동 1501호" 형태로 올 수 있으므로 dong/ho로 분리
            const parts = v.detail.trim().split(/\s+/);
            const dong = parts.length >= 2 ? parts[0] : (v.detail.includes("동") ? v.detail : "");
            const ho   = parts.length >= 2 ? parts.slice(1).join(" ") : (v.detail.includes("호") ? v.detail : "");
            onUpdate({ jibun: v.jibun, road: v.road, building: v.building, dong, ho });
          }}
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
        <label className="block text-sm font-medium">
          공시가격 (과세기준일 기준) <span className="text-destructive">*</span>
        </label>
        <StandardPriceInput
          propertyKind="house_apart"
          totalPrice={property.assessedValue}
          onTotalPriceChange={(v) => onUpdate({ assessedValue: v })}
          jibun={property.jibun}
          referenceDate={referenceDate}
          enableLookup={true}
          label=""
          required
        />
      </div>

      {/* 전용면적 + 토지 과세면적 + 수도권 여부 */}
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
          <label className="block text-sm font-medium">
            토지 과세면적 (㎡)
            <span className="ml-1 text-xs font-normal text-muted-foreground">선택</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={property.landArea ?? ""}
            onChange={(e) => onUpdate({ landArea: e.target.value.replace(/[^0-9.]/g, "") })}
            placeholder=""
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">과세표준 명세서 기재용 (엔진 미사용)</p>
        </div>
      </div>

      {/* 수도권 여부 */}
      <div className="grid grid-cols-2 gap-3">
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

      {/* §8④ 1세대1주택자 의제 특례 — 개인 + 합산배제 미신청 주택만 */}
      {!isCorporate && property.exclusionType === "none" && (
        <ToggleCard
          tone="violet"
          title="§8④ 1세대1주택자 의제 특례"
          description="다른 일반주택 1채와 함께 보유 시, 이 주택을 1세대1주택자 계산에 포함(기본공제 12억·세액공제)하되 산출세액은 공시가격으로 안분합니다 (신청 9.16~30, 1호 부속토지는 신청 불요)"
          checked={(property.section8para4Type ?? "none") !== "none"}
          onCheckedChange={(v) =>
            onUpdate(
              v
                ? { section8para4Type: "temporary_two_house" }
                : {
                    section8para4Type: "none",
                    newHouseAcquisitionDate: "",
                    inheritanceOpenDate: "",
                    inheritanceShareRatio: "",
                  },
            )
          }
        >
          <RadioCardGroup<Section8Para4Type>
            name={`s84-${property.id}`}
            tone="violet"
            layout="stack"
            value={(property.section8para4Type as Section8Para4Type) || "temporary_two_house"}
            onChange={(v) => onUpdate({ section8para4Type: v })}
            options={[
              {
                value: "temporary_two_house",
                label: "일시적 2주택 (§8④2호)",
                description: "1주택 양도 전 신규주택 취득 — 취득일부터 3년 이내 (령 §4의2①)",
                testId: `s84-temporary-${property.id}`,
              },
              {
                value: "inherited_house",
                label: "상속주택 (§8④3호)",
                description: "상속개시 5년 미경과 / 지분 40% 이하 / 지분 공시 6억(비수도권 3억) 이하 중 하나 (령 §4의2②)",
                testId: `s84-inherited-${property.id}`,
              },
              {
                value: "regional_low_price",
                label: "지방 저가주택 (§8④4호)",
                description: "공시가격 4억원 이하 + 수도권·광역시·특별자치시 외 소재 (령 §4의2③)",
                hint:
                  property.location === "metro"
                    ? "현재 '수도권'으로 설정되어 선택할 수 없습니다 — 비수도권 주택만 해당"
                    : undefined,
                disabled: property.location === "metro",
                testId: `s84-regional-${property.id}`,
              },
              {
                value: "appurtenant_land_only",
                label: "다른 주택의 부속토지 (§8④1호)",
                description: "건물·토지 소유자가 다른 경우 — 신청 불요(당연 적용). 세율 주택 수에는 포함됩니다",
                testId: `s84-appurtenant-${property.id}`,
              },
            ]}
          />

          {/* 2호 — 신규주택 취득일 */}
          {property.section8para4Type === "temporary_two_house" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">신규주택 취득일</label>
              <DateInput
                value={property.newHouseAcquisitionDate}
                onChange={(v) => onUpdate({ newHouseAcquisitionDate: v })}
              />
              <p className="text-xs text-muted-foreground">
                과세기준일 현재 취득일부터 3년 이내여야 합니다 (령 §4의2①)
              </p>
            </div>
          )}

          {/* 3호 — 상속개시일 + 지분율 */}
          {property.section8para4Type === "inherited_house" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">상속개시일</label>
                <DateInput
                  value={property.inheritanceOpenDate}
                  onChange={(v) => onUpdate({ inheritanceOpenDate: v })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">상속 지분율 (%)</label>
                <DecimalInput
                  value={property.inheritanceShareRatio}
                  onChange={(v) => onUpdate({ inheritanceShareRatio: v })}
                />
              </div>
            </div>
          )}
        </ToggleCard>
      )}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function PropertyListInput({ properties, isCorporate = false, referenceDate, onAdd, onRemove, onUpdate }: Props) {
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
          isCorporate={isCorporate}
          referenceDate={referenceDate}
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
