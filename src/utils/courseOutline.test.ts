import { describe, expect, it } from 'vitest';
import { readCourseOutline, readDays, readTimeRange, weekDate } from './courseOutline';

describe('reading a course outline', () => {
  it('times and days as written in outlines', () => {
    expect(readTimeRange('12–1pm')).toEqual({ start: '12:00', end: '13:00' });
    expect(readTimeRange('10am - 12pm')).toEqual({ start: '10:00', end: '12:00' });
    expect(readTimeRange('14:00–16:00')).toEqual({ start: '14:00', end: '16:00' });
    expect(readTimeRange('Thursday 16.15-18.00')).toEqual({ start: '16:15', end: '18:00' });
    expect(readTimeRange('11–1pm')).toEqual({ start: '11:00', end: '13:00' });
    expect(readTimeRange('2 to 4pm')).toEqual({ start: '14:00', end: '16:00' });
    expect(readTimeRange('Week 3-4')).toBeNull();
    expect(readTimeRange('lab 1 week 4 12-13', true)).toEqual({ start: '12:00', end: '13:00' });
    expect(readDays('Tuesdays and Thursdays')).toEqual([2, 4]);
    expect(weekDate('2026-07-29', 4, 4)).toBe('2026-08-20');   // week 1 is the week of the 29th (Wed); its Thursday three weeks on
  });

  // The outline the user tried on 2026-10-30, as pasted from ETH's course catalogue (tabs, links).
  it('a labelled course page: its number, and a class time with no class word', () => {
    const outline = [
      '## Course information',
      'Course number\t701-1253-00L (http://iacweb.ethz.ch/courses/id/701-1253-00L)',
      'Time & Location\tThursday 16.15-18.00, HG D 5.2 (https://ethz.ch/staffnet/en/utils/location.html?building=HG&floor=D&room=5.2)  ',
      'Lecturer\tFrancesco Isotta (https://iac.ethz.ch/utils/search.MTA0MTg0.html), Robert Jnglin Wills (https://iac.ethz.ch/utils/search.MzA4MDE3.html)',
      'Tutor\tPatricia Helpap (https://iac.ethz.ch/people-iac/person-detail.MzM0OTM4.html)',
    ].join('\n');
    const o = readCourseOutline(outline, '2026-09-14');
    expect(o.code).toBe('701-1253-00L');
    expect(o.classes).toEqual([{ type: 'Lecture', day: 4, start: '16:15', end: '18:00', location: 'HG D 5.2' }]);
    expect(o.assessments).toEqual([]);
  });

  it('the subject, regular classes (one a day), one-off classes, readings, and dated and weekly assessments', () => {
    const outline = [
      'GEOS215 Climate Systems',
      'Lectures: Wednesday 10-12, Friday 1-2pm, Carslaw 175',
      'Tutorial: Tuesday 9–10am',
      'Lab 1, week 4 Thursday, 12-13',
      'Lab 2, 24/10, 12-13',
      'Weekly readings',
      'Essay, 40%, due 23 October',
      'Mid-semester exam, Week 7, 20%',
    ].join('\n');
    const o = readCourseOutline(outline, '2026-07-27');
    expect(o).toMatchObject({ code: 'GEOS215', name: 'Climate Systems', readings: true });
    expect(o.classes).toEqual([
      { type: 'Lecture', day: 3, start: '10:00', end: '12:00', location: 'Carslaw 175' },
      { type: 'Lecture', day: 5, start: '13:00', end: '14:00', location: 'Carslaw 175' },
      { type: 'Tutorial', day: 2, start: '09:00', end: '10:00', location: null },
    ]);
    expect(o.oneOffs).toEqual([
      { type: 'Lab', title: 'Lab 1', date: '2026-08-20', start: '12:00', end: '13:00', location: null },
      { type: 'Lab', title: 'Lab 2', date: '2026-10-24', start: '12:00', end: '13:00', location: null },
    ]);
    expect(o.assessments).toEqual([
      { title: 'Essay', date: '2026-10-23', weight: 40, typeName: 'Essay' },
      { title: 'Mid-semester exam', date: '2026-09-07', weight: 20, typeName: 'Exam' },
    ]);
  });

  it('finds nothing in text that isn’t an outline, without failing', () => {
    expect(readCourseOutline('Buy milk', null)).toEqual({ code: null, name: null, start: null, end: null, classes: [], oneOffs: [], readings: false, assessments: [] });
  });
});

// The second outline the user tried (2026-10-30): headed lists of dates, German months, "starts:".
describe('lists of assessments under a heading', () => {
  it('reads each numbered date as its own assessment, German and European dates too', () => {
    const outline = [
      '701-1563-00L Climate Policy',
      'starts: 14/09/2026',
      'ends: 16/12/2026',
      'lecture 1 wednesday 12:15-14, in HG',
      'lecture 2 friday 12:15-14, in HG',
      '',
      'quizzes:',
      '1. 18. September 2026',
      '2. 25. September 2026 during the lecture',
      '3. 2. Oktober 2026',
      '9. 4. Dezember 2026',
      '',
      'essays:',
      '1. 7/10/2026',
      '2. 28/10/2026',
      '',
      'Exam',
      '16.12.2026',
    ].join('\n');
    const o = readCourseOutline(outline, null);
    expect(o).toMatchObject({ code: '701-1563-00L', name: 'Climate Policy', start: '2026-09-14', end: '2026-12-16' });
    expect(o.classes).toEqual([
      { type: 'Lecture', day: 3, start: '12:15', end: '14:00', location: 'HG' },
      { type: 'Lecture', day: 5, start: '12:15', end: '14:00', location: 'HG' },
    ]);
    expect(o.assessments.map((a) => [a.title, a.date, a.typeName])).toEqual([
      ['Quiz 1', '2026-09-18', 'Assessment'], ['Quiz 2', '2026-09-25', 'Assessment'], ['Quiz 3', '2026-10-02', 'Assessment'], ['Quiz 9', '2026-12-04', 'Assessment'],
      ['Essay 1', '2026-10-07', 'Essay'], ['Essay 2', '2026-10-28', 'Essay'],
      ['Exam', '2026-12-16', 'Exam'],
    ]);
  });
});
