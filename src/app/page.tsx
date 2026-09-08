"use client";

import { useState } from "react";
import { calculateMarchTime } from "@/lib/marchTime";

export default function Home() {
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);

  const marchTime = calculateMarchTime(x, y);

  return (
    <main>
      <h1>WOS Battle Planner</h1>
      <p>Enemy rally timing for SVS.</p>

      <label>
        Enemy X coordinate
        <input
          type="number"
          min="0"
          max="1199"
          value={x}
          onChange={(event) => setX(Number(event.target.value))}
        />
      </label>

      <label>
        Enemy Y coordinate
        <input
          type="number"
          min="0"
          max="1199"
          value={y}
          onChange={(event) => setY(Number(event.target.value))}
        />
      </label>

      <p>March time: {marchTime} seconds</p>
    </main>
  );
}