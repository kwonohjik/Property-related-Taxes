"use client";

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  infoBannerCls,
  selectCls,
  type FormState,
  type OwnedHouseInfo,
  createOwnedHouseInfo,
} from "./shared";

interface Step2Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isHousing: boolean;
  isCorporation: boolean;
  isIndividual: boolean;
}

// ============================================================
// 보유 주택 카드 컴포넌트
// ============================================================

function OwnedHouseCard({
  house,
  index,
  onChange,
  onRemove,
}: {
  house: OwnedHouseInfo;
  index: number;
  onChange: (updated: OwnedHouseInfo) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof OwnedHouseInfo>(k: K, v: OwnedHouseInfo[K]) =>
    onChange({ ...house, [k]: v });

  return (
    <ToneCard
      tone="sky"
      sectionNum={index + 1}
      title={`보유 주택 #${index + 1}`}
      bodyClassName="space-y-3"
      noDark
      titleExtra={
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          삭제
        </button>
      }
    >
      {/* 주택 유형 */}
      <div>
        <p className="text-xs font-medium mb-1">주택 유형</p>
        <select
          className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={house.propertyType}
          onChange={(e) => set("propertyType", e.target.value)}
        >
          <option value="housing">주택 (아파트·단독·연립 등)</option>
          <option value="officetel">주거형 오피스텔</option>
          <option value="right">조합원입주권</option>
          <option value="subscription_right">주택분양권</option>
        </select>
      </div>

      {/* 시가표준액 */}
      <CurrencyInput
        label="시가표준액 (원)"
        value={house.standardValue}
        onChange={(v) => set("standardValue", v)}
        placeholder="주택공시가격·개별공시지가×면적"
      />

      {/* 취득일 */}
      <div>
        <p className="text-xs font-medium mb-1">취득일 (선택)</p>
        <DateInput
          value={house.acquisitionDate}
          onChange={(v) => set("acquisitionDate", v)}
        />
      </div>

      {/* 수도권 여부 */}
      <ToggleCard
        tone="sky"
        size="sm"
        title="수도권 소재"
        description="1억/2억 중과 한도 결정 (수도권 1억 이하 중과 배제)"
        checked={house.isMetropolitanRegion}
        onCheckedChange={(v) => set("isMetropolitanRegion", v)}
      />

      {/* 정비구역 여부 */}
      <ToggleCard
        tone="rose"
        size="sm"
        title="정비구역 소재"
        description="재개발·재건축·소규모정비 — 1억/2억 이하 중과 배제 불가"
        checked={house.isUrbanRegenArea}
        onCheckedChange={(v) => set("isUrbanRegenArea", v)}
      />

      {/* 상속 주택 */}
      <ToggleCard
        tone="violet"
        size="sm"
        title="상속으로 취득한 주택"
        description="5년 미경과 시 주택 수에서 제외 (시행령 §28의4⑥3호)"
        checked={house.isInherited}
        onCheckedChange={(v) => set("isInherited", v)}
      >
        <div>
          <p className="text-xs font-medium mb-1">상속개시일</p>
          <DateInput
            value={house.inheritanceDate}
            onChange={(v) => set("inheritanceDate", v)}
          />
        </div>
        <div className="space-y-1 mt-2">
          <p className="text-xs font-medium">주된 상속자 판정</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-muted-foreground block mb-0.5">본인 지분</label>
              <input
                type="number" min="0" max="1" step="0.01"
                className="block w-full rounded border border-input px-2 py-1 text-sm"
                value={house.shareInInheritance}
                onChange={(e) => set("shareInInheritance", e.target.value)}
                placeholder="지분 (0~1)"
              />
            </div>
            <div>
              <label className="text-muted-foreground block mb-0.5">최대 지분</label>
              <input
                type="number" min="0" max="1" step="0.01"
                className="block w-full rounded border border-input px-2 py-1 text-sm"
                value={house.maxShareInInheritors}
                onChange={(e) => set("maxShareInInheritors", e.target.value)}
                placeholder="지분 (0~1)"
              />
            </div>
          </div>
          <ToggleCard
            tone="violet"
            size="sm"
            title="동순위 시 거주자 여부"
            description="최다지분 동순위 시 거주자가 주된 상속자로 우선"
            checked={house.isResident}
            onCheckedChange={(v) => set("isResident", v)}
          />
          {/* 거주자가 아닌 경우에만 최연장자 여부 표시 — 거주자이면 이미 주된 상속자 */}
          {!house.isResident && (
            <ToggleCard
              tone="violet"
              size="sm"
              title="동순위 상속자 중 최연장자"
              description="공동상속에서 지분이 같은 경우, 거주자 → 최연장자 순으로 주된 상속자를 결정합니다 (시행령 §28의4⑤)"
              checked={house.isOldest}
              onCheckedChange={(v) => set("isOldest", v)}
            />
          )}
        </div>
      </ToggleCard>

      {/* 공유지분 */}
      <ToggleCard
        tone="sky"
        size="sm"
        title="공유지분 소유"
        description="1세대 내 공유 → 1주택 / 별도세대 공유 → 각자 1주택"
        checked={parseFloat(house.ownershipShare) < 1}
        onCheckedChange={(v) => set("ownershipShare", v ? "0.5" : "1")}
      >
        <div>
          <label className="text-xs font-medium block mb-1">지분율 (0~1)</label>
          <input
            type="number" min="0.01" max="0.99" step="0.01"
            className="block w-full rounded border border-input px-2 py-1 text-sm"
            value={house.ownershipShare}
            onChange={(e) => set("ownershipShare", e.target.value)}
            placeholder="지분율 (0~1)"
          />
        </div>
        <ToggleCard
          tone="sky"
          size="sm"
          title="공동소유자 모두 동일 1세대"
          description="1세대 내 공유 → 1주택으로 산정 (§28의4④)"
          checked={house.coOwnersAllInHousehold}
          onCheckedChange={(v) => set("coOwnersAllInHousehold", v)}
        />
      </ToggleCard>

      {/* 한시 특례 */}
      <ToggleCard
        tone="violet"
        size="sm"
        title="한시 특례 해당 (주택 수 제외)"
        description="2024.1.10~2027.12.31 신축 60㎡·3억(수도권 6억) 이하 등"
        checked={house.isHansiBenefit}
        onCheckedChange={(v) => set("isHansiBenefit", v)}
      >
        <RadioCardGroup
          tone="violet"
          layout="stack"
          name={`hansiBenefitType-${house.id}`}
          value={house.hansiBenefitType}
          onChange={(v) => set("hansiBenefitType", v)}
          options={[
            { value: "new_build", label: "신축 60㎡·3억(수도권 6억) 이하 (§28의4② 1호)" },
            { value: "lease_registered", label: "유상승계 + 임대사업자 등록 (§28의4② 2호)" },
            { value: "unsold_apt", label: "미분양 아파트 수도권 외 85㎡·6억 이하 (§28의4② 3호)" },
          ]}
        />
      </ToggleCard>
    </ToneCard>
  );
}

// ============================================================
// Step 2 메인
// ============================================================

/**
 * Step 2: 주택 현황
 * - 보유 주택 카드 배열 (시가표준액·종류·한시특례·상속·공유지분)
 * - 세대 별도 인정 4종
 * tone: sky (보유 주택) / violet (세대 별도)
 */
export function Step2({
  form,
  set,
  isHousing,
  isCorporation,
  isIndividual,
}: Step2Props) {
  const [nextId, setNextId] = useState(() => Date.now());

  if (!isHousing) {
    return (
      <div className={infoBannerCls}>
        주택 이외 물건은 조정대상지역 다주택 중과 조건이 적용되지 않습니다.
        기본세율이 자동 적용됩니다.
      </div>
    );
  }

  const addHouse = () => {
    const newId = `h-${nextId}`;
    setNextId(nextId + 1);
    const updated = [...form.ownedHouses, createOwnedHouseInfo(newId)];
    set("ownedHouses", updated);
  };

  const updateHouse = (idx: number, updated: OwnedHouseInfo) => {
    const arr = [...form.ownedHouses];
    arr[idx] = updated;
    set("ownedHouses", arr);
  };

  const removeHouse = (idx: number) => {
    const arr = form.ownedHouses.filter((_, i) => i !== idx);
    set("ownedHouses", arr);
  };

  return (
    <div className="space-y-4">
      {/* 취득일 기준 anchor 배너 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-xs text-sky-800">
        <span className="font-semibold">취득일 기준</span>으로 보유 주택만 카운트합니다.
        잔금일 또는 등기접수일 중 빠른 날이 취득일입니다.
        분양권·입주권은 <span className="font-semibold">권리취득일(분양계약일)</span> 기준으로 소급 산정됩니다.
      </div>

      {/* 법인 안내 */}
      {isCorporation && (
        <div className={infoBannerCls}>
          <strong>법인 주택 취득 안내</strong><br />
          법인의 주택 유상취득에는 <strong>12% 중과세율</strong>이 적용됩니다 (지방세법 §13의2).
          아래 주택 수·조정지역 설정에 관계없이 법인 중과가 우선 적용됩니다.
        </div>
      )}

      {/* 취득 후 보유 주택 수 */}
      <ToneCard
        tone="sky"
        sectionNum={1}
        title="취득 후 보유 주택 수"
        bodyClassName="space-y-2"
        noDark
        titleExtra={
          <TaxHelp
            title="보유 주택 수 산정 — 11개 제외 항목"
            summary="취득일 기준 보유 주택(취득 포함). 아래 11종은 주택 수 산정에서 제외됩니다."
            details={`## 주택 수 산정 기준 (지방세법 시행령 §28의4)
**취득일(잔금일)** 기준으로 1세대가 보유한 주택 수를 산정합니다.
분양권으로 취득 시 **권리취득일(분양계약일)** 기준.

## 주택 수 제외 11종 (시행령 §28의2·§28의4⑥)
- 시가표준액 **수도권 1억 이하 / 비수도권 2억 이하** (정비구역 제외)
- 노인복지주택 (1년 내 직접 사용)
- 공공지원민간임대주택 (임대사업자 등록)
- 가정어린이집 (1년 내 직접 사용)
- 사원 임대용 60㎡ 공동주택
- 문화유산·천연기념물
- 멸실 목적 주택 (3년 내 멸실, 7년 내 신축)
- 농어촌 주택 (660㎡·150㎡·6,500만 이내)
- **상속 5년 미경과** 주택·입주권·분양권·오피스텔
- **2024.1.10~2027.12.31 신축 60㎡·3억(수도권 6억) 이하** 소형주택 (한시)
- 미분양 아파트 수도권 외 85㎡·6억 이하 (2024~2025 한시)

## 세대 기준
배우자 + 미혼 30세 미만 자녀 + 부모가 **동일 1세대**.
별도 세대 인정 4종은 다음 단계에서 확인하세요.`}
            legalBasis={["지방세법시행령 제28조의4", "지방세법시행령 제28조의2"]}
          />
        }
      >
        <select
          className={selectCls}
          value={form.houseCountAfter}
          onChange={(e) => set("houseCountAfter", e.target.value)}
        >
          <option value="1">1주택 (기본세율)</option>
          <option value="2">2주택</option>
          <option value="3">3주택</option>
          <option value="4">4주택 이상</option>
        </select>
        <p className="text-xs text-muted-foreground">
          취득일 기준 보유 주택(취득 대상 포함)의 합계. 상세 주택 목록을 아래에 입력하면 자동 산정됩니다.
        </p>
      </ToneCard>

      {/* 보유 주택 목록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">보유 주택 목록 <span className="text-muted-foreground font-normal">(선택)</span></p>
          <p className="text-xs text-muted-foreground">
            입력 시 주택 수 자동 산정 (상속·한시 특례 제외 반영)
          </p>
        </div>

        {form.ownedHouses.map((h, i) => (
          <OwnedHouseCard
            key={h.id}
            house={h}
            index={i}
            onChange={(updated) => updateHouse(i, updated)}
            onRemove={() => removeHouse(i)}
          />
        ))}

        <button
          type="button"
          onClick={addHouse}
          className="w-full rounded-lg border-2 border-dashed border-sky-300 py-2 text-sm text-sky-700 hover:bg-sky-50/50 transition-colors"
        >
          + 보유 주택 추가
        </button>
      </div>

      {/* 세대 별도 인정 — violet */}
      <ToggleCard
        tone="violet"
        title="세대 별도 인정"
        description="동일 세대원도 별도 세대로 인정되는 경우 — 시행령 §28의3②"
        checked={!!form.separateHouseholdReason}
        onCheckedChange={(v) => set("separateHouseholdReason", v ? "under30_income" : "")}
        trailing={
          <TaxHelp
            title="세대 별도 인정 4종 (시행령 §28의3②)"
            summary="동일 세대원도 4가지 조건 중 하나를 충족하면 별도 세대로 인정됩니다."
            details={`## 세대 별도 인정 4종 (시행령 §28의3②)

## 1호 — 30세 미만 소득 충족 자녀
- 연간 소득 ≥ 기준중위소득 40% (2025년 기준 약 92만 원/월)
- 독립 생계 유지
- **미성년자는 소득 충족 시에도 별도 세대 인정 불가** (강조)

## 2호 — 65세 이상 직계존속 동거봉양 합가
부모·조부모와 합가한 경우 별도 세대로 인정

## 3호 — 90일 이상 출국
해외 체류 90일 이상이면 별도 세대로 인정

## 4호 — 취득 후 60일 이내 주소 분리
취득 후 60일 이내에 주소를 다른 곳으로 이전하면 별도 세대

## 실무 주의사항
세대 별도 인정은 **납세자가 증빙을 갖춰야** 합니다.
단순 주소지 차이만으로는 인정되지 않으며, 실제 독립 생계 여부가 중요합니다.`}
            legalBasis="지방세법시행령 제28조의3 제2항"
          />
        }
      >
        <RadioCardGroup
          tone="violet"
          layout="stack"
          name="separateHouseholdReason"
          value={form.separateHouseholdReason}
          onChange={(v) => set("separateHouseholdReason", v)}
          options={[
            {
              value: "under30_income",
              label: "30세 미만 소득 충족 자녀 (미성년 제외)",
              description: "12개월 소득 ≥ 기준중위소득 40% + 독립 생계 (§28의3②1호)",
            },
            {
              value: "over65_cohabitation",
              label: "65세 이상 직계존속 동거봉양 합가 (§28의3②2호)",
            },
            {
              value: "overseas_90days",
              label: "90일 이상 출국 (§28의3②3호)",
            },
            {
              value: "relocate_60days",
              label: "취득 후 60일 이내 주소 분리 (§28의3②4호)",
            },
          ]}
        />
        <p className="text-xs text-muted-foreground mt-2">
          미성년자는 소득 충족 시에도 별도 세대 인정 불가 (§28의3②1호 단서)
        </p>
      </ToggleCard>

      {/* 신탁재산 위탁자 주택 */}
      <ToggleCard
        tone="sky"
        title="신탁재산 위탁자 주택 가산"
        description="위탁자 명의의 신탁 주택은 본인 보유로 간주 (§13의3①1호)"
        checked={parseInt(form.trustedHouseCount) > 0}
        onCheckedChange={(v) => set("trustedHouseCount", v ? "1" : "0")}
      >
        <div>
          <label className="text-xs font-medium block mb-1">신탁 주택 수</label>
          <input
            type="number" min="1"
            className="block w-full rounded border border-input px-2 py-1.5 text-sm"
            value={form.trustedHouseCount}
            onChange={(e) => set("trustedHouseCount", e.target.value)}
          />
        </div>
      </ToggleCard>

      {/* 분양권·입주권으로 취득 */}
      <ToggleCard
        tone="violet"
        title="분양권·입주권으로 주택 취득"
        description="권리취득일 기준 주택 수 소급 산정 (§28의4①)"
        checked={form.acquiredViaRight}
        onCheckedChange={(v) => set("acquiredViaRight", v)}
      >
        <div>
          <label className="text-xs font-medium block mb-1">권리취득일 (분양계약일)</label>
          <DateInput
            value={form.rightAcquisitionDate}
            onChange={(v) => set("rightAcquisitionDate", v)}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          분양권으로 등기 시 잔금일이 아닌 권리취득일 기준 보유 주택 수로 산정합니다.
        </p>
      </ToggleCard>

      {/* 취득 주택 자체 한시 특례 */}
      <ToneCard
        tone="violet"
        sectionNum={3}
        title="취득 주택 한시 특례 (주택 수 제외)"
        bodyClassName="space-y-2"
        noDark
        titleExtra={
          <TaxHelp
            title="한시 특례 — 주택 수 제외 (시행령 §28의4②)"
            summary="2024.1.10~2027.12.31 신축 소형주택 등 취득 시 해당 주택은 주택 수에서 제외됩니다."
            details={`## 한시 특례 3종 (시행령 §28의4②)

## 1호 — 신축 소형주택 (2024.1.10~2027.12.31)
- 신축 다가구·연립·다세대·도시형생활주택
- **전용면적 60㎡ 이하**
- 취득가액 **3억 원 이하** (수도권 6억 원 이하)
- 다가구 판정: 건축물대장에 **호수별 전용면적이 구분 기재**된 경우

## 2호 — 유상승계 임대등록 (2024.1.10~2027.12.31)
- 유상승계 취득
- 60일 이내 임대사업자 등록
- 전용면적 60㎡ 이하, 취득가액 3억(수도권 6억) 이하

## 3호 — 미분양 아파트 (2024.1.10~2025.12.31)
- 수도권 외 지역
- 전용면적 85㎡ 이하
- 취득가액 6억 원 이하

## 주의사항
한시 특례 주택은 **취득하는 주택 자체**가 해당될 때만 적용.
보유 중인 기존 주택의 한시 특례 해당 여부는 위 보유 주택 목록에서 입력.`}
            legalBasis="지방세법시행령 제28조의4 제2항"
          />
        }
      >
        <p className="text-xs text-muted-foreground">
          취득하는 주택 자체가 한시 특례 대상이면 보유 주택 수 산정에서 제외됩니다 (§28의4②)
        </p>
        <ToggleCard
          tone="violet"
          size="sm"
          title="신축 소형주택 (§28의4② 1호)"
          description="2024.1.10~2027.12.31 신축 / 60㎡·3억(수도권 6억) 이하 다가구·연립·다세대·도시형생활주택"
          checked={form.isHansiBenefitNewBuild}
          onCheckedChange={(v) => set("isHansiBenefitNewBuild", v)}
        >
          <ToggleCard
            tone="violet"
            size="sm"
            title="건축물대장에 호수별 전용면적 구분 기재"
            description="다가구주택 60㎡ 판정 필수 조건"
            checked={form.isMultiHouseholdWithUnitArea}
            onCheckedChange={(v) => set("isMultiHouseholdWithUnitArea", v)}
          />
        </ToggleCard>
        <ToggleCard
          tone="violet"
          size="sm"
          title="유상승계 임대등록 (§28의4② 2호)"
          description="2024.1.10~2027.12.31 유상승계 + 임대사업자 등록 / 60㎡·3억(수도권 6억) 이하"
          checked={form.isHansiBenefitLeaseRegistered}
          onCheckedChange={(v) => set("isHansiBenefitLeaseRegistered", v)}
        />
        <ToggleCard
          tone="violet"
          size="sm"
          title="미분양 아파트 (§28의4② 3호)"
          description="2024.1.10~2025.12.31 수도권 외 85㎡·6억 이하 미분양 아파트"
          checked={form.isHansiBenefitUnsoldApt}
          onCheckedChange={(v) => set("isHansiBenefitUnsoldApt", v)}
        />
      </ToneCard>
    </div>
  );
}
