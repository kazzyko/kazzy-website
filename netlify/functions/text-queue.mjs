// The iPhone shortcut calls this to collect texts waiting to be sent.
// Each text is handed out once, then removed. Protected by the TEXT_QUEUE_TOKEN environment variable.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const token = process.env.TEXT_QUEUE_TOKEN;
  const key = new URL(req.url).searchParams.get("key");
  if (!token || key !== token) return new Response("Not found", { status: 404 });

  const store = getStore({ name: "customer-texts", consistency: "strong" });
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).sort();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const out = [];
  for (const k of keys) {
    const item = await store.get(k, { type: "json" });
    await store.delete(k);
    // Skip anything older than a day so a phone that was off for a while doesn't send stale texts
    if (item && Number(k.split("_")[0]) > dayAgo) out.push({ to: item.to, body: item.body });
  }
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
};

export const config = { path: "/api/text-queue" };
