let weather = null;

// breathing + pulse
let alphaFade = 0;
let fadeDir = 1;        // 1=in, -1=out
let holdCounter = 0;
let pulse = 0, pulseDir = 1;

// refresh state
let refreshPhase = "idle";     // "idle" | "fadeOut" | "fetch" | "fadeIn"
let fetchInFlight = false;
let lat0 = 32.7767, lon0 = -96.7970;  // will be set by geolocation
let dataFetched = false;

function moonEmoji(p) {
  if (p < 0.10) return "🌑";
  if (p < 0.25) return "🌒";
  if (p < 0.35) return "🌓";
  if (p < 0.60) return "🌔";
  if (p < 0.75) return "🌕";
  if (p < 0.85) return "🌖";
  if (p < 0.95) return "🌗";
  return "🌘";
}

async function getWeather(lat, lon) {
  const urlWeather = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,pressure_msl,wind_speed_10m,relative_humidity_2m&timezone=auto`;
  const urlMoon = `https://api.open-meteo.com/v1/astronomy?latitude=${lat}&longitude=${lon}&daily=moon_phase&timezone=auto`;
  const [rW, rM] = await Promise.all([fetch(urlWeather), fetch(urlMoon)]);
  const dW = await rW.json(), dM = await rM.json();
  const c = dW.current;
  weather = {
    t: c.temperature_2m,
    p: c.pressure_msl,
    w: c.wind_speed_10m,
    h: c.relative_humidity_2m,
    m: dM?.daily?.moon_phase?.[0] ?? 0
  };
  dataFetched = true;
}

function startAutoRefresh() {
  const interval = 3 * 60 * 60 * 1000; // 3 hours
  setInterval(() => {
    if (refreshPhase === "idle") refreshPhase = "fadeOut";
  }, interval);
}

function setup() {
  const cnv = createCanvas(192, 192);
  cnv.parent("canvasWrapper");
  pixelDensity(1);
  noFill();
  frameRate(30);

  const setCoords = (la, lo) => {
    lat0 = la; lon0 = lo;
    getWeather(lat0, lon0).catch(console.error);
    startAutoRefresh();
  };

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      pos => setCoords(pos.coords.latitude, pos.coords.longitude),
      () => setCoords(lat0, lon0)
    );
  } else setCoords(lat0, lon0);
}

function draw() {
  clear();
  translate(width / 2, height / 2);

  // Loading
  if (!dataFetched || !weather) {
    fill(0); noStroke(); textAlign(CENTER, CENTER); textSize(14);
    text("waiting for data…", 0, 0);
    return;
  }

  // --- Pulse (always on) ---
  pulse += pulseDir * 1.5;
  if (pulse > 255 || pulse < 120) pulseDir *= -1;
  const pulseAlpha = map(pulse, 120, 255, 100, 255);

  // --- Breathing / Refresh state machine ---
  if (refreshPhase === "idle") {
    if (holdCounter > 0) holdCounter--;
    else {
      if (fadeDir === 1) {
        alphaFade += 2;
        if (alphaFade >= 255) {
          alphaFade = 255; fadeDir = -1; holdCounter = 60;
        }
      } else {
        alphaFade -= 2;
        if (alphaFade <= 0) {
          alphaFade = 0; fadeDir = 1; holdCounter = 60;
        }
      }
    }
  } else if (refreshPhase === "fadeOut") {
    alphaFade = max(0, alphaFade - 5);
    if (alphaFade === 0) refreshPhase = "fetch";
  } else if (refreshPhase === "fetch") {
    if (!fetchInFlight) {
      fetchInFlight = true;
      getWeather(lat0, lon0)
        .then(() => { refreshPhase = "fadeIn"; })
        .catch(console.error)
        .finally(() => { fetchInFlight = false; });
    }
  } else if (refreshPhase === "fadeIn") {
    alphaFade = min(255, alphaFade + 5);
    if (alphaFade === 255) {
      fadeDir = -1; holdCounter = 60; refreshPhase = "idle";
    }
  }

  const { t, p, w, h, m } = weather;
  const tN = constrain(map(t, -10, 40, 0, 1), 0, 1);
  const pN = constrain(map(p, 980, 1030, 0, 1), 0, 1);
  const wN = constrain(map(w, 0, 60, 0, 1), 0, 1);
  const hN = constrain(map(h, 0, 100, 0, 1), 0, 1);

  const baseR = 55;
  const amp = map(wN, 0, 1, 0.5, 6);
  const freq = int(map(pN, 0, 1, 5, 18));
  const scaleAmt = map(tN, 0, 1, 0.9, 1.1);
  const rotation = radians(map(m, 0, 1, 0, 360));

  const combinedAlpha = min(alphaFade, pulseAlpha);

  // Sigil
  push();
  rotate(rotation);
  scale(scaleAmt);
  stroke(0, combinedAlpha);
  strokeWeight(1);
  beginShape();
  for (let a = 0; a < TWO_PI; a += 0.02) {
    const r = baseR + amp * sin(a * freq + m * TWO_PI);
    vertex(r * cos(a), r * sin(a));
  }
  endShape(CLOSE);
  pop();

  const rings = int(map(pN, 0, 1, 2, 5));
  for (let i = 1; i <= rings; i++) {
    const innerR = baseR - i * 8;
    const innerAmp = amp * (1.1 + 0.4 * i);
    const innerFreq = freq + i * 2;
    const offset = m * TWO_PI * i;
    stroke(0, combinedAlpha * (0.9 - i * 0.1));
    strokeWeight(map(hN, 0, 1, 0.5, 1.6));
    beginShape();
    for (let a = 0; a < TWO_PI; a += 0.02) {
      const r = innerR + innerAmp * sin(a * innerFreq + offset);
      vertex(r * cos(a), r * sin(a));
    }
    endShape(CLOSE);
  }

  stroke(0, combinedAlpha);
  noFill();
  ellipse(0, 0, map(pN, 0, 1, 5, 10));

// --- Data line (responsive width fit) ---
resetMatrix();
fill(0, alphaFade);
noStroke();
textAlign(CENTER, CENTER);
let moonIcon = moonEmoji(m);
let dataLine = `${nf(t, 1, 1)}°C | ${int(p)} hPa | ${int(w * 3.6)} km/h | ${int(h)}% | ${moonIcon}`;

// dynamically size text so it never clips
let desiredWidth = width * 0.9; // leave 5% margin on each side
textSize(20);
while (textWidth(dataLine) > desiredWidth && textSize() > 10) {
  textSize(textSize() - 1);
}

// draw centered and slightly above the bottom edge
text(dataLine, width / 2, height - 12);
}
