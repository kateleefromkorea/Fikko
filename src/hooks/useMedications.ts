import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { TimeOfDay } from "../types";

const SAVE_FAILED = "That change to your medications didn't save. Check your connection and try again.";

export interface Medication {
  id: string;
  name: string;
  time_of_day: TimeOfDay;
}

/**
 * The member's medications and supplements. Removing one archives it (see
 * migration 018), so `past` can offer it again and old ticks stay readable.
 */
export function useMedications(userId: string | null) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [past, setPast] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Why the last change didn't save, if it didn't. */
  const [error, setError] = useState<string | null>(null);

  /** Runs a save; if it fails, puts the list back as it was and says so. */
  function save(request: PromiseLike<{ error: unknown }>, before: { medications: Medication[]; past: Medication[] }) {
    setError(null);
    // Supabase only sends a request once something waits on it, so this .then() is what sends it.
    return Promise.resolve(request.then(({ error: err }) => {
      if (!err) return true;
      console.error("Couldn't save medication", err);
      setMedications(before.medications);
      setPast(before.past);
      setError(SAVE_FAILED);
      return false;
    }));
  }

  useEffect(() => {
    if (!userId) {
      setMedications([]);
      setPast([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    let live = true;
    supabase
      .from("medications")
      .select("id, name, time_of_day, archived_at")
      .eq("user_id", userId)
      .then(({ data, error: err }) => {
        if (!live) return;
        if (err) {
          // Showing an empty list here would invite adding the same medications again.
          console.error("Couldn't load medications", err);
          setLoadError("We couldn't load your medications. Refresh the page to try again.");
          setLoading(false);
          return;
        }
        const rows = data ?? [];
        const strip = ({ id, name, time_of_day }: Medication) => ({ id, name, time_of_day });
        setMedications(rows.filter((m) => !m.archived_at).map(strip));
        setPast(rows.filter((m) => m.archived_at).map(strip));
        setLoading(false);
      });
    return () => { live = false; };
  }, [userId]);

  /**
   * Adds a medication and returns it straight away, so callers can use its id
   * before the save lands. One they removed before comes back with its old id.
   */
  function addMedication(name: string, timeOfDay: TimeOfDay): Medication | null {
    if (!userId || loadError) return null;
    const before = { medications, past };
    const previous = past.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (previous) {
      const med: Medication = { ...previous, time_of_day: timeOfDay };
      setPast((prev) => prev.filter((m) => m.id !== med.id));
      setMedications((prev) => [...prev, med]);
      void save(supabase.from("medications").update({ archived_at: null, time_of_day: timeOfDay }).eq("id", med.id), before);
      return med;
    }
    const med: Medication = { id: crypto.randomUUID(), name, time_of_day: timeOfDay };
    setMedications((prev) => [...prev, med]);
    void save(supabase.from("medications").insert({ ...med, user_id: userId }), before);
    return med;
  }

  async function removeMedication(id: string) {
    const before = { medications, past };
    const med = medications.find((m) => m.id === id);
    setMedications((prev) => prev.filter((m) => m.id !== id));
    if (med) setPast((prev) => [...prev, med]);
    if (!userId) return;
    await save(supabase.from("medications").update({ archived_at: new Date().toISOString() }).eq("id", id), before);
  }

  async function updateTimeOfDay(id: string, timeOfDay: TimeOfDay) {
    const before = { medications, past };
    setMedications((prev) => prev.map((m) => (m.id === id ? { ...m, time_of_day: timeOfDay } : m)));
    if (!userId) return;
    await save(supabase.from("medications").update({ time_of_day: timeOfDay }).eq("id", id), before);
  }

  return { medications, past, addMedication, removeMedication, updateTimeOfDay, loading, loadError, error, clearError: () => setError(null) };
}
