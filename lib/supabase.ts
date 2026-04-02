import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Upload a local image URI to Supabase Storage.
 * Returns the public URL of the uploaded file.
 */
export async function uploadReviewPhoto(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  const fileName = `public/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage
    .from("review-photos")
    .upload(fileName, blob, { contentType: mime, upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return supabase.storage.from("review-photos").getPublicUrl(data.path).data
    .publicUrl;
}
