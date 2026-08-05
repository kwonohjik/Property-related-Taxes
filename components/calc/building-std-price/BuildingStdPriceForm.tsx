"use client";

/**
 * 건물 기준시가 입력 폼 (독립 도구). 세목 토글(양도/상증) + 기계식주차 토글 분기.
 * 클라이언트에서 calcBuildingStandardPrice 직접 호출(API route 미사용). UI 순서 = 엔진 계산 순서.
 * 연도 변경 → 해당 시점 구조/용도 옵션셋 무효화(onChange 가드, useEffect 금지).
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { BuildingRegisterLookupField } from "./BuildingRegisterLookupField";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import { AdjustmentRateModal } from "./AdjustmentRateModal";
import { CompositePartsSection } from "./CompositePartsSection";
import { ApartmentConversionSection } from "./ApartmentConversionSection";
import { SectionCard } from "./BuildingStdSectionCard";
import { BuildingStdValuationSections } from "./BuildingStdValuationSections";
import {
  type BuildingStdPriceFormState,
  initialBuildingStdPriceForm,
  availableYears,
  deriveYearFromEventDate,
  toEngineInput,
  validateBuildingStdPriceForm,
  buildNtsReportContext,
  computeValuationLandTotal,
  buildAddressPatch,
} from "@/lib/calc/building-std-price-form";
import { buildNtsReportModel, type NtsReportModel } from "@/lib/calc/nts-report-adapter";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceResult,
} from "@/lib/tax-engine/building-standard-price";
import { listStructureOptions, listUsageOptions } from "@/lib/tax-engine/data/building-standard-price";

interface Props {
  onResult: (
    result: BuildingStandardPriceResult | null,
    floorArea: number,
    error: string | null,
    report: NtsReportModel | null,
    /** 상증 경로 B 부수토지 평가액(§61①1호, 원). 미산출 시 0. 모달이 부수토지 필드로 자동 전달 */
    landStandardPrice: number,
    /** 현재 폼 입력 스냅샷 — 모달이 적용 시 보관해 재오픈 복원(정정)에 사용 */
    formSnapshot: BuildingStdPriceFormState,
  ) => void;
  /**
   * 세목 고정 — 호출 세목(양도 2시점 / 상속·증여 1시점)을 강제.
   * 지정 시 세목 라디오를 숨긴다(독립 페이지는 미지정 → 라디오 노출).
   */
  lockedTaxType?: BuildingStdPriceFormState["taxType"];
  /** 부모 자산 카드의 소재지 prefill — 모달 재입력(이중입력) 방지. 미지정 시 빈칸. */
  initialAddress?: AddressValue;
  /** 직전 계산 입력 스냅샷 복원(정정) — 지정 시 initialAddress보다 우선. 미지정 시 빈 폼. */
  initialForm?: Partial<BuildingStdPriceFormState>;
  /**
   * 둘째 시점 섹션 라벨 override(기본 "양도 시점"). PHD 감면 건물 기준시가처럼 "취득시 + 최초고시시"
   * 2시점을 한 번에 계산할 때 "최초고시 시점"으로 표시. 지정 시 복합·공동주택 환산 토글 숨김.
   */
  transferSectionLabel?: string;
  /**
   * 「건물 연면적」 입력 칸을 숨긴다 — 상위 자산 폼(① 기본정보 면적·규모)이 연면적의 단일
   * 입력 자리인 호출부 전용(GB·CB). 값은 `initialForm.floorArea`(모달버튼의 prefill)로 온다.
   * 값이 비면 칸 대신 입력 위치 안내를 띄운다 — 숨기기만 하면 연면적 0으로 조용히 오산된다.
   */
  hideFloorAreaInput?: boolean;
}

/** 연도 Select — 명시 라벨(SelectValue 단독 금지) */
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

export function BuildingStdPriceForm({ onResult, lockedTaxType, initialAddress, initialForm, transferSectionLabel, hideFloorAreaInput }: Props) {
  const [f, setF] = useState<BuildingStdPriceFormState>(() => {
    const base: BuildingStdPriceFormState = {
      ...initialBuildingStdPriceForm,
      ...(lockedTaxType ? { taxType: lockedTaxType } : {}),
      ...(initialAddress
        ? {
            addressRoad: initialAddress.road,
            addressJibun: initialAddress.jibun,
            buildingName: initialAddress.building,
            addressDetail: initialAddress.detail,
            longitude: initialAddress.lng,
            latitude: initialAddress.lat,
            pnu: initialAddress.pnu ?? "",
          }
        : {}),
      // 직전 입력 스냅샷 복원(정정) — 소재지 prefill보다 우선(스냅샷에 소재지 포함)
      ...(initialForm ?? {}),
    };
    // 상속·증여 평가연도는 eventDate에서 단일 도출(factory=normalize=UI 일치)
    return { ...base, valuationYear: deriveYearFromEventDate(base.eventDate) };
  });
  const [adjOpen, setAdjOpen] = useState(false);

  const set = <K extends keyof BuildingStdPriceFormState>(key: K, value: BuildingStdPriceFormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  // 연도 Select 값 → 공시지가 조회 기준일 합성(6/1 = 해당 연도 공시 추천). 빈값이면 미전달.
  const landRefDate = (year: string) => (year ? `${year}-06-01` : undefined);
  // 공시지가 추천연도는 실제 이벤트 일자(완성형 YYYY-MM-DD)로 판정한다 — 개별공시지가 공시일(5.31)
  // 이하 양도·취득·평가는 전년도 공시지가 적용(feedback_standard_price_year_164_3_prior).
  // 일자 미입력 시 연도만으로 YYYY-06-01 fallback(해당연도 기본).
  const landRefFromEvent = (eventDate: string, year: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : landRefDate(year);
  const jibun = f.addressJibun || undefined;
  // 부속토지 면적 — 토지기준시가(= 공시지가 × 면적) 표시용. 취득·양도·평가 공통(동일 필지).
  const landArea = parseFloat(f.landAreaM2.replace(/,/g, "")) || undefined;

  const isMech = f.isMechanicalParking;
  const yearOpts = useMemo(() => availableYears(isMech), [isMech]);
  // 취득연도는 2000이전(산정기준율) 포함
  const acqYearOpts = useMemo(() => {
    if (isMech) return yearOpts;
    const out: number[] = [];
    for (let y = 2025; y >= 1986; y--) out.push(y);
    return out;
  }, [isMech, yearOpts]);

  // 취득 ≤2000 → 구조/용도 옵션셋은 2001년 지수표
  const acqIndexYear = useMemo(() => {
    const y = parseInt(f.acquisitionYear, 10);
    if (Number.isNaN(y)) return undefined;
    return y <= 2000 ? 2001 : y;
  }, [f.acquisitionYear]);

  // 연도 변경 시 구조/용도 무효화 가드(onChange 내 동기 처리) — 양도 전용.
  // (상속·증여 valuationYear는 valuationPatchFromEventDate 단일 경로로만 도출)
  const changeYearWithGuard = (
    yearKey: "acquisitionYear" | "transferYear",
    structKey: keyof BuildingStdPriceFormState,
    usageKey: keyof BuildingStdPriceFormState,
    newYear: string,
    indexYearOverride?: number,
  ) => {
    const iy = indexYearOverride ?? parseInt(newYear, 10);
    const structOk = !Number.isNaN(iy) && listStructureOptions(iy).some((o) => o.key === f[structKey]);
    const usageOk = !Number.isNaN(iy) && listUsageOptions(iy).some((o) => String(o.no) === f[usageKey]);
    setF((prev) => {
      const next: BuildingStdPriceFormState = {
        ...prev,
        [yearKey]: newYear,
        [structKey]: structOk ? prev[structKey] : "",
        [usageKey]: usageOk ? prev[usageKey] : "",
      };
      // 취득연도 ≤2000↔≥2001 경계 교차 시 취득 공시지가 초기화 — 2001.1.1 위치지수값과
      // 취득연도 토지값은 의미가 달라 이월하면 오입력(fixedYear=2001 정정과 짝).
      if (yearKey === "acquisitionYear") {
        const oldPre2001 = parseInt(prev.acquisitionYear, 10) <= 2000;
        const newPre2001 = parseInt(newYear, 10) <= 2000;
        if (oldPre2001 !== newPre2001) next.acqLandPrice = "";
      }
      return next;
    });
  };

  // 상속·증여: eventDate → valuationYear 도출 + 새 연도 지수표에 없는 구조/용도 초기화(가드).
  // valuationYear 단일 writer(날짜 onChange·taxType 전환 공용) — useEffect 미러링 아님.
  const valuationPatchFromEventDate = (eventDate: string, prev: BuildingStdPriceFormState) => {
    const derivedYear = deriveYearFromEventDate(eventDate);
    const iy = parseInt(derivedYear, 10);
    const structOk = !Number.isNaN(iy) && listStructureOptions(iy).some((o) => o.key === prev.valStructureKey);
    const usageOk = !Number.isNaN(iy) && listUsageOptions(iy).some((o) => String(o.no) === prev.valUsageNo);
    return {
      valuationYear: derivedYear,
      valStructureKey: structOk ? prev.valStructureKey : "",
      valUsageNo: usageOk ? prev.valUsageNo : "",
    };
  };
  const setEventDateDeriveYear = (v: string) =>
    setF((prev) => ({ ...prev, eventDate: v, ...valuationPatchFromEventDate(v, prev) }));
  // 모드 전환 시 평가시점 날짜를 비워 새 입력 강제 — 양도일↔상속·증여일 의미 혼입 방지.
  // 날짜가 비므로 valuationYear·평가 구조/용도도 초기화(구조/용도 입력은 새 일자 입력 후 활성).
  const changeTaxType = (tt: BuildingStdPriceFormState["taxType"]) =>
    setF((prev) => ({
      ...prev,
      taxType: tt,
      eventDate: "",
      acquisitionEventDate: "",
      valuationYear: "",
      valStructureKey: "",
      valUsageNo: "",
    }));

  const phd = !!transferSectionLabel; // PHD 2시점(취득·최초고시) — 복합·공동주택 환산 토글 숨김
  // 둘째 시점 라벨 접두어 — 섹션 라벨에서 " 시점" 제거("최초고시 시점"→"최초고시"). 기본 "양도".
  const t2 = transferSectionLabel ? transferSectionLabel.replace(/\s*시점$/, "") : "양도";
  const sameYear = f.taxType === "transfer" && f.acquisitionYear !== "" && f.acquisitionYear === f.transferYear;
  const valYear = f.valuationYear ? parseInt(f.valuationYear, 10) : undefined;
  // 조정률 모달용 구조지수 — 평가시점 구조 선택값에서 도출(I 지붕재료는 구조지수 100 미만만 활성). 미선택 = 0
  const valStructureIndex = useMemo(() => {
    if (valYear === undefined || Number.isNaN(valYear) || !f.valStructureKey) return 0;
    return listStructureOptions(valYear).find((o) => o.key === f.valStructureKey)?.index ?? 0;
  }, [valYear, f.valStructureKey]);
  const apartmentConv = f.taxType === "transfer" && f.apartmentConversionMode;
  const composite = f.compositeMode && !isMech && !apartmentConv;
  // 단일 시점 모드 — 모달 applyTimePoint가 폼 상태로 주입. 그 시점 입력만 노출한다.
  // ⚠️ 동일연도(§164⑧)는 양도값이 취득값에서 파생되므로 2시점 입력을 모두 되살린다
  //    (엔진·validate와 동일 게이트 — toEngineInput/validateBuildingStdPriceForm 참조).
  const singleActive = !!f.singleTimePoint && !sameYear && !isMech && !apartmentConv;
  const acqOnly = singleActive && f.singleTimePoint === "acquisition";
  const transferOnly = singleActive && f.singleTimePoint === "transfer";
  // 양도 복합 — 취득시 용도지수표 기준 연도(≤2000=2001)
  const acqUsageYear = acqIndexYear;
  // 연면적 입력 불요: 복합구조(부분별)·공동주택 환산(자체 연면적)·상위 폼이 단일 입력 자리인 호출부
  const hideFloorArea = composite || apartmentConv || !!hideFloorAreaInput;
  // 건물 기본 면적 표시 조건 — 둘 다 보일 때만 한 행에 배치
  const showFloorArea = !isMech && !hideFloorArea;
  const showLandArea = !isMech && !apartmentConv && !f.landParcelMode;
  /**
   * 상위 폼 연면적이 비어 온 경우의 안내 — 칸만 숨기면 연면적 0으로 조용히 오산된다.
   * 복합·공동주택 환산은 자체 연면적 경로라 대상이 아니다(종전 동작 유지).
   */
  const showFloorAreaSourceNotice =
    !!hideFloorAreaInput &&
    !isMech &&
    !composite &&
    !apartmentConv &&
    !(parseFloat(f.floorArea.replace(/,/g, "")) > 0);

  const handleCalc = () => {
    const err = validateBuildingStdPriceForm(f);
    if (err) {
      onResult(null, 0, err, null, 0, f);
      return;
    }
    try {
      const result = calcBuildingStandardPrice(toEngineInput(f));
      const report = buildNtsReportModel(buildNtsReportContext(f), result);
      onResult(
        result,
        parseFloat(f.floorArea.replace(/,/g, "")) || 0,
        null,
        report,
        computeValuationLandTotal(f),
        f,
      );
    } catch (e) {
      onResult(null, 0, e instanceof Error ? e.message : "계산 오류", null, 0, f);
    }
  };

  return (
    <div className="space-y-3">
      {/* 세목 — 호출 세목이 고정된 경우(lockedTaxType) 라디오 숨김(오선택 방지) */}
      {!lockedTaxType && (
        <RadioCardGroup
          name="taxType"
          tone="sky"
          layout="inline"
          value={f.taxType}
          onChange={(v) => changeTaxType(v as BuildingStdPriceFormState["taxType"])}
          options={[
            { value: "transfer", label: "양도(취득·양도 2시점)" },
            { value: "inheritance_gift", label: "상속·증여(1시점)" },
          ]}
        />
      )}

      {/* 기계식주차 토글 */}
      <ToggleCard
        checked={isMech}
        onCheckedChange={(v) => set("isMechanicalParking", v)}
        title="기계식주차전용빌딩"
        tone="violet"
        variant="card"
        description="해당 연도 고시 단가 × 경과연수별 잔가율(고시 내용연수) × 주차대수로 산정(구조·용도·위치지수·조정률 미적용). 단가·내용연수는 연도별로 다릅니다(예: 2025년 6,000,000원·30년 / 2001년 5,000,000원·20년)."
      >
        <FieldCard label="주차대수" hint="기계식 주차대수">
          <DecimalInput value={f.parkingLotCount} onChange={(v) => set("parkingLotCount", v)} unit="대" placeholder="기계식 주차대수" />
        </FieldCard>
      </ToggleCard>

      {/* 소재지 — 개별공시지가 자동조회용(건물 단위 1회 입력). 기계식주차는 토지가액 미사용 → 숨김 */}
      {!isMech && (
        <div className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-micro font-bold text-rose-800">
              ＠
            </span>
            <span className="text-sm font-semibold text-rose-700">소재지 (공시지가 조회용)</span>
          </div>
          <p className="text-caption text-rose-600/90">
            주소를 입력하면 아래 ㎡당 개별공시지가를 연도별로 자동 조회할 수 있습니다. 미입력 시 직접 입력하세요.
          </p>
          <AddressSearch
            value={
              {
                road: f.addressRoad,
                jibun: f.addressJibun,
                building: f.buildingName,
                detail: f.addressDetail,
                lng: f.longitude,
                lat: f.latitude,
                pnu: f.pnu,
              } satisfies AddressValue
            }
            onChange={(v) => setF((prev) => ({ ...prev, ...buildAddressPatch(v) }))}
          />
          <BuildingRegisterLookupField
            pnu={f.pnu}
            year={f.taxType === "transfer" ? f.transferYear : f.valuationYear}
            taxType={f.taxType}
            disabled={composite || isMech || apartmentConv}
            isCollectiveUnit={!!f.unitDong || !!f.unitHo}
            dong={f.unitDong}
            ho={f.unitHo}
            onAutoFill={(patch) => setF((prev) => ({ ...prev, ...patch }))}
          />
          {(!!f.unitDong || !!f.unitHo) && (
            <p className="text-caption text-rose-600/90">
              집합건물 세대는 건축물대장 조회 시 전유+공용 연면적이 건물 연면적으로 자동 입력됩니다(국세청 「건물 기준시가
              계산방법 고시」상 건물면적 기준). 조회되지 않으면 전유+공용 연면적을 직접 입력하세요.
            </p>
          )}
        </div>
      )}

      {/* ① 건물 기본 */}
      <SectionCard num={1} title="건물 기본" tone="sky">
        <ReferenceSiteLinks sites={[REFERENCE_SITES.buildingRegister]} />
        <FieldCard label="신축연도" hint="준공·사용승인 연도">
          <DecimalInput value={f.builtYear} onChange={(v) => set("builtYear", v)} placeholder="신축연도 (4자리)" thousandSeparator={false} />
        </FieldCard>
        {showFloorArea && showLandArea ? (
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="건물 연면적" className="sm:grid-cols-[96px_1fr]">
              <DecimalInput value={f.floorArea} onChange={(v) => set("floorArea", v)} unit="㎡" placeholder="건물 연면적" />
            </FieldCard>
            <FieldCard label="토지 면적" className="sm:grid-cols-[96px_1fr]">
              <DecimalInput value={f.landAreaM2} onChange={(v) => set("landAreaM2", v)} unit="㎡" placeholder="부속토지 면적" />
            </FieldCard>
          </div>
        ) : (
          <>
            {showFloorArea && (
              <FieldCard label="건물 연면적">
                <DecimalInput value={f.floorArea} onChange={(v) => set("floorArea", v)} unit="㎡" placeholder="건물 연면적" />
              </FieldCard>
            )}
            {showLandArea && (
              <FieldCard label="토지 면적">
                <DecimalInput value={f.landAreaM2} onChange={(v) => set("landAreaM2", v)} unit="㎡" placeholder="부속토지 면적" />
              </FieldCard>
            )}
          </>
        )}
        {showFloorAreaSourceNotice && (
          <p className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-caption text-amber-800">
            건물 연면적이 비어 있습니다 — ① 기본정보 「면적·규모」에서 입력하면 이 계산기에 자동 반영됩니다.
          </p>
        )}
        {!isMech && (
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="지상 층수" hint="계산서 표기용(선택)" className="sm:grid-cols-[88px_1fr]">
              <DecimalInput value={f.floorsAbove} onChange={(v) => set("floorsAbove", v)} unit="층" thousandSeparator={false} />
            </FieldCard>
            <FieldCard label="지하 층수" hint="계산서 표기용(선택)" className="sm:grid-cols-[88px_1fr]">
              <DecimalInput value={f.floorsBelow} onChange={(v) => set("floorsBelow", v)} unit="층" thousandSeparator={false} />
            </FieldCard>
          </div>
        )}
        {f.taxType === "inheritance_gift" && (
          <FieldCard label="리모델링·대수선 연도" hint="입력 시 잔가율을 리모델링 연도 기준 적용(선택)">
            <DecimalInput value={f.remodelYear} onChange={(v) => set("remodelYear", v)} placeholder="해당없음" thousandSeparator={false} />
          </FieldCard>
        )}
      </SectionCard>

      {/* 양도 분기 */}
      {f.taxType === "transfer" && (
        <>
          <SectionCard num={2} title="취득 시점" tone="amber" testId="bsp-section-acq">
            {/* 양도 전용 모드 — 취득 시점은 양도당시 기준시가 산정에 쓰이지 않는다.
                다만 §164⑧(취득연도 == 양도연도) 판정에 취득연도가 필요해 연도 칸만 남긴다. */}
            {transferOnly && (
              <p
                className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-xs text-amber-800"
                data-testid="bsp-transfer-only-note"
              >
                양도당시 기준시가는 양도 시점 정보만으로 산정됩니다. 취득연도가 양도연도와 같은 경우에만
                취득당시 기준시가를 환산해 쓰므로(소득령 §164⑧), 아래 취득연도만 확인합니다.
              </p>
            )}
            <div className={transferOnly ? "" : "grid grid-cols-2 gap-2"}>
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
            {!transferOnly && acqIndexYear === 2001 && !apartmentConv && (
              <p className="rounded-md bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700">
                2000년 이전 취득 — 2001.1.1 ㎡당 금액 × 산정기준율로 환산됩니다. 구조·용도는 2001년 지수표 기준입니다.
              </p>
            )}
            {!transferOnly && !isMech && !apartmentConv && !composite && (
              <div className="grid grid-cols-2 gap-2">
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
                  hint="§164⑤ — 2001.1.1 현재 개별공시지가로 위치지수 산정"
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
          {!isMech && !composite && !phd && !singleActive && (
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

          {/* 취득 전용 모드 — 취득시 기준시가는 취득연도 정보만으로 산정된다(양도 시점 불요) */}
          {!apartmentConv && !acqOnly && (
          <>
          <SectionCard num={3} title={transferSectionLabel ?? "양도 시점"} tone="emerald" testId="bsp-section-transfer">
            <div className="grid grid-cols-2 gap-2">
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
            {sameYear && !isMech && (
              <p className="rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                취득연도와 같은 해 양도 — 양도당시 기준시가는 아래 §164⑧ 환산으로 산정되므로 양도당시
                구조·용도·공시지가 입력이 필요 없습니다.
              </p>
            )}
            {!isMech && !sameYear && !composite && (
              <div className="grid grid-cols-2 gap-2">
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
            {!isMech && !sameYear && (
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

          {sameYear && !isMech && (
            <SectionCard num={4} title="동일연도 환산 (§164⑧)" tone="rose">
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
              {f.sameYearFormula === "prev" ? (
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
      )}

      {/* 상증 분기(1시점) — 800줄 정책 분리 */}
      {f.taxType === "inheritance_gift" && (
        <BuildingStdValuationSections
          f={f}
          set={set}
          onEventDateChange={setEventDateDeriveYear}
          isMech={isMech}
          composite={composite}
          valYear={valYear}
          valStructureIndex={valStructureIndex}
          jibun={jibun}
          landArea={landArea}
          landRefFromEvent={landRefFromEvent}
          onOpenAdjustment={() => setAdjOpen(true)}
        />
      )}

      <Button className="w-full" onClick={handleCalc}>
        기준시가 계산하기
      </Button>

      <AdjustmentRateModal
        open={adjOpen}
        onOpenChange={setAdjOpen}
        structureIndex={valStructureIndex}
        structureKey={f.valStructureKey}
        floorArea={parseFloat(f.floorArea.replace(/,/g, "")) || 0}
        isResidential={f.isResidentialUse}
        isApartment={f.isApartmentUse}
        initial={f.adjustmentFeatures}
        onApply={(features, res, apt) => {
          set("adjustmentFeatures", features);
          set("isResidentialUse", res);
          set("isApartmentUse", apt);
        }}
      />
    </div>
  );
}
