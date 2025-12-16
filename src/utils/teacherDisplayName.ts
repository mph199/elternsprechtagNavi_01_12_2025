import type { Teacher } from '../types';

function normalizeGroupLetter(letter: string): string {
  const upper = letter.toUpperCase();
  if (upper === 'Ä') return 'A';
  if (upper === 'Ö') return 'O';
  if (upper === 'Ü') return 'U';
  if (upper === 'ß') return 'S';
  return upper;
}

function stripLeadingSalutation(rawName: string): string {
  return rawName.replace(/^(herr|frau|divers)\s+/i, '');
}

function splitName(rawName: string): { firstName: string; lastName: string } {
  const cleaned = stripLeadingSalutation(String(rawName || '').replace(/\s+/g, ' ').trim());
  if (!cleaned) return { firstName: '', lastName: '' };

  // If already in "Last, First" format, keep it.
  const commaIndex = cleaned.indexOf(',');
  if (commaIndex >= 0) {
    const lastName = cleaned.slice(0, commaIndex).trim();
    const firstName = cleaned.slice(commaIndex + 1).trim();
    return { firstName, lastName };
  }

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

export function teacherDisplayName(teacher: Teacher): string {
  const rawName = String(teacher?.name || '').trim();
  if (!rawName) return '';

  // Display in combobox / lists: "Nachname, Vorname" (without salutation)
  const { firstName, lastName } = splitName(rawName);
  if (!lastName) return firstName;
  if (!firstName) return lastName;
  return `${lastName}, ${firstName}`;
}

export function teacherGroupKey(teacher: Teacher): string {
  const label = teacherDisplayName(teacher).trim();
  const firstChar = label[0] ? normalizeGroupLetter(label[0]) : '#';
  return /^[A-Z]$/.test(firstChar) ? firstChar : '#';
}

export function teacherDisplayNameAccusative(teacher: Teacher): string {
  const rawName = String(teacher?.name || '').trim();
  if (!rawName) return '';
  const salutationRaw = teacher?.salutation ? String(teacher.salutation).trim() : '';
  const salutationLower = salutationRaw.toLowerCase();

  if (!salutationRaw) return rawName;
  if (salutationLower === 'herr') return `Herrn ${rawName}`;
  if (salutationLower === 'frau') return `Frau ${rawName}`;
  if (salutationLower === 'divers') return `Divers ${rawName}`;
  return `${salutationRaw} ${rawName}`;
}
