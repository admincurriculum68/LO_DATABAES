import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateCompletion,
    calculateEvidenceProgress,
    calculateSetupReadiness,
    isReviewableWorkflow,
} from '../src/lib/evaluationProgress.js';

test('completion calculates missing and rounded percent', () => {
    assert.deepEqual(calculateCompletion(8, 10), { completed: 8, total: 10, missing: 2, percent: 80 });
    assert.deepEqual(calculateCompletion(2, 3), { completed: 2, total: 3, missing: 1, percent: 67 });
});

test('completion safely handles empty and out-of-range values', () => {
    assert.deepEqual(calculateCompletion(5, 0), { completed: 0, total: 0, missing: 0, percent: 0 });
    assert.deepEqual(calculateCompletion(12, 10), { completed: 10, total: 10, missing: 0, percent: 100 });
});

test('evidence progress uses one shared student by LO denominator', () => {
    assert.deepEqual(calculateEvidenceProgress({ enrollmentCount: 4, loCount: 8, filledCount: 20 }), {
        completed: 20,
        total: 32,
        missing: 12,
        percent: 63,
    });
});

test('approval only reviews submitted workflow states', () => {
    assert.equal(isReviewableWorkflow('draft'), false);
    assert.equal(isReviewableWorkflow('submitted'), true);
    assert.equal(isReviewableWorkflow('returned'), true);
    assert.equal(isReviewableWorkflow('approved'), true);
});

test('setup readiness always follows the same six checks', () => {
    const readiness = calculateSetupReadiness({
        teachers: 12,
        students: 320,
        missingRooms: 0,
        formats: 9,
        groups: 12,
        emptyGroups: 0,
        teacherlessGroups: 1,
        los: 48,
        subjects: 8,
        mappedSubjects: 8,
    });
    assert.equal(readiness.total, 6);
    assert.equal(readiness.completed, 5);
    assert.equal(readiness.percent, 83);
});
