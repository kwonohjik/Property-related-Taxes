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

import { useMemo } from "react";
import { parseAmount, formatKRW, CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { toRegistrationType } from "@/lib/calc/comprehensive-api";

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
  ["private_short_term_rental_6y_construction", "민간건설 단기민간임대 6년 (시행령 §3①10호)"],
  ["private_short_term_rental_6y_purchase", "민간매입 단기민간임대 6년 (시행령 §3①11호)"],
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

  // ⑤ 다가구주택 라이브 안분 미리보기 (useMemo — useEffect→store 미러링 금지 정책)
  const multiFamilyPreview = useMemo(() => {
    if (!property.multiFamilyEnabled || property.floorUnits.length === 0) return [];
    const totalArea = property.floorUnits.reduce((s, u) => s + parseDecimal(u.area), 0);
    const assessed = parseAmount(property.assessedValue);
    if (totalArea <= 0 || assessed <= 0) return [];
    return property.floorUnits.map((u, i) => {
      const area = parseDecimal(u.area);
      const apportioned = Math.floor((assessed * area) / totalArea);
      return { label: u.label.trim() || `구분${i + 1}`, area, apportioned };
    });
  }, [property.multiFamilyEnabled, property.floorUnits, property.assessedValue]);

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

      {/* ⑤ 지분율(%) + 재산세 감면율(%) — 공시가격 직후, 나란히 배치 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 지분율 */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-sky-700">
            지분율 (%)
          </p>
          <DecimalInput
            value={property.ownershipRatio ?? "100"}
            onChange={(v) => {
              // ⑧ validation: 0~100% 범위 제한
              const num = parseFloat(v);
              if (v !== "" && (isNaN(num) || num < 0 || num > 100)) return;
              onUpdate({ ownershipRatio: v });
            }}
          />
          <p className="text-xs text-muted-foreground">
            단독 소유면 100. 공유지분만 변경.
          </p>
        </div>

        {/* 재산세 감면율 */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-sky-700">
            재산세 감면율 (%) <span className="font-normal text-muted-foreground">선택</span>
          </p>
          <DecimalInput
            value={property.reductionRate ?? ""}
            onChange={(v) => {
              // ⑧ validation: 0~100% 범위 제한 (Zod .max(1) 동기)
              const num = parseFloat(v);
              if (v !== "" && (isNaN(num) || num < 0 || num > 100)) return;
              onUpdate({ reductionRate: v });
            }}
          />
          <p className="text-xs text-muted-foreground">
            지자체 조례에 의한 재산세 감면율. 감면 없으면 입력 불필요.
          </p>
        </div>
      </div>

      {/* ⑤ 사례6: 건물·부속토지 소유자 분리 (시가표준액 비율 안분) — 공시가격·지분율 직후 */}
      <ToggleCard
        tone="amber"
        title="건물·부속토지 소유자 분리"
        description="주택의 건물과 부속토지 소유자가 다른 경우(부속토지만 또는 건물만 소유), 공시가격을 건물·토지 시가표준액 비율로 안분합니다 (종부세법 §8④1호)"
        checked={property.appurtenantSplitEnabled}
        onCheckedChange={(v) => onUpdate({ appurtenantSplitEnabled: v })}
      >
        <div className="space-y-3">
          {/* 소유 부분 */}
          <RadioCardGroup<"land" | "building">
            name={`appurtenant-part-${property.id}`}
            tone="amber"
            layout="inline"
            value={(property.appurtenantOwnedPart as "land" | "building") || "land"}
            onChange={(v) => onUpdate({ appurtenantOwnedPart: v })}
            options={[
              { value: "land", label: "토지만 소유", testId: `appurtenant-land-${property.id}` },
              { value: "building", label: "건물만 소유", testId: `appurtenant-building-${property.id}` },
            ]}
          />
          {/* 당해연도 시가표준액 */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700">당해연도 시가표준액</p>
            <div className="grid grid-cols-2 gap-3">
              <CurrencyInput label="토지" value={property.landStdValue} onChange={(v) => onUpdate({ landStdValue: v })} hideUnit />
              <CurrencyInput label="건물" value={property.buildingStdValue} onChange={(v) => onUpdate({ buildingStdValue: v })} hideUnit />
            </div>
          </div>
          {/* 직전연도 시가표준액 (세부담상한 자동계산용) */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700">
              직전연도 시가표준액 <span className="font-normal text-muted-foreground">(세부담상한 자동계산 시)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <CurrencyInput label="토지" value={property.priorLandStdValue} onChange={(v) => onUpdate({ priorLandStdValue: v })} hideUnit />
              <CurrencyInput label="건물" value={property.priorBuildingStdValue} onChange={(v) => onUpdate({ priorBuildingStdValue: v })} hideUnit />
            </div>
          </div>
          {/* 안분비율 자동 표시 — 양 시가표준액 >0 시만 (0-division 가드) */}
          {(() => {
            const land = parseAmount(property.landStdValue);
            const bldg = parseAmount(property.buildingStdValue);
            const total = land + bldg;
            if (total <= 0) return null;
            const ownLand = (property.appurtenantOwnedPart || "land") === "land";
            const num = ownLand ? land : bldg;
            const pct = ((num / total) * 100).toFixed(2);
            return (
              <p
                className="text-xs text-amber-800 bg-amber-100/60 border border-amber-200 rounded-md px-3 py-2"
                data-testid={`appurtenant-ratio-${property.id}`}
              >
                안분비율: {pct}% ({ownLand ? "토지" : "건물"} {formatKRW(num)} / 전체 {formatKRW(total)})
              </p>
            );
          })()}
        </div>
      </ToggleCard>

      {/* ⑤ 트랙 A: 다가구주택 층별 면적안분 (violet ToggleCard) */}
      <ToggleCard
        tone="violet"
        title="다가구주택 층별(구별) 면적 입력"
        description="다가구주택의 구별(층별) 전용면적을 입력하면 통합 공시가격을 면적 비율로 안분하여 각 구의 재산세를 자동 계산합니다. 계산된 합계액이 재산세 부과세액(ⓐ)으로 사용됩니다."
        checked={property.multiFamilyEnabled ?? false}
        onCheckedChange={(v) =>
          onUpdate({
            multiFamilyEnabled: v,
            floorUnits: v ? (property.floorUnits.length > 0 ? property.floorUnits : [{ label: "", area: "" }]) : [],
          })
        }
      >
        <div className="space-y-3">
          {/* 구별 면적 행 */}
          {property.floorUnits.map((unit, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={unit.label}
                onChange={(e) => {
                  const next = property.floorUnits.map((u, i) =>
                    i === idx ? { ...u, label: e.target.value } : u,
                  );
                  onUpdate({ floorUnits: next });
                }}
                placeholder={`구분${idx + 1}`}
                className="w-24 min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                onFocus={(e) => e.target.select()}
              />
              <DecimalInput
                value={unit.area}
                placeholder="전용면적"
                onChange={(v) => {
                  const next = property.floorUnits.map((u, i) =>
                    i === idx ? { ...u, area: v } : u,
                  );
                  onUpdate({ floorUnits: next });
                }}
              />
              <span className="shrink-0 text-xs text-muted-foreground">㎡</span>
              <button
                type="button"
                onClick={() => {
                  onUpdate({ floorUnits: property.floorUnits.filter((_, i) => i !== idx) });
                }}
                className="ml-auto shrink-0 rounded p-1 text-xs text-muted-foreground hover:text-destructive"
                aria-label={`${unit.label || `구분${idx + 1}`} 삭제`}
              >
                ✕
              </button>
            </div>
          ))}
          {/* 행 추가 버튼 */}
          <button
            type="button"
            onClick={() =>
              onUpdate({
                floorUnits: [...property.floorUnits, { label: "", area: "" }],
              })
            }
            className="w-full rounded-md border border-dashed border-violet-300 bg-violet-50/40 py-1.5 text-xs text-violet-700 hover:bg-violet-100/60"
          >
            + 구별(층별) 추가
          </button>
          {/* 라이브 안분 미리보기 */}
          {multiFamilyPreview.length > 0 && (
            <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-800">
              <span className="font-semibold">안분 공시가격 미리보기: </span>
              {multiFamilyPreview.map((v, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {v.label} {formatKRW(v.apportioned)}
                </span>
              ))}
            </div>
          )}
        </div>
      </ToggleCard>

      {/* ⑤ 트랙 B: 직전연도 공시가격 (주택 세부담상한 자동계산 — §122 layer-1) */}
      <ToggleCard
        tone="sky"
        title="직전연도 공시가격 (주택 세부담상한)"
        description="전년도 주택공시가격 입력 시 105%/110%/130% 세부담상한을 자동 계산하여 재산세 부과세액(ⓐ)을 산정합니다."
        checked={property.priorAssessedTaxCapEnabled ?? false}
        onCheckedChange={(v) =>
          onUpdate({
            priorAssessedTaxCapEnabled: v,
            priorAssessedValue: v ? property.priorAssessedValue : "",
          })
        }
      >
        <div className="space-y-2">
          <CurrencyInput
            label="직전연도 주택공시가격"
            hideLabel
            value={property.priorAssessedValue}
            onChange={(v) => onUpdate({ priorAssessedValue: v })}
            hideUnit
          />
          <p className="text-xs text-muted-foreground">
            전년도 주택공시가격 — 105%/110%/130% 세부담상한 자동 산정용. 세부담상한 산식은 결과 카드에서 표시됩니다.
          </p>
        </div>
      </ToggleCard>

      {/* ⑤ 사례7·8·9: 재산세 부과세액 직접입력 (비율 안분 공제 ⓐ) */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-sky-700">
          재산세 부과세액 (직접입력){" "}
          <span className="font-normal text-muted-foreground">선택</span>
        </p>
        <CurrencyInput
          label="재산세 부과세액"
          hideLabel
          value={property.propertyTaxAmount}
          onChange={(v) => onUpdate({ propertyTaxAmount: v })}
          hideUnit
        />
        <p className="text-xs text-muted-foreground">
          재산세 고지서의 부과세액을 입력하면 비율 안분 공제(ⓐ)에 그대로 사용됩니다.
          다가구주택 구별 합산액, 세부담 상한·감면이 적용된 실부과액에 사용. 비워두면
          공시가격으로 자동 계산됩니다.
        </p>
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
          onChange={(e) => {
            const v = e.target.value;
            // 단기 2종 선택 시 rentalRegistrationType 자동 매칭 (단일 출처 toRegistrationType — UI 설계 §3)
            const isShort =
              v === "private_short_term_rental_6y_construction" ||
              v === "private_short_term_rental_6y_purchase";
            onUpdate(
              isShort
                ? { exclusionType: v, rentalRegistrationType: toRegistrationType(v) }
                : { exclusionType: v },
            );
          }}
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
