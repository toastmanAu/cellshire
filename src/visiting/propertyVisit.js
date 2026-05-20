export const VISIT_PROPERTY_PARAM = 'visit';

export function propertyVisitOwnerFromParams(params) {
    const raw = params?.get?.(VISIT_PROPERTY_PARAM);
    if (raw === null || raw === undefined) return null;
    const ownerId = String(raw).trim();
    return ownerId === '' ? null : ownerId;
}

export function propertyVisitLabel(ownerId) {
    const value = String(ownerId || 'local');
    return value.length <= 18
        ? value
        : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function buildPropertyVisitState(ownerId, snapshot = null) {
    return {
        ownerId: ownerId || 'local',
        readOnly: true,
        hasSnapshot: !!snapshot,
        label: `Visiting ${propertyVisitLabel(ownerId)}`,
        detail: snapshot?.savedAt ? 'Saved property snapshot' : 'Starter property snapshot',
    };
}
