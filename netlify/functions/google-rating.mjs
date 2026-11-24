// Returns the business's live Google rating, review count and up to 5 recent reviews
// (reviewer name, stars, text) for the homepage review cards and review pop-up.
//
// Netlify environment variables:
//   GOOGLE_PLACES_API_KEY  (required)
//   GOOGLE_PLACE_ID        (optional: overrides the built-in Place ID below)
//   GOOGLE_PLACE_QUERY     (optional: search text to try first; the built-in searches below are tried after it)
//
// The answer is cached on Netlify's CDN for a day, so Google is asked about once a day.

const ONE_DAY = 86400;
const NAME_MATCH = "kazzy";
const FIELDS = ["id", "displayName", "rating", "userRatingCount", "reviews", "googleMapsUri"];

export default async () => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  // Google Place ID of the Kazzy & Ko Hauling listing (worked out from its review link).
  // A GOOGLE_PLACE_ID variable in Netlify overrides it.
  const placeId = (process.env.GOOGLE_PLACE_ID || "ChIJe7CLNLQEqEcRs8-cMupO21Y").trim();
  // Google lists the business as "Kazzy & Ko Hauling" (no period), so that spelling is tried first.
  const queries = [process.env.GOOGLE_PLACE_QUERY, "Kazzy & Ko Hauling", "Kazzy & Ko Hauling Milwaukee WI", "Kazzy and Ko Hauling", "Kazzy Ko Hauling junk removal", "Kazzy & Ko. Hauling"]
    .filter((q, i, a) => q && a.indexOf(q) === i);
  if (!key) return reply({ error: "not configured" }, 500, 300);

  try {
    let place, idStatus;
    if (placeId) {
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS.join(",") },
      });
      idStatus = res.status;
      if (res.ok) place = await res.json();
    }
    // If the Place ID lookup didn't work, fall back to searching by name.
    if (!place) {
      const seen = [];
      for (const query of queries) {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": FIELDS.map((f) => "places." + f).join(","),
          },
          // Bias the search to the Milwaukee area (about 50 km around downtown).
          body: JSON.stringify({
            textQuery: query,
            pageSize: 10,
            locationBias: { circle: { center: { latitude: 43.0389, longitude: -87.9065 }, radius: 50000 } },
          }),
        });
        if (!res.ok) return reply({ error: `google ${res.status}` }, 502, 900);
        const data = await res.json();
        for (const p of data.places || []) if (p.displayName?.text && seen.length < 15) seen.push(p.displayName.text);
        place = (data.places || []).find((p) => (p.displayName?.text || "").toLowerCase().includes(NAME_MATCH));
        if (place) break;
      }
      if (!place) return reply({ error: "listing not found", placeIdStatus: idStatus, searched: queries, googleReturned: seen }, 502, 900);
    }
    if (typeof place.userRatingCount !== "number") return reply({ error: "no data" }, 502, 900);

    // Reviews as Google returns them (its "most relevant" five), with the reviewer's name as shown on Google.
    const reviews = (place.reviews || [])
      .map((r) => ({
        name: (r.authorAttribution?.displayName || "").trim(),
        rating: r.rating,
        text: (r.originalText?.text || r.text?.text || "").trim(),
        when: r.relativePublishTimeDescription || "",
      }))
      .filter((r) => r.name && r.text && typeof r.rating === "number");

    return reply({
      rating: place.rating,
      count: place.userRatingCount,
      name: place.displayName?.text,
      placeId: place.id,
      mapsUri: place.googleMapsUri,
      reviews,
    }, 200, ONE_DAY);
  } catch {
    return reply({ error: "fetch failed" }, 502, 900);
  }
};

// Errors are cached briefly too, so a problem can't trigger a flood of Google requests.
function reply(body, status, cdnSeconds) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${cdnSeconds}, stale-while-revalidate=${ONE_DAY}`,
    },
  });
}

export const config = { path: "/api/google-rating" };
