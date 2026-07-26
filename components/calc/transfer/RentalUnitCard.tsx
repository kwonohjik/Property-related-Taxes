"use client";

/**
 * §155⑳ 임대주택 1호 입력 카드 — RentalHousingExceptionSection 분리 (800줄 정책, Phase 3).
 *
 * 등록일 2필드 + 임대구분/취득방법 → 도출 목(가~자·구법)별 조건부 노출:
 *   소재지역·규모·918/carve-out/단→장변경·나목(국민주택)·라목(계약일·5호)·㉓ 말소 특례·아파트·기준시가 스왑.
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { PeriodRangeEditor } from "./PeriodRangeEditor";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  deriveCategoryAvailability,
  deriveEffectiveRegDate,
  deriveRentalArticle,
  deriveRequiredYears,
  deriveStdPriceCap,
  isApartmentRestricted,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";

/** 도출 목 → 사람이 읽는 라벨 */
const ARTICLE_LABEL: Record<string, string> = {
  "가": "가목 · 매입 장기(5년)",
  "나": "나목 · 기존사업자 매입(5년)",
  "라": "라목 · 미분양 매입(5년)",
  "다": "다목 · 건설 장기(5년)",
  "마": "마목 · 매입 장기일반",
  "바": "바목 · 건설 장기일반",
  "아": "아목 · 매입 단기(6년)",
  "자": "자목 · 건설 단기(6년)",
  "구법": "구 임대주택법(5년)",
};

export interface RentalUnitCardProps {
  unit: AssetForm["rentalHousingException"]["rentalUnits"][number];
  index: number;
  onChange: (u: AssetForm["rentalHousingException"]["rentalUnits"][number]) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function RentalUnitCard({ unit, index, onChange, onRemove, canRemove }: RentalUnitCardProps) {
  function set<K extends keyof typeof unit>(key: K, val: (typeof unit)[K]) {
    onChange({ ...unit, [key]: val });
  }

  // ── 파생 (useMemo — store 미러링 금지, 표시 전용) ──
  const effRegDate = useMemo(() => {
    if (!unit.businessRegistrationDate || !unit.rentalRegistrationDate) return null;
    return deriveEffectiveRegDate({
      businessRegistrationDate: new Date(unit.businessRegistrationDate),
      rentalRegistrationDate: new Date(unit.rentalRegistrationDate),
    });
  }, [unit.businessRegistrationDate, unit.rentalRegistrationDate]);

  const article = useMemo(
    () => deriveRentalArticle(unit.rentalCategory, unit.rentalAcquisitionType, effRegDate),
    [unit.rentalCategory, unit.rentalAcquisitionType, effRegDate],
  );

  // 임대개시일 = 최초 임대 시작일(min 유효 rentalPeriods[].start) → 없으면 등록기준일. 조회연도 추천용.
  const rentalStartDate = useMemo(() => {
    const starts = (unit.rentalPeriods ?? []).map((p) => p.start).filter(Boolean).sort();
    return starts[0] || (effRegDate ? effRegDate.toISOString().slice(0, 10) : "");
  }, [unit.rentalPeriods, effRegDate]);

  // 임대 구분 등록시기별 활성 판정 (표시 전용 — store 미러링 금지)
  const categoryAvail = useMemo(
    () =>
      deriveCategoryAvailability(
        unit.businessRegistrationDate ? new Date(unit.businessRegistrationDate) : null,
        unit.rentalRegistrationDate ? new Date(unit.rentalRegistrationDate) : null,
      ),
    [unit.businessRegistrationDate, unit.rentalRegistrationDate],
  );

  // 등록일 변경 시 무효화된 현재 선택만 유효 유형(long_general)으로 auto-reset (onChange 이벤트 구동 — useEffect 아님)
  function setRegDate(key: "businessRegistrationDate" | "rentalRegistrationDate", v: string) {
    const next = { ...unit, [key]: v };
    const avail = deriveCategoryAvailability(
      next.businessRegistrationDate ? new Date(next.businessRegistrationDate) : null,
      next.rentalRegistrationDate ? new Date(next.rentalRegistrationDate) : null,
    );
    // avail[...]가 undefined일 수 있음(stale/legacy rentalCategory) — 옵셔널 체이닝으로
    // 크래시 방지 + 유효 기본값(long_general)으로 self-heal
    if (!avail[next.rentalCategory]?.available) next.rentalCategory = "long_general";
    onChange(next);
  }
  const reqYears = deriveRequiredYears(article, effRegDate);
  const cap = deriveStdPriceCap(article, unit.region, effRegDate);
  const aptRestricted = isApartmentRestricted(article, effRegDate, unit.isApartment);

  const isNa = article === "나"; // 기존사업자 매입임대(취득당시 3억·국민주택·2호·지역무관)
  const isLa = article === "라"; // 미분양 매입임대(취득당시 3억·비수도권·5호·298/149)
  const isConstruction = article === "다" || article === "바" || article === "자";
  const isLockedPurchase = isNa || isLa; // 나·라목은 매입임대 전용(취득방법 고정)
  const showAcqPrice = isNa || isLa; // 나·라목은 취득당시 기준시가(임대개시일 기준시가 스왑)
  // 나목 cap은 취득당시 3억(지역무관) → 소재지역 숨김. 라목은 비수도권 요건이라 소재지역 노출. 가·마·아·구법은 지역별 cap.
  const showRegion = article === "가" || article === "마" || article === "아" || article === "구법" || isLa;
  // 918 조정취득: 마목(hard)·아목(carve-out)
  const show918 = article === "마" || article === "아";
  // 아목 carve-out: 918 ON 시 계약금 지급 증빙으로 배제 해제
  const showDepositProof = article === "아";
  // 단기→장기 변경신고 배제: 마·바
  const showShortToLong = article === "마" || article === "바";
  // 규모요건(대지298·연면적149): 건설(다·바·자) + 라목(미분양)
  const showSize = isConstruction || isLa;
  // 2호 이상 임대 요건: 건설(다·바·자) + 나목 / 라목은 5호(별도)
  const show2Units = isConstruction || isNa;
  // §155⑳㉓ 말소 특례(가·다·라·마목): 자진·자동 말소 후 5년내 거주주택 양도
  const showTermination = article === "가" || article === "다" || isLa || article === "마";
  // F6: 다·바(건설 장기)도 일반 아파트 허용. 나·라목도 허용. 아·자(단기)만 아파트 제외.
  const showApartment = article === "가" || article === "나" || isLa || article === "마" || article === "구법" || article === "다" || article === "바";
  const bothRegMissing = !unit.businessRegistrationDate || !unit.rentalRegistrationDate;

  const capLabel = showAcqPrice
    ? "3억(취득당시)"
    : `${(cap / 100_000_000).toFixed(0)}억${showRegion ? (unit.region === "seoul-metro" ? "(수도권)" : "(비수도권)") : ""}`;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
            {index + 1}
          </span>
          <p className="text-xs font-semibold text-emerald-700">임대주택 {index + 1}호</p>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            삭제
          </button>
        )}
      </div>

      {/* 세무서 사업자등록일 (§168) · 지자체 임대사업자등록신청일 (민특법 §5) — 같은 행 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldCard label="세무서 사업자등록일" required>
          <DateInput
            data-testid={`rental-biz-reg-date-${index}`}
            value={unit.businessRegistrationDate}
            onChange={(v) => setRegDate("businessRegistrationDate", v)}
          />
        </FieldCard>

        <FieldCard label="지자체 임대사업자등록신청일" required>
          <DateInput
            data-testid={`rental-reg-date-${index}`}
            value={unit.rentalRegistrationDate}
            onChange={(v) => setRegDate("rentalRegistrationDate", v)}
          />
        </FieldCard>
      </div>

      {/* 취득 방법 (나·라목은 매입임대 전용 — 숨김) */}
      {isLockedPurchase ? (
        <p className="text-caption text-muted-foreground px-1">
          ※ {isNa ? "나목(기존사업자)" : "라목(미분양)"}은 매입임대 전용입니다.
        </p>
      ) : (
        <FieldCard label="취득 방법" required>
          <RadioCardGroup
            name={`rental-acq-type-${index}`}
            tone="emerald"
            layout="inline"
            options={[
              { value: "purchase", label: "매입" },
              { value: "construction", label: "건설(신축)" },
            ]}
            value={unit.rentalAcquisitionType}
            onChange={(v) => set("rentalAcquisitionType", v as typeof unit.rentalAcquisitionType)}
          />
        </FieldCard>
      )}

      {/* 임대 구분 — 등록시기로 배제되는 유형은 disabled(단, 현재 선택은 제외: mount-limbo 방지) */}
      <FieldCard label="임대 구분" required>
        <RadioCardGroup
          name={`rental-category-${index}`}
          tone="emerald"
          layout="inline"
          options={[
            { value: "long_general", label: "장기일반" },
            { value: "short_6y", label: "단기 6년" },
            { value: "existing_business", label: "기존사업자(나목)" },
            { value: "unsold_08_09", label: "미분양(라목)" },
            { value: "pre_2018", label: "구 임대주택법" },
          ].map((o) => ({
            ...o,
            testId: `rental-category-${o.value}-${index}`,
            disabled:
              !categoryAvail[o.value as typeof unit.rentalCategory].available &&
              o.value !== unit.rentalCategory,
          }))}
          value={unit.rentalCategory}
          onChange={(v) => {
            const cat = v as typeof unit.rentalCategory;
            // 나·라목은 매입 전용 — 취득방법 고정(3중 패턴: UI·validate·엔진 일치)
            if (cat === "existing_business" || cat === "unsold_08_09") {
              onChange({ ...unit, rentalCategory: cat, rentalAcquisitionType: "purchase" });
            } else {
              set("rentalCategory", cat);
            }
          }}
        />
        {Object.values(categoryAvail).some((a) => !a.available) && (
          <div className="px-1 pt-1 space-y-0.5">
            {Object.values(categoryAvail)
              .filter((a) => !a.available)
              .map((a, k) => (
                <p key={k} className="text-caption text-muted-foreground">
                  ※ {a.reason}
                </p>
              ))}
          </div>
        )}
      </FieldCard>

      {/* 판정 기준 배지 (실시간 파생) */}
      <ToneCard tone={bothRegMissing ? "rose" : "sky"} title="판정 기준">
        <div data-testid={`rental-verdict-badge-${index}`} className="text-xs space-y-0.5">
          {bothRegMissing ? (
            <p className="text-rose-700 font-medium">
              세무서·지자체 등록일을 모두 입력해야 사업자등록등 요건이 성립합니다.
            </p>
          ) : (
            <>
              <p className="font-semibold">{ARTICLE_LABEL[article]}</p>
              <p>
                의무임대기간 <b>{reqYears}년</b> · 기준시가 상한 <b>{capLabel}</b>
                {isConstruction ? " · 규모 대지298㎡·연면적149㎡" : " · 규모요건 없음"}
              </p>
              <p className="text-muted-foreground">
                등록기준일 {effRegDate ? effRegDate.toISOString().slice(0, 10) : "-"}
                {article === "가" || article === "마"
                  ? " · 아파트 2020.7.11 이후 등록분 제외"
                  : article === "아" || article === "자"
                    ? " · 아파트 제외 유형"
                    : " · 아파트 허용"}
              </p>
            </>
          )}
        </div>
      </ToneCard>

      {/* 소재지역 (매입 장기·단기매입·구법·라목 — cap 지역별 또는 비수도권 요건) */}
      {showRegion && (
        <FieldCard label="소재 지역" required hint="기준시가 상한 산정 (수도권/비수도권)">
          <RadioCardGroup
            name={`rental-region-${index}`}
            tone="rose"
            layout="inline"
            options={[
              { value: "seoul-metro", label: "수도권" },
              { value: "non-metro", label: "비수도권" },
            ]}
            value={unit.region}
            onChange={(v) => set("region", v as typeof unit.region)}
          />
        </FieldCard>
      )}

      {/* 918 조정취득 배제 (마목 hard·아목 carve-out) */}
      {show918 && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="rose"
          title="2018.9.14 이후 조정대상지역에 신규취득한 주택입니다."
          description={
            article === "마"
              ? "마목(장기 매입)은 해당하면 §155⑳ 특례가 배제됩니다."
              : "아목(단기 매입)은 원칙 배제 — 조정대상지역 공고 전 계약 + 계약금 지급 증빙이 있으면 예외(carve-out)."
          }
          checked={unit.isExcluded918Rule}
          onCheckedChange={(v) => set("isExcluded918Rule", v)}
        />
      )}

      {/* 아목 918 carve-out — 조정대상지역 공고 전 계약 + 계약금 지급 증빙 */}
      {showDepositProof && unit.isExcluded918Rule && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="emerald"
          title="조정대상지역 공고일 이전에 계약하고 계약금을 지급한 증빙이 있습니다."
          description="증빙이 있으면 아목 918 배제에서 제외되어 특례가 유지됩니다."
          checked={unit.hasContractDepositProof}
          onCheckedChange={(v) => set("hasContractDepositProof", v)}
        />
      )}

      {/* 단기→장기 변경신고 배제 (마·바) */}
      {showShortToLong && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="rose"
          title="단기임대에서 장기일반으로 변경신고한 주택입니다."
          description="해당하면 §155⑳ 특례가 배제됩니다."
          checked={unit.isExcludedShortToLongChange}
          onCheckedChange={(v) => set("isExcludedShortToLongChange", v)}
        />
      )}

      {/* 나목 — 국민주택규모 요건 */}
      {isNa && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="sky"
          title="국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하)를 충족합니다."
          description={unit.isNationalSizeHousing ? undefined : "나목은 국민주택규모 요건 충족이 필요합니다."}
          checked={unit.isNationalSizeHousing}
          onCheckedChange={(v) => set("isNationalSizeHousing", v)}
        />
      )}

      {/* 라목 — 최초 분양계약일 + 5호 이상 */}
      {isLa && (
        <>
          <FieldCard
            label="최초 분양계약일"
            required
            hint="미분양주택 최초 분양계약 2008.6.11~2009.6.30 (라목)"
          >
            <DateInput
              data-testid={`rental-first-sale-date-${index}`}
              value={unit.firstSaleContractDate}
              onChange={(v) => set("firstSaleContractDate", v)}
            />
          </FieldCard>
          <ToggleCard
            variant="card"
            size="sm"
            tone="sky"
            title="같은 시·군에서 5호 이상 임대 요건을 충족합니다."
            description={unit.hasMinimum5UnitsInCity ? undefined : "라목은 5호 이상 임대해야 합니다."}
            checked={unit.hasMinimum5UnitsInCity}
            onCheckedChange={(v) => set("hasMinimum5UnitsInCity", v)}
          />
        </>
      )}

      {/* §155⑳㉓ 말소 특례 (가·다·라·마목) */}
      {showTermination && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="violet"
          title="자진·자동 말소된 임대주택이며, 말소 이후 5년 이내에 거주주택을 양도합니다."
          description="자진말소는 의무임대기간 1/2 이상 임대한 경우에 한합니다. 해당하면 의무임대기간요건을 충족한 것으로 봅니다(소령 §155⑳㉓)."
          checked={unit.rentalAutoTermination}
          onCheckedChange={(v) => set("rentalAutoTermination", v)}
        />
      )}

      {/* 규모요건 (대지 298㎡ · 연면적/전용 149㎡) — 건설(다·바·자) + 라목(미분양) */}
      {showSize && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-sky-700">{isLa ? "미분양 규모요건" : "건설임대 규모요건"}</p>
          </div>
          <FieldCard label="대지면적" required hint="298㎡ 이하" unit="㎡">
            <DecimalInput
              value={unit.rentalLandArea}
              onChange={(v) => set("rentalLandArea", v)}
              placeholder="대지면적"
            />
          </FieldCard>
          <FieldCard label="연면적/전용면적" required hint="149㎡ 이하" unit="㎡">
            <DecimalInput
              value={unit.rentalTotalFloorArea}
              onChange={(v) => set("rentalTotalFloorArea", v)}
              placeholder="연면적 또는 전용면적"
            />
          </FieldCard>
        </div>
      )}

      {/* 2호 이상 임대 요건 (건설 다·바·자 + 나목) */}
      {show2Units && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="sky"
          title="2호 이상 임대 요건을 충족합니다."
          description={
            unit.hasMinimum2Units
              ? undefined
              : isNa
                ? "나목은 2호 이상 임대해야 합니다."
                : "건설임대는 2호 이상 임대해야 합니다."
          }
          checked={unit.hasMinimum2Units}
          onCheckedChange={(v) => set("hasMinimum2Units", v)}
        />
      )}

      {/* 아파트 여부 (매입 계열만 선택 — 단기·건설은 고정 제외) */}
      {showApartment ? (
        <FieldCard label="아파트 여부" hint="2020.7.11 이후 등록 아파트는 장기일반 특례 제외">
          <RadioCardGroup
            name={`rental-apartment-${index}`}
            tone="violet"
            layout="inline"
            options={[
              { value: "false", label: "아파트 아님" },
              { value: "true", label: "아파트" },
            ]}
            value={String(unit.isApartment)}
            onChange={(v) => set("isApartment", v === "true")}
          />
        </FieldCard>
      ) : (
        <p className="text-caption text-muted-foreground px-1">
          ※ 해당 유형({article}목)은 아파트가 특례 대상이 아닙니다(아파트 제외).
        </p>
      )}
      {aptRestricted && (
        <div className="rounded border border-rose-200 bg-rose-50/60 p-1.5 text-caption text-rose-800">
          현재 입력 기준 아파트가 특례 제외 대상입니다 — 요건 미충족.
        </div>
      )}

      {/* 실제 임대 기간 (시작~종료일 다중 구간) — 임대개시일 기준시가 조회연도의 소스라 먼저 배치 */}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          실제 임대 기간 <span className="text-rose-500">*</span>
        </p>
        <PeriodRangeEditor
          tone="emerald"
          startLabel="임대 시작일"
          endLabel="임대 종료일"
          endHint="계속 임대 중이면 양도일을 종료일로 입력"
          rowLabel="임대 구간"
          totalLabel="합계 임대기간"
          testidPrefix={`rental-period-${index}`}
          periods={unit.rentalPeriods ?? []}
          onChange={(patch) =>
            onChange({ ...unit, rentalInputMode: "interval", rentalPeriods: patch.periods })
          }
        />
        <p className="text-xs text-muted-foreground px-1">
          의무임대기간 {reqYears}년({reqYears * 12}개월) 이상이어야 특례 적용
        </p>
      </div>

      {/* 기준시가 — 나·라목은 취득당시(3억), 그 외는 임대개시일(Vworld 자동조회) */}
      {showAcqPrice ? (
        <FieldCard
          label="취득 당시 기준시가"
          required
          hint={isNa ? "나목 취득당시 3억 이하 (지역무관)" : "라목 취득당시 3억 이하 (비수도권)"}
          unit="원"
        >
          <CurrencyInput
            label=""
            value={unit.acquisitionOfficialPrice}
            onChange={(v) => set("acquisitionOfficialPrice", v)}
            hideUnit
            placeholder="취득 당시 기준시가 (원)"
          />
        </FieldCard>
      ) : (
        <div className="space-y-2">
          {/* 임대주택 소재지 — 공시가격 자동조회용 지번 (조회 안 하면 생략 가능) */}
          <FieldCard label="임대주택 소재지 (지번)" hint="공시가격 자동조회용 — 수동입력 시 생략 가능">
            <AddressSearch
              value={
                {
                  road: "",
                  jibun: unit.rentalAddressJibun,
                  building: "",
                  detail: "",
                  lng: "",
                  lat: "",
                } satisfies AddressValue
              }
              onChange={(v) => set("rentalAddressJibun", v.jibun)}
            />
          </FieldCard>
          <HousingStdPriceLookupField
            label="임대개시일 기준시가"
            required
            hint={`상한 ${capLabel} 이하 요건 (소령 §155⑳)`}
            value={unit.standardPriceAtRentalStart}
            onChange={(v) => set("standardPriceAtRentalStart", v)}
            jibun={unit.rentalAddressJibun || undefined}
            referenceDate={rentalStartDate}
            testidPrefix={`rental-stdprice-${index}`}
          />
        </div>
      )}

      {/* 기타 요건 자기확인 (나·라목은 5%룰 미검사 — 숨김: 엔진·validate 정합) */}
      {!isNa && !isLa && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="violet"
          title="임대료 5% 상한, 임대사업자 등록 유지, 임대료 증액 후 1년 이내 재증액 금지 요건을 모두 충족합니다."
          description={
            unit.requirementsConfirmed
              ? undefined
              : "특례 적용을 위해 위 요건을 확인하고 체크하세요."
          }
          trailing={
            <LawArticleModal legalBasis="소득세법 시행령 §155" label="§155⑳" />
          }
          checked={unit.requirementsConfirmed}
          onCheckedChange={(v) => set("requirementsConfirmed", v)}
        />
      )}
    </div>
  );
}
