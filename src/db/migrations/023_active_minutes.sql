-- Wearable active minutes. Additive: safe to run on the live database, and safe
-- to re-run.
--
-- Lets device sync store 'activeMinutes' (moderate + vigorous minutes per day)
-- in biometric_entries. The Activity card adds them to the workouts a member
-- logs themselves, which stay in habit_entries, so a sync never overwrites
-- what they typed.

alter table public.biometric_entries drop constraint if exists biometric_entries_metric_check;
alter table public.biometric_entries add constraint biometric_entries_metric_check check (metric in (
  'heartRate', 'hrv', 'spo2', 'respiratoryRate', 'bodyTemp', 'steps', 'activeCalories', 'activeMinutes',
  'vo2max', 'standHours', 'sleepRem', 'sleepDeep', 'sleepCore', 'recoveryScore', 'stressScore', 'weight'
));
