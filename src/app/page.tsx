"use client";

import { useState } from "react";
import { calculateMarchTime } from "@/lib/marchTime";
import { calculateImpactTime } from "@/lib/rallyTime";

type EnemyRally = {
  id: number;
  enemyName: string;
  x: number;
  y: number;
  marchTime: number;
  impactTime: Date;
};

export default function Home() {
  const [enemyName, setEnemyName] = useState("");
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);

  const [minutes, setMinutes] = useState(4);
  const [seconds, setSeconds] = useState(0);

  const [impactTime, setImpactTime] = useState<Date | null>(null);
  const [rallies, setRallies] = useState<EnemyRally[]>([]);
  const marchTime = calculateMarchTime(x, y);
  function syncRally() {
  const calculatedImpactTime = calculateImpactTime(
    new Date(),
    minutes,
    seconds,
    marchTime
  );
  setImpactTime(calculatedImpactTime);
  const newRally: EnemyRally = {
  id: Date.now(),
  enemyName: enemyName || "Unknown enemy",
  x: x,
  y: y,
  marchTime: marchTime,
  impactTime: calculatedImpactTime,
};

setRallies((currentRallies) => [
  ...currentRallies,
  newRally,
]);
}

  return (
    <main>
      <h1>WOS Battle Planner</h1>
      <p>Enemy rally timing for SVS.</p>
      <label>
  Enemy rally leader
  <input
    type="text"
    value={enemyName}
    onChange={(event) => setEnemyName(event.target.value)}
    placeholder="Enter player name"
  />
</label>
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
    {enemyName || "Unknown enemy"} impact:{" "}
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
<h2>Incoming rallies</h2>

<ul>
  {rallies.map((rally) => (
    <li key={rally.id}>
      {rally.enemyName} —{" "}
      {rally.impactTime.toLocaleTimeString("en-GB", {
        timeZone: "UTC",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}{" "}
      UTC
    </li>
  ))}
</ul>
    </main>
  );
}