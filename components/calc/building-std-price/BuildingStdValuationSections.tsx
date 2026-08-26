"use client";

/**
 * 건물 기준시가 폼 — 상속·증여(1시점) 섹션. 800줄 정책에 따라 BuildingStdPriceForm에서 분리.
 *
 * 폼 상태(`f`)와 setter를 그대로 받아 **직접 read/write**한다(별도 상태 신설·useEffect 미러링 없음).
 * 양도 2시점 섹션은 본체(BuildingStdPriceForm)에 남는다.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import { LandParcelsSection } from "./LandParcelsSection";
import { CompositePartsSection } from "./CompositePartsSection";
import { SectionCard } from "./BuildingStdSectionCard";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";
import { calcSpecialAdjustmentRate } from "@/lib/tax-engine/building-standard-price-helpers";

interface Props {
  f: BuildingStdPriceFormState;
  /** 단일 키 patch — 본체의 set과 동일 함수 */
  set: <K extends keyof BuildingStdPriceFormState>(
    key: K,
    value: BuildingStdPriceFormState[K],
  ) => void;
  /** 상속·증여일 onChange — eventDate + valuationYear·구조/용도 가드를 한 배치로 반영 */
  onEventDateChange: (v: string) => void;
  isMech: boolean;
  composite: boolean;
  /** 평가연도(숫자) — 구조·용도 옵션셋 기준 */
  valYear: number | undefined;
  /** 조정률 모달용 구조지수(미선택 0) */
  valStructureIndex: number;
  /** 공시지가 조회 기준 지번 */
  jibun: string | undefined;
  /** 부속토지 면적 — 토지기준시가 표시용 */
  landArea: number | undefined;
  /** 공시지가 조회 기준일 — 일자 우선, 미입력 시 연도 6/1 fallback(§164③ 직전 고시) */
  landRefFromEvent: (eventDate: string, year: string) => string | undefined;
  /** 조정률 모달 열기 */
  onOpenAdjustment: () => void;
}

export function BuildingStdValuationSections({
  f,
  set,
  onEventDateChange,
  isMech,
  composite,
  valYear,
  valStructureIndex,
  jibun,
  landArea,
  landRefFromEvent,
  onOpenAdjustment,
}: Props) {
  return (
    <>
      <SectionCard num={2} title="평가 시점" tone="emerald">
        <RadioCardGroup
          name="inheritanceGiftKind"
          tone="violet"
          layout="inline"
          value={f.inheritanceGiftKind}
          onChange={(v) => set("inheritanceGiftKind", v as BuildingStdPriceFormState["inheritanceGiftKind"])}
          options={[
            { value: "inheritance", label: "상속세" },
            { value: "gift", label: "증여세" },
          ]}
        />
        <FieldCard
          label="상속·증여일"
          hint="상속개시일·증여일 — 평가연도가 자동 산정됩니다. 일자 입력 후 구조·용도·공시지가 조회가 활성화됩니다."
        >
          <DateInput value={f.eventDate} onChange={onEventDateChange} />
        </FieldCard>
        {!isMech && (
          <>
            {/* 복합구조 토글 — 층·구역별 구조·용도 상이 */}
            <ToggleCard
              checked={f.compositeMode}
              onCheckedChange={(v) => set("compositeMode", v)}
              title="복합구조 (층·구역별 구조·용도 상이)"
              tone="violet"
              variant="card"
            >
              <CompositePartsSection
                year={valYear}
                parts={f.compositeParts}
                onPartsChange={(parts) => set("compositeParts", parts)}
                ancillaryAreas={f.ancillaryAreas}
                onAncillaryChange={(a) => set("ancillaryAreas", a)}
                ancillaryFloors={f.ancillaryFloors}
                onAncillaryFloorsChange={(fl) => set("ancillaryFloors", fl)}
                buildingFeatures={f.adjustmentFeatures}
                onBuildingFeaturesChange={(features) => set("adjustmentFeatures", features)}
                isResidentialUse={f.isResidentialUse}
                isApartmentUse={f.isApartmentUse}
                onResidentialChange={(v) => set("isResidentialUse", v)}
                onApartmentChange={(v) => set("isApartmentUse", v)}
              />
            </ToggleCard>

            {!composite && (
              <>
                <FieldCard label="건물 구조">
                  <BuildingStructureSelect
                    year={valYear}
                    value={f.valStructureKey}
                    onChange={(v) => set("valStructureKey", v)}
                  />
                </FieldCard>
                <FieldCard label="건물 용도">
                  <BuildingUsageSelect
                    year={valYear}
                    value={f.valUsageNo}
                    onChange={(v) => set("valUsageNo", v)}
                  />
                </FieldCard>
              </>
            )}

            {/* 다필지 토글 — 위치지수 면적가중평균 */}
            <ToggleCard
              checked={f.landParcelMode}
              onCheckedChange={(v) => set("landParcelMode", v)}
              title="다필지 부속토지 (위치지수 가중평균)"
              tone="sky"
              variant="card"
              description="부속토지가 여러 필지면 각 필지 면적 × ㎡당 공시지가의 가중평균으로 위치지수를 산정합니다(고시 §6⑥). 활성화 시 아래 단일 공시지가 대신 필지별로 입력합니다."
            >
              <LandParcelsSection
                parcels={f.landParcels}
                onChange={(parcels) => set("landParcels", parcels)}
                jibun={jibun}
                referenceDate={landRefFromEvent(f.eventDate, f.valuationYear)}
              />
            </ToggleCard>

            {!f.landParcelMode && (
              <LandPriceLookupField
                pricePerSqm={f.valLandPrice}
                onPricePerSqmChange={(v) => set("valLandPrice", v)}
                area={landArea}
                jibun={jibun}
                referenceDate={landRefFromEvent(f.eventDate, f.valuationYear)}
                label="㎡당 개별공시지가"
                hint="2001~2002년 평가는 해당연도 1.1 기준"
              />
            )}
          </>
        )}
      </SectionCard>

      {!isMech && !composite && (
        <SectionCard num={3} title="조정률" tone="violet">
          <RadioCardGroup
            name="adjustmentMode"
            tone="violet"
            layout="inline"
            value={f.adjustmentMode}
            onChange={(v) => {
              const mode = v as BuildingStdPriceFormState["adjustmentMode"];
              set("adjustmentMode", mode);
              // "건물 특성으로 계산" 선택 시 모달 자동 오픈(사용자 클릭 시에만 — useEffect 미사용)
              if (mode === "features") onOpenAdjustment();
            }}
            options={[
              { value: "features", label: "건물 특성으로 계산" },
              { value: "manual", label: "직접 입력(%)" },
            ]}
          />
          {f.adjustmentMode === "features" ? (
            f.adjustmentFeatures && Object.keys(f.adjustmentFeatures).length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                  특성 {Object.keys(f.adjustmentFeatures).length}개 적용 · 조정률{" "}
                  {(
                    calcSpecialAdjustmentRate(
                      f.adjustmentFeatures,
                      valStructureIndex || 100,
                      parseFloat(f.floorArea.replace(/,/g, "")) || 0,
                      {
                        isResidential: f.isResidentialUse,
                        isApartment: f.isApartmentUse,
                        // II 최고층수의 통나무조 제외 판정에 필요하다 — 종전에는 칩만 빠뜨려
                        // 같은 화면에서 칩 130% vs 엔진 90% 로 40%p 어긋났다(F-35).
                        structureKey: f.valStructureKey,
                      },
                    ) * 100
                  ).toFixed(1)}
                  %
                </span>
                <button
                  type="button"
                  onClick={() => onOpenAdjustment()}
                  className="text-xs font-medium text-green-700 underline underline-offset-2 hover:text-green-900"
                >
                  다시 계산
                </button>
              </div>
            ) : (
              <Button variant="modalLauncher" size="sm" onClick={() => onOpenAdjustment()}>
                건물 특성으로 계산 열기
              </Button>
            )
          ) : (
            <FieldCard label="조정률" hint="100 = 1.0(미적용)">
              <DecimalInput value={f.manualAdjustmentRate} onChange={(v) => set("manualAdjustmentRate", v)} unit="%" placeholder="100" />
            </FieldCard>
          )}
        </SectionCard>
      )}
    </>
  );
}
