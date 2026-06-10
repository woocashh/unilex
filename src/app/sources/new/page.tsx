import { TopNav } from "@/components/TopNav";
import { FeedSetupAgent } from "./FeedSetupAgent";

// Fetch + LLM + test scrape can take a while on slow gov sites.
export const maxDuration = 60;

export default function NewSourcePage() {
  return (
    <>
      <TopNav />
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <FeedSetupAgent />
      </div>
    </>
  );
}
