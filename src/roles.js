// Role → permitted actions. PROPOSED: user roles and access boundaries require confirmation (D-07).
export const PERMISSIONS = {
  VIEWER: ['movements:view', 'allocations:view_confirmed'],
  ALLOCATOR: [
    'movements:view', 'allocations:view_confirmed', 'allocations:view_draft',
    'allocations:create', 'allocations:confirm', 'allocations:reallocate',
    'allocations:cancel', 'allocations:review', 'allocations:comm',
    'pilots:view', 'audit:view',
  ],
  SUPERVISOR: [
    'movements:view', 'allocations:view_confirmed', 'allocations:view_draft',
    'allocations:create', 'allocations:confirm', 'allocations:reallocate',
    'allocations:cancel', 'allocations:review', 'allocations:comm',
    'pilots:view', 'audit:view', 'metrics:view',
    // Simulates source-system updates until integrations exist (D-05).
    'movements:update', 'movements:import', 'pilots:update_availability',
  ],
};

export function can(user, permission) {
  return Boolean(user && PERMISSIONS[user.role]?.includes(permission));
}
