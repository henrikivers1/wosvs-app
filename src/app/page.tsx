"use client";

import { useState } from "react";
import { calculateMarchTime } from "@/lib/marchTime";
import { calculateImpactTime } from "@/lib/rallyTime";
import { calculateSendTime } from "@/lib/reinforcementTime";

type EnemyRally = {
  id: number;
  enemyName: string;
  x: number;
  y: number;
  marchTime: number;
  impactTime: Date;
};
type RallyWave = {
  impactSecond: number;
  rallies: EnemyRally[];
};
export default function Home() {
  const [enemyName, setEnemyName] = useState("");
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);
  const [garrisonX, setGarrisonX] = useState(600);
  const [garrisonY, setGarrisonY] = useState(606);

  const [minutes, setMinutes] = useState(4);
  const [seconds, setSeconds] = useState(0);

  const [impactTime, setImpactTime] = useState<Date | null>(null);
  const [rallies, setRallies] = useState<EnemyRally[]>([]);
  const marchTime = calculateMarchTime(x, y);
  const garrisonMarchTime = calculateMarchTime(
  garrisonX,
  garrisonY
  );
  const rallyWaves = rallies.reduce<RallyWave[]>((waves, rally) => {
  const impactSecond = Math.floor(
    rally.impactTime.getTime() / 1000
  );

  const existingWave = waves.find(
    (wave) => wave.impactSecond === impactSecond
  );

  if (existingWave) {
    existingWave.rallies.push(rally);
  } else {
    waves.push({
      impactSecond: impactSecond,
      rallies: [rally],
    });
  }

  return waves;
}, []);
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

setRallies((currentRallies) =>
  [...currentRallies, newRally].sort(
    (a, b) => a.impactTime.getTime() - b.impactTime.getTime()
  )
);
}
function removeRally(id: number) {
  setRallies((currentRallies) =>
    currentRallies.filter((rally) => rally.id !== id)
  );
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
  <h2>Your garrison position</h2>

<label>
  Your X coordinate
  <input
    type="number"
    min="0"
    max="1199"
    value={garrisonX}
    onChange={(event) =>
      setGarrisonX(Number(event.target.value))
    }
  />
</label>

<label>
  Your Y coordinate
  <input
    type="number"
    min="0"
    max="1199"
    value={garrisonY}
    onChange={(event) =>
      setGarrisonY(Number(event.target.value))
    }
  />
</label>

<p>Your march time: {garrisonMarchTime} seconds</p>
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
<h2>Incoming rally schedule</h2>

{rallyWaves.map((wave, index) => (
  <section key={wave.impactSecond}>
    <h3>
      Wave {index + 1}:{" "}
      {new Date(wave.impactSecond * 1000).toLocaleTimeString(
        "en-GB",
        {
          timeZone: "UTC",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }
      )}{" "}
      UTC — {wave.rallies.length} rallies
    </h3>
    <p>
  Send reinforcement at:{" "}
  {calculateSendTime(
    new Date(wave.impactSecond * 1000),
    garrisonMarchTime
  ).toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}{" "}
  UTC
</p>
    <ul>
      {wave.rallies.map((rally) => (
        <li key={rally.id}>
          {rally.enemyName}
          <button onClick={() => removeRally(rally.id)}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  </section>
))}
    </main>
  );
}