"use client";

import { useState } from "react";
import { calculateMarchTime } from "@/lib/marchTime";
import { calculateImpactTime } from "@/lib/rallyTime";

export default function Home() {
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);

  const [minutes, setMinutes] = useState(4);
  const [seconds, setSeconds] = useState(0);

  const [impactTime, setImpactTime] = useState<Date | null>(null);

  const marchTime = calculateMarchTime(x, y);
  function syncRally() {
  const calculatedImpactTime = calculateImpactTime(
    new Date(),
    minutes,
    seconds,
    marchTime
  );

  setImpactTime(calculatedImpactTime);
}

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
      <label>
  Rally minutes remaining
  <input
    type="number"
    min="0"
    max="5"
    value={minutes}
    onChange={(event) => setMinutes(Number(event.target.value))}
  />
</label>

<label>
  Rally seconds remaining
  <input
    type="number"
    min="0"
    max="59"
    value= {seconds}
    onChange={(event) => setSeconds(Number(event.target.value))}
  />
</label>
<button onClick={syncRally}>
  Sync Rally
</button>
<p>
  Rally timer: {minutes}:{seconds.toString().padStart(2, "0")}
</p>
<p>March time: {marchTime} seconds</p>
{impactTime && (
  <p>
    Enemy impact:{" "}
    {impactTime.toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}{" "}
    UTC
  </p>
)}  
    </main>
  );
}