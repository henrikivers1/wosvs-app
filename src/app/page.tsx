import { calculateMarchTime } from "@/lib/marchTime";

export default function Home() {
  const marchTime = calculateMarchTime(600, 606);

  return (
    <main>
      <h1>WOS Battle Planner</h1>
      <p>Enemy rally timing for SVS.</p>

      <p>March time: {marchTime} seconds</p>
    </main>
  );
}