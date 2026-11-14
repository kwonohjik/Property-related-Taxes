"use client";

/**
 * 임대주택 1호 카드의 하단 묶음 — RentalUnitCard 분리 (800줄 정책).
 *
 * 실제 임대 기간 → 기준시가(나·라목 취득당시 / 그 외 임대개시일) → ⑳2호 기타 요건 자기확인 →
 * 거주주택 양도일 현재 기준시가(영 §167의3①1호 저가 주택 제외용).
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PeriodRangeEditor } from "./PeriodRangeEditor";
import { rentalUnitLowPriceInScope } from "@/lib/calc/rental-unit-low-price-scope";
import { RentalSuccessionBlock } from "./RentalSuccessionBlock";
import { recognizedRentalMonths } from "@/lib/stores/calc-wizard-asset-rental-period";
import { rentalRegistrationBasisDate } from "@/lib/stores/calc-wizard-asset-rental-period";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

export interface RentalUnitPeriodPriceBlockProps {
  unit: RentalUnitForm;
  index: number;
  set: <K extends keyof RentalUnitForm>(key: K, val: RentalUnitForm[K]) => void;
  onChange: (u: RentalUnitForm) => void;
  /** 거주주택 양도일 — 저가 주택 기준시가 조회 기준일. */
  transferDate?: string;
  /** 의무임대기간(년) — 안내 문구용. */
  reqYears: number;
  /** 나·라목이면 취득당시 기준시가 칸, 아니면 임대개시일 기준시가 조회 칸. */
  showAcqPrice: boolean;
  /** 기준시가 상한 라벨(예: 「6억(수도권)」). */
  capLabel: string;
  /** 임대개시일 — 기준시가 조회연도 추천용. */
  rentalStartDate: string;
  /** ㉓ 말소 특례 노출 목(가·다·라·마) — 말소된 호의 요건 문구를 바꾼다. */
  showTermination: boolean;
}

export function RentalUnitPeriodPriceBlock({
  unit,
  index,
  set,
  onChange,
  transferDate,
  reqYears,
  showAcqPrice,
  capLabel,
  rentalStartDate,
  showTermination,
}: RentalUnitPeriodPriceBlockProps) {
  return (
    <>
      {/* 실제 임대 기간 (시작~종료일 다중 구간) — 임대개시일 기준시가 조회연도의 소스라 먼저 배치 */}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          실제 임대 기간 <span className="text-rose-700 dark:text-rose-400">*</span>
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
        {(unit.rentalPeriods ?? []).some((p) => p.start && p.end) && (
          <p className="text-xs px-1" data-testid={`rental-recognized-months-${index}`}>
            의무임대기간 판정에 쓰는 임대기간:{" "}
            <strong>
              {recognizedRentalMonths(unit.rentalPeriods, rentalRegistrationBasisDate(unit))}개월
            </strong>
            <span className="text-muted-foreground">
              {" "}— 세무서 사업자등록일·지자체 임대사업자 등록일 중 늦은 날 전의 임대분은 빼고(소령 §167의3③), 임차인이
              바뀌는 사이 3개월 이내 공실은 넣어 셉니다(조특령 §97⑤5호 · 조특칙 §44). 3개월을 넘는 공실은 뺍니다.
            </span>
          </p>
        )}
        <p className="text-xs text-muted-foreground px-1">
          의무임대기간 {reqYears}년({reqYears * 12}개월) — 채우기 전에 거주주택을 양도해도 특례를 적용하며,
          이후 채우지 못하면 특례가 없었을 경우의 세액과의 차액을 신고·납부합니다(소령 §155㉑·㉒).
        </p>
      </div>

      {/* 임대사업 승계(상속·같은 세대원 증여·포괄양수) — 전 임대사업자 임대기간 합산(조특령 §97⑤3호). 구간은 본인 등록일로 잘리므로 따로 받는다. */}
      <RentalSuccessionBlock unit={unit} index={index} onChange={onChange} />

      {/* 기준시가 — 나·라목은 취득당시(3억), 그 외는 임대개시일(Vworld 자동조회) */}
      {showAcqPrice ? (
        <FieldCard
          label="취득 당시 기준시가"
          required
          unit="원"
          hint={`상한 ${capLabel} 이하 요건 (소령 §155⑳)`}
        >
          <CurrencyInput
            label=""
            value={unit.acquisitionOfficialPrice}
            onChange={(v) => set("acquisitionOfficialPrice", v)}
            hideUnit
          />
        </FieldCard>
      ) : (
        // 지번 주소는 상단(소재지 칸)으로 이동 — jibun은 state 공유라 조회 정상
        <HousingStdPriceLookupField
          label="임대개시일 기준시가"
          required
          hint={`상한 ${capLabel} 이하 요건 (소령 §155⑳)`}
          value={unit.standardPriceAtRentalStart}
          onChange={(v) => set("standardPriceAtRentalStart", v)}
          jibun={unit.rentalAddressJibun || undefined}
          dong={unit.rentalDong || undefined}
          ho={unit.rentalHo || undefined}
          referenceDate={rentalStartDate}
          testidPrefix={`rental-stdprice-${index}`}
        />
      )}

      {/*
        기타 요건 자기확인 — §155⑳2호(양도일 현재 사업자등록·민간임대주택 등록·임대 중·임대료등 증가율 5% 이내)는
        목을 가리지 않는 ⑳ 고유 요건이다(OH-41). 종전에는 §167의3 나·라목 문언에 5% 규정이 없다는 이유로 이 토글을
        숨겨 나·라목에서는 ⑳2호가 통째로 빠졌다. 엔진·⑧과 같이 전 목에 띄운다.
      */}
      <ToggleCard
        variant="card"
        size="sm"
        tone="violet"
        data-testid={`rental-requirements-confirmed-${index}`}
        title={
          /**
           * U2 — 말소된 호는 양도일 현재 등록·임대 중일 수 없다. ㉓은 말소 전까지 요건을 갖췄으면 말소 후 임대 중단·
           * 5% 미준수·사업자등록 미유지여도 적용된다(기획재정부 재산세제과-151, 2022.1.24.) — 확인 대상은 말소 전까지다.
           */
          showTermination && unit.rentalAutoTermination
            ? "등록 말소 전까지 임대료 5% 상한, 임대사업자 등록 유지(등록·임대 중), 임대료 증액 후 1년 이내 재증액 금지 요건을 모두 충족했습니다."
            : "임대료 5% 상한, 임대사업자 등록 유지(양도일 현재 등록·임대 중), 임대료 증액 후 1년 이내 재증액 금지 요건을 모두 충족합니다."
        }
        description={
          unit.requirementsConfirmed
            ? undefined
            : (showTermination && unit.rentalAutoTermination
                ? "말소 후 임대를 중단했거나 임대료·사업자등록 요건을 지키지 않았어도 말소 전까지 충족했으면 체크하세요 " +
                  "(소령 §155㉓ · 기획재정부 재산세제과-151). "
                : "") +
              "특례 적용을 위해 위 요건을 확인하고 체크하세요 (소령 §155⑳2호). 5% 상한은 2019년 2월 12일 이후, " +
              "1년 이내 재증액 금지는 2020년 2월 11일 이후 체결·갱신한 임대차계약분부터 적용됩니다(대통령령 제29523호 " +
              "부칙 제6조 · 제30395호 부칙 제16조) — 그 전 계약에서 올린 것은 보지 않고, 2019년 2월 12일 이후 처음 " +
              "체결·갱신한 표준임대차계약이 비교 기준입니다(서면-2020-부동산-3300)."
        }
        trailing={
          <LawArticleModal legalBasis="소득세법 시행령 §155" label="§155⑳" />
        }
        checked={unit.requirementsConfirmed}
        onCheckedChange={(v) => set("requirementsConfirmed", v)}
      />

      {/*
        영 §167의3①1호 — ⑳이 불성립하면 이 호도 다주택 중과 주택 수에 들어간다(결정 #20 C). 지방 3억 이하면 빠진다.
        계산기(`mode="calc"`)는 이 카드를 그리지 않고 판정 메뉴(`facts`)에서 입력한 호를 넘겨받는다(`one-house-judgment-handoff.ts`
        — `assets` 통째 복사). 그래서 판정 메뉴에서도 묻는다.
      */}
      {rentalUnitLowPriceInScope(unit) && (
        <HousingStdPriceLookupField
          label="거주주택 양도일 현재 이 임대주택의 기준시가"
          hint="특례 요건을 갖추지 못하면 양도세 계산기가 다주택 중과를 판정할 때 씁니다 — 지방 주택은 3억원 이하면 주택 수에서 빠집니다(소령 §167의3①1호). 비우면 주택 수에 넣습니다."
          value={unit.officialPriceAtResidenceTransfer ?? ""}
          onChange={(v) => set("officialPriceAtResidenceTransfer", v)}
          jibun={unit.rentalAddressJibun || undefined}
          dong={unit.rentalDong || undefined}
          ho={unit.rentalHo || undefined}
          referenceDate={transferDate}
          testidPrefix={`rental-transfer-stdprice-${index}`}
        />
      )}
    </>
  );
}
