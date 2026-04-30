"use client";

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import { DateInput } from "@/components/ui/date-input";
import {
  infoBannerCls,
  type FormState,
} from "./shared";

interface Step4Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isHousing: boolean;
  isCorporation: boolean;
  isLand: boolean;
}

/**
 * Step 4: 법인·특수 분기
 * - 사치성 + 대도시 법인 중복 (§13⑦)
 * - 법인·공장 중과 (§13①②)
 * - 세율특례 §15 (9종)
 * - 비법인 + 비사치성 케이스: 자동 skip 안내
 * tone: rose (사치성·법인 중과) / violet (세율특례)
 */
export function Step4({
  form,
  set,
  isHousing,
  isCorporation,
  isLand,
}: Step4Props) {
  const isLuxury = form.isLuxuryProperty;
  const hasCorpMetroContext = isCorporation;
  const hasSpecialRateContext = form.acquisitionCause !== "purchase" ||
    form.specialRateType !== "";

  // 모두 해당 없는 경우 — 간소 안내
  if (!isLuxury && !isCorporation && !hasSpecialRateContext) {
    return (
      <div className={infoBannerCls}>
        사치성 재산·법인·세율특례에 해당하지 않아 이 단계를 건너뜁니다.
        <br />
        다음 단계에서 감면 조건을 확인하세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 사치성 + 대도시 법인 중복 §13⑦ */}
      {isLuxury && isCorporation && (
        <ToggleCard
          tone="rose"
          title="사치성 + 대도시 법인 중복 중과 (§13⑦)"
          description="사치성 재산 + 대도시 법인 중과(§13②) 동시 적용 시 별도 산식"
          checked={form.isCorpMetroSurcharge}
          onCheckedChange={(v) => set("isCorpMetroSurcharge", v)}
        >
          <div className="rounded-md bg-rose-50/70 border border-rose-200 p-2 text-xs text-rose-700 space-y-1">
            <p>주택: 기본세율 + 12%p (§13⑦ 단서 — 예: 9억 초과 3% → 15%)</p>
            <p>주택 외: 기본세율 × 3 + 4%p (예: 토지 4% → 16%)</p>
          </div>
        </ToggleCard>
      )}

      {/* 법인·공장 중과 §13①② */}
      {isCorporation && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">1</span>
            <p className="text-xs font-semibold text-rose-700">법인·공장 중과 (§13①②)</p>
            <TaxHelp
              title="본점·주사무소 중과 vs 산업단지 (§13①②)"
              summary="과밀억제권역 내 본점·주사무소 신증축은 표준세율+4%p. 산업단지는 제외."
              details={`## 과밀억제권역 대도시 법인 중과 (지방세법 §13①②)

## §13① — 본점·주사무소 신증축 (1호)
과밀억제권역 내 본점·주사무소 용도로 부동산을 신축·증축:
- **세율: 표준세율 + 중과기준세율(2%) × 200% = 표준세율 + 4%p**
- 예: 토지 4% → 8%, 건물 신축 2.8% → 6.8%

## §13① — 비도시형 공장 신증설 (2호)
산업단지 외 지역에 공장 신증설:
- 토지 매매: 4% + 4%p = **8%**
- 건물 원시취득: 2.8% + 4%p = **6.8%**
- 토지·건물 분리 과세

## §13② — 대도시 법인 (설립 5년 이내)
과밀억제권역 내 법인 설립·전입 후 5년 이내:
- **세율: 표준세율 × 3 (중과기준세율 × 200% 공제)**
- 예: 토지 4% × 3 = **12%**

## 산업단지 제외
산업입지법에 따른 산업단지 소재 법인은 §13②단서 적용 — 중과 배제.

## §13⑦ 사치성+대도시 법인 중복
- 주택: 기본세율 + 12%p
- 주택 외: 기본세율 × 3 + 4%p`}
              legalBasis={["지방세법 제13조 제1항", "지방세법 제13조 제2항"]}
            />
          </div>

          {/* 과밀억제권역 */}
          <ToggleCard
            tone="rose"
            title="과밀억제권역 소재"
            description="수도권정비계획법 §6①1호 — 대도시 법인 중과의 전제 조건"
            checked={form.isMetropolitanCongestion}
            onCheckedChange={(v) => set("isMetropolitanCongestion", v)}
          />

          {/* 본점·주사무소 신증축 */}
          {form.isMetropolitanCongestion && (
            <ToggleCard
              tone="rose"
              size="sm"
              title="본점·주사무소 신증축 용도 (§13①1호)"
              description="과밀억제권역 내 본점·주사무소 신증축 → 표준세율 + 4%p"
              checked={form.isHeadquarterNewBuild}
              onCheckedChange={(v) => set("isHeadquarterNewBuild", v)}
            />
          )}

          {/* 비도시형 공장 */}
          <ToggleCard
            tone="rose"
            title="비도시형 공장 신증설 (§13①2호)"
            description="산업단지 외 비도시형 공장 신증설 — 토지·건물 세율 분리 적용"
            checked={form.isNonUrbanFactory}
            onCheckedChange={(v) => set("isNonUrbanFactory", v)}
          >
            <div>
              <p className="text-xs font-medium mb-1">공장 구성요소</p>
              <RadioCardGroup
                tone="rose"
                layout="inline"
                name="factoryComponent"
                value={form.factoryComponent}
                onChange={(v) => set("factoryComponent", v)}
                options={[
                  { value: "land", label: "토지 (매매 4% + 4%p = 8%)" },
                  { value: "building", label: "건물 (원시 2.8% + 4%p = 6.8%)" },
                  { value: "combined", label: "토지+건물 합산" },
                ]}
              />
            </div>
          </ToggleCard>

          {/* 5년 이내 법인 */}
          {form.isMetropolitanCongestion && (
            <ToggleCard
              tone="rose"
              size="sm"
              title="법인 설립·대도시 전입 후 5년 이내 (§13②)"
              description="대도시 법인 표준세율 × 3 중과 적용"
              checked={form.isWithin5YearsOfEstablishment}
              onCheckedChange={(v) => set("isWithin5YearsOfEstablishment", v)}
            />
          )}

          {/* 중과제외업종 */}
          <ToggleCard
            tone="violet"
            title="§13②단서 중과제외업종"
            description="사회기반시설·은행업·해외건설 등 9종 — 법인 대도시 중과 적용 제외"
            checked={!!form.excludedBusinessType}
            onCheckedChange={(v) => set("excludedBusinessType", v ? "infrastructure" : "")}
          >
            <RadioCardGroup
              tone="violet"
              layout="stack"
              name="excludedBusinessType"
              value={form.excludedBusinessType}
              onChange={(v) => set("excludedBusinessType", v)}
              options={[
                { value: "infrastructure", label: "사회기반시설사업" },
                { value: "bank", label: "은행업" },
                { value: "overseas_construction", label: "해외건설업" },
                { value: "housing_construction", label: "주택건설업 (주택법§4)" },
                { value: "telecom", label: "전기통신업" },
                { value: "high_tech", label: "첨단기술업" },
                { value: "distribution", label: "유통산업" },
                { value: "transport", label: "운송사업" },
                { value: "gov_funded", label: "국가출자 20% 이상" },
              ]}
            />
          </ToggleCard>

          {/* 휴면법인 */}
          <ToggleCard
            tone="rose"
            title="휴면법인 인수"
            description="과점주주 도달 시점 = 법인 설립 시점 기산 — 5년 이내로 간주"
            checked={form.isDormantCorpAcquisition}
            onCheckedChange={(v) => set("isDormantCorpAcquisition", v)}
          >
            <div>
              <p className="text-xs font-medium mb-1">휴면법인 유형</p>
              <RadioCardGroup
                tone="rose"
                layout="stack"
                name="dormantCorpType"
                value={form.dormantCorpType}
                onChange={(v) => set("dormantCorpType", v)}
                options={[
                  { value: "dissolved", label: "해산 법인" },
                  { value: "deemed_dissolved", label: "해산간주 법인" },
                  { value: "closed", label: "폐업 법인" },
                  { value: "re_registered_1yr", label: "폐업 후 재사업자등록 1년 이내" },
                  { value: "no_continue_reg_1yr", label: "계속등기 없이 1년 경과" },
                  { value: "officer_50pct_change", label: "임원 50% 이상 교체" },
                ]}
              />
            </div>

            {/* 과점주주 도달일 — 휴면법인 인수 시 5년 기산 기준 */}
            {form.isDormantCorpAcquisition && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-medium">과점주주 도달일 (선택)</p>
                  <TaxHelp
                    title="과점주주 도달일 (지방세법시행령 §28의3①)"
                    summary="과점주주 도달 시점을 법인 설립 시점으로 간주하여 5년을 기산합니다."
                    details={`## 과점주주 도달일 (지방세법시행령 §28의3①)
과점주주가 된 날부터 소급하여 5년 이내에 법인이 설립된 것으로 간주합니다.
따라서 과점주주 도달일이 기준이 되어 5년 이내 취득으로 처리됩니다.`}
                    legalBasis="지방세법시행령 제28조의3 제1항"
                  />
                </div>
                <DateInput
                  value={form.majorShareholderDate ?? ""}
                  onChange={(v) => set("majorShareholderDate", v)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  입력 시 과점주주 도달일 기준으로 5년 이내 취득으로 처리됩니다.
                </p>
              </div>
            )}
          </ToggleCard>
        </div>
      )}

      {/* 세율특례 §15 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">2</span>
          <p className="text-xs font-semibold text-violet-700">세율특례 §15 (9종)</p>
        </div>
        <p className="text-xs text-muted-foreground">
          해당 시 기본세율에서 중과기준세율(2%) 차감 적용
        </p>
        <ToggleCard
          tone="violet"
          title="세율특례 §15 해당"
          description="환매권·상속 1가구1주택·법인합병·공유물분할·건물이전 등"
          checked={!!form.specialRateType}
          onCheckedChange={(v) => set("specialRateType", v ? "inheritance_one_house" : "")}
        >
          <RadioCardGroup
            tone="violet"
            layout="stack"
            name="specialRateType"
            value={form.specialRateType}
            onChange={(v) => set("specialRateType", v)}
            options={[
              { value: "redemption", label: "환매권 행사 (§15①1호)" },
              { value: "inheritance_one_house", label: "상속 1가구 1주택 (§15①2호)" },
              { value: "corp_merger", label: "법인 적격합병·적격분할 (§15①3·4호)" },
              { value: "co_ownership_split", label: "공유물·합유물·총유물 분할 (§15①5호)" },
              { value: "building_relocation", label: "건물 이전 (§15①6호 전단)" },
              { value: "divorce_division", label: "이혼 재산분할 (§15①6호)" },
              { value: "hoyu_division", label: "가류 공유물 분할 (§15①7호)" },
              { value: "timber", label: "임목 취득 (§15①8호)" },
              { value: "leasing", label: "임차권 취득 후 소유 (§15①9호)" },
            ]}
          />

          {/* 상속 1가구 1주택 상세 */}
          {form.specialRateType === "inheritance_one_house" && (
            <div className="mt-2 space-y-2">
              <ToggleCard
                tone="violet"
                size="sm"
                title="1가구 1주택 충족"
                description="상속인이 상속 개시일 현재 1가구 1주택자인 경우 (지법 §15①2호)"
                checked={form.isOneHouseHousehold}
                onCheckedChange={(v) => set("isOneHouseHousehold", v)}
              />
              <ToggleCard
                tone="violet"
                size="sm"
                title="자경농지 상속 특례"
                description="피상속인이 자경한 농지 상속 (§11①5 단서 — 3%→2%)"
                checked={form.isSelfCultivatedFarmlandInheritance}
                onCheckedChange={(v) => set("isSelfCultivatedFarmlandInheritance", v)}
              />
            </div>
          )}
        </ToggleCard>
      </div>
    </div>
  );
}
