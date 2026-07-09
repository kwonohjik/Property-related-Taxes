"use client";

import { useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import {
  infoBannerCls,
  warnBannerCls,
  type FormState,
} from "./shared";

interface Step3Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isHousing: boolean;
  isIndividual: boolean;
  isCorporation: boolean;
  isGiftLike: boolean;
}

/**
 * Step 3: 지역·중과 분기
 * - 조정대상지역·수도권 여부
 * - 시가표준액 1억/2억 이하 중과 배제
 * - 일시적 2주택
 * - §13의2④ 지정 전 계약 보호
 * - 무상취득 단서
 * tone: rose (조정지역·중과 관련)
 */
export function Step3({
  form,
  set,
  isHousing,
  isIndividual,
  isCorporation,
  isGiftLike,
}: Step3Props) {
  const houseCount = parseInt(form.houseCountAfter) || 1;
  const isMultiHouse = houseCount >= 2;

  // [Phase 6] 조정대상지역 자동 조회
  const [autoCheckLoading, setAutoCheckLoading] = useState(false);
  const [autoCheckMsg, setAutoCheckMsg] = useState<string | null>(null);
  const acquisitionDate = form.balancePaymentDate || form.contractDate || "";
  const canAutoCheck = !!form.jibun && !!acquisitionDate;

  const handleAutoCheck = async () => {
    if (!canAutoCheck) return;
    setAutoCheckLoading(true);
    setAutoCheckMsg(null);
    try {
      const res = await fetch("/api/address/regulated-area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.jibun,
          transferDate: acquisitionDate,
          acquisitionDate,
        }),
      });
      if (!res.ok) throw new Error("조회 실패");
      const data = await res.json() as {
        isRegulatedAtTransfer: boolean;
        transferBasis: string;
        confidence: "high" | "medium" | "low";
      };
      set("isRegulatedArea", data.isRegulatedAtTransfer);
      const confidence = data.confidence === "high" ? "높음" : data.confidence === "medium" ? "중간" : "낮음";
      setAutoCheckMsg(
        `자동 조회 완료 — ${data.isRegulatedAtTransfer ? "조정대상지역" : "비조정대상지역"} (신뢰도 ${confidence}). 직접 수정 가능합니다.`
      );
    } catch {
      setAutoCheckMsg("자동 조회에 실패했습니다. 직접 선택해 주세요.");
    } finally {
      setAutoCheckLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!isHousing && (
        <div className={infoBannerCls}>
          주택 이외 물건은 다주택 중과 조건이 적용되지 않습니다.
          <br />
          기본세율이 자동 적용됩니다. 사치성 재산 중과(§13⑤)만 해당될 수 있습니다.
        </div>
      )}

      {/* 조정대상지역 */}
      {/* [Phase 6] 자동 조회 버튼 — 소재지 지번 + 취득일 있을 때 활성 */}
      {canAutoCheck && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            onClick={handleAutoCheck}
            disabled={autoCheckLoading}
          >
            {autoCheckLoading ? "조회 중..." : "조정대상지역 자동 조회"}
          </button>
          {autoCheckMsg && (
            <span className="text-xs text-muted-foreground">{autoCheckMsg}</span>
          )}
        </div>
      )}
      <ToggleCard
        tone="rose"
        title="조정대상지역 내 주택"
        description="국토교통부 고시 조정대상지역 소재 — 다주택 중과 여부 결정에 중요"
        checked={form.isRegulatedArea}
        onCheckedChange={(v) => { set("isRegulatedArea", v); setAutoCheckMsg(null); }}
        trailing={
          <TaxHelp
            title="조정대상지역 — 지정 현황 및 변동 이력"
            summary="국토교통부가 고시한 조정대상지역 소재 주택 취득 시 2주택 8%, 3주택+ 12% 중과."
            details={`## 현재 조정대상지역 (2025년 기준)
**서울 전 지역** (25개 자치구)
**경기**: 과천, 성남 분당·수정·중원, 하남, 광명

비조정지역으로 해제된 지역은 중과 미적용.
취득 시점의 지정 여부로 판단 — 계약 후 해제되어도 잔금일 기준.

## 시점별 중과 변동 이력
- ~2022.5.9: 조정지역 다주택 중과 적용
- 2022.5.10~: 일시적 2주택 처분기한 조정+조정 1년 → 2년
- 2023.2.28~: 조정+조정 처분기한 3년 (완화)
- 2023.1.5~: 일부 지역 해제 (인천 연수·남동·서·미추홀·부평, 성남 일부 등)

## §13의2④ 지정 전 계약 보호
조정지역 지정고시일 **이전에** 매매계약 + 계약금 납부 증빙 보유 시 비조정지역 취득으로 간주.
이 경우 다주택 중과 미적용.`}
            legalBasis={["지방세법 제13조의2", "지방세법시행령 제28조의5"]}
          />
        }
      />

      {/* 수도권 여부 */}
      <ToggleCard
        tone="rose"
        title="수도권 소재"
        description="수도권(서울·경기·인천) 소재 — 시가표준액 중과 배제 한도 1억 / 비수도권 2억"
        checked={form.isMetropolitanRegion}
        onCheckedChange={(v) => set("isMetropolitanRegion", v)}
      />

      {/* 다주택 중과 안내 */}
      {isHousing && isMultiHouse && isIndividual && (
        <div className={form.isRegulatedArea ? warnBannerCls : infoBannerCls}>
          {form.isRegulatedArea ? (
            houseCount === 2
              ? "조정대상지역 내 2주택 취득 — 8% 중과세율 적용 예정 (지방세법 §13의2①2호)"
              : "조정대상지역 내 3주택 이상 취득 — 12% 중과세율 적용 예정 (§13의2①3호)"
          ) : (
            houseCount >= 4
              ? "비조정지역 4주택 이상 — 12% 중과세율 적용 예정 (§13의2①3호)"
              : houseCount >= 3
              ? "비조정지역 3주택 — 8% 중과세율 적용 예정 (§13의2①2호)"
              : "비조정지역 2주택 — 기본세율 적용 (중과 미해당)"
          )}
        </div>
      )}

      {/* 시가표준액 1억/2억 이하 배제 */}
      {isHousing && isMultiHouse && (
        <ToggleCard
          tone="rose"
          title="시가표준액 1억/2억 이하 중과 배제"
          description="전체 주택 시가표준액이 수도권 1억 / 비수도권 2억 이하이면 다주택 중과 배제 (시행령 §28의2①1호)"
          checked={!!form.wholeHouseStandardValue && parseFloat(form.wholeHouseStandardValue.replace(/,/g, "")) > 0}
          onCheckedChange={(v) => {
            if (!v) set("wholeHouseStandardValue", "");
          }}
          trailing={
            <TaxHelp
              title="시가표준액 중과 배제 기준 (시행령 §28의2①1호)"
              summary="수도권 1억 이하 / 비수도권 2억 이하인 주택은 다주택 중과 배제. 전체 주택 기준."
              details={`## 이중 기준 (2021년 법 개정)
- **수도권** (서울·경기·인천): 시가표준액 **1억 원 이하**
- **비수도권** (그 외 지역): 시가표준액 **2억 원 이하**

## 전체 주택 기준
지분 취득·부속토지만 소유 시 — **전체 주택의 시가표준액**으로 판단.
내 지분 기준이 아님에 주의.

## 정비구역 제외
재개발·재건축·소규모정비구역 내 주택은 시가표준액 한도 미적용.
해당 구역 내에서는 1억/2억 이하여도 중과 적용.

## 적용 효과
중과 배제 → 다주택이어도 기본세율(1~4%) 적용.
단, 사치성 재산 중과(§13⑤)는 별도 적용.`}
              legalBasis="지방세법시행령 제28조의2 제1항 제1호"
            />
          }
        >
          <CurrencyInput
            label="전체 주택 시가표준액"
            value={form.wholeHouseStandardValue}
            onChange={(v) => set("wholeHouseStandardValue", v)}
            placeholder="지분·부속토지 취득 시 전체 주택 기준"
          />
          <ToggleCard
            tone="rose"
            size="sm"
            title="정비구역 소재"
            description="재개발·재건축·소규모정비 구역은 1억/2억 배제 불가"
            checked={form.isUrbanRegenerationArea}
            onCheckedChange={(v) => set("isUrbanRegenerationArea", v)}
          />
        </ToggleCard>
      )}

      {/* 일시적 2주택 */}
      {isHousing && houseCount === 2 && isIndividual && (
        <ToggleCard
          tone="rose"
          title="일시적 2주택 (중과 배제)"
          description="종전 주택 처분 예정 — 처분기한 내 처분 시 중과 미적용 (시행령 §28의5)"
          checked={form.isTemporaryTwoHouse}
          onCheckedChange={(v) => set("isTemporaryTwoHouse", v)}
          trailing={
            <TaxHelp
              title="일시적 2주택 처분기한 변천표 (시행령 §28의5①)"
              summary="잔금일 시점에 따라 처분기한이 다릅니다. 2023.2.28 이후는 모두 3년."
              details={`## 잔금일 시점별 처분기한

## 2023.2.28 이후 잔금 (현행)
- **모든 경우 3년** (지역 조합 관계없이)

## 2022.5.10 ~ 2023.2.27 잔금
- 종전+신규 **모두 조정지역**: 2년
- 그 외 조합: 3년

## ~ 2022.5.9 잔금
- 종전+신규 **모두 조정지역**: 1년
- 그 외 조합: 3년

## 처분기한 내 처분 못 하면
중과세 추징됩니다 (취득세 8% - 기본세율 차액).

## 일시적 2주택 중과 배제 요건
- 신규 주택 취득일 이전에 종전 주택을 1년 이상 보유
- 처분기한 내 종전 주택 처분 예정`}
              legalBasis="지방세법시행령 제28조의5 제1항"
            />
          }
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium mb-1">종전 주택 취득일</p>
              <DateInput
                value={form.previousHouseAcquisitionDate}
                onChange={(v) => set("previousHouseAcquisitionDate", v)}
              />
            </div>
            <div>
              <p className="text-xs font-medium mb-1">종전 주택 소재 지역</p>
              <RadioCardGroup
                tone="rose"
                layout="inline"
                name="previousHouseRegion"
                value={form.previousHouseRegion}
                onChange={(v) => set("previousHouseRegion", v)}
                options={[
                  { value: "regulated", label: "조정대상지역" },
                  { value: "non_regulated", label: "비조정지역" },
                ]}
              />
            </div>
            <div>
              <p className="text-xs font-medium mb-1">신규 주택 소재 지역</p>
              <RadioCardGroup
                tone="rose"
                layout="inline"
                name="newHouseRegion"
                value={form.newHouseRegion}
                onChange={(v) => set("newHouseRegion", v)}
                options={[
                  { value: "regulated", label: "조정대상지역" },
                  { value: "non_regulated", label: "비조정지역" },
                ]}
              />
            </div>
            <div className="rounded-md bg-rose-50/70 border border-rose-200 p-2 text-xs text-rose-700">
              처분기한: 2023.2.28 이후 잔금 기준 모두 3년<br />
              (이전 잔금: 조정+조정 1~2년, 그 외 3년)
            </div>
          </div>
        </ToggleCard>
      )}

      {/* §13의2④ 지정 전 계약 보호 */}
      {isHousing && isMultiHouse && form.isRegulatedArea && (
        <ToggleCard
          tone="rose"
          title="조정지역 지정 전 매매계약 체결"
          description="계약일이 조정대상지역 지정고시일 이전 + 계약금 지급 증빙 → 비조정지역 취득 간주 (§13의2④)"
          checked={form.contractDateBeforeRegulation}
          onCheckedChange={(v) => set("contractDateBeforeRegulation", v)}
          trailing={
            <TaxHelp
              title="§13의2④ — 지정 전 계약 보호"
              summary="조정지역 지정고시일 이전 계약 + 계약금 납부 증빙 → 비조정지역 취득으로 간주하여 중과 미적용."
              details={`## 요건 (지방세법 §13의2④)
- 매매계약일이 **조정대상지역 지정고시일 이전**
- **계약금 지급 사실을 입증**할 수 있을 것 (계좌이체 내역, 영수증 등)

## 효과
비조정지역 취득으로 간주 → 다주택 중과세율 미적용.

## 실무 증빙
- 금융기관 계좌이체 내역 (일자·금액)
- 계약금 영수증
- 공증된 계약서

## 주의사항
지정 전 계약이어도 **계약금 증빙이 없으면 적용 불가**.
등기 일자가 지정 후여도 계약일 기준 판단.`}
              legalBasis="지방세법 제13조의2 제4항"
            />
          }
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium mb-1">조정대상지역 지정고시일</p>
              <DateInput
                value={form.regulationDesignationDate}
                onChange={(v) => set("regulationDesignationDate", v)}
              />
            </div>
            <ToggleCard
              tone="rose"
              size="sm"
              title="계약금 지급 증빙 보유"
              description="계약금 지급 사실을 입증할 수 있는 경우"
              checked={form.hasContractDepositProof}
              onCheckedChange={(v) => set("hasContractDepositProof", v)}
            />
          </div>
        </ToggleCard>
      )}

      {/* 무상취득 단서 (증여) */}
      {isGiftLike && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-micro font-bold text-rose-800 select-none">★</span>
            <p className="text-xs font-semibold text-rose-700">무상취득 중과 배제 단서</p>
            <TaxHelp
              title="무상취득 중과 배제 단서 (시행령 §28의6②)"
              summary="조정지역 3억 이상 증여도 1세대 1주택자가 가족에게 증여 시 중과 배제 — 계부모·의붓자녀도 포함."
              details={`## 무상취득 중과 배제 단서 (시행령 §28의6②)

## 중과 기본 요건
- 조정대상지역 소재
- 전체 주택 시가표준액 3억 원 이상

## 단서 배제 1 — 1세대 1주택자의 가족 무상취득 (§28의6② 1호)
증여자가 **1세대 1주택자**일 때 동일 세대 내 아래 가족이 무상취득 시 중과 배제:
- **가목**: 배우자 (사실혼 제외)
- **나목1**: 직계존속 (부모·조부모)
- **나목2**: 직계존속의 배우자 → **계부·계모 포함**
- **다목1**: 직계비속 (자녀·손자녀)
- **다목2**: 의붓자녀 (혼인 중 배우자의 직계비속) → **의붓자녀 포함**

단서 배제 효과: 일반 증여 표준세율(3.5%) 적용 (12% 중과 미적용)

## 단서 배제 2 — 이혼 재산분할 (§15①6호)
§15 세율특례 중 이혼 재산분할은 중과 배제`}
              legalBasis={["지방세법시행령 제28조의6 제2항", "지방세법 제15조 제1항 제6호"]}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            조정지역 시가표준액 3억 이상 증여도 아래 조건 충족 시 중과 배제 (시행령 §28의6②)
          </p>

          {/* 증여자 관계 */}
          <div>
            <p className="text-xs font-medium mb-1">수증자 관점 — 증여자의 신분</p>
            <RadioCardGroup
              tone="rose"
              layout="stack"
              name="giftorRelation"
              value={form.giftorRelation}
              onChange={(v) => set("giftorRelation", v)}
              options={[
                { value: "spouse", label: "배우자 (가목)" },
                { value: "lineal_ascendant", label: "직계존속 — 부모·조부모 (나목1)" },
                { value: "lineal_ascendant_spouse", label: "직계존속의 배우자 — 계부·계모 (나목2)" },
                { value: "lineal_descendant", label: "직계비속 — 자녀·손자녀 (다목1)" },
                { value: "lineal_descendant_step", label: "의붓자녀 — 혼인 중 배우자의 직계비속 (다목2)" },
                { value: "other", label: "기타 (중과 배제 불가)" },
              ]}
            />
          </div>

          {/* 증여자 1세대 1주택 여부 */}
          <ToggleCard
            tone="rose"
            size="sm"
            title="증여자가 1세대 1주택자"
            description="무상취득 직전 시점에 증여자가 1세대 1주택자인 경우 단서 적용"
            checked={form.giftorIs1HHHolder}
            onCheckedChange={(v) => set("giftorIs1HHHolder", v)}
          />
        </div>
      )}

      {/* 부담부증여 관계 */}
      {form.acquisitionCause === "burdened_gift" && (
        <ToggleCard
          tone="rose"
          title="부담부증여 — 배우자·직계존비속 관계"
          description="배우자·직계존비속 간 부담부증여는 전체 무상취득으로 처리 (지방세법 §7⑫ 단서·§7⑪)"
          checked={form.giftRelation === "spouse_or_lineal"}
          onCheckedChange={(v) => set("giftRelation", v ? "spouse_or_lineal" : "other")}
        />
      )}
    </div>
  );
}
