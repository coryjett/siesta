import { useState } from 'react';

const STRIP_SUFFIXES = /\s*(?:,?\s*(?:Inc|Corp|Corporation|LLC|Ltd|Limited|Co|Company|Group|Holdings|Technologies|Technology|Tech|Solutions|Services|Software|Systems|Enterprises|International|Global|Intl|PLC|AG|GmbH|SA|SAS|NV|BV|SE|LP|LLP)\.?\s*)+$/i;

function deriveDomain(name: string): string {
  const cleaned = name.replace(STRIP_SUFFIXES, '').trim();
  return cleaned.toLowerCase().replace(/\s+/g, '') + '.com';
}

const failedDomains = new Set<string>();

export function CompanyLogo({ name, size = 24 }: { name: string; size?: number }) {
  const domain = deriveDomain(name);
  const [failed, setFailed] = useState(() => failedDomains.has(domain));
  const initial = name.charAt(0).toUpperCase();

  if (failed) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df] font-semibold select-none"
        style={{ width: size, height: size, fontSize: size * 0.48 }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`}
      alt={`${name} logo`}
      width={size}
      height={size}
      className="shrink-0 rounded-md object-contain"
      onError={() => { failedDomains.add(domain); setFailed(true); }}
    />
  );
}
