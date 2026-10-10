/* Synthetic test data. Nothing here is real client data. All times are minutes.
   Expected values are worked out by hand below, never taken from the app's own output.

   Every client has reports for Jun, Jul, Aug and Sep 2026. Per month:
     prev = allocation - (minutes used in all earlier months)      used = this month's minutes
     consumed = (all earlier minutes) + used                        remaining = allocation - consumed

   ALPHA, the normal client. Allocation 10 hrs = 600. Monthly work 50. Aug also has a 70 min "Contact form fix".
     Jun: prev 600, used 50,  consumed 50,  remaining 550
     Jul: prev 550, used 50,  consumed 100, remaining 500
     Aug: prev 500, used 120 (50+70), consumed 220, remaining 380
     Sep: prev 380, used 50,  consumed 270, remaining 330
     Oct (not saved): prev 330

   BRAVO, a client with a skipped month. Allocation 8 hrs = 480. Monthly work 50. July is skipped (0 minutes).
     Jun: prev 480, used 50, consumed 50,  remaining 430
     Jul: prev 430, used 0,  consumed 50,  remaining 430   (skipped)
     Aug: prev 430, used 50, consumed 100, remaining 380
     Sep: prev 380, used 50, consumed 150, remaining 330
     Oct (not saved): prev 330

   CHARLIE, a client near the AMC end (AMC 1 Jan 2026 - 31 Dec 2026). Allocation 5 hrs = 300. Monthly work 75.
     Jun: prev 300, used 75, consumed 75,  remaining 225
     Jul: prev 225, used 75, consumed 150, remaining 150
     Aug: prev 150, used 75, consumed 225, remaining 75
     Sep: prev 75,  used 75, consumed 300, remaining 0
     Oct (not saved): prev 0; using 75 gives remaining -75, which is over the allocation by 75

   Tests that depend on "today" fix the browser clock to 15 Oct 2026. Then Charlie's AMC ends in 77 days,
   which is inside the last 3 months. */

const ACTS = ['Website Backup', 'Plugin Updates', 'Domain Expiry Check'];
const act = (name, status = 'done', remark = '') => ({ name, status, remark });
const acts = () => [act(ACTS[0]), act(ACTS[1]), act(ACTS[2], 'done', 'Expiry: Dec 20, 2026')];
const amc = mins => ({ label: 'AMC Activities', kind: 'amc', mins });
const extra = (label, mins) => ({ label, kind: 'extra', mins });
const report = (clientId, month, work) => ({ clientId, month, acts: acts(), work, summary: 'Synthetic summary.', edited: true });
const skipped = (clientId, month, reason) => ({ clientId, month, skipped: true, skipReason: reason, acts: [], work: [], summary: '', edited: false });

export const clients = {
  alpha:   { label: 'Alpha',   contact: 'Alice Tester',   url: 'alpha.example.com',   amcStart: '2026-01-01', amcEnd: '2027-06-30', allocMins: 600, monthlyMins: 50, activities: ACTS, note: '' },
  bravo:   { label: 'Bravo',   contact: 'Bob Tester',     url: 'bravo.example.com',   amcStart: '2026-01-01', amcEnd: '2027-06-30', allocMins: 480, monthlyMins: 50, activities: ACTS, note: '' },
  charlie: { label: 'Charlie', contact: 'Charu Tester',   url: 'charlie.example.com', amcStart: '2026-01-01', amcEnd: '2026-12-31', allocMins: 300, monthlyMins: 75, activities: ACTS, note: '' }
};

export const reports = {
  'alpha_2026-06': report('alpha', '2026-06', [amc(50)]),
  'alpha_2026-07': report('alpha', '2026-07', [amc(50)]),
  'alpha_2026-08': report('alpha', '2026-08', [amc(50), extra('Contact form fix', 70)]),
  'alpha_2026-09': report('alpha', '2026-09', [amc(50)]),
  'bravo_2026-06': report('bravo', '2026-06', [amc(50)]),
  'bravo_2026-07': skipped('bravo', '2026-07', 'Client could not share the OTP'),
  'bravo_2026-08': report('bravo', '2026-08', [amc(50)]),
  'bravo_2026-09': report('bravo', '2026-09', [amc(50)]),
  'charlie_2026-06': report('charlie', '2026-06', [amc(75)]),
  'charlie_2026-07': report('charlie', '2026-07', [amc(75)]),
  'charlie_2026-08': report('charlie', '2026-08', [amc(75)]),
  'charlie_2026-09': report('charlie', '2026-09', [amc(75)])
};

/* Hand-calculated, see the working above. [prev, used, consumed, remaining] in minutes. */
export const expected = {
  alpha:   { '2026-06': [600, 50, 50, 550], '2026-07': [550, 50, 100, 500], '2026-08': [500, 120, 220, 380], '2026-09': [380, 50, 270, 330] },
  bravo:   { '2026-06': [480, 50, 50, 430], '2026-07': [430, 0, 50, 430],   '2026-08': [430, 50, 100, 380], '2026-09': [380, 50, 150, 330] },
  charlie: { '2026-06': [300, 75, 75, 225], '2026-07': [225, 75, 150, 150], '2026-08': [150, 75, 225, 75],  '2026-09': [75, 75, 300, 0] }
};

export const list = clientId => Object.values(reports).filter(r => r.clientId === clientId).sort((a, b) => (a.month < b.month ? -1 : 1));
export const backup = () => JSON.parse(JSON.stringify({ clients, reports }));
export const TODAY = new Date(2026, 9, 15); // 15 Oct 2026, local time
