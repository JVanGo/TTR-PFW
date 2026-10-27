import { getTranslations } from "next-intl/server";
import { getCalculatorPlayers } from "@/lib/calculator-players";
import { DtrCalculator } from "@/components/calculator/DtrCalculator";
import { SiteFooter } from "@/components/SiteFooter";

// See app/[locale]/page.tsx for why: rendered per request rather than
// prerendered at build time; getCalculatorPlayers() is cached, so it's cheap.
export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const t = await getTranslations("Calculator");
  const players = await getCalculatorPlayers();

  return (
    <>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">{t("intro")}</p>
        <DtrCalculator players={players} />
      </div>
      <SiteFooter />
    </>
  );
}
