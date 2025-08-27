import React, { useEffect, useRef, useState } from "react";
import { Box, Heading, Container, VStack, Code } from "@chakra-ui/react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
} from "chart.js";
import KneeModel3D from "./KneeModel3D";

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale);

const URL_HISTORY = "http://localhost:5050/history";
const URL_LATEST_PROCESSED = "http://localhost:5050/latest_processed";
const URL_LATEST_RAW = "http://localhost:5050/latest_raw";

// Tunables
const MAX_POINTS = 600;         // ~5 minutes at 0.5s updates
const MAX_JUMP_DEG = 30;        // ignore single-sample spikes > 30°
const CLAMP_MIN = 0;            // physical min
const CLAMP_MAX = 180;          // physical max (set 120 if you prefer)

const Dashboard = () => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const [processedData, setProcessedData] = useState("Loading...");
  const [rawData, setRawData] = useState("Loading...");
  const [startTime, setStartTime] = useState(Date.now());
  const lastTimestampRef = useRef(null);
  const lastPlottedDegRef = useRef(null);   // for outlier guard
  const lastRelTimeRef = useRef(-Infinity); // ensure monotonic x

  // extract latest angle safely from processedData JSON string
  const safeAngleFromProcessed = () => {
    try {
      const obj = JSON.parse(processedData);
      const n = Number(obj?.combined_average);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  };
  const angleDeg = safeAngleFromProcessed();

  // helpers
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const sanitizeSample = (deg) => {
    const n = Number(deg);
    if (!Number.isFinite(n)) return null;
    return clamp(n, CLAMP_MIN, CLAMP_MAX);
  };

  const isOutlierJump = (deg) => {
    if (lastPlottedDegRef.current == null) return false;
    return Math.abs(deg - lastPlottedDegRef.current) > MAX_JUMP_DEG;
  };

  const pushPoint = (relTime, combined) => {
    const chart = chartInstance.current;
    if (!chart) return;

    chart.data.labels.push(relTime);
    chart.data.datasets[0].data.push(combined);

    // rolling window
    if (chart.data.labels.length > MAX_POINTS) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }

    chart.update();
    lastPlottedDegRef.current = combined;
    lastRelTimeRef.current = relTime;
  };

  // plot a record with guards
  const tryPlotRecord = (timestampSec, combinedDeg) => {
    // dedupe timestamps
    if (!timestampSec || (lastTimestampRef.current && timestampSec <= lastTimestampRef.current)) {
      return;
    }

    // sanitize numeric
    const clean = sanitizeSample(combinedDeg);
    if (clean == null) return;

    // outlier guard
    if (isOutlierJump(clean)) return;

    // compute rel time, ensure monotonic x
    const rel = ((timestampSec * 1000 - startTime) / 1000);
    const relRounded = Number(rel.toFixed(1));
    if (!(relRounded > lastRelTimeRef.current)) return;

    // ok to plot
    pushPoint(relRounded, clean);
    lastTimestampRef.current = timestampSec;
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(URL_HISTORY);
      let data = await res.json();

      if (!Array.isArray(data) || data.length === 0) return;

      // sort by timestamp asc
      data.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

      // establish base time
      const baseTime = Number(data[0].timestamp);
      if (Number.isFinite(baseTime)) {
        setStartTime(baseTime * 1000);
      }

      // reset guards
      lastPlottedDegRef.current = null;
      lastRelTimeRef.current = -Infinity;
      lastTimestampRef.current = null;

      for (const entry of data) {
        const t = Number(entry.timestamp);
        const deg = entry.combined_average ?? entry.p1_avg ?? entry.p1; // fallback if schema changes
        tryPlotRecord(t, deg);
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  };

  const fetchData = async () => {
    try {
      // processed
      const processedRes = await fetch(URL_LATEST_PROCESSED, { cache: "no-store" });
      const processed = await processedRes.json();
      setProcessedData(JSON.stringify(processed, null, 2));

      // raw
      const rawRes = await fetch(URL_LATEST_RAW, { cache: "no-store" });
      const raw = await rawRes.json();
      setRawData(JSON.stringify(raw, null, 2));

      // plot new point if newer timestamp
      const ts = Number(processed?.timestamp);
      const deg = processed?.combined_average;

      if (Number.isFinite(ts)) {
        tryPlotRecord(ts, deg);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  // init chart + timers
  useEffect(() => {
    if (!chartRef.current) return;

    const ctx = chartRef.current.getContext("2d");
    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Combined Average (deg)",
            data: [],
            borderColor: "#000",
            borderWidth: 3,
            fill: false,

            // 👇 stop overshoot
            tension: 0,                          // or keep a tiny value like 0.1
            cubicInterpolationMode: "monotone",  // ensures no wiggles between points
            spanGaps: true,                      // don’t draw crazy lines over gaps
            pointRadius: 0,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
        },
        scales: {
          x: {
            title: { display: true, text: "Time (s)" },
            ticks: { autoSkip: true, maxTicksLimit: 12 },
          },
          y: {
            title: { display: true, text: "Angle (deg)" },
            beginAtZero: false,
            suggestedMin: CLAMP_MIN,
            suggestedMax: Math.max(120, CLAMP_MAX), // show headroom
          },
        },
      },
    });

    // prime with history then start polling
    loadHistory();
    const id = setInterval(fetchData, 500);

    return () => {
      clearInterval(id);
      if (chartInstance.current) chartInstance.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container maxW="container.xl" py={6} bg="blue.100">
      <VStack spacing={8} align="start">
        <Heading size="lg">Knee Brace Data Dashboard</Heading>

        <Box>
          <Heading size="md" mb={2}>Processed Data</Heading>
          <Code p={4} borderRadius="md" w="100%" whiteSpace="pre-wrap">
            {processedData}
          </Code>
        </Box>

        <Box w="100%">
          <Heading size="md" mb={2}>Flexion Angle Over Time</Heading>
          <Box h="250px" bg="white" borderRadius="lg">
            <canvas ref={chartRef} />
          </Box>
        </Box>

        <Box w="100%">
          <Heading size="md" mb={2}>3D Knee Model</Heading>
          {/* Pass clamped angle just in case */}
          <KneeModel3D angleDeg={clamp(angleDeg, CLAMP_MIN, CLAMP_MAX)} />
        </Box>

        <Box>
          <Heading size="md" mb={2}>Raw Data (For Ursula)</Heading>
          <Code p={4} borderRadius="md" w="100%" whiteSpace="pre-wrap">
            {rawData}
          </Code>
        </Box>
      </VStack>
    </Container>
  );
};

export default Dashboard;