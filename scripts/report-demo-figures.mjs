// Recompute the GPA figures quoted in docs/demo-script.md, so the script cannot
// drift from the code. Run: node scripts/report-demo-figures.mjs
import { createSeedState } from '../src/data/seed.js';
import { attemptsFromState, calculateCGPA, calculateSGPA, projectGPA } from '../src/domain/gpa.js';

const state = createSeedState();
const attempts = attemptsFromState(state);
const cutoff = Math.max(...state.semesters.map((s) => s.order));

const term = (label) => state.semesters.find((s) => s.label === label);
const sgpa = (label) => {
  const semester = term(label);
  const result = calculateSGPA(attempts, { semesterOrder: semester.order });
  return result.value == null ? 'n/a' : `${result.value.toFixed(4)} (${result.includedCredits} credits)`;
};

const cgpa = calculateCGPA(attempts, cutoff);
console.log('Spring 2025 SGPA:', sgpa('Spring 2025'));
console.log('Fall 2025 SGPA  :', sgpa('Fall 2025'));
console.log('CGPA            :', cgpa.value.toFixed(4), 'over', cgpa.includedCredits, 'credits');

// The demo adds one grade assumption: MATH-2205 -> A.
const projection = projectGPA(attempts, [{ courseId: 'c-math-2205', grade: 'A' }], cutoff);
console.log('After MATH-2205 -> A:',
  projection.baseline.value.toFixed(4), '->', projection.projected.value.toFixed(4),
  'delta', projection.delta.toFixed(4));
console.log('applied:', JSON.stringify(projection.applied));