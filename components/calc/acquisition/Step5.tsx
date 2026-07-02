"use client";

import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import {
  infoBannerCls,
  warnBannerCls,
  type FormState,
} from "./shared";

interface Step5Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isHousing: boolean;
  isIndividual: boolean;
  isFarmland: boolean;
  isGiftLike: boolean;
}

/**
 * Step 5: 감면 확인
 * - 생애최초 주택 구매 감면 (violet)
 * - 소형주택 한도 300만원
 * - 자경농지 50% 감면 (violet)
 * - 농특세 읍·면 지역 분기 (violet)
 * - 공유지분 취득 정보
 * tone: violet (감면·자격 정보)
 */
export function Step5({
  form,
  set,
  isHousing,
  isIndividual,
  isFarmland,
  isGiftLike,
}: Step5Props) {
  return (
    <div className="space-y-4">
      {/* 생애최초 주택 감면 */}
      {isHousing && isIndividual ? (
        <ToggleCard
          tone="violet"
          title="생애최초 주택 구매 감면 신청"
          description="지방세특례제한법 §36의3 — 최대 200만원 (소형주택 300만원)"
          checked={form.isFirstHome}
          onCheckedChange={(v) => set("isFirstHome", v)}
          trailing={
            <TaxHelp
              title="생애최초 주택 감면 (지특법 §36의3)"
              summary="본인·배우자 모두 주택 미보유 시 최대 200만원(소형 300만원) 감면. 추징 주의."
              details={`## 감면 요건 (지특법 §36의3)
- 취득자 본인 + 배우자 모두 **주택 미보유** (무주택 세대)
- 취득가액 **12억 원 이하** 주택

## 감면 한도
- **일반**: 취득세의 최대 **200만 원** 감면
- **소형주택** (전용면적 60㎡ 이하): 최대 **300만 원** 감면

## 추징 사유 3가지 (§36의3④)
- 취득일로부터 **3개월 내 전입신고 미이행**
- 취득일로부터 **3년 내 처분** (매도·경매 등)
- 취득일로부터 **3년 내 임대** 또는 주거 외 사용

## 취득가액 한도 (폐지 전 구 규정)
2024년 이전: 수도권 4억·비수도권 3억 이하 한도 있었음.
현재: 12억 이하로 통합.`}
              legalBasis="지방세특례제한법 제36조의3"
            />
          }
        >
          {/* [L3] '수도권 주택 4억/3억' 토글 제거 — 2022 개정으로 폐지된 구 규정이며
              현행은 12억 단일 한도(계산 미반영·카드 본문과 모순되던 사문화 컨트롤). */}

          <ToggleCard
            tone="violet"
            size="sm"
            title="소형주택 (감면 한도 300만원)"
            description="전용면적 60㎡ 이하 등 소형주택 — 감면 한도 확대 (§36의3①1호)"
            checked={form.isSmallHouseFirstHome}
            onCheckedChange={(v) => set("isSmallHouseFirstHome", v)}
          />

          <div className={warnBannerCls}>
            <strong>추징 주의사항</strong><br />
            취득일로부터 <strong>3개월 내 전입</strong> + <strong>3년 내 처분·임대·주거 외 사용 금지</strong>.
            위반 시 감면세액 추징됩니다 (§36의3④).
          </div>
        </ToggleCard>
      ) : isHousing && !isIndividual ? (
        <div className={infoBannerCls}>
          법인·국가·비영리법인 취득은 생애최초 주택 감면 대상이 아닙니다.
        </div>
      ) : null}

      {/* 자경농지 50% 감면 */}
      {isFarmland && isIndividual && (
        <ToggleCard
          tone="violet"
          title="자경농지 50% 감면 신청"
          description="지방세특례제한법 §6 — 2년 이상 영농 + 거주지 요건 충족 시"
          checked={form.isSelfCultivatedFarmer}
          onCheckedChange={(v) => set("isSelfCultivatedFarmer", v)}
          trailing={
            <TaxHelp
              title="자경농지 취득세 감면 (지특법 §6)"
              summary="2년 이상 영농 + 거주지·거리 요건 충족 시 취득세 50% 감면."
              details={`## 자경농지 감면 요건 (지특법 §6)

## 거주 요건
- 농지 소재지 시·군·구 또는 인접 시·군·구 거주
- 또는 농지로부터 **직선거리 30km 이내** 거주

## 영농 요건
- **2년 이상** 직접 영농에 종사
- 영농 외 다른 직업 없음 (비농업 소득 3,700만 원 이하)

## 면적 한도
개인 소유 농지 합계 **20,000㎡(2만㎡)** 이하

## 감면 내용
취득세 **50% 감면** (취득가액 × 취득세율 × 50%)

## 추징 사유
- 취득 후 **5년 이내 처분·증여·임대**
- 직접 영농 중단
추징 시 감면세액 + 이자 상당액 납부`}
              legalBasis="지방세특례제한법 제6조"
            />
          }
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium mb-1">영농 종사 연수 (년)</p>
              <DecimalInput
                value={form.farmingYears}
                onChange={(v) => set("farmingYears", v)}
                placeholder="영농 종사 연수"
                unit="년"
              />
            </div>
            <div>
              <p className="text-xs font-medium mb-1">농지 면적 (㎡)</p>
              <DecimalInput
                value={form.farmlandArea}
                onChange={(v) => set("farmlandArea", v)}
                placeholder="취득 농지 면적"
                unit="㎡"
              />
            </div>
            <div>
              <p className="text-xs font-medium mb-1">농지 소재지 ~ 거주지 거리 (km)</p>
              <DecimalInput
                value={form.farmlandLocationDistance}
                onChange={(v) => set("farmlandLocationDistance", v)}
                placeholder="농지 경작 거리"
                unit="km"
              />
            </div>
            <div className="rounded-md bg-violet-50/70 border border-violet-200 p-2 text-xs text-violet-700 space-y-1">
              <p>요건: 2년 이상 영농 + 거주 기준 충족 + 면적 한도</p>
              <p>감면 후 5년 이내 처분 시 감면세액 추징</p>
            </div>
          </div>
        </ToggleCard>
      )}

      {/* 농특세 읍·면 지역 분기 */}
      {isHousing && (
        <ToggleCard
          tone="violet"
          title="수도권 외 도시지역 외 읍·면 지역 소재"
          description="농특세 비과세 한도 100㎡ 적용 (기본 85㎡에서 확대) — 농어촌특별세법 §4②6호"
          checked={form.isRuralRegion}
          onCheckedChange={(v) => set("isRuralRegion", v)}
        />
      )}

      {/* 공유지분 취득 정보 */}
      {isHousing && (
        <ToggleCard
          tone="violet"
          title="지분 취득 (공유지분)"
          description="전체 소유권이 아닌 지분 취득 시 — 1세대 판정에 영향 (§28의4④)"
          checked={parseFloat(form.acquisitionOwnershipShare) < 1}
          onCheckedChange={(v) => set("acquisitionOwnershipShare", v ? "0.5" : "1")}
        >
          <div>
            <label className="text-xs font-medium block mb-1">취득 지분율 (0~1)</label>
            <DecimalInput
              value={form.acquisitionOwnershipShare}
              onChange={(v) => set("acquisitionOwnershipShare", v)}
              placeholder="취득 지분율 (단독이면 1)"
              unit=""
            />
          </div>
          <ToggleCard
            tone="violet"
            size="sm"
            title="공동소유자 모두 동일 1세대"
            description="1세대 내 공유 → 1주택으로 산정 (§28의4④)"
            checked={form.coOwnersAllInHousehold}
            onCheckedChange={(v) => set("coOwnersAllInHousehold", v)}
          />
        </ToggleCard>
      )}

      <p className="text-xs text-muted-foreground pt-2">
        모든 입력이 완료되면 아래 <strong>취득세 계산</strong> 버튼을 눌러주세요.
      </p>
    </div>
  );
}
