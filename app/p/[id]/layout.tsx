import { ProductionProvider } from "@/components/production/ProductionProvider";
import { ProductionShell } from "@/components/production/ProductionShell";

export default async function ProductionLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProductionProvider productionId={id}>
      <ProductionShell>{children}</ProductionShell>
    </ProductionProvider>
  );
}
