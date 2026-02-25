import { Header } from "@/components/shared/Header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="pt-16">{children}</main>
    </div>
  );
}
