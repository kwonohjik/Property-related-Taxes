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
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import { AdjustmentRateModal } from "./AdjustmentRateModal";
import {
  type BuildingStdPriceFormState,
  initialBuildingStdPriceForm,
  availableYears,
  toEngineInput,
  validateBuildingStdPriceForm,
} from "@/lib/calc/building-std-price-form";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceResult,
} from "@/lib/tax-engine/building-standard-price";
import { listStructureOptions, listUsageOptions } from "@/lib/tax-engine/data/building-standard-price";

interface Props {
  onResult: (result: BuildingStandardPriceResult | null, floorArea: number, error: string | null) => void;
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

function SectionCard({
  num,
  title,
  tone,
  children,
}: {
  num: number;
  title: string;
  tone: "sky" | "amber" | "emerald" | "violet" | "rose";
  children: React.ReactNode;
}) {
  const T: Record<string, { border: string; bg: string; badge: string; text: string }> = {
    sky: { border: "border-sky-200", bg: "bg-sky-50/40", badge: "bg-sky-200 text-sky-800", text: "text-sky-700" },
    amber: { border: "border-amber-200", bg: "bg-amber-50/40", badge: "bg-amber-200 text-amber-800", text: "text-amber-700" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50/40", badge: "bg-emerald-200 text-emerald-800", text: "text-emerald-700" },
    violet: { border: "border-violet-200", bg: "bg-violet-50/40", badge: "bg-violet-200 text-violet-800", text: "text-violet-700" },
    rose: { border: "border-rose-200", bg: "bg-rose-50/40", badge: "bg-rose-200 text-rose-800", text: "text-rose-700" },
  };
  const t = T[tone];
  return (
    <div className={`rounded-lg border p-3 space-y-2.5 ${t.border} ${t.bg}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${t.badge}`}>
          {num}
        </span>
        <span className={`text-sm font-semibold ${t.text}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function BuildingStdPriceForm({ onResult }: Props) {
  const [f, setF] = useState<BuildingStdPriceFormState>(initialBuildingStdPriceForm);
  const [adjOpen, setAdjOpen] = useState(false);

  const set = <K extends keyof BuildingStdPriceFormState>(key: K, value: BuildingStdPriceFormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

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

  // 연도 변경 시 구조/용도 무효화 가드(onChange 내 동기 처리)
  const changeYearWithGuard = (
    yearKey: "acquisitionYear" | "transferYear" | "valuationYear",
    structKey: keyof BuildingStdPriceFormState,
    usageKey: keyof BuildingStdPriceFormState,
    newYear: string,
    indexYearOverride?: number,
  ) => {
    const iy = indexYearOverride ?? parseInt(newYear, 10);
    const structOk = !Number.isNaN(iy) && listStructureOptions(iy).some((o) => o.key === f[structKey]);
    const usageOk = !Number.isNaN(iy) && listUsageOptions(iy).some((o) => String(o.no) === f[usageKey]);
    setF((prev) => ({
      ...prev,
      [yearKey]: newYear,
      [structKey]: structOk ? prev[structKey] : "",
      [usageKey]: usageOk ? prev[usageKey] : "",
    }));
  };

  const sameYear = f.taxType === "transfer" && f.acquisitionYear !== "" && f.acquisitionYear === f.transferYear;

  const handleCalc = () => {
    const err = validateBuildingStdPriceForm(f);
    if (err) {
      onResult(null, 0, err);
      return;
    }
    try {
      const result = calcBuildingStandardPrice(toEngineInput(f));
      onResult(result, parseFloat(f.floorArea.replace(/,/g, "")) || 0, null);
    } catch (e) {
      onResult(null, 0, e instanceof Error ? e.message : "계산 오류");
    }
  };

  return (
    <div className="space-y-3">
      {/* 세목 */}
      <RadioCardGroup
        name="taxType"
        tone="sky"
        layout="inline"
        value={f.taxType}
        onChange={(v) => set("taxType", v as BuildingStdPriceFormState["taxType"])}
        options={[
          { value: "transfer", label: "양도(취득·양도 2시점)" },
          { value: "inheritance_gift", label: "상속·증여(1시점)" },
        ]}
      />

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
          <DecimalInput value={f.parkingLotCount} onChange={(v) => set("parkingLotCount", v)} unit="대" placeholder="예: 50" />
        </FieldCard>
      </ToggleCard>

      {/* ① 건물 기본 */}
      <SectionCard num={1} title="건물 기본" tone="sky">
        <FieldCard label="신축연도" hint="준공·사용승인 연도">
          <DecimalInput value={f.builtYear} onChange={(v) => set("builtYear", v)} placeholder="예: 2010" thousandSeparator={false} />
        </FieldCard>
        {!isMech && (
          <FieldCard label="건물 연면적" hint="공동주택 = 전유 + 공용">
            <DecimalInput value={f.floorArea} onChange={(v) => set("floorArea", v)} unit="㎡" placeholder="예: 200" />
          </FieldCard>
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
          <SectionCard num={2} title="취득 시점" tone="amber">
            <FieldCard label="취득연도">
              <YearSelect
                years={acqYearOpts}
                value={f.acquisitionYear}
                onChange={(v) =>
                  changeYearWithGuard("acquisitionYear", "acqStructureKey", "acqUsageNo", v, parseInt(v, 10) <= 2000 ? 2001 : undefined)
                }
              />
            </FieldCard>
            {acqIndexYear === 2001 && (
              <p className="rounded-md bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700">
                2000년 이전 취득 — 2001.1.1 ㎡당 금액 × 산정기준율로 환산됩니다. 구조·용도는 2001년 지수표 기준입니다.
              </p>
            )}
            {!isMech && (
              <>
                <FieldCard label="취득당시 구조">
                  <BuildingStructureSelect year={acqIndexYear} value={f.acqStructureKey} onChange={(v) => set("acqStructureKey", v)} />
                </FieldCard>
                <FieldCard label="취득당시 용도">
                  <BuildingUsageSelect year={acqIndexYear} value={f.acqUsageNo} onChange={(v) => set("acqUsageNo", v)} />
                </FieldCard>
                <LandPriceLookupField
                  pricePerSqm={f.acqLandPrice}
                  onPricePerSqmChange={(v) => set("acqLandPrice", v)}
                  label="취득당시 ㎡당 개별공시지가"
                  hint="여러 필지면 면적 가중평균한 ㎡당 가액"
                />
              </>
            )}
          </SectionCard>

          <SectionCard num={3} title="양도 시점" tone="emerald">
            <FieldCard label="양도연도">
              <YearSelect
                years={yearOpts}
                value={f.transferYear}
                onChange={(v) => changeYearWithGuard("transferYear", "transStructureKey", "transUsageNo", v)}
              />
            </FieldCard>
            {!isMech && (
              <>
                <FieldCard label="양도당시 구조">
                  <BuildingStructureSelect
                    year={f.transferYear ? parseInt(f.transferYear, 10) : undefined}
                    value={f.transStructureKey}
                    onChange={(v) => set("transStructureKey", v)}
                  />
                </FieldCard>
                <FieldCard label="양도당시 용도">
                  <BuildingUsageSelect
                    year={f.transferYear ? parseInt(f.transferYear, 10) : undefined}
                    value={f.transUsageNo}
                    onChange={(v) => set("transUsageNo", v)}
                  />
                </FieldCard>
                <LandPriceLookupField
                  pricePerSqm={f.transLandPrice}
                  onPricePerSqmChange={(v) => set("transLandPrice", v)}
                  label="양도당시 ㎡당 개별공시지가"
                />
              </>
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
                  label="취득전기(취득연도-1) ㎡당 공시지가"
                />
              ) : (
                <FieldCard label="새로운 기준시가 ㎡당 금액">
                  <CurrencyInput label="새로운 기준시가" hideLabel value={f.newNoticePrice} onChange={(v) => set("newNoticePrice", v)} />
                </FieldCard>
              )}
              <FieldCard label="보유월수" hint="초일 산입, 1개월 미만 = 1개월">
                <DecimalInput value={f.holdingMonths} onChange={(v) => set("holdingMonths", v)} unit="개월" placeholder="예: 6" thousandSeparator={false} />
              </FieldCard>
              <FieldCard label="기준시가 조정월수" hint="전기~취득 기준시가 결정일 전일의 월수(연 1회 고시 = 12)">
                <DecimalInput value={f.adjustMonths} onChange={(v) => set("adjustMonths", v)} unit="개월" thousandSeparator={false} />
              </FieldCard>
            </SectionCard>
          )}
        </>
      )}

      {/* 상증 분기 */}
      {f.taxType === "inheritance_gift" && (
        <>
          <SectionCard num={2} title="평가 시점" tone="emerald">
            <FieldCard label="상속·증여 연도">
              <YearSelect
                years={yearOpts}
                value={f.valuationYear}
                onChange={(v) => changeYearWithGuard("valuationYear", "valStructureKey", "valUsageNo", v)}
              />
            </FieldCard>
            {!isMech && (
              <>
                <FieldCard label="건물 구조">
                  <BuildingStructureSelect
                    year={f.valuationYear ? parseInt(f.valuationYear, 10) : undefined}
                    value={f.valStructureKey}
                    onChange={(v) => set("valStructureKey", v)}
                  />
                </FieldCard>
                <FieldCard label="건물 용도">
                  <BuildingUsageSelect
                    year={f.valuationYear ? parseInt(f.valuationYear, 10) : undefined}
                    value={f.valUsageNo}
                    onChange={(v) => set("valUsageNo", v)}
                  />
                </FieldCard>
                <LandPriceLookupField
                  pricePerSqm={f.valLandPrice}
                  onPricePerSqmChange={(v) => set("valLandPrice", v)}
                  label="㎡당 개별공시지가"
                  hint="2001~2002년 평가는 해당연도 1.1 기준"
                />
              </>
            )}
          </SectionCard>

          {!isMech && (
            <SectionCard num={3} title="조정률" tone="violet">
              <RadioCardGroup
                name="adjustmentMode"
                tone="violet"
                layout="inline"
                value={f.adjustmentMode}
                onChange={(v) => set("adjustmentMode", v as BuildingStdPriceFormState["adjustmentMode"])}
                options={[
                  { value: "features", label: "건물 특성으로 계산" },
                  { value: "manual", label: "직접 입력(%)" },
                ]}
              />
              {f.adjustmentMode === "features" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToggleCard
                      checked={f.isResidentialUse}
                      onCheckedChange={(v) => set("isResidentialUse", v)}
                      title="주거용 건물"
                      tone="violet"
                      variant="chip"
                      size="sm"
                    />
                    {f.isResidentialUse && (
                      <ToggleCard
                        checked={f.isApartmentUse}
                        onCheckedChange={(v) => set("isApartmentUse", v)}
                        title="아파트"
                        tone="violet"
                        variant="chip"
                        size="sm"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => setAdjOpen(true)}>
                      건물 특성으로 조정률 계산
                    </Button>
                    {f.adjustmentFeatures && Object.keys(f.adjustmentFeatures).length > 0 && (
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                        특성 {Object.keys(f.adjustmentFeatures).length}개 적용
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <FieldCard label="조정률" hint="100 = 1.0(미적용)">
                  <DecimalInput value={f.manualAdjustmentRate} onChange={(v) => set("manualAdjustmentRate", v)} unit="%" placeholder="100" />
                </FieldCard>
              )}
            </SectionCard>
          )}
        </>
      )}

      <Button className="w-full" onClick={handleCalc}>
        기준시가 계산하기
      </Button>

      <AdjustmentRateModal
        open={adjOpen}
        onOpenChange={setAdjOpen}
        structureIndex={0}
        floorArea={parseFloat(f.floorArea.replace(/,/g, "")) || 0}
        isResidential={f.isResidentialUse}
        isApartment={f.isApartmentUse}
        initial={f.adjustmentFeatures}
        onApply={(features) => set("adjustmentFeatures", features)}
      />
    </div>
  );
}
