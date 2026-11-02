// -----------------------------------------------------------------------------
// Minimal XML helpers for UPnP (device descriptions, SOAP envelopes).
//
// UPnP documents are small, flat and machine-generated: a few tolerant
// regular expressions read them without pulling an XML parser dependency.
// -----------------------------------------------------------------------------

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function unescapeXml(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

/** Text of the first `<tag>` (any namespace prefix), unescaped, or ''. */
export function tagText(xml, tag) {
  const match = String(xml).match(
    new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'i'),
  );
  return match ? unescapeXml(match[1].trim()) : '';
}

/** Raw inner XML of every `<tag>` block (any namespace prefix). */
export function tagBlocks(xml, tag) {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`,
    'gi',
  );
  return [...String(xml).matchAll(re)].map((match) => match[1]);
}
