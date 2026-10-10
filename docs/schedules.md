# School schedules: bells, rotations and the 2026-27 calendar

The app ships a bell schedule and school calendar for each school as static JSON:

| School | File | School year | Status |
| --- | --- | --- | --- |
| WW-P High School North (HSN), grades 9-12 | [`public/schools/hsn/schedule.json`](../public/schools/hsn/schedule.json) | 2026-2027 | Official bell times and calendar. One documented assumption about the letter-day rotation (see below). |
| Community Middle School (CMS), grades 6-8 | [`public/schools/cms/schedule.json`](../public/schools/cms/schedule.json) | 2026-2027 | Official bell times and calendar. A/B days confirmed against the daily announcements. |
| Other school | [`public/schools/other/schedule.json`](../public/schools/other/schedule.json) | template | Generic template for students to customize. |

Everything here was researched and checked on **2026-10-08**. The files follow the `SchoolSchedule` type in
[`src/types.ts`](../src/types.ts). `node tools/validate-schedules.mjs` checks them.

---

## High School North (HSN)

### How the rotation works

HSN runs a **4-day lettered drop rotation (A, B, C, D Day)** with **8 periods** and **6 one-hour blocks** a day.

- Periods 1-4 rotate through the morning blocks 1-3, and periods 5-8 rotate through the afternoon blocks 4-6. Each day,
  one morning period and one afternoon period **drop**, so every class meets 3 days out of 4.
- The whole school has one lunch, between block 3 and block 4.
- The letter moves forward one step each school day (A, B, C, D, A, ...). Holidays and weekends don't use up a letter.
- Delayed-opening and early-dismissal days keep that day's letter. Only the block times change.

| Day | Block 1 | Block 2 | Block 3 | Block 4 | Block 5 | Block 6 | Periods that drop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A Day** | Period 4 | Period 1 | Period 2 | Period 8 | Period 5 | Period 6 | 3 and 7 |
| **B Day** | Period 3 | Period 4 | Period 1 | Period 7 | Period 8 | Period 5 | 2 and 6 |
| **C Day** | Period 2 | Period 3 | Period 4 | Period 6 | Period 7 | Period 8 | 1 and 5 |
| **D Day** | Period 1 | Period 2 | Period 3 | Period 5 | Period 6 | Period 7 | 4 and 8 |

### Bell times

| Block | Regular day | 90-minute delayed opening | Early dismissal |
| --- | --- | --- | --- |
| Block 1 | 7:40-8:40 | 9:10-9:55 | 7:40-8:20 |
| Block 2 | 8:45-9:45 | 10:00-10:45 | 8:25-9:05 |
| Block 3 | 9:50-10:50 | 10:50-11:35 | 9:10-9:50 |
| Lunch | 10:55-11:36 | 11:39-12:20 | none (no lunch is served) |
| Block 4 | 11:40-12:40 | 12:25-1:10 | 9:55-10:35 |
| Block 5 | 12:45-1:45 | 1:15-2:00 | 10:40-11:20 |
| Block 6 | 1:50-2:50 | 2:05-2:50 | 11:25-12:05 |

The JSON lists these as bells `regular`, `delay` and `early`. Each bell has one entry per letter day, giving the period that
meets in each block.

**Z day (all 8 periods)** is bell `zday`. In 2025-26 the first day of school was a "Z day", when every period meets for
44 minutes: 1 7:40-8:24, 2 8:29-9:13, 3 9:18-10:02, 4 10:07-10:50, lunch 10:54-11:35, 5 11:39-12:23, 6 12:28-1:12,
7 1:17-2:01, 8 2:06-2:50. The bell is included, but no 2026-27 date uses it. The 2026-27 letter days below show that
Sept 2, 2026 was a normal A Day. If the school announces a Z day, apply it with a day change.

### Which letter is today?

None of the published documents says "Sept 2 is an A Day" outright. The district's **2026-27 No Homework Nights** list
gives two high-school dates with their letters:

- **February 10, 2027 (B-Day)**, no homework for periods 1 and 5. Those periods are in the last morning and afternoon
  blocks on a B Day.
- **May 27, 2027 (A-Day)**, no homework for periods 2 and 6. Those periods are in the last blocks on an A Day.

Counting school days back from Feb 10 puts **Wednesday, Sept 2, 2026 (the first day) on an A Day**, with no Z day. This
also makes Thursday, Oct 8, 2026 an A Day. The JSON anchors the rotation on `2027-02-10 = B`.

**Assumption: emergency closing days use up a letter.** May 27 only comes out as an A Day if the rotation also counts
the three emergency closing days (Mar 29, Apr 23 and May 28), as if they were school days. If school is simply closed on
them and the rotation continues from the last school day, May 27 would be a C Day. Because the official list says A,
the JSON forces the letter on the first school day after each emergency closing day:

| Date | Letter forced | Why |
| --- | --- | --- |
| Tue Mar 30, 2027 | D Day | after emergency closing day #1 (Mar 29 would have been C) |
| Mon Apr 26, 2027 | B Day | after emergency closing day #2 (Apr 23 would have been A) |
| Tue Jun 1, 2027 | C Day | after emergency closing day #3 (May 28 would have been B) |

If the morning announcements or a teacher say otherwise on one of these days, add a day change that sets the letter.
The rotation continues from that day. If one of these days becomes a snow day, its letter carries over to the next school
day, the same way the anchor does.

### Special days in the HSN file

| Date | What | Bell |
| --- | --- | --- |
| Wed Oct 14, 2026 | PSAT for grades 10 and 11 (HSN event calendar). The day's schedule may change, so check announcements. | regular |
| Wed Nov 25, 2026 | Early dismissal before Thanksgiving recess; no homework night | early |
| Wed Dec 23, 2026 | Early dismissal before winter recess; no homework night | early |
| Wed Feb 10, 2027 | No homework night for periods 1 and 5 (B Day) | regular |
| Thu Feb 11, 2027 | No homework night (K-12) | regular |
| Fri Mar 19, 2027 | No homework night before spring recess | regular |
| Thu May 27, 2027 | No homework night for periods 2 and 6 (A Day) before Memorial Day weekend | regular |
| Thu Jun 17, 2027 | Last day of school: early dismissal, Class of 2027 graduation | early |

Other HSN facts from the handbook and the 2025-26 welcome letter: students should be in block 1 by 7:40 (arrive 7:20-7:30).
Seniors with a study hall in block 1 or block 6 can apply for late arrival or early dismissal. The marking periods are:

| Marking period | Dates |
| --- | --- |
| MP1 | Sep 2 to Nov 9 |
| MP2 | Nov 10 to Jan 25 |
| MP3 | Jan 26 to Apr 9 |
| MP4 | Apr 12 to Jun 17 |

---

## Community Middle School (CMS)

### How the day works

CMS uses **the same bell every day**: 8 periods plus a daily **WIN ("What I Need")** block. WIN is student-directed time
to get organized, catch up or get help from teachers.

There is also an **A/B day** alternation. The handbook says "Electives are every other day on an A/B Day schedule", so a
"PE/E" period is PE one day and an elective the next. The letter alternates each school day and keeps going across
weekends and holidays. Classes that meet every day don't need a letter. For an A-only or B-only class, set its days to
A or B in the app.

The A/B days are **confirmed**. Each CMS morning announcement starts "Today is ... and it's an A/B Day". All 24
announcements from Sept 2 to Oct 8, 2026 match a plain alternation that starts with **A on Sept 2**. The JSON anchors on
`2026-10-08 = A`.

### Bell times and what each grade has

| Period | Regular day | Grade 6 | Grade 7 | Grade 8 |
| --- | --- | --- | --- | --- |
| 1 | 7:42-8:26 | Team 1 / WL | Team 1 / WL | PE/E |
| 2 | 8:31-9:15 | Team 2 / WL | PE/E | Team 1 / WL |
| 3 | 9:20-10:04 | PE/E or Cycle | Team 2 / WL | Team 2 / WL |
| 4 | 10:09-10:53 | Team 3 / WL | Team 3 / WL | PE/E or **Lunch** |
| 5 | 10:58-11:42 | Team 4 / WL | PE/E or Team 4 / WL | PE/E or **Lunch** |
| 6 | 11:47-12:31 | **Lunch** | PE/E or Team 4 / WL | Team 3 / WL |
| 7 | 12:36-1:20 | PE/E or Cycle or Team 5 / WL | **Lunch** | Team 4 / WL |
| WIN | 1:25-1:51 | WIN | WIN | WIN |
| 8 | 1:56-2:40 | PE/E or Cycle or Team 5 / WL | Team 5 / WL | Team 5 / WL |

The grade columns are copied as printed in the handbook. "Team" means a core class with your team, WL is World Language,
PE/E is PE or an elective, and Cycle is the 6th-grade cycle courses (Art, Computer, Health, Life Skills, Music, and
Information Literacy & Research Skills).

**Lunch depends on grade**, so the app doesn't add a separate lunch slot. Grade 6 eats in period 6, grade 7 in period 7,
and grade 8 in period 4 or 5. Recess is the second half of lunch. To see lunch in Today/Week, add a "class" called Lunch
in your lunch period.

| Period | 90-minute delayed opening (no WIN) | Early dismissal (no WIN) |
| --- | --- | --- |
| Homeroom + 1 | 9:10-9:53 | 7:42-8:16 |
| 2 | 9:57-10:34 | 8:20-8:51 |
| 3 | 10:38-11:15 | 8:55-9:26 |
| 4 | 11:19-11:56 | 9:30-10:01 |
| 5 | 12:00-12:37 | 10:05-10:36 |
| 6 | 12:41-1:18 | 10:40-11:11 |
| 7 | 1:22-1:59 | 11:15-11:46 |
| 8 | 2:03-2:40 | 11:50-12:21 |

Lunch is provided on delayed-opening days. On early-dismissal days, an express lunch is served only on the conference
half-days. No lunch is served on the half-days before Thanksgiving, winter recess or the last day.

Other CMS facts:

- Car drop-off is 7:05-7:35; buses arrive around 7:15.
- Dismissal is 2:40.
- The year is in trimesters:
  - T1: Sep 2 to Dec 2
  - T2: Dec 3 to Mar 11
  - T3: Mar 12 to Jun 17

### Special days in the CMS file

| Date | What | Bell |
| --- | --- | --- |
| Thu-Fri Oct 22-23, 2026 | Early dismissal for parent-teacher conferences (grades 6-8) | early |
| Wed Nov 25, 2026 | Early dismissal before Thanksgiving recess; no homework night | early |
| Wed Dec 23, 2026 | Early dismissal before winter recess; no homework night | early |
| Mon-Tue Feb 1-2, 2027 | Early dismissal for parent-teacher conferences (grades 6-8) | early |
| Thu Feb 11, 2027 | No homework night | regular |
| Fri Mar 19, 2027 | No homework night before spring recess | regular |
| Thu Jun 17, 2027 | Last day of school: early dismissal | early |

**Assumption:** at CMS, emergency closing days are **not** treated as using up an A/B letter. Nothing official says
either way, so the rotation simply continues. The HS evidence above suggests the district might count them. After
Mar 29, Apr 23 and May 28, check the morning announcement and add a day change if the letter is off.

---

## 2026-27 district calendar (both schools)

From the Board-approved calendar (approved Feb 25, 2025). The PDF and Excel versions are on the district's
**Academic Calendars** page.

- **First day for students:** Wednesday, Sept 2, 2026 (Aug 31 and Sept 1 are staff PD days).
- **Last day for students:** Thursday, June 17, 2027 (early dismissal K-12; HSN graduation at 2:30 pm at CURE
  Insurance Arena, per the HSN event calendar).
- **180 school days** if the three emergency closing days are not needed. The district prints 183 because it counts them.
  The monthly counts match the district's:

  | Month | School days |
  | --- | --- |
  | Sep | 19 |
  | Oct | 22 |
  | Nov | 17 |
  | Dec | 17 |
  | Jan | 19 |
  | Feb | 18 |
  | Mar | 17 (incl. Mar 29) |
  | Apr | 21 (incl. Apr 23) |
  | May | 20 (incl. May 28) |
  | Jun | 13 |

### No school

| Date(s) | District calendar says | Name in the app |
| --- | --- | --- |
| Mon Sep 7, 2026 | Schools Closed | Labor Day |
| Mon Sep 21, 2026 | Schools Closed | Yom Kippur. The district posted Yom Kippur wishes the evening before. |
| Thu-Fri Nov 5-6, 2026 | Schools Closed | NJEA Convention (inferred: NJ schools close for it every November, and these are the 2026 dates) |
| Thu-Fri Nov 26-27, 2026 | Schools Closed - Thanksgiving Recess | Thanksgiving recess |
| Thu Dec 24, 2026 - Fri Jan 1, 2027 | Schools Closed - Winter Recess | Winter recess |
| Mon Jan 18, 2027 | Schools Closed | Martin Luther King Jr. Day |
| Fri Feb 12, 2027 | Schools Closed - Professional Development Day for Staff | Professional development day (no students) |
| Mon Feb 15, 2027 | Schools Closed | Presidents' Day |
| Wed Mar 10, 2027 | Schools Closed | Schools closed. The district doesn't say why; it is probably Eid al-Fitr. |
| Mon-Fri Mar 22-26, 2027 | Schools Closed - Spring Recess | Spring recess |
| Mon Mar 29, 2027 | Emergency Closing Day #1 | Closed unless 1+ snow day was used |
| Thu Apr 22, 2027 | Schools Closed | Schools closed. The district doesn't say why; it is probably the first day of Passover. |
| Fri Apr 23, 2027 | Emergency Closing Day #2 | Closed unless 2+ snow days were used |
| Fri May 28, 2027 | Emergency Closing Day #3 | Closed unless 3 snow days were used |
| Mon May 31, 2027 | Schools Closed | Memorial Day |

Where the district only says "Schools Closed", the app uses the holiday name only when it is certain (federal holidays),
confirmed (Yom Kippur), or near-certain (NJEA). For Mar 10 and Apr 22 it keeps "Schools closed".

**Emergency closing days:** the district builds three spare days into the calendar. If no snow days are used, schools are
closed on Mar 29, Apr 23 and May 28. Each snow day used opens the next of these, in that order. The JSON marks all three
as no school. When a snow day happens, add two day changes: mark the snow day as no school, and mark the emergency day as
a school day.

### Early dismissals

| Date(s) | Who | HSN | CMS |
| --- | --- | --- | --- |
| Oct 20-23, 2026 | K-5 conferences | no change | no change |
| Oct 22-23, 2026 | 6-8 conferences | no change | early (7:42-12:21) |
| Nov 25, 2026 | K-12, before Thanksgiving | early (7:40-12:05) | early |
| Dec 23, 2026 | K-12, before winter recess | early | early |
| Jan 14-15, 2027 | K-5 conferences | no change | no change |
| Feb 1-2, 2027 | 6-8 conferences | no change | early |
| Mar 19, 2027 | K-5 conferences | no change | no change |
| Jun 17, 2027 | K-12, last day | early | early |

Unscheduled early dismissals (weather) use the same times. The district announces delayed openings and closings by
SchoolMessenger. They aren't in the file, so use a day change with the "90-minute delayed opening" bell.

### No homework nights (2026-27)

- **K-12:**
  - Nov 25-27 (nothing due Nov 30)
  - Dec 23 - Jan 1 (nothing due Jan 4)
  - Feb 11 (nothing due Feb 17)
  - Mar 19-29 (nothing due Mar 30)
  - May 28-31 (nothing due Jun 1)
- **Grades 9-12 only:**
  - Feb 10, 2027, for periods 1 and 5 (B Day)
  - May 27, 2027, for periods 2 and 6 (A Day)

---

## Sources

All retrieved 2026-10-08.

District:

- [WW-P Academic Calendars page](https://www.ww-p.org/page/academic-calendars)
- [2026-2027 Calendar, Board approved 02-25-2025 (PDF)](https://aptg.co/R4rP8T). The same file is on the
  [old district site](https://www.west-windsor-plainsboro.k12.nj.us/common/pages/GetFile.ashx?key=p6g9BGVT), and there is
  an [Excel version](https://aptg.co/-xPxd6).
- [2026-27 No Homework Night Calendar (PDF)](https://aptg.co/ntmJ6y), which gives the HSN letter days
- [2026-27 9-12 Report Card Calendar](https://aptg.co/Mjx2nl) and [2026-27 PreK-8 Report Card Calendar](https://aptg.co/tb8Rdz)
- District school hours:
  - [Regular School Day](https://www.west-windsor-plainsboro.k12.nj.us/parents___students/school_hours/regular_school_day): HS 7:40-2:50, MS 7:42-2:40
  - [90-Minute Delay](https://www.west-windsor-plainsboro.k12.nj.us/parents___students/school_hours/90-_minute_delay): HS 9:10-2:50, MS 9:10-2:40
  - [Early Dismissal (Scheduled)](https://www.west-windsor-plainsboro.k12.nj.us/parents___students/school_hours/early_dismissal___scheduled_): HS 7:40-12:05, MS 7:42-12:21
- [District event calendar](https://www.ww-p.org/events) and [HSN event calendar](https://www.ww-p.org/o/hsn/events): PSAT on Oct 14 and the graduation time

High School North:

- [2026-27 High School Student Handbook (PDF)](https://aptg.co/QpVpZk), linked from
  [HSN General Information](https://www.ww-p.org/o/hsn/page/general-information) (also
  [on the old site](https://www.west-windsor-plainsboro.k12.nj.us/common/pages/GetFile.ashx?key=lYw2BFx3)). Topic B,
  "School Hours & Daily Scheduling", has the A-D bell table, the delayed opening table and the early dismissal table.
- [HSN 2025-26 welcome letter (PDF)](https://www.west-windsor-plainsboro.k12.nj.us/common/pages/GetFile.ashx?key=6CA%2bBCnb):
  the Z day schedule, the full-day block times, and arrival guidance
- ["High School Bell Schedule" sheet (PDF, 2023)](https://drive.google.com/file/d/1SxSUZ7M7WWvuAXuvBVK10x4FARPODKrO/view):
  the same A-D table, in use since 2023
- [HSN Daily Announcements](https://drive.google.com/drive/folders/1iZTcGyteIkJaUrgw6OzR4Q19rQjW42Hd). These were checked
  (Sept-Oct 2026 and all of 2025-26), but they don't state the letter day.

Community Middle School:

- [2026-27 Middle School Student Handbook (PDF)](https://aptg.co/1gHPpR), linked from
  [CMS General Information](https://www.ww-p.org/o/cms/page/general-information) (also
  [on the old site](https://www.west-windsor-plainsboro.k12.nj.us/common/pages/GetFile.ashx?key=iYk2BEBy)). Topic B has the
  regular, early dismissal and delayed opening tables. Section 5 has "Electives are every other day on an A/B Day
  schedule" and the WIN description.
- [Middle school bell schedules sheet](https://docs.google.com/spreadsheets/d/12P59_jyqnhQgRyqN2n8nNLkNCDugLuCR1Mlfz_PeYN0/edit).
  The "Jan" tab is the WIN schedule used in 2026-27; the earlier tab is the Sept-Dec 2025 schedule without WIN.
- [CMS 2026-27 family welcome letter](https://docs.google.com/document/d/14N_7f592KLlktNCQ3rerA9aBDkxGd_-cig4Sud_dFHw/edit),
  which links the bell schedules and gives arrival/dismissal times, the conference dates and trimesters
- [CMS Daily Announcements](https://drive.google.com/drive/folders/1glBGqhc8TRnGlQ8H0UxcMwE5A7ZlYg7y), which state the A/B
  Day every morning

## Verified vs assumed

| | HSN | CMS |
| --- | --- | --- |
| Bell times (regular, delay, early) | Verified: 2026-27 handbook, matching the district hours pages | Verified: 2026-27 handbook and the district bell sheet |
| Rotation structure | Verified: A-D table in the 2026-27 handbook | Verified: same bell daily, A/B for electives (handbook) |
| Which letter is which date | Verified for Feb 10, 2027 and May 27, 2027 (district No Homework list). Sept 2 = A follows from that. | Verified Sept 2 to Oct 8, 2026 (daily announcements) |
| Emergency closing days and the rotation | **Assumed** they use up a letter, because that is the only way to match May 27 = A | **Assumed** they don't (no evidence either way) |
| Z day bell | 2025-26 times; **not** confirmed for 2026-27 and not scheduled | n/a |
| Calendar dates | Verified: Board-approved 2026-27 calendar | Verified: same |
| Holiday names | Federal holidays, Yom Kippur and NJEA named; Mar 10 and Apr 22 left as "Schools closed" | same |
| PSAT day schedule | Unknown, so it is only a note | n/a |

Both files have `source.verified: true`, because all bell times come from official 2026-27 documents. The assumptions
above are spelled out in each file's `source.note`, which the app shows under "About this schedule".

---

## How to fix or update the data

### In the app (just for you)

- **Snow day, delayed opening, "today is actually a C Day":** open **Schedule**, then **Day changes**. Pick the date and
  choose no school, a different bell (for example "90-minute delayed opening"), or the cycle day. The rotation continues
  from a day whose letter you set. A day change only moves that date and the days after it, up to the next date the file
  sets a letter on (a resync day or the anchor). Earlier days keep their letters. A make-up day ("School on a day off") can
  also be after the last day of school or before the first; it continues the rotation from the nearest school day.
- **Different bell times or periods:** open **Schedule** and press **Customize**. This makes your own copy of the
  school's schedule, where you can edit periods, bells, special days and the calendar. It is saved to your account (or
  this device in local mode), and the built-in file is not touched.

### In the repo (for everyone)

1. Edit `public/schools/<hsn|cms>/schedule.json`. Dates are `YYYY-MM-DD` and times are 24-hour `HH:MM`, both in local
   time.
   - `bells[0]` is the regular day. Each bell's `days` has one array of slots per cycle-day id (`"A"`, `"B"`, ...) or
     `"*"` for all days.
   - Slots must be in time order and must not overlap.
   - `calendar.noSchool` holds closed days. Use `end` for ranges; the end date is included.
   - `calendar.specialDays` changes a school day:
     - `bell` uses another bell that day, for example `"early"`.
     - `cycleDay` forces the letter, and the rotation continues from it.
     - `advance: false` makes a school day that doesn't move the rotation.
     - `name` shows as a note.
   - `calendar.anchor` is one known `{ date, cycleDay }`. The rotation is counted forward and backward from it.
   - Update `source.urls`, `source.note` and `source.retrieved`. Set `source.verified` to `true` only when the times come
     from an official document for that school year.
2. Run the validator:

   ```sh
   node tools/validate-schedules.mjs              # all schools; exits 1 if anything is wrong
   node tools/validate-schedules.mjs public/schools/hsn/schedule.json
   node tools/validate-schedules.mjs --self-test  # the validator's own tests
   ```

   It checks:
   - required fields and the school id against its folder
   - valid dates; calendar ranges in order and inside firstDay..lastDay
   - `HH:MM` times with start before end
   - slots sorted and non-overlapping within each bell and day
   - every slot's period exists
   - every `days` key is `*` or a cycle-day id, and every cycle day has slots in every bell
   - special-day bells and cycle days exist, special days fall on school days, and no date is listed twice
   - the anchor is valid and on a school day
   - source links

   It also prints the number of school days per month, so you can compare it with the district calendar.
3. To start a new school year, change `schoolYear`, `firstDay` and `lastDay`, and replace `noSchool` and `specialDays`
   from the new district calendar. Then re-check the bell tables in the new handbooks, and set `anchor` once the first
   letter days are announced.
