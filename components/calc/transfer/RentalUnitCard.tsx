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
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { deriveRentalRegionFromCode } from "@/lib/calc/house-region";
import { TONE } from "@/components/calc/shared/tones";
import { cn } from "@/lib/utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  deriveCategoryAvailability,
  deriveEffectiveRegDate,
  deriveRegApplicationDate,
  deriveRentalArticle,
  deriveRequiredYears,
  deriveStdPriceCap,
  isApartmentRestricted,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { isMa1IncludedIn15520 } from "@/lib/tax-engine/data/rental-155-20-era";
import { rentalUnitAptDeadlineInScope } from "@/lib/calc/apt-deadline-extension-scope";
import { rentalUnitUrbanLifeQuestionInScope } from "@/lib/calc/apt-deadline-extension-scope";
import { AptDeadlineExtensionFields } from "./AptDeadlineExtensionFields";
import { RentalTerminationBlock } from "./RentalTerminationBlock";
import { RentalUnitPeriodPriceBlock } from "./RentalUnitPeriodPriceBlock";
import { rentalUnitApartmentInScope } from "@/lib/calc/rental-unit-apartment-scope";

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
  /**
   * 양도일(YYYY-MM-DD) — 마목 1) 포함 여부 안내(OH-16, 대통령령 제31442호 부칙 제2조② 양도분)의
   * 기준축. 엔진 `checkEligibility`와 같은 leaf(`isMa1IncludedIn15520`)로 판정한다. 빈값이면 판정하지 않는다.
   */
  transferDate?: string;
}

export function RentalUnitCard({ unit, index, onChange, onRemove, canRemove, transferDate }: RentalUnitCardProps) {
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

  // 목 도출·마목 2) 아파트 제한·마·바목 의무기간은 지자체 등록 **신청일** 기준(엔진 `deriveRegApplicationDate`와 같은 규칙 — D-1).
  const regAppDate = useMemo(() => {
    if (!unit.businessRegistrationDate || !unit.rentalRegistrationDate) return null;
    return deriveRegApplicationDate({
      businessRegistrationDate: new Date(unit.businessRegistrationDate),
      rentalRegistrationDate: new Date(unit.rentalRegistrationDate),
    });
  }, [unit.businessRegistrationDate, unit.rentalRegistrationDate]);

  const article = useMemo(
    () => deriveRentalArticle(unit.rentalCategory, unit.rentalAcquisitionType, regAppDate),
    [unit.rentalCategory, unit.rentalAcquisitionType, regAppDate],
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
  const reqYears = deriveRequiredYears(article, regAppDate);
  const cap = deriveStdPriceCap(article, unit.region, regAppDate);
  // 묻지 않는 구분(아·자)의 남은 「아파트」 값은 ④가 보내지 않으므로 경고에도 쓰지 않는다(SYNC-3).
  const aptRestricted = isApartmentRestricted(article, regAppDate, rentalUnitApartmentInScope(unit) && unit.isApartment);

  const isNa = article === "나"; // 기존사업자 매입임대(취득당시 3억·국민주택·2호·지역무관)
  const isLa = article === "라"; // 미분양 매입임대(취득당시 3억·비수도권·5호·298/149)
  const isConstruction = article === "다" || article === "바" || article === "자";
  const isLockedPurchase = isNa || isLa; // 나·라목은 매입임대 전용(취득방법 고정)
  const showAcqPrice = isNa || isLa; // 나·라목은 취득당시 기준시가(임대개시일 기준시가 스왑)
  // 나목 cap은 취득당시 3억(지역무관) → 소재지역 숨김. 라목은 비수도권 요건이라 소재지역 노출. 가·마·아·구법은 지역별 cap.
  const showRegion = article === "가" || article === "마" || article === "아" || article === "구법" || isLa;
  // 918 조정취득: 마목(hard)·아목(carve-out)
  const show918 = article === "마" || article === "아";
  // OH-16 — 2021-02-17 이후 양도분은 ⑳이 마목 1)을 포함한다(엔진과 같은 leaf). 양도일 미입력이면 판정 보류.
  const ma1Included =
    article === "마" && !!transferDate && !Number.isNaN(new Date(transferDate).getTime())
      ? isMa1IncludedIn15520(new Date(transferDate))
      : null;
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
  // 아·자(단기 6년)만 묻지 않는다 — ④와 같은 술어(`rentalUnitApartmentInScope`).
  const showApartment = rentalUnitApartmentInScope(unit);
  const bothRegMissing = !unit.businessRegistrationDate || !unit.rentalRegistrationDate;
  // 주소로 법정동코드가 채워지면 소재 지역을 자동판별 배지로 표시(regionCode 비면 수동 라디오 fallback).
  // ?? "" : 타입은 non-optional이나 migrate 미경유 stale sessionStorage 유닛은 undefined일 수 있어 방어.
  const regionAuto = (unit.regionCode ?? "").length >= 10;

  const capLabel = showAcqPrice
    ? "3억(취득당시)"
    : `${(cap / 100_000_000).toFixed(0)}억${showRegion ? (unit.region === "seoul-metro" ? "(수도권)" : "(비수도권)") : ""}`;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3 dark:bg-emerald-950/40">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
            {index + 1}
          </span>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">임대주택 {index + 1}호</p>
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

        <FieldCard
          label="지자체 임대사업자등록신청일"
          required
          hint="2020.7.10. 이전에 오피스텔 분양권 상태로 등록하고 2020.7.11. 이후 완공되어 주택으로 사용한 경우에도 §155⑳을 적용합니다(기획재정부 재산세제과-1413, 2023.12.22. — 임대기간 외 요건을 충족한 경우)."
        >
          <DateInput
            data-testid={`rental-reg-date-${index}`}
            value={unit.rentalRegistrationDate}
            onChange={(v) => setRegDate("rentalRegistrationDate", v)}
          />
        </FieldCard>
      </div>
      {/* D10 — 엔진은 입력한 날짜를 양도일과 비교한다. 신청일과 실제 등록일이 다를 수 있음을 알린다. */}
      <p className="text-caption text-muted-foreground px-1">
        ※ 두 등록은 거주주택 양도일 현재 마쳐져 있어야 합니다. 신청은 양도 전에 했어도 등록이 양도일 뒤에
        됐다면 특례가 적용되지 않으므로, 이 경우 실제 등록일을 확인하세요.
      </p>

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
            <p className="text-rose-700 font-medium dark:text-rose-300">
              세무서·지자체 등록일을 모두 입력해야 사업자등록등 요건이 성립합니다.
            </p>
          ) : (
            <>
              <p className="font-semibold">{ARTICLE_LABEL[article]}</p>
              <p>
                의무임대기간 <b>{reqYears}년</b> · 기준시가 상한 <b>{capLabel}</b>
                {showSize ? " · 규모 대지298㎡·연면적149㎡" : " · 규모요건 없음"}
              </p>
              <p className="text-muted-foreground">
                등록기준일 {effRegDate ? effRegDate.toISOString().slice(0, 10) : "-"}
                {article === "가" || article === "마"
                  ? " · 아파트 2020.7.11 이후 등록 신청분 제외"
                  : article === "아" || article === "자"
                    ? " · 아파트 제외 유형"
                    : " · 아파트 허용"}
              </p>
              {/* 재산세제과-1291 — 질의1 마목·질의2 사목만 답했다. 가목(「1호 이상 임대하고 있는 거주자」)은 답이 없어 띄우지 않는다. */}
              {article === "마" && (
                <p className="text-muted-foreground" data-testid={`rental-co-owned-1291-${index}`}>
                  별도세대와 지분으로 공동소유한 임대주택(세대 기준 1호 미만)도 이 카드에 1호로 입력합니다 — 마목·사목
                  장기임대주택에 해당합니다(기획재정부 재산세제과-1291, 2024.11.06.).
                </p>
              )}
              {/*
                가목 공동소유 1호 미만 — 직접 해석 없음(2026-11-12 조회: 공동소유 해석례는 1291·법규과-1207·법령해석재산-3122
                모두 마목 사안). 지분비율을 곱해 세는 해석(재산세제과-525 등)은 조특법 §97 「5호 이상」 사안이라 유추일 뿐이다.
                근거 없이 불리하게 적용하지 않고 판정은 그대로 두며 확인 필요만 알린다(사용자 결정 2026-11-12).
              */}
              {article === "가" && (
                <p className="text-amber-700 dark:text-amber-300" data-testid={`rental-co-owned-ga-${index}`}>
                  별도세대와 지분으로 공동소유해 세대 기준 1호 미만만 임대하는 경우, 가목의 「민간매입임대주택을 1호 이상
                  임대하고 있는 거주자」 요건을 충족하는지 직접 다룬 해석을 확인하지 못했습니다(확인 필요) — 이 계산은 1호로
                  판정합니다. 조세특례제한법 §97 감면의 호수는 지분비율을 곱해 셉니다(기획재정부 재산세제과-525, 2018.6.18.).
                </p>
              )}
            </>
          )}
        </div>
      </ToneCard>

      {/*
        임대주택 소재지 (지번) — 소재 지역 자동판별 + 기준시가 조회 소스, 그리고 ⑳ 불성립 시 다주택 중과 주택 수의 지방 판정
        (영 §167의3①1호 — 아래 「거주주택 양도일 현재 기준시가」 칸)에 쓴다. 그 판정은 목과 무관하므로 모든 목에서 묻는다
        (종전에는 지역·임대개시일 기준시가가 없는 나목에서 칸이 빠져 나목 호의 지방 판정 입력 경로가 없었다).
      */}
      <FieldCard
        label="임대주택 소재지 (지번)"
        hint="소재 지역 자동판별 + 공시가격 자동조회 + 다주택 중과 지방 주택 판정용 (수동입력 시 생략 가능)"
      >
        <div data-testid={`rental-address-${index}`}>
        <AddressSearch
          // 상세주소는 저장할 필드가 없어 칸을 그리지 않는다 — 입력이 남지 않고, 한 글자마다 같은 값을 다시 써
          //   판정 결과를 지웠다(계획서 address-detail-dead-input.plan.md R2)
          hideDetailInput
          value={
            {
              road: "",
              jibun: unit.rentalAddressJibun,
              building: "",
              detail: "",
              lng: "",
              lat: "",
              // 동·호를 함께 넘긴다 — 빠지면 상세주소 입력이 아래 `v.dong ?? ""`로 고른 동·호를 지워
              //   기준시가 조회가 다른 세대 가격을 채웠다(계획서 address-dongho-other-calcs-and-multi-gate.plan.md R1)
              dong: unit.rentalDong || undefined,
              ho: unit.rentalHo || undefined,
            } satisfies AddressValue
          }
          onChange={(v) => {
            const patch: Partial<typeof unit> = {
              rentalAddressJibun: v.jibun,
              // 공동주택 세대(동/호) — 임대개시일 기준시가 세대 식별용. 미선택 시 "".
              rentalDong: v.dong ?? "",
              rentalHo: v.ho ?? "",
            };
            if (v.pnu && v.pnu.length >= 10) {
              patch.regionCode = v.pnu.slice(0, 10);
              patch.region = deriveRentalRegionFromCode(patch.regionCode);
            } else if (!v.jibun) {
              // 주소 clear → 자동판별 해제(수동 라디오 fallback 복귀)
              patch.regionCode = "";
            }
            onChange({ ...unit, ...patch });
          }}
        />
        </div>
      </FieldCard>

      {/* 소재지역 (매입 장기·단기매입·구법·라목 — cap 지역별 또는 비수도권 요건) */}
      {showRegion && (
        <FieldCard label="소재 지역" required hint="기준시가 상한 산정 (수도권/비수도권)">
          {regionAuto ? (
            <div className="flex items-center gap-2">
              <span
                data-testid={`rental-region-badge-${index}`}
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
                  TONE.rose.badge,
                )}
              >
                {unit.region === "seoul-metro" ? "수도권" : "비수도권"} · 주소 자동판별
              </span>
              <button
                type="button"
                data-testid={`rental-region-manual-${index}`}
                className="text-caption text-rose-700 underline dark:text-rose-300"
                onClick={() => set("regionCode", "")}
              >
                직접 지정
              </button>
            </div>
          ) : (
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
          )}
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
              ? ma1Included === true
                ? "2021.2.17 이후 양도분은 해당해도 §155⑳ 장기임대주택에 포함됩니다(소령 §155⑳ 괄호 — 아파트·단기→장기 변경 주택은 제외)."
                : ma1Included === false
                  ? "2021.2.16 이전 양도분은 해당하면 §155⑳ 특례가 배제됩니다(2021.2.17 이후 양도분부터 포함)."
                  : "양도일에 따라 달라집니다 — 2021.2.17 이후 양도분은 포함, 그 전 양도분은 배제(소령 §155⑳ 괄호)."
              : "아목(단기 매입)은 원칙 배제 — 조정대상지역 공고 전 계약 + 계약금 지급 증빙이 있으면 예외."
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
          title="단기임대를 2020.7.11. 이후 장기일반으로 변경신고한 주택입니다."
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
        <RentalTerminationBlock unit={unit} index={index} set={set} onChange={onChange} transferDate={transferDate} />
      )}

      {/* §167의3①2호 가목2) 괄호 — 도시형 생활주택인 아파트는 아래 양도기한만 비적용(마목2) 아파트 배제는 그대로). ④와 같은 술어 */}
      {rentalUnitUrbanLifeQuestionInScope(unit) && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="violet"
          title="「주택법」에 따른 도시형 생활주택인 아파트입니다."
          description="도시형 생활주택인 아파트는 아파트 양도기한(2027.12.31. — 소령 §167의3⑪)을 적용하지 않습니다(같은 조 ①2호 가목2) 괄호). 2020.7.11. 이후 등록 신청한 아파트의 장기일반 제외에는 그대로 아파트로 봅니다."
          checked={unit.isUrbanLifeHousingApartment === true}
          onCheckedChange={(v) => set("isUrbanLifeHousingApartment", v)}
        />
      )}

      {/* §167의3⑪ — 가목2)·나목2)·라목8)·마목4) 아파트 양도기한. ㉓ 말소 경로·도시형 생활주택 아파트는 비적용(④·⑧과 같은 술어) */}
      {rentalUnitAptDeadlineInScope(unit) && (
        <AptDeadlineExtensionFields
          value={unit.aptDeadlineExtension}
          onChange={(next) => set("aptDeadlineExtension", next)}
          idPrefix={`unit-${index}`}
        />
      )}

      {/* 규모요건 (대지 298㎡ · 연면적/전용 149㎡) — 건설(다·바·자) + 라목(미분양) */}
      {showSize && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2 dark:bg-sky-950/40">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">{isLa ? "미분양 규모요건" : "건설임대 규모요건"}</p>
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
        <FieldCard label="아파트 여부" hint="2020.7.11 이후 등록 신청한 아파트는 장기일반 특례 제외">
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
        <div className="rounded border border-rose-200 bg-rose-50/60 p-1.5 text-caption text-rose-800 dark:text-rose-200 dark:bg-rose-950/40">
          현재 입력 기준 아파트가 특례 제외 대상입니다 — 요건 미충족.
        </div>
      )}

      <RentalUnitPeriodPriceBlock
        unit={unit}
        index={index}
        set={set}
        onChange={onChange}
        transferDate={transferDate}
        reqYears={reqYears}
        showAcqPrice={showAcqPrice}
        capLabel={capLabel}
        rentalStartDate={rentalStartDate}
        showTermination={showTermination}
      />
    </div>
  );
}
