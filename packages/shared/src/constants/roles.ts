import type { UserRole } from '../types/auth.js';

export const ROLES: Record<UserRole, { label: string; level: number }> = {
  se: { label: 'Sales Engineer', level: 1 },
  se_manager: { label: 'SE Manager', level: 2 },
  admin: { label: 'Administrator', level: 3 },
};

export const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'se', label: 'Sales Engineer' },
  { value: 'se_manager', label: 'SE Manager' },
  { value: 'admin', label: 'Administrator' },
];

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLES[userRole].level >= ROLES[requiredRole].level;
}
