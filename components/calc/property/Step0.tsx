"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { BuildingStdPriceEtaxLookupField } from "./BuildingStdPriceEtaxLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { UrbanAreaLookup } from "./UrbanAreaLookup";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { useStandardPriceLookup } from "@/lib/hooks/useStandardPriceLookup";
import { useState } from "react";
import {
  OBJECT_TYPE_LABELS,
  BUILDING_TYPE_LABELS,
  VESSEL_TYPE_LABELS,
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
  // 직전연도 공시가격 자동 조회 (주택 §110③ 과세표준상한 계산용)
  // 당해연도 "공시가격 조회" 성공 시, 같은 지번으로 직전연도(조회연도−1)를 한 번 더 조회해 자동 입력
  const priorPriceLookup = useStandardPriceLookup("housing");

  async function fillPriorYearPrice(lookedUpYear: string) {
    if (form.objectType !== "housing") return;
    const priorYear = String(parseInt(lookedUpYear, 10) - 1);
    const priorPrice = await priorPriceLookup.lookup({
      jibun: jibun ?? form.jibun,
      propertyType: "housing",
      year: priorYear,
      dong: form.dong || undefined,
      ho: form.ho || undefined,
    });
    if (priorPrice && priorPrice > 0) {
      onChange({ priorYearPublishedPrice: String(priorPrice) });
    }
  }

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
          value={{ road: form.road, jibun: form.jibun, building: form.building, detail: "", lng: "", lat: "", pnu: form.pnu } satisfies AddressValue}
          onChange={(v) => onChange({ jibun: v.jibun, road: v.road, building: v.building, dong: v.dong ?? "", ho: v.ho ?? "", pnu: v.pnu ?? "" })}
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
            dong={form.dong}
            ho={form.ho}
            referenceDate={referenceDate}
            label=""
            enableLookup={true}
            onLookupSuccess={({ year }) => fillPriorYearPrice(year)}
          />
        ) : (
          <BuildingStdPriceEtaxLookupField
            pnu={form.pnu}
            publishedPrice={publishedPrice}
            onPublishedPriceChange={onPublishedPriceChange}
          />
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
          {priorPriceLookup.loading && (
            <p className="text-xs text-muted-foreground">직전연도 공시가격 조회 중…</p>
          )}
        </div>
      )}

      {/* 주택 건축물 부분 시가표준액 — 건물분 소방분 §146④ 단서 (주택 전용·선택).
          house_split 모드에서는 소유 형태 섹션 내 "건축물 시가표준액"으로 입력받으므로 숨김.
          (동일 housingBuildingValue 필드 양방향 read/write — mirror-pattern 준수) */}
      {form.objectType === "housing" && form.ownershipType !== "house_split" && (
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

      {/* 선박 유형 (선박 전용) — 고급선박 §111①4호 가목(5%) / 일반선박 나목(0.3%) */}
      {form.objectType === "vessel" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">선박 유형</label>
          <RadioCardGroup
            name="vesselType"
            tone="violet"
            layout="inline"
            options={VESSEL_TYPE_LABELS.map(([value, label]) => ({ value, label }))}
            value={form.vesselType}
            onChange={(v) => onChange({ vesselType: v as "general" | "luxury" })}
          />
          <p className="text-xs text-muted-foreground">
            고급선박: 비업무용 자가용 선박 중 대통령령 기준 초과 (지방세법 §13⑤5호)
          </p>
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
      <div className="space-y-2">
        <ToggleCard
          tone="rose"
          title="도시지역 내 소재"
          description="도시지역분 0.14% 추가 과세 (지방세법 §112)"
          checked={form.isUrbanArea}
          onCheckedChange={(v) => onChange({ isUrbanArea: v })}
        />
        <UrbanAreaLookup
          jibun={jibun ?? form.jibun}
          onApply={() => onChange({ isUrbanArea: true })}
        />
      </div>

      {/* 소유 형태 (선택) — 납세의무자 판정(지방세법 §107) */}
      <OwnershipSection form={form} onChange={onChange} />
    </div>
  );
}

// ============================================================
// 소유 형태 섹션 — 접이식 (선택 입력)
// ============================================================

const OWNERSHIP_OPTIONS_BASE: { value: OwnershipType; label: string; description: string }[] = [
  { value: "co",          label: "공유",                  description: "§107①1호 — 각 공유자가 지분별 납세의무" },
  { value: "trust",       label: "신탁",                  description: "§107②5호 — 위탁자가 납세의무자 (2020.12.29 개정)" },
  { value: "inherit",     label: "상속 미등기",            description: "§107②2호 — 주된 상속인이 납세의무자" },
  { value: "clan",        label: "종중재산(§107②3호)",     description: "종중 재산을 미신고 — 공부상 소유자가 납세의무자" },
  { value: "installment", label: "연부 매수(§107②4호)",    description: "국가 등으로부터 연부 매수계약자가 납세의무자" },
  { value: "project",     label: "체비지·보류지(§107②6호)", description: "환지 사업의 체비지·보류지 — 사업시행자가 납세의무자" },
  { value: "import",      label: "외국인 수입 항공기·선박(§107②7호)", description: "외국으로부터 수입된 항공기·선박 — 수입자가 납세의무자" },
  { value: "bankruptcy",  label: "파산재단(§107②8호)",     description: "파산재단에 속하는 재산 — 공부상 소유자가 납세의무자" },
  { value: "unclear",     label: "소유권 불명(§107③)",     description: "소유권 귀속이 분명하지 않은 재산 — 사용자가 납세의무자" },
];

/** §107①2호 주택 건물·부속토지 분리 옵션 — housing 전용 */
const HOUSE_SPLIT_OPTION: { value: OwnershipType; label: string; description: string } = {
  value: "house_split",
  label: "주택 건물·부속토지 분리(§107①2호)",
  description: "건물 소유자와 토지 소유자가 다른 주택 — 산출세액을 시가표준액 비율로 안분",
};

function OwnershipSection({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}) {
  const [open, setOpen] = useState(false);

  // housing 여부에 따라 옵션 목록 분기
  const ownershipOptions =
    form.objectType === "housing"
      ? [...OWNERSHIP_OPTIONS_BASE, HOUSE_SPLIT_OPTION]
      : OWNERSHIP_OPTIONS_BASE;

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
        heirs: [],
        installmentBuyer: "",
        projectOperator: "",
        importer: "",
        unclearUser: "",
        buildingOwner: "",
        landOwner: "",
        landStdValue: "",
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
            options={ownershipOptions}
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

        {/* 상속 미등기 — 상속인 목록 (§107②2호 주된 상속자: 지분 최대 → 동률 시 연장자) */}
        {form.ownershipType === "inherit" && (
          <FieldCard
            label="상속인 목록"
            hint="§107②2호 — 주된 상속자는 민법상 지분 최대자(동률 시 연장자, 시행규칙 §53). 지분·생년 미입력 시 첫 상속인을 적용합니다."
          >
            <div className="space-y-2">
              {form.heirs.map((h, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <input
                    type="text"
                    className="min-w-[7rem] flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
                    value={h.name}
                    onChange={(e) => {
                      const next = [...form.heirs];
                      next[i] = { ...next[i], name: e.target.value };
                      onChange({ heirs: next });
                    }}
                    placeholder="상속인 성명"
                  />
                  <DecimalInput
                    className="w-24"
                    value={h.shareRatio}
                    onChange={(v) => {
                      const next = [...form.heirs];
                      next[i] = { ...next[i], shareRatio: v };
                      onChange({ heirs: next });
                    }}
                    placeholder="지분 0~1"
                  />
                  <DateInput
                    value={h.birthDate}
                    onChange={(v) => {
                      const next = [...form.heirs];
                      next[i] = { ...next[i], birthDate: v };
                      onChange({ heirs: next });
                    }}
                  />
                  <button
                    type="button"
                    className="rounded px-2 py-2 text-sm text-rose-600 hover:bg-rose-50"
                    onClick={() =>
                      onChange({ heirs: form.heirs.filter((_, j) => j !== i) })
                    }
                    aria-label="상속인 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded border border-dashed border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40"
                onClick={() =>
                  onChange({
                    heirs: [...form.heirs, { name: "", shareRatio: "", birthDate: "" }],
                  })
                }
              >
                + 상속인 추가
              </button>
            </div>
          </FieldCard>
        )}

        {/* 연부 매수계약자 — 식별자 입력 (§107②4호) */}
        {form.ownershipType === "installment" && (
          <FieldCard
            label="연부 매수계약자"
            hint="§107②4호 — 국가 등으로부터 연부 매수계약을 체결한 자 성명 또는 식별자"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.installmentBuyer}
              onChange={(e) => onChange({ installmentBuyer: e.target.value })}
              placeholder="납세의무자 성명 또는 식별자"
            />
          </FieldCard>
        )}

        {/* 체비지·보류지 사업시행자 — 식별자 입력 (§107②6호) */}
        {form.ownershipType === "project" && (
          <FieldCard
            label="사업시행자"
            hint="§107②6호 — 환지 방식의 도시개발사업 등의 체비지·보류지 사업시행자 성명 또는 식별자"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.projectOperator}
              onChange={(e) => onChange({ projectOperator: e.target.value })}
              placeholder="사업시행자 성명 또는 식별자"
            />
          </FieldCard>
        )}

        {/* 외국인 수입자 — 식별자 입력 (§107②7호) */}
        {form.ownershipType === "import" && (
          <FieldCard
            label="수입자"
            hint="§107②7호 — 외국으로부터 수입된 항공기 또는 선박의 수입자 성명 또는 식별자"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.importer}
              onChange={(e) => onChange({ importer: e.target.value })}
              placeholder="수입자 성명 또는 식별자"
            />
          </FieldCard>
        )}

        {/* 소유권 귀속 불명 사용자 — 식별자 입력 (§107③) */}
        {form.ownershipType === "unclear" && (
          <FieldCard
            label="사용자"
            hint="§107③ — 소유권의 귀속이 분명하지 않은 재산의 사용자 성명 또는 식별자"
          >
            <input
              type="text"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              value={form.unclearUser}
              onChange={(e) => onChange({ unclearUser: e.target.value })}
              placeholder="사용자 성명 또는 식별자"
            />
          </FieldCard>
        )}

        {/* §107①2호: 건물·부속토지 소유자 분리 입력 */}
        {form.ownershipType === "house_split" && (
          <div className="space-y-3">
            <ToneCard tone="amber" title="건물·부속토지 소유자 정보 (§107①2호)" bodyClassName="space-y-3" noDark>
              <FieldCard
                label="건물 소유자"
                hint="건물(건축물) 소유자 성명 또는 식별자"
              >
                <input
                  type="text"
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  value={form.buildingOwner}
                  onChange={(e) => onChange({ buildingOwner: e.target.value })}
                  placeholder="건물 소유자 성명 또는 식별자"
                />
              </FieldCard>
              <FieldCard
                label="부속토지 소유자"
                hint="부속토지 소유자 성명 또는 식별자"
              >
                <input
                  type="text"
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  value={form.landOwner}
                  onChange={(e) => onChange({ landOwner: e.target.value })}
                  placeholder="부속토지 소유자 성명 또는 식별자"
                />
              </FieldCard>
            </ToneCard>
            <ToneCard tone="amber" title="시가표준액 (안분 기준, §4)" bodyClassName="space-y-3" noDark>
              <FieldCard
                label="건축물 시가표준액"
                hint="§4② 기준 — 재산세 고지서·주택가격 공시의 건물분 가액 (§146④ 소방분 과세표준과 동일 필드)"
              >
                <CurrencyInput
                  label=""
                  value={form.housingBuildingValue}
                  onChange={(v) => onChange({ housingBuildingValue: v })}
                  placeholder="금액 입력 (원)"
                />
              </FieldCard>
              <FieldCard
                label="부속토지 시가표준액"
                hint="§4① 기준 — 개별공시지가 × 부속토지 면적"
              >
                <CurrencyInput
                  label=""
                  value={form.landStdValue}
                  onChange={(v) => onChange({ landStdValue: v })}
                  placeholder="금액 입력 (원)"
                />
              </FieldCard>
            </ToneCard>
          </div>
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
