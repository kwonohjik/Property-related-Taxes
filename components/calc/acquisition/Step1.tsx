import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import {
  isDeemedAcquisitionCause,
  type FormState,
} from "./shared";
import { DeemedMajorShareholderSection } from "./deemed/DeemedMajorShareholderSection";
import { DeemedLandCategorySection } from "./deemed/DeemedLandCategorySection";
import { DeemedRenovationSection } from "./deemed/DeemedRenovationSection";
import { InstallmentPaymentsSection } from "./InstallmentPaymentsSection";
import type { InstallmentRow } from "./InstallmentPaymentsSection";

interface Step1Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  /** 시가표준액 단가 (원/㎡) — 토지·농지 전용 */
  standardValuePerSqm?: string;
  onStandardValuePerSqmChange?: (v: string) => void;
  /** 취득일 (공시가격 기준연도 자동 계산용) */
  referenceDate?: string;
  isHousing: boolean;
}

/** form.propertyType → StandardPriceInput propertyKind 변환 */
function toPropertyKind(propertyType: string): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (propertyType === "housing") return "house_apart";
  if (propertyType === "land" || propertyType === "land_farmland") return "land";
  return "building_non_residential";
}

/**
 * Step 1: 물건 상세 — 전용면적·시가표준액·사치성·특수관계인
 * 간주취득 시: Step 1-D 패널로 대체 (과점주주·지목변경·건물 개수)
 * tone: sky (면적·시가표준액) / amber (사치성·특수관계인)
 */
export function Step1({
  form,
  set,
  standardValuePerSqm,
  onStandardValuePerSqmChange,
  referenceDate,
  isHousing,
}: Step1Props) {
  // 간주취득 — Step 1-D 전용 패널로 대체
  const isDeemed = isDeemedAcquisitionCause(form.acquisitionCause);
  if (isDeemed) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-800">
          <span className="font-semibold">간주취득 (§7의2)</span> — 유형별 상세 정보를 입력하세요.
          계산 완료 후 결과에서 산식과 세액을 확인할 수 있습니다.
        </div>
        {form.acquisitionCause === "deemed_major_shareholder" && (
          <DeemedMajorShareholderSection form={form} set={set} />
        )}
        {form.acquisitionCause === "deemed_land_category" && (
          <DeemedLandCategorySection form={form} set={set} />
        )}
        {form.acquisitionCause === "deemed_renovation" && (
          <DeemedRenovationSection form={form} set={set} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 면적·시가표준액 — sky 카드 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700">물건 상세</p>
        </div>

        {isHousing && (
          <div>
            <p className="text-sm font-medium mb-1">전용면적 (㎡)</p>
            <DecimalInput
              value={form.areaSqm}
              onChange={(v) => set("areaSqm", v)}
              placeholder="85㎡ 이하이면 농특세 면제"
              unit="㎡"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium leading-none">
            {isHousing ? "주택공시가격 (시가표준액, 선택)" : "시가표준액 (선택)"}
          </p>
          {["housing", "land", "land_farmland"].includes(form.propertyType) ? (
            <StandardPriceInput
              propertyKind={toPropertyKind(form.propertyType)}
              totalPrice={form.standardValue}
              onTotalPriceChange={(v) => set("standardValue", v)}
              pricePerSqm={standardValuePerSqm}
              onPricePerSqmChange={onStandardValuePerSqmChange}
              jibun={form.jibun}
              referenceDate={referenceDate}
              label=""
              hint="없으면 신고가액으로 과세"
              enableLookup={true}
            />
          ) : (
            <CurrencyInput
              label=""
              value={form.standardValue}
              onChange={(v) => set("standardValue", v)}
              placeholder="없으면 신고가액으로 과세"
            />
          )}
        </div>
      </div>

      {/* 특수 조건 — amber 카드 */}
      <ToggleCard
        tone="amber"
        title="특수관계인 간 거래"
        description="시가 70%~130% 벗어나면 시가 기준 과세"
        checked={form.isRelatedParty}
        onCheckedChange={(v) => set("isRelatedParty", v)}
      >
        <CurrencyInput
          label="시가인정액 (감정가·매매사례가액)"
          value={form.marketValue}
          onChange={(v) => set("marketValue", v)}
          placeholder="시가 기준 금액"
        />
      </ToggleCard>

      {/* 연부 회차 정보 — 매매 + 연부 ON 시만 표시 */}
      {!isDeemedAcquisitionCause(form.acquisitionCause) &&
        form.acquisitionCause === "purchase" &&
        form.isInstallmentAcquisition && (
          <InstallmentPaymentsSection
            installments={(form.installments ?? []) as InstallmentRow[]}
            contractDate={form.installmentContractDate}
            onChange={(rows) => set("installments", rows)}
          />
        )}

      <ToggleCard
        tone="amber"
        title="사치성 재산"
        description="골프장·별장·고급주택·고급오락장·고급선박 — 중과세 적용 (지방세법 §13①)"
        checked={form.isLuxuryProperty}
        onCheckedChange={(v) => set("isLuxuryProperty", v)}
        trailing={
          <TaxHelp
            title="사치성 재산 5종 정의 및 판정 기준"
            summary="사치성 재산은 표준세율 + 8%p 중과. 별장은 2023.3.14부터 폐지."
            details={`## 사치성 재산 5종 (지방세법 §13①)

## 1. 골프장
회원제 골프장 또는 회원제로 운영되는 골프 연습장 (대중 골프장 제외)

## 2. 별장 (2023.3.14 이후 폐지)
주거용 건물로 상시 주거 목적이 아닌 휴양·피서·놀이 용도.
**2023.3.14 이후 취득분은 중과 미적용** (지방세법 §13① 2호 삭제).
2023.3.13 이전 취득분은 여전히 중과 대상.

## 3. 고급주택
다음 중 1세대 1채 소유 기준:
- **1세대 1주택**으로 공시가격 9억 원 초과
- 전용면적 300㎡ 초과 + 공시가격 6억 초과
- 에스컬레이터·67㎡ 이상 수영장 설치

## 4. 고급오락장
카지노·나이트클럽·요정·카바레·무도유흥주점 등 풍속영업 용도 건물

## 5. 고급선박
비업무용 20톤 이상 선박 (레저용)

## 중과 산식
**단독 사치성**: 표준세율 + 중과기준세율(2%) × 400% = 표준세율 + **8%p**
예: 9억 초과 주택 3% → 3% + 8% = **11%**

**사치성 + 다주택 중복** (§13의2③):
다주택 중과세율(8% 또는 12%) + 8%p
예: 조정 3주택 12% + 8% = **20%**`}
            legalBasis="지방세법 제13조 제1항"
          />
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">사치성 재산 유형 선택 (별장은 2023.3.14 이후 폐지)</p>
          <RadioCardGroup
            tone="amber"
            layout="stack"
            name="luxuryType"
            value={form.luxuryType}
            onChange={(v) => set("luxuryType", v)}
            options={[
              { value: "golf_course", label: "골프장" },
              { value: "villa", label: "별장 (2023.3.14 이전 취득분에만 적용)" },
              { value: "luxury_housing", label: "고급주택 (1세대 1채, 공시가격 9억 초과 등)" },
              { value: "luxury_entertainment", label: "고급오락장 (카지노·나이트클럽 등)" },
              { value: "luxury_vessel", label: "고급선박" },
            ]}
          />
        </div>
      </ToggleCard>
    </div>
  );
}
