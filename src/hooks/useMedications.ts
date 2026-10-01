import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { TimeOfDay } from "../types";

export interface Medication {
  id: string;
  name: string;
  time_of_day: TimeOfDay;
}

export function useMedications(userId: string | null) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setMedications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("medications")
      .select("id, name, time_of_day")
      .eq("user_id", userId)
      .then(({ data }) => {
        setMedications(data ?? []);
        setLoading(false);
      });
  }, [userId]);

  /** Adds a medication and returns it straight away, so callers can use its id before the save lands. */
  function addMedication(name: string, timeOfDay: TimeOfDay): Medication | null {
    if (!userId) return null;
    const med: Medication = { id: crypto.randomUUID(), name, time_of_day: timeOfDay };
    setMedications((prev) => [...prev, med]);
    void supabase.from("medications").insert({ ...med, user_id: userId });
    return med;
  }

  async function removeMedication(id: string) {
    setMedications((prev) => prev.filter((m) => m.id !== id));
    if (!userId) return;
    await supabase.from("medications").delete().eq("id", id);
  }

  async function updateTimeOfDay(id: string, timeOfDay: TimeOfDay) {
    setMedications((prev) => prev.map((m) => (m.id === id ? { ...m, time_of_day: timeOfDay } : m)));
    if (!userId) return;
    await supabase.from("medications").update({ time_of_day: timeOfDay }).eq("id", id);
  }

  return { medications, addMedication, removeMedication, updateTimeOfDay, loading };
}
