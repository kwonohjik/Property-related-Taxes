import Link from "next/link";
import { LegalVerifyPanel } from "@/components/admin/LegalVerifyPanel";

const TAX_TYPES = [
  {
    slug: "transfer-tax",
    title: "양도소득세",
    description: "부동산 매도 시 발생하는 양도차익에 대한 소득세",
    icon: "🏠",
  },
  {
    slug: "inheritance-tax",
    title: "상속세",
    description: "피상속인의 재산을 상속받을 때 부과되는 세금",
    icon: "📜",
  },
  {
    slug: "gift-tax",
    title: "증여세",
    description: "타인으로부터 재산을 무상으로 받을 때 부과되는 세금",
    icon: "🎁",
  },
  {
    slug: "acquisition-tax",
    title: "취득세",
    description: "부동산을 취득할 때 납부하는 지방세",
    icon: "🔑",
  },
  {
    slug: "property-tax",
    title: "재산세",
    description: "보유 부동산에 매년 부과되는 지방세",
    icon: "🏢",
  },
  {
    slug: "comprehensive-tax",
    title: "종합부동산세",
    description: "일정 기준 초과 부동산 보유자에게 부과되는 국세",
    icon: "🏛️",
  },
] as const;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight text-center">
          한국 부동산 세금 계산기
        </h1>
        <p className="mt-3 text-center text-muted-foreground">
          6가지 부동산 세금을 간편하게 계산하세요
        </p>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TAX_TYPES.map((tax) => (
            <Link
              key={tax.slug}
              href={`/calc/${tax.slug}`}
              className="group rounded-lg border p-6 transition-colors hover:border-primary hover:bg-accent"
            >
              <span className="text-3xl">{tax.icon}</span>
              <h2 className="mt-3 text-lg font-semibold group-hover:text-primary">
                {tax.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tax.description}
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-12 text-center text-xs text-muted-foreground">
          본 계산기는 참고용이며, 정확한 세금 신고는 세무 전문가와 상담하세요.
        </p>

        {/* 개발자 도구: 법령 조문 검증 */}
        <div className="mt-10">
          <LegalVerifyPanel />
        </div>
      </div>
    </main>
  );
}
