import { supabase } from "./supabase";
import { notifyAiUsed } from "./aiCredits";
import type { MealKey } from "../types";
import type { ProposedFood } from "./voice";

// Photo logging: the photo is shrunk on the device, /api/photo-log names the foods
// and estimates portions, and the member reviews the result before anything is saved.
// The photo itself is never stored.

export interface PhotoProposal {
  foods: ProposedFood[];
  notUnderstood: string | null;
}

/** Longest side sent to the AI. Plenty to recognise a plate, and keeps uploads to ~150 KB. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;
/** Reject camera files that are clearly not worth decoding (a raw 100 MB scan, say). */
const MAX_FILE_BYTES = 30 * 1024 * 1024;

/** The photo as a small JPEG: base64 for the server, plus a blob URL for the preview. */
export async function preparePhoto(file: File): Promise<{ base64: string; previewUrl: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  if (file.size > MAX_FILE_BYTES) throw new Error("That photo is too large. Please try another.");
  let bitmap: ImageBitmap;
  try {
    // Applies the camera's rotation, so portrait photos aren't sent sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("We couldn't open that photo. HEIC files can be a problem; try taking it with the camera instead.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("We couldn't process that photo. Please try another.");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("We couldn't process that photo. Please try another."));
    reader.readAsDataURL(blob);
  });
  return { base64, previewUrl: URL.createObjectURL(blob) };
}

export async function recognizePhoto(base64: string, meal: MealKey): Promise<PhotoProposal> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const res = await fetch("/api/photo-log", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, meal, tzOffset: new Date().getTimezoneOffset() }),
  });
  const out = (await res.json().catch(() => ({}))) as Partial<PhotoProposal> & { error?: string };
  notifyAiUsed();
  if (!res.ok || !out.foods) throw new Error(out.error ?? "Something went wrong. Please try again.");
  return { foods: out.foods, notUnderstood: out.notUnderstood ?? null };
}
