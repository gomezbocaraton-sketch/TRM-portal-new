import ProfitNav from './ProfitNav';

export default async function ProfitabilityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <ProfitNav projectId={id} />
      {children}
    </div>
  );
}
