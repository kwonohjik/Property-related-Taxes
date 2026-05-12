/**
 * 취득세 도움말 페이지 — 14섹션 완전 가이드
 *
 * §1  표준세율 표 (12종 × 원인별)
 * §2  다주택 중과세율 (조정/비조정 × 1~4주택+)
 * §3  사치성 5종 정의·판정 기준
 * §4  세율특례 9종 표 + §15+§13② 동시 분기
 * §5  법인·공장 중과 분류 + §13⑦ 중복
 * §6  다주택 중과 제외 18+α종 전체 표
 * §7  주택 수 제외 11종 + 한시 특례 6종
 * §8  세대 정의 + 별도 인정 4종
 * §9  일시적 2주택 시점별 처분기한 변천표
 * §10 무상취득 중과 배제 단서 (계부모·의붓자녀 + §15①6)
 * §11 조정대상지역 지정 전 계약 보호 (§13의2④)
 * §12 공유지분·공동상속·권리취득일 산정 가이드
 * §13 세대 별도 인정 4종 상세 가이드 (미성년 예외 강조)
 * §14 신고 기한 D-day (4가지 원인별)
 */

import Link from "next/link";
import { HomeLink } from "@/components/ui/home-link";
import { StandardRateSection } from "./sections/StandardRateSection";
import { MultiHouseSurchargeSection } from "./sections/MultiHouseSurchargeSection";
import { LuxuryDefinitionSection } from "./sections/LuxuryDefinitionSection";
import { SpecialRateSection } from "./sections/SpecialRateSection";
import { CorpFactorySurchargeSection } from "./sections/CorpFactorySurchargeSection";
import { MultiHouseExclusionSection } from "./sections/MultiHouseExclusionSection";
import { HouseCountExclusionSection } from "./sections/HouseCountExclusionSection";
import { HouseholdDefinitionSection } from "./sections/HouseholdDefinitionSection";
import { TemporaryTwoHouseSection } from "./sections/TemporaryTwoHouseSection";
import { GiftSurchargeExclusionSection } from "./sections/GiftSurchargeExclusionSection";
import { PreRegulationContractSection } from "./sections/PreRegulationContractSection";
import { CoOwnershipInheritanceSection } from "./sections/CoOwnershipInheritanceSection";
import { SeparateHouseholdGuideSection } from "./sections/SeparateHouseholdGuideSection";
import { FilingDeadlineSection } from "./sections/FilingDeadlineSection";

const TOC = [
  { id: "standard-rate",           label: "1. 표준세율" },
  { id: "multi-house-surcharge",   label: "2. 다주택 중과세율" },
  { id: "luxury-definition",       label: "3. 사치성 재산 5종" },
  { id: "special-rate",            label: "4. 세율특례 9종 (§15)" },
  { id: "corp-factory-surcharge",  label: "5. 법인·공장 중과 + §13⑦" },
  { id: "multi-house-exclusion",   label: "6. 다주택 중과 제외 18+α종" },
  { id: "house-count-exclusion",   label: "7. 주택 수 제외 11종 + 한시 특례" },
  { id: "household-definition",    label: "8. 세대 정의 + 별도 인정 4종" },
  { id: "temporary-two-house",     label: "9. 일시적 2주택 처분기한 변천" },
  { id: "gift-surcharge-exclusion",label: "10. 무상취득 중과 배제 단서" },
  { id: "pre-regulation-contract", label: "11. 지정 전 계약 보호 (§13의2④)" },
  { id: "co-ownership-inheritance",label: "12. 공유지분·공동상속·권리취득일" },
  { id: "separate-household-guide",label: "13. 세대 별도 인정 상세 가이드" },
  { id: "filing-deadline",         label: "14. 신고 기한 (§20)" },
];

export default function AcquisitionTaxHelpPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* 헤더 */}
      <div className="space-y-2">
        <HomeLink />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/calc/acquisition-tax" className="hover:underline">
            취득세 계산기
          </Link>
          <span>/</span>
          <span>도움말</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">취득세 완전 가이드 (14섹션)</h1>
        <p className="text-sm text-muted-foreground">
          지방세법 §10~§15, §13의2, 시행령 §28의2~§28의6 기준 (2025년 현행)
        </p>
      </div>

      {/* 목차 */}
      <nav className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-semibold mb-3">목차</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {TOC.map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* §1 표준세율 */}
      <StandardRateSection />
      <hr className="border-border" />

      {/* §2 다주택 중과세율 */}
      <MultiHouseSurchargeSection />
      <hr className="border-border" />

      {/* §3 사치성 5종 */}
      <LuxuryDefinitionSection />
      <hr className="border-border" />

      {/* §4 세율특례 9종 */}
      <SpecialRateSection />
      <hr className="border-border" />

      {/* §5 법인·공장 중과 */}
      <CorpFactorySurchargeSection />
      <hr className="border-border" />

      {/* §6 다주택 중과 제외 18+α종 */}
      <MultiHouseExclusionSection />
      <hr className="border-border" />

      {/* §7 주택 수 제외 11종 + 한시 특례 */}
      <HouseCountExclusionSection />
      <hr className="border-border" />

      {/* §8 세대 정의 + 별도 인정 4종 */}
      <HouseholdDefinitionSection />
      <hr className="border-border" />

      {/* §9 일시적 2주택 처분기한 변천 */}
      <TemporaryTwoHouseSection />
      <hr className="border-border" />

      {/* §10 무상취득 중과 배제 단서 */}
      <GiftSurchargeExclusionSection />
      <hr className="border-border" />

      {/* §11 지정 전 계약 보호 */}
      <PreRegulationContractSection />
      <hr className="border-border" />

      {/* §12 공유지분·공동상속·권리취득일 */}
      <CoOwnershipInheritanceSection />
      <hr className="border-border" />

      {/* §13 세대 별도 인정 상세 가이드 */}
      <SeparateHouseholdGuideSection />
      <hr className="border-border" />

      {/* §14 신고 기한 */}
      <FilingDeadlineSection />

      {/* 면책 */}
      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground mt-8">
        이 도움말은 법령 조문에 근거한 정보 제공 목적입니다.
        실제 세금 계산은 개별 사실관계에 따라 달라지므로 세무사 상담을 권장합니다.
        법령 개정 시 내용이 달라질 수 있습니다.
      </div>

      {/* 계산기 바로가기 */}
      <div className="text-center">
        <Link
          href="/calc/acquisition-tax"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          취득세 계산기 바로가기
        </Link>
      </div>

      {/* 홈으로 */}
      <div className="pt-2 border-t border-border">
        <HomeLink />
      </div>
    </main>
  );
}
