export function normalizeVisitSource(source = 'local') {
    return source === 'chain' ? 'chain' : 'local';
}

export function ownerIdForVisit(account, fallback = 'local') {
    if (account?.address && typeof account.address === 'string') return account.address;
    return fallback || 'local';
}

export function buildVisitUrl({
    baseUrl,
    ownerId = 'local',
    source = 'local',
} = {}) {
    const url = new URL(baseUrl || 'http://127.0.0.1/');
    url.searchParams.set('visit', ownerId || 'local');
    url.searchParams.set('visitSource', normalizeVisitSource(source));
    url.searchParams.delete('wallet');
    url.searchParams.delete('dev');
    url.searchParams.delete('character');
    return url.toString();
}

export function visitLinkSourceFromSnapshot(source) {
    return normalizeVisitSource(source);
}
