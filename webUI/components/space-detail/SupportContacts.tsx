import { buildInitials } from "@/components/space-detail/helpers";
import type { MarketplaceSupportContact } from "@/lib/public-marketplace";

export interface SupportContactsProps {
  contacts: MarketplaceSupportContact[];
}

export function SupportContacts({ contacts }: SupportContactsProps) {
  if (contacts.length === 0) return null;
  return (
    <section>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">We&apos;re Here To Help</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {contacts.map((contact) => (
          <div key={`${contact.name}-${contact.title}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--ps-mint-100),var(--surface-2))] text-sm font-semibold text-text">
              {buildInitials(contact.name)}
            </div>
            <div>
              <div className="text-base font-semibold text-text">{contact.name}</div>
              <div className="text-sm text-text-3">{contact.title}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
