export function calculateCompletion(completed, total) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCompleted = Math.min(safeTotal, Math.max(0, Number(completed) || 0));
    return {
        completed: safeCompleted,
        total: safeTotal,
        missing: Math.max(0, safeTotal - safeCompleted),
        percent: safeTotal ? Math.round((safeCompleted / safeTotal) * 100) : 0,
    };
}

export const REVIEWABLE_WORKFLOWS = new Set(['submitted', 'approved', 'returned']);

export function isReviewableWorkflow(status) {
    return REVIEWABLE_WORKFLOWS.has(status);
}

export function calculateEvidenceProgress({ enrollmentCount = 0, loCount = 0, filledCount = 0 } = {}) {
    const expected = Math.max(0, Number(enrollmentCount) || 0) * Math.max(0, Number(loCount) || 0);
    return calculateCompletion(filledCount, expected);
}

export function calculateSetupReadiness(summary = {}) {
    const checks = [
        Boolean(summary.teachers > 0),
        Boolean(summary.students > 0 && summary.missingRooms === 0),
        Boolean(summary.formats > 0),
        Boolean(summary.groups > 0 && summary.emptyGroups === 0),
        Boolean(summary.groups > 0 && summary.teacherlessGroups === 0),
        Boolean(summary.los > 0 && summary.subjects > 0 && summary.mappedSubjects === summary.subjects),
    ];
    return { ...calculateCompletion(checks.filter(Boolean).length, checks.length), checks };
}
