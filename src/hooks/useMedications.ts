import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { TimeOfDay } from "../types";

// Supabase only sends a request once something waits on it, so fire-and-forget
// saves still need .then().
const logFailure = ({ error }: { error: unknown }) => { if (error) console.error("Couldn't save medication", error); };

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

  useEffect(() => {
    if (!userId) {
      setMedications([]);
      setPast([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("medications")
      .select("id, name, time_of_day, archived_at")
      .eq("user_id", userId)
      .then(({ data }) => {
        const rows = data ?? [];
        const strip = ({ id, name, time_of_day }: Medication) => ({ id, name, time_of_day });
        setMedications(rows.filter((m) => !m.archived_at).map(strip));
        setPast(rows.filter((m) => m.archived_at).map(strip));
        setLoading(false);
      });
  }, [userId]);

  /**
   * Adds a medication and returns it straight away, so callers can use its id
   * before the save lands. One they removed before comes back with its old id.
   */
  function addMedication(name: string, timeOfDay: TimeOfDay): Medication | null {
    if (!userId) return null;
    const previous = past.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (previous) {
      const med: Medication = { ...previous, time_of_day: timeOfDay };
      setPast((prev) => prev.filter((m) => m.id !== med.id));
      setMedications((prev) => [...prev, med]);
      void supabase.from("medications").update({ archived_at: null, time_of_day: timeOfDay }).eq("id", med.id).then(logFailure);
      return med;
    }
    const med: Medication = { id: crypto.randomUUID(), name, time_of_day: timeOfDay };
    setMedications((prev) => [...prev, med]);
    void supabase.from("medications").insert({ ...med, user_id: userId }).then(logFailure);
    return med;
  }

  async function removeMedication(id: string) {
    const med = medications.find((m) => m.id === id);
    setMedications((prev) => prev.filter((m) => m.id !== id));
    if (med) setPast((prev) => [...prev, med]);
    if (!userId) return;
    await supabase.from("medications").update({ archived_at: new Date().toISOString() }).eq("id", id);
  }

  async function updateTimeOfDay(id: string, timeOfDay: TimeOfDay) {
    setMedications((prev) => prev.map((m) => (m.id === id ? { ...m, time_of_day: timeOfDay } : m)));
    if (!userId) return;
    await supabase.from("medications").update({ time_of_day: timeOfDay }).eq("id", id);
  }

  return { medications, past, addMedication, removeMedication, updateTimeOfDay, loading };
}
