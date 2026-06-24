import Link from "next/link";
import { LegalVerifyPanel } from "@/components/admin/LegalVerifyPanel";

type Tone =
  | "sky"
  | "cyan"
  | "emerald"
  | "amber"
  | "rose"
  | "orange"
  | "indigo"
  | "violet"
  | "slate";

/** 정적 색조 매핑 (dynamic `bg-${tone}-50` 금지 — JIT purge 차단). */
const TONE_STYLE: Record<Tone, { card: string; chip: string; title: string }> = {
  sky: {
    card: "hover:border-sky-300 hover:bg-sky-50/60 dark:hover:border-sky-700 dark:hover:bg-sky-950/30",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    title: "group-hover:text-sky-700 dark:group-hover:text-sky-300",
  },
  cyan: {
    card: "hover:border-cyan-300 hover:bg-cyan-50/60 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/30",
    chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    title: "group-hover:text-cyan-700 dark:group-hover:text-cyan-300",
  },
  emerald: {
    card: "hover:border-emerald-300 hover:bg-emerald-50/60 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    title: "group-hover:text-emerald-700 dark:group-hover:text-emerald-300",
  },
  amber: {
    card: "hover:border-amber-300 hover:bg-amber-50/60 dark:hover:border-amber-700 dark:hover:bg-amber-950/30",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    title: "group-hover:text-amber-700 dark:group-hover:text-amber-300",
  },
  rose: {
    card: "hover:border-rose-300 hover:bg-rose-50/60 dark:hover:border-rose-700 dark:hover:bg-rose-950/30",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    title: "group-hover:text-rose-700 dark:group-hover:text-rose-300",
  },
  orange: {
    card: "hover:border-orange-300 hover:bg-orange-50/60 dark:hover:border-orange-700 dark:hover:bg-orange-950/30",
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    title: "group-hover:text-orange-700 dark:group-hover:text-orange-300",
  },
  indigo: {
    card: "hover:border-indigo-300 hover:bg-indigo-50/60 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30",
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    title: "group-hover:text-indigo-700 dark:group-hover:text-indigo-300",
  },
  violet: {
    card: "hover:border-violet-300 hover:bg-violet-50/60 dark:hover:border-violet-700 dark:hover:bg-violet-950/30",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    title: "group-hover:text-violet-700 dark:group-hover:text-violet-300",
  },
  slate: {
    card: "hover:border-slate-300 hover:bg-slate-50/60 dark:hover:border-slate-600 dark:hover:bg-slate-800/40",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    title: "group-hover:text-slate-700 dark:group-hover:text-slate-300",
  },
};

const MENU = [
  {
    href: "/calc/transfer-tax",
    title: "양도소득세",
    subtitle: "부동산 매도 양도차익 과세",
    icon: "🏠",
    tone: "sky",
  },
  {
    href: "/calc/transfer-tax/multi",
    title: "양도소득세 (다건)",
    subtitle: "복수 양도 연간 합산·차손 통산",
    icon: "🏘️",
    tone: "cyan",
  },
  {
    href: "/calc/stock-transfer-tax",
    title: "주식 양도소득세",
    subtitle: "상장·비상장 대주주 판정",
    icon: "📈",
    tone: "emerald",
  },
  {
    href: "/calc/inheritance-tax",
    title: "상속세",
    subtitle: "상속재산 누진 과세·공제",
    icon: "📜",
    tone: "amber",
  },
  {
    href: "/calc/gift-tax",
    title: "증여세",
    subtitle: "무상 취득 증여재산 과세",
    icon: "🎁",
    tone: "rose",
  },
  {
    href: "/calc/gift-deemed",
    title: "증여로 보는 경우",
    subtitle: "보험·저가양수·채무면제·무상사용·무상대출 의제",
    icon: "🎀",
    tone: "rose",
  },
  {
    href: "/calc/acquisition-tax",
    title: "취득세",
    subtitle: "부동산 취득 시 지방세",
    icon: "🔑",
    tone: "orange",
  },
  {
    href: "/calc/property-tax",
    title: "재산세",
    subtitle: "보유 부동산 매년 과세",
    icon: "🏢",
    tone: "indigo",
  },
  {
    href: "/calc/comprehensive-tax",
    title: "종합부동산세",
    subtitle: "기준 초과 보유자 국세",
    icon: "🏛️",
    tone: "violet",
  },
  {
    href: "/tools/building-standard-price",
    title: "건물 기준시가 계산기",
    subtitle: "양도·상속·증여 건물분 기준시가 산정",
    icon: "🏗️",
    tone: "cyan",
  },
  {
    href: "/tools/stock-valuation",
    title: "주식 평가",
    subtitle: "상장·비상장주식 보충적 평가",
    icon: "📊",
    tone: "emerald",
  },
  {
    href: "/law",
    title: "법령 리서치",
    subtitle: "조문·판례·별표 통합 검색",
    icon: "📚",
    tone: "slate",
  },
] as const satisfies ReadonlyArray<{
  href: string;
  title: string;
  subtitle: string;
  icon: string;
  tone: Tone;
}>;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-10">
      <div className="flex w-full max-w-5xl flex-1 flex-col">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            한국 부동산 세금 계산기
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            8가지 부동산 세금과 법령 리서치를 한 곳에서
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {MENU.map((item) => {
            const tone = TONE_STYLE[item.tone];
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex flex-col rounded-xl border p-4 transition-all hover:shadow-sm sm:p-5 ${tone.card}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl ${tone.chip}`}
                  >
                    {item.icon}
                  </span>
                  <h2
                    className={`text-sm font-semibold leading-tight sm:text-base ${tone.title}`}
                  >
                    {item.title}
                  </h2>
                </div>
                <p className="mt-3 text-xs leading-snug text-muted-foreground sm:text-sm">
                  {item.subtitle}
                </p>
              </Link>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          본 계산기는 참고용이며, 정확한 세금 신고는 세무 전문가와 상담하세요.
        </p>

        {/* 개발자 도구: 법령 조문 검증 — 메인 메뉴 아래 footer 영역 */}
        <div className="mt-auto pt-8">
          <LegalVerifyPanel />
        </div>
      </div>
    </main>
  );
}
