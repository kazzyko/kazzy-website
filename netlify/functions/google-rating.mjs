// Returns the business's live Google rating and review count.
//
// Netlify environment variables:
//   GOOGLE_PLACES_API_KEY  (required)
//   GOOGLE_PLACE_ID        (optional: if blank, the listing is found by name)
//   GOOGLE_PLACE_QUERY     (optional: search text, default "Kazzy & Ko Hauling Milwaukee WI")
//
// The answer is cached on Netlify's CDN for a day, so Google is asked about once a day.

const ONE_DAY = 86400;
const NAME_MATCH = "kazzy";

export default async () => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = (process.env.GOOGLE_PLACE_ID || "").trim();
  const query = process.env.GOOGLE_PLACE_QUERY || "Kazzy & Ko Hauling Milwaukee WI";
  if (!key) return reply({ error: "not configured" }, 500, 300);

  try {
    let place;
    if (placeId) {
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,rating,userRatingCount" },
      });
      if (!res.ok) return reply({ error: `google ${res.status}` }, 502, 900);
      place = await res.json();
    } else {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount",
        },
        body: JSON.stringify({ textQuery: query, pageSize: 5 }),
      });
      if (!res.ok) return reply({ error: `google ${res.status}` }, 502, 900);
      const data = await res.json();
      place = (data.places || []).find((p) => (p.displayName?.text || "").toLowerCase().includes(NAME_MATCH));
      if (!place) return reply({ error: "listing not found", searched: query }, 502, 900);
    }
    if (typeof place.userRatingCount !== "number") return reply({ error: "no data" }, 502, 900);
    return reply({
      rating: place.rating,
      count: place.userRatingCount,
      name: place.displayName?.text,
      placeId: place.id,
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
