import { LegalDocument } from '@/components/LegalDocument';
import { syaratKetentuanContent } from '@/lib/legal';

export default function SyaratPage() {
  return <LegalDocument content={syaratKetentuanContent} />;
}
