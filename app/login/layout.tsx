import { UnlocalizedHeader } from "@/components/UnlocalizedHeader";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UnlocalizedHeader label="Admin sign-in" />
      <main className="flex-1">{children}</main>
    </>
  );
}
