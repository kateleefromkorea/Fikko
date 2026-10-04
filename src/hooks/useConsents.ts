import { useCallback, useEffect, useState } from "react";
import { fetchConsents, saveConsents, type ConsentKey, type ConsentState, type Region } from "../lib/consent";

/** The signed-in member's privacy consents and the notice region for where they are. */
export function useConsents(userId: string | null | undefined) {
  const [region, setRegion] = useState<Region>("OTHER");
  const [consents, setConsents] = useState<ConsentState>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    setLoading(true);
    fetchConsents().then((r) => {
      if (!live) return;
      setRegion(r.region);
      setConsents(r.consents);
      setLoading(false);
    });
    return () => { live = false; };
  }, [userId]);

  const save = useCallback(async (chosenRegion: Region, choices: Partial<Record<ConsentKey, boolean>>) => {
    setConsents(await saveConsents(chosenRegion, choices));
  }, []);

  return { region, consents, loading, save };
}
