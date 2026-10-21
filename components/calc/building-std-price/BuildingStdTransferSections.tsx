"use client";

/**
 * 건물 기준시가 폼 — 양도(2시점) 섹션. 800줄 정책에 따라 BuildingStdPriceForm에서 분리(상증은 BuildingStdValuationSections).
 *
 * 폼 상태(`f`)와 setter, 본체가 계산한 파생 값을 그대로 받아 **직접 read/write**한다(별도 상태 신설·useEffect 미러링 없음).
 * 파생 값의 정의·근거 주석은 본체에 있다 — 여기서 다시 계산하지 않는다.
 */
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import { CompositePartsSection } from "./CompositePartsSection";
import { ApartmentConversionSection } from "./ApartmentConversionSection";
import { SectionCard } from "./BuildingStdSectionCard";
import { type BuildingStdPriceFormState, transferYearVisible } from "@/lib/calc/building-std-price-form";
import { usesPriorStdPriceSubstitute } from "@/lib/tax-engine/same-adjustment-period-std-price";

function YearSelect({
  years,
  value,
  onChange,
  placeholder = "연도 선택",
}: {
  years: number[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="h-9 w-full">
        <span className={value ? "" : "text-muted-foreground"}>{value ? `${value}년` : placeholder}</span>
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}년
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface Props {
  f: BuildingStdPriceFormState;
  /** 단일 키 patch — 본체의 set과 동일 함수 */
  set: <K extends keyof BuildingStdPriceFormState>(key: K, value: BuildingStdPriceFormState[K]) => void;
  /** 연도 변경 + 구조/용도 무효화 가드(본체 `changeYearWithGuard`) */
  changeYearWithGuard: (
    yearKey: "acquisitionYear" | "transferYear",
    structKey: keyof BuildingStdPriceFormState,
    usageKey: keyof BuildingStdPriceFormState,
    newYear: string,
    indexYearOverride?: number,
  ) => void;
  yearOpts: number[];
  acqYearOpts: number[];
  acqIndexYear: number | undefined;
  acqUsageYear: number | undefined;
  acqYearIsPre2001: boolean;
  isMech: boolean;
  apartmentConv: boolean;
  composite: boolean;
  phd: boolean;
  singleActive: boolean;
  transferOnly: boolean;
  sameYear: boolean;
  crossYearWindow: boolean;
  sec1648Active: boolean;
  /** 둘째 시점 라벨 접두어 */
  t2: string;
  transferSectionLabel?: string;
  hideApartmentConversion?: boolean;
  jibun: string | undefined;
  landArea: number | undefined;
  landRefDate: (year: string) => string | undefined;
  landRefFromEvent: (eventDate: string, year: string) => string | undefined;
}

export function BuildingStdTransferSections({
  f,
  set,
  acqIndexYear,
  acqUsageYear,
  acqYearIsPre2001,
  acqYearOpts,
  apartmentConv,
  changeYearWithGuard,
  composite,
  crossYearWindow,
  hideApartmentConversion,
  isMech,
  jibun,
  landArea,
  landRefDate,
  landRefFromEvent,
  phd,
  sameYear,
  sec1648Active,
  singleActive,
  t2,
  transferOnly,
  transferSectionLabel,
  yearOpts,
}: Props) {
  return (
    <>
      <SectionCard num={2} title="취득 시점" tone="amber" testId="bsp-section-acq">
        {/* 양도 전용 모드 — 취득 시점은 양도당시 기준시가 산정에 쓰이지 않는다.
            다만 §164⑧(취득연도 == 양도연도) 판정에 취득연도가 필요해 연도 칸만 남긴다. */}
        {transferOnly && (
          <p
            className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200 dark:bg-amber-900/40"
            data-testid="bsp-transfer-only-note"
          >
            양도당시 기준시가는 양도 시점 정보만으로 산정됩니다. 취득연도가 양도연도와 같은 경우에만
            취득당시 기준시가를 환산해 쓰므로(소득령 §164⑧), 아래 취득연도만 확인합니다.
          </p>
        )}
        <div className={transferOnly ? "" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
          <FieldCard label="취득연도" stacked={!transferOnly}>
            <YearSelect
              years={acqYearOpts}
              value={f.acquisitionYear}
              onChange={(v) =>
                changeYearWithGuard("acquisitionYear", "acqStructureKey", "acqUsageNo", v, parseInt(v, 10) <= 2000 ? 2001 : undefined)
              }
            />
          </FieldCard>
          {!transferOnly && (
            <FieldCard label="취득일" hint="계산서 일자 표기용(선택)" stacked>
              <DateInput value={f.acquisitionEventDate} onChange={(v) => set("acquisitionEventDate", v)} />
            </FieldCard>
          )}
        </div>
        {!transferOnly && acqYearIsPre2001 && !apartmentConv && (
          <p className="rounded-md bg-violet-50 dark:bg-violet-950/30 px-2.5 py-1.5 text-xs text-violet-700 dark:text-violet-300">
            2000년 이전 취득 — 2001.1.1 ㎡당 금액 × 산정기준율로 환산됩니다. 구조·용도는 2001년 지수표 기준입니다.
          </p>
        )}
        {!transferOnly && !isMech && !apartmentConv && !composite && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FieldCard label="취득당시 구조" stacked>
              <BuildingStructureSelect year={acqIndexYear} value={f.acqStructureKey} onChange={(v) => set("acqStructureKey", v)} />
            </FieldCard>
            <FieldCard label="취득당시 용도" stacked>
              <BuildingUsageSelect year={acqIndexYear} value={f.acqUsageNo} onChange={(v) => set("acqUsageNo", v)} />
            </FieldCard>
          </div>
        )}
        {!transferOnly && !isMech && !apartmentConv &&
          (acqIndexYear === 2001 ? (
            // 2000.12.31 이전 취득 — 위치지수는 2001.1.1 현재 공시지가 기준(고시 §6①·소령 §164⑤).
            // 취득연도 공시지가가 아닌 2001.1.1 값으로 고정. 토지기준시가 표시는 숨김(이 값은
            // 위치지수 산정용일 뿐 취득 토지가액 아님 — 배치 모달과 동일 동작).
            <LandPriceLookupField
              pricePerSqm={f.acqLandPrice}
              onPricePerSqmChange={(v) => set("acqLandPrice", v)}
              jibun={jibun}
              fixedYear={2001}
              hideLandStdPrice
              label="취득당시 위치지수용 ㎡당 개별공시지가 (2001.1.1 기준)"
              placeholder="2001.1.1. 현재 공시지가"
              hint="소령 §164⑤ · 고시 §6① — 2001.1.1 현재 개별공시지가로 위치지수 산정"
            />
          ) : (
            <LandPriceLookupField
              pricePerSqm={f.acqLandPrice}
              onPricePerSqmChange={(v) => set("acqLandPrice", v)}
              area={landArea}
              jibun={jibun}
              referenceDate={landRefFromEvent(f.acquisitionEventDate, f.acquisitionYear)}
              label="취득당시 ㎡당 개별공시지가"
              hint="여러 필지면 면적 가중평균한 ㎡당 가액"
            />
          ))}
        {/* 계산서 ※표 (4) 전용 — 위 2001.1.1 값은 **위치지수 산정용**이라 취득당시 토지가액이
            아니다(작성요령 ※4 「토지가액은 취득당시 토지가액을 계산하여 기재합니다」).
            계산사례 마. 실측: ※(4) 130㎡ × 1,800,000(1999.6.30) ↔ Ⅵ⑤ 130㎡ × 2,240,000(2001).
            표시 전용이라 미입력이어도 계산은 진행되고 ※(4)(5)만 「—」로 남는다. */}
        {!transferOnly && !isMech && !apartmentConv && acqIndexYear === 2001 && (
          <LandPriceLookupField
            pricePerSqm={f.acqAtTimeLandPrice}
            onPricePerSqmChange={(v) => set("acqAtTimeLandPrice", v)}
            area={landArea}
            jibun={jibun}
            referenceDate={landRefFromEvent(f.acquisitionEventDate, f.acquisitionYear)}
            label="취득당시 ㎡당 개별공시지가 (계산서 ※표 토지가액용)"
            hint="취득일 직전 고시분 — 계산서 ※(4) 토지가액·(5) 합계에만 쓰인다(선택)"
          />
        )}
      </SectionCard>

      {/* 양도 복합구조 토글 — 층·구역별 구조·용도 상이(취득/양도 2시점 부분별).
          PHD 2시점·단일 시점 모드는 엔진이 2시점 경로로 되돌리므로 숨김. */}
      {!isMech && !apartmentConv && !phd && !singleActive && (
        <ToggleCard
          checked={f.compositeMode}
          onCheckedChange={(v) => set("compositeMode", v)}
          title="복합구조 (층·구역별 구조·용도 상이)"
          tone="violet"
          variant="card"
        >
          <CompositePartsSection
            year={f.transferYear ? parseInt(f.transferYear, 10) : undefined}
            acqYear={acqUsageYear}
            forTransfer
            parts={f.compositeParts}
            onPartsChange={(parts) => set("compositeParts", parts)}
            ancillaryAreas={f.ancillaryAreas}
            onAncillaryChange={(a) => set("ancillaryAreas", a)}
            ancillaryFloors={f.ancillaryFloors}
            onAncillaryFloorsChange={(fl) => set("ancillaryFloors", fl)}
          />
        </ToggleCard>
      )}

      {/* 공동주택 고시 전 취득 환산 토글 — 일반 2시점 흐름 대체. PHD·단일 시점 맥락 미사용 → 숨김 */}
      {!isMech && !composite && !phd && !singleActive && !hideApartmentConversion && (
        <ToggleCard
          checked={f.apartmentConversionMode}
          onCheckedChange={(v) => set("apartmentConversionMode", v)}
          title="공동주택 고시 전 취득 (취득당시 기준시가 환산)"
          tone="violet"
          variant="card"
          description="공동주택기준시가 최초고시 전에 취득한 경우, 최초고시 기준시가를 토지·건물 비율로 취득당시 가액으로 환산합니다(소령 §164). 활성화 시 위 취득연도와 아래 환산 정보로 계산하며 일반 양도시점 입력은 사용하지 않습니다."
        >
          <ApartmentConversionSection
            value={f.apartmentConversion}
            onChange={(patch) => set("apartmentConversion", { ...f.apartmentConversion, ...patch })}
            jibun={jibun}
            acquisitionYear={f.acquisitionYear}
          />
        </ToggleCard>
      )}

      {/* 취득 전용 모드 — 취득시 기준시가는 취득연도 정보만으로 산정된다(양도 시점 불요).
          ⚠️ 조건을 손으로 적지 않고 `transferYearVisible` leaf 를 쓴다 — ⑧검증의
             「연도 순서」 차단이 **같은 술어**로 「이 칸이 화면에 있는가」를 물어야
             화면에 없는 칸 때문에 막히는 dead-end 가 생기지 않는다. */}
      {transferYearVisible(f) && (
      <>
      <SectionCard num={3} title={transferSectionLabel ?? "양도 시점"} tone="emerald" testId="bsp-section-transfer">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FieldCard label={`${t2}연도`} stacked>
            <YearSelect
              years={yearOpts}
              value={f.transferYear}
              onChange={(v) => changeYearWithGuard("transferYear", "transStructureKey", "transUsageNo", v)}
            />
          </FieldCard>
          <FieldCard label={`${t2}일`} hint="계산서 일자 표기용(선택)" stacked>
            <DateInput value={f.eventDate} onChange={(v) => set("eventDate", v)} />
          </FieldCard>
        </div>
        {sec1648Active && (
          <p className="rounded-md bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300">
            {sameYear
              ? "취득연도와 같은 해 양도 — "
              : "동일조정기간 환산(§164⑧)을 적용하는 연도교차 양도 — "}
            양도당시 기준시가는 아래 §164⑧ 환산으로 산정되므로 양도당시 구조·용도·공시지가 입력이
            필요 없습니다.
          </p>
        )}
        {!sec1648Active && !isMech && !composite && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FieldCard label={`${t2}당시 구조`} stacked>
              <BuildingStructureSelect
                year={f.transferYear ? parseInt(f.transferYear, 10) : undefined}
                value={f.transStructureKey}
                onChange={(v) => set("transStructureKey", v)}
              />
            </FieldCard>
            <FieldCard label={`${t2}당시 용도`} stacked>
              <BuildingUsageSelect
                year={f.transferYear ? parseInt(f.transferYear, 10) : undefined}
                value={f.transUsageNo}
                onChange={(v) => set("transUsageNo", v)}
              />
            </FieldCard>
          </div>
        )}
        {!sec1648Active && !isMech && (
          <LandPriceLookupField
            pricePerSqm={f.transLandPrice}
            onPricePerSqmChange={(v) => set("transLandPrice", v)}
            area={landArea}
            jibun={jibun}
            referenceDate={landRefFromEvent(f.eventDate, f.transferYear)}
            label={`${t2}당시 ㎡당 개별공시지가`}
          />
        )}
      </SectionCard>

      {/*
        연도 교차 §164⑧ opt-in — 취득연도 다음 연도 말일 이전 양도(시행규칙 §80①1호 본문).
        같은 연도는 연 1회 고시 전제상 자동이지만, 연도가 다르면 **서로 다른 고시분일 수
        있어** §164⑧ 전제(취득·양도 기준시가 동일)를 계산기가 확인할 수 없다.
        ⇒ 사용자가 명시할 때만 환산 경로로 간다. 이 토글이 없으면 아래 §164⑧ 섹션이
           연도 교차에서 **영원히 열리지 않아** 폼-엔진 배선이 도달 불가가 된다.
      */}
      {/*
        ⚠️ **켜져 있으면 창을 벗어나도 남긴다** — 렌더 조건이 `crossYearWindow` 하나뿐이면
           켠 뒤 연도를 바꿔 창을 벗어났을 때 **끌 위젯이 사라진다**(플래그는 이월된다 —
           `changeYearWithGuard` 는 구조·용도·acqLandPrice 만 초기화한다). F-16.
           선례: `AssetSectionTransfer:221` 이 같은 이유로 같은 조건을 쓴다.
      */}
      {!sameYear && !isMech && (crossYearWindow || f.crossYearSameAdjust) && (
        <ToggleCard
          checked={f.crossYearSameAdjust}
          onCheckedChange={(v) => set("crossYearSameAdjust", v)}
          title="동일조정기간 환산 적용 (§164⑧)"
          description="보유기간 중 새 기준시가가 고시되지 않아 취득·양도 기준시가가 같은 경우 — 취득일이 속하는 연도의 다음 연도 말일 이전 양도"
          tone="rose"
          lawLinks="소득세법"
        />
      )}

      {sec1648Active && (
        <SectionCard num={4} title="동일조정기간 환산 (§164⑧)" tone="rose">
          <RadioCardGroup
            name="sameYearFormula"
            tone="rose"
            layout="stack"
            value={f.sameYearFormula}
            onChange={(v) => set("sameYearFormula", v as BuildingStdPriceFormState["sameYearFormula"])}
            options={[
              { value: "prev", label: "취득전기 기준시가 기준 환산" },
              { value: "new", label: "새로운 기준시가 기준 환산", hint: "예정신고기한까지 새 기준시가가 고시된 경우 선택 가능" },
            ]}
          />
          {/* §80③2호 대체산정 경로(취득 ≤2001)에서는 지수표를 쓰지 않아 이 입력이 **불요**하다.
              엔진·validate 와 **같은 술어**를 쓴다 — 셋이 어긋나면 「없어도 되는데 차단」이 된다. */}
          {f.sameYearFormula === "prev" && usesPriorStdPriceSubstitute(Number(f.acquisitionYear) || undefined) ? (
            <ToneCard tone="sky">
              취득전기({(Number(f.acquisitionYear) || 0) - 1}년)는 국세청 건물 기준시가 고시(2001년~) 이전이라
              전기 기준시가를 <strong>소득세법 시행규칙 §80③2호</strong>(최초고시 기준시가 × 기준율)로
              대체산정합니다 — 취득전기 공시지가 입력이 필요하지 않습니다.
            </ToneCard>
          ) : f.sameYearFormula === "prev" ? (
            <LandPriceLookupField
              pricePerSqm={f.prevLandPrice}
              onPricePerSqmChange={(v) => set("prevLandPrice", v)}
              area={landArea}
              jibun={jibun}
              referenceDate={
                f.acquisitionYear ? landRefDate(String(Number(f.acquisitionYear) - 1)) : undefined
              }
              label="취득전기(취득연도-1) ㎡당 공시지가"
            />
          ) : (
            <FieldCard label="새로운 기준시가 ㎡당 금액">
              <CurrencyInput label="새로운 기준시가" hideLabel value={f.newNoticePrice} onChange={(v) => set("newNoticePrice", v)} />
            </FieldCard>
          )}
          <FieldCard label="보유월수" hint="초일 산입, 1개월 미만 = 1개월">
            <DecimalInput value={f.holdingMonths} onChange={(v) => set("holdingMonths", v)} unit="개월" placeholder="보유월수" thousandSeparator={false} />
          </FieldCard>
          <FieldCard label="기준시가 조정월수" hint="전기~취득 기준시가 결정일 전일의 월수(연 1회 고시 = 12)">
            <DecimalInput value={f.adjustMonths} onChange={(v) => set("adjustMonths", v)} unit="개월" thousandSeparator={false} />
          </FieldCard>
        </SectionCard>
      )}
      </>
      )}
    </>
  );
}
