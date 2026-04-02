import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.15.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Verify a Clerk session JWT and return the user's Clerk ID + profile fields.
// Requires CLERK_JWKS_URL to be set as a Supabase secret.
async function verifyClerkJWT(
  token: string
): Promise<{ clerkId: string; username: string | null; email: string | null }> {
  const jwksUrl = Deno.env.get("CLERK_JWKS_URL");
  if (!jwksUrl) throw new Error("CLERK_JWKS_URL is not configured");

  const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jose.jwtVerify(token, JWKS);

  return {
    clerkId: payload.sub as string,
    username: (payload["username"] as string) ?? null,
    email: (payload["email"] as string) ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── GET /reviews?station_id=X ──────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const stationId = url.searchParams.get("station_id");

    if (!stationId) {
      return new Response(
        JSON.stringify({ error: "station_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data, error } = await supabase
      .from("reviews")
      .select(`id, rating, text, photo_urls, created_at, users ( username )`)
      .eq("station_id", parseInt(stationId))
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = (data || []).map((r: any) => ({
      id: r.id,
      username: r.users?.username ?? "Aggie",
      rating: r.rating,
      text: r.text,
      photo_urls: r.photo_urls ?? [],
      created_at: r.created_at,
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── POST /reviews ──────────────────────────────────────────────
  if (req.method === "POST") {
    // Require a valid Clerk session token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.substring(7);
    let clerkId: string;
    let username: string | null;
    let email: string | null;

    try {
      const claims = await verifyClerkJWT(token);
      clerkId = claims.clerkId;
      username = claims.username;
      email = claims.email;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Look up or create the DB user row for this Clerk user
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", clerkId)
      .single();

    let userId: number;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const displayName = username || email?.split("@")[0] || "Aggie";
      const { data: newUser, error: userErr } = await supabase
        .from("users")
        .insert({ clerk_id: clerkId, username: displayName, email })
        .select("id")
        .single();

      if (userErr || !newUser) {
        return new Response(
          JSON.stringify({ error: "Failed to create user record" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      userId = newUser.id;
    }

    const body = await req.json();
    const { station_id, rating, text, photo_urls } = body;

    if (!station_id || !rating) {
      return new Response(
        JSON.stringify({ error: "station_id and rating are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      typeof rating !== "number" ||
      rating < 0.5 ||
      rating > 5 ||
      Math.round(rating * 2) !== rating * 2
    ) {
      return new Response(
        JSON.stringify({
          error: "rating must be between 0.5 and 5 in 0.5 increments",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (text && text.length > 500) {
      return new Response(
        JSON.stringify({ error: "text must be 500 characters or fewer" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data, error } = await supabase
      .from("reviews")
      .upsert(
        { user_id: userId, station_id, rating, text: text || null, photo_urls: photo_urls || [] },
        { onConflict: "user_id,station_id" }
      )
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
